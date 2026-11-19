class_name GroundTiles
extends RefCounted
## What each ground cell shows: which layer of the ground atlas (biome and variant), turned
## which way, how bright. The ground shader reads this from a small cell texture per surface
## block (cell_image), one texel per cell plus a ring of the neighbours for the soft borders.

## Orientation bits of a cell's texture, as the shader applies them to (east, south).
const SWAP := 1
const FLIP_U := 2
const FLIP_V := 4
## A cell shows its texture as is or mirrored, by a mirroring that keeps the texture's baked
## light (GroundAtlas.MIRROR): a V1 diamond is lit from the cell's west (FLIP_V keeps that), a
## square render from its north-west (SWAP keeps that). Turning would move the light.
const DEFAULT_MIRROR := FLIP_V
## Brightness is stored as (shade − SHADE_OFFSET) in one byte.
const SHADE_OFFSET := 0.5
## Alpha of an unexplored cell in the cell texture (explored and unloaded cells: 255).
const FOG_ALPHA := 0

var _first_layers: Dictionary
var _variants: int
var _fallback: int
var _mirrors: Dictionary


## `first_layers`: biome key → its first atlas layer, followed by `variants` layers; unknown
## biomes show the `fallback` layer. `mirrors`: biome key → its light-keeping mirroring.
func _init(first_layers: Dictionary, variants: int, fallback: int, mirrors: Dictionary = {}) -> void:
	_first_layers = first_layers
	_variants = variants
	_fallback = fallback
	_mirrors = mirrors


## Atlas layer of a biome in one of its variants.
func layer(biome: String, variant: int) -> int:
	if not _first_layers.has(biome):
		return _fallback
	return Wire.as_int(_first_layers[biome]) + clampi(variant, 0, _variants - 1)


## A stable hash of an absolute cell (the same on every device and every run).
static func cell_hash(x: int, y: int) -> int:
	var h := (x * 374761393 + y * 668265263) & 0xFFFFFFFF
	h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
	return h ^ (h >> 16)


## Orientation (bits SWAP, FLIP_U, FLIP_V) of a cell's texture: as is or by `mirroring`, half
## of the cells each, so equal tiles side by side repeat less. `x` must be wrapped
## (WorldGrid.wrap_x), so the seam does not show.
static func orientation(x: int, y: int, mirroring: int = DEFAULT_MIRROR) -> int:
	return mirroring if (cell_hash(x, y) >> 4) % 2 == 1 else 0


## The light-keeping mirroring of a biome.
func mirror(biome: String) -> int:
	return Wire.as_int(_mirrors.get(biome, DEFAULT_MIRROR))


## Brightness of a cell: vegetation darkens slightly, elevation lightens slightly.
static func shade(vegetation: int, elevation: int) -> float:
	return 1.0 - vegetation * 0.025 + (elevation - 500) * 0.00012


## The cell texture of a block of `size` × `size` cells from (x0, y0), with a ring of one cell
## around it: texel (i, j) is cell (x0 − 1 + i, y0 − 1 + j). Per texel r = layer, g =
## orientation, b = shade − SHADE_OFFSET (0..255 each). `cell_at(x, y)` returns the
## SurfacePatch.Cell at an absolute cell or null. A missing ring cell repeats the block's own
## edge (no blend toward the unknown); a missing block cell shows the fallback layer.
## `hidden_at(x, y)` (optional) says whether a cell is unexplored (fog, draft.31): its alpha is
## FOG_ALPHA instead of 255 (the shader draws fog there), also in the ring, so the fog's edge
## runs on across blocks.
func cell_image(x0: int, y0: int, size: int, wrap_width: int, cell_at: Callable, hidden_at: Callable = Callable()) -> Image:
	var side := size + 2
	var bytes := PackedByteArray()
	bytes.resize(side * side * 4)
	var fog := hidden_at.is_valid()
	for j: int in side:
		for i: int in side:
			var x := x0 - 1 + i
			var y := y0 - 1 + j
			var found: Variant = cell_at.call(x, y)
			var hidden: bool = fog and found == null and hidden_at.call(x, y) == true
			if found == null and not hidden and (i == 0 or j == 0 or i == side - 1 or j == side - 1):
				x = clampi(x, x0, x0 + size - 1)
				y = clampi(y, y0, y0 + size - 1)
				found = cell_at.call(x, y)
				hidden = fog and found == null and hidden_at.call(x, y) == true
			var cell := found as SurfacePatch.Cell
			var at := (j * side + i) * 4
			var wrapped := WorldGrid.wrap_x(x, wrap_width)
			if cell == null:
				bytes[at] = _fallback
				bytes[at + 1] = 0
				bytes[at + 2] = _shade_byte(1.0)
			else:
				bytes[at] = layer(cell.biome, cell.variant)
				bytes[at + 1] = orientation(wrapped, y, mirror(cell.biome))
				bytes[at + 2] = _shade_byte(shade(cell.vegetation, cell.elevation))
			bytes[at + 3] = FOG_ALPHA if hidden else 255
	return Image.create_from_data(side, side, false, Image.FORMAT_RGBA8, bytes)


static func _shade_byte(value: float) -> int:
	return clampi(roundi((value - SHADE_OFFSET) * 255.0), 0, 255)
