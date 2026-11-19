class_name GalaxyView
extends Control
## Draws the galaxy from above and lets the player pan, zoom and tap systems.
##
## Galactic x points right, galactic y up; z is left out (the disk is thin). The view keeps a
## centre (galactic x, y) and a scale (units per canvas pixel). Three layers:
## - the glow: the galaxy's shape as one image (GalaxyShape.top_view), computed once;
## - stand-in stars: points sampled from the shape per grid cell (GalaxyShape.cell_points), so
##   every zoom between the whole galaxy and the neighbourhood shows a starfield; never tappable;
## - the real systems once the view is close (GalaxyCamera.SYSTEMS_FROM), coloured by temperature
##   and sized by luminosity.
## Points are MultiMesh instances in galactic coordinates under one Node2D whose transform is the
## camera, so a pan moves a transform instead of rebuilding thousands of points. Their size is set
## in pixels when the buffer is built and rebuilt when the zoom has moved far enough.
## On top, drawn each frame: home, own systems, the selected one, and a scale bar.
##
## Sight (draft.25): over the stars a veil (sight_veil.gdshader) darkens undiscovered space a
## little and lets the player's sight spheres glow at their rim — telescope spheres cyan, home and
## the systems of own structures faintly. Far out a sphere keeps a minimum size, so it stays a mark;
## the veil fades there, so the galaxy's shape stays. Telescope spheres get a thin ring and their
## range written on it. The veil takes no input: taps go to the systems as before.

## A system was tapped; "" for a tap beside every system.
signal system_tapped(system_id: String)
## The camera moved or zoomed.
signal moved

const TAP_SLOP := 18.0
## Stand-in stars: candidates per grid cell, and a salt so they differ from other uses.
const FIELD_TRIES := 64
const FIELD_SALT := 11
## Dot radius (px) of a stand-in star from dim to bright.
const FIELD_PX := Vector2(0.9, 2.2)
## Pixels of the glow image (computed once per galaxy, off the main thread).
const GLOW_PIXELS := 192
## The real stars' buffer is rebuilt when the zoom has changed by this factor since.
const REBUILD_FACTOR := 1.25
## The quad of a dot is this many times its radius (the soft edge of the dot texture).
const DOT_QUAD := 4.0
const LABEL_FONT_SIZE := 22
## Half the side of the box the points are culled by (units; larger than any galaxy view).
const CULL_EXTENT := 1.0e6
## Floats per instance: a 2D transform (8) and a colour (4).
const STRIDE := 12
## Sight spheres the veil takes at most (sight_veil.gdshader MAX_CIRCLES), the smallest radius
## (px) a sphere is drawn with, and from which radius a telescope sphere carries its range.
const SIGHT_CIRCLES := 48
## (Larger than the home ring, so far out a telescope sphere shows as a cyan halo around it.)
const SIGHT_MIN_PX := 24.0
const SIGHT_LABEL_PX := 70.0
## How strongly undiscovered space is veiled: close up, and over the whole galaxy.
const VEIL_NEAR := 0.45
const VEIL_FAR := 0.12
const SIGHT_SHADER := preload("res://game/map/sight_veil.gdshader")

var shape: GalaxyShape = null
## Systems marked on the map, also when no sphere is loaded: id → Entry (home, own systems).
var marks: Dictionary = {}
var home_id := ""
## The selected system; null when none.
var selected: GalaxySystems.Entry = null
## Own flights between systems: a line from start to end and a marker where they are now.
var trips: Array[TravelMotion] = []
## What the player has discovered; null while unknown (then nothing is veiled).
var sight: Sight = null

