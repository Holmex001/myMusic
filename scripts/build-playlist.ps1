param(
  [string]$MastersOriginalsDirectory = "audio-masters/originals",
  [string]$OriginalsDirectory = "audio/originals",
  [string]$CoversDirectory = "audio/covers",
  [string]$OutputFile = "audio/playlist.json",
  [switch]$SkipOriginalSync
)

$ErrorActionPreference = "Stop"

$allowedExtensions = @(".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".mp4")
$defaultAlbum = "My Music"

if (-not $SkipOriginalSync) {
  $syncScript = Join-Path $PSScriptRoot "sync-originals.ps1"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $syncScript `
    -MastersOriginalsDirectory $MastersOriginalsDirectory `
    -WebOriginalsDirectory $OriginalsDirectory

  if ($LASTEXITCODE -ne 0) {
    throw "Original sync failed."
  }
}

function Convert-ToTrackTitle {
  param(
    [string]$FileName
  )

  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($FileName)
  $decodedName = [System.Uri]::UnescapeDataString($baseName)
  $prettyTitle = ($decodedName -replace "[-_]+", " ").Trim()

  if ([string]::IsNullOrWhiteSpace($prettyTitle)) {
    return "Untitled Track"
  }

  return $prettyTitle
}

function Convert-ToTrackKey {
  param(
    [string]$FileName
  )

  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($FileName)
  return ([System.Uri]::UnescapeDataString($baseName)).Trim().ToLowerInvariant()
}

function Convert-ToTrackSource {
  param(
    [string]$FolderPath,
    [string]$FileName
  )

  $encodedName = [System.Uri]::EscapeDataString($FileName)
  return "./${FolderPath}/${encodedName}"
}

function Ensure-Directory {
  param(
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Get-RoleTracks {
  param(
    [string]$Directory,
    [string]$Role
  )

  if (-not (Test-Path $Directory)) {
    return @()
  }

  $roleLabel = if ($Role -eq "original") { "Original" } else { "Cover" }

  return @(
    Get-ChildItem -Path $Directory -File |
      Where-Object { $allowedExtensions -contains $_.Extension.ToLowerInvariant() } |
      Sort-Object Name |
      ForEach-Object {
        [PSCustomObject]@{
          key = Convert-ToTrackKey $_.Name
          title = Convert-ToTrackTitle $_.Name
          role = $Role
          track = [PSCustomObject]@{
            title = Convert-ToTrackTitle $_.Name
            artist = $roleLabel
            album = $defaultAlbum
            src = Convert-ToTrackSource ($Directory -replace "\\", "/") $_.Name
            duration = ""
          }
        }
      }
  )
}

Ensure-Directory $OriginalsDirectory
Ensure-Directory $CoversDirectory

$songMap = @{}

foreach ($entry in (Get-RoleTracks -Directory $OriginalsDirectory -Role "original")) {
  if (-not $songMap.ContainsKey($entry.key)) {
    $songMap[$entry.key] = [ordered]@{
      key = $entry.key
      title = $entry.title
      original = $null
      cover = $null
    }
  }

  $songMap[$entry.key].original = $entry.track
}

foreach ($entry in (Get-RoleTracks -Directory $CoversDirectory -Role "cover")) {
  if (-not $songMap.ContainsKey($entry.key)) {
    $songMap[$entry.key] = [ordered]@{
      key = $entry.key
      title = $entry.title
      original = $null
      cover = $null
    }
  }

  $songMap[$entry.key].cover = $entry.track
}

$songs = @(
  $songMap.Values |
    Sort-Object title |
    ForEach-Object { [PSCustomObject]$_ }
)

$payload = [PSCustomObject]@{
  songs = $songs
}

$directory = Split-Path -Parent $OutputFile

if ($directory -and -not (Test-Path $directory)) {
  New-Item -ItemType Directory -Path $directory | Out-Null
}

$payload | ConvertTo-Json -Depth 6 | Set-Content -Path $OutputFile -Encoding UTF8
Write-Host "Playlist generated: ${OutputFile} ($($songs.Count) song pairs)"
