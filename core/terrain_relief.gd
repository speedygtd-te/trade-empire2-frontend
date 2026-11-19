class_name TerrainRelief
extends RefCounted
## The relief of a body's surface as the colony view draws it — display only: cells and levels
## stay flat in the game's rules. Every cell carries an elevation `e` 0..1000 (SurfaceCell.e); the
## ground runs through the corners between the cells, each the mean of the known cells around it,
## so it is smooth and the same seen from every block. Heights here are elevation units; SCALE
## turns them into scene height (cells), measured from `reference` (where the home structure
## stands, so it keeps its scene height).
##
## Structures stand flat at the mean elevation of their ground footprint (a Pad, base_of): ground
## higher than that is cut down to it, lower ground is filled up a little at the footprint's edge
## (FILL) and a foundation (foundation()) closes the rest, from the structure's floor down to the
## ground; a ring of BLEND cells around eases back to the natural ground.
##
## Unexplored (fog) and unloaded cells have no elevation: a corner without any known cell around it
## takes the mean elevation of the blocks nearby (bilinear between block centres), or the reference
## where a block knows nothing. Heights are cached per block (block_heights) and dropped when the
## block or one beside it loads (surface_loaded) or a pad near it changes (set_pads); every block
## computes a corner the same way, so neighbouring blocks agree on their shared edge.
##
## Corner (x, y) is the south-west corner of cell (x, y); a point (px, py) in cell coordinates lies
## in cell (floor(px), floor(py)), whose centre is (x + 0.5, y + 0.5).

## Scene height (cells) per elevation unit: a clearly exaggerated relief (Rudi 2026-11-19: one unit
## of `e` about a tenth of a cell; a cell is 10 m wide).
const SCALE := 0.1
## Share of a foundation's height the ground is filled up at the footprint's edge.
const FILL := 0.3
## Corners around a pad over which the ground eases back to its natural height.
const BLEND := 1
## Foundation walls lower than this (elevation units) are left out.
const MIN_FOUNDATION := 0.05
## Corners per side of a block's cache: the block's BLOCK + 1 and one more on each side (normals).
const SIDE := SurfaceBlocks.BLOCK + 3
## The ground is lit as if its slopes were this much steeper than drawn (a hillshade): most of the
## surface rises only a unit or two per cell, which the sun alone would hardly show.
const HILLSHADE := 3.0


## A structure standing on the ground: its ground footprint (absolute cells) and the elevation its
## floor stands at.
class Pad:
	extends RefCounted
	var cells: Array[Vector2i] = []
	var base := 0.0

	func _init(footprint: Array[Vector2i] = [], elevation: float = 0.0) -> void:
		cells = footprint
		base = elevation


## One side of a foundation: from corner `a` to corner `b` (absolute) along the footprint's edge,
## from the structure's floor (`top`) down to the ground at either end. `outward`: the step (cell x,
## cell y) away from the footprint.
class Wall:
	extends RefCounted
	var a := Vector2i.ZERO
	var b := Vector2i.ZERO
	var top := 0.0
	var bottom_a := 0.0
	var bottom_b := 0.0
	var outward := Vector2i.ZERO


var surface: SurfaceBlocks
## Body width in cells (wraps in x); 0 = no wrapping.
var size_x := 0
## Elevation at scene height 0, and whether it was set (the fog's level until then).
var reference := 500.0
var _has_reference := false
## Block → PackedFloat32Array of SIDE × SIDE corner heights (displayed, elevation units).
var _cache: Dictionary = {}
## Block → mean elevation of its known cells (NAN without any).
var _means: Dictionary = {}
## Corner (x wrapped, y) → Vector2(base, distance) of the nearest pad within BLEND.
var _pad_corners: Dictionary = {}
## Blocks whose cache holds a corner of a pad (block → true).
var _pad_blocks: Dictionary = {}
var _pad_signature := 0


func _init(blocks: SurfaceBlocks, wrap_width: int = 0) -> void:
	surface = blocks
	size_x = wrap_width


func has_reference() -> bool:
	return _has_reference


## Sets the elevation drawn at scene height 0; every cached height is dropped.
func set_reference(elevation: float) -> void:
	reference = elevation
	_has_reference = true
	_cache.clear()


## Scene height (cells) of an elevation.
func scene_height(elevation: float) -> float:
	return (elevation - reference) * SCALE


## Drops everything cached (the surface was loaded anew).
func clear() -> void:
	_cache.clear()
	_means.clear()


## Blocks were loaded: their heights and those of the blocks beside them are computed again.
## Returns the blocks whose heights may have changed (block → true).
func surface_loaded(blocks: Array[Vector2i]) -> Dictionary:
	var touched := {}
	for block: Vector2i in blocks:
		_means.erase(_wrap_block(block))
		for dy: int in [-1, 0, 1]:
			for dx: int in [-1, 0, 1]:
				var beside := _wrap_block(block + Vector2i(dx, dy))
				_cache.erase(beside)
				touched[beside] = true
	return touched


