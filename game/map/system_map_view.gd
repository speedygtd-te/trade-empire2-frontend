class_name SystemMapView
extends Control
## Draws a star system from above (SystemMap) and lets the player pan, zoom and tap bodies.
##
## Bodies are drawn, not sprites: a disc in the colour of its type, lit from the star's side, so
## every marker scales cleanly from the overview to a single moon system and costs no assets.
## V1 had only one generic planet sprite, which would not tell the types apart.
##
## The view keeps a centre (map point in the middle of the free area) and a zoom (canvas pixels
## per map unit). Moons appear once their rings are far enough apart to be told from each other;
## before that a faint ring around the planet says it has moons. Names are placed greedily by
## importance and left out where they would overlap.
##
## When the star sends them (draft.30), its habitable zone lies under the orbits as a soft
## emerald band and its frost line as a thin dashed blue ring, both on the orbits' scale
## (SystemMap.ring_of_au), and its catalog designation stands small in the lower right corner.

## A body was tapped; "" for a tap beside every body.
signal body_tapped(body_id: String)
## A tap where several bodies lie under the finger, none clearly the one meant: the nearest few,
## nearest first, to choose from.
signal bodies_tapped(body_ids: PackedStringArray)

## Moons show once their rings are this many pixels apart.
const MOON_SHOW_PX := 6.0
## Smallest drawn marker radius (px) per kind, so even a tiny body stays visible.
const MIN_PLANET_PX := 6.0
const MIN_MOON_PX := 3.0
const MIN_BELT_BODY_PX := 4.0
## Zoom limits: from a bit more than the whole system to moon rings this far apart (px).
const MAX_MOON_STEP_PX := 72.0
const LABEL_FONT_SIZE := 22
## Smaller, muted texts: the star's catalog designation and the zones' names.
const NOTE_FONT_SIZE := 20
## Distance of the catalog designation from the free area's lower right corner.
const CATALOG_INSET := 20.0
## The habitable zone: fill and edges (emerald: where life is fine); the frost line (blue as ice;
## depiction, not a UI meaning) with its dash length (px).
const HABITABLE_FILL := Color(0.204, 0.827, 0.600, 0.10)
const HABITABLE_EDGE := Color(0.204, 0.827, 0.600, 0.30)
const HABITABLE_TEXT := Color(0.45, 0.80, 0.65)
const FROST_COLOR := Color(0.55, 0.75, 1.0, 0.65)
const FROST_TEXT := Color(0.62, 0.78, 1.0)
const FROST_DASH_PX := 10.0
## Most dashes drawn for the frost line; close up the dashes grow instead.
const FROST_MAX_DASHES := 240
## Dots that draw an asteroid belt's band.
const BELT_DOTS := 420
## Colour of each body type on the map (depiction only, not a UI meaning).
const BODY_COLORS := {
	"EARTH_LIKE": Color(0.36, 0.72, 0.48),
	"DESERT": Color(0.85, 0.62, 0.30),
	"OCEAN": Color(0.26, 0.48, 0.86),
	"ICE": Color(0.66, 0.80, 0.94),
	"VOLCANIC": Color(0.78, 0.36, 0.24),
	"BARREN": Color(0.58, 0.58, 0.60),
	"TOXIC": Color(0.64, 0.76, 0.28),
	"GAS_GIANT": Color(0.78, 0.62, 0.46),
	"ICE_GIANT": Color(0.46, 0.76, 0.84),
	"ASTEROID_M": Color(0.62, 0.60, 0.58),
	"ASTEROID_C": Color(0.42, 0.40, 0.38),
	"ASTEROID_S": Color(0.58, 0.50, 0.42),
	"MOON_ROCKY": Color(0.64, 0.62, 0.60),
	"MOON_ICY": Color(0.74, 0.86, 0.94),
	"MOON_VOLCANIC": Color(0.86, 0.56, 0.30),
}
const UNKNOWN_COLOR := Color(0.6, 0.6, 0.6)

