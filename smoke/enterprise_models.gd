extends Node3D
## Review of the enterprise models (scripts/3d/models/enterprise.py, enterprise_hulls.py) in
## their clean style: side by side with the comparable player models, an overview of every piece,
## and a small mock flagship of enterprise hulls with the modules in it, shut (seen from outside,
## the containers) and open (floors and modules), each by day and by night, from the game's
## slanted camera. Nothing from the server; the colony's own lighting is only imitated.
##
##   godot --path . --resolution 1600x1200 res://smoke/enterprise_models.tscn -- --out=build/enterprise-models
##     [--models=res://game/world/models_hd] [--player=res://game/world/models]

const CAMERA_PITCH_DEGREES := 35.0
const CAMERA_YAW_DEGREES := 45.0
const ENTERPRISE_MODULES: Array[String] = [
	"enterprise_factory", "enterprise_lab", "enterprise_supply_hub", "enterprise_generator",
	"enterprise_habitat_t3", "enterprise_sublight_thruster",
]
const ENTERPRISE_HULLS: Array[String] = [
	"hull_enterprise_hull_standard", "hull_enterprise_hull_standard_closed",
	"hull_enterprise_hull_glass", "hull_enterprise_hull_glass_closed",
	"hull_enterprise_hull_armored", "hull_enterprise_hull_armored_closed",
	"hull_enterprise_platform", "hull_enterprise_platform_armored", "hull_enterprise_dock",
]
## Player model -> its enterprise counterpart, with the cells of the larger one.
const MODULE_PAIRS: Array = [
	["factory", "enterprise_factory", 3], ["research_lab", "enterprise_lab", 2],
	["trade_module", "enterprise_supply_hub", 2], ["fusion_reactor", "enterprise_generator", 1],
	["habitat_t3", "enterprise_habitat_t3", 1], ["fusion_drive", "enterprise_sublight_thruster", 1],
]
const HULL_PAIRS: Array = [
	["hull_standard_closed", "hull_enterprise_hull_standard_closed"],
	["hull_glass_carbon_closed", "hull_enterprise_hull_glass_closed"],
	["hull_composite_closed", "hull_enterprise_hull_armored_closed"],
	["hull_starter", "hull_enterprise_hull_standard"],
	["hull_platform_space", "hull_enterprise_platform"],
	["hull_dock", "hull_enterprise_dock"],
]
const FLOOR_HEIGHT := 0.06
## The mock flagship: hull per cell (x, z; +z is the front) and the modules on it.
const MOCK_SIZE := Vector2i(8, 7)
const MOCK_MODULES: Array = [
	["enterprise_factory", Vector2i(0, 0), 3], ["enterprise_lab", Vector2i(3, 0), 2],
	["enterprise_supply_hub", Vector2i(5, 0), 2], ["enterprise_habitat_t3", Vector2i(7, 0), 1],
	["enterprise_habitat_t3", Vector2i(7, 1), 1], ["enterprise_generator", Vector2i(7, 2), 1],
	["enterprise_generator", Vector2i(7, 3), 1], ["enterprise_habitat_t3", Vector2i(3, 3), 1],
	["enterprise_habitat_t3", Vector2i(4, 3), 1], ["enterprise_sublight_thruster", Vector2i(1, 6), 1],
	["enterprise_sublight_thruster", Vector2i(2, 6), 1], ["enterprise_sublight_thruster", Vector2i(3, 6), 1],
	["enterprise_sublight_thruster", Vector2i(4, 6), 1],
]

var _models_dir := "res://game/world/models"
var _player_dir := "res://game/world/models"
var _out := "build/enterprise-models"
var _camera: Camera3D
var _environment: Environment
var _sun: DirectionalLight3D
var _stage: Node3D
var _cache: Dictionary[String, Node3D] = {}
var _night := false


