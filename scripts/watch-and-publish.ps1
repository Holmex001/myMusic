param(
  [int]$PollSeconds = 5,
  [int]$SettlingSeconds = 4
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$originalsDirectory = Join-Path $repoRoot "audio/originals"
$coversDirectory = Join-Path $repoRoot "audio/covers"
$audioDirectories = @($originalsDirectory, $coversDirectory)
$playlistScript = Join-Path $repoRoot "scripts/build-playlist.ps1"
$allowedExtensions = @(".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".mp4")
$maxGitHubFileSizeBytes = 100MB

function Ensure-AudioDirectories {
  foreach ($directory in $audioDirectories) {
    if (-not (Test-Path $directory)) {
      New-Item -ItemType Directory -Path $directory | Out-Null
    }
  }
}

function Invoke-Git {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & git '-c' "safe.directory=$repoRoot" @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Arguments -join ' ')"
  }
}

function Get-TrackFiles {
  return @(
    foreach ($directory in $audioDirectories) {
      if (-not (Test-Path $directory)) {
        continue
      }

      Get-ChildItem -Path $directory -File |
        Where-Object { $allowedExtensions -contains $_.Extension.ToLowerInvariant() }
    }
  )
}

function Get-TrackSnapshot {
  $entries = Get-TrackFiles |
    Sort-Object FullName |
    ForEach-Object {
      "{0}|{1}|{2}" -f $_.FullName, $_.Length, $_.LastWriteTimeUtc.Ticks
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
  Write-Host "Detected audio library change. Rebuilding paired playlist and pushing..."

  & powershell -ExecutionPolicy Bypass -File $playlistScript

  if ($LASTEXITCODE -ne 0) {
    throw "Playlist generation failed."
  }

  $status = Invoke-Git status --short -- audio/originals audio/covers audio/playlist.json

  if (-not $status) {
    Write-Host "No tracked playlist changes detected."
    return
  }

  Invoke-Git add audio/originals audio/covers audio/playlist.json

  $commitMessage = "Update paired music library $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  Invoke-Git commit -m $commitMessage
  Invoke-Git push

  Write-Host "Publish complete."
}

Ensure-AudioDirectories
Set-Location $repoRoot

Write-Host "Watching paired audio folders:"
Write-Host " - $originalsDirectory"
Write-Host " - $coversDirectory"
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
