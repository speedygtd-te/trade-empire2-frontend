# Builds a debug APK and, when a device or emulator is connected, installs and starts it.
#
#   powershell -File tools\android-debug.ps1            # preset "Android Local": talks to the
#                                                       # local dev backend through 10.0.2.2
#   powershell -File tools\android-debug.ps1 -Live      # preset "Android": talks to the real server
#   powershell -File tools\android-debug.ps1 -NoInstall # build only
#
# No device connected is not an error: the APK is built and the script says so.
# The session token appears once per sign-in under `adb logcat -s godot` (debug builds only).
# Exit code: 0 = built (and started if a device was there), 1 = build or install failed.
param(
    [switch]$Live,
    [switch]$NoInstall,
    # Install and start the APK of the last build instead of exporting again.
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$godot = $env:GODOT_BIN
if (-not $godot) { $godot = 'F:\Tools\Godot\godot_console.exe' }
if (-not (Test-Path -LiteralPath $godot)) {
    Write-Output "Godot binary not found: $godot (set GODOT_BIN)"
    exit 1
}

if ($Live) {
    $preset = 'Android'
    $apk = 'build/android/trade-empire-debug.apk'
    $package = 'com.tradeempire.v2.debug'
} else {
    $preset = 'Android Local'
    $apk = 'build/android/trade-empire-local-debug.apk'
    $package = 'com.tradeempire.v2.local'
}

Push-Location -LiteralPath $root
try {
    New-Item -ItemType Directory -Force -Path 'build\android' | Out-Null
    if (-not $SkipBuild) {
        if (Test-Path -LiteralPath $apk) { Remove-Item -LiteralPath $apk -Force -Confirm:$false }
        & $godot --headless --path . --import --quit *> $null
        $export = & $godot --headless --path . --export-debug $preset $apk 2>&1
        $export | ForEach-Object { [string]$_ } | Where-Object { $_ -cmatch 'ERROR|WARNING|error:' } | Select-Object -First 30
    }
    if (-not (Test-Path -LiteralPath $apk)) {
        Write-Output "export failed: $apk was not created"
        exit 1
    }
    $size = (Get-Item -LiteralPath $apk).Length / 1MB
    Write-Output ('built {0} ({1:N1} MB), preset "{2}"' -f $apk, $size, $preset)
    if ($NoInstall) { exit 0 }

    $adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
    if (-not (Test-Path -LiteralPath $adb)) {
        Write-Output "adb not found at $adb - APK built, not installed"
        exit 0
    }
    # The adb server may just have been (re)started; give a device a moment to come online.
    & $adb start-server *> $null
    $devices = $null
    for ($attempt = 0; $attempt -lt 10 -and -not $devices; $attempt++) {
        $devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' }
        if (-not $devices) { Start-Sleep -Seconds 2 }
    }
    if (-not $devices) {
        Write-Output 'no device or emulator connected - APK built, not installed'
        exit 0
    }
    $install = & $adb install -r $apk 2>&1
    $install | Select-Object -Last 2
    if (-not ($install -match 'Success')) { exit 1 }
    & $adb logcat -c
    & $adb shell monkey -p $package -c android.intent.category.LAUNCHER 1 *> $null
    Start-Sleep -Seconds 8
    Write-Output '--- logcat (tag godot) ---'
    & $adb logcat -d -s godot | ForEach-Object { ([string]$_) -replace '[0-9a-f]{64}', '<token>' } | Select-Object -Last 25
    exit 0
} finally {
    Pop-Location
}