var _centre := Vector2.ZERO
var _units := 100.0
var _free := Rect2()
var _font: Font
var _glow: Texture2D = null
var _layer: Node2D
var _field: MultiMeshInstance2D
var _stars: MultiMeshInstance2D
var _overlay: Control
var _veil: ColorRect
var _veil_material: ShaderMaterial
## The sight circles as last given to the veil (view px: x, y, radius, kind).
var _circles: Array[Vector4] = []
var _entries: Array[GalaxySystems.Entry] = []
## The real stars' buffer as built (sizes for `_stars_units`).
var _star_buffer := PackedFloat32Array()
var _star_px := PackedFloat32Array()
var _per_area := 0.0
var _stars_units := 0.0
## Stand-in stars per cell (key Vector2i) for the cell size `_field_cell`.
var _field_cells: Dictionary = {}
var _field_cell := 0.0
var _field_range := Rect2i()
var _touches: Dictionary = {}
var _press_travel := 0.0
var _mouse_down := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	_font = get_theme_default_font()
	_layer = Node2D.new()
	add_child(_layer)
	var dot := _dot_texture()
	_field = _points_node(dot, CanvasItemMaterial.BLEND_MODE_ADD)
	_layer.add_child(_field)
	_stars = _points_node(dot, CanvasItemMaterial.BLEND_MODE_MIX)
	_layer.add_child(_stars)
	_veil = ColorRect.new()
	_veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_veil.color = Color.WHITE
	_veil_material = ShaderMaterial.new()
	_veil_material.shader = SIGHT_SHADER
	_veil_material.set_shader_parameter("veil_color", AppTheme.COLOR_BACKGROUND)
	_veil_material.set_shader_parameter("telescope_color", AppTheme.COLOR_ACCENT)
	_veil_material.set_shader_parameter("other_color", AppTheme.COLOR_TEXT)
	_veil.material = _veil_material
	_veil.visible = false
	add_child(_veil)
	_overlay = Control.new()
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.draw.connect(_draw_overlay)
	add_child(_overlay)
	resized.connect(_refresh)


## Draws the marks again (flights move every frame).
func redraw_marks() -> void:
	if _overlay != null:
		_overlay.queue_redraw()


## The galaxy to show; the view starts on the whole galaxy.
func show_galaxy(galaxy: GalaxyShape) -> void:
	shape = galaxy
	_field_cells.clear()
	_field_cell = 0.0
	show_all()


## The glow image of the galaxy (GalaxyShape.top_view), once it is ready.
func set_glow(texture: Texture2D) -> void:
	_glow = texture
	queue_redraw()


## The real systems to draw (loaded spheres) and how densely they lie seen from above (stars per
## unit², GalaxySystems.area_density): dense fields get smaller dots.
func set_systems(entries: Array[GalaxySystems.Entry], per_area: float) -> void:
	_entries = entries
	_per_area = per_area
	_build_stars()
	_refresh()


## What the player has discovered (null: unknown, nothing veiled).
func set_sight(value: Sight) -> void:
	sight = value
	_refresh()


## The part of the view the map may use (between the screen's bars), in view coordinates.
func set_free_area(area: Rect2) -> void:
	_free = area
	_refresh()


## Shows the whole galaxy.
func show_all() -> void:
	_centre = Vector2.ZERO
	_units = GalaxyCamera.fit_units_per_px(_area().size, _extent())
	_changed()


## Centres a point (galactic x, y) so that `radius` units are visible around it.
func look_at_point(point: Vector2, radius: float) -> void:
	_centre = point
	_units = GalaxyCamera.clamp_units_per_px(GalaxyCamera.units_per_px_for(_area().size, radius), _area().size, _extent())
	_changed()


## Centres a point without changing the zoom.
func centre_on(point: Vector2) -> void:
	_centre = point
	_changed()


func centre() -> Vector2:
	return _centre


func units_per_px() -> float:
	return _units


## Radius of the visible circle (units).
func visible_radius() -> float:
	return GalaxyCamera.visible_radius(_area().size, _units)


## Galactic point → view position.
func to_view(point: Vector2) -> Vector2:
	var offset := point - _centre
	return _area().get_center() + Vector2(offset.x, -offset.y) / _units


## View position → galactic point.
func to_galaxy(at: Vector2) -> Vector2:
	var offset := (at - _area().get_center()) * _units
	return _centre + Vector2(offset.x, -offset.y)


## Zooms by `factor` (>1 = closer) keeping the point under `at` in place.
func zoom_at(factor: float, at: Vector2) -> void:
	var anchor := to_galaxy(at)
	_units = GalaxyCamera.clamp_units_per_px(_units / factor, _area().size, _extent())
	var offset := (at - _area().get_center()) * _units
	_centre = anchor - Vector2(offset.x, -offset.y)
	_changed()


func pan(by: Vector2) -> void:
	_centre -= Vector2(by.x, -by.y) * _units
	_changed()


