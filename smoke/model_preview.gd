extends Node3D
## Review tool for generated 3D assets: loads every .glb of a folder at runtime, fits each into
## one grid cell and saves pictures from the game's slanted, perspective-free camera.
##
## Root script of smoke/model_preview.tscn; run through tools\preview-models.ps1. Prints the
## original size, triangle and surface counts of every model.

const CELL := 1.0
## Share of the cell a model's footprint may fill.
const FILL := 0.9
const CAMERA_PITCH_DEGREES := 30.0
const VIEW_YAWS: Array[float] = [45.0, 225.0]
## The overview picture: models side by side in a grid that is upright on the screen.
const SHEET_COLUMNS := 2
## Width and height of one place of that grid, in world units on the screen.
const SHEET_PLACE := Vector2(1.5, 1.45)

var _camera: Camera3D
var _cell: MeshInstance3D
## False for models that are already built to cell size: they are shown as they are.
var _fit := true
## --night: a dim bluish night with the glow masks turned up like ColonyView.LAMP_NIGHT.
var _night := false


func _ready() -> void:
	_run()


func _run() -> void:
	var models_dir := ""
	var out_dir := "user://model_preview"
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--models="):
			models_dir = argument.trim_prefix("--models=")
		elif argument.begins_with("--out="):
			out_dir = argument.trim_prefix("--out=")
		elif argument == "--no-fit":
			_fit = false
		elif argument == "--night":
			_night = true
	DirAccess.make_dir_recursive_absolute(out_dir)

	_add_stage()
	var files := PackedStringArray()
	for file: String in DirAccess.get_files_at(models_dir):
		if file.to_lower().ends_with(".glb"):
			files.append(file)
	files.sort()
	if files.is_empty():
		print("FAIL  no .glb files in ", models_dir)

	for file: String in files:
		var model := _load_glb(models_dir + "/" + file)
		if model == null:
			print("FAIL  could not load ", file)
			continue
		add_child(model)
		var bounds := _bounds(model)
		var factor := _place(model, bounds, Vector3.ZERO)
		print(
			(
				"MODEL %s: %.2f x %.2f x %.2f (w x h x d), %d triangles, %d surfaces, height in cells %.2f"
				% [
					file,
					bounds.size.x,
					bounds.size.y,
					bounds.size.z,
					_triangles(model),
					_surfaces(model),
					bounds.size.y * factor,
				]
			)
		)
		var target := Vector3(0.0, bounds.size.y * factor * 0.5, 0.0)
		_camera.size = maxf(2.2, bounds.size.y * factor * 1.6)
		for yaw: float in VIEW_YAWS:
			_aim(target, yaw)
			await _capture("%s/%s_%d.png" % [out_dir, file.get_basename(), int(yaw)])
		model.queue_free()
		await get_tree().process_frame

	if files.size() > 1:
		await _sheet(models_dir, files, out_dir)
	get_tree().quit()


## Fits a model into the cell at [param place] (or only moves it there when fitting is off)
## and returns the scale factor used.
func _place(model: Node3D, bounds: AABB, place: Vector3) -> float:
	if not _fit:
		model.position = place
		return 1.0
	var footprint := maxf(bounds.size.x, bounds.size.z)
	var factor := FILL * CELL / footprint if footprint > 0.0 else 1.0
	var center := bounds.get_center()
	model.scale = Vector3.ONE * factor
	model.position = place - Vector3(center.x, bounds.position.y, center.z) * factor
	return factor


## One picture with every model, each on its own cell, in a grid upright on the screen.
func _sheet(models_dir: String, files: PackedStringArray, out_dir: String) -> void:
	var yaw := deg_to_rad(VIEW_YAWS[0])
	var pitch := deg_to_rad(CAMERA_PITCH_DEGREES)
	# Ground directions that run to the right and upwards on the screen.
	var right := Vector3(cos(yaw), 0.0, -sin(yaw))
	var away := Vector3(-sin(yaw), 0.0, -cos(yaw))
	var rows := ceili(float(files.size()) / SHEET_COLUMNS)
	_cell.visible = false
	for index: int in files.size():
		var model := _load_glb(models_dir + "/" + files[index])
		if model == null:
			continue
		add_child(model)
		var column := index % SHEET_COLUMNS
		@warning_ignore("integer_division")
		var row := index / SHEET_COLUMNS
		var across := (column - (SHEET_COLUMNS - 1) * 0.5) * SHEET_PLACE.x
		var up := ((rows - 1) * 0.5 - row) * SHEET_PLACE.y
		var place := right * across + away * (up / sin(pitch))
		_place(model, _bounds(model), place)
		var ground := MeshInstance3D.new()
		ground.mesh = _cell.mesh
		ground.material_override = _cell.material_override
		ground.position = place
		add_child(ground)
	var screen := get_viewport().get_visible_rect().size
	_camera.size = maxf(rows * SHEET_PLACE.y + 0.4, SHEET_COLUMNS * SHEET_PLACE.x * screen.y / screen.x)
	_aim(Vector3(0.0, 0.35, 0.0), VIEW_YAWS[0])
	await _capture("%s/all_%d.png" % [out_dir, int(VIEW_YAWS[0])])


