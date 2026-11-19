class_name GlowField
extends RefCounted
## How close every spot around a structure lies to it, for the glow its lamps cast on the ground
## at night (StructureGlowLayer): a small grid of `per_cell` × `per_cell` samples per cell over the
## footprint and `margin` cells around it. A sample is 1 on the footprint and falls off in a
## straight line to 0 at `margin` cells from its edge (Euclidean, so corners round off and an L
## keeps its shape); the shader turns that into the soft fall-off. Pure logic, no scene.

## The grid of one footprint. Sample (i, j) covers cell x low.x + i / per_cell, cell y
## low.y + j / per_cell; `values` holds them row by row (j), 0..255.
class Field:
	## The cell at the grid's low corner (its smallest x and y, margin included); x lies next to
	## the footprint's first cell, unwrapped.
	var low := Vector2i.ZERO
	## Size of the grid in cells (footprint's extent plus the margin on every side).
	var cells := Vector2i.ZERO
	var per_cell := 1
	var values := PackedByteArray()

	## Width and height of the grid in samples.
	func samples() -> Vector2i:
		return cells * per_cell

	## Closeness of sample (i, j), 0..1.
	func at(i: int, j: int) -> float:
		return values[j * cells.x * per_cell + i] / 255.0

	func is_empty() -> bool:
		return values.is_empty()


## The grid for a footprint (cells x, y; duplicates allowed). On a surface `size_x` cells wide
## (0: no wrap) cells beyond the seam are brought next to the first one. An empty footprint gives
## an empty field.
static func build(footprint: Array[Vector2i], margin: int, per_cell: int, size_x: int = 0) -> Field:
	var field := Field.new()
	field.per_cell = maxi(per_cell, 1)
	if footprint.is_empty():
		return field
	margin = maxi(margin, 1)
	var own: Dictionary = {}
	var reference := footprint[0].x
	var low := Vector2i(1 << 30, 1 << 30)
	var high := -low
	for cell: Vector2i in footprint:
		var placed := Vector2i(WorldGrid.unwrap_x(cell.x, reference, size_x), cell.y)
		own[placed] = true
		low = low.min(placed)
		high = high.max(placed)
	field.low = low - Vector2i(margin, margin)
	field.cells = high - low + Vector2i.ONE + Vector2i(2 * margin, 2 * margin)
	var p := field.per_cell
	var width := field.cells.x * p
	var height := field.cells.y * p
	field.values.resize(width * height)
	field.values.fill(0)

	# Closeness of a sample to one cell, by its offset in samples from the cell's low corner; the
	# reach is the cell and the margin around it. The nearest point of the footprint always lies
	# on a cell with an open side, so only those are stamped; cells inside are simply full.
	var reach := (1 + 2 * margin) * p
	var kernel := PackedByteArray()
	kernel.resize(reach * reach)
	for b: int in reach:
		for a: int in reach:
			var x := (a + 0.5) / p - margin
			var y := (b + 0.5) / p - margin
			var dx := maxf(maxf(-x, x - 1.0), 0.0)
			var dy := maxf(maxf(-y, y - 1.0), 0.0)
			var closeness := 1.0 - sqrt(dx * dx + dy * dy) / margin
			kernel[b * reach + a] = clampi(roundi(closeness * 255.0), 0, 255)
	var sides: Array[Vector2i] = [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]
	for cell: Vector2i in own.keys():
		var start := (cell - low) * p
		var open := false
		for side: Vector2i in sides:
			if not own.has(cell + side):
				open = true
				break
		if not open:
			for j: int in range(start.y + margin * p, start.y + margin * p + p):
				for i: int in range(start.x + margin * p, start.x + margin * p + p):
					field.values[j * width + i] = 255
			continue
		for b: int in reach:
			var row := (start.y + b) * width + start.x
			var kernel_row := b * reach
			for a: int in reach:
				var value := kernel[kernel_row + a]
				if value > field.values[row + a]:
					field.values[row + a] = value
	return field
