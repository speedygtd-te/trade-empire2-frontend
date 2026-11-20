# Builds the 3D models of the game (scripts\3d\models) into game-ready GLB files: geometry from
# code, the look baked into textures. Runs Blender without a window.
#
#   powershell -File tools\build-models.ps1 [output folder] [-Only pump]
#   powershell -File tools\build-models.ps1 -Only families [-Types academy,rtg]
#
# Every script builds one model (pump.py -> pump.glb), except families.py, hulls_closed.py,
# enterprise.py, enterprise_hulls.py, props.py, perimeter.py, grounds.py, retaining.py and
# resources.py, which build several (-Types limits them); families.py builds the
# module types without a script of their own from shared templates, enterprise.py and
# enterprise_hulls.py the enterprise modules and hulls (open and shut) in the clean enterprise
# look (kit style "enterprise"), props.py the surface props
# (trees, stones ...) into the subfolder props, perimeter.py the masts, radar and beacons around a
# base into the subfolder perimeter, grounds.py the fence and wall around a large base into the
# subfolder grounds, retaining.py the retaining walls beside structures on a slope into the subfolder
# retaining, resources.py the goods (one model per resource, the source of the icons in
# game\ui\resource_icons) into the subfolder resources. kit.py, parts.py and
# hulls.py are libraries. Default output: game\world\models (the models the game loads).
# Look at them with
#   powershell -File tools\preview-models.ps1 game\world\models build\model-preview -NoFit
#
# -Detail hd builds the high-detail variant of the modules and hulls for strong phones (rounder,
# rounded edges, 1024 px textures; kit.py HD_*) into game\world\models_hd with the same file
# names; the game shows it on the top detail tier. Props, perimeter, grounds and resources have
# none. Afterwards Godot imports the folder and its textures are switched to lossy WebP (a
# quarter of the APK size of lossless at 1024 px; needs Godot, GODOT_BIN).
# Exit code: 0 = ok, 1 = at least one model failed or breaks its size limits, 2 = Blender not found.
param(
    [string]$Out = '',
    [string]$Only = '',
    [string]$Types = '',
    [ValidateSet('', 'hd')]
    [string]$Detail = ''
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
if (-not $Out) { $Out = Join-Path $root $(if ($Detail -eq 'hd') { 'game\world\models_hd' } else { 'game\world\models' }) }
# kit.py reads the detail level from the environment; the normal build must not inherit it.
if ($Detail) { $env:TE_DETAIL = $Detail } else { Remove-Item Env:TE_DETAIL -ErrorAction SilentlyContinue }
# Only modules and hulls have a high-detail variant.
$noDetail = @('props', 'perimeter', 'grounds', 'resources', 'retaining')
$blender = $env:BLENDER_BIN
if (-not $blender) { $blender = 'F:\Program Files\Blender Foundation\Blender 5.3\blender.exe' }
if (-not (Test-Path -LiteralPath $blender)) {
    Write-Output "Blender not found: $blender (set BLENDER_BIN)"
    exit 2
}
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$failed = 0
$models = Get-ChildItem -LiteralPath (Join-Path $root 'scripts\3d\models') -Filter '*.py' -File |
    Where-Object { $_.BaseName -notin @('kit', 'parts', 'hulls') -and (-not $Only -or $_.BaseName -eq $Only) } |
    Where-Object { -not $Detail -or $_.BaseName -notin $noDetail } |
    Sort-Object Name
foreach ($model in $models) {
    if ($model.BaseName -in @('families', 'hulls_closed', 'enterprise', 'enterprise_hulls', 'props', 'perimeter', 'grounds', 'retaining', 'resources')) {
        # The surface props (trees, stones ...) and the perimeter go into folders of their own.
        $target = if ($model.BaseName -in @('props', 'perimeter', 'grounds', 'retaining', 'resources')) { Join-Path $Out $model.BaseName } else { $Out }
        New-Item -ItemType Directory -Force -Path $target | Out-Null
        $arguments = @('--output-dir', $target)
        if ($Types) { $arguments += @('--only', $Types) }
    } else {
        $arguments = @('--output', (Join-Path $Out ($model.BaseName + '.glb')))
    }
    $lines = & $blender --background --factory-startup --python $model.FullName -- @arguments 2>&1 |
        ForEach-Object { "$_" }
    $exit = $LASTEXITCODE
    $lines | Where-Object { $_ -cmatch '^(RESULT|FAIL)' }
    if ($exit -ne 0) {
        $failed++
        if (-not ($lines | Where-Object { $_ -cmatch '^RESULT' })) { $lines | Select-Object -Last 15 }
    }
}
if ($models.Count -eq 0) { Write-Output 'no model scripts found'; exit 1 }
# Godot extracts the textures of a GLB on its first import, with lossless import settings: import,
# switch the high-detail ones to lossy, import again.
if ($Detail) {
    $godot = $env:GODOT_BIN
    if (-not $godot) { $godot = 'F:\Tools\Godot\godot_console.exe' }
    if (Test-Path -LiteralPath $godot) {
        Push-Location -LiteralPath $root
        & $godot --headless --path . --import --quit *> $null
        $lossy = 0
        Get-ChildItem -LiteralPath $Out -Filter '*.webp.import' -File | ForEach-Object {
            $text = [IO.File]::ReadAllText($_.FullName)
            if ($text -match 'compress/mode=0') {
                [IO.File]::WriteAllText($_.FullName, ($text -replace 'compress/mode=0', 'compress/mode=1'))
                $lossy++
            }
        }
        if ($lossy -gt 0) { & $godot --headless --path . --import --quit *> $null }
        Pop-Location
        Write-Output "textures switched to lossy: $lossy"
    } else {
        Write-Output "Godot not found ($godot): high-detail textures stay lossless until this runs again"
    }
}
if ($failed -gt 0) { exit 1 }
exit 0
