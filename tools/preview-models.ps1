# Saves pictures of every .glb in a folder from the game's camera angle and prints their size
# and triangle counts. Opens a game window for a few seconds.
#
#   powershell -File tools\preview-models.ps1 [models folder] [output folder]
#
# Defaults: assets\3d-test -> build\model-preview (both ignored by git). The run is stopped
# after -TimeoutSeconds. Exit code: 0 = ok, 3 = stopped after the timeout.
param(
    [string]$Models = '',
    [string]$Out = '',
    [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
if (-not $Models) { $Models = Join-Path $root 'assets\3d-test' }
if (-not $Out) { $Out = Join-Path $root 'build\model-preview' }
$godot = $env:GODOT_BIN
if (-not $godot) { $godot = 'F:\Tools\Godot\godot_console.exe' }
if (-not (Test-Path -LiteralPath $godot)) {
    Write-Output "Godot binary not found: $godot (set GODOT_BIN)"
    exit 2
}
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$modelsForGodot = (Resolve-Path -LiteralPath $Models).Path -replace '\\', '/'
$outForGodot = $Out -replace '\\', '/'
$log = Join-Path $Out 'run.log'
$errLog = Join-Path $Out 'run.err.log'

Push-Location -LiteralPath $root
try {
    & $godot --headless --path . --import --quit *> $null
    $arguments = @('--path', '.', 'res://smoke/model_preview.tscn', '--',
        "`"--models=$modelsForGodot`"", "`"--out=$outForGodot`"")
    $process = Start-Process -FilePath $godot -ArgumentList $arguments -PassThru -NoNewWindow `
        -RedirectStandardOutput $log -RedirectStandardError $errLog
    $null = $process.Handle
    $finished = $process.WaitForExit($TimeoutSeconds * 1000)
    if (-not $finished) {
        Get-CimInstance Win32_Process -Filter "ParentProcessId = $($process.Id)" |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
        Stop-Process -Id $process.Id -Force -Confirm:$false
    }
    $lines = @()
    foreach ($file in @($log, $errLog)) {
        if (Test-Path -LiteralPath $file) { $lines += Get-Content -LiteralPath $file }
    }
    $lines | Where-Object { $_ -cmatch 'MODEL|SAVED|FAIL|ERROR|SCRIPT|WARNING' } | Select-Object -Last 40
    if (-not $finished) {
        Write-Output "stopped after $TimeoutSeconds s (the run did not finish)"
        exit 3
    }
    Write-Output "exit code: $($process.ExitCode)"
    exit $process.ExitCode
} finally {
    Pop-Location
}
