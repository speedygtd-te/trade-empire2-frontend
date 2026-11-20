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
## Where the difference reaches WALL_HEIGHT the edge gets retaining walls instead (placed by
## RetainingWalls): on the low side the foundation becomes a buttressed retaining wall
## (Wall.retaining); on the high side a ring cell whose ground rises that much is levelled at the
## base (a terrace, levelled_base) and a wall along its outer edges holds back the natural ground,
## which runs on at its own height right up to the wall's top (cut_walls). Lower edges keep the
## plain foundation and the soft cut.
##
## Water (a water biome, LevelRules.is_water_biome) lies flat at the body's sea level
## (`water_level`, WaterColumn.sea_level) instead of following the hills of its elevation, which
## describe the sea floor; every corner touching water lies at the sea level and is never shaped by
## a pad. A structure counts a water cell of its footprint DECK above the sea (base_of), so it
## stands clear of the water on a pier (Piers) where its edge lies over water (corner_wet). NAN
## keeps every cell at its own elevation.
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
## From this height difference (cells) at a structure's edge on, retaining walls stand there
## (Rudi 2026-11-20: from three quarters of a cell).
const WALL_HEIGHT := 0.75
## The same in elevation units.
const WALL := WALL_HEIGHT / SCALE
## A structure's footprint counts its water cells this far above the sea level (elevation units):
## over water it stands on a pier this high (Rudi 2026-11-20).
const DECK := 3.0
## Corners per side of a block's cache: the block's BLOCK + 1 and one more on each side (normals).
const SIDE := SurfaceBlocks.BLOCK + 3
## The ground is lit as if its slopes were this much steeper than drawn (a hillshade): most of the
## surface rises only a unit or two per cell, which the sun alone would hardly show.
const HILLSHADE := 3.0
## The four sides of a cell (south, east, north, west).
const SIDES: Array[Vector2i] = [Vector2i(0, -1), Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0)]


## A structure standing on the ground: its ground footprint (absolute cells) and the elevation its
## floor stands at.
class Pad:
	extends RefCounted
	var cells: Array[Vector2i] = []
	var base := 0.0

	func _init(footprint: Array[Vector2i] = [], elevation: float = 0.0) -> void:
		cells = footprint
		base = elevation


## One cell edge of a wall, from corner `a` to corner `b` (absolute; seen from the side its face
## looks to, `a` is on the left), from its top down to its foot at either end (elevation units).
## `outward`: the step (cell x, cell y) its face looks towards. A foundation (foundation()) runs
## along a footprint's edge from the floor down to the ground and looks away from it; `retaining`
## where it is tall enough for a retaining wall. A cut wall (cut_walls(), `cut`) holds back higher
## ground at the outer edge of a terrace: from the ground there down to the base, looking towards
## the terrace. `top` is the higher of `top_a` and `top_b`.
class Wall:
	extends RefCounted
	var a := Vector2i.ZERO
	var b := Vector2i.ZERO
	var top := 0.0
	var top_a := 0.0
	var top_b := 0.0
	var bottom_a := 0.0
	var bottom_b := 0.0
	var outward := Vector2i.ZERO
	var retaining := false
	var cut := false


var surface: SurfaceBlocks
## Whether retaining walls and terraces are made (off: plain foundations and soft cuts everywhere,
## as before them; for measuring). Takes effect with the next set of pads.
var walls := true
## Body width in cells (wraps in x); 0 = no wrapping.
var size_x := 0
## Elevation at scene height 0, and whether it was set (the fog's level until then).
var reference := 500.0
## Elevation water is drawn at (WaterColumn.sea_level); NAN: water keeps its own. Takes effect for
## heights computed after it is set (clear() drops the cache).
var water_level := NAN
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
var _pads: Array[Pad] = []
## Terrace cells (x wrapped, y) → the base they are levelled at; and per block (block → cells).
var _levelled: Dictionary = {}
var _levelled_blocks: Dictionary = {}


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


