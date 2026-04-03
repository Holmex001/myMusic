param(
  [string]$MastersOriginalsDirectory = "audio-masters/originals",
  [string]$WebOriginalsDirectory = "audio/originals",
  [string]$Bitrate = "256k",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$sourceExtensions = @(".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".mp4")
$targetExtension = ".m4a"

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
    [string]$TargetPath
  )

  $tempDirectory = Join-Path $WebOriginalsDirectory ".sync-tmp"
  Ensure-Directory $tempDirectory

  $tempPath = Join-Path $tempDirectory ([System.IO.Path]::GetFileName($TargetPath))

  if (Test-Path -LiteralPath $tempPath) {
    Remove-Item -LiteralPath $tempPath -Force
  }

  $copyExtensions = @(".m4a", ".aac", ".mp4")

  if ($copyExtensions -contains $SourceFile.Extension.ToLowerInvariant()) {
    & ffmpeg -y -v error -i $SourceFile.FullName -vn -c copy -movflags +faststart $tempPath
  } else {
    & ffmpeg -y -v error -i $SourceFile.FullName -vn -c:a aac -b:a $Bitrate -movflags +faststart $tempPath
  }

  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg failed while transcoding $($SourceFile.FullName)"
  }

  Move-Item -LiteralPath $tempPath -Destination $TargetPath -Force
}

Ensure-Directory $WebOriginalsDirectory

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "ffmpeg is required but was not found in PATH."
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

  Write-Host "Transcoding original: $($sourceFile.Name) -> $(Split-Path -Leaf $targetPath)"
  Invoke-Transcode -SourceFile $sourceFile -TargetPath $targetPath
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
