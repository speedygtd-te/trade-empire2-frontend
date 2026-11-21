extends Control
## The system map measured and tapped, for review: frame time, draw calls and primitives over a
## few seconds without and with a selected body (and with time-lapse), then short taps injected as
## real touches (press and release in the same frame, and one frame apart) on planets, and a tap
## into the crowded inner system. Signs in with the showcase account (or `--account=<name>`,
## .local/<name>-account.json); sends nothing but reads.
##
##   godot --path . --resolution 720x1600 res://smoke/map_view.tscn -- --out=build/map [--seconds=4]
##
## Vsync and the frame cap are switched off, so the numbers show what a frame costs. Root script of
## smoke/map_view.tscn (the screens need the Services autoload).

var _out_dir := "user://map"
var _seconds := 4.0
var _failed := 0


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	var account_path := "res://.local/showcase-account.json"
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
		elif argument.begins_with("--account="):
			account_path = "res://.local/%s-account.json" % argument.trim_prefix("--account=")
		elif argument.begins_with("--seconds="):
			_seconds = argument.trim_prefix("--seconds=").to_float()
	DirAccess.make_dir_recursive_absolute(_out_dir)
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	Engine.max_fps = 0
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(account_path)))
	if account.is_empty():
		print("FAIL  no account at %s" % account_path)
		get_tree().quit(2)
		return
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in: ", error.code)
		get_tree().quit(1)
		return
	var home := Services.session.account.home_body_id
	var screen := MapScreen.new()
	screen.setup(GalaxySystems.system_of_body(home), home)
	screen.root = true
	add_child(screen)
	await _until(func() -> bool: return screen._map != null and not screen._state.visible, 20000)
	if screen._map == null:
		print("FAIL  map not loaded")
		get_tree().quit(1)
		return
	var map := screen._map
	var belts := 0
	for body: SystemMap.Body in map.bodies:
		if body.is_belt():
			belts += 1
	print("MAP  %s: %d bodies, %d belts, size %s" % [map.star_name, map.bodies.size(), belts, get_viewport().get_visible_rect().size])
	await get_tree().create_timer(1.0).timeout

	await _measure("overview", screen)
	await _capture("map_overview")
	screen._select(home)
	await _measure("selected", screen)
	await _capture("map_selected")
	screen._select("")
	screen._lapse_button.button_pressed = true
	await _measure("time_lapse", screen)
	screen._lapse_button.button_pressed = false
	screen._view.focus_body(home)
	await _measure("zoomed", screen)
	screen._select(home)
	await _measure("zoomed_selected", screen)
	await _capture("map_zoomed_selected")
	screen._select("")
	screen._view.fit()
	await get_tree().process_frame

	await _taps(screen)
	await _crowd(screen)
	print("RESULT  %s" % ("ok" if _failed == 0 else "%d failed" % _failed))
	get_tree().quit(0 if _failed == 0 else 1)


## Average frame time, render CPU/GPU time, draw calls, primitives and redraws of the map over
## `_seconds`.
func _measure(label: String, screen: MapScreen) -> void:
	await get_tree().create_timer(0.5).timeout
	var viewport := get_viewport().get_viewport_rid()
	var redraws := [0]
	var count := func() -> void: redraws[0] += 1
	screen._view.draw.connect(count)
	var frames := 0
	var draws := 0.0
	var primitives := 0.0
	var cpu := 0.0
	var gpu := 0.0
	var worst := 0
	var start := Time.get_ticks_usec()
	var last := start
	while Time.get_ticks_usec() - start < int(_seconds * 1000000.0):
		await get_tree().process_frame
		var now := Time.get_ticks_usec()
		worst = maxi(worst, now - last)
		last = now
		frames += 1
		draws += Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
		primitives += Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)
		cpu += RenderingServer.viewport_get_measured_render_time_cpu(viewport) + RenderingServer.get_frame_setup_time_cpu()
		gpu += RenderingServer.viewport_get_measured_render_time_gpu(viewport)
	screen._view.draw.disconnect(count)
	var seconds := (last - start) / 1000000.0
	print("PERF  %-16s %6.1f fps  %6.2f ms/frame (worst %5.1f)  render cpu %5.2f ms  gpu %5.2f ms  draw calls %6.0f  primitives %7.0f  map redraws/s %5.1f" % [
		label, frames / seconds, seconds * 1000.0 / frames, worst / 1000.0, cpu / frames, gpu / frames, draws / frames,
		primitives / frames, redraws[0] / seconds])


