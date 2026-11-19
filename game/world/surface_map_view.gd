class_name SurfaceMapView
extends Control
## A whole body's surface as a flat map seen from above (SurfaceMap): unexplored ground as dark
## fog with a survey grid, the explored areas (RevealMap) filled with their border, the player's
## structures (cyan), foreign structures seen by probes (amber squares, snapshots), probes under
## way to this body (amber dashed circles) and the chosen target with the area a probe would
## explore (cyan). Drag pans, pinch or the wheel zooms, a tap chooses a cell (`cell_tapped`).

signal cell_tapped(cell: Vector2i)

const TAP_SLOP := 18.0
const COLOR_FOG := Color(0.07, 0.085, 0.115)
## The noise over the fog (multiplied in), and how large one texel is drawn.
const COLOR_FOG_GRAIN := Color(0.17, 0.20, 0.26, 0.5)
const NOISE_SCALE := 3.0
const NOISE_SIZE := 128

## Grey, seamless noise for the fog, made once.
static var _noise: NoiseTexture2D = null
const COLOR_GRID := Color(0.133, 0.827, 0.933, 0.10)
const COLOR_SCALE_TEXT := Color(0.612, 0.639, 0.686, 0.9)
const COLOR_BAND_EDGE := Color(0.612, 0.639, 0.686, 0.35)
const COLOR_BEYOND := Color(0.02, 0.025, 0.04)
const COLOR_EXPLORED := Color(0.204, 0.827, 0.600, 0.22)
const COLOR_EXPLORED_EDGE := Color(0.204, 0.827, 0.600, 0.85)
const COLOR_OWN := AppTheme.COLOR_ACCENT
const COLOR_SEEN := AppTheme.COLOR_PENDING
const COLOR_TARGET := AppTheme.COLOR_ACCENT
const COLOR_TARGET_FILL := Color(0.133, 0.827, 0.933, 0.12)
## Smallest radius (px) an area or a mark is drawn with, so far out it stays findable.
const MIN_MARK_PX := 3.0
const GRID_MIN_PX := 90.0
const CIRCLE_POINTS := 48

var map := SurfaceMap.new()
var reveal: RevealMap = null
## Cells of the player's structures here (their origins).
var own: Array[Vector2i] = []
## Probes under way to this body.
var probes: Array[Probes.Probe] = []
## The chosen target; null while none is.
var target: Variant = null
## Radius (cells) drawn around the target.
var target_radius := Probes.RADIUS

var _touches: Dictionary = {}
var _travel := 0.0
var _mouse_down := false


func _init() -> void:
	clip_contents = true
	texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	mouse_filter = Control.MOUSE_FILTER_STOP
	resized.connect(func() -> void:
		map.view_size = size
		map.set_zoom(map.cells_per_px)
		queue_redraw())
	# The noise is made in the background: draw again once it is there.
	_fog_noise().changed.connect(queue_redraw)


## Shows a body of `size_x` × `size_y` cells around a cell, `cells_across` cells wide.
func show_body(size_x: int, size_y: int, around: Vector2i, cells_across: float) -> void:
	map.size_x = size_x
	map.size_y = size_y
	map.view_size = size if size.x > 0.0 else map.view_size
	map.centre = Vector2(around)
	map.set_zoom(cells_across / maxf(map.view_size.x, 1.0))
	queue_redraw()


