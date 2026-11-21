extends Control
## Review tool for the structure details on a touch screen: the Production page scrolled by a
## swipe that starts on a resource row (events as a phone sends them: InputEventScreenTouch and
## InputEventScreenDrag through Input.parse_input_event), a tap on a row that opens it, the scroll
## place kept while the page is rebuilt (also in the middle of a swipe), and the Research and Log
## lists filling the screen. Uses the showcase account (.local/showcase-account.json); sends
## nothing. Root script of smoke/details_view.tscn; run it at more than one screen height:
##   godot --path . --resolution 720x1280 res://smoke/details_view.tscn -- --out=build/details-1280
##   godot --path . --resolution 720x1600 res://smoke/details_view.tscn -- --out=build/details-1600
## Lines PASS/FAIL say whether each touch check held; the exit code is 1 when one failed.

const ACCOUNT := "res://.local/showcase-account.json"

var _out_dir := "user://details"
var _failed := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(_out_dir)
	# A desktop has no touch screen, and a ScrollContainer only drags on one: let the mouse count as
	# touch, as on the phone (where touches also come in as emulated mouse events).
	Input.emulate_touch_from_mouse = true
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(ACCOUNT)))
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in")
		get_tree().quit(1)
		return
	var shell := MainShell.new()
	add_child(shell)
	var colony := shell.colony()
	var deadline := Time.get_ticks_msec() + 30000
	while colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	var model := colony._model
	var details := colony.open_details(StructureDetails.Tab.PRODUCTION)
	if details == null:
		print("FAIL  no details")
		get_tree().quit(1)
		return
	deadline = Time.get_ticks_msec() + 20000
	while not model.production_known() and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	await get_tree().create_timer(2.0).timeout
	print("CANVAS  %s" % get_viewport_rect().size)
	await _check_production(details)
	details.show_tab(StructureDetails.Tab.RESEARCH)
	await get_tree().create_timer(4.0).timeout
	await _capture("research")
	details.show_tab(StructureDetails.Tab.LOG)
	await get_tree().create_timer(4.0).timeout
	await _capture("log")
	get_tree().quit(1 if _failed else 0)


func _check_production(details: StructureDetails) -> void:
	var panel := details.production_panel()
	await _capture("production_top")
	var row := _visible_row(panel)
	if row == null:
		_report(false, "a resource row on screen")
		return
	var start := row.get_global_rect().get_center()
	var before := panel.scroll_vertical
	await _swipe(start, start - Vector2(0, 500))
	# Until the page has come to rest after the fling.
	await get_tree().create_timer(2.0).timeout
	var after := panel.scroll_vertical
	_report(after > before + 200, "swipe on a row scrolls the page: %d -> %d (max %d)" % [before, after,
		int(panel.get_v_scroll_bar().max_value - panel.get_v_scroll_bar().page)])
	_report(panel._open.is_empty(), "the swipe did not open the row")
	await _capture("production_swiped")

	# Rebuilt by a production change: the page stays where it was.
	panel.reload()
	await get_tree().process_frame
	await get_tree().process_frame
	_report(panel.scroll_vertical == after, "reload keeps the place: %d -> %d" % [after, panel.scroll_vertical])

	# Back to the top, where the resource rows are.
	start = Vector2(get_viewport_rect().size.x / 2.0, get_viewport_rect().size.y * 0.3)
	for i: int in 2:
		await _swipe(start, start + Vector2(0, 900))
	await get_tree().create_timer(2.0).timeout
	_report(panel.scroll_vertical < after, "swipe down scrolls back: %d" % panel.scroll_vertical)

	# Rebuilt in the middle of a swipe that started on a row (the row under the finger is freed):
	# the swipe goes on.
	row = _visible_row(panel)
	if row != null:
		start = row.get_global_rect().get_center()
		var mid_before := panel.scroll_vertical
		await _swipe(start, start - Vector2(0, 300), panel.reload)
		await get_tree().create_timer(2.0).timeout
		_report(panel.scroll_vertical > mid_before + 100, "swipe goes on through a reload: %d -> %d" % [
			mid_before, panel.scroll_vertical])
		await _swipe(start - Vector2(0, 300), start + Vector2(0, 300))
		await get_tree().create_timer(2.0).timeout
	else:
		_report(false, "a resource row on screen for the swipe through a reload")

	# A tap opens the row under the finger.
	row = _visible_row(panel)
	if row != null:
		var resource_count := panel._open.size()
		await _swipe(row.get_global_rect().get_center(), row.get_global_rect().get_center())
		await get_tree().process_frame
		_report(panel._open.size() == resource_count + 1, "a tap opens the row")
		await _capture("production_tapped")
		panel._open.clear()
		panel.reload()
	# The end of the page: what used to be unreachable.
	start = Vector2(get_viewport_rect().size.x / 2.0, get_viewport_rect().size.y * 0.8)
	for i: int in 4:
		await _swipe(start, start - Vector2(0, 700))
	await get_tree().create_timer(1.0).timeout
	_report(panel.scroll_vertical > 0, "page scrolled to %d" % panel.scroll_vertical)
	await _capture("production_bottom")


## The first resource row fully on screen, below the top fifth (so a swipe up has room).
func _visible_row(panel: ProductionPanel) -> ListButton:
	var screen := get_viewport_rect()
	var view := panel.get_global_rect()
	for node: Node in panel.find_children("*", "ListButton", true, false):
		var button := node as ListButton
		var rect := button.get_global_rect()
		if button.is_visible_in_tree() and view.encloses(rect) and rect.position.y > screen.size.y * 0.2 \
				and rect.end.y < screen.size.y * 0.8:
			return button
	return null


## A finger from `from` to `to` (canvas px) in steps; `midway` is called half-way.
func _swipe(from: Vector2, to: Vector2, midway: Callable = Callable()) -> void:
	var to_window := get_viewport().get_final_transform()
	var touch := InputEventScreenTouch.new()
	touch.position = to_window * from
	touch.pressed = true
	Input.parse_input_event(touch)
	await get_tree().process_frame
	var steps := 16
	var last := to_window * from
	for step: int in range(1, steps + 1):
		if step == steps / 2 and midway.is_valid():
			midway.call()
		var point := to_window * from.lerp(to, float(step) / steps)
		var drag := InputEventScreenDrag.new()
		drag.position = point
		drag.relative = point - last
		drag.velocity = (point - last) * 60.0
		last = point
		Input.parse_input_event(drag)
		await get_tree().process_frame
	var up := InputEventScreenTouch.new()
	up.position = last
	up.pressed = false
	Input.parse_input_event(up)
	for i: int in 3:
		await get_tree().process_frame


func _report(ok: bool, what: String) -> void:
	print("%s  %s" % ["PASS" if ok else "FAIL", what])
	if not ok:
		_failed = true


func _capture(file_name: String) -> void:
	await get_tree().create_timer(0.6).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	var saved := get_viewport().get_texture().get_image().save_png(path)
	print("%s  %s" % ["SAVED" if saved == OK else "FAIL ", path])