func _ready() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--models="):
			_models_dir = argument.trim_prefix("--models=")
		elif argument.begins_with("--player="):
			_player_dir = argument.trim_prefix("--player=")
		elif argument.begins_with("--out="):
			_out = argument.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(_out)
	_add_lighting()
	await get_tree().process_frame
	for night: bool in [false, true]:
		_set_night(night)
		var time := "night" if night else "day"
		await _shot_pairs(MODULE_PAIRS, true, "compare_modules_" + time)
		await _shot_pairs(HULL_PAIRS, false, "compare_hulls_" + time)
		await _shot_overview("overview_" + time)
		await _shot_mock(true, "mock_closed_" + time, 9.5)
		await _shot_mock(false, "mock_open_" + time, 9.5)
		await _shot_mock(false, "mock_open_zoom_" + time, 4.2, Vector3(1.6, 0.0, 1.6))
		await _shot_mock(true, "mock_closed_zoom_" + time, 4.2, Vector3(6.0, 0.0, 4.5))
	if _stage != null:
		_stage.free()
	for model: Node3D in _cache.values():
		model.free()
	get_tree().quit()


func _add_lighting() -> void:
	_environment = Environment.new()
	_environment.background_mode = Environment.BG_COLOR
	_environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.50, 0.64, 0.84)
	sky_material.sky_horizon_color = Color(0.82, 0.86, 0.90)
	sky_material.ground_horizon_color = Color(0.55, 0.57, 0.60)
	sky_material.ground_bottom_color = Color(0.22, 0.24, 0.27)
	var sky := Sky.new()
	sky.sky_material = sky_material
	_environment.sky = sky
	_environment.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	var world := WorldEnvironment.new()
	world.environment = _environment
	add_child(world)
	_sun = DirectionalLight3D.new()
	_sun.rotation_degrees = Vector3(-50.0, -30.0, 0.0)
	_sun.shadow_enabled = true
	add_child(_sun)
	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.far = 200.0
	add_child(_camera)


func _set_night(night: bool) -> void:
	_night = night
	if night:
		_environment.background_color = Color(0.03, 0.04, 0.07)
		_environment.ambient_light_color = ColonyView.NIGHT_COLOR
		_environment.ambient_light_energy = ColonyView.NIGHT_AMBIENT
		_sun.light_color = ColonyView.NIGHT_FILL_COLOR
		_sun.light_energy = ColonyView.NIGHT_FILL
	else:
		_environment.background_color = Color(0.30, 0.34, 0.30)
		_environment.ambient_light_color = Color(0.82, 0.86, 0.95)
		_environment.ambient_light_energy = ColonyView.SKY_ENERGY
		_sun.light_color = Color.WHITE
		_sun.light_energy = ColonyView.SUN_ENERGY
	# Cached models share their materials: set the lamps of all of them.
	for model: Node3D in _cache.values():
		_set_lamps(model)


func _set_lamps(model: Node) -> void:
	for found: Node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh := (found as MeshInstance3D).mesh
		if mesh == null:
			continue
		for surface: int in mesh.get_surface_count():
			var material := mesh.surface_get_material(surface) as StandardMaterial3D
			if material != null and material.emission_enabled:
				material.emission_energy_multiplier = ColonyView.LAMP_NIGHT if _night else ColonyView.LAMP_DAY


## A fresh copy of model *key* from *folder*; null when there is none.
func _model(folder: String, key: String) -> Node3D:
	var path := folder.path_join(key + ".glb")
	var cached := path
	if not _cache.has(cached):
		var document := GLTFDocument.new()
		var state := GLTFState.new()
		if document.append_from_file(ProjectSettings.globalize_path(path), state) != OK:
			print("FAIL  could not load ", path)
			return null
		var scene := document.generate_scene(state) as Node3D
		_set_lamps(scene)
		_cache[cached] = scene
	return (_cache[cached] as Node3D).duplicate() as Node3D


func _new_stage() -> Node3D:
	if _stage != null:
		_stage.free()
	_stage = Node3D.new()
	add_child(_stage)
	return _stage


func _ground(stage: Node3D, center: Vector3, size: Vector2, color: Color) -> void:
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = size
	ground.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	ground.material_override = material
	ground.position = center + Vector3(0.0, -0.001, 0.0)
	stage.add_child(ground)