## The mean elevation of the known cells among `cells` (absolute); NAN when none is known.
func base_of(cells: Array[Vector2i]) -> float:
	var sum := 0.0
	var count := 0
	for cell: Vector2i in cells:
		var found := surface.cell(cell.x, cell.y)
		if found != null:
			sum += found.elevation
			count += 1
	return sum / count if count > 0 else NAN


## Sets the structures standing on the ground. Returns the blocks whose heights changed (block →
## true); empty when the pads are the same as before.
func set_pads(pads: Array[Pad]) -> Dictionary:
	var signature_parts: Array = []
	for pad: Pad in pads:
		signature_parts.append(pad.cells)
		signature_parts.append(pad.base)
	var signature := hash(signature_parts)
	if signature == _pad_signature:
		return {}
	_pad_signature = signature
	var corners := {}
	for pad: Pad in pads:
		_add_pad(corners, pad)
	var touched := {}
	for key: Vector2i in corners.keys():
		if _pad_corners.get(key) != corners[key]:
			_touch_corner(touched, key)
	for key: Vector2i in _pad_corners.keys():
		if not corners.has(key):
			_touch_corner(touched, key)
	_pad_corners = corners
	# Blocks a pad may reach: those around its bounding box (cheaper than every corner).
	_pad_blocks.clear()
	for pad: Pad in pads:
		if pad.cells.is_empty():
			continue
		var low := pad.cells[0]
		var high := pad.cells[0]
		for cell: Vector2i in pad.cells:
			low = low.min(cell)
			high = high.max(cell)
		var b := SurfaceBlocks.BLOCK
		# A pad's corners run from low − BLEND to high + 1 + BLEND; block k's cache holds corners
		# k·BLOCK − 1 … k·BLOCK + BLOCK + 1 (_touch_corner).
		for by: int in range(ceili(float(low.y - BLEND - b - 1) / b), floori(float(high.y + BLEND + 2) / b) + 1):
			for bx: int in range(ceili(float(low.x - BLEND - b - 1) / b), floori(float(high.x + BLEND + 2) / b) + 1):
				_pad_blocks[_wrap_block(Vector2i(bx, by))] = true
	for block: Vector2i in touched.keys():
		_cache.erase(block)
	return touched


## The displayed height (elevation units) of corner (x, y).
func corner(x: int, y: int) -> float:
	var wx := WorldGrid.wrap_x(x, size_x)
	var block := Vector2i(floori(float(wx) / SurfaceBlocks.BLOCK), floori(float(y) / SurfaceBlocks.BLOCK))
	var heights := block_heights(block)
	return heights[(y - block.y * SurfaceBlocks.BLOCK + 1) * SIDE + wx - block.x * SurfaceBlocks.BLOCK + 1]


## The displayed height (elevation units) at a point in cell coordinates, on the two triangles the
## ground draws each cell with (split()).
func height(px: float, py: float) -> float:
	var x := floori(px)
	var y := floori(py)
	var wx := WorldGrid.wrap_x(x, size_x)
	var block := Vector2i(floori(float(wx) / SurfaceBlocks.BLOCK), floori(float(y) / SurfaceBlocks.BLOCK))
	# The cell's four corners all lie in its block's cache (it reaches one corner beyond).
	var heights := block_heights(block)
	var at := (y - block.y * SurfaceBlocks.BLOCK + 1) * SIDE + wx - block.x * SurfaceBlocks.BLOCK + 1
	return surface_height(heights[at], heights[at + 1], heights[at + SIDE], heights[at + SIDE + 1], px - x, py - y)


## The ground's normal at a point in cell coordinates, in scene axes (cell y is scene −Z), from the
## slope across `reach` cells either way.
func normal(px: float, py: float, reach: float = 0.5) -> Vector3:
	var east := (height(px + reach, py) - height(px - reach, py)) * SCALE / (2.0 * reach)
	var north := (height(px, py + reach) - height(px, py - reach)) * SCALE / (2.0 * reach)
	return Vector3(-east, 1.0, north).normalized()


## Corner heights of a block (displayed, elevation units): SIDE × SIDE values, row by row from the
## south, for corners (x0 − 1 … x0 + BLOCK + 1, y0 − 1 … y0 + BLOCK + 1). Cached.
func block_heights(block: Vector2i) -> PackedFloat32Array:
	var key := _wrap_block(block)
	var found: Variant = _cache.get(key)
	if found != null:
		var cached: PackedFloat32Array = found
		return cached
	var heights := _compute(key)
	_cache[key] = heights
	return heights


