class_name ColonyView
extends Node3D
## Draws a colony in 3D: the ground around it, its hulls and modules, a build preview, and the
## camera (fixed slanted angle, no perspective).
##
## Everything is placed relative to an origin cell (floating origin, see WorldGrid). When the
## camera wanders far from it, the origin moves and the scene is rebuilt around the new one.

## The origin moved and the scene was rebuilt: marks placed from outside (selection, preview)
## have to be placed again.
signal origin_moved

## Height of a hull's floor plate: modules stand on top of it (scripts/3d/models/hulls.py).
const HULL_FLOOR_HEIGHT := 0.06
## Roof height of a shut hull on a closed structure (scripts/3d/models/hulls.py).
const HULL_CLOSED_HEIGHT := 0.72
## A guest's lowest level lies one level above its docks in the grid; drawn that high it would
## float. It is drawn this much lower, so its floor plates rest on the dock pads (which are a
## floor plate high, hull_dock.py).
const GUEST_DROP := 1.0 - HULL_FLOOR_HEIGHT
const MODELS := "res://game/world/models/"
const CAMERA_PITCH_DEGREES := 35.0
const CAMERA_YAW_DEGREES := 45.0
## Visible height of the view in cells, and its limits.
const ZOOM_DEFAULT := 9.0
const ZOOM_MIN := 3.0
const ZOOM_MAX := 40.0
## Distance in cells from the origin after which the origin follows the camera.
const REBASE_DISTANCE := 512
## Ambient light that stays at night, so the colony is still readable, and its colour.
const NIGHT_AMBIENT := 0.38
## Moonlight-like fill at night: a weak bluish light from the camera's side, no shadows, so the
## walls one looks at stay readable on a phone screen. Its strength at full night.
const NIGHT_FILL := 0.5
const NIGHT_FILL_COLOR := Color(0.62, 0.72, 1.0)
## How much of the airless ground darkening is left at full night (the lit colony should stand
## out by day; at night the ground would go black).
const AIRLESS_DARKENING_AT_NIGHT := 0.5
const NIGHT_COLOR := Color(0.45, 0.55, 0.85)
## Light strengths at full sun and full skylight (SkyLight gives 0..1).
const SUN_ENERGY := 1.25
const SKY_ENERGY := 0.6
## Strength of lamps and windows (the models' glow masks) by bright day and at night or
## without air (SkyLight.lamp_level).
const LAMP_DAY := 0.25
const LAMP_NIGHT := 1.5
## How much darker the ground gets on an airless body, so the lit colony stands out (V1).
const AIRLESS_GROUND_DARKENING := 0.45
## Share of the 3D resolution on the slowest detail tier (weak GPUs are limited by fill rate;
## measured on a PowerVR GE8320: few draw calls, slow per pixel). The UI stays sharp.
const SLOW_RENDER_SCALE := 0.6
## Ground blocks built per frame: building one also redraws its neighbours' cell textures, so a
## loaded patch spread over frames avoids hitches on weak devices.
const GROUND_BLOCKS_PER_FRAME := 2
## Cutaway below the ground: no sun and no sky, a warm lamp light from above instead, a dim warm
## fill, and a dark rock-coloured background beyond the loaded floor.
const UNDERGROUND_LAMP_COLOR := Color(1.0, 0.80, 0.58)
const UNDERGROUND_LAMP_ENERGY := 0.95
const UNDERGROUND_AMBIENT_COLOR := Color(1.0, 0.86, 0.70)
const UNDERGROUND_AMBIENT := 0.42
const UNDERGROUND_BACKGROUND := Color(0.035, 0.03, 0.028)
const UNDERGROUND_FLOOR_TINT := Color(0.9, 0.84, 0.78)
## Inside an opened structure: indoor hulls are lightproof, so their rooms are always lit by
## their own lamps — the same by day and at night. Floors and modules of indoor cells go on
## their own render layer, which only this light reaches (no sun, no moonlight fill); a little
## more at night makes up for the darker ambient light.
const INTERIOR_LAYER := 1 << 9
const ALL_LAYERS := (1 << 20) - 1
const INTERIOR_LIGHT_COLOR := Color(1.0, 0.95, 0.88)
const INTERIOR_LIGHT_ENERGY := 1.0
const INTERIOR_AMBIENT_MAKEUP := 0.8
## Marks a hull model key whose cells are room floors under the interior light.
const INTERIOR_SUFFIX := "#interior"

const COLOR_OK := Color(0.133, 0.827, 0.933, 0.45)
const COLOR_BAD := Color(0.973, 0.443, 0.443, 0.45)
const COLOR_BUILDING := Color(0.984, 0.749, 0.141, 0.40)
const COLOR_DISABLED := Color(0.55, 0.08, 0.08, 0.45)
const COLOR_SELECTED := Color(0.133, 0.827, 0.933, 0.9)
const COLOR_STRUCTURE := Color(0.133, 0.827, 0.933, 0.18)
const COLOR_WAITING := Color(0.984, 0.749, 0.141, 0.45)
## Paths in build mode (show_paths): reached corridors faintly cyan, cut-off ones amber, entrances
## emerald arrows, modules without a corridor framed red.
const COLOR_PATH_NEAR := Color(0.133, 0.827, 0.933, 0.20)
const COLOR_PATH_CUT := Color(0.984, 0.749, 0.141, 0.34)
const COLOR_PATH_ENTRANCE := Color(0.204, 0.827, 0.600, 0.95)
const COLOR_PATH_UNCONNECTED := Color(0.973, 0.443, 0.443, 0.95)
## How high (cells) a landing structure starts its descent above its site.
const LANDING_HEIGHT := 12.0
## How often (seconds) the view checks whether a trip changed what is drawn (a phase began).
const TRAVEL_CHECK_SECONDS := 0.5

## How a drawn structure takes part in a trip right now.
enum Trip {
	## Stands where its layout says.
	RESTING,
	## Away: under way elsewhere, or not yet in its landing phase here.
	HIDDEN,
	## Launch phase: still on its cells, shaking.
	LAUNCHING,
	## Drives over this body's surface.
	DRIVING,
	## Descends onto its site here.
	LANDING,
}

## The colony to draw.
var model: ColonyModel
## Origin of the scene, absolute cell.
var origin := Vector3i.ZERO
## Camera focus on the ground, scene coordinates.
var focus := Vector3.ZERO
var zoom := ZOOM_DEFAULT
## Whether a structure is open (every module on its floor) or all are closed (shut hulls, only
## the outdoor modules; StructureLook). Only `open_id` is open: the home structure or a guest.
var opened := false
var open_id := 0
## The active level (absolute z) while `level_cut` is on (the home structure is open with its
## level selector): levels of the open structure above it are hidden; at a level below the ground
## the view cuts the surface away (cutaway: ground, plants, perimeter and every level but the
## active one hidden, the rock of that level as floor, UndergroundLayer).
var level := 0
var level_cut := false