## The system under a tap at `at` (view coordinates): a real star when they show, else a marked
## system; generous, so small dots stay tappable.
func system_at(at: Vector2) -> String:
	var reach := AppTheme.TOUCH_MIN * 0.5 * _units
	var point := to_galaxy(at)
	if GalaxyCamera.shows_systems(visible_radius()):
		var index := GalaxySystems.pick(_entries, point, reach)
		if index >= 0:
			return _entries[index].id
	var best := ""
	var best_distance := reach
	for id: String in marks.keys():
		var entry: GalaxySystems.Entry = marks[id]
		var distance := Vector2(entry.position.x, entry.position.y).distance_to(point)
		if distance <= best_distance:
			best_distance = distance
			best = id
	return best


func _area() -> Rect2:
	return _free if _free.size != Vector2.ZERO else Rect2(Vector2.ZERO, size)


func _extent() -> float:
	return shape.view_extent() if shape != null else 50000.0


func _changed() -> void:
	if shape != null:
		var limit := _extent()
		_centre = _centre.limit_length(limit)
	_refresh()
	moved.emit()


## Moves the layers with the camera, rebuilds what the zoom made stale, redraws the marks.
func _refresh() -> void:
	if _layer == null:
		return
	var scale_now := 1.0 / _units
	var origin := _area().get_center() - Vector2(_centre.x, -_centre.y) * scale_now
	_layer.transform = Transform2D(Vector2(scale_now, 0.0), Vector2(0.0, -scale_now), origin)
	var seen := visible_radius()
	var far := GalaxyCamera.far_share(seen)
	_field.modulate.a = far
	_field.visible = far > 0.0
	_stars.visible = GalaxyCamera.shows_systems(seen) and not _entries.is_empty()
	_stars.modulate.a = 1.0 - 0.6 * far
	if _stars.visible and (_stars_units <= 0.0 or maxf(_units / _stars_units, _stars_units / _units) > REBUILD_FACTOR):
		_size_stars()
	if far > 0.0:
		_update_field(seen)
	_update_veil(seen)
	queue_redraw()
	_overlay.queue_redraw()


## The sight spheres on screen for the veil, and how strongly it veils at this zoom.
func _update_veil(seen: float) -> void:
	_circles.clear()
	if sight == null or shape == null:
		_veil.visible = false
		return
	var all: Array[Vector4] = []
	for observation: Sight.Observation in sight.observations:
		var at := to_view(Vector2(observation.centre.x, observation.centre.y) / shape.ly_per_unit)
		all.append(Vector4(at.x, at.y, Sight.radius_px(observation.radius_ly, shape.ly_per_unit, _units),
			1.0 if observation.is_telescope() else 0.0))
	_circles = Sight.pick_circles(all, Rect2(Vector2.ZERO, size), 40.0, SIGHT_CIRCLES, SIGHT_MIN_PX)
	var data := PackedVector4Array()
	for circle: Vector4 in _circles:
		data.append(circle)
	data.resize(SIGHT_CIRCLES)
	_veil.visible = true
	_veil_material.set_shader_parameter("circles", data)
	_veil_material.set_shader_parameter("count", _circles.size())
	_veil_material.set_shader_parameter("rect_size", size)
	var whole := GalaxyCamera.visible_radius(_area().size, GalaxyCamera.fit_units_per_px(_area().size, _extent()))
	_veil_material.set_shader_parameter("veil", Sight.veil_share(seen, GalaxyCamera.SYSTEMS_FROM, whole, VEIL_NEAR, VEIL_FAR))


# --- layers ---------------------------------------------------------------------------------

## A soft round dot: bright middle, fading edge.
func _dot_texture() -> Texture2D:
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 0.22, 0.5, 1.0])
	gradient.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, 0.9), Color(1, 1, 1, 0.25), Color(1, 1, 1, 0)])
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1.0, 0.5)
	texture.width = 64
	texture.height = 64
	return texture


func _points_node(texture: Texture2D, blend: CanvasItemMaterial.BlendMode) -> MultiMeshInstance2D:
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_2D
	multimesh.use_colors = true
	multimesh.mesh = quad
	# The whole galaxy: the canvas culls by this box and does not see buffer changes otherwise.
	multimesh.custom_aabb = AABB(Vector3(-CULL_EXTENT, -CULL_EXTENT, -1.0), Vector3(2.0 * CULL_EXTENT, 2.0 * CULL_EXTENT, 2.0))
	var node := MultiMeshInstance2D.new()
	node.multimesh = multimesh
	node.texture = texture
	var material := CanvasItemMaterial.new()
	material.blend_mode = blend
	node.material = material
	return node


