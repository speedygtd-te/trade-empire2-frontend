extends Control
## Review tool for the moving parts of the modules (ModuleMotion, ModuleMover): in the showcase
## colony (every module type, tools/showcase.cjs) it looks closely at one module of each type that
## has moving parts and saves a short series of frames per type (<type>_<n>.png), plus what it
## costs to move them. The real activity of each module is printed; for the pictures every part
## is set to full activity, so idle showcase modules move as well. Uses the showcase account
## (.local/showcase-account.json). Root script of smoke/motion_view.tscn:
##   godot --path . --resolution 720x1280 res://smoke/motion_view.tscn -- --out=<folder>

const ACCOUNT := "res://.local/showcase-account.json"
const FRAMES := 8
const FRAME_GAP := 0.12
## Square cut that is saved: around the screen centre, raised so the heads of masts show.
const CUT := 440
const CUT_RAISE := 150

var _out_dir := "user://motion"


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(ACCOUNT)))
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in (run node tools/showcase.cjs first)")
		get_tree().quit(1)
		return
	var colony := ColonyScreen.new()
	add_child(colony)
	var deadline := Time.get_ticks_msec() + 30000
	while colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(5.0).timeout
	var model := colony._model
	var view := colony._view
	# Opened, so the indoor modules (deep drill) show too; the sun stays where this tool puts it.
	colony._open_structure(ColonyScreen.Mode.VIEW)
	colony.set_process(false)
	view.set_sun(deg_to_rad(35.0), deg_to_rad(120.0), model.star_kelvin, model.atmosphere_density,
		model.star_brightness(), model.star_size())
	await get_tree().create_timer(1.0).timeout

	# One module per type with moving parts; their real activity.
	var chosen: Dictionary = {}
	for part: ModuleMover._Part in view._mover._parts:
		var type := part.module.module_type
		if not chosen.has(type):
			chosen[type] = part.module
			print("MODULE  %s: activity %.2f%s" % [type, part.activity,
				" (idle: %s)" % model.idle_reasons[part.module.module_id] if model.idle_reasons.has(part.module.module_id) else ""])
	print("PARTS  %d moving parts in %d types" % [view.moving_parts(), chosen.size()])

	# What moving costs per frame.
	var started := Time.get_ticks_usec()
	for index: int in 200:
		view._mover.step(1.0 / 60.0, view._to_sun, view._sun_up)
	print("COST  %.1f µs per frame for %d parts" % [(Time.get_ticks_usec() - started) / 200.0, view.moving_parts()])

	for part: ModuleMover._Part in view._mover._parts:
		part.activity = 1.0
	var types := chosen.keys()
	types.sort()
	for type: String in types:
		var module: StructureLayout.Module = chosen[type]
		var cell := model.layout.to_absolute(module.origin)
		view.look_at_cell(Vector3i(cell.x, cell.y, 0))
		# look_at_cell rebuilt the view: full activity again for the new parts.
		for part: ModuleMover._Part in view._mover._parts:
			part.activity = 1.0
		view.zoom = 3.2
		view.zoom_by(1.0)
		if type == "SOLAR_PANEL":
			# At rest first (the view was just built), then turned towards the sun.
			await _capture("solar_panel_rest")
			await get_tree().create_timer(7.0).timeout
		else:
			await get_tree().create_timer(0.6).timeout
		for frame: int in FRAMES:
			await _capture("%s_%d" % [type.to_lower(), frame])
			await get_tree().create_timer(FRAME_GAP).timeout
	get_tree().quit()


func _capture(file_name: String) -> void:
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var size := image.get_size()
	var corner := Vector2i(int((size.x - CUT) * 0.5), int((size.y - CUT) * 0.5) - CUT_RAISE)
	var cut := image.get_region(Rect2i(corner, Vector2i(CUT, CUT)))
	cut.save_png("%s/%s.png" % [_out_dir, file_name])