var map: SystemMap = null
## Game time (seconds) the map shows.
var time_s := 0.0
## The selected body; "" when none.
var selected := ""
## The player's home body and the bodies with own structures (id → true).
var home_body := ""
var marked: Dictionary = {}
## Own structures resting in orbit: body id → how many.
var orbiting: Dictionary = {}
## Own flights under way (galaxy frame); drawn where they start and end in this system.
var trips: Array[TravelMotion] = []
## Light years per coordinate unit and the system's position (coordinate units), for placing
## the trips' points (TravelTrack).
var ly_per_unit := 1.0
var system_position := Vector3.ZERO

var _centre := Vector2.ZERO
var _zoom := 1.0
var _fit_zoom := 1.0
## The view shows the whole system (fit) and was not moved since: it fits again when the free area
## changes (e.g. the details below close a frame later).
var _fitted := false
## Part of the view not covered by the screen's bars, in view coordinates.
var _free := Rect2()
var _font: Font
var _tap := MapTap.new()
var _backdrop := PackedVector2Array()
var _belt_dots := PackedVector2Array()
## The backdrop's stars as one mesh for the view's size; the belts' bands as one mesh each (belt id →
## ArrayMesh) for _belt_zoom, turned and placed when drawn. Built again when the size or zoom
## changes, not every frame.
var _backdrop_mesh: ArrayMesh = null
var _backdrop_size := Vector2.ZERO
var _belt_meshes: Dictionary = {}
var _belt_zoom := 0.0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	_font = get_theme_default_font()
	var random := RandomNumberGenerator.new()
	random.seed = 7
	for index: int in 160:
		_backdrop.append(Vector2(random.randf(), random.randf()))
	# The belt band: an angle and a spread (−1..1) per dot.
	for index: int in BELT_DOTS:
		_belt_dots.append(Vector2(random.randf() * TAU, random.randf_range(-1.0, 1.0)))


## Shows a system; the view fits it into the free area.
func show_map(system: SystemMap) -> void:
	map = system
	_belt_meshes.clear()
	fit()


## The part of the view the map may use (between the screen's bars), in view coordinates.
func set_free_area(area: Rect2) -> void:
	var first := _free.size == Vector2.ZERO
	_free = area
	_fit_zoom = _zoom_to_fit()
	if first or _fitted:
		fit()
	queue_redraw()


## Shows the whole system.
func fit() -> void:
	_fit_zoom = _zoom_to_fit()
	_zoom = _fit_zoom
	_centre = Vector2.ZERO
	_fitted = true
	queue_redraw()


## Centres a body and zooms so its moon system fills about the free area.
func focus_body(body_id: String, close: bool = true) -> void:
	if map == null or map.body(body_id) == null:
		return
	var body := map.body(body_id)
	var host := map.body(body.parent_id) if body.is_moon() else body
	if close:
		var span := maxf(host.reach(), host.marker * 4.0) * 3.0
		_zoom = _clamp_zoom(minf(_area().size.x, _area().size.y) / maxf(span, 1.0))
	_centre = map.position(body_id, time_s)
	_fitted = false
	queue_redraw()


## Keeps the view on a body while it moves: shifts the centre by the body's motion.
func follow(body_id: String, before_s: float) -> void:
	if map == null or map.body(body_id) == null:
		return
	_centre += map.position(body_id, time_s) - map.position(body_id, before_s)


## Map point → view position.
func to_view(point: Vector2) -> Vector2:
	return _area().get_center() + (point - _centre) * _zoom


## View position → map point.
func to_map(at: Vector2) -> Vector2:
	return _centre + (at - _area().get_center()) / _zoom


## Zooms by `factor` (>1 = closer) keeping the map point under `at` in place.
func zoom_at(factor: float, at: Vector2) -> void:
	var anchor := to_map(at)
	_zoom = _clamp_zoom(_zoom * factor)
	_centre = anchor - (at - _area().get_center()) / _zoom
	_clamp_centre()
	_fitted = false
	queue_redraw()


func pan(by: Vector2) -> void:
	_centre -= by / _zoom
	_clamp_centre()
	if by != Vector2.ZERO:
		_fitted = false
	queue_redraw()


func moons_visible() -> bool:
	return _zoom * SystemMap.MOON_STEP >= MOON_SHOW_PX


func zoom() -> float:
	return _zoom