## One instance: a dot of `radius_px` at (x, y) in colour `color`, its size for `units` per px.
static func _append_dot(buffer: PackedFloat32Array, x: float, y: float, radius_px: float, units: float, color: Color) -> void:
	var side := radius_px * DOT_QUAD * units
	buffer.append_array([side, 0.0, 0.0, x, 0.0, side, 0.0, y, color.r, color.g, color.b, color.a])


func _set_buffer(node: MultiMeshInstance2D, buffer: PackedFloat32Array) -> void:
	var multimesh := node.multimesh
	multimesh.instance_count = 0
	multimesh.instance_count = int(buffer.size() / float(STRIDE))
	if multimesh.instance_count > 0:
		multimesh.buffer = buffer
	node.queue_redraw()


## The real stars' colours and positions; sizes follow in `_size_stars`.
func _build_stars() -> void:
	_star_buffer = PackedFloat32Array()
	_star_px = PackedFloat32Array()
	for entry: GalaxySystems.Entry in _entries:
		var radius_px := GalaxySystems.star_px(entry.luminosity)
		_append_dot(_star_buffer, entry.position.x, entry.position.y, radius_px, _units, SkyLight.star_color(entry.kelvin))
		_star_px.append(radius_px)
	_stars_units = 0.0


## Sets every star's size for the current zoom from the spacing of the stars on screen: dense
## fields get small, slightly faded dots, a handful of neighbours larger ones.
func _size_stars() -> void:
	var spacing := GalaxyCamera.spacing_px(_per_area, _units)
	var factor := GalaxyCamera.star_scale(spacing) * DOT_QUAD * _units
	var alpha := clampf(spacing / 12.0, 0.6, 1.0)
	for index: int in _star_px.size():
		var side := _star_px[index] * factor
		_star_buffer[index * STRIDE] = side
		_star_buffer[index * STRIDE + 5] = side
		_star_buffer[index * STRIDE + 11] = alpha
	_stars_units = _units
	_set_buffer(_stars, _star_buffer)


## The stand-in stars of the visible cells (and one cell around), from a cache per cell.
func _update_field(seen: float) -> void:
	if shape == null:
		return
	var cell := GalaxyCamera.cell_size(seen)
	if cell != _field_cell:
		_field_cell = cell
		_field_cells.clear()
		_field_range = Rect2i()
	var corner_a := to_galaxy(_area().position)
	var corner_b := to_galaxy(_area().end)
	var low := Vector2i(floori(minf(corner_a.x, corner_b.x) / cell) - 1, floori(minf(corner_a.y, corner_b.y) / cell) - 1)
	var high := Vector2i(floori(maxf(corner_a.x, corner_b.x) / cell) + 1, floori(maxf(corner_a.y, corner_b.y) / cell) + 1)
	var wanted := Rect2i(low, high - low + Vector2i.ONE)
	if wanted == _field_range:
		return
	_field_range = wanted
	# Pixels per unit at the middle of this cell size's zoom range: the dots keep their size
	# while the cell size stays.
	var units := cell * 8.0 / maxf(_area().size.length() * 0.5, 1.0)
	var buffer := PackedFloat32Array()
	var kept := {}
	for cell_y: int in range(low.y, high.y + 1):
		for cell_x: int in range(low.x, high.x + 1):
			var key := Vector2i(cell_x, cell_y)
			var points: PackedFloat32Array
			if _field_cells.has(key):
				points = _field_cells[key]
			else:
				points = _cell_buffer(cell_x, cell_y, cell, units)
			kept[key] = points
			buffer.append_array(points)
	_field_cells = kept
	_set_buffer(_field, buffer)


