param(
  [string]$MastersOriginalsDirectory = "audio-masters/originals",
  [string]$WebOriginalsDirectory = "audio/originals",
  [double]$MaxPreserveSizeMB = 6.0,
  [double]$TargetMaxSizeMB = 6.0,
  [int]$MinTranscodeBitrateKbps = 128,
  [int]$MaxTranscodeBitrateKbps = 192,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$sourceExtensions = @(".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".mp4")
$targetExtension = ".m4a"
$copyExtensions = @(".m4a", ".aac", ".mp4")

function Ensure-Directory {
  param(
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Get-TargetPath {
  param(
    [System.IO.FileInfo]$SourceFile
  )

  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($SourceFile.Name)
  return Join-Path $WebOriginalsDirectory ($baseName + $targetExtension)
}

function Test-NeedsTranscode {
  param(
    [System.IO.FileInfo]$SourceFile,
    [string]$TargetPath
  )

  if ($Force) {
    return $true
  }

  if (-not (Test-Path -LiteralPath $TargetPath)) {
    return $true
  }

  $targetItem = Get-Item -LiteralPath $TargetPath
  return $SourceFile.LastWriteTimeUtc -gt $targetItem.LastWriteTimeUtc
}

function Invoke-Transcode {
  param(
    [System.IO.FileInfo]$SourceFile,
    [string]$TargetPath,
    [int]$TargetBitrateKbps,
    [bool]$CanCopySource
  )

  $tempDirectory = Join-Path $WebOriginalsDirectory ".sync-tmp"
  Ensure-Directory $tempDirectory

  $tempPath = Join-Path $tempDirectory ([System.IO.Path]::GetFileName($TargetPath))

  if (Test-Path -LiteralPath $tempPath) {
    Remove-Item -LiteralPath $tempPath -Force
  }

  if ($CanCopySource) {
    & ffmpeg -y -v error -i $SourceFile.FullName -vn -c copy -movflags +faststart $tempPath
  } else {
    & ffmpeg -y -v error -i $SourceFile.FullName -vn -c:a aac -b:a "${TargetBitrateKbps}k" -movflags +faststart $tempPath
  }

  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg failed while transcoding $($SourceFile.FullName)"
  }

  Move-Item -LiteralPath $tempPath -Destination $TargetPath -Force
}

function Get-AudioInfo {
  param(
    [System.IO.FileInfo]$SourceFile
  )

  $probeJson = & ffprobe -v error -select_streams a:0 `
    -show_entries stream=codec_name,bit_rate `
    -show_entries format=duration,size,bit_rate `
    -of json $SourceFile.FullName

  if ($LASTEXITCODE -ne 0) {
    throw "ffprobe failed for $($SourceFile.FullName)"
  }

  $probeData = $probeJson | ConvertFrom-Json
  $stream = $probeData.streams | Select-Object -First 1
  $format = $probeData.format

  return [PSCustomObject]@{
    CodecName = [string]$stream.codec_name
    DurationSeconds = [double]$format.duration
    SizeBytes = [double]$format.size
    BitRateKbps = [math]::Round(([double]$format.bit_rate) / 1000)
  }
}

function Get-TargetBitrateKbps {
  param(
    [double]$DurationSeconds
  )

  if ($DurationSeconds -le 0) {
    return $MaxTranscodeBitrateKbps
  }

  $safeBytes = $TargetMaxSizeMB * 1MB * 0.96
  $calculatedBitrate = [math]::Floor(($safeBytes * 8) / $DurationSeconds / 1000)
  return [int][math]::Max($MinTranscodeBitrateKbps, [math]::Min($MaxTranscodeBitrateKbps, $calculatedBitrate))
}

Ensure-Directory $WebOriginalsDirectory

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "ffmpeg is required but was not found in PATH."
}

if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
  throw "ffprobe is required but was not found in PATH."
}

$masterFiles = @()

if (Test-Path -LiteralPath $MastersOriginalsDirectory) {
  $masterFiles = @(
    Get-ChildItem -LiteralPath $MastersOriginalsDirectory -File |
      Where-Object { $sourceExtensions -contains $_.Extension.ToLowerInvariant() } |
      Sort-Object Name
  )
}

$expectedTargets = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)

foreach ($sourceFile in $masterFiles) {
  $targetPath = Get-TargetPath -SourceFile $sourceFile
  [void]$expectedTargets.Add([System.IO.Path]::GetFullPath($targetPath))

  if (-not (Test-NeedsTranscode -SourceFile $sourceFile -TargetPath $targetPath)) {
    continue
  }

  $audioInfo = Get-AudioInfo -SourceFile $sourceFile
  $sourceSizeMB = [math]::Round($audioInfo.SizeBytes / 1MB, 2)
  $targetBitrateKbps = Get-TargetBitrateKbps -DurationSeconds $audioInfo.DurationSeconds
  $canCopySource = ($copyExtensions -contains $sourceFile.Extension.ToLowerInvariant()) -and ($sourceSizeMB -le $MaxPreserveSizeMB)

  if ($canCopySource) {
    Write-Host "Copying original with faststart: $($sourceFile.Name) ($sourceSizeMB MB)"
  } else {
    Write-Host "Transcoding original: $($sourceFile.Name) -> $(Split-Path -Leaf $targetPath) at ${targetBitrateKbps}k ($sourceSizeMB MB)"
  }

  Invoke-Transcode -SourceFile $sourceFile -TargetPath $targetPath -TargetBitrateKbps $targetBitrateKbps -CanCopySource $canCopySource
}

$generatedFiles = @(
  Get-ChildItem -LiteralPath $WebOriginalsDirectory -File |
    Where-Object { $_.Extension.ToLowerInvariant() -eq $targetExtension }
)

foreach ($generatedFile in $generatedFiles) {
  $resolvedPath = [System.IO.Path]::GetFullPath($generatedFile.FullName)

  if ($expectedTargets.Contains($resolvedPath)) {
    continue
  }

  Write-Host "Removing stale generated original: $($generatedFile.Name)"
  Remove-Item -LiteralPath $generatedFile.FullName -Force
}

$tempDirectory = Join-Path $WebOriginalsDirectory ".sync-tmp"

if (Test-Path -LiteralPath $tempDirectory) {
  Get-ChildItem -LiteralPath $tempDirectory -Force | Remove-Item -Force -Recurse
}

Write-Host "Original masters sync complete."