func look_at(cell: Vector2i) -> void:
	map.centre = Vector2(cell)
	map.set_zoom(map.cells_per_px)
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), COLOR_FOG)
	# Grainy fog like the 3D view's, moving with the map.
	var noise := _fog_noise()
	var tile := Vector2(NOISE_SIZE, NOISE_SIZE) * NOISE_SCALE
	var shift := Vector2(fposmod(-map.centre.x / map.cells_per_px, tile.x), fposmod(map.centre.y / map.cells_per_px, tile.y))
	draw_set_transform(shift - tile, 0.0, Vector2(NOISE_SCALE, NOISE_SCALE))
	draw_texture_rect(noise, Rect2(Vector2.ZERO, (size + tile * 2.0) / NOISE_SCALE), true, COLOR_FOG_GRAIN)
	draw_set_transform(Vector2.ZERO)
	_draw_grid()
	_draw_band_edges()
	if reveal != null:
		for area: RevealMap.Area in reveal.areas:
			_draw_area(area)
	for probe: Probes.Probe in probes:
		var at := map.to_screen(Vector2(probe.x, probe.y))
		_dashed_circle(at, maxf(map.pixels(probe.radius), MIN_MARK_PX * 2.0), COLOR_SEEN)
		draw_circle(at, 5.0, COLOR_SEEN)
	if reveal != null:
		for sighting: RevealMap.Sighting in reveal.sightings:
			var at := map.to_screen(Vector2(sighting.x, sighting.y))
			var side := maxf(map.pixels(sighting.footprint_side()), 12.0)
			var box := Rect2(at - Vector2(side, side) * 0.5, Vector2(side, side))
			draw_rect(box, Color(COLOR_SEEN, 0.25))
			draw_rect(box, COLOR_SEEN, false, 2.0)
	for cell: Vector2i in own:
		var at := map.to_screen(Vector2(cell))
		draw_circle(at, 9.0, AppTheme.COLOR_BACKGROUND)
		draw_circle(at, 7.0, COLOR_OWN)
	if target != null:
		var cell: Vector2i = target
		var at := map.to_screen(Vector2(cell))
		var radius := maxf(map.pixels(target_radius), MIN_MARK_PX * 3.0)
		draw_circle(at, radius, COLOR_TARGET_FILL)
		draw_arc(at, radius, 0.0, TAU, CIRCLE_POINTS, COLOR_TARGET, 3.0, true)
		for direction: Vector2 in [Vector2.RIGHT, Vector2.LEFT, Vector2.UP, Vector2.DOWN]:
			draw_line(at + direction * 10.0, at + direction * 26.0, COLOR_TARGET, 3.0, true)
		draw_circle(at, 4.0, COLOR_TARGET)


static func _fog_noise() -> NoiseTexture2D:
	if _noise == null:
		var source := FastNoiseLite.new()
		source.frequency = 0.035
		source.fractal_octaves = 3
		_noise = NoiseTexture2D.new()
		_noise.width = NOISE_SIZE
		_noise.height = NOISE_SIZE
		_noise.seamless = true
		_noise.noise = source
	return _noise


