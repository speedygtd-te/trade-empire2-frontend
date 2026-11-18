# End-to-end check of sign-in, session restore and the event channel against a running backend.
#
#   powershell -File tools\smoke.ps1                              # live server
#   powershell -File tools\smoke.ps1 http://127.0.0.1:18080       # another server
#   powershell -File tools\smoke.ps1 -DefinitionsOnly             # game data only, no account
#
# Registers one throwaway account per run on that server, so do not run it without reason
# (-DefinitionsOnly needs no account). Exit code: 0 = green, 1 = a check failed, 2 = wrong usage.
param(
    [string]$Server = 'https://trade-empire.net',
    [switch]$DefinitionsOnly
)

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
    $smokeArgs = @("--server=$Server")
    if ($DefinitionsOnly) { $smokeArgs += '--definitions-only' }
    $output = & $godot --headless --path . -s res://smoke/backend_smoke.gd -- @smokeArgs 2>&1
    $code = $LASTEXITCODE
    # Session tokens are printed in debug runs; keep them out of the summary.
    $output | ForEach-Object { ([string]$_) -replace '[0-9a-f]{64}', '<token>' } |
        Where-Object { $_ -notmatch '^Godot Engine' -and $_.Trim().Length -gt 0 }
    Write-Output "exit code: $code"
    exit $code
} finally {
    Pop-Location
}