func _cell_buffer(cell_x: int, cell_y: int, cell: float, units: float) -> PackedFloat32Array:
	var buffer := PackedFloat32Array()
	# One tint per cell: it changes slowly, and per point it would double the work.
	var tint := shape.tint((cell_x + 0.5) * cell, (cell_y + 0.5) * cell)
	for point: Vector3 in shape.cell_points(cell_x, cell_y, cell, FIELD_TRIES, FIELD_SALT):
		var color := tint
		color.a = 0.35 + 0.65 * point.z
		_append_dot(buffer, point.x, point.y, lerpf(FIELD_PX.x, FIELD_PX.y, point.z), units, color)
	return buffer


# --- drawing --------------------------------------------------------------------------------

func _draw() -> void:
	if _glow == null or shape == null:
		return
	var extent := shape.view_extent()
	var top_left := to_view(Vector2(-extent, extent))
	var side := 2.0 * extent / _units
	draw_texture_rect(_glow, Rect2(top_left, Vector2(side, side)), false, Color(1, 1, 1, GalaxyCamera.glow_share(visible_radius())))


## Marks over the stars: own systems, home ("you are here"), the selected system, a scale bar.
func _draw_overlay() -> void:
	if shape == null:
		return
	var near := GalaxyCamera.shows_systems(visible_radius())
	_draw_sight()
	for id: String in marks.keys():
		if id == home_id:
			continue
		var entry: GalaxySystems.Entry = marks[id]
		var at := _view_of(entry)
		_overlay.draw_arc(at, 12.0, 0.0, TAU, 40, Color(AppTheme.COLOR_OK, 0.85), 2.0, true)
		if near and (selected == null or selected.id != id):
			_label(at + Vector2(0.0, 20.0), entry.name, AppTheme.COLOR_OK)
	if marks.has(home_id):
		var home: GalaxySystems.Entry = marks[home_id]
		var at := _view_of(home)
		_overlay.draw_arc(at, 14.0, 0.0, TAU, 48, AppTheme.COLOR_OK, 3.0, true)
		if not near:
			# Far out a pin above the ring, so home stands out against the bright disk.
			_overlay.draw_line(at + Vector2(0.0, -14.0), at + Vector2(0.0, -40.0), AppTheme.COLOR_OK, 3.0, true)
			_overlay.draw_circle(at + Vector2(0.0, -46.0), 7.0, AppTheme.COLOR_OK)
		if selected == null or selected.id != home_id:
			var text := tr("GALAXY_YOU_ARE_HERE") if not near else tr("GALAXY_HOME_LABEL").format({"name": home.name})
			_label(at + Vector2(0.0, 22.0), text, AppTheme.COLOR_OK)
	if selected != null:
		var at := _view_of(selected)
		_overlay.draw_arc(at, 20.0, 0.0, TAU, 48, AppTheme.COLOR_ACCENT, 3.0, true)
		# Above the ring: home and own systems carry their names below.
		_label(at + Vector2(0.0, -28.0 - LABEL_FONT_SIZE - 4.0), selected.name, AppTheme.COLOR_ACCENT)
	_draw_trips()
	_draw_scale_bar()


## A thin cyan ring along each telescope sphere the veil shows, with its range at the top once it is
## large enough to carry the text.
func _draw_sight() -> void:
	for circle: Vector4 in _circles:
		if circle.w < 0.5:
			continue
		var centre := Vector2(circle.x, circle.y)
		var segments := clampi(roundi(circle.z / 4.0), 32, 512)
		_overlay.draw_arc(centre, circle.z, 0.0, TAU, segments, Color(AppTheme.COLOR_ACCENT, 0.55), 2.0, true)
		# While a system is selected its name is what counts there.
		if circle.z < SIGHT_LABEL_PX or selected != null:
			continue
		# Just outside the ring at its top, so it covers none of the discovered stars; only where the
		# bars leave room for it.
		var spot := centre + Vector2(0.0, -circle.z - LABEL_FONT_SIZE - 10.0)
		if not _area().grow(-8.0).has_point(spot):
			continue
		var ly := circle.z * _units * shape.ly_per_unit
		_label(spot, tr("SIGHT_RING_LABEL").format({"ly": Sight.ly_text(ly)}), AppTheme.COLOR_ACCENT)