## The body under a tap at `at` (view coordinates): the one meant, else the nearest; "" for none.
func body_at(at: Vector2) -> String:
	var found := bodies_at(at)
	return found[0] if not found.is_empty() else ""


## The bodies a tap at `at` (view coordinates) meant (MapTap.meant): none, the one, or the nearest
## few to choose from. Generous: a finger within half a touch target of a disc's edge reaches it.
func bodies_at(at: Vector2) -> PackedStringArray:
	if map == null:
		return PackedStringArray()
	var show_moons := moons_visible()
	var ids := PackedStringArray()
	var distances := PackedFloat64Array()
	for body: SystemMap.Body in map.bodies:
		if body.is_moon() and not show_moons:
			continue
		ids.append(body.id)
		distances.append(to_view(map.position(body.id, time_s)).distance_to(at) - _drawn_radius(body))
	return MapTap.meant(ids, distances, AppTheme.TOUCH_MIN * 0.5)


func _area() -> Rect2:
	return _free if _free.size != Vector2.ZERO else Rect2(Vector2.ZERO, size)


func _zoom_to_fit() -> float:
	if map == null:
		return 1.0
	var area := _area().size
	return maxf(minf(area.x, area.y) / (map.extent * 2.1), 0.0001)


func _clamp_zoom(value: float) -> float:
	return clampf(value, _fit_zoom * 0.8, maxf(MAX_MOON_STEP_PX / SystemMap.MOON_STEP, _fit_zoom))


func _clamp_centre() -> void:
	if map != null and _centre.length() > map.extent:
		_centre = _centre.normalized() * map.extent


# --- drawing --------------------------------------------------------------------------------

func _draw() -> void:
	_draw_backdrop()
	if map == null:
		return
	var star_at := to_view(Vector2.ZERO)
	var star_color := SkyLight.star_color(map.star_kelvin)
	var orbit_color := Color(AppTheme.COLOR_BORDER, 0.7)
	_draw_zones(star_at)
	for body: SystemMap.Body in map.star_orbits():
		var color := Color(AppTheme.COLOR_ACCENT, 0.6) if _orbit_selected(body) else orbit_color
		if body.is_belt():
			_draw_belt(body, star_at)
		else:
			_draw_ring(star_at, body.ring * _zoom, color, 2.0)
	_draw_star(star_at, star_color)

	var show_moons := moons_visible()
	var labels: Array[Array] = []
	for body: SystemMap.Body in map.bodies:
		if body.is_moon():
			continue
		var at := to_view(map.position(body.id, time_s))
		if not body.moons.is_empty():
			if show_moons:
				for moon_id: String in body.moons:
					var moon := map.body(moon_id)
					var ring_color := Color(AppTheme.COLOR_ACCENT, 0.6) if moon_id == selected else Color(AppTheme.COLOR_BORDER, 0.45)
					_draw_ring(at, moon.ring * _zoom, ring_color, 1.5)
			else:
				_draw_ring(at, body.reach() * _zoom, Color(AppTheme.COLOR_BORDER, 0.5), 1.5)
		_draw_body(body, at, star_at)
		labels.append([body, at])
		if show_moons:
			for moon_id: String in body.moons:
				var moon := map.body(moon_id)
				var moon_at := to_view(map.position(moon_id, time_s))
				_draw_body(moon, moon_at, star_at)
				labels.append([moon, moon_at])
	_draw_labels(labels, star_at)
	_draw_fleet(show_moons)


