# Builds a release APK for testing on Android devices (live server), signed with a locally
# generated keystore, and installs it when a device is connected.
#
#   powershell -File tools\android-release.ps1            # build (and install if a device is there)
#   powershell -File tools\android-release.ps1 -NoInstall # build only
#
# The keystore is made on the first run: .local\release.keystore with a random password in
# .local\release-keystore.json (both git-ignored, never commit them, keep them: an update of an
# installed APK needs the same key). Godot gets them through its environment variables
# GODOT_ANDROID_KEYSTORE_RELEASE_*, so nothing secret goes into export_presets.cfg.
# Package com.tradeempire.v2 installs next to the debug variants (.debug, .local).
# Exit code: 0 = built (and installed if a device was there), 1 = failed.
param(
    [switch]$NoInstall
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$godot = $env:GODOT_BIN
if (-not $godot) { $godot = 'F:\Tools\Godot\godot_console.exe' }
$keytool = Get-ChildItem 'C:\Program Files\Eclipse Adoptium\*\bin\keytool.exe' -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $keytool) { $keytool = (Get-Command keytool -ErrorAction SilentlyContinue).Source }
$apk = 'build/android/trade-empire.apk'
$package = 'com.tradeempire.v2'
$keystore = Join-Path $root '.local\release.keystore'
$secrets = Join-Path $root '.local\release-keystore.json'
$alias = 'tradeempire'

Push-Location -LiteralPath $root
try {
    New-Item -ItemType Directory -Force -Path 'build\android', '.local' | Out-Null
    if (-not (Test-Path -LiteralPath $keystore)) {
        if (-not $keytool) { Write-Output 'keytool not found (install a JDK)'; exit 1 }
        $bytes = New-Object byte[] 24
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $password = [Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', 'x'
        & $keytool -genkeypair -keystore $keystore -alias $alias -keyalg RSA -keysize 2048 -validity 10000 `
            -storepass $password -keypass $password -dname 'CN=Trade Empire Test, O=Trade Empire' *> $null
        if (-not (Test-Path -LiteralPath $keystore)) { Write-Output 'keystore could not be created'; exit 1 }
        # UTF-8 without BOM.
        [System.IO.File]::WriteAllText($secrets, (@{ alias = $alias; password = $password } | ConvertTo-Json))
        Write-Output "new keystore: $keystore (keep it: updates need the same key)"
    }
    $credentials = Get-Content -LiteralPath $secrets -Raw | ConvertFrom-Json
    $env:GODOT_ANDROID_KEYSTORE_RELEASE_PATH = $keystore
    $env:GODOT_ANDROID_KEYSTORE_RELEASE_USER = $credentials.alias
    $env:GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD = $credentials.password

    if (Test-Path -LiteralPath $apk) { Remove-Item -LiteralPath $apk -Force -Confirm:$false }
    & $godot --headless --path . --import --quit *> $null
    $export = & $godot --headless --path . --export-release 'Android Release' $apk 2>&1
    $export | ForEach-Object { [string]$_ } | Where-Object { $_ -cmatch 'ERROR|WARNING|error:' } | Select-Object -First 30
    if (-not (Test-Path -LiteralPath $apk)) { Write-Output "export failed: $apk was not created"; exit 1 }
    Write-Output ('built {0} ({1:N1} MB)' -f $apk, ((Get-Item -LiteralPath $apk).Length / 1MB))

    $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    $apksigner = Get-ChildItem (Join-Path $sdk 'build-tools\*\apksigner.bat') -ErrorAction SilentlyContinue |
        Sort-Object FullName | Select-Object -Last 1 -ExpandProperty FullName
    if ($apksigner) {
        & $apksigner verify --print-certs $apk 2>&1 | Where-Object { $_ -match 'Signer #1 certificate (DN|SHA-256)' }
    }
    if ($NoInstall) { exit 0 }

    $adb = Join-Path $sdk 'platform-tools\adb.exe'
    if (-not (Test-Path -LiteralPath $adb)) { Write-Output 'adb not found - APK built, not installed'; exit 0 }
    & $adb start-server *> $null
    $devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' }
    if (-not $devices) { Write-Output 'no device connected - APK built, not installed'; exit 0 }
    $install = & $adb install -r $apk 2>&1
    $install | Select-Object -Last 2
    if (-not ($install -match 'Success')) { exit 1 }
    & $adb shell monkey -p $package -c android.intent.category.LAUNCHER 1 *> $null
    Write-Output "installed and started $package"
    exit 0
} finally {
    Pop-Location
}
