# Builds the 3D models of the game (scripts\3d\models) into game-ready GLB files: geometry from
# code, the look baked into textures. Runs Blender without a window.
#
#   powershell -File tools\build-models.ps1 [output folder] [-Only pump]
#   powershell -File tools\build-models.ps1 -Only families [-Types academy,rtg]
#
# Every script builds one model (pump.py -> pump.glb), except families.py, hulls_closed.py,
# props.py, perimeter.py and grounds.py, which build several (-Types limits them); families.py builds the
# module types without a script of their own from shared templates, props.py the surface props
# (trees, stones ...) into the subfolder props, perimeter.py the masts, radar and beacons around a
# base into the subfolder perimeter, grounds.py the fence and wall around a large base into the
# subfolder grounds. kit.py, parts.py and
# hulls.py are libraries. Default output: game\world\models (the models the game loads).
# Look at them with
#   powershell -File tools\preview-models.ps1 game\world\models build\model-preview -NoFit
# Exit code: 0 = ok, 1 = at least one model failed or breaks its size limits, 2 = Blender not found.
param(
    [string]$Out = '',
    [string]$Only = '',
    [string]$Types = ''
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
if (-not $Out) { $Out = Join-Path $root 'game\world\models' }
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
    Sort-Object Name
foreach ($model in $models) {
    if ($model.BaseName -in @('families', 'hulls_closed', 'props', 'perimeter', 'grounds')) {
        # The surface props (trees, stones ...) and the perimeter go into folders of their own.
        $target = if ($model.BaseName -in @('props', 'perimeter', 'grounds')) { Join-Path $Out $model.BaseName } else { $Out }
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
if ($failed -gt 0) { exit 1 }
exit 0
