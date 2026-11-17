# End-to-end check of sign-in, session restore and the event channel against a running backend.
#
#   powershell -File tools\smoke.ps1                              # local dev backend
#   powershell -File tools\smoke.ps1 https://trade-empire.net     # another server
#
# Needs a reachable backend (local: tools\dev-backend.ps1 start). Registers one throwaway
# account per run. Exit code: 0 = green, 1 = a check failed, 2 = wrong usage.
param([string]$Server = 'http://127.0.0.1:18080')

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$godot = $env:GODOT_BIN
if (-not $godot) { $godot = 'F:\Tools\Godot\godot_console.exe' }
if (-not (Test-Path -LiteralPath $godot)) {
    Write-Output "Godot binary not found: $godot (set GODOT_BIN)"
    exit 2
}

Push-Location -LiteralPath $root
try {
    & $godot --headless --path . --import --quit *> $null
    $output = & $godot --headless --path . -s res://smoke/backend_smoke.gd -- "--server=$Server" 2>&1
    $code = $LASTEXITCODE
    # Session tokens are printed in debug runs; keep them out of the summary.
    $output | ForEach-Object { ([string]$_) -replace '[0-9a-f]{64}', '<token>' } |
        Where-Object { $_ -notmatch '^Godot Engine' -and $_.Trim().Length -gt 0 }
    Write-Output "exit code: $code"
    exit $code
} finally {
    Pop-Location
}
