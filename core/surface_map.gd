class_name SurfaceMap
extends RefCounted
## A flat map of a whole body's surface grid seen from above (the probe target picker): cells to
## screen points and back, panning and zooming. x wraps around the body (`size_x` cells), y is the
## band from −size_y/2 to size_y/2 with north up. Cells are 10 m; a body is millions of cells
## wide, so the map is never drawn cell by cell.

## Closest zoom: cells per screen pixel.
const MIN_CELLS_PER_PX := 20.0

var size_x := 0
var size_y := 0
## The cell in the middle of the view (x not wrapped while panning; y clamped to the band).
var centre := Vector2.ZERO
## Cells per screen pixel.
var cells_per_px := 100.0
## The view's size in pixels.
var view_size := Vector2(720, 720)


func _init(width: int = 0, height: int = 0) -> void:
	size_x = width
	size_y = height


## The farthest zoom: the whole width of the body fills the view.
func max_cells_per_px() -> float:
	return maxf(float(size_x) / maxf(view_size.x, 1.0), MIN_CELLS_PER_PX)


func set_zoom(value: float) -> void:
	cells_per_px = clampf(value, MIN_CELLS_PER_PX, max_cells_per_px())
	_clamp_centre()


## Zooms by a factor (< 1 closer) keeping the cell under `anchor` (a screen point) in place.
func zoom_at(factor: float, anchor: Vector2) -> void:
	var before := to_cell_f(anchor)
	set_zoom(cells_per_px * factor)
	var after := to_cell_f(anchor)
	centre += before - after
	_clamp_centre()


## Moves the view by a drag of `delta` pixels (the map follows the finger).
func pan(delta: Vector2) -> void:
	centre += Vector2(-delta.x, delta.y) * cells_per_px
	_clamp_centre()


## The screen point of a cell, on the copy of the body nearest to the middle of the view.
func to_screen(cell: Vector2) -> Vector2:
	var dx := cell.x - centre.x
	if size_x > 0:
		dx = fposmod(dx + size_x * 0.5, float(size_x)) - size_x * 0.5
	return view_size * 0.5 + Vector2(dx, -(cell.y - centre.y)) / cells_per_px


## The cell (fractional) under a screen point; x not wrapped.
func to_cell_f(point: Vector2) -> Vector2:
	var offset := (point - view_size * 0.5) * cells_per_px
	return Vector2(centre.x + offset.x, centre.y - offset.y)


## The cell under a screen point: x wrapped onto the body, y kept in the band.
func to_cell(point: Vector2) -> Vector2i:
	var cell := to_cell_f(point)
	var x := floori(cell.x)
	var y := floori(cell.y)
	if size_x > 0:
		x = posmod(x, size_x)
	if size_y > 0:
		@warning_ignore("integer_division")
		var half := size_y / 2
		y = clampi(y, -half, half)
	return Vector2i(x, y)


## A length in cells as pixels at this zoom.
func pixels(cells: float) -> float:
	return cells / cells_per_px


## Spacing of grid lines in cells: a round number (1, 2 or 5 × a power of ten) at least
## `min_px` pixels apart.
func grid_step(min_px: float) -> int:
	var wanted := maxf(min_px * cells_per_px, 1.0)
	var power := pow(10.0, floorf(log(wanted) / log(10.0)))
	for factor: float in [1.0, 2.0, 5.0, 10.0]:
		if power * factor >= wanted:
			return int(power * factor)
	return int(power * 10.0)


## Keeps the middle within the band (half a view beyond its edges at most).
func _clamp_centre() -> void:
	if size_y > 0:
		var half := size_y * 0.5
		centre.y = clampf(centre.y, -half, half)
	if size_x > 0:
		centre.x = fposmod(centre.x, float(size_x))
