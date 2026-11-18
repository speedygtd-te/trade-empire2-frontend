# Saves a PNG of each screen for review. Opens a game window for a few seconds.
#
#   powershell -File tools\screenshots.ps1 [output folder]
#   powershell -File tools\screenshots.ps1 -Only map   # signed in, straight to the system map and galaxy
#
# Default output: build\screenshots (ignored by git). The signed-in screen needs the local dev
# backend (tools\dev-backend.ps1 start). The run is stopped after -TimeoutSeconds, so a stuck
# window never stays open. Exit code: 0 = ok, 3 = stopped after the timeout.
param(
    [string]$Out = '',
    [int]$TimeoutSeconds = 180,
    [string]$Only = ''
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
if (-not $Out) { $Out = Join-Path $root 'build\screenshots' }
$godot = $env:GODOT_BIN
if (-not $godot) { $godot = 'F:\Tools\Godot\godot_console.exe' }
if (-not (Test-Path -LiteralPath $godot)) {
    Write-Output "Godot binary not found: $godot (set GODOT_BIN)"
    exit 2
}
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$outForGodot = $Out -replace '\\', '/'
$log = Join-Path $Out 'run.log'
$errLog = Join-Path $Out 'run.err.log'

Push-Location -LiteralPath $root
try {
    & $godot --headless --path . --import --quit *> $null
    $arguments = @('--path', '.', 'res://smoke/screenshots.tscn', '--', "`"--out=$outForGodot`"")
    if ($Only) { $arguments += "--only=$Only" }
    $process = Start-Process -FilePath $godot -ArgumentList $arguments -PassThru -NoNewWindow `
        -RedirectStandardOutput $log -RedirectStandardError $errLog
    # Reading the handle now makes ExitCode available after the process has ended.
    $null = $process.Handle
    $finished = $process.WaitForExit($TimeoutSeconds * 1000)
    if (-not $finished) {
        # godot_console.exe is a wrapper; stop the engine process it started as well.
        Get-CimInstance Win32_Process -Filter "ParentProcessId = $($process.Id)" |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
        Stop-Process -Id $process.Id -Force -Confirm:$false
    }
    $lines = @()
    foreach ($file in @($log, $errLog)) {
        if (Test-Path -LiteralPath $file) { $lines += Get-Content -LiteralPath $file }
    }
    $lines | ForEach-Object { ([string]$_) -replace '[0-9a-f]{64}', '<token>' } |
        Where-Object { $_ -notmatch '^Godot Engine' -and $_.Trim().Length -gt 0 } |
        Select-Object -Last 40
    if (-not $finished) {
        Write-Output "stopped after $TimeoutSeconds s (the run did not finish)"
        exit 3
    }
    Write-Output "exit code: $($process.ExitCode)"
    exit $process.ExitCode
} finally {
    Pop-Location
}