func _place(stage: Node3D, model: Node3D, at: Vector3, turn: int = 0) -> void:
	if model == null:
		return
	model.position = at
	model.rotation.y = PI / 2.0 * turn
	stage.add_child(model)


## Ground directions running right and up on the screen.
func _screen_axes() -> Array[Vector3]:
	var yaw := deg_to_rad(CAMERA_YAW_DEGREES)
	return [Vector3(cos(yaw), 0.0, -sin(yaw)), Vector3(-sin(yaw), 0.0, -cos(yaw))]


## Player model left, enterprise right, one pair per row, upright on the screen.
func _shot_pairs(pairs: Array, modules: bool, name: String) -> void:
	var stage := _new_stage()
	var axes := _screen_axes()
	var pitch := deg_to_rad(CAMERA_PITCH_DEGREES)
	var row_height := 0.0
	var tallest := 0.0
	for pair: Array in pairs:
		var cells: int = pair[2] if modules else 1
		row_height += float(cells) * 0.8 + 0.8
		tallest = maxf(tallest, float(cells))
	var up := row_height / 2.0
	for pair: Array in pairs:
		var cells: int = pair[2] if modules else 1
		var height := float(cells) * 0.8 + 0.8
		up -= height / 2.0
		for side: int in 2:
			var across := (-1.0 if side == 0 else 1.0) * (tallest * 0.75 + 0.4)
			var place: Vector3 = axes[0] * across + axes[1] * (up / sin(pitch))
			var key: String = pair[side]
			var folder := _player_dir if side == 0 else _models_dir
			var lift := FLOOR_HEIGHT if modules else 0.0
			if modules:
				var floor_key := "hull_starter" if side == 0 else "hull_enterprise_hull_standard"
				if key.ends_with("thruster") or key == "fusion_drive":
					floor_key = "hull_platform_space" if side == 0 else "hull_enterprise_platform"
				for x: int in cells:
					for z: int in cells:
						var offset := Vector3(x - (cells - 1) * 0.5, 0.0, z - (cells - 1) * 0.5)
						_place(stage, _model(folder, floor_key), place + offset)
			_place(stage, _model(folder, key), place + Vector3(0.0, lift, 0.0))
		up -= height / 2.0
	_ground(stage, Vector3.ZERO, Vector2(60.0, 60.0), _ground_color())
	var screen := get_viewport().get_visible_rect().size
	_camera.size = maxf(row_height + 0.3, (tallest * 3.0 + 2.2) * screen.y / screen.x)
	_aim(Vector3(0.0, 0.25, 0.0))
	await _capture(name)


func _shot_overview(name: String) -> void:
	var stage := _new_stage()
	var keys: Array[String] = []
	keys.append_array(ENTERPRISE_MODULES)
	keys.append_array(ENTERPRISE_HULLS)
	# Rows upright on the screen: the three large modules, then the small ones and the hulls.
	var axes := _screen_axes()
	var pitch := deg_to_rad(CAMERA_PITCH_DEGREES)
	var index := 0
	for key: String in keys:
		var cells := 3 if key == "enterprise_factory" else (2 if key in ["enterprise_lab", "enterprise_supply_hub"] else 1)
		var across := 0.0
		var up := 0.0
		if index < 3:
			across = (index - 1) * 4.6
			up = 2.6
		else:
			var small := index - 3
			@warning_ignore("integer_division")
			var row := small / 5
			across = (small % 5 - 2) * 2.0
			up = 0.2 - row * 1.5
		var place: Vector3 = axes[0] * across + axes[1] * (up / sin(pitch))
		if key.begins_with("enterprise"):
			var floor_key := "hull_enterprise_platform" if key.ends_with("thruster") else "hull_enterprise_hull_standard"
			for x: int in cells:
				for z: int in cells:
					_place(stage, _model(_models_dir, floor_key), place + Vector3(x - (cells - 1) * 0.5, 0.0, z - (cells - 1) * 0.5))
			_place(stage, _model(_models_dir, key), place + Vector3(0.0, FLOOR_HEIGHT, 0.0))
		else:
			_place(stage, _model(_models_dir, key), place)
		index += 1
	_ground(stage, Vector3.ZERO, Vector2(60.0, 60.0), _ground_color())
	_camera.size = 9.0
	_aim(Vector3(0.0, 0.3, 0.0))
	await _capture(name)