## The foundation of a pad standing at `base`: a wall along every side of the footprint whose ground
## lies lower than the floor (cut ground needs none).
func foundation(cells: Array[Vector2i], base: float) -> Array[Wall]:
	var walls: Array[Wall] = []
	var taken := {}
	for cell: Vector2i in cells:
		taken[cell] = true
	var sides: Array[Vector2i] = [Vector2i(0, -1), Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0)]
	for cell: Vector2i in cells:
		for side: Vector2i in sides:
			if taken.has(cell + side):
				continue
			var a: Vector2i
			var b: Vector2i
			match side:
				Vector2i(0, -1):
					a = cell
					b = cell + Vector2i(1, 0)
				Vector2i(1, 0):
					a = cell + Vector2i(1, 0)
					b = cell + Vector2i(1, 1)
				Vector2i(0, 1):
					a = cell + Vector2i(1, 1)
					b = cell + Vector2i(0, 1)
				_:
					a = cell + Vector2i(0, 1)
					b = cell
			var bottom_a := minf(corner(a.x, a.y), base)
			var bottom_b := minf(corner(b.x, b.y), base)
			if minf(bottom_a, bottom_b) > base - MIN_FOUNDATION:
				continue
			var wall := Wall.new()
			wall.a = a
			wall.b = b
			wall.top = base
			wall.bottom_a = bottom_a
			wall.bottom_b = bottom_b
			wall.outward = side
			walls.append(wall)
	return walls


## Which diagonal a cell is drawn with: true for the one from its south-west to its north-east
## corner, false for the other — the one across the smaller height difference, so a ridge or a cut
## edge runs along the triangles.
static func split(h00: float, h10: float, h01: float, h11: float) -> bool:
	return absf(h00 - h11) <= absf(h10 - h01)


## Height inside a cell at (fx, fy) 0..1 from its corners (south-west, south-east, north-west,
## north-east) on the cell's two triangles (split()).
static func surface_height(h00: float, h10: float, h01: float, h11: float, fx: float, fy: float) -> float:
	if split(h00, h10, h01, h11):
		if fx >= fy:
			return h00 + (h10 - h00) * fx + (h11 - h10) * fy
		return h00 + (h11 - h01) * fx + (h01 - h00) * fy
	if fx + fy <= 1.0:
		return h00 + (h10 - h00) * fx + (h01 - h00) * fy
	return h11 + (h01 - h11) * (1.0 - fx) + (h10 - h11) * (1.0 - fy)


## The ground's normal (scene axes) at corner (i, j) of a block's heights (block_heights; i, j
## 0..BLOCK), from its neighbours; `steepen` reads the slope that many times steeper (HILLSHADE).
static func corner_normal(heights: PackedFloat32Array, i: int, j: int, steepen: float = 1.0) -> Vector3:
	var at := (j + 1) * SIDE + i + 1
	var east := (heights[at + 1] - heights[at - 1]) * SCALE * 0.5 * steepen
	var north := (heights[at + SIDE] - heights[at - SIDE]) * SCALE * 0.5 * steepen
	return Vector3(-east, 1.0, north).normalized()


func _compute(block: Vector2i) -> PackedFloat32Array:
	var x0 := block.x * SurfaceBlocks.BLOCK
	var y0 := block.y * SurfaceBlocks.BLOCK
	# Cells x0 − 2 … x0 + BLOCK + 1: every cell next to a corner of the cache.
	var span := SIDE + 1
	var cells := PackedFloat32Array()
	cells.resize(span * span)
	var b := SurfaceBlocks.BLOCK
	var last_key := Vector2i(0x7FFFFFFF, 0)
	var patch: SurfacePatch = null
	for j: int in span:
		var y := y0 - 2 + j
		var by := floori(float(y) / b)
		for i: int in span:
			var x := WorldGrid.wrap_x(x0 - 2 + i, size_x)
			var key := Vector2i(floori(float(x) / b), by)
			if key != last_key:
				last_key = key
				patch = surface.patch(key)
			var value := patch.elevation(x, y) if patch != null else -1
			cells[j * span + i] = float(value) if value >= 0 else NAN
	var heights := PackedFloat32Array()
	heights.resize(SIDE * SIDE)
	var padded := _pad_blocks.has(block)
	for j: int in SIDE:
		var row := j * span
		for i: int in SIDE:
			var sum := 0.0
			var count := 0
			var value := cells[row + i]
			if not is_nan(value):
				sum += value
				count += 1
			value = cells[row + i + 1]
			if not is_nan(value):
				sum += value
				count += 1
			value = cells[row + span + i]
			if not is_nan(value):
				sum += value
				count += 1
			value = cells[row + span + i + 1]
			if not is_nan(value):
				sum += value
				count += 1
			var natural := sum / count if count > 0 else _fog(x0 - 1 + i, y0 - 1 + j)
			if padded:
				var found_pad: Variant = _pad_corners.get(Vector2i(WorldGrid.wrap_x(x0 - 1 + i, size_x), y0 - 1 + j))
				if found_pad != null:
					var pad: Vector2 = found_pad
					natural = shaped(natural, pad)
			heights[j * SIDE + i] = natural
	return heights


