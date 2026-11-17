# Makes every generated model of a folder fit for the game: one mesh, fewer triangles, a small
# texture, sized to one grid cell (scripts\3d\postprocess.py, runs Blender without a window).
#
#   powershell -File tools\postprocess-models.ps1 [models folder] [output folder]
#       [-MaxTriangles 3000] [-TextureSize 512] [-Shading keep|flat|smooth] [-RecalcNormals]
#       [-ImageFormat WEBP|JPEG|AUTO] [-Suffix text]
#
# Defaults: assets\3d-test -> assets\3d-test\processed (both ignored by git). -Suffix is added
# to the output file names, to keep several variants side by side.
# Exit code: 0 = ok, 1 = at least one model failed, 2 = Blender not found.
param(
    [string]$Models = '',
    [string]$Out = '',
    [int]$MaxTriangles = 3000,
    [int]$TextureSize = 512,
    [ValidateSet('keep', 'flat', 'smooth')][string]$Shading = 'keep',
    [ValidateSet('WEBP', 'JPEG', 'AUTO')][string]$ImageFormat = 'WEBP',
    [switch]$RecalcNormals,
    [string]$Suffix = ''
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
if (-not $Models) { $Models = Join-Path $root 'assets\3d-test' }
if (-not $Out) { $Out = Join-Path $Models 'processed' }
$blender = $env:BLENDER_BIN
if (-not $blender) { $blender = 'F:\Program Files\Blender Foundation\Blender 5.3\blender.exe' }
if (-not (Test-Path -LiteralPath $blender)) {
    Write-Output "Blender not found: $blender (set BLENDER_BIN)"
    exit 2
}
$script = Join-Path $root 'scripts\3d\postprocess.py'
New-Item -ItemType Directory -Force -Path $Out | Out-Null

# Inputs: every .glb of the folder, plus the .obj of every subfolder (a model that did not
# arrive as GLB lies in a folder of its own and takes the folder's name).
$inputs = @()
foreach ($model in Get-ChildItem -LiteralPath $Models -Filter '*.glb' -File) {
    $inputs += [pscustomobject]@{ Name = $model.BaseName; Path = $model.FullName }
}
foreach ($folder in Get-ChildItem -LiteralPath $Models -Directory) {
    if ($folder.FullName -eq (Resolve-Path -LiteralPath $Out).Path) { continue }
    $obj = Get-ChildItem -LiteralPath $folder.FullName -Filter '*.obj' -File | Select-Object -First 1
    if ($obj) { $inputs += [pscustomobject]@{ Name = $folder.Name; Path = $obj.FullName } }
}

$failed = 0
foreach ($model in $inputs | Sort-Object Name) {
    $target = Join-Path $Out ($model.Name + $Suffix + '.glb')
    $arguments = @('--background', '--factory-startup', '--python', $script, '--',
        '--input', $model.Path, '--output', $target,
        '--max-triangles', $MaxTriangles, '--texture-size', $TextureSize, '--shading', $Shading,
        '--image-format', $ImageFormat)
    if ($RecalcNormals) { $arguments += '--recalc-normals' }
    $lines = & $blender @arguments 2>&1 | ForEach-Object { "$_" }
    $exit = $LASTEXITCODE
    $lines | Where-Object { $_ -cmatch '^(RESULT|FAIL)' }
    if ($exit -ne 0) {
        $failed++
        $lines | Select-Object -Last 15
    }
}
if ($failed -gt 0) { exit 1 }
exit 0
