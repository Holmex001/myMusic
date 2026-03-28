param(
  [string]$TracksDirectory = "audio/tracks",
  [string]$OutputFile = "audio/playlist.json"
)

$allowedExtensions = @(".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".mp4")

if (-not (Test-Path $TracksDirectory)) {
  throw "Tracks directory not found: $TracksDirectory"
}

$tracks = @(
  Get-ChildItem -Path $TracksDirectory -File |
    Where-Object { $allowedExtensions -contains $_.Extension.ToLowerInvariant() } |
    Sort-Object Name |
    ForEach-Object {
      $baseName = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
      $prettyTitle = ($baseName -replace "[-_]+", " ").Trim()

      [PSCustomObject]@{
        title = (Get-Culture).TextInfo.ToTitleCase($prettyTitle)
        artist = "Unknown Artist"
        album = "My Music"
        src = "./audio/tracks/$($_.Name)"
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