## Own structures in orbit (small emerald diamonds beside their body, with a count when several)
## and flights under way (a cyan marker between the visible places of its start and end, on a
## dashed line).
func _draw_fleet(show_moons: bool) -> void:
	for body_id: String in orbiting.keys():
		var body := map.body(body_id)
		if body == null or (body.is_moon() and not show_moons):
			continue
		var at := to_view(map.position(body_id, time_s))
		var spot := at + Vector2(1.0, -1.0).normalized() * (_drawn_radius(body) + 14.0)
		_draw_diamond(spot, 8.0, AppTheme.COLOR_OK)
		var count := Wire.as_int(orbiting[body_id])
		if count > 1:
			var text := str(count)
			var place := spot + Vector2(10.0, 8.0)
			draw_string_outline(_font, place, text, HORIZONTAL_ALIGNMENT_LEFT, -1, LABEL_FONT_SIZE, 6, AppTheme.COLOR_BACKGROUND)
			draw_string(_font, place, text, HORIZONTAL_ALIGNMENT_LEFT, -1, LABEL_FONT_SIZE, AppTheme.COLOR_OK)
	if trips.is_empty():
		return
	var anchors := _trip_anchors()
	var t := roundi(time_s * 1000.0)
	for motion: TravelMotion in trips:
		for part: PackedVector2Array in TravelTrack.map_path(motion, anchors):
			draw_dashed_line(to_view(part[0]), to_view(part[1]), Color(AppTheme.COLOR_ACCENT, 0.55), 2.0, 10.0)
		var point: Variant = TravelTrack.map_point(motion, t, anchors)
		if point != null:
			_draw_diamond(to_view(point as Vector2), 10.0, AppTheme.COLOR_ACCENT)


## The points trips can start or end at: every body where it stands on the map now, and the star.
func _trip_anchors() -> Array[TravelTrack.Anchor]:
	var result: Array[TravelTrack.Anchor] = []
	result.append(TravelTrack.Anchor.make(system_position * ly_per_unit, Vector2.ZERO))
	for body: SystemMap.Body in map.bodies:
		var at := GalaxySystems.vector(body.data.get("position")) * ly_per_unit
		result.append(TravelTrack.Anchor.make(at, map.position(body.id, time_s)))
	return result


func _draw_diamond(at: Vector2, radius: float, color: Color) -> void:
	var points := PackedVector2Array([at + Vector2(0, -radius), at + Vector2(radius, 0), at + Vector2(0, radius),
		at + Vector2(-radius, 0)])
	var outline := PackedVector2Array()
	for point: Vector2 in points:
		outline.append(at + (point - at) * 1.35)
	draw_colored_polygon(outline, AppTheme.COLOR_BACKGROUND)
	draw_colored_polygon(points, color)


func _draw_backdrop() -> void:
	if _backdrop_mesh == null or _backdrop_size != size:
		var centres := PackedVector2Array()
		for point: Vector2 in _backdrop:
			centres.append(point * size)
		_backdrop_mesh = MapShapes.dot_mesh(centres, 1.2)
		_backdrop_size = size
	if _backdrop_mesh != null:
		draw_mesh(_backdrop_mesh, null, Transform2D.IDENTITY, Color(AppTheme.COLOR_TEXT, 0.18))


func _draw_star(at: Vector2, color: Color) -> void:
	var radius := maxf(SystemMap.STAR_RADIUS * _zoom, 10.0)
	# The glow grows with the star only so far: up close it would cover the inner planets.
	var glow := minf(radius, 30.0)
	for step: int in 5:
		draw_circle(at, radius + glow * 0.6 * (5 - step), Color(color, 0.06))
	draw_circle(at, radius, color)
	draw_circle(at, radius * 0.7, color.lightened(0.5))


func _draw_ring(at: Vector2, radius: float, color: Color, width: float) -> void:
	if radius < 1.0:
		return
	var points := clampi(int(radius / 3.0), 48, 720)
	draw_arc(at, radius, 0.0, TAU, points, color, width, true)


## The habitable zone as a soft band with faint edges, the frost line as a dashed ring.
func _draw_zones(star_at: Vector2) -> void:
	var zone := map.habitable_zone_rings()
	if zone != Vector2.ZERO:
		var inner := zone.x * _zoom
		var outer := zone.y * _zoom
		var width := maxf(outer - inner, 2.0)
		var points := clampi(int(outer / 3.0), 64, 720)
		draw_arc(star_at, (inner + outer) * 0.5, 0.0, TAU, points, HABITABLE_FILL, width, true)
		_draw_ring(star_at, inner, HABITABLE_EDGE, 1.0)
		_draw_ring(star_at, outer, HABITABLE_EDGE, 1.0)
	var frost := map.frost_line_ring() * _zoom
	if frost >= 1.0:
		_draw_dashed_ring(star_at, frost, FROST_COLOR, 1.5)