var _camera: Camera3D
var _ground: GroundLayer
## Trees, stones, ice … on the surface (PropLayer).
var _props: PropLayer
## Lamp masts, radar, antennas and beacons around the base (PerimeterLayer).
var _perimeter: PerimeterLayer
var _hulls: Node3D
var _modules: Node3D
var _preview: Node3D
## The cells of a hull shape being marked (show_shape).
var _shape: Node3D
## Corridors, entrances and modules without a corridor in build mode (show_paths).
var _paths: Node3D
var _selection: Node3D
var _sun: DirectionalLight3D
var _night_fill: DirectionalLight3D
## Warm light from above in the cutaway view (instead of the sun).
var _lamp_light: DirectionalLight3D
var _interior_light: DirectionalLight3D
var _world: WorldEnvironment
## The rock floor and footprint outline of an underground level (cutaway).
var _underground: UndergroundLayer
## The last arguments of set_sun, to light the surface again after the cutaway.
var _sun_args: Array = []
var _scenes: Dictionary = {}
var _hull_meshes: Dictionary = {}
## Meshes of a shaft head (opening, rails, post), made once.
var _head_meshes: Array[Mesh] = []
## Materials of the loaded models that glow (instance id → material), and their strength now.
var _lamps: Dictionary = {}
var _lamp_energy := LAMP_DAY
## The structure under the highlight tint; 0 for none.
var _highlight_id := 0
var _highlight_material: StandardMaterial3D
## Rotors, fans, dishes, pump rods and solar panels of the modules on screen (ModuleMotion).
var _mover := ModuleMover.new()
## Ground blocks (first cell) waiting to be built, a few per frame.
var _ground_queue: Array[Vector2i] = []
## Whether they move (not on the slowest detail tier), and where the sun stands for the panels.
var _moving := true
var _to_sun := Vector3.UP
var _sun_up := true
## The player's fleet (set by the screen); without it every structure rests.
var fleet: Fleet = null
## Ghost, drive line and reserved cells (TravelLayer).
var _travel: TravelLayer
## Drawn structures that move now (launch, drive, landing): id → ColonyModel.
var _travelling: Dictionary = {}
var _trip_signature := ""
var _trip_left := 0.0


func setup(colony: ColonyModel) -> void:
	model = colony
	model.layout_changed.connect(_rebuild_structure)
	model.guests_changed.connect(_rebuild_structure)
	model.surface_loaded.connect(_on_surface_loaded)
	model.production_changed.connect(_mover.refresh_activity)


func _ready() -> void:
	_add_environment()
	_ground = GroundLayer.new()
	_ground.name = "Ground"
	add_child(_ground)
	_props = PropLayer.new()
	_props.name = "Props"
	add_child(_props)
	_perimeter = PerimeterLayer.new()
	_perimeter.name = "Perimeter"
	add_child(_perimeter)
	_underground = UndergroundLayer.new()
	_underground.name = "Underground"
	add_child(_underground)
	_hulls = _child("Hulls")
	_modules = _child("Modules")
	_preview = _child("Preview")
	_shape = _child("Shape")
	_paths = _child("Paths")
	_selection = _frame(COLOR_SELECTED)
	_selection.visible = false
	add_child(_selection)
	_travel = TravelLayer.new()
	_travel.name = "Travel"
	_travel.setup(self)
	add_child(_travel)

	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.near = 0.1
	_camera.far = 400.0
	add_child(_camera)

	if model != null:
		_props.setup(self)
		_perimeter.setup(self)
		_underground.setup(self)
	_update_camera()


## Centres the view on an absolute cell and makes it the origin.
func look_at_cell(cell: Vector3i) -> void:
	origin = Vector3i(cell.x, cell.y, 0)
	focus = WorldGrid.to_scene(cell, origin, model.size_x)
	_rebuild_all()
	_update_camera()
	model.ensure_surface(focus_cell())


## Moves the camera by a distance on screen (pixels of the view of size `view_size`).
func pan(screen_delta: Vector2, view_size: Vector2) -> void:
	var per_pixel := zoom / maxf(view_size.y, 1.0)
	var yaw := deg_to_rad(CAMERA_YAW_DEGREES)
	var right := Vector3(cos(yaw), 0.0, -sin(yaw))
	var down := Vector3(sin(yaw), 0.0, cos(yaw))
	var pitch := deg_to_rad(CAMERA_PITCH_DEGREES)
	focus -= right * screen_delta.x * per_pixel
	focus -= down * screen_delta.y * per_pixel / sin(pitch)
	_after_move()


## Zooms by a factor (< 1 zooms in) around the centre of the view.
func zoom_by(factor: float) -> void:
	zoom = clampf(zoom * factor, ZOOM_MIN, ZOOM_MAX)
	_update_camera()


## The absolute cell under a point of the view, or null when the ray misses. `height` is the
## level the ray is cut at: 0 for the ground, HULL_CLOSED_HEIGHT for the roofs of shut hulls.
func cell_at(screen_point: Vector2, height: float = 0.0) -> Variant:
	var from := _camera.project_ray_origin(screen_point)
	var direction := _camera.project_ray_normal(screen_point)
	if absf(direction.y) < 0.0001:
		return null
	var distance := (height - from.y) / direction.y
	if distance < 0.0:
		return null
	var hit := from + direction * distance
	hit.y = 0.0
	var cell := WorldGrid.to_cell(hit, origin, model.size_x)
	# Structures keep their absolute cells next to the origin; the grid wraps.
	cell.x = WorldGrid.unwrap_x(cell.x, origin.x, model.size_x)
	return cell


## The absolute cell of level `z` under a point of the view (the ray cut at that level's floor
## plates), or null when the ray misses.
func cell_on_level(screen_point: Vector2, z: int) -> Variant:
	var found: Variant = cell_at(screen_point, float(z - origin.z) + HULL_FLOOR_HEIGHT)
	if found == null:
		return null
	var cell: Vector3i = found
	return Vector3i(cell.x, cell.y, z)


## Sets the active level (absolute z) and whether it cuts the open structure (see `level`). Below
## the ground it switches to the cutaway view.
func set_level(z: int, cut: bool) -> void:
	if level == z and level_cut == cut:
		return
	var was_cutaway := cutaway()
	level = z
	level_cut = cut
	# The camera rises and sinks with the level, so the active floor stays in place on screen.
	focus.y = float(z - origin.z) if cut else 0.0
	_update_camera()
	_apply_cutaway(was_cutaway)
	_rebuild_structure()


## Whether the view shows an underground level cut open (the surface away).
func cutaway() -> bool:
	return level_cut and opened and level < 0


## The rock floor layer of the cutaway view.
func underground_layer() -> UndergroundLayer:
	return _underground


## Whether a level (absolute z) of a structure is drawn: in the cutaway only the active level; on
## the open structure while its levels are cut the levels from the ground up to the active one;
## otherwise every level from the ground up (below the ground is hidden under it).
func shows_level(structure: ColonyModel, z: int) -> bool:
	if cutaway():
		return z == level
	if level_cut and structure.structure_id == open_id:
		return z >= 0 and z <= level
	return z >= 0


## Surface layers off and the rock floor and lamp light on in the cutaway, and back.
func _apply_cutaway(was_cutaway: bool) -> void:
	var below := cutaway()
	_ground.visible = not below
	_props.visible = not below
	_perimeter.visible = not below
	_travel.visible = not below
	_underground.show_level(level if below else 0)
	if below:
		_apply_lamp_light()
	elif was_cutaway:
		_lamp_light.visible = false
		_world.environment.background_color = Color(0.039, 0.059, 0.110)
		if not _sun_args.is_empty():
			callv("set_sun", _sun_args)


## Lamp light instead of the sun: below the ground neither sun nor sky reach.
func _apply_lamp_light() -> void:
	_sun.visible = false
	_night_fill.visible = false
	_lamp_light.visible = true
	var environment := _world.environment
	environment.ambient_light_color = UNDERGROUND_AMBIENT_COLOR
	environment.ambient_light_energy = UNDERGROUND_AMBIENT
	environment.background_color = UNDERGROUND_BACKGROUND
	_lamp_energy = LAMP_NIGHT
	for material: StandardMaterial3D in _lamps.values():
		material.emission_energy_multiplier = _lamp_energy
	_underground.set_tint(UNDERGROUND_FLOOR_TINT)


## Height at which cell_at meets the floor of a structure's lowest level (for taps on it).
func floor_height(structure: ColonyModel) -> float:
	var levels := structure.layout.levels()
	return _level_y(structure, levels[0] if not levels.is_empty() else 0) + HULL_FLOOR_HEIGHT


## The structure (id) whose hull a point of the view shows: a shut roof or a floor of the home
## structure or of a guest, whichever is nearest to the camera; 0 when none.
func pick_structure(screen_point: Vector2) -> int:
	var from := _camera.project_ray_origin(screen_point)
	var direction := _camera.project_ray_normal(screen_point)
	if absf(direction.y) < 0.0001:
		return 0
	var definitions := Services.definitions
	var best := 0
	var best_distance := INF
	for structure: ColonyModel in _structures():
		var layout := structure.layout
		var shut := structure.structure_id != open_id
		for local_level: int in layout.levels():
			var level_z := layout.to_absolute(Vector3i(0, 0, local_level)).z
			if not shows_level(structure, level_z):
				continue
			for height: float in [HULL_CLOSED_HEIGHT, HULL_FLOOR_HEIGHT]:
				var distance := (_level_y(structure, local_level) + height - from.y) / direction.y
				if distance < 0.0 or distance >= best_distance:
					continue
				var hit := from + direction * distance
				hit.y = 0.0
				var cell := WorldGrid.to_cell(hit, origin, model.size_x)
				cell.x = WorldGrid.unwrap_x(cell.x, origin.x, model.size_x)
				var local := layout.to_local(Vector3i(cell.x, cell.y, level_z))
				if layout.hull_at(local).is_empty():
					continue
				if height == HULL_CLOSED_HEIGHT and not (shut and StructureLook.cell_closed(layout, definitions, local)):
					continue
				best = structure.structure_id
				best_distance = distance
	return best


## Opens the home structure (every module on its floor) or closes everything (shut hulls).
func set_opened(value: bool) -> void:
	open_structure(model.structure_id if value else 0)


## Opens one structure (the home structure or a guest; the others stay shut); 0 closes all.
func open_structure(structure_id: int) -> void:
	if open_id == structure_id:
		return
	var was_cutaway := cutaway()
	open_id = structure_id
	opened = structure_id != 0
	if was_cutaway != cutaway():
		_apply_cutaway(was_cutaway)
	_rebuild_structure()


## Lays a light tint over the home structure (it is selected) or takes it away.
func highlight_structure(on: bool) -> void:
	highlight(model.structure_id if on else 0)


## Lays a light tint over one structure (selected); 0 takes it away.
func highlight(structure_id: int) -> void:
	_highlight_id = structure_id
	_apply_highlight()


## Where the middle of a structure's roof appears in the view (viewport pixels): cards that
## belong to a structure stand there.
func roof_point(structure: ColonyModel) -> Vector2:
	if _camera == null or structure == null:
		return Vector2.ZERO
	var cell := structure.centre_cell()
	var top := cell.z
	for hull: Vector3i in structure.layout.hull_cells():
		top = maxi(top, structure.layout.to_absolute(hull).z)
	var point := WorldGrid.to_scene(Vector3i(cell.x, cell.y, top), origin, model.size_x)
	point.y += lift_of(structure) + HULL_CLOSED_HEIGHT
	return _camera.unproject_position(point)


## Where the top of a cell (absolute; a module standing on it) appears in the view (viewport
## pixels). `guest`: the cell belongs to a guest, drawn standing on its docks.
func cell_point(cell: Vector3i, guest: bool = false) -> Vector2:
	if _camera == null:
		return Vector2.ZERO
	var drop := GUEST_DROP if guest else 0.0
	return _camera.unproject_position(WorldGrid.to_scene(cell, origin, model.size_x) + Vector3(0.0, 0.9 - drop, 0.0))


## How much lower than its grid level a structure is drawn: guests stand on their docks.
func lift_of(structure: ColonyModel) -> float:
	return -GUEST_DROP if structure.is_guest() else 0.0


func _apply_highlight() -> void:
	if _highlight_material == null:
		_highlight_material = StandardMaterial3D.new()
		_highlight_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_highlight_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_highlight_material.albedo_color = COLOR_STRUCTURE
	for holder: Node3D in [_hulls, _modules]:
		for group: Node in holder.get_children():
			var tagged: int = group.get_meta("structure", 0)
			var on := _highlight_id != 0 and tagged == _highlight_id
			var overlay: Material = _highlight_material if on else null
			for found: Node in group.find_children("*", "GeometryInstance3D", true, false):
				var geometry := found as GeometryInstance3D
				# Modules under construction keep their own tint.
				if geometry.material_overlay == null or geometry.material_overlay == _highlight_material:
					geometry.material_overlay = overlay


## Every structure drawn: the loaded one, its guests, the neighbours and their guests, and the
## structures driving or landing here; those away are left out.
func _structures() -> Array[ColonyModel]:
	var result: Array[ColonyModel] = []
	if model == null:
		return result
	var now := Services.clock.now_ms()
	var candidates := model.drawn_structures()
	candidates.append_array(model.traveller_list())
	for structure: ColonyModel in candidates:
		if trip_of(structure, now) != Trip.HIDDEN:
			result.append(structure)
	return result


# --- trips ----------------------------------------------------------------------------------

## Sets the fleet whose trips the view follows, and draws again.
func set_fleet(value: Fleet) -> void:
	fleet = value
	_trip_signature = _signature(Services.clock.now_ms())
	_rebuild_structure()


## The ghost, drive line and reserved cells of trips (TravelLayer).
func travel_layer() -> TravelLayer:
	return _travel


## The fleet entry whose trip moves a structure: its own, or its host's for a guest travelling
## along; null when unknown.
func _trip_entry(structure: ColonyModel) -> Fleet.Entry:
	if fleet == null:
		return null
	var own := fleet.find(structure.structure_id)
	if structure.host == null or (own != null and own.motion != null):
		return own
	return fleet.find(structure.host.structure_id)


## How a structure takes part in a trip at `now`.
func trip_of(structure: ColonyModel, now: int) -> Trip:
	var entry := _trip_entry(structure)
	if entry == null:
		return Trip.RESTING
	var motion := entry.motion
	if motion == null:
		var away := entry.where() == Fleet.Where.TRANSIT or entry.where() == Fleet.Where.ORBIT
		return Trip.HIDDEN if away else Trip.RESTING
	if motion.mode == TravelPlan.MODE_GROUND:
		return Trip.DRIVING if motion.body_id == model.body_id and _site_of(entry) != null else Trip.HIDDEN
	var phase := motion.phase_at(now)
	if phase == TravelMotion.Phase.LAUNCHING:
		var standing := entry.where() == Fleet.Where.SURFACE or entry.where() == Fleet.Where.DOCKED
		return Trip.LAUNCHING if standing else Trip.HIDDEN
	if phase == TravelMotion.Phase.CRUISE:
		return Trip.HIDDEN
	return Trip.LANDING if _site_of(entry) != null else Trip.HIDDEN


## Where the structure of a trip ends up here: the absolute cell of its local origin (its lowest
## level on the ground, or on the host's dock); null when its target is not on this body.
func _site_of(entry: Fleet.Entry) -> Variant:
	var motion := entry.motion
	var mover := model.structure(entry.structure_id)
	if motion == null or mover == null:
		return null
	if motion.target_type() == "surface" and motion.target_body_id() == model.body_id:
		var lowest := 0
		var levels := mover.layout.levels()
		if not levels.is_empty():
			lowest = levels[0]
		return Vector3i(Wire.as_int(motion.target.get("x")), Wire.as_int(motion.target.get("y")), -lowest)
	if motion.target_type() == "dock":
		var host := model.structure(motion.target_host_id())
		if host == null or host == mover:
			return null
		var offset := Wire.as_dict(motion.target.get("offset"))
		return host.layout.to_absolute(Vector3i(Wire.as_int(offset.get("x")), Wire.as_int(offset.get("y")),
			Wire.as_int(offset.get("z"))))
	return null


## Puts a driving or landing structure (and its guests) on its site: it is drawn there and moved
## from there by its shift each frame.
func _place_on_site(structure: ColonyModel, entry: Fleet.Entry) -> void:
	var site: Variant = _site_of(entry)
	if site == null:
		return
	structure.layout.offset = site
	structure.layout.base = Vector3i.ZERO
	for guest: ColonyModel in structure.guest_list():
		guest.layout.base = structure.layout.offset


## How far from its drawn place a travelling structure is at `now` (scene units).
func _trip_shift(structure: ColonyModel, now: int) -> Vector3:
	var entry := _trip_entry(structure)
	if entry == null or entry.motion == null:
		return Vector3.ZERO
	var motion := entry.motion
	match trip_of(structure, now):
		Trip.LAUNCHING:
			# A slight shake that grows towards the lift-off.
			var share := clampf(float(now - motion.depart_at) / maxf(motion.liftoff_at - motion.depart_at, 1.0), 0.0, 1.0)
			var wobble := 0.015 + 0.03 * share
			var seconds := now / 1000.0
			return Vector3(sin(seconds * 37.0) * wobble, absf(sin(seconds * 23.0)) * wobble, cos(seconds * 41.0) * wobble)
		Trip.DRIVING:
			var site: Variant = _site_of(entry)
			if site == null:
				return Vector3.ZERO
			var end: Vector3i = site
			var here := TravelTrack.ground_point(motion, now)
			var whole := floori(here.x)
			var dx := WorldGrid.wrapped_delta(end.x, whole, model.size_x) + (here.x - whole)
			# On the ground all the way (its lowest level at z = 0), also towards a dock.
			var levels := structure.layout.levels()
			var ground := -levels[0] if not levels.is_empty() else 0
			return Vector3(dx, float(ground - end.z), -(here.y - end.y))
		Trip.LANDING:
			var span := maxf(motion.arrival_at - motion.cruise_end_at, 1.0)
			var left := clampf(float(motion.arrival_at - now) / span, 0.0, 1.0)
			# Onto a dock it ends standing on the pads, as a guest is drawn.
			var drop := GUEST_DROP if motion.target_type() == "dock" else 0.0
			return Vector3(0.0, LANDING_HEIGHT * left * left - drop, 0.0)
	return Vector3.ZERO


## What the trips look like now, to notice a phase change that changes what is drawn.
func _signature(now: int) -> String:
	if model == null or fleet == null:
		return ""
	var parts := PackedStringArray()
	var candidates := model.drawn_structures()
	candidates.append_array(model.traveller_list())
	for structure: ColonyModel in candidates:
		parts.append("%d:%d" % [structure.structure_id, trip_of(structure, now)])
	return ",".join(parts)


## Cells reserved here for structures still on their way to land (launch or cruise), absolute.
func _reserved_cells(now: int) -> Array[Vector3i]:
	var result: Array[Vector3i] = []
	if fleet == null or model == null:
		return result
	for entry: Fleet.Entry in fleet.entries():
		var motion := entry.motion
		if motion == null or motion.mode != TravelPlan.MODE_FLIGHT or now >= motion.cruise_end_at:
			continue
		var mover := model.structure(entry.structure_id)
		var site: Variant = _site_of(entry)
		if mover == null or site == null:
			continue
		var at: Vector3i = site
		if motion.target_type() == "dock":
			# The marks lie on the dock pads below.
			at.z -= 1
		var cells := TravelPlan.mover_cells(mover.layout, mover.guest_layouts())
		var lowest := 0
		for index: int in cells.size():
			lowest = cells[index].z if index == 0 else mini(lowest, cells[index].z)
		for cell: Vector3i in cells:
			if cell.z == lowest:
				result.append(at + cell - Vector3i(0, 0, lowest))
	return result


## Scene height of a structure's local level (its floor plate's underside).
func _level_y(structure: ColonyModel, level: int) -> float:
	return float(structure.layout.to_absolute(Vector3i(0, 0, level)).z - origin.z) + lift_of(structure)


## Absolute cell under the camera focus.
func focus_cell() -> Vector3i:
	return WorldGrid.to_cell(focus, origin, model.size_x)


## Marks a cell (absolute) as selected; null hides the mark. `guest`: the cell belongs to a
## guest (or would found one), which is drawn standing on its docks.
func select_cell(cell: Variant, guest: bool = false) -> void:
	if cell == null:
		_selection.visible = false
		return
	var at: Vector3i = cell
	_selection.visible = true
	var drop := GUEST_DROP if guest else 0.0
	_selection.position = WorldGrid.to_scene(at, origin, model.size_x) + Vector3(0.0, HULL_FLOOR_HEIGHT + 0.01 - drop, 0.0)


## Shows what a build would look like: `cells` (absolute) tinted by whether it can work, and
## optionally a model standing on them. An empty list hides the preview. `guest` as in
## select_cell. `extra`: further cells marked only (the landing a staircase takes above it).
func show_preview(cells: Array[Vector3i], ok: bool, scene_key: String = "", rotation: int = 0, guest: bool = false,
		extra: Array[Vector3i] = []) -> void:
	for child: Node in _preview.get_children():
		child.queue_free()
	if cells.is_empty():
		return
	var drop := GUEST_DROP if guest else 0.0
	var marked: Array[Vector3i] = []
	marked.append_array(cells)
	marked.append_array(extra)
	for cell: Vector3i in marked:
		var mark := _outline(COLOR_OK if ok else COLOR_BAD, true)
		# A mark above the ground lies on the floor plate below it (a dock or a lower level); on
		# and under the ground on the ground or the rock.
		var floor_lift := 0.004 if cell.z <= origin.z else HULL_FLOOR_HEIGHT + 0.004
		mark.position = WorldGrid.to_scene(cell, origin, model.size_x) + Vector3(0.0, floor_lift - drop, 0.0)
		_preview.add_child(mark)
	if scene_key.is_empty():
		return
	var ghost := _instance(scene_key)
	if ghost == null:
		return
	_tint(ghost, COLOR_OK if ok else COLOR_BAD)
	# Modules stand on a hull; a hull itself lies on the ground.
	var lift := 0.0 if scene_key.begins_with("hull_") else HULL_FLOOR_HEIGHT
	ghost.position = _footprint_centre(cells) + Vector3(0.0, lift - drop, 0.0)
	ghost.rotation.y = -deg_to_rad(rotation)
	_preview.add_child(ghost)


## Shows a hull shape being marked: `good` cells (the new hulls) cyan, `bad` cells (skipped or
## blocked) red; cells left out of both are not marked. Empty lists hide it. Each colour is one
## mesh, so a large shape stays cheap while it follows the finger.
## `on_hulls`: the cells carry hulls already (they lie on the floor plates, not the ground).
## `waiting` cells amber (a module that has to wait until the level is connected).
func show_shape(good: Array[Vector3i], bad: Array[Vector3i], on_hulls: bool = false,
		waiting: Array[Vector3i] = []) -> void:
	for child: Node in _shape.get_children():
		child.queue_free()
	for part: Array in [[good, COLOR_OK], [bad, COLOR_BAD], [waiting, COLOR_WAITING]]:
		var cells: Array[Vector3i] = []
		cells.assign(part[0] as Array)
		if cells.is_empty():
			continue
		var color: Color = part[1]
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.albedo_color = Color(color, minf(color.a + 0.15, 1.0))
		material.cull_mode = BaseMaterial3D.CULL_DISABLED
		var mesh := ImmediateMesh.new()
		mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES, material)
		for cell: Vector3i in cells:
			# As in show_preview: on the ground or the rock, or on the floor plate below.
			var floor_lift := 0.006 if cell.z <= origin.z and not on_hulls else HULL_FLOOR_HEIGHT + 0.006
			var centre := WorldGrid.to_scene(cell, origin, model.size_x) + Vector3(0.0, floor_lift, 0.0)
			for corner: Vector3 in [Vector3(-0.46, 0, -0.46), Vector3(0.46, 0, -0.46), Vector3(0.46, 0, 0.46),
					Vector3(-0.46, 0, -0.46), Vector3(0.46, 0, 0.46), Vector3(-0.46, 0, 0.46)]:
				mesh.surface_add_vertex(centre + corner)
		mesh.surface_end()
		var instance := MeshInstance3D.new()
		instance.mesh = mesh
		instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_shape.add_child(instance)


## Shows the paths of the open structure's active level (absolute cells, all on hulls): `near`
## corridors staff reach (faint cyan), `cut` corridors they do not (amber), `entrances` with the
## side that opens outwards (`sides`, steps in the grid: an emerald arrow at that edge), and the
## cells of modules without a corridor (`unconnected`: a red frame round them, drawn over the
## models). One mesh per colour; empty lists hide it all.
func show_paths(near: Array[Vector3i], cut: Array[Vector3i], entrances: Array[Vector3i], sides: Array[Vector3i],
		unconnected: Array[Vector3i]) -> void:
	for child: Node in _paths.get_children():
		child.queue_free()
	var lift := Vector3(0.0, HULL_FLOOR_HEIGHT + 0.004, 0.0)
	for part: Array in [[near, COLOR_PATH_NEAR], [cut, COLOR_PATH_CUT]]:
		var cells: Array[Vector3i] = []
		cells.assign(part[0] as Array)
		if cells.is_empty():
			continue
		var mesh := _path_mesh(part[1] as Color, false)
		for cell: Vector3i in cells:
			var centre := WorldGrid.to_scene(cell, origin, model.size_x) + lift
			_add_quad(mesh, centre + Vector3(-0.47, 0, -0.47), centre + Vector3(0.47, 0, -0.47),
				centre + Vector3(0.47, 0, 0.47), centre + Vector3(-0.47, 0, 0.47))
		_finish_path_mesh(mesh)
	if not entrances.is_empty():
		var arrows := _path_mesh(COLOR_PATH_ENTRANCE, false)
		for index: int in entrances.size():
			var side := sides[index] if index < sides.size() else Vector3i(-1, 0, 0)
			var centre := WorldGrid.to_scene(entrances[index], origin, model.size_x) + lift + Vector3(0.0, 0.003, 0.0)
			# Grid y runs along scene −Z.
			var out := Vector3(side.x, 0.0, -side.y)
			var across := Vector3(-out.z, 0.0, out.x)
			_add_quad(arrows, centre - out * 0.02 - across * 0.06, centre + out * 0.2 - across * 0.06,
				centre + out * 0.2 + across * 0.06, centre - out * 0.02 + across * 0.06)
			arrows.surface_add_vertex(centre + out * 0.2 - across * 0.2)
			arrows.surface_add_vertex(centre + out * 0.46)
			arrows.surface_add_vertex(centre + out * 0.2 + across * 0.2)
		_finish_path_mesh(arrows)
	if not unconnected.is_empty():
		var taken: Dictionary = {}
		for cell: Vector3i in unconnected:
			taken[cell] = true
		var frame := _path_mesh(COLOR_PATH_UNCONNECTED, true)
		var width := 0.07
		for cell: Vector3i in unconnected:
			var centre := WorldGrid.to_scene(cell, origin, model.size_x) + lift
			for side: Vector3i in [Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0), Vector3i(0, -1, 0)]:
				if taken.has(cell + side):
					continue
				var out := Vector3(side.x, 0.0, -side.y)
				var across := Vector3(-out.z, 0.0, out.x)
				_add_quad(frame, centre + out * (0.5 - width) - across * 0.5, centre + out * 0.5 - across * 0.5,
					centre + out * 0.5 + across * 0.5, centre + out * (0.5 - width) + across * 0.5)
		_finish_path_mesh(frame)


func _path_mesh(color: Color, on_top: bool) -> ImmediateMesh:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = color
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	if on_top:
		material.no_depth_test = true
		material.render_priority = 5
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES, material)
	return mesh


func _finish_path_mesh(mesh: ImmediateMesh) -> void:
	mesh.surface_end()
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_paths.add_child(instance)


static func _add_quad(mesh: ImmediateMesh, a: Vector3, b: Vector3, c: Vector3, d: Vector3) -> void:
	for corner: Vector3 in [a, b, c, a, c, d]:
		mesh.surface_add_vertex(corner)


func _after_move() -> void:
	var cell := focus_cell()
	if absi(WorldGrid.wrapped_delta(origin.x, cell.x, model.size_x)) > REBASE_DISTANCE \
			or absi(cell.y - origin.y) > REBASE_DISTANCE:
		var offset := WorldGrid.to_scene(cell, origin, model.size_x)
		origin = Vector3i(cell.x, cell.y, 0)
		focus -= Vector3(floorf(offset.x), 0.0, ceilf(offset.z))
		_rebuild_all()
	_update_camera()
	model.ensure_surface(cell)
	if cutaway():
		model.ensure_level_surface(cell, level)


func _update_camera() -> void:
	if _camera == null:
		return
	var pitch := deg_to_rad(CAMERA_PITCH_DEGREES)
	var yaw := deg_to_rad(CAMERA_YAW_DEGREES)
	var direction := Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
	_camera.size = zoom
	_camera.position = focus + direction * 60.0
	_camera.look_at(focus, Vector3.UP)


func _rebuild_all() -> void:
	_ground.clear()
	_ground_queue.clear()
	_redraw_ground()
	_props.rebuild()
	_underground.redraw()
	_rebuild_structure()
	_travel.redraw()
	origin_moved.emit()


func _rebuild_structure() -> void:
	if model == null or not is_inside_tree():
		return
	for child: Node in _hulls.get_children():
		child.queue_free()
	for child: Node in _modules.get_children():
		child.queue_free()
	_mover.clear()
	_travelling.clear()
	var now := Services.clock.now_ms()
	for structure: ColonyModel in _structures():
		var trip := trip_of(structure, now)
		var entry := _trip_entry(structure)
		if (trip == Trip.DRIVING or trip == Trip.LANDING) and entry != null and entry.structure_id == structure.structure_id:
			_place_on_site(structure, entry)
		if trip != Trip.RESTING:
			_travelling[structure.structure_id] = structure
		_build_structure(structure)
	_perimeter.rebuild()
	_apply_highlight()
	_travel.show_reserved(_reserved_cells(now))
	_apply_trips(now)


## Hulls and modules of one structure, each in a group tagged with the structure's id (for the
## highlight).
func _build_structure(structure: ColonyModel) -> void:
	var layout := structure.layout
	var shut := structure.structure_id != open_id
	var lift := Vector3(0.0, lift_of(structure), 0.0)
	var hull_group := Node3D.new()
	hull_group.set_meta("structure", structure.structure_id)
	_hulls.add_child(hull_group)
	var module_group := Node3D.new()
	module_group.set_meta("structure", structure.structure_id)
	_modules.add_child(module_group)

	var definitions := Services.definitions
	# Hulls: one MultiMesh per model; a closed structure shows its indoor hulls shut.
	var by_model: Dictionary = {}
	for cell: Vector3i in layout.hull_cells():
		if not shows_level(structure, layout.to_absolute(cell).z):
			continue
		var closed := StructureLook.cell_closed(layout, definitions, cell)
		var key := StructureLook.hull_model(layout.hull_at(cell), shut and closed)
		if closed and not shut:
			# Open: a room floor under the interior light (shut: the closed container).
			key += INTERIOR_SUFFIX
		if not by_model.has(key):
			by_model[key] = []
		var cells: Array = by_model[key]
		cells.append(cell)
	for key: String in by_model.keys():
		var cells: Array = by_model[key]
		var interior := key.ends_with(INTERIOR_SUFFIX)
		var mesh := _hull_mesh(key.trim_suffix(INTERIOR_SUFFIX))
		var multimesh := MultiMesh.new()
		multimesh.transform_format = MultiMesh.TRANSFORM_3D
		multimesh.mesh = mesh
		multimesh.instance_count = cells.size()
		for index: int in cells.size():
			var local: Vector3i = cells[index]
			var absolute := layout.to_absolute(local)
			var at := WorldGrid.to_scene(absolute, origin, model.size_x) + lift
			# Shut containers turn by a quarter now and then, so the roofs do not repeat.
			var turn := Basis.IDENTITY
			if key.ends_with("_closed"):
				turn = Basis(Vector3.UP, PI / 2.0 * (hash(absolute) % 4))
			multimesh.set_instance_transform(index, Transform3D(turn, at))
		var instance := MultiMeshInstance3D.new()
		instance.multimesh = multimesh
		if interior:
			instance.layers = INTERIOR_LAYER
		hull_group.add_child(instance)

	# Modules: one scene each.
	for placed: StructureLayout.Module in layout.modules():
		if not shows_level(structure, layout.to_absolute(placed.origin).z):
			continue
		if shut and not StructureLook.module_visible_closed(layout, definitions, placed):
			continue
		var node := _instance(placed.module_type.to_lower())
		if node == null:
			node = _placeholder(placed.module_type)
		var cells: Array[Vector3i] = []
		for local: Vector3i in placed.cells():
			if local.z == placed.origin.z:
				cells.append(layout.to_absolute(local))
		# The footprint centre already stands on the module's level.
		node.position = _footprint_centre(cells) + Vector3(0.0, HULL_FLOOR_HEIGHT, 0.0) + lift
		node.rotation.y = -deg_to_rad(placed.rotation)
		if placed.is_building():
			_tint(node, COLOR_BUILDING)
		elif placed.is_disabled():
			_tint(node, COLOR_DISABLED)
		if not shut and StructureLook.cell_closed(layout, definitions, placed.origin):
			_set_layers(node, INTERIOR_LAYER)
		module_group.add_child(node)
		_mover.add(node, structure, placed)

	# Shaft heads: the landing the top floor of a staircase or elevator takes on the level above.
	for head: Vector3i in layout.shaft_heads():
		var placed := layout.module_at(head)
		var absolute := layout.to_absolute(head)
		if placed == null or not shows_level(structure, absolute.z):
			continue
		if shut and StructureLook.cell_closed(layout, definitions, head):
			continue
		var landing := _shaft_head()
		landing.position = WorldGrid.to_scene(absolute, origin, model.size_x) + Vector3(0.0, HULL_FLOOR_HEIGHT, 0.0) + lift
		landing.rotation.y = -deg_to_rad(placed.rotation)
		if placed.is_building():
			_tint(landing, COLOR_BUILDING)
		if StructureLook.cell_closed(layout, definitions, head):
			_set_layers(landing, INTERIOR_LAYER)
		module_group.add_child(landing)


## Draws every loaded ground block near the camera (after the origin moved).
func _redraw_ground() -> void:
	if model == null:
		return
	var cell := focus_cell()
	var centre := model.surface.block_of(cell.x, cell.y)
	var reach := ColonyModel.SURFACE_RADIUS + 1
	for by: int in range(centre.y - reach, centre.y + reach + 1):
		for bx: int in range(centre.x - reach, centre.x + reach + 1):
			if model.surface.is_loaded(model.surface.block_of(bx * SurfaceBlocks.BLOCK, by * SurfaceBlocks.BLOCK)):
				_queue_ground(bx * SurfaceBlocks.BLOCK, by * SurfaceBlocks.BLOCK)


func _on_surface_loaded(request: SurfaceBlocks.Request, _patch: SurfacePatch) -> void:
	for block: Vector2i in request.blocks:
		_queue_ground(block.x * SurfaceBlocks.BLOCK, block.y * SurfaceBlocks.BLOCK)


## Puts a ground block (its first cell) in line to be built; _process builds a few per frame.
func _queue_ground(x0: int, y0: int) -> void:
	var block := Vector2i(x0, y0)
	if not _ground_queue.has(block):
		_ground_queue.append(block)


## One textured quad of BLOCK × BLOCK cells (GroundLayer).
func _add_ground_block(x0: int, y0: int) -> void:
	_ground.add_block(model.surface, x0, y0, origin, model.size_x)


## Puts every visible part of a model on render layers (INTERIOR_LAYER: only the interior light).
func _set_layers(node: Node, layers: int) -> void:
	if node is VisualInstance3D:
		(node as VisualInstance3D).layers = layers
	for child: Node in node.get_children():
		_set_layers(child, layers)


func _footprint_centre(cells: Array[Vector3i]) -> Vector3:
	var sum := Vector3.ZERO
	for cell: Vector3i in cells:
		sum += WorldGrid.to_scene(cell, origin, model.size_x)
	return sum / maxf(cells.size(), 1)


func _scene(key: String) -> PackedScene:
	if not _scenes.has(key):
		var path := MODELS + key + ".glb"
		_scenes[key] = load(path) as PackedScene if ResourceLoader.exists(path) else null
	return _scenes[key] as PackedScene


func _instance(key: String) -> Node3D:
	var scene := _scene(key)
	if scene == null:
		return null
	var node := scene.instantiate() as Node3D
	_collect_lamps(node)
	return node


func _process(delta: float) -> void:
	for _index: int in GROUND_BLOCKS_PER_FRAME:
		if _ground_queue.is_empty():
			break
		var block: Vector2i = _ground_queue.pop_front()
		_add_ground_block(block.x, block.y)
	if _moving:
		_mover.step(delta, _to_sun, _sun_up)
	if fleet == null:
		return
	var now := Services.clock.now_ms()
	_trip_left -= delta
	if _trip_left <= 0.0:
		_trip_left = TRAVEL_CHECK_SECONDS
		var signature := _signature(now)
		if signature != _trip_signature:
			_trip_signature = signature
			_rebuild_structure()
			return
	_apply_trips(now)


