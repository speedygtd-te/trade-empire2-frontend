# Runs the Godot import and the gdUnit4 suites headless and prints a short summary.
#
#   powershell -File tools\test.ps1                 # all suites under res://tests
#   powershell -File tools\test.ps1 res://tests/core # one folder or suite
#   powershell -File tools\test.ps1 -Full           # unfiltered runner output
#
# Exit code: 0 = all green, otherwise the exit code of the gdUnit4 runner (100 = failures).
param(
    [string]$Suite = 'res://tests',
    [switch]$Full
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$godot = $env:GODOT_BIN
if (-not $godot) { $godot = 'F:\Tools\Godot\godot_console.exe' }
if (-not (Test-Path -LiteralPath $godot)) {
    Write-Output "Godot binary not found: $godot (set GODOT_BIN)"
    exit 2
}
$env:GODOT_BIN = $godot
$escape = [string][char]27

function Remove-Ansi([string]$line) {
    return ($line -replace ($escape + '\[[0-9;]*m'), '')
}

Push-Location -LiteralPath $root
try {
    # Import first: registers class_name scripts and reports parse errors.
    $import = & $godot --headless --path . --import --quit 2>&1 | ForEach-Object { Remove-Ansi ([string]$_) }
    $importProblems = $import | Where-Object { $_ -cmatch 'SCRIPT ERROR|Parse Error|^ERROR' }
    if ($importProblems) {
        Write-Output '--- import problems ---'
        $importProblems | Select-Object -First 40
    }

    $arguments = "--headless --ignoreHeadlessMode -a $Suite -rd res://reports"
    $output = & cmd /c "addons\gdUnit4\runtest.cmd $arguments" 2>&1 | ForEach-Object { Remove-Ansi ([string]$_) }
    $code = $LASTEXITCODE

    if ($Full) {
        $output
    } else {
        # The runner connects its debugger to port 0 on purpose; those two lines are noise.
        # Case-sensitive on purpose: test names containing "error" must not match.
        $output | Where-Object {
            $_ -cmatch 'FAILED|SCRIPT ERROR|Parse Error|^\s*line \d+|Expecting|but was|Overall Summary|Executed test|ERROR' -and
            $_ -cnotmatch 'remote port number|Remote Debugger'
        } | Select-Object -First 120
    }
    Write-Output "exit code: $code"
    exit $code
} finally {
    Pop-Location
}
