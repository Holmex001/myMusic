param(
  [int]$PollSeconds = 5,
  [int]$SettlingSeconds = 4
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tracksDirectory = Join-Path $repoRoot "audio/tracks"
$playlistScript = Join-Path $repoRoot "scripts/build-playlist.ps1"
$allowedExtensions = @(".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".mp4")
$maxGitHubFileSizeBytes = 100MB

function Get-TrackFiles {
  if (-not (Test-Path $tracksDirectory)) {
    return @()
  }

  return @(Get-ChildItem -Path $tracksDirectory -File |
    Where-Object { $allowedExtensions -contains $_.Extension.ToLowerInvariant() })
}

function Get-TrackSnapshot {
  $entries = Get-TrackFiles |
    Sort-Object Name |
    ForEach-Object {
      "{0}|{1}|{2}" -f $_.Name, $_.Length, $_.LastWriteTimeUtc.Ticks
    }

  return ($entries -join "`n")
}

function Get-OversizedTracks {
  return @(Get-TrackFiles | Where-Object { $_.Length -gt $maxGitHubFileSizeBytes })
}

function Invoke-Publish {
  $oversizedTracks = Get-OversizedTracks

  if ($oversizedTracks.Count -gt 0) {
    Write-Warning "GitHub rejects files larger than 100 MB. Auto-publish skipped."

    foreach ($track in $oversizedTracks) {
      $sizeInMb = [math]::Round($track.Length / 1MB, 2)
      Write-Warning (" - {0} ({1} MB)" -f $track.Name, $sizeInMb)
    }

    return
  }

  Write-Host ""
  Write-Host "Detected audio library change. Rebuilding playlist and pushing..."

  & powershell -ExecutionPolicy Bypass -File $playlistScript

  $status = git status --short -- audio/tracks audio/playlist.json

  if (-not $status) {
    Write-Host "No tracked playlist changes detected."
    return
  }

  git add audio/tracks audio/playlist.json

  $commitMessage = "Update music library $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  git commit -m $commitMessage
  git push

  Write-Host "Publish complete."
}

if (-not (Test-Path $tracksDirectory)) {
  throw "Tracks directory not found: $tracksDirectory"
}

Set-Location $repoRoot

Write-Host "Watching $tracksDirectory"
Write-Host "Supported extensions: $($allowedExtensions -join ', ')"
Write-Host "GitHub file limit: 100 MB per file"
Write-Host "Press Ctrl+C to stop."

$lastSnapshot = Get-TrackSnapshot

while ($true) {
  Start-Sleep -Seconds $PollSeconds

  $currentSnapshot = Get-TrackSnapshot

  if ($currentSnapshot -eq $lastSnapshot) {
    continue
  }

  Write-Host ""
  Write-Host "Change detected. Waiting for files to settle..."

  do {
    $beforeSettle = Get-TrackSnapshot
    Start-Sleep -Seconds $SettlingSeconds
    $afterSettle = Get-TrackSnapshot
  } while ($beforeSettle -ne $afterSettle)

  Invoke-Publish
  $lastSnapshot = Get-TrackSnapshot
}
