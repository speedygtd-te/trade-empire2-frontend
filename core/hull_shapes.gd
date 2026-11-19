class_name HullShapes
extends RefCounted
## Hulls placed as a shape (like V1, without circles): the player drags from a start cell to an
## end cell and the filled rectangle between them, or a square, becomes a batch of new hulls.
##
## Every cell of the shape gets a fate: a cell that already has a hull of an own structure is
## simply ignored (dragging over the structure extends it partly); a cell of a foreign structure
## or in the 3×3×3 zone around one blocks the whole shape; a cell where a hull cannot stand (grid,
## height limit, environment, overhang, the docks) or that has no way to the structure (an
## island) is skipped. The rest is placed in an order in which every new hull touches the
## structure or an earlier new hull, as the server checks them one after the other.
##
## Cells are absolute cells of the body, all on one level (the start cell's). The surface wraps in
## x: the shape goes the short way round, and its cells stay unwrapped next to the start cell, as
## the cells of the structures are. Only a preview: the server decides.

enum Shape { SINGLE, RECTANGLE, SQUARE }

## Longest side of a shape: 31 × 31 = 961 cells keeps a whole shape within one batch (1000 ops).
const MAX_SIDE := 31

const _NEIGHBOURS: Array[Vector3i] = [
	Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0),
	Vector3i(0, -1, 0), Vector3i(0, 0, 1), Vector3i(0, 0, -1),
]


## What a shape would do, cell by cell.
class Plan:
	extends RefCounted
	## Every cell of the shape.
	var cells: Array[Vector3i] = []
	## Side lengths of the shape (x, y).
	var extent := Vector2i.ONE
	## The new hulls in the order they go to the server.
	var place: Array[Vector3i] = []
	## Cells that already have a hull of an own structure: ignored.
	var own: Array[Vector3i] = []
	## Cells of a foreign structure or in the zone around one: they block the shape.
	var foreign: Array[Vector3i] = []
	## Cells left out → why (BuildRules.Verdict): those against the cell rules in the order of the
	## shape, then the islands (NOT_CONNECTED).
	var skipped: Dictionary = {}

	## Whether a foreign structure is in the way.
	func blocked() -> bool:
		return not foreign.is_empty()

	## Whether the shape can be sent with `units` hulls in the store.
	func buildable(units: int) -> bool:
		return not place.is_empty() and not blocked() and place.size() <= units

	## The cells drawn red: the foreign ones and the skipped ones.
	func bad_cells() -> Array[Vector3i]:
		var result: Array[Vector3i] = []
		result.append_array(foreign)
		for cell: Vector3i in skipped.keys():
			result.append(cell)
		return result

	## The reasons cells are skipped, the most frequent first (ties in the order of `skipped`).
	func reasons() -> Array[BuildRules.Verdict]:
		var counts: Dictionary = {}
		var order: Array[BuildRules.Verdict] = []
		for cell: Vector3i in skipped.keys():
			var verdict: BuildRules.Verdict = skipped[cell]
			if not counts.has(verdict):
				counts[verdict] = 0
				order.append(verdict)
			counts[verdict] = Wire.as_int(counts[verdict]) + 1
		var ranked: Array[BuildRules.Verdict] = order.duplicate()
		ranked.sort_custom(func(a: BuildRules.Verdict, b: BuildRules.Verdict) -> bool:
			var count_a := Wire.as_int(counts[a])
			var count_b := Wire.as_int(counts[b])
			return count_a > count_b or (count_a == count_b and order.find(a) < order.find(b)))
		return ranked

	## How many cells are skipped for `verdict`.
	func count_of(verdict: BuildRules.Verdict) -> int:
		var count := 0
		for cell: Vector3i in skipped.keys():
			if skipped[cell] == verdict:
				count += 1
		return count


## Side lengths (x, y) of the shape from `start` to `end`: SINGLE is one cell, RECTANGLE spans
## both corners, SQUARE takes the longer side for both. At most MAX_SIDE (and the body's width).
static func extent(shape: Shape, start: Vector3i, end: Vector3i, size_x: int = 0) -> Vector2i:
	if shape == Shape.SINGLE:
		return Vector2i.ONE
	var width := absi(WorldGrid.wrapped_delta(start.x, end.x, size_x)) + 1
	var height := absi(end.y - start.y) + 1
	if shape == Shape.SQUARE:
		width = maxi(width, height)
		height = width
	var longest := mini(MAX_SIDE, size_x) if size_x > 0 else MAX_SIDE
	return Vector2i(mini(width, longest), mini(height, MAX_SIDE))


## Cells of the shape from `start` towards `end` on the start cell's level, row by row from the
## start cell (a square grows in the direction of the drag).
static func cells(shape: Shape, start: Vector3i, end: Vector3i, size_x: int = 0) -> Array[Vector3i]:
	var span := extent(shape, start, end, size_x)
	var step_x := -1 if WorldGrid.wrapped_delta(start.x, end.x, size_x) < 0 else 1
	var step_y := -1 if end.y < start.y else 1
	var result: Array[Vector3i] = []
	for row: int in span.y:
		for column: int in span.x:
			result.append(Vector3i(start.x + column * step_x, start.y + row * step_y, start.z))
	return result