## A dashed circle; close up only the part that can be on screen is drawn, so the dashes keep
## their length.
func _draw_dashed_ring(at: Vector2, radius: float, color: Color, width: float) -> void:
	var area := _area()
	var middle := area.get_center() - at
	var half_diagonal := area.size.length() * 0.5
	var from := 0.0
	var span := TAU
	if middle.length() > half_diagonal:
		if radius < middle.length() - half_diagonal or radius > middle.length() + half_diagonal:
			return
		var half := asin(clampf(half_diagonal / middle.length(), 0.0, 1.0))
		from = middle.angle() - half
		span = half * 2.0
	var step := FROST_DASH_PX * 2.0 / radius
	var dashes := mini(ceili(span / step), FROST_MAX_DASHES)
	step = maxf(step, span / FROST_MAX_DASHES)
	# Dashes start on a fixed grid round the circle, so they do not crawl while panning.
	var start := floorf(from / step) * step
	# All dashes in one call (as `draw_arc` with 6 points each would draw them).
	draw_set_transform(at)
	draw_multiline(MapShapes.dash_segments(radius, start, step, dashes + 1), color, width, true)
	draw_set_transform(Vector2.ZERO)


## An asteroid belt: a band of dots that turns with the belt's body. The band is one mesh for the
## zoom (dots keep their size in pixels), turned and placed on the star when drawn.
func _draw_belt(body: SystemMap.Body, star_at: Vector2) -> void:
	var turn := SystemMap.orbit_angle(body.phase0, body.period_s, time_s)
	var color := Color(_color_of(body.type), 0.55)
	if _orbit_selected(body):
		color = Color(AppTheme.COLOR_ACCENT, 0.7)
	if _belt_zoom != _zoom:
		_belt_meshes.clear()
		_belt_zoom = _zoom
	var mesh := _belt_meshes.get(body.id) as ArrayMesh
	if mesh == null:
		var dot := clampf(1.6 * _zoom, 1.2, 3.0)
		mesh = MapShapes.dot_mesh(MapShapes.belt_dots(_belt_dots, body.ring, SystemMap.BELT_HALF_WIDTH, _zoom), dot)
		_belt_meshes[body.id] = mesh
	# on_ring counts angles counter-clockwise on screen: turning by `turn` is a rotation by −turn.
	draw_mesh(mesh, null, Transform2D(-turn, star_at), color)


## A body: a disc lit from the star's side, with rings for home, own structures and selection.
func _draw_body(body: SystemMap.Body, at: Vector2, star_at: Vector2) -> void:
	var radius := _drawn_radius(body)
	var color := _color_of(body.type)
	var to_star := (star_at - at).normalized() if star_at.distance_to(at) > 0.5 else Vector2.ZERO
	draw_circle(at, radius, color.darkened(0.6))
	draw_circle(at + to_star * radius * 0.18, radius * 0.82, color)
	draw_circle(at + to_star * radius * 0.42, radius * 0.35, color.lightened(0.25))
	if body.id == home_body:
		_draw_ring(at, radius + 7.0, AppTheme.COLOR_OK, 3.0)
	elif marked.has(body.id):
		_draw_ring(at, radius + 7.0, Color(AppTheme.COLOR_OK, 0.8), 2.0)
	if body.id == selected:
		_draw_ring(at, radius + 14.0, AppTheme.COLOR_ACCENT, 3.0)


## Radius of a body's disc on screen: its marker at this zoom, never below the kind's minimum.
func _drawn_radius(body: SystemMap.Body) -> float:
	var minimum := MIN_PLANET_PX
	if body.is_moon():
		minimum = MIN_MOON_PX
	elif body.is_belt():
		minimum = MIN_BELT_BODY_PX
	return maxf(body.marker * _zoom, minimum)