## Flights between systems: a dashed line from start to end, a cyan diamond where they are now.
func _draw_trips() -> void:
	if trips.is_empty() or shape == null:
		return
	var now := Services.clock.now_ms()
	for motion: TravelMotion in trips:
		var ends := TravelTrack.galaxy_ends(motion, shape.ly_per_unit)
		if ends.size() == 2:
			_overlay.draw_dashed_line(to_view(ends[0]), to_view(ends[1]), Color(AppTheme.COLOR_ACCENT, 0.6), 2.0, 10.0)
		var at := to_view(TravelTrack.galaxy_point(motion, now, shape.ly_per_unit))
		var points := PackedVector2Array([at + Vector2(0, -10), at + Vector2(10, 0), at + Vector2(0, 10), at + Vector2(-10, 0)])
		_overlay.draw_colored_polygon(points, AppTheme.COLOR_ACCENT)


func _view_of(entry: GalaxySystems.Entry) -> Vector2:
	return to_view(Vector2(entry.position.x, entry.position.y))


## A name centred below `at`, outlined against the stars.
func _label(at: Vector2, text: String, color: Color) -> void:
	var width := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, LABEL_FONT_SIZE).x
	var spot := Vector2(at.x - width * 0.5, at.y + _font.get_ascent(LABEL_FONT_SIZE))
	_overlay.draw_string_outline(_font, spot, text, HORIZONTAL_ALIGNMENT_LEFT, -1, LABEL_FONT_SIZE, 6, AppTheme.COLOR_BACKGROUND)
	_overlay.draw_string(_font, spot, text, HORIZONTAL_ALIGNMENT_LEFT, -1, LABEL_FONT_SIZE, color)


## A bar of a round length (1, 2 or 5 × 10ⁿ light years) at the lower left of the free area.
func _draw_scale_bar() -> void:
	var length := GalaxyCamera.scale_length(_units * 160.0 * shape.ly_per_unit)
	var pixels := length / shape.ly_per_unit / _units
	var left := Vector2(_area().position.x + 24.0, _area().end.y - 24.0)
	var color := Color(AppTheme.COLOR_TEXT, 0.8)
	_overlay.draw_line(left, left + Vector2(pixels, 0.0), color, 2.0)
	_overlay.draw_line(left + Vector2(0.0, -8.0), left + Vector2(0.0, 0.0), color, 2.0)
	_overlay.draw_line(left + Vector2(pixels, -8.0), left + Vector2(pixels, 0.0), color, 2.0)
	var text := tr("GALAXY_SCALE").format({"ly": AmountFormat.units(roundi(length))})
	var spot := left + Vector2(0.0, -14.0)
	_overlay.draw_string_outline(_font, spot, text, HORIZONTAL_ALIGNMENT_LEFT, -1, LABEL_FONT_SIZE, 6, AppTheme.COLOR_BACKGROUND)
	_overlay.draw_string(_font, spot, text, HORIZONTAL_ALIGNMENT_LEFT, -1, LABEL_FONT_SIZE, color)


# --- input ----------------------------------------------------------------------------------

func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			_touches[touch.index] = touch.position
			if _touches.size() == 1:
				_press_travel = 0.0
		else:
			var was_single := _touches.size() == 1
			_touches.erase(touch.index)
			if was_single and _press_travel < TAP_SLOP:
				system_tapped.emit(system_at(touch.position))
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
				zoom_at(new_distance / old_distance, (drag.position + other) * 0.5)
			_touches[drag.index] = drag.position
			_press_travel = TAP_SLOP
		else:
			_touches[drag.index] = drag.position
			_press_travel += drag.relative.length()
			pan(drag.relative)
		accept_event()
	elif event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if button.device == InputEvent.DEVICE_ID_EMULATION:
			return
		match button.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				if button.pressed:
					zoom_at(1.25, button.position)
			MOUSE_BUTTON_WHEEL_DOWN:
				if button.pressed:
					zoom_at(1.0 / 1.25, button.position)
			MOUSE_BUTTON_LEFT:
				if button.pressed:
					_mouse_down = true
					_press_travel = 0.0
				else:
					_mouse_down = false
					if _press_travel < TAP_SLOP:
						system_tapped.emit(system_at(button.position))
		accept_event()
	elif event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		if motion.device == InputEvent.DEVICE_ID_EMULATION or not _mouse_down:
			return
		_press_travel += motion.relative.length()
		pan(motion.relative)
		accept_event()
	elif event is InputEventMagnifyGesture:
		var gesture := event as InputEventMagnifyGesture
		zoom_at(gesture.factor, gesture.position)
		accept_event()
