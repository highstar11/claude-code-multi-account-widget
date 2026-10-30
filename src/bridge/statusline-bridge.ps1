# Status line bridge (Windows).
#
# Claude Code runs this as the account's status line command and pipes the
# session JSON to stdin. We keep only the `rate_limits` numbers and write them
# next to this file, so the widget never needs credentials or network access.
# If the user had their own status line before, it is run with the same input
# and its output is shown unchanged.
#
# Copied into <configDir>\.usage-widget\bridge.ps1

$ErrorActionPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$raw = [Console]::In.ReadToEnd()
$nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

function Write-Atomic([string]$file, [string]$text) {
  $tmp = "$file.$PID.tmp"
  [IO.File]::WriteAllText($tmp, $text, $utf8)
  if (Test-Path -LiteralPath $file) { [IO.File]::Replace($tmp, $file, $null) } else { [IO.File]::Move($tmp, $file) }
}

function Pick-Window($w) {
  if ($null -eq $w) { return $null }
  $out = [ordered]@{}
  if ($null -ne $w.used_percentage) { $out.used_percentage = [double]$w.used_percentage }
  if ($null -ne $w.resets_at) { $out.resets_at = [long]$w.resets_at }
  return $out
}

$data = $null
try { $data = $raw | ConvertFrom-Json } catch {}
$line = ''

if ($null -ne $data) {
  try {
    $five = Pick-Window $data.rate_limits.five_hour
    $seven = Pick-Window $data.rate_limits.seven_day
    if ($null -eq $five -and $null -eq $seven) {
      # Not a subscriber, or no API response yet in this session: keep the last good snapshot.
      Write-Atomic (Join-Path $here 'heartbeat.json') (@{ version = 1; seenAt = $nowMs } | ConvertTo-Json -Compress)
    } else {
      $rl = [ordered]@{}
      if ($null -ne $five) { $rl.five_hour = $five }
      if ($null -ne $seven) { $rl.seven_day = $seven }
      $snap = [ordered]@{ version = 1; capturedAt = $nowMs; rate_limits = $rl }
      if ($data.model.display_name) { $snap.model = [string]$data.model.display_name }
      Write-Atomic (Join-Path $here 'snapshot.json') ($snap | ConvertTo-Json -Depth 5 -Compress)
      $parts = @()
      if ($null -ne $five.used_percentage) { $parts += ('5h {0}%' -f [math]::Round($five.used_percentage)) }
      if ($null -ne $seven.used_percentage) { $parts += ('7d {0}%' -f [math]::Round($seven.used_percentage)) }
      $line = $parts -join " $([char]0x00B7) "
    }
  } catch {}
}

$prevFile = Join-Path $here 'previous-statusline.json'
$prev = $null
if (Test-Path -LiteralPath $prevFile) {
  try { $prev = ([IO.File]::ReadAllText($prevFile, $utf8) | ConvertFrom-Json).command } catch {}
}

if ($prev) {
  # Re-run the user's own status line the way Claude Code would: Git Bash when present, else PowerShell.
  $bash = $env:CLAUDE_CODE_GIT_BASH_PATH
  if (-not $bash) {
    $git = (Get-Command git.exe -ErrorAction SilentlyContinue).Source
    if ($git) {
      $root = Split-Path -Parent (Split-Path -Parent $git)
      $candidate = Join-Path $root 'bin\bash.exe'
      if (Test-Path -LiteralPath $candidate) { $bash = $candidate }
    }
  }
  if ($bash) { $raw | & $bash -c $prev } else { $raw | powershell -NoProfile -Command $prev }
  exit 0
}

[Console]::Out.WriteLine($line)