## Short taps as touches: press and release in one frame, and one frame apart, on planets.
func _taps(screen: MapScreen) -> void:
	var view := screen._view
	var tried := 0
	for body: SystemMap.Body in screen._map.star_orbits():
		if body.is_belt() or tried >= 3:
			continue
		screen._select("")
		await get_tree().process_frame
		await get_tree().process_frame
		var at := view.to_view(screen._map.position(body.id, view.time_s))
		if not view._area().grow(-40.0).has_point(at) or view.bodies_at(at) != PackedStringArray([body.id]):
			continue
		tried += 1
		for gap: int in 2:
			# Deselecting resizes the bottom panel and with it the map's free area: place the tap after.
			screen._select("")
			await get_tree().process_frame
			await get_tree().process_frame
			at = view.to_view(screen._map.position(body.id, view.time_s))
			var spot := view.get_global_transform_with_canvas() * at
			_touch(spot, true)
			for frame: int in gap:
				await get_tree().process_frame
			_touch(spot, false)
			await get_tree().process_frame
			await get_tree().process_frame
			var ok := view.selected == body.id and screen._details.visible
			if not ok:
				_failed += 1
			print("TAP  %-20s %s: selected '%s', details %s -> %s" % [body.name,
				"same frame" if gap == 0 else "one frame apart", view.selected, screen._details.visible, "ok" if ok else "FAIL"])
	await _capture("map_tapped")
	screen._select("")


## A tap where several bodies lie under the finger (the inner system at the overview): a short
## list to pick from, and the pick selects.
func _crowd(screen: MapScreen) -> void:
	var view := screen._view
	# Zoomed out as far as it goes, where the inner bodies crowd most.
	view.zoom_at(0.5, view._area().get_center())
	await get_tree().process_frame
	var best := Vector2.ZERO
	var most := 1
	for body: SystemMap.Body in screen._map.star_orbits():
		var at := view.to_view(screen._map.position(body.id, view.time_s))
		if not view._area().has_point(at):
			continue
		var found := view.bodies_at(at).size()
		if found > most:
			most = found
			best = at
	if most < 2:
		print("CROWD  no spot with several bodies at the overview")
		return
	var spot := view.get_global_transform_with_canvas() * best
	_touch(spot, true)
	_touch(spot, false)
	await get_tree().process_frame
	await get_tree().process_frame
	var listed := screen._choices.visible and screen._choices.choice_count() == most
	print("CROWD  %d bodies under the finger: list shown %s with %d entries" % [most, screen._choices.visible,
		screen._choices.choice_count()])
	if not listed:
		_failed += 1
	await _capture("map_crowd_list")
	var second := screen._choices._ids[1]
	screen._choices.choose(1)
	await get_tree().process_frame
	var ok := view.selected == second and not screen._choices.visible and screen._details.visible
	print("CROWD  picked the second: selected '%s' -> %s" % [view.selected, "ok" if ok else "FAIL"])
	if not ok:
		_failed += 1
	await _capture("map_crowd_picked")
	screen._select("")


func _touch(at: Vector2, pressed: bool) -> void:
	var event := InputEventScreenTouch.new()
	event.index = 0
	event.position = at
	event.pressed = pressed
	Input.parse_input_event(event)


func _until(condition: Callable, timeout_ms: int) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline:
		if condition.call():
			return true
		await get_tree().process_frame
	return condition.call()


func _capture(file_name: String) -> void:
	await get_tree().create_timer(0.6).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	var saved := get_viewport().get_texture().get_image().save_png(path)
	print("%s  %s" % ["SAVED" if saved == OK else "FAIL ", path])
