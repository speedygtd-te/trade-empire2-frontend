extends Control
## Review tool for the colony by night: the lamps on hulls and outdoor modules (the models' glow
## masks, ColonyView lamps) and the glow on the ground around every structure
## (StructureGlowLayer). Pictures at the default zoom and from afar, close up, at dusk and sunset
## (not overblown?), on an airless world, on the slow detail tier and opened; with the cost: draw
## calls and primitives with and without the glow. Uses the development account
## (.local/dev-account.json) or another one (--account=showcase → .local/showcase-account.json,
## every module type, tools/showcase.cjs). Root script of smoke/night_view.tscn:
##   godot --path . --resolution 720x1280 res://smoke/night_view.tscn -- --out=<folder> [--account=showcase]

var _out_dir := "user://night"
var _account := "dev"
var _colony: ColonyScreen


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
		elif argument.begins_with("--account="):
			_account = argument.trim_prefix("--account=")
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var file := "res://.local/%s-account.json" % _account
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(file)))
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in with %s" % file)
		get_tree().quit(1)
		return
	_colony = ColonyScreen.new()
	add_child(_colony)
	var deadline := Time.get_ticks_msec() + 30000
	while _colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(3.0).timeout
	# The sun and the detail tier stay where this tool puts them.
	_colony.set_process(false)
	var view := _colony._view
	var model := _colony._model
	view.apply_detail(DetailGovernor.Tier.FAST)
	print("NIGHT  %s: kind %s, %d hulls, %d modules, star %.0f K, atmosphere %.2f" % [
		_account, model.layout.kind, model.layout.hull_count(), model.layout.module_count(),
		model.star_kelvin, model.atmosphere_density])
	var home := model.centre_cell()
	var prefix := _account

	await _look(home, 9.0)
	_sun(48.0, model.atmosphere_density)
	await _capture("%s_zoom9_day" % prefix)
	_sun(4.0, model.atmosphere_density)
	await _capture("%s_zoom9_sunset" % prefix)
	_sun(-2.0, model.atmosphere_density)
	await _capture("%s_zoom9_dusk" % prefix)
	_sun(-25.0, model.atmosphere_density)
	await _capture("%s_zoom9_night" % prefix)
	await _measure("%s zoom 9 night" % prefix)
	_sun(-25.0, 0.0)
	await _capture("%s_zoom9_night_airless" % prefix)
	_sun(-25.0, model.atmosphere_density)
	view.apply_detail(DetailGovernor.Tier.SLOW)
	await _capture("%s_zoom9_night_slow" % prefix)
	await _measure("%s zoom 9 night SLOW" % prefix)
	view.apply_detail(DetailGovernor.Tier.FAST)

	for zoom: float in [20.0, 40.0]:
		await _look(home, zoom)
		await _capture("%s_zoom%d_night" % [prefix, int(zoom)])
		await _measure("%s zoom %d night" % [prefix, int(zoom)])
	await _look(home + Vector3i(2, -2, 0), 4.0)
	await _capture("%s_close_night" % prefix)

	_colony._select_structure(true)
	_colony._open_structure(ColonyScreen.Mode.VIEW)
	await _look(home, 9.0)
	await _capture("%s_opened_night" % prefix)
	get_tree().quit()


func _look(cell: Vector3i, zoom: float) -> void:
	var view := _colony._view
	view.look_at_cell(cell)
	view.zoom = zoom
	view.zoom_by(1.0)
	await get_tree().create_timer(1.5).timeout
	var deadline := Time.get_ticks_msec() + 20000
	while view._props.busy() and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(0.5).timeout


func _sun(elevation: float, density: float) -> void:
	var model := _colony._model
	_colony._view.set_sun(deg_to_rad(elevation), deg_to_rad(250.0), model.star_kelvin, density,
		model.star_brightness(), model.star_size())


## Draw calls and primitives of the frame with and without the structure glow.
func _measure(label: String) -> void:
	var glow := _colony._view.find_child("StructureGlow", true, false) as Node3D
	var with_it := await _frame_cost()
	if glow == null:
		print("MEASURE  %s: draw calls %d, primitives %d (no structure glow)" % [label, with_it.x, with_it.y])
		return
	glow.visible = false
	var without := await _frame_cost()
	glow.visible = true
	print("MEASURE  %s: %s; draw calls %d (without glow %d), primitives %d (without %d)" % [
		label, glow.call("stats"), with_it.x, without.x, with_it.y, without.y])


func _frame_cost() -> Vector2i:
	for frame: int in 3:
		await RenderingServer.frame_post_draw
	return Vector2i(int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)),
		int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)))


func _capture(file_name: String) -> void:
	await get_tree().create_timer(0.3).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	get_viewport().get_texture().get_image().save_png(path)
	print("SAVED  %s" % path)
