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

var _camera: Camera3D


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
		var footprint := maxf(bounds.size.x, bounds.size.z)
		var factor := FILL * CELL / footprint if footprint > 0.0 else 1.0
		var center := bounds.get_center()
		model.scale = Vector3.ONE * factor
		model.position = -Vector3(center.x, bounds.position.y, center.z) * factor
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

	get_tree().quit()


func _add_stage() -> void:
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.16, 0.18, 0.22)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color.WHITE
	environment.ambient_light_energy = 0.7
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50.0, -30.0, 0.0)
	sun.light_energy = 1.2
	add_child(sun)

	# One grid cell, so the scale of the model is visible.
	var cell := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(CELL, CELL)
	cell.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.30, 0.36, 0.44)
	cell.material_override = material
	add_child(cell)

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
	return document.generate_scene(state) as Node3D


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
