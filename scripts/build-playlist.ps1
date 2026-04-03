param(
  [string]$TracksDirectory = "audio/tracks",
  [string]$OutputFile = "audio/playlist.json"
)

$allowedExtensions = @(".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".mp4")
$defaultArtist = "未知艺术家"
$defaultAlbum = "我的音乐"

function Convert-ToTrackTitle {
  param(
    [string]$FileName
  )

  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($FileName)
  $decodedName = [System.Uri]::UnescapeDataString($baseName)
  $prettyTitle = ($decodedName -replace "[-_]+", " ").Trim()

  if ([string]::IsNullOrWhiteSpace($prettyTitle)) {
    return "未命名曲目"
  }

  return (Get-Culture).TextInfo.ToTitleCase($prettyTitle)
}

function Convert-ToTrackSource {
  param(
    [string]$FileName
  )

  $encodedName = [System.Uri]::EscapeDataString($FileName)
  return "./audio/tracks/$encodedName"
}

if (-not (Test-Path $TracksDirectory)) {
  throw "Tracks directory not found: $TracksDirectory"
}

$tracks = @(
  Get-ChildItem -Path $TracksDirectory -File |
    Where-Object { $allowedExtensions -contains $_.Extension.ToLowerInvariant() } |
    Sort-Object Name |
    ForEach-Object {
      [PSCustomObject]@{
        title = Convert-ToTrackTitle $_.Name
        artist = $defaultArtist
        album = $defaultAlbum
        src = Convert-ToTrackSource $_.Name
        duration = ""
      }
    }
)

$payload = [PSCustomObject]@{
  tracks = $tracks
}

$directory = Split-Path -Parent $OutputFile

if ($directory -and -not (Test-Path $directory)) {
  New-Item -ItemType Directory -Path $directory | Out-Null
}

$payload | ConvertTo-Json -Depth 4 | Set-Content -Path $OutputFile -Encoding UTF8
Write-Host "Playlist generated: $OutputFile ($($tracks.Count) tracks)"

