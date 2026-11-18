extends Control
## Review tool for the showcase colony (every module type, tools/showcase.cjs): pictures of the
## colony closed and opened, from afar and close up, by night, and of its store. Uses the
## showcase account (.local/showcase-account.json). Root script of smoke/showcase_view.tscn:
##   godot --path . --resolution 720x1280 res://smoke/showcase_view.tscn -- --out=<folder>

const ACCOUNT := "res://.local/showcase-account.json"

var _out_dir := "user://showcase"


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
	await get_tree().create_timer(1.0).timeout
	var deadline := Time.get_ticks_msec() + 30000
	while colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(5.0).timeout
	var layout := colony._model.layout
	var view := colony._view
	print("SHOWCASE  %d hulls, %d modules (%d still being built)" % [
		layout.hull_count(), layout.module_count(), StructureLook.modules_building(layout)])

	# Afar and close up, closed; then the same opened.
	var centre := colony._model.centre_cell()
	var spots: Array[Vector3i] = [centre + Vector3i(-3, -3, 0), centre + Vector3i(3, 2, 0), centre + Vector3i(-2, 3, 0)]
	for opened: bool in [false, true]:
		var state := "opened" if opened else "closed"
		if opened:
			colony._open_structure(ColonyScreen.Mode.VIEW)
		view.look_at_cell(centre)
		view.zoom = 16.0
		view.zoom_by(1.0)
		await _capture("showcase_%s_all" % state)
		for index: int in spots.size():
			view.look_at_cell(spots[index])
			view.zoom = 6.0
			view.zoom_by(1.0)
			await _capture("showcase_%s_near_%d" % [state, index])
	colony._close_structure()
	colony._select_structure(false)

	# By night: the lamps and windows of the closed containers.
	colony.set_process(false)
	view.look_at_cell(centre)
	view.zoom = 9.0
	view.zoom_by(1.0)
	view.set_sun(deg_to_rad(-25.0), deg_to_rad(250.0), colony._model.star_kelvin, colony._model.atmosphere_density)
	await _capture("showcase_closed_night")
	colony.set_process(true)

	colony._open_structure(ColonyScreen.Mode.STORE)
	await get_tree().create_timer(2.0).timeout
	await _capture("showcase_store")
	get_tree().quit()


func _capture(file_name: String) -> void:
	await get_tree().create_timer(1.2).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	get_viewport().get_texture().get_image().save_png(path)
	print("SAVED  %s" % path)