## The mean elevation of the known cells among `cells` (absolute), water cells DECK above the sea;
## NAN when none is known.
func base_of(cells: Array[Vector2i]) -> float:
	var sum := 0.0
	var count := 0
	for cell: Vector2i in cells:
		var found := surface.cell(cell.x, cell.y)
		if found != null:
			sum += _drawn(found)
			if not is_nan(water_level) and LevelRules.is_water_biome(found.biome):
				sum += DECK
			count += 1
	return sum / count if count > 0 else NAN


## Whether a loaded cell is water drawn flat at the sea level (false without a sea level).
func is_water(x: int, y: int) -> bool:
	if is_nan(water_level):
		return false
	var found := surface.cell(WorldGrid.wrap_x(x, size_x), y)
	return found != null and LevelRules.is_water_biome(found.biome)


## Whether corner (x, y) touches water (one of the four cells around it is_water): it lies at the
## sea level.
func corner_wet(x: int, y: int) -> bool:
	return is_water(x - 1, y - 1) or is_water(x, y - 1) or is_water(x - 1, y) or is_water(x, y)


## The elevation a loaded cell is drawn at: water flat at the sea level (WaterColumn.drawn_elevation).
func _drawn(found: SurfacePatch.Cell) -> float:
	return WaterColumn.drawn_elevation(found.elevation, LevelRules.is_water_biome(found.biome), water_level)


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
	_pads = pads.duplicate()
	return _apply_pads()


## Ground arrived in some blocks: the terraces of the pads near them are decided again (they hang
## on the natural ground beside the footprints). Returns the blocks whose heights changed.
func refresh_pads(blocks: Array[Vector2i]) -> Dictionary:
	if _pads.is_empty() or blocks.is_empty():
		return {}
	var wanted := {}
	for block: Vector2i in blocks:
		wanted[_wrap_block(block)] = true
	var b := SurfaceBlocks.BLOCK
	for pad: Pad in _pads:
		if pad.cells.is_empty():
			continue
		var low := pad.cells[0]
		var high := pad.cells[0]
		for cell: Vector2i in pad.cells:
			low = low.min(cell)
			high = high.max(cell)
		# The ring and the cells around its corners reach two cells out.
		for by: int in range(floori(float(low.y - 2) / b), floori(float(high.y + 2) / b) + 1):
			for bx: int in range(floori(float(low.x - 2) / b), floori(float(high.x + 2) / b) + 1):
				if wanted.has(_wrap_block(Vector2i(bx, by))):
					return _apply_pads()
	return {}


## The base a terrace cell is levelled at (elevation units); NAN for any other cell.
func levelled_base(x: int, y: int) -> float:
	var found: Variant = _levelled.get(Vector2i(WorldGrid.wrap_x(x, size_x), y))
	if found == null:
		return NAN
	var base: float = found
	return base


## The terrace cells of a block (wrapped as block_heights takes it): cell (x wrapped, y) → base.
func levelled_in_block(block: Vector2i) -> Dictionary:
	var found: Variant = _levelled_blocks.get(_wrap_block(block))
	return {} if found == null else found as Dictionary