## The fate of every cell of `shape_cells` for hulls of `hull_type` on the structure `host`.
## `guests`: the host's guests (their cells are taken; a cell that would found or extend one is
## skipped, the Single tool places those; they carry hulls above them). `neighbours`: further own
## structures drawn here (their cells are taken). `foreign`: absolute cells known to be foreign
## or next to a foreign structure (cell → true). `definitions` and `site` check the cell rules
## (LevelRules.check_hull_cell); without them only places, overhang and the way are checked.
static func plan(shape_cells: Array[Vector3i], host: StructureLayout, guests: Array[StructureLayout],
		neighbours: Array[StructureLayout], foreign: Dictionary, hull_type: String,
		definitions: GameDefinitions = null, site: LevelRules.Site = null) -> Plan:
	var result := Plan.new()
	result.cells = shape_cells
	result.extent = _extent_of(shape_cells)
	var carriers: Array[StructureLayout] = [host]
	carriers.append_array(guests)
	var candidates: Dictionary = {}
	for cell: Vector3i in shape_cells:
		if _taken(host, guests, neighbours, cell):
			result.own.append(cell)
			continue
		if foreign.has(cell):
			result.foreign.append(cell)
			continue
		var verdict := _cell_verdict(host, guests, carriers, cell, hull_type, definitions, site)
		if verdict != BuildRules.Verdict.OK:
			result.skipped[cell] = verdict
			continue
		candidates[cell] = true
	# Outward from the structure: the cells touching it first, then their free neighbours.
	var queue: Array[Vector3i] = []
	var reached: Dictionary = {}
	for cell: Vector3i in shape_cells:
		if candidates.has(cell) and _touches(host, cell):
			reached[cell] = true
			queue.append(cell)
	var head := 0
	while head < queue.size():
		var at := queue[head]
		head += 1
		for step: Vector3i in _NEIGHBOURS:
			var next := at + step
			if candidates.has(next) and not reached.has(next):
				reached[next] = true
				queue.append(next)
	result.place = queue
	for cell: Vector3i in shape_cells:
		if candidates.has(cell) and not reached.has(cell):
			result.skipped[cell] = BuildRules.Verdict.NOT_CONNECTED
	return result


## The build ops of new hulls of `hull_type` at absolute `cells`, in their order (whole numbers).
static func place_ops(hull_type: String, cells_to_place: Array[Vector3i]) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for cell: Vector3i in cells_to_place:
		result.append({"op": "placeHull", "hullType": hull_type, "x": cell.x, "y": cell.y, "z": cell.z})
	return result


## Whether an own structure has a hull at the absolute cell.
static func _taken(host: StructureLayout, guests: Array[StructureLayout], neighbours: Array[StructureLayout],
		cell: Vector3i) -> bool:
	if DockRules.owner_at(host, guests, host.to_local(cell)) != 0:
		return true
	for other: StructureLayout in neighbours:
		if not other.hull_at(other.to_local(cell)).is_empty():
			return true
	return false


## The rules of one free cell, without the way to the structure: it would stay with the host (not
## found or extend a guest), the cell rules, the overhang.
static func _cell_verdict(host: StructureLayout, guests: Array[StructureLayout], carriers: Array[StructureLayout],
		cell: Vector3i, hull_type: String, definitions: GameDefinitions, site: LevelRules.Site) -> BuildRules.Verdict:
	if DockRules.placement(host, guests, host.to_local(cell)) != DockRules.Placement.HOST:
		return BuildRules.Verdict.GUEST_PLACEMENT
	if definitions != null and site != null:
		var verdict := LevelRules.check_hull_cell(definitions, hull_type, cell, site)
		if verdict != BuildRules.Verdict.OK:
			return verdict
	if not LevelRules.overhang_ok(carriers, cell):
		return BuildRules.Verdict.OVERHANG_EXCEEDED
	return BuildRules.Verdict.OK


## Whether a hull of the host lies face to face with the absolute cell.
static func _touches(host: StructureLayout, cell: Vector3i) -> bool:
	var local := host.to_local(cell)
	for step: Vector3i in _NEIGHBOURS:
		if not host.hull_at(local + step).is_empty():
			return true
	return false


static func _extent_of(shape_cells: Array[Vector3i]) -> Vector2i:
	if shape_cells.is_empty():
		return Vector2i.ZERO
	var low := Vector2i(shape_cells[0].x, shape_cells[0].y)
	var high := low
	for cell: Vector3i in shape_cells:
		low = low.min(Vector2i(cell.x, cell.y))
		high = high.max(Vector2i(cell.x, cell.y))
	return high - low + Vector2i.ONE