## The ground at a corner near a pad: `pad` is (base, distance in corners). On the footprint
## (distance 0) higher ground is cut down to the base and lower ground filled up by FILL of the
## difference; it eases back to `natural` over the BLEND corners around.
static func shaped(natural: float, pad: Vector2) -> float:
	var base := pad.x
	var target := minf(natural, base) + FILL * maxf(base - natural, 0.0)
	var weight := 1.0 - pad.y / (BLEND + 1.0)
	return natural + (target - natural) * weight


## Corners without any known cell: bilinear between the mean elevations of the blocks around.
func _fog(x: int, y: int) -> float:
	var u := (float(x) - SurfaceBlocks.BLOCK * 0.5) / SurfaceBlocks.BLOCK
	var v := (float(y) - SurfaceBlocks.BLOCK * 0.5) / SurfaceBlocks.BLOCK
	var bx := floori(u)
	var by := floori(v)
	var tx := u - bx
	var ty := v - by
	var low := lerpf(_mean_or_reference(Vector2i(bx, by)), _mean_or_reference(Vector2i(bx + 1, by)), tx)
	var high := lerpf(_mean_or_reference(Vector2i(bx, by + 1)), _mean_or_reference(Vector2i(bx + 1, by + 1)), tx)
	return lerpf(low, high, ty)


func _mean_or_reference(block: Vector2i) -> float:
	var key := _wrap_block(block)
	var mean: Variant = _means.get(key)
	if mean == null:
		mean = _block_mean(key)
		_means[key] = mean
	var value: float = mean
	return reference if is_nan(value) else value


func _block_mean(block: Vector2i) -> float:
	var patch := surface.patch(block)
	if patch == null:
		return NAN
	var sum := 0.0
	var count := 0
	var x0 := block.x * SurfaceBlocks.BLOCK
	var y0 := block.y * SurfaceBlocks.BLOCK
	for j: int in SurfaceBlocks.BLOCK:
		for i: int in SurfaceBlocks.BLOCK:
			var value := patch.elevation(x0 + i, y0 + j)
			if value >= 0:
				sum += value
				count += 1
	return sum / count if count > 0 else NAN


## Marks the corners of a pad's footprint (distance 0) and the ring around (up to BLEND); where pads
## meet, the nearer one wins, then the lower one.
func _add_pad(corners: Dictionary, pad: Pad) -> void:
	var taken := {}
	for cell: Vector2i in pad.cells:
		taken[cell] = true
	for cell: Vector2i in pad.cells:
		var inner := true
		for side: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1),
				Vector2i(1, 1), Vector2i(-1, 1), Vector2i(1, -1), Vector2i(-1, -1)]:
			if not taken.has(cell + side):
				inner = false
				break
		var reach := 0 if inner else BLEND
		for dy: int in range(-reach, reach + 2):
			for dx: int in range(-reach, reach + 2):
				var distance := maxi(_side_distance(dx), _side_distance(dy))
				var key := Vector2i(WorldGrid.wrap_x(cell.x + dx, size_x), cell.y + dy)
				var value := Vector2(pad.base, distance)
				var before: Variant = corners.get(key)
				if before == null:
					corners[key] = value
					continue
				var known: Vector2 = before
				if distance < known.y or (distance == known.y and pad.base < known.x):
					corners[key] = value


## How far a corner at offset `d` from a cell's south-west corner lies from that cell (0 for its own
## corners, d = 0 and d = 1).
static func _side_distance(d: int) -> int:
	if d < 0:
		return -d
	return maxi(d - 1, 0)


## Marks the blocks whose cache holds a corner.
func _touch_corner(touched: Dictionary, key: Vector2i) -> void:
	var b := SurfaceBlocks.BLOCK
	for by: int in range(ceili(float(key.y - b - 1) / b), floori(float(key.y + 1) / b) + 1):
		for bx: int in range(ceili(float(key.x - b - 1) / b), floori(float(key.x + 1) / b) + 1):
			touched[_wrap_block(Vector2i(bx, by))] = true


func _wrap_block(block: Vector2i) -> Vector2i:
	if size_x <= 0:
		return block
	@warning_ignore("integer_division")
	return Vector2i(posmod(block.x, size_x / SurfaceBlocks.BLOCK), block.y)