## The mock flagship: standard hulls, a glass corridor, an armoured block, a row of platforms
## with thrusters at the front, a dock; *shut* shows the indoor cells as containers.
func _shot_mock(shut: bool, name: String, size: float, target: Vector3 = Vector3(4.0, 0.0, 3.5)) -> void:
	var stage := _new_stage()
	var covered: Dictionary[Vector2i, bool] = {}
	for entry: Array in MOCK_MODULES:
		var origin: Vector2i = entry[1]
		var cells: int = entry[2]
		for x: int in cells:
			for z: int in cells:
				covered[origin + Vector2i(x, z)] = true
	for x: int in MOCK_SIZE.x:
		for z: int in MOCK_SIZE.y:
			var hull := _mock_hull(Vector2i(x, z))
			var outdoor := hull.contains("platform") or hull.contains("dock")
			var key := "hull_" + hull + ("_closed" if shut and not outdoor else "")
			# Shut containers turn by a quarter now and then, as in ColonyView.
			var turn := (hash(Vector2i(x, z)) % 4) if key.ends_with("_closed") else 0
			_place(stage, _model(_models_dir, key), Vector3(x + 0.5, 0.0, z + 0.5), turn)
	for entry: Array in MOCK_MODULES:
		var key: String = entry[0]
		var origin: Vector2i = entry[1]
		var cells: int = entry[2]
		if shut and not key.ends_with("thruster"):
			continue
		var center := Vector3(origin.x + cells * 0.5, FLOOR_HEIGHT, origin.y + cells * 0.5)
		_place(stage, _model(_models_dir, key), center)
	# A small player block beside it for scale and contrast.
	for x: int in 3:
		for z: int in 3:
			var cell := Vector3(-3.5 + x, 0.0, 2.5 + z)
			if shut:
				_place(stage, _model(_player_dir, "hull_standard_closed"), cell, (x + z) % 4)
			else:
				_place(stage, _model(_player_dir, "hull_starter"), cell)
	if not shut:
		_place(stage, _model(_player_dir, "factory"), Vector3(-3.5, FLOOR_HEIGHT, 2.5))
		_place(stage, _model(_player_dir, "fusion_reactor"), Vector3(-2.5, FLOOR_HEIGHT, 2.5))
		_place(stage, _model(_player_dir, "habitat_t3"), Vector3(-1.5, FLOOR_HEIGHT, 2.5))
		_place(stage, _model(_player_dir, "research_lab"), Vector3(-3.5, FLOOR_HEIGHT, 3.5))
	_ground(stage, Vector3(3.0, 0.0, 3.5), Vector2(60.0, 60.0), _ground_color())
	_camera.size = size
	_aim(target + Vector3(0.0, 0.3, 0.0))
	await _capture(name)


func _mock_hull(cell: Vector2i) -> String:
	if cell.y == 6:
		if cell.x == 7:
			return "enterprise_dock"
		return "enterprise_platform_armored" if cell.x in [0, 5] else "enterprise_platform"
	if cell.y == 2 and cell.x >= 3 and cell.x <= 6:
		return "enterprise_hull_glass"
	if cell.x <= 2 and cell.y >= 3 and cell.y <= 5:
		return "enterprise_hull_armored"
	return "enterprise_hull_standard"


func _ground_color() -> Color:
	return Color(0.30, 0.33, 0.27) if not _night else Color(0.10, 0.11, 0.10)


func _aim(target: Vector3) -> void:
	var pitch := deg_to_rad(CAMERA_PITCH_DEGREES)
	var yaw := deg_to_rad(CAMERA_YAW_DEGREES)
	var direction := Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
	_camera.position = target + direction * 40.0
	_camera.look_at(target, Vector3.UP)


func _capture(name: String) -> void:
	await get_tree().create_timer(0.3).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out, name]
	var saved := get_viewport().get_texture().get_image().save_png(path)
	print("%s  %s" % ["SAVED" if saved == OK else "FAIL ", path])