func _apply_pads() -> Dictionary:
	var corners := {}
	for pad: Pad in _pads:
		_add_pad(corners, pad)
	var levelled := _terraces(corners)
	var touched := {}
	for key: Vector2i in corners.keys():
		if _pad_corners.get(key) != corners[key]:
			_touch_corner(touched, key)
	for key: Vector2i in _pad_corners.keys():
		if not corners.has(key):
			_touch_corner(touched, key)
	for key: Vector2i in levelled.keys():
		if _levelled.get(key) != levelled[key]:
			touched[_block_of_cell(key)] = true
	for key: Vector2i in _levelled.keys():
		if not levelled.has(key):
			touched[_block_of_cell(key)] = true
	_pad_corners = corners
	_levelled = levelled
	_levelled_blocks.clear()
	for key: Vector2i in levelled.keys():
		var block := _block_of_cell(key)
		if not _levelled_blocks.has(block):
			_levelled_blocks[block] = {}
		var in_block: Dictionary = _levelled_blocks[block]
		in_block[key] = levelled[key]
	# Blocks a pad may reach: those around its bounding box (cheaper than every corner).
	_pad_blocks.clear()
	for pad: Pad in _pads:
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
	if not _levelled.is_empty():
		# A terrace is flat at its base.
		var levelled: Variant = _levelled.get(Vector2i(wx, y))
		if levelled != null:
			return levelled
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
## lies lower than the floor (cut ground needs none). A side is `retaining` where the ground lies
## WALL or more below the floor at either end, and so is a lower side between two retaining ones
## if its ground lies at least half that low (no single plain gap in a retaining wall).
func foundation(cells: Array[Vector2i], base: float) -> Array[Wall]:
	var sides: Array[Wall] = []
	var taken := {}
	for cell: Vector2i in cells:
		taken[cell] = true
	for cell: Vector2i in cells:
		for side: Vector2i in SIDES:
			if taken.has(cell + side):
				continue
			var ends := _edge(cell, side)
			var a := ends[0]
			var b := ends[1]
			var bottom_a := minf(corner(a.x, a.y), base)
			var bottom_b := minf(corner(b.x, b.y), base)
			if minf(bottom_a, bottom_b) > base - MIN_FOUNDATION:
				continue
			var wall := Wall.new()
			wall.a = a
			wall.b = b
			wall.top = base
			wall.top_a = base
			wall.top_b = base
			wall.bottom_a = bottom_a
			wall.bottom_b = bottom_b
			wall.outward = side
			wall.retaining = walls and base - minf(bottom_a, bottom_b) >= WALL
			sides.append(wall)
	# Corner → the walls ending there.
	var at := {}
	for wall: Wall in sides:
		for end: Vector2i in [wall.a, wall.b]:
			if not at.has(end):
				at[end] = []
			var ending: Array = at[end]
			ending.append(wall)
	var promoted: Array[Wall] = []
	for wall: Wall in sides:
		if wall.retaining or base - minf(wall.bottom_a, wall.bottom_b) < WALL * 0.5:
			continue
		if _retaining_beside(at, wall, wall.a) and _retaining_beside(at, wall, wall.b):
			promoted.append(wall)
	for wall: Wall in promoted:
		wall.retaining = true
	return sides


## The walls holding back the higher ground beside a pad standing at `base`: along every edge of
## its terrace cells (levelled_base) that borders neither the footprint nor another terrace cell,
## from the ground there (the corner heights, which the ground beyond runs on from) down to the
## base, looking towards the terrace. Where the terrace ends beside lower ground the wall runs back
## to the footprint, falling to the base there.
func cut_walls(cells: Array[Vector2i], base: float) -> Array[Wall]:
	var found: Array[Wall] = []
	var taken := {}
	for cell: Vector2i in cells:
		taken[cell] = true
	var seen := {}
	for cell: Vector2i in cells:
		for dy: int in [-1, 0, 1]:
			for dx: int in [-1, 0, 1]:
				var terrace := cell + Vector2i(dx, dy)
				if taken.has(terrace) or seen.has(terrace):
					continue
				seen[terrace] = true
				var level := levelled_base(terrace.x, terrace.y)
				if is_nan(level) or absf(level - base) > 0.001:
					continue
				for side: Vector2i in SIDES:
					var beyond := terrace + side
					if taken.has(beyond) or absf(levelled_base(beyond.x, beyond.y) - base) <= 0.001:
						continue
					# Seen from the terrace, looking at the wall: the edge's ends swap.
					var ends := _edge(terrace, side)
					var a := ends[1]
					var b := ends[0]
					var top_a := maxf(corner(a.x, a.y), base)
					var top_b := maxf(corner(b.x, b.y), base)
					if maxf(top_a, top_b) < base + MIN_FOUNDATION:
						continue
					var wall := Wall.new()
					wall.a = a
					wall.b = b
					wall.top_a = top_a
					wall.top_b = top_b
					wall.top = maxf(top_a, top_b)
					wall.bottom_a = base
					wall.bottom_b = base
					wall.outward = -side
					wall.retaining = true
					wall.cut = true
					found.append(wall)
	return found


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
	# Which cells are water (drawn flat at the sea level): a corner with only water around is
	# never shaped by a pad, or a structure reaching into the sea would raise a hill of water.
	var wet := PackedByteArray()
	wet.resize(span * span)
	var b := SurfaceBlocks.BLOCK
	var last_key := Vector2i(0x7FFFFFFF, 0)
	var patch: SurfacePatch = null
	var flatten := not is_nan(water_level)
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
			if value < 0:
				cells[j * span + i] = NAN
			elif flatten and patch.is_water(x, y):
				cells[j * span + i] = WaterColumn.drawn_elevation(value, true, water_level)
				wet[j * span + i] = 1
			else:
				cells[j * span + i] = float(value)
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
			# A corner touching water lies at the sea level, so the water surface stays flat up to
			# the shore (no rise towards the land); the bank climbs from there. Never shaped by a pad,
			# or a structure reaching into the sea would raise a hill of water.
			var touches_water := wet[row + i] + wet[row + i + 1] + wet[row + span + i] + wet[row + span + i + 1] > 0
			if touches_water:
				natural = water_level
			if padded and not touches_water:
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
				sum += WaterColumn.drawn_elevation(value, patch.is_water(x0 + i, y0 + j), water_level)
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


