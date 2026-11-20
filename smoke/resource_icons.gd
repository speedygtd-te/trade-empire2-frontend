extends Node
## Renders the icon of every resource from its 3D model (scripts/3d/models/resources.py, built by
## tools\build-models.ps1 -Only resources into game/world/models/resources): a 3/4 view from the
## game's side, fitted to its bounding box, with a soft key light, a fill and a cool rim light so it
## reads on the dark UI, a sky that metal mirrors, and a transparent background. Rendered four times
## larger and scaled down, so the edges are smooth. Writes <key>.png into --out (the icons the game
## uses, game/ui/resource_icons) and two contact sheets into --sheet: every icon at the size the UI
## shows it and enlarged, with its name, on the app background.
##
##   godot --path . --resolution 720x1280 res://smoke/resource_icons.tscn -- \
##       [--models=game/world/models/resources] [--out=game/ui/resource_icons] \
##       [--sheet=build/resource_icons] [--size=128] [--only=iron,robot_t3]
##
## With --items it renders the store items that build modules and hulls instead (PUMP_MODULE,
## HULL_STANDARD …) from the models the colony shows (game/world/models): a module as it stands,
## an indoor hull shut as seen from outside, a platform or dock as its floor plate, seen from
## higher up so the flat plate still reads. Which item builds which module or hull comes from the
## game data of the server (/v2/definitions, no account needed), plus COMING_ITEMS. Defaults then
## --models=game/world/models --out=game/ui/item_icons --sheet=build/item_icons; --only takes
## item keys in lower case (pump_module,hull_dock).
##
## Every icon gets its import settings (lossy, with mipmaps) written next to it, so a new icon is
## not imported as a large lossless picture.

const CAMERA_PITCH_DEGREES := 30.0
## Flat models (platforms, docks: lower than FLAT_SHARE of their width) are seen from higher up.
const FLAT_PITCH_DEGREES := 52.0
const FLAT_SHARE := 0.2
const CAMERA_YAW_DEGREES := 45.0
## Rendered this many times larger than the icon, then scaled down.
const SUPERSAMPLE := 4
## Empty border around the model, share of the icon.
const MARGIN := 0.06
## The contact sheets: the size the UI shows an icon at, and the enlarged size.
const SHEET_SIZES: Array[int] = [44, 128]
## Items the server does not offer yet whose models exist (item key -> model), after the specs
## in Backend-V2/docs: the probe launcher (SPEC-sonden); the enterprise modules and the
## enterprise hulls (SPEC-enterprise-flaggschiff 3.6, 5.1, 5.2, 5.5, 6a; item keys <MODULE>_MODULE and
## HULL_<TYPE>, indoor hulls shown shut; several module keys there are working titles) and the
## member modules of 6a. The unique factory, lab and supply hub have no item.
const COMING_ITEMS: Dictionary[String, String] = {
	"PROBE_LAUNCHER_MODULE": "probe_launcher",
	"ENTERPRISE_GENERATOR_MODULE": "enterprise_generator",
	"ENTERPRISE_HABITAT_T3_MODULE": "enterprise_habitat_t3",
	"ENTERPRISE_SUBLIGHT_THRUSTER_MODULE": "enterprise_sublight_thruster",
	"ENTERPRISE_HABITAT_T1_MODULE": "enterprise_habitat_t1",
	"ENTERPRISE_HABITAT_T2_MODULE": "enterprise_habitat_t2",
	"ENTERPRISE_HABITAT_T4_MODULE": "enterprise_habitat_t4",
	"ENTERPRISE_HABITAT_T5_MODULE": "enterprise_habitat_t5",
	"ENTERPRISE_WARP_DRIVE_MODULE": "enterprise_warp_drive",
	"ENTERPRISE_LASER_MODULE": "enterprise_laser",
	"ENTERPRISE_ROCKET_LAUNCHER_MODULE": "enterprise_rocket_launcher",
	"ENTERPRISE_SHIELD_GENERATOR_MODULE": "enterprise_shield_generator",
	"ENTERPRISE_ARMOR_MODULE": "enterprise_armor",
	"ENTERPRISE_WHEEL_MODULE": "enterprise_wheel",
	"ENTERPRISE_TRACKS_MODULE": "enterprise_tracks",
	"HULL_ENTERPRISE_HULL_STANDARD": "hull_enterprise_hull_standard_closed",
	"HULL_ENTERPRISE_HULL_GLASS": "hull_enterprise_hull_glass_closed",
	"HULL_ENTERPRISE_HULL_ARMORED": "hull_enterprise_hull_armored_closed",
	"HULL_ENTERPRISE_PLATFORM": "hull_enterprise_platform",
	"HULL_ENTERPRISE_PLATFORM_ARMORED": "hull_enterprise_platform_armored",
	"HULL_ENTERPRISE_DOCK": "hull_enterprise_dock",
	"ENTERPRISE_ADMINISTRATION_MODULE": "enterprise_administration",
	"MINING_EFFICIENCY_DISTRIBUTOR_MODULE": "mining_efficiency_distributor",
	"CARTOGRAPHY_ARCHIVE_MODULE": "cartography_archive",
	"OBSERVATION_PLATFORM_MODULE": "observation_platform",
	"ENTERPRISE_SCHOOL_MODULE": "enterprise_school",
	"ENTERPRISE_ACADEMY_MODULE": "enterprise_academy",
	"ENTERPRISE_ELITE_ACADEMY_MODULE": "enterprise_elite_academy",
	"ENTERPRISE_MEDICAL_BAY_MODULE": "enterprise_medical_bay",
	"ENTERPRISE_SECURITY_HQ_MODULE": "enterprise_security_hq",
	"ENTERPRISE_HOLODECK_MODULE": "enterprise_holodeck",
	"ENTERPRISE_PROMENADE_MODULE": "enterprise_promenade",
	"ENTERPRISE_BIODOME_MODULE": "enterprise_biodome",
	"RESEARCH_NETWORK_NODE_MODULE": "research_network_node",
	"OBSERVATION_UPLINK_MODULE": "observation_uplink",
	"MINING_OPTIMIZER_MODULE": "mining_optimizer",
}
## How long --items waits for the game data.
const DEFINITIONS_TIMEOUT_SECONDS := 30.0

var _viewport: SubViewport
var _camera: Camera3D
var _stage: Node3D
## Rendering module and hull items (--items).
var _items := false


func _ready() -> void:
	await get_tree().process_frame
	await _run()
	get_tree().quit()


func _run() -> void:
	var items := "--items" in OS.get_cmdline_user_args()
	_items = items
	var models_dir := "res://game/world/models" if items else "res://game/world/models/resources"
	var out_dir := "res://game/ui/item_icons" if items else "res://game/ui/resource_icons"
	var sheet_dir := "res://build/item_icons" if items else "res://build/resource_icons"
	var size := 128
	var only := PackedStringArray()
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--models="):
			models_dir = _path(argument.trim_prefix("--models="))
		elif argument.begins_with("--out="):
			out_dir = _path(argument.trim_prefix("--out="))
		elif argument.begins_with("--sheet="):
			sheet_dir = _path(argument.trim_prefix("--sheet="))
		elif argument.begins_with("--size="):
			size = int(argument.trim_prefix("--size="))
		elif argument.begins_with("--only="):
			only = argument.trim_prefix("--only=").split(",", false)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out_dir))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(sheet_dir))

	# Icon name (key in lower case) -> model file.
	var jobs: Dictionary[String, String] = {}
	if items:
		jobs = await _item_jobs(models_dir)
	else:
		for file: String in DirAccess.get_files_at(models_dir):
			if file.to_lower().ends_with(".glb"):
				jobs[file.get_basename()] = models_dir.path_join(file)
	if not only.is_empty():
		for key: String in jobs.keys():
			if not key in only:
				jobs.erase(key)
	if jobs.is_empty():
		print("FAIL  nothing to render from ", models_dir)
		return
	var keys: Array[String] = jobs.keys()
	keys.sort()
	_add_stage(size * SUPERSAMPLE)

	var icons: Dictionary[String, Image] = {}
	for key: String in keys:
		var model := _load_glb(jobs[key])
		if model == null:
			print("FAIL  could not load ", jobs[key])
			continue
		_stage.add_child(model)
		_day_lamps(model)
		_frame(model)
		var image := await _capture()
		model.queue_free()
		image.fix_alpha_edges()
		image.resize(size, size, Image.INTERPOLATE_LANCZOS)
		var path := out_dir.path_join(key + ".png")
		var saved := image.save_png(ProjectSettings.globalize_path(path))
		_import_settings(path)
		print("%s  %s  (%s)" % ["SAVED" if saved == OK else "FAIL ", path, jobs[key].get_file()])
		icons[key] = image
	for shown: int in SHEET_SIZES:
		await _sheet(icons, shown, sheet_dir.path_join("sheet_%d.png" % shown))


## The store items that build modules and hulls, each with the model the colony shows of it:
## a module type's own model; a hull shut from outside when it hosts indoor modules, else its
## floor plate, borrowing the standard container or the starter floor when it has no model of
## its own (StructureLook, as ColonyView does).
func _item_jobs(models_dir: String) -> Dictionary[String, String]:
	var jobs: Dictionary[String, String] = {}
	var waited := 0.0
	while Services.definitions == null and waited < DEFINITIONS_TIMEOUT_SECONDS:
		await get_tree().create_timer(0.25).timeout
		waited += 0.25
	var definitions := Services.definitions
	if definitions == null:
		print("FAIL  no game data from the server")
		return jobs
	for module_key: String in definitions.module_keys():
		var item := definitions.module(module_key).item
		var file := _model_file(models_dir, module_key.to_lower())
		if item.is_empty() or file.is_empty():
			print("SKIP  %s: no item or no model (the colony shows a placeholder box)" % module_key)
			continue
		jobs[item.to_lower()] = file
	for hull_key: String in definitions.hull_keys():
		var item := definitions.hull(hull_key).item
		var shut := StructureLook.hull_closed(definitions, hull_key)
		var file := _model_file(models_dir, StructureLook.hull_model(hull_key, shut))
		if file.is_empty():
			file = _model_file(models_dir, StructureLook.hull_fallback(shut))
		if item.is_empty() or file.is_empty():
			print("SKIP  %s: no item or no model" % hull_key)
			continue
		jobs[item.to_lower()] = file
	for item: String in COMING_ITEMS:
		var file := _model_file(models_dir, COMING_ITEMS[item])
		if not jobs.has(item.to_lower()) and not file.is_empty():
			jobs[item.to_lower()] = file
	return jobs


## The model file *key*.glb in *models_dir*; "" when there is none.
func _model_file(models_dir: String, key: String) -> String:
	var file := models_dir.path_join(key + ".glb")
	return file if FileAccess.file_exists(ProjectSettings.globalize_path(file)) else ""


## Glowing parts (windows, lamps) as the colony shows them by day.
func _day_lamps(model: Node3D) -> void:
	for found: Node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh := (found as MeshInstance3D).mesh
		if mesh == null:
			continue
		for surface: int in mesh.get_surface_count():
			var material := mesh.surface_get_material(surface) as StandardMaterial3D
			if material != null and material.emission_enabled:
				material.emission_energy_multiplier = ColonyView.LAMP_DAY


## Makes Godot import the icon *path* lossy with mipmaps (small in the APK, smooth when shown
## smaller; the quality of the resource icons): sets these values in its .import file, or writes
## one that holds only them (Godot fills in the rest on the next import).
func _import_settings(path: String) -> void:
	var file := ProjectSettings.globalize_path(path) + ".import"
	var wanted: Dictionary[String, String] = {"compress/mode": "1", "compress/lossy_quality": "0.85", "mipmaps/generate": "true"}
	var lines := PackedStringArray()
	if FileAccess.file_exists(file):
		lines = FileAccess.get_file_as_string(file).split("\n")
	if not "[params]" in lines:
		lines = PackedStringArray(["[remap]", "", "importer=\"texture\"", "type=\"CompressedTexture2D\"", "", "[params]", ""])
	for index: int in lines.size():
		var setting := lines[index].get_slice("=", 0)
		if wanted.has(setting):
			lines[index] = "%s=%s" % [setting, wanted[setting]]
			wanted.erase(setting)
	var at := lines.find("[params]") + 2
	for setting: String in wanted:
		lines.insert(at, "%s=%s" % [setting, wanted[setting]])
	var out := FileAccess.open(file, FileAccess.WRITE)
	out.store_string("\n".join(lines).strip_edges(false, true) + "\n")
	out.close()


## Accepts paths relative to the project folder as well as res:// and absolute ones.
func _path(value: String) -> String:
	if value.begins_with("res://") or value.is_absolute_path():
		return value
	return "res://" + value


func _add_stage(pixels: int) -> void:
	_viewport = SubViewport.new()
	_viewport.size = Vector2i(pixels, pixels)
	_viewport.transparent_bg = true
	_viewport.msaa_3d = Viewport.MSAA_4X
	_viewport.own_world_3d = true
	_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(_viewport)
	_stage = Node3D.new()
	_viewport.add_child(_stage)

	var environment := Environment.new()
	environment.background_mode = Environment.BG_CLEAR_COLOR
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.80, 0.84, 0.92)
	environment.ambient_light_energy = 0.55
	# A sky that is not shown: what shiny and metallic surfaces mirror (bright above, dark below,
	# so metal keeps its shape).
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.55, 0.68, 0.88)
	sky_material.sky_horizon_color = Color(0.86, 0.89, 0.93)
	sky_material.ground_horizon_color = Color(0.50, 0.52, 0.56)
	sky_material.ground_bottom_color = Color(0.16, 0.18, 0.21)
	var sky := Sky.new()
	sky.sky_material = sky_material
	environment.sky = sky
	environment.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var world := WorldEnvironment.new()
	world.environment = environment
	_stage.add_child(world)

	# Key light from the upper left front, a soft fill from the right, and a cool rim light from
	# behind that draws the outline against the dark UI.
	_light(Vector3(-48.0, -30.0, 0.0), Color(1.0, 0.97, 0.92), 1.35)
	_light(Vector3(-20.0, 95.0, 0.0), Color(0.80, 0.86, 1.0), 0.35)
	_light(Vector3(-25.0, 170.0, 0.0), Color(0.75, 0.88, 1.0), 1.1)

	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.current = true
	_stage.add_child(_camera)


func _light(rotation_degrees_xyz: Vector3, color: Color, energy: float) -> void:
	var light := DirectionalLight3D.new()
	light.rotation_degrees = rotation_degrees_xyz
	light.light_color = color
	light.light_energy = energy
	_stage.add_child(light)


## Aims the camera from the game's side at the middle of the model's bounding box and fits what
## the camera sees of it (its corners on the screen, not the box's: a round heap would otherwise
## come out small) into the picture. Items that are flat (platforms, docks) are seen from higher
## up, so the plate is not a thin sliver.
func _frame(model: Node3D) -> void:
	var bounds := _bounds(model)
	var flat := _items and bounds.size.y < FLAT_SHARE * maxf(bounds.size.x, bounds.size.z)
	var pitch := deg_to_rad(FLAT_PITCH_DEGREES if flat else CAMERA_PITCH_DEGREES)
	var yaw := deg_to_rad(CAMERA_YAW_DEGREES)
	var direction := Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
	var center := bounds.get_center()
	_camera.position = center + direction * 20.0
	_camera.look_at(center, Vector3.UP)
	var right := _camera.global_transform.basis.x
	var up := _camera.global_transform.basis.y
	var low := Vector2(INF, INF)
	var high := Vector2(-INF, -INF)
	for instance: Node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := instance as MeshInstance3D
		if mesh_instance.mesh == null:
			continue
		var placed := mesh_instance.global_transform
		for vertex: Vector3 in mesh_instance.mesh.get_faces():
			var point := placed * vertex - center
			var on_screen := Vector2(point.dot(right), point.dot(up))
			low = low.min(on_screen)
			high = high.max(on_screen)
	var middle := (low + high) * 0.5
	_camera.position += right * middle.x + up * middle.y
	_camera.size = maxf(high.x - low.x, high.y - low.y) / (1.0 - 2.0 * MARGIN)


func _capture() -> Image:
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var image := _viewport.get_texture().get_image()
	image.convert(Image.FORMAT_RGBA8)
	return image


## A sheet of every icon at *shown* pixels with its name, on the app background.
func _sheet(icons: Dictionary[String, Image], shown: int, path: String) -> void:
	var columns := 7 if shown < 64 else 6
	var cell := Vector2i(maxi(shown + 24, 100), shown + 44)
	var rows := ceili(float(icons.size()) / columns)
	var sheet := SubViewport.new()
	sheet.size = Vector2i(columns * cell.x + 32, rows * cell.y + 32)
	sheet.transparent_bg = false
	sheet.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(sheet)
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.size = Vector2(sheet.size)
	sheet.add_child(background)
	var index := 0
	for key: String in icons:
		@warning_ignore("integer_division")
		var place := Vector2(16 + (index % columns) * cell.x, 16 + (index / columns) * cell.y)
		var panel := ColorRect.new()
		panel.color = AppTheme.COLOR_PANEL
		panel.position = place + Vector2(2, 2)
		panel.size = Vector2(cell) - Vector2(4, 4)
		sheet.add_child(panel)
		var picture := TextureRect.new()
		picture.texture = ImageTexture.create_from_image(icons[key])
		picture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		picture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		picture.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
		picture.position = place + Vector2((cell.x - shown) * 0.5, 8)
		picture.size = Vector2(shown, shown)
		sheet.add_child(picture)
		var label := Label.new()
		label.text = key
		label.add_theme_font_size_override("font_size", 13)
		label.add_theme_color_override("font_color", AppTheme.COLOR_MUTED)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.clip_text = true
		label.position = place + Vector2(4, shown + 14)
		label.size = Vector2(cell.x - 8, 20)
		sheet.add_child(label)
		index += 1
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var image := sheet.get_texture().get_image()
	var saved := image.save_png(ProjectSettings.globalize_path(path))
	print("%s  %s" % ["SAVED" if saved == OK else "FAIL ", path])
	sheet.queue_free()


func _load_glb(path: String) -> Node3D:
	var document := GLTFDocument.new()
	var state := GLTFState.new()
	if document.append_from_file(ProjectSettings.globalize_path(path), state) != OK:
		return null
	return document.generate_scene(state) as Node3D


func _bounds(model: Node3D) -> AABB:
	var bounds := AABB()
	var first := true
	for instance: Node in model.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := instance as MeshInstance3D
		var box := mesh_instance.global_transform * mesh_instance.get_aabb()
		bounds = box if first else bounds.merge(box)
		first = false
	return bounds
