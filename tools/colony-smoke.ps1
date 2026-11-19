# End-to-end check of building against the server (smoke/colony_build.tscn): places a hull and
# a module next to the colony of the development account and removes both again. With
# -Scene dock_build (smoke/dock_build.tscn): places docks, founds and extends a guest on them,
# checks the dock rules and takes everything down again. With -Scene route_flow
# (smoke/route_flow.tscn, own account .local/routes-account.json): builds a transporter and a
# station once, then storage modes, cargo moves and a ground route with quote, trips, pause and
# delete (takes minutes: use -TimeoutSeconds 1800 on a fresh account, 900 later).
#
#   powershell -File tools\colony-smoke.ps1 [-Scene colony_build|dock_build|route_flow] [-TimeoutSeconds 120]
#
# Needs the development account (node tools/dev-account.cjs creates it). Runs without window.
# Exit code: 0 = green, 1 = a check failed, 2 = no account, 3 = stopped after the timeout.
param(
    [ValidateSet('colony_build', 'dock_build', 'route_flow')][string]$Scene = 'colony_build',
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$godot = $env:GODOT_BIN
if (-not $godot) { $godot = 'F:\Tools\Godot\godot_console.exe' }
$accountName = if ($Scene -eq 'route_flow') { 'routes' } else { 'dev' }
if (-not (Test-Path -LiteralPath (Join-Path $root ".local\$accountName-account.json"))) {
    Push-Location -LiteralPath $root
    node tools/dev-account.cjs --account $accountName | Out-Null
    Pop-Location
}
$log = Join-Path $env:TEMP 'te-colony-smoke.log'
$errLog = Join-Path $env:TEMP 'te-colony-smoke.err.log'

Push-Location -LiteralPath $root
try {
    & $godot --headless --path . --import --quit *> $null
    $process = Start-Process -FilePath $godot -ArgumentList @('--headless', '--path', '.', "res://smoke/$Scene.tscn") `
        -PassThru -NoNewWindow -RedirectStandardOutput $log -RedirectStandardError $errLog
    $null = $process.Handle
    $finished = $process.WaitForExit($TimeoutSeconds * 1000)
    if (-not $finished) {
        Get-CimInstance Win32_Process -Filter "ParentProcessId = $($process.Id)" |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
        Stop-Process -Id $process.Id -Force -Confirm:$false
    }
    foreach ($file in @($log, $errLog)) {
        if (Test-Path -LiteralPath $file) {
            Get-Content -LiteralPath $file | ForEach-Object { ([string]$_) -replace '[0-9a-f]{64}', '<token>' } |
                Where-Object { $_ -cmatch '^(PASS|FAIL|COLONY|DOCK|ROUTE|docks|server)|ERROR|SCRIPT' }
        }
    }
    if (-not $finished) { Write-Output "stopped after $TimeoutSeconds s"; exit 3 }
    Write-Output "exit code: $($process.ExitCode)"
    exit $process.ExitCode
} finally {
    Pop-Location
}