## The terrace cells of every pad (cell → base), and the corners along their walls set to the
## natural ground in `corners` (the ground beyond runs up to the wall's top). A ring cell (beside a
## footprint, not on any, nor beside another pad's) becomes a terrace where the natural ground at its
## corners off the footprint lies WALL or more above the base on average; a ring cell between two
## terrace cells joins them from half that height, and a cell beside a footprint's corner only joins
## a terrace beside it (or two), so the wall runs on around the corner.
func _terraces(corners: Dictionary) -> Dictionary:
	var levelled := {}
	if _pads.is_empty() or not walls:
		return levelled
	# Footprint cell → the pad standing there.
	var owners := {}
	for pad: Pad in _pads:
		for cell: Vector2i in pad.cells:
			owners[Vector2i(WorldGrid.wrap_x(cell.x, size_x), cell.y)] = pad
	for pad: Pad in _pads:
		if pad.cells.is_empty():
			continue
		var edge_ring: Array[Vector2i] = []
		var corner_ring: Array[Vector2i] = []
		# Ring cell (x wrapped, y) → whether it lies beside a footprint cell (not only at a corner).
		# Found on a grid of the footprint's bounding box (a ring of one cell around): far cheaper
		# than looking up every cell's neighbours in a dictionary.
		var rings := {}
		var low := pad.cells[0]
		var high := pad.cells[0]
		for cell: Vector2i in pad.cells:
			low = low.min(cell)
			high = high.max(cell)
		var width := high.x - low.x + 3
		var height_cells := high.y - low.y + 3
		var grid := PackedByteArray()
		grid.resize(width * height_cells)
		for cell: Vector2i in pad.cells:
			grid[(cell.y - low.y + 1) * width + cell.x - low.x + 1] = 1
		for j: int in height_cells:
			for i: int in width:
				var at := j * width + i
				if grid[at] == 1:
					continue
				var side := (i > 0 and grid[at - 1] == 1) or (i < width - 1 and grid[at + 1] == 1) \
					or (j > 0 and grid[at - width] == 1) or (j < height_cells - 1 and grid[at + width] == 1)
				var diagonal := false
				if not side:
					diagonal = (i > 0 and j > 0 and grid[at - width - 1] == 1) or (i < width - 1 and j > 0 and grid[at - width + 1] == 1) \
						or (i > 0 and j < height_cells - 1 and grid[at + width - 1] == 1) \
						or (i < width - 1 and j < height_cells - 1 and grid[at + width + 1] == 1)
				if not side and not diagonal:
					continue
				var ring := Vector2i(WorldGrid.wrap_x(low.x - 1 + i, size_x), low.y - 1 + j)
				if not owners.has(ring):
					rings[ring] = side
		for ring: Vector2i in rings.keys():
			if levelled.has(ring) or _beside_other(owners, ring, pad):
				continue
			if rings[ring] == true:
				edge_ring.append(ring)
			else:
				corner_ring.append(ring)
		var rise := {}
		for ring: Vector2i in rings.keys():
			rise[ring] = _ring_rise(owners, pad, ring)
		var mine := {}
		for ring: Vector2i in edge_ring:
			if rise[ring] >= WALL:
				mine[ring] = true
		var joined: Array[Vector2i] = []
		for ring: Vector2i in edge_ring:
			if not mine.has(ring) and rise[ring] >= WALL * 0.5 and _terraces_beside(mine, ring) >= 2:
				joined.append(ring)
		for ring: Vector2i in joined:
			mine[ring] = true
		for ring: Vector2i in corner_ring:
			var beside := _terraces_beside(mine, ring)
			if beside >= 2 or (beside == 1 and rise[ring] >= WALL):
				mine[ring] = true
		for ring: Vector2i in mine.keys():
			levelled[ring] = pad.base
			# The corners off the footprint carry the natural ground (the wall's top).
			for offset: Vector2i in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]:
				var key := Vector2i(WorldGrid.wrap_x(ring.x + offset.x, size_x), ring.y + offset.y)
				var known: Variant = corners.get(key)
				if known != null and (known as Vector2).y == 0.0:
					continue
				corners[key] = Vector2(pad.base, BLEND + 1.0)
	return levelled


## How far the natural ground at a ring cell's corners off its pad's footprint lies above the
## pad's base on average (elevation units).
func _ring_rise(owners: Dictionary, pad: Pad, ring: Vector2i) -> float:
	var sum := 0.0
	var count := 0
	for offset: Vector2i in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]:
		var key := ring + offset
		var on_footprint := false
		for cell_offset: Vector2i in [Vector2i(0, 0), Vector2i(-1, 0), Vector2i(0, -1), Vector2i(-1, -1)]:
			var cell := key + cell_offset
			if owners.get(Vector2i(WorldGrid.wrap_x(cell.x, size_x), cell.y)) == pad:
				on_footprint = true
				break
		if on_footprint:
			continue
		sum += _natural_corner(key.x, key.y)
		count += 1
	return sum / count - pad.base if count > 0 else -INF


## Whether a cell lies beside (or on) the footprint of a pad other than `pad`.
func _beside_other(owners: Dictionary, cell: Vector2i, pad: Pad) -> bool:
	for dy: int in [-1, 0, 1]:
		for dx: int in [-1, 0, 1]:
			var found: Variant = owners.get(Vector2i(WorldGrid.wrap_x(cell.x + dx, size_x), cell.y + dy))
			if found != null and found != pad:
				return true
	return false


## How many of a cell's four neighbours are in `terraces`.
func _terraces_beside(terraces: Dictionary, cell: Vector2i) -> int:
	var count := 0
	for side: Vector2i in SIDES:
		if terraces.has(Vector2i(WorldGrid.wrap_x(cell.x + side.x, size_x), cell.y + side.y)):
			count += 1
	return count


## The natural height of corner (x, y): the mean of the known cells around it, else the fog's.
func _natural_corner(x: int, y: int) -> float:
	var sum := 0.0
	var count := 0
	for offset: Vector2i in [Vector2i(-1, -1), Vector2i(0, -1), Vector2i(-1, 0), Vector2i(0, 0)]:
		var found := surface.cell(x + offset.x, y + offset.y)
		if found != null:
			sum += _drawn(found)
			count += 1
	return sum / count if count > 0 else _fog(x, y)


## Whether a retaining foundation wall other than `wall` ends at corner `end`.
static func _retaining_beside(at: Dictionary, wall: Wall, end: Vector2i) -> bool:
	var ending: Array = at.get(end, [])
	for other: Wall in ending:
		if other != wall and other.retaining:
			return true
	return false


## The ends of a cell's side (SIDES) as corners: seen from outside the cell, the left one first.
static func _edge(cell: Vector2i, side: Vector2i) -> Array[Vector2i]:
	match side:
		Vector2i(0, -1):
			return [cell, cell + Vector2i(1, 0)]
		Vector2i(1, 0):
			return [cell + Vector2i(1, 0), cell + Vector2i(1, 1)]
		Vector2i(0, 1):
			return [cell + Vector2i(1, 1), cell + Vector2i(0, 1)]
	return [cell + Vector2i(0, 1), cell]


func _block_of_cell(cell: Vector2i) -> Vector2i:
	return _wrap_block(Vector2i(floori(float(cell.x) / SurfaceBlocks.BLOCK), floori(float(cell.y) / SurfaceBlocks.BLOCK)))


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
