param(
  [string]$LyricsDirectory = "lyrics"
)

$ErrorActionPreference = "Stop"

$utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
$utf8Loose = New-Object System.Text.UTF8Encoding($false, $false)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$gbEncoding = [System.Text.Encoding]::GetEncoding(936)
$commonChinesePattern = '[\u7684\u4E00\u4E0D\u4E86\u6211\u4F60\u4ED6\u5728\u662F\u4EBA\u6709\u8FD9\u4E2A\u5411\u8BB0\u7F8E\u597D\u65F6\u5019\u6CA1\u6709\u96E8\u68A6\u70B9]'

function Get-CommonChineseScore {
  param(
    [string]$Text
  )

  return ([regex]::Matches($Text, $commonChinesePattern)).Count
}

function Decode-Text {
  param(
    [byte[]]$Bytes
  )

  try {
    return $utf8Strict.GetString($Bytes)
  } catch {
    return $gbEncoding.GetString($Bytes)
  }
}

function Try-RepairMojibake {
  param(
    [string]$Text
  )

  try {
    $candidateBytes = $gbEncoding.GetBytes($Text)
    $candidate = $utf8Loose.GetString($candidateBytes)

    if ($candidate -ne $Text -and (Get-CommonChineseScore $candidate) -gt (Get-CommonChineseScore $Text)) {
      return $candidate
    }
  } catch {
  }

  return $Text
}

if (-not (Test-Path -LiteralPath $LyricsDirectory)) {
  Write-Host "Lyrics directory not found. Skipping normalization."
  exit 0
}

$lyricFiles = @(
  Get-ChildItem -LiteralPath $LyricsDirectory -Recurse -File -Filter *.txt |
    Sort-Object FullName
)

foreach ($file in $lyricFiles) {
  $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
  $decodedText = Decode-Text -Bytes $bytes
  $normalizedText = Try-RepairMojibake -Text $decodedText
  [System.IO.File]::WriteAllText($file.FullName, $normalizedText, $utf8NoBom)
  Write-Host "Normalized lyrics: $($file.FullName)"
}