## Names next to the bodies, below or else above. The selected body's name always shows; the
## others keep off the star, every disc and each other, placed by importance: home and marked
## bodies, planets and belts, moons, the zones' names. A name that fits nowhere is left out. The
## star's catalog designation keeps its corner; the others keep off it.
func _draw_labels(entries: Array[Array], star_at: Vector2) -> void:
	var obstacles: Array[Rect2] = []
	var star_radius := maxf(SystemMap.STAR_RADIUS * _zoom, 10.0)
	obstacles.append(Rect2(star_at - Vector2.ONE * star_radius, Vector2.ONE * star_radius * 2.0))
	for entry: Array in entries:
		var disc_at: Vector2 = entry[1]
		var radius := _drawn_radius(entry[0] as SystemMap.Body)
		obstacles.append(Rect2(disc_at - Vector2.ONE * radius, Vector2.ONE * radius * 2.0))
	# Per label: candidate boxes, text, colour, font size.
	var candidates: Array[Array] = []
	var texts := PackedStringArray()
	var colors: Array[Color] = []
	var sizes := PackedInt32Array()
	var catalog := _catalog_box()
	if catalog.has_area():
		_draw_text(map.star.catalog, AppTheme.COLOR_MUTED, NOTE_FONT_SIZE, catalog)
		obstacles.append(catalog)
	for rank: int in 4:
		for entry: Array in entries:
			var body: SystemMap.Body = entry[0]
			if _label_rank(body) != rank:
				continue
			var at: Vector2 = entry[1]
			var below := _label_box(body, at, true)
			if body.id == selected:
				_draw_text(_label_text(body), _label_color(body), LABEL_FONT_SIZE, below)
				obstacles.append(below)
				continue
			candidates.append([below, _label_box(body, at, false)])
			texts.append(_label_text(body))
			colors.append(_label_color(body))
			sizes.append(LABEL_FONT_SIZE)
	_add_zone_labels(star_at, candidates, texts, colors, sizes)
	var placed := SystemMap.place_labels(candidates, obstacles)
	for index: int in candidates.size():
		if placed[index] >= 0:
			_draw_text(texts[index], colors[index], sizes[index], candidates[index][placed[index]] as Rect2)


## Where the star's catalog designation stands: small in the lower right corner of the free area,
## like a legend, at every zoom; an empty box without one.
func _catalog_box() -> Rect2:
	var text := map.star.catalog
	if text.is_empty():
		return Rect2()
	var box_size := _text_box_size(text, NOTE_FONT_SIZE)
	var corner := _area().end - Vector2(CATALOG_INSET, CATALOG_INSET)
	return Rect2(corner - box_size, box_size)


## The names of the habitable zone (in its band) and the frost line (on its ring): at the top of
## the ring if free, else around it; only where the box lies wholly in the free area.
func _add_zone_labels(star_at: Vector2, candidates: Array[Array], texts: PackedStringArray, colors: Array[Color],
		sizes: PackedInt32Array) -> void:
	var zone := map.habitable_zone_rings()
	if zone != Vector2.ZERO:
		_add_ring_label(tr("MAP_HABITABLE_ZONE"), HABITABLE_TEXT, (zone.x + zone.y) * 0.5 * _zoom, star_at, 0.0,
			candidates, texts, colors, sizes)
	var frost := map.frost_line_ring()
	if frost > 0.0:
		# A bit further round, so the two names do not start out on top of each other.
		_add_ring_label(tr("MAP_FROST_LINE"), FROST_TEXT, frost * _zoom, star_at, PI / 12.0, candidates, texts, colors,
			sizes)


func _add_ring_label(text: String, color: Color, radius: float, star_at: Vector2, offset: float,
		candidates: Array[Array], texts: PackedStringArray, colors: Array[Color], sizes: PackedInt32Array) -> void:
	var box_size := _text_box_size(text, NOTE_FONT_SIZE)
	if radius < box_size.x * 0.6:
		return
	var area := _area()
	var options: Array = []
	for step: int in 12:
		var angle := PI * 0.5 + offset + TAU * step / 12.0
		var centre := star_at + SystemMap.on_ring(radius, angle)
		var box := Rect2(centre - box_size * 0.5, box_size)
		if area.encloses(box):
			options.append(box)
	if options.is_empty():
		return
	candidates.append(options)
	texts.append(text)
	colors.append(color)
	sizes.append(NOTE_FONT_SIZE)