func _add_stage() -> void:
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.16, 0.18, 0.22)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color.WHITE
	environment.ambient_light_energy = 0.7
	# A plain sky that is not shown: it is what shiny and metallic surfaces mirror.
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.50, 0.64, 0.84)
	sky_material.sky_horizon_color = Color(0.82, 0.86, 0.90)
	sky_material.ground_horizon_color = Color(0.55, 0.57, 0.60)
	sky_material.ground_bottom_color = Color(0.22, 0.24, 0.27)
	var sky := Sky.new()
	sky.sky_material = sky_material
	environment.sky = sky
	environment.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50.0, -30.0, 0.0)
	sun.light_energy = 1.2
	add_child(sun)
	if _night:
		environment.background_color = Color(0.03, 0.04, 0.07)
		environment.ambient_light_color = ColonyView.NIGHT_COLOR
		environment.ambient_light_energy = ColonyView.NIGHT_AMBIENT
		sun.light_color = ColonyView.NIGHT_FILL_COLOR
		sun.light_energy = ColonyView.NIGHT_FILL

	# One grid cell, so the scale of the model is visible.
	_cell = MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(CELL, CELL)
	_cell.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.30, 0.36, 0.44)
	_cell.material_override = material
	add_child(_cell)

	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.size = 2.2
	add_child(_camera)


func _aim(target: Vector3, yaw_degrees: float) -> void:
	var pitch := deg_to_rad(CAMERA_PITCH_DEGREES)
	var yaw := deg_to_rad(yaw_degrees)
	var direction := Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
	_camera.position = target + direction * 20.0
	_camera.look_at(target, Vector3.UP)


func _load_glb(path: String) -> Node3D:
	var document := GLTFDocument.new()
	var state := GLTFState.new()
	if document.append_from_file(path, state) != OK:
		return null
	var scene := document.generate_scene(state) as Node3D
	if _night and scene != null:
		var instances: Array[MeshInstance3D] = []
		_mesh_instances(scene, instances)
		for instance: MeshInstance3D in instances:
			for surface: int in instance.mesh.get_surface_count():
				var material := instance.mesh.surface_get_material(surface) as StandardMaterial3D
				if material != null and material.emission_enabled:
					material.emission_energy_multiplier = ColonyView.LAMP_NIGHT
	return scene


func _mesh_instances(node: Node, into: Array[MeshInstance3D]) -> void:
	if node is MeshInstance3D:
		into.append(node as MeshInstance3D)
	for child: Node in node.get_children():
		_mesh_instances(child, into)


func _bounds(model: Node3D) -> AABB:
	var instances: Array[MeshInstance3D] = []
	_mesh_instances(model, instances)
	var bounds := AABB()
	var first := true
	for instance: MeshInstance3D in instances:
		var box := instance.global_transform * instance.get_aabb()
		bounds = box if first else bounds.merge(box)
		first = false
	return bounds


func _triangles(model: Node3D) -> int:
	var instances: Array[MeshInstance3D] = []
	_mesh_instances(model, instances)
	var count := 0
	for instance: MeshInstance3D in instances:
		if instance.mesh != null:
			@warning_ignore("integer_division")
			count += instance.mesh.get_faces().size() / 3
	return count


func _surfaces(model: Node3D) -> int:
	var instances: Array[MeshInstance3D] = []
	_mesh_instances(model, instances)
	var count := 0
	for instance: MeshInstance3D in instances:
		if instance.mesh != null:
			count += instance.mesh.get_surface_count()
	return count


func _capture(path: String) -> void:
	await get_tree().create_timer(0.3).timeout
	await RenderingServer.frame_post_draw
	var saved := get_viewport().get_texture().get_image().save_png(path)
	print("%s  %s" % ["SAVED" if saved == OK else "FAIL ", path])
