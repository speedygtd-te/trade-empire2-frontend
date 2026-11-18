class_name ColonyView
extends Node3D
## Draws a colony in 3D: the ground around it, its hulls and modules, a build preview, and the
## camera (fixed slanted angle, no perspective).
##
## Everything is placed relative to an origin cell (floating origin, see WorldGrid). When the
## camera wanders far from it, the origin moves and the scene is rebuilt around the new one.

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
const NIGHT_AMBIENT := 0.28
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

const COLOR_OK := Color(0.133, 0.827, 0.933, 0.45)
const COLOR_BAD := Color(0.973, 0.443, 0.443, 0.45)
const COLOR_BUILDING := Color(0.984, 0.749, 0.141, 0.40)
const COLOR_SELECTED := Color(0.133, 0.827, 0.933, 0.9)
const COLOR_STRUCTURE := Color(0.133, 0.827, 0.933, 0.18)

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

var _camera: Camera3D
var _ground: GroundLayer
## Trees, stones, ice … on the surface (PropLayer).
var _props: PropLayer
var _hulls: Node3D
var _modules: Node3D
var _preview: Node3D
var _selection: Node3D
var _sun: DirectionalLight3D
var _world: WorldEnvironment
var _scenes: Dictionary = {}
var _hull_meshes: Dictionary = {}
## Materials of the loaded models that glow (instance id → material), and their strength now.
var _lamps: Dictionary = {}
var _lamp_energy := LAMP_DAY
## The structure under the highlight tint; 0 for none.
var _highlight_id := 0
var _highlight_material: StandardMaterial3D


func setup(colony: ColonyModel) -> void:
	model = colony
	model.layout_changed.connect(_rebuild_structure)
	model.guests_changed.connect(_rebuild_structure)
	model.surface_loaded.connect(_on_surface_loaded)


func _ready() -> void:
	_add_environment()
	_ground = GroundLayer.new()
	_ground.name = "Ground"
	add_child(_ground)
	_props = PropLayer.new()
	_props.name = "Props"
	add_child(_props)
	_hulls = _child("Hulls")
	_modules = _child("Modules")
	_preview = _child("Preview")
	_selection = _frame(COLOR_SELECTED)
	_selection.visible = false
	add_child(_selection)

	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.near = 0.1
	_camera.far = 400.0
	add_child(_camera)

	if model != null:
		_props.setup(self)
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
		for level: int in layout.levels():
			var level_z := layout.to_absolute(Vector3i(0, 0, level)).z
			for height: float in [HULL_CLOSED_HEIGHT, HULL_FLOOR_HEIGHT]:
				var distance := (_level_y(structure, level) + height - from.y) / direction.y
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
	open_id = structure_id
	opened = structure_id != 0
	_rebuild_structure()


## Lays a light tint over the home structure (it is selected) or takes it away.
func highlight_structure(on: bool) -> void:
	highlight(model.structure_id if on else 0)


## Lays a light tint over one structure (selected); 0 takes it away.
func highlight(structure_id: int) -> void:
	_highlight_id = structure_id
	_apply_highlight()


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


## The home structure and its guests.
func _structures() -> Array[ColonyModel]:
	var result: Array[ColonyModel] = []
	if model == null:
		return result
	result.append(model)
	result.append_array(model.guest_list())
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
## select_cell.
func show_preview(cells: Array[Vector3i], ok: bool, scene_key: String = "", rotation: int = 0, guest: bool = false) -> void:
	for child: Node in _preview.get_children():
		child.queue_free()
	if cells.is_empty():
		return
	var drop := GUEST_DROP if guest else 0.0
	for cell: Vector3i in cells:
		var mark := _outline(COLOR_OK if ok else COLOR_BAD, true)
		# A mark above the ground lies on the floor below it (a dock or a lower level).
		var floor_lift := 0.004 if cell.z == origin.z else HULL_FLOOR_HEIGHT + 0.004
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
	_redraw_ground()
	_props.rebuild()
	_rebuild_structure()


func _rebuild_structure() -> void:
	if model == null or not is_inside_tree():
		return
	for child: Node in _hulls.get_children():
		child.queue_free()
	for child: Node in _modules.get_children():
		child.queue_free()
	for structure: ColonyModel in _structures():
		_build_structure(structure)
	_apply_highlight()


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
		var hull_type := layout.hull_at(cell).to_lower()
		var key := "hull_" + hull_type
		if shut and StructureLook.cell_closed(layout, definitions, cell):
			key += "_closed"
		if not by_model.has(key):
			by_model[key] = []
		var cells: Array = by_model[key]
		cells.append(cell)
	for key: String in by_model.keys():
		var cells: Array = by_model[key]
		var mesh := _hull_mesh(key)
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
		hull_group.add_child(instance)

	# Modules: one scene each.
	for placed: StructureLayout.Module in layout.modules():
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
		module_group.add_child(node)


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
				_add_ground_block(bx * SurfaceBlocks.BLOCK, by * SurfaceBlocks.BLOCK)


func _on_surface_loaded(request: SurfaceBlocks.Request, _patch: SurfacePatch) -> void:
	for block: Vector2i in request.blocks:
		_add_ground_block(block.x * SurfaceBlocks.BLOCK, block.y * SurfaceBlocks.BLOCK)


## One textured quad of BLOCK × BLOCK cells (GroundLayer).
func _add_ground_block(x0: int, y0: int) -> void:
	_ground.add_block(model.surface, x0, y0, origin, model.size_x)


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
		node = _instance("hull_standard_closed" if key.ends_with("_closed") else "hull_starter")
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


## Sets the sun from its height and direction (radians, SunPosition), the star's surface
## temperature (Kelvin) and the atmosphere's density (SkyLight): low sun through air turns red,
## thick air dims, airless bodies keep white light under a black sky. At night a dim bluish
## light stays, so the colony remains readable on a phone.
func set_sun(elevation: float, azimuth: float, star_kelvin: float = 5800.0, density: float = 1.0,
		star_brightness: float = 1.0, star_size: float = 1.0) -> void:
	var to_sun := Vector3(sin(azimuth) * cos(elevation), sin(elevation), -cos(azimuth) * cos(elevation))
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
	# Lamps and windows light up at dusk, at night and on airless bodies.
	_lamp_energy = lerpf(LAMP_DAY, LAMP_NIGHT, SkyLight.lamp_level(light, density))
	for material: StandardMaterial3D in _lamps.values():
		material.emission_energy_multiplier = _lamp_energy
	var ground := 1.0 - AIRLESS_GROUND_DARKENING * SkyLight.airless(density)
	_ground.set_tint(Color(ground, ground, ground))


## Applies a detail tier: shadows, edge smoothing and render resolution (DetailGovernor).
func apply_detail(tier: DetailGovernor.Tier) -> void:
	var viewport := get_viewport()
	_sun.shadow_enabled = tier != DetailGovernor.Tier.SLOW
	# Soft biome borders cost up to four texture reads per ground pixel.
	_ground.set_soft(tier != DetailGovernor.Tier.SLOW)
	viewport.msaa_3d = Viewport.MSAA_2X if tier == DetailGovernor.Tier.FAST else Viewport.MSAA_DISABLED
	viewport.scaling_3d_scale = 0.75 if tier == DetailGovernor.Tier.SLOW else 1.0
	_props.apply_detail(tier)


func _child(node_name: String) -> Node3D:
	var node := Node3D.new()
	node.name = node_name
	add_child(node)
	return node