## The box of a body's name centred below (or above) its disc, clear of the rings around it.
func _label_box(body: SystemMap.Body, at: Vector2, below: bool) -> Rect2:
	var box_size := _text_box_size(_label_text(body), LABEL_FONT_SIZE)
	var gap := _drawn_radius(body) + (18.0 if body.id == selected else 6.0)
	var top := at.y + gap if below else at.y - gap - box_size.y
	return Rect2(at.x - box_size.x * 0.5, top, box_size.x, box_size.y)


## Size of a label's box: the text with a little room around it.
func _text_box_size(text: String, font_size: int) -> Vector2:
	var width := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	return Vector2(width + 8.0, font_size + 4.0)


func _label_text(body: SystemMap.Body) -> String:
	return SystemMap.short_name(body.name, map.star_name)


func _label_color(body: SystemMap.Body) -> Color:
	if body.id == selected:
		return AppTheme.COLOR_ACCENT
	if body.id == home_body or marked.has(body.id):
		return AppTheme.COLOR_OK
	return AppTheme.COLOR_TEXT if not body.is_moon() else AppTheme.COLOR_MUTED


func _draw_text(text: String, color: Color, font_size: int, box: Rect2) -> void:
	var spot := Vector2(box.position.x + 4.0, box.position.y + 2.0 + _font.get_ascent(font_size))
	draw_string_outline(_font, spot, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, 6, AppTheme.COLOR_BACKGROUND)
	draw_string(_font, spot, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)


func _label_rank(body: SystemMap.Body) -> int:
	if body.id == selected:
		return 0
	if body.id == home_body or marked.has(body.id):
		return 1
	return 3 if body.is_moon() else 2


func _orbit_selected(body: SystemMap.Body) -> bool:
	return body.id == selected


func _color_of(type: String) -> Color:
	var found: Variant = BODY_COLORS.get(type)
	if found == null:
		return UNKNOWN_COLOR
	var color: Color = found
	return color


# --- input ----------------------------------------------------------------------------------

## Taps (MapTap): one finger or the mouse, pressed and released without travelling; press and
## release may come in the same frame. One finger or the left button drags the map, two fingers
## pinch, the wheel and a trackpad's magnify zoom.
func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.canceled:
			_tap.cancel(touch.index)
		elif touch.pressed:
			_tap.press(touch.index, touch.position)
		elif _tap.release(touch.index, touch.position):
			_on_tap(touch.position)
		accept_event()
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if _tap.count() >= 2 and _tap.is_down(drag.index):
			var other := _tap.other_than(drag.index)
			var old_distance := _tap.position_of(drag.index).distance_to(other)
			var new_distance := drag.position.distance_to(other)
			if old_distance > 1.0 and new_distance > 1.0:
				zoom_at(new_distance / old_distance, (drag.position + other) * 0.5)
			_tap.move(drag.index, drag.position)
		else:
			_tap.move(drag.index, drag.position)
			pan(drag.relative)
		accept_event()
	elif event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if button.device == InputEvent.DEVICE_ID_EMULATION:
			return
		match button.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				if button.pressed:
					zoom_at(1.15, button.position)
			MOUSE_BUTTON_WHEEL_DOWN:
				if button.pressed:
					zoom_at(1.0 / 1.15, button.position)
			MOUSE_BUTTON_LEFT:
				if button.pressed:
					_tap.press(MapTap.MOUSE, button.position)
				elif _tap.release(MapTap.MOUSE, button.position):
					_on_tap(button.position)
		accept_event()
	elif event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		if motion.device == InputEvent.DEVICE_ID_EMULATION or not _tap.is_down(MapTap.MOUSE):
			return
		_tap.move(MapTap.MOUSE, motion.position)
		pan(motion.relative)
		accept_event()
	elif event is InputEventMagnifyGesture:
		var gesture := event as InputEventMagnifyGesture
		zoom_at(gesture.factor, gesture.position)
		accept_event()


## A tap at `at`: the body meant, a few to choose from, or "" beside every body.
func _on_tap(at: Vector2) -> void:
	var found := bodies_at(at)
	if found.size() > 1:
		bodies_tapped.emit(found)
	else:
		body_tapped.emit(found[0] if not found.is_empty() else "")