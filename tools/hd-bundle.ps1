# Builds the package of high-detail models (game\world\models_hd, not inside the APK) as a Godot
# resource pack, writes the manifest and uploads both to the asset host, where strong phones
# fetch it (HdPackageService).
#
#   powershell -File tools\hd-bundle.ps1           # build, upload, check via the public address
#   powershell -File tools\hd-bundle.ps1 -DryRun   # build only (build\hd\), nothing uploaded
#   powershell -File tools\hd-bundle.ps1 -Force    # upload again even if the version is there
#
# Layout on the host (AWS profile trade-empire-assets, bucket writable under game/ only):
#   game/hd/<version>/models_hd.pck   immutable, cached for a year
#   game/hd/manifest.json             cached 60 s; one entry per format and Godot version
# Public: https://assets.trade-empire.com/game/hd/...
# <version> = date of the last commit touching models_hd + its git tree hash, so the same models
# give the same version. The pack holds only lossy WebP textures (no VRAM formats): one pack
# serves Android, iOS and desktop. FORMAT comes from core\hd_bundle.gd (raise it there when an
# older pack would not fit the client any more).
# The preset "HD Bundle" (export_presets.cfg) lists the models; this script refreshes that list
# from the folder - commit export_presets.cfg when it says so.
# Exit code: 0 = ok, 1 = failed.
param(
    [switch]$DryRun,
    [switch]$Force
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$godot = $env:GODOT_BIN
if (-not $godot) { $godot = 'F:\Tools\Godot\godot_console.exe' }
$bucket = 's3://trade-empire-assets-986971812401'
$prefix = 'game/hd'
$public = 'https://assets.trade-empire.com'
$awsProfile = 'trade-empire-assets'
$region = 'eu-central-1'
$out = 'build\hd'
$pack = Join-Path $out 'models_hd.pck'
$utf8 = New-Object System.Text.UTF8Encoding $false

function Invoke-Aws([string[]]$arguments) {
    $result = & aws @arguments --profile $awsProfile --region $region 2>&1
    return @{ code = $LASTEXITCODE; output = $result }
}

Push-Location -LiteralPath $root
try {
    New-Item -ItemType Directory -Force -Path $out | Out-Null

    # 1. The preset lists every model of the folder (their textures follow as dependencies).
    $models = Get-ChildItem -LiteralPath 'game\world\models_hd' -Filter '*.glb' | Sort-Object Name |
        ForEach-Object { '"res://game/world/models_hd/' + $_.Name + '"' }
    if (-not $models) { Write-Output 'no models in game\world\models_hd'; exit 1 }
    $presets = [System.IO.File]::ReadAllText((Join-Path $root 'export_presets.cfg'))
    $line = 'export_files=PackedStringArray(' + ($models -join ',') + ')'
    $pattern = '(?m)(?<=name="HD Bundle"[\s\S]*?)^export_files=PackedStringArray\([^\n]*\)$'
    if ($presets -notmatch $pattern) { Write-Output 'preset "HD Bundle" not found in export_presets.cfg'; exit 1 }
    $updated = [regex]::Replace($presets, $pattern, $line, 1)
    if ($updated -ne $presets) {
        [System.IO.File]::WriteAllText((Join-Path $root 'export_presets.cfg'), $updated, $utf8)
        Write-Output 'export_presets.cfg: model list of "HD Bundle" updated (commit it)'
    }

    # 2. Version, format, engine.
    $tree = (& git rev-parse --short=12 HEAD:game/world/models_hd).Trim()
    $date = (& git log -1 --format=%cd --date=format:%Y%m%d -- game/world/models_hd).Trim()
    $dirty = & git status --porcelain -- game/world/models_hd
    if (-not $tree -or -not $date) { Write-Output 'game/world/models_hd is not committed'; exit 1 }
    $version = "$date-$tree"
    if ($dirty) {
        if (-not $DryRun) { Write-Output 'game/world/models_hd has uncommitted changes: commit them first (or -DryRun)'; exit 1 }
        $version += '-dirty'
    }
    $format = [regex]::Match((Get-Content -LiteralPath 'core\hd_bundle.gd' -Raw), '(?m)^const FORMAT := (\d+)').Groups[1].Value
    $engineMatch = [regex]::Match([string](& $godot --version), '^(\d+)\.(\d+)')
    if (-not $format -or -not $engineMatch.Success) { Write-Output 'FORMAT or Godot version not found'; exit 1 }
    $engine = $engineMatch.Groups[1].Value + '.' + $engineMatch.Groups[2].Value

    # 3. Import and export the pack.
    if (Test-Path -LiteralPath $pack) { Remove-Item -LiteralPath $pack -Force -Confirm:$false }
    & $godot --headless --path . --import --quit *> $null
    $export = & $godot --headless --path . --export-pack 'HD Bundle' ($pack -replace '\\', '/') 2>&1
    $export | ForEach-Object { [string]$_ } | Where-Object { $_ -cmatch 'ERROR|error:' } | Select-Object -First 20
    if (-not (Test-Path -LiteralPath $pack)) { Write-Output "export failed: $pack was not created"; exit 1 }
    $size = (Get-Item -LiteralPath $pack).Length
    $sha = (Get-FileHash -LiteralPath $pack -Algorithm SHA256).Hash.ToLower()
    $key = "$prefix/$version/models_hd.pck"
    Write-Output ('pack     {0} ({1:N1} MB, {2} models)' -f $pack, ($size / 1MB), $models.Count)
    Write-Output "version  $version (format $format, Godot $engine)"
    Write-Output "sha256   $sha"
    Write-Output "url      $public/$key"

    # 4. Upload the pack once (immutable). A version already there is kept; its checksum is
    #    taken from the host, so the manifest always describes what is served.
    if (-not $DryRun) {
        $exists = Invoke-Aws @('s3api', 'head-object', '--bucket', ($bucket -replace '^s3://', ''), '--key', $key)
        if ($exists.code -eq 0 -and -not $Force) {
            Write-Output "pack $version is already on the host - not uploaded again (-Force overwrites)"
        } else {
            $upload = Invoke-Aws @('s3', 'cp', $pack, "$bucket/$key", '--content-type', 'application/octet-stream',
                '--cache-control', 'public, max-age=31536000, immutable', '--only-show-errors')
            if ($upload.code -ne 0) { $upload.output; Write-Output 'pack upload failed'; exit 1 }
        }
        $check = Join-Path $out 'check.pck'
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "$public/$key" -OutFile $check
        } catch { Write-Output "public pack not reachable: $_"; exit 1 }
        $servedSha = (Get-FileHash -LiteralPath $check -Algorithm SHA256).Hash.ToLower()
        $servedSize = (Get-Item -LiteralPath $check).Length
        Remove-Item -LiteralPath $check -Force -Confirm:$false
        Write-Output "public   $servedSize bytes, sha256 $servedSha"
        if ($servedSha -ne $sha) { Write-Output 'note: the host keeps an earlier build of this version; the manifest names that one' }
        $sha = $servedSha
        $size = $servedSize
    }

    # 5. Manifest: the entries of other formats or Godot versions stay.
    $bundles = @()
    $current = Invoke-Aws @('s3', 'cp', "$bucket/$prefix/manifest.json", '-')
    if ($current.code -eq 0) {
        try {
            $old = ([string]::Join("`n", ($current.output | ForEach-Object { [string]$_ }))) | ConvertFrom-Json
            $bundles = @($old.bundles | Where-Object { -not ($_.format -eq [int]$format -and $_.engine -eq $engine) })
        } catch { Write-Output 'existing manifest unreadable - replaced' }
    }
    $entry = [ordered]@{
        format = [int]$format; engine = $engine; version = $version
        path = "$version/models_hd.pck"; size = $size; sha256 = $sha
        built = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    $manifest = [ordered]@{ schema = 1; bundles = @($bundles) + @([pscustomobject]$entry) }
    $manifestPath = Join-Path $out 'manifest.json'
    [System.IO.File]::WriteAllText((Join-Path $root $manifestPath), ($manifest | ConvertTo-Json -Depth 5), $utf8)
    Write-Output "manifest $manifestPath"
    if ($DryRun) { Write-Output 'dry run: nothing uploaded'; exit 0 }
    $upload = Invoke-Aws @('s3', 'cp', $manifestPath, "$bucket/$prefix/manifest.json",
        '--content-type', 'application/json', '--cache-control', 'public, max-age=60', '--only-show-errors')
    if ($upload.code -ne 0) { $upload.output; Write-Output 'manifest upload failed'; exit 1 }
    Write-Output "uploaded $public/$prefix/manifest.json (served within a minute)"
    exit 0
} finally {
    Pop-Location
}
