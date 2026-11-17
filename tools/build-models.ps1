# Builds every hand-made model (scripts\3d\models\*.py, except the kit) into a game-ready GLB:
# geometry from code, the look baked into one texture per model. Runs Blender without a window.
#
#   powershell -File tools\build-models.ps1 [output folder] [-Only pump]
#
# Default output: build\models (ignored by git). Look at the result with
#   powershell -File tools\preview-models.ps1 build\models build\model-preview
# Exit code: 0 = ok, 1 = at least one model failed or breaks its size limits, 2 = Blender not found.
param(
    [string]$Out = '',
    [string]$Only = ''
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
if (-not $Out) { $Out = Join-Path $root 'build\models' }
$blender = $env:BLENDER_BIN
if (-not $blender) { $blender = 'F:\Program Files\Blender Foundation\Blender 5.3\blender.exe' }
if (-not (Test-Path -LiteralPath $blender)) {
    Write-Output "Blender not found: $blender (set BLENDER_BIN)"
    exit 2
}
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$failed = 0
$models = Get-ChildItem -LiteralPath (Join-Path $root 'scripts\3d\models') -Filter '*.py' -File |
    Where-Object { $_.BaseName -ne 'kit' -and (-not $Only -or $_.BaseName -eq $Only) } | Sort-Object Name
foreach ($model in $models) {
    $target = Join-Path $Out ($model.BaseName + '.glb')
    $lines = & $blender --background --factory-startup --python $model.FullName -- --output $target 2>&1 |
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