## Moves the hulls and modules of every travelling structure to where its trip has it now.
func _apply_trips(now: int) -> void:
	if _travelling.is_empty():
		return
	for holder: Node3D in [_hulls, _modules]:
		for group: Node in holder.get_children():
			var id: int = group.get_meta("structure", 0)
			var structure := _travelling.get(id) as ColonyModel
			if structure != null:
				(group as Node3D).position = _trip_shift(structure, now)


## Moving parts of the modules on screen (for measuring).
func moving_parts() -> int:
	return _mover.count()


## Strength of lamps and windows now (LAMP_DAY … LAMP_NIGHT).
func lamp_energy() -> float:
	return _lamp_energy


## Remembers the glowing materials of a model and gives them the current lamp strength. The
## instances of a model share its materials, so each is set once for all of them.
func _collect_lamps(node: Node3D) -> void:
	for found: Node in node.find_children("*", "MeshInstance3D", true, false):
		var mesh := (found as MeshInstance3D).mesh
		if mesh == null:
			continue
		for surface: int in mesh.get_surface_count():
			var material := mesh.surface_get_material(surface) as StandardMaterial3D
			if material != null and material.emission_enabled and not _lamps.has(material.get_instance_id()):
				_lamps[material.get_instance_id()] = material
				material.emission_energy_multiplier = _lamp_energy


## The mesh of a hull model ("hull_starter", "hull_starter_closed"); a hull type without its
## own model borrows the starter's (open) or the standard container (shut).
func _hull_mesh(key: String) -> Mesh:
	if _hull_meshes.has(key):
		return _hull_meshes[key] as Mesh
	var node := _instance(key)
	if node == null:
		node = _instance(StructureLook.hull_fallback(key.ends_with("_closed")))
	var mesh: Mesh = null
	if node != null:
		var found := node.find_children("*", "MeshInstance3D", true, false)
		if not found.is_empty():
			mesh = (found[0] as MeshInstance3D).mesh
		node.free()
	if mesh == null:
		var box := BoxMesh.new()
		box.size = Vector3(1.0, HULL_FLOOR_HEIGHT, 1.0)
		mesh = box
	_hull_meshes[key] = mesh
	return mesh


## A box standing in for a module without model, coloured by its category.
func _placeholder(module_type: String) -> Node3D:
	var box := BoxMesh.new()
	box.size = Vector3(0.7, 0.45, 0.7)
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.35, 0.42, 0.55)
	var definitions := Services.definitions
	if definitions != null and definitions.module(module_type) != null:
		match definitions.module(module_type).category:
			"PRODUCTION":
				material.albedo_color = Color(0.30, 0.45, 0.62)
			"COLONY":
				material.albedo_color = Color(0.35, 0.60, 0.42)
			"LOGISTICS":
				material.albedo_color = Color(0.62, 0.52, 0.28)
			"TRANSPORT", "MILITARY":
				material.albedo_color = Color(0.55, 0.35, 0.35)
	box.material = material
	var instance := MeshInstance3D.new()
	instance.mesh = box
	instance.position.y = 0.225
	var holder := Node3D.new()
	holder.add_child(instance)
	return holder


## The head of a shaft: the dark opening the stairs or the cabin come up through, with a railing
## on three sides (the open side faces the module's +x, turned with it).
func _shaft_head() -> Node3D:
	var holder := Node3D.new()
	holder.name = "ShaftHead"
	if _head_meshes.is_empty():
		var opening := StandardMaterial3D.new()
		opening.albedo_color = Color(0.05, 0.055, 0.06)
		opening.roughness = 1.0
		var steel := StandardMaterial3D.new()
		steel.albedo_color = Color(0.52, 0.55, 0.58)
		steel.metallic = 0.6
		steel.roughness = 0.45
		var hole := BoxMesh.new()
		hole.size = Vector3(0.72, 0.012, 0.72)
		hole.material = opening
		var rail_x := BoxMesh.new()
		rail_x.size = Vector3(0.78, 0.035, 0.035)
		rail_x.material = steel
		var rail_z := BoxMesh.new()
		rail_z.size = Vector3(0.035, 0.035, 0.78)
		rail_z.material = steel
		var post := BoxMesh.new()
		post.size = Vector3(0.035, 0.34, 0.035)
		post.material = steel
		_head_meshes = [hole, rail_x, rail_z, post]
	var parts: Array[Array] = [
		[0, Vector3(0.0, 0.006, 0.0)],
		[1, Vector3(0.0, 0.34, -0.39)], [1, Vector3(0.0, 0.34, 0.39)], [2, Vector3(-0.39, 0.34, 0.0)],
		[1, Vector3(0.0, 0.18, -0.39)], [1, Vector3(0.0, 0.18, 0.39)], [2, Vector3(-0.39, 0.18, 0.0)],
		[3, Vector3(-0.39, 0.17, -0.39)], [3, Vector3(-0.39, 0.17, 0.39)],
		[3, Vector3(0.39, 0.17, -0.39)], [3, Vector3(0.39, 0.17, 0.39)],
	]
	for part: Array in parts:
		var instance := MeshInstance3D.new()
		instance.mesh = _head_meshes[part[0] as int] as Mesh
		instance.position = part[1] as Vector3
		holder.add_child(instance)
	return holder


## Lays a translucent colour over every mesh of a model.
func _tint(node: Node3D, color: Color) -> void:
	var overlay := StandardMaterial3D.new()
	overlay.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	overlay.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	overlay.albedo_color = color
	for found: Node in node.find_children("*", "MeshInstance3D", true, false):
		(found as MeshInstance3D).material_overlay = overlay


## A bold frame around one cell, drawn on top of everything, so it stays visible on a cell
## that carries a module.
func _frame(color: Color) -> Node3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = color
	material.no_depth_test = true
	material.render_priority = 10
	var holder := Node3D.new()
	var width := 0.045
	for side: int in 4:
		var bar := BoxMesh.new()
		bar.size = Vector3(1.0 + width, 0.01, width) if side % 2 == 0 else Vector3(width, 0.01, 1.0 + width)
		bar.material = material
		var instance := MeshInstance3D.new()
		instance.mesh = bar
		instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var sign := -0.5 if side < 2 else 0.5
		instance.position = Vector3(0.0, 0.0, sign) if side % 2 == 0 else Vector3(sign, 0.0, 0.0)
		holder.add_child(instance)
	return holder


## A flat square marking one cell: a frame, or filled.
func _outline(color: Color, filled: bool = false) -> MeshInstance3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = color
	material.no_depth_test = not filled
	var mesh := ImmediateMesh.new()
	if filled:
		mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES, material)
		for corner: Vector3 in [Vector3(-0.48, 0, -0.48), Vector3(0.48, 0, -0.48), Vector3(0.48, 0, 0.48),
				Vector3(-0.48, 0, -0.48), Vector3(0.48, 0, 0.48), Vector3(-0.48, 0, 0.48)]:
			mesh.surface_add_vertex(corner)
	else:
		mesh.surface_begin(Mesh.PRIMITIVE_LINES, material)
		var corners: Array[Vector3] = [Vector3(-0.5, 0, -0.5), Vector3(0.5, 0, -0.5),
			Vector3(0.5, 0, 0.5), Vector3(-0.5, 0, 0.5)]
		for index: int in 4:
			mesh.surface_add_vertex(corners[index])
			mesh.surface_add_vertex(corners[(index + 1) % 4])
	mesh.surface_end()
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return instance