## Lines of longitude and latitude at a round spacing.
func _draw_grid() -> void:
	var step := map.grid_step(GRID_MIN_PX)
	var top_left := map.to_cell_f(Vector2.ZERO)
	var bottom_right := map.to_cell_f(size)
	var x := floorf(top_left.x / step) * step
	while x <= bottom_right.x:
		var sx := map.to_screen(Vector2(x, 0.0)).x
		draw_line(Vector2(sx, 0.0), Vector2(sx, size.y), COLOR_GRID, 2.0)
		x += step
	var y := floorf(bottom_right.y / step) * step
	while y <= top_left.y:
		var sy := map.to_screen(Vector2(map.centre.x, y)).y
		draw_line(Vector2(0.0, sy), Vector2(size.x, sy), COLOR_GRID, 2.0)
		y += step
	# The spacing in kilometres (a cell is 10 m), bottom left.
	var font := get_theme_default_font()
	@warning_ignore("integer_division")
	var whole_km := step / 100
	var text := tr("PROBE_MAP_GRID").format({"km": AmountFormat.units(whole_km) if step >= 100 else String.num(step / 100.0, 1)})
	draw_string(font, Vector2(16.0, size.y - 16.0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, AppTheme.FONT_SIZE_SMALL, COLOR_SCALE_TEXT)


## The band's edges (north and south): beyond them nothing can be reached.
func _draw_band_edges() -> void:
	if map.size_y <= 0:
		return
	var half := map.size_y * 0.5
	var north := map.to_screen(Vector2(map.centre.x, half)).y
	var south := map.to_screen(Vector2(map.centre.x, -half)).y
	if north > 0.0:
		draw_rect(Rect2(0.0, 0.0, size.x, north), COLOR_BEYOND)
		draw_line(Vector2(0.0, north), Vector2(size.x, north), COLOR_BAND_EDGE, 2.0)
	if south < size.y:
		draw_rect(Rect2(0.0, south, size.x, size.y - south), COLOR_BEYOND)
		draw_line(Vector2(0.0, south), Vector2(size.x, south), COLOR_BAND_EDGE, 2.0)


## An explored capsule: filled, with its outline.
func _draw_area(area: RevealMap.Area) -> void:
	var start := map.to_screen(Vector2(area.x0, area.y0))
	var end := start + Vector2(WorldGrid.wrapped_delta(area.x0, area.x1, map.size_x), -(area.y1 - area.y0)) / map.cells_per_px
	var radius := maxf(map.pixels(area.radius), MIN_MARK_PX)
	var reach := Rect2(start, Vector2.ZERO).expand(end).grow(radius)
	if not reach.intersects(Rect2(Vector2.ZERO, size)):
		return
	draw_circle(start, radius, COLOR_EXPLORED)
	if start.distance_to(end) > 0.5:
		draw_circle(end, radius, COLOR_EXPLORED)
		var across := (end - start).normalized().orthogonal() * radius
		draw_colored_polygon(PackedVector2Array([start + across, end + across, end - across, start - across]), COLOR_EXPLORED)
		draw_line(start + across, end + across, COLOR_EXPLORED_EDGE, 2.0, true)
		draw_line(start - across, end - across, COLOR_EXPLORED_EDGE, 2.0, true)
		var turn := (end - start).angle()
		draw_arc(start, radius, turn + PI * 0.5, turn + PI * 1.5, CIRCLE_POINTS, COLOR_EXPLORED_EDGE, 2.0, true)
		draw_arc(end, radius, turn - PI * 0.5, turn + PI * 0.5, CIRCLE_POINTS, COLOR_EXPLORED_EDGE, 2.0, true)
	else:
		draw_arc(start, radius, 0.0, TAU, CIRCLE_POINTS, COLOR_EXPLORED_EDGE, 2.0, true)


func _dashed_circle(at: Vector2, radius: float, color: Color) -> void:
	var dashes := 24
	for index: int in dashes:
		var from := TAU * index / dashes
		draw_arc(at, radius, from, from + TAU / dashes * 0.55, 6, color, 2.0, true)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			_touches[touch.index] = touch.position
			if _touches.size() == 1:
				_travel = 0.0
		else:
			var single := _touches.size() == 1
			_touches.erase(touch.index)
			if single and _travel < TAP_SLOP:
				_tap(touch.position)
		accept_event()
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if _touches.size() >= 2 and _touches.has(drag.index):
			var other := Vector2.ZERO
			for index: int in _touches.keys():
				if index != drag.index:
					other = _touches[index]
					break
			var before: Vector2 = _touches[drag.index]
			var old_distance := before.distance_to(other)
			var new_distance := drag.position.distance_to(other)
			if old_distance > 1.0 and new_distance > 1.0:
				map.zoom_at(old_distance / new_distance, (drag.position + other) * 0.5)
			_travel = TAP_SLOP
		else:
			_travel += drag.relative.length()
			map.pan(drag.relative)
		_touches[drag.index] = drag.position
		queue_redraw()
		accept_event()
	elif event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if button.device == InputEvent.DEVICE_ID_EMULATION:
			return
		match button.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				map.zoom_at(0.8, button.position)
			MOUSE_BUTTON_WHEEL_DOWN:
				map.zoom_at(1.25, button.position)
			MOUSE_BUTTON_LEFT:
				_mouse_down = button.pressed
				if button.pressed:
					_travel = 0.0
				elif _travel < TAP_SLOP:
					_tap(button.position)
		queue_redraw()
		accept_event()
	elif event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		if motion.device == InputEvent.DEVICE_ID_EMULATION or not _mouse_down:
			return
		_travel += motion.relative.length()
		map.pan(motion.relative)
		queue_redraw()
		accept_event()
	elif event is InputEventMagnifyGesture:
		map.zoom_at(1.0 / (event as InputEventMagnifyGesture).factor, (event as InputEventMagnifyGesture).position)
		queue_redraw()


func _tap(point: Vector2) -> void:
	cell_tapped.emit(map.to_cell(point))
