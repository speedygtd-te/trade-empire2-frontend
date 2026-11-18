extends Control
## Review tool for the decoration around a base (PerimeterLayer): the home colony of the
## development account by day and at night, at the default zoom and from afar, on the slow detail
## tier, and a made-up larger base (hulls added on the client only, never sent) so masts along
## longer sides, corners and a second radar can be seen; with the cost: items, draw calls and
## primitives with and without the perimeter. Uses the development account
## (.local/dev-account.json, node tools/dev-account.cjs). Root script of smoke/perimeter_view.tscn:
##   godot --path . --resolution 720x1280 res://smoke/perimeter_view.tscn -- --out=<folder>

const DEV_ACCOUNT := "res://.local/dev-account.json"

var _out_dir := "user://perimeter"
var _colony: ColonyScreen


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(DEV_ACCOUNT)))
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in (run node tools/dev-account.cjs first)")
		get_tree().quit(1)
		return
	_colony = ColonyScreen.new()
	add_child(_colony)
	var deadline := Time.get_ticks_msec() + 30000
	while _colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(2.0).timeout
	# The sun and the detail tier stay where this tool puts them.
	_colony.set_process(false)
	var view := _colony._view
	var model := _colony._model
	view.apply_detail(DetailGovernor.Tier.FAST)
	print("BASE  kind %s, %d hulls, %d guests" % [model.layout.kind, model.layout.hull_count(), model.guests.size()])
	var home := model.centre_cell()

	for zoom: float in [9.0, 20.0]:
		await _look(home, zoom)
		_day()
		await _capture("perimeter_home_zoom%d_day" % int(zoom))
		await _measure("home zoom %d day" % int(zoom))
		_night()
		await _capture("perimeter_home_zoom%d_night" % int(zoom))
		await _measure("home zoom %d night" % int(zoom))
	_dusk()
	await _look(home, 9.0)
	await _capture("perimeter_home_dusk")
	# Close up on the lamp mast that shines most towards the camera (from +x, −y).
	var lamp := home
	var best := -INF
	for spot: Perimeter.Spot in PerimeterLayer.spots_for(model):
		if spot.kind == Perimeter.Kind.LAMP and spot.direction.x - spot.direction.y > best:
			best = spot.direction.x - spot.direction.y
			lamp = Vector3i(spot.cell.x, spot.cell.y, 0)
	await _look(lamp, 4.0)
	_night()
	await _capture("perimeter_home_close_night")
	_day()
	await _capture("perimeter_home_close_day")
	await _look(home, 9.0)
	_night()
	view.apply_detail(DetailGovernor.Tier.SLOW)
	await _capture("perimeter_home_night_slow")
	await _measure("home zoom 9 night SLOW")
	view.apply_detail(DetailGovernor.Tier.FAST)
	# Opened: every module on its floor, the masts must not clash with them.
	_colony._select_structure(true)
	_colony._open_structure(ColonyScreen.Mode.VIEW)
	_day()
	await _capture("perimeter_home_opened_day")
	_colony._close_structure()
	_colony._select_structure(false)

	await _sample(home)
	get_tree().quit()


## A made-up larger base: an L of hulls added to the layout on the client only (never sent), with
## two docks on its side, by day and at night.
func _sample(home: Vector3i) -> void:
	print("SAMPLE  made-up larger base (hulls added on the client only, not from the server)")
	var model := _colony._model
	var layout := model.layout
	var low := Vector3i(1 << 30, 1 << 30, 0)
	var high := -low
	for cell: Vector3i in layout.hull_cells():
		low = low.min(cell)
		high = high.max(cell)
	for y: int in range(low.y - 6, high.y + 1):
		for x: int in range(high.x + 1, high.x + 5):
			layout._hulls[Vector3i(x, y, 0)] = "STARTER"
	for x: int in range(low.x - 8, low.x):
		for y: int in range(low.y, low.y + 3):
			layout._hulls[Vector3i(x, y, 0)] = "STARTER"
	layout._hulls[Vector3i(low.x - 9, low.y + 1, 0)] = DockRules.DOCK
	layout._hulls[Vector3i(low.x - 9, low.y + 2, 0)] = DockRules.DOCK
	model.layout_changed.emit()
	var spots := PerimeterLayer.spots_for(model)
	var kinds: Dictionary = {}
	for spot: Perimeter.Spot in spots:
		var key: String = Perimeter.Kind.keys()[spot.kind]
		kinds[key] = Wire.as_int(kinds.get(key, 0)) + 1
	print("SAMPLE  %d hulls, spots %s" % [layout.hull_count(), kinds])
	var middle := home + Vector3i(-1, -2, 0)
	for zoom: float in [9.0, 16.0]:
		await _look(middle, zoom)
		_day()
		await _capture("perimeter_sample_zoom%d_day" % int(zoom))
		_night()
		await _capture("perimeter_sample_zoom%d_night" % int(zoom))
		await _measure("sample zoom %d night" % int(zoom))


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


func _day() -> void:
	_sun(48.0, 210.0)


func _dusk() -> void:
	_sun(-2.0, 250.0)


func _night() -> void:
	_sun(-25.0, 250.0)


func _sun(elevation: float, azimuth: float) -> void:
	var model := _colony._model
	_colony._view.set_sun(deg_to_rad(elevation), deg_to_rad(azimuth), model.star_kelvin, model.atmosphere_density,
		model.star_brightness(), model.star_size())


## Items, cones and pools, and the frame's draw calls and primitives with and without them.
func _measure(label: String) -> void:
	var perimeter := _colony._view._perimeter
	var stats := perimeter.stats()
	var with_it := await _frame_cost()
	perimeter.visible = false
	var without := await _frame_cost()
	perimeter.visible = true
	print("MEASURE  %s: %s; draw calls %d (without perimeter %d), primitives %d (without %d)" % [
		label, stats, with_it.x, without.x, with_it.y, without.y])


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