func _add_environment() -> void:
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.039, 0.059, 0.110)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.82, 0.86, 0.95)
	environment.ambient_light_energy = 0.55
	# A sky that is not shown: shiny and metallic surfaces mirror it.
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.50, 0.64, 0.84)
	sky_material.sky_horizon_color = Color(0.82, 0.86, 0.90)
	sky_material.ground_horizon_color = Color(0.55, 0.57, 0.60)
	sky_material.ground_bottom_color = Color(0.22, 0.24, 0.27)
	var sky := Sky.new()
	sky.sky_material = sky_material
	environment.sky = sky
	environment.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	_world = WorldEnvironment.new()
	_world.environment = environment
	add_child(_world)

	# Fixed sun for now; it will follow the body's day once the backend sends orbit data.
	_sun = DirectionalLight3D.new()
	_sun.rotation_degrees = Vector3(-50.0, -30.0, 0.0)
	_sun.light_energy = 1.15
	_sun.shadow_enabled = true
	_sun.directional_shadow_max_distance = 80.0
	add_child(_sun)

	# Comes from above, slightly behind the camera (yaw CAMERA_YAW_DEGREES), onto the walls in view.
	_night_fill = DirectionalLight3D.new()
	_night_fill.rotation_degrees = Vector3(-55.0, CAMERA_YAW_DEGREES + 20.0, 0.0)
	_night_fill.light_color = NIGHT_FILL_COLOR
	_night_fill.light_energy = 0.0
	_night_fill.shadow_enabled = false
	_night_fill.visible = false
	add_child(_night_fill)

	# The cutaway's lamps: warm, from above and a little from the camera's side, no shadows.
	_lamp_light = DirectionalLight3D.new()
	_lamp_light.rotation_degrees = Vector3(-62.0, CAMERA_YAW_DEGREES - 25.0, 0.0)
	_lamp_light.light_color = UNDERGROUND_LAMP_COLOR
	_lamp_light.light_energy = UNDERGROUND_LAMP_ENERGY
	_lamp_light.shadow_enabled = false
	_lamp_light.visible = false
	add_child(_lamp_light)

	# Rooms of an opened structure: their own lamps instead of sun and moonlight (INTERIOR_LAYER).
	_interior_light = DirectionalLight3D.new()
	_interior_light.rotation_degrees = Vector3(-60.0, CAMERA_YAW_DEGREES - 20.0, 0.0)
	_interior_light.light_color = INTERIOR_LIGHT_COLOR
	_interior_light.light_energy = INTERIOR_LIGHT_ENERGY
	_interior_light.shadow_enabled = false
	_interior_light.light_cull_mask = INTERIOR_LAYER
	add_child(_interior_light)
	for light: DirectionalLight3D in [_sun, _night_fill, _lamp_light]:
		light.light_cull_mask = ALL_LAYERS & ~INTERIOR_LAYER


## Sets the sun from its height and direction (radians, SunPosition), the star's surface
## temperature (Kelvin) and the atmosphere's density (SkyLight): low sun through air turns red,
## thick air dims, airless bodies keep white light under a black sky. At night a dim bluish
## light stays, so the colony remains readable on a phone.
func set_sun(elevation: float, azimuth: float, star_kelvin: float = 5800.0, density: float = 1.0,
		star_brightness: float = 1.0, star_size: float = 1.0) -> void:
	_sun_args = [elevation, azimuth, star_kelvin, density, star_brightness, star_size]
	var to_sun := Vector3(sin(azimuth) * cos(elevation), sin(elevation), -cos(azimuth) * cos(elevation))
	_to_sun = to_sun
	_sun_up = elevation > ModuleMotion.SUN_UP
	var up := Vector3.UP if absf(to_sun.y) < 0.999 else Vector3.FORWARD
	_sun.basis = Basis.looking_at(-to_sun, up)
	var light := SkyLight.at(elevation, star_kelvin, density, star_brightness)
	# A large-looking star and haze soften shadow edges; a small star without air keeps them
	# crisp. A constant blur is all the Compatibility renderer offers (no PCSS).
	_sun.shadow_blur = SkyLight.shadow_blur(star_size, density)
	var strength := maxf(light.sun.r, maxf(light.sun.g, light.sun.b))
	_sun.visible = strength > 0.001
	if _sun.visible:
		_sun.light_color = Color(light.sun.r / strength, light.sun.g / strength, light.sun.b / strength)
		_sun.light_energy = SUN_ENERGY * strength
	var environment := _world.environment
	var sky_strength := maxf(light.sky.r, maxf(light.sky.g, light.sky.b))
	if sky_strength > 0.001:
		environment.ambient_light_color = Color(light.sky.r / sky_strength, light.sky.g / sky_strength, light.sky.b / sky_strength)
	else:
		environment.ambient_light_color = NIGHT_COLOR
	# The floor keeps a dark scene readable; without air only the sun lights the ground.
	environment.ambient_light_energy = maxf(NIGHT_AMBIENT, SKY_ENERGY * sky_strength)
	# Rooms stay as bright as by day: the interior light makes up for the weaker ambient light.
	_interior_light.light_energy = INTERIOR_LIGHT_ENERGY \
		+ INTERIOR_AMBIENT_MAKEUP * maxf(0.0, SKY_ENERGY - environment.ambient_light_energy)
	# Lamps and windows light up at dusk, at night and on airless bodies.
	_lamp_energy = lerpf(LAMP_DAY, LAMP_NIGHT, SkyLight.lamp_level(light, density))
	for material: StandardMaterial3D in _lamps.values():
		material.emission_energy_multiplier = _lamp_energy
	# Light cones of the floodlights around the base: only without sun.
	_perimeter.set_darkness(SkyLight.darkness(light))
	# Night: a moonlight fill keeps the colony readable; it fades in as sun and sky go.
	var night := clampf(1.0 - (strength + sky_strength) * 1.5, 0.0, 1.0)
	_night_fill.light_energy = NIGHT_FILL * night
	_night_fill.visible = night > 0.01
	var darkening := AIRLESS_GROUND_DARKENING * lerpf(1.0, AIRLESS_DARKENING_AT_NIGHT, night)
	var ground := 1.0 - darkening * SkyLight.airless(density)
	_ground.set_tint(Color(ground, ground, ground))
	# Below the ground neither sun nor sky reach: the lamps stay on.
	if cutaway():
		_apply_lamp_light()


## Applies a detail tier: shadows, edge smoothing and render resolution (DetailGovernor).
func apply_detail(tier: DetailGovernor.Tier) -> void:
	var viewport := get_viewport()
	_sun.shadow_enabled = tier != DetailGovernor.Tier.SLOW
	# Soft biome borders cost up to four texture reads per ground pixel.
	_ground.set_soft(tier != DetailGovernor.Tier.SLOW)
	_underground.set_soft(tier != DetailGovernor.Tier.SLOW)
	viewport.msaa_3d = Viewport.MSAA_2X if tier == DetailGovernor.Tier.FAST else Viewport.MSAA_DISABLED
	viewport.scaling_3d_scale = SLOW_RENDER_SCALE if tier == DetailGovernor.Tier.SLOW else 1.0
	_props.apply_detail(tier)
	_perimeter.apply_detail(tier)
	_moving = tier != DetailGovernor.Tier.SLOW


func _child(node_name: String) -> Node3D:
	var node := Node3D.new()
	node.name = node_name
	add_child(node)
	return node
