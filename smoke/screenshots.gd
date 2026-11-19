extends Control
## Saves a picture of each screen, so the UI can be reviewed without a person at the window.
##
## Root script of smoke/screenshots.tscn; run through tools\screenshots.ps1. It has to be a scene
## (not a `-s` script): the screens use the `Services` autoload, which only exists in a normal
## run. The signed-in screens use the development account of tools/dev-account.cjs
## (.local/dev-account.json, created by `node tools/dev-account.cjs`); without it they are skipped.
## The signed-in screens run in the MainShell as the app shows them: Base outside (structure card,
## places), inside (structure navigation, inspect card, build, inventory), the structure details
## with their tabs, the Fleet tab with a structure's details, the Map tab with the galaxy as
## layers, the Profile tab with the enterprise as a layer, and the Back chains between them.
## `--only=map` (tools\screenshots.ps1 -Only map) goes from the colony straight to the system map and
## the galaxy (`--only=galaxy` does the same); `--only=shapes` goes from the opened colony straight to the hull
## shapes in Build.

const DEV_ACCOUNT := "res://.local/dev-account.json"
## No cell found (_free_hull).
const NO_CELL := Vector3i(-9999, -9999, -9999)

var _out_dir := "user://screenshots"


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(_out_dir)

	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	# The server ended the stored session (e.g. a world reset): the login screen says so.
	Services.session.session_ended = true
	var ended_login := LoginScreen.new()
	add_child(ended_login)
	await _capture("login_session_ended")
	ended_login.queue_free()
	Services.session.session_ended = false

	var login := LoginScreen.new()
	add_child(login)
	await _capture("login_sign_in")

	# Reaching into the screen's internals is fine here: this is a review tool, not game code.
	login._register_tab.button_pressed = true
	await _capture("login_register")

	login._on_submit()
	await _capture("login_error")

	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(DEV_ACCOUNT)))
	# Password reset against the server: the development account's address cannot receive mail,
	# so the request is harmless; a made-up code must be refused.
	login._sign_in_tab.button_pressed = true
	login._on_forgot()
	await _capture("login_reset_request")
	if not account.is_empty():
		login._email.text = Wire.as_string(account.get("email"))
		login._on_submit()
		await get_tree().create_timer(3.0).timeout
		await _capture("login_reset_confirm")
		login._code.text = "ABCD-EFGH"
		login._password.text = "Not-the-real-one-1"
		login._on_submit()
		await get_tree().create_timer(3.0).timeout
		await _capture("login_reset_wrong_code")
		print("RESET  wrong code shows: ", login._error.text)
	login.queue_free()
	await get_tree().process_frame

	if account.is_empty():
		print("SKIP  signed-in screens (no %s; run node tools/dev-account.cjs)" % DEV_ACCOUNT)
		get_tree().quit()
		return
	var session := Services.session
	var had_session := not SessionStore.new().load_token(Services.server.base).is_empty()
	var error := await session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("SKIP  signed-in screens (sign-in failed: %s)" % (error.message if error.is_transport() else error.code))
		get_tree().quit()
		return

	var shell := MainShell.new()
	add_child(shell)
	var colony := shell.colony()
	var deadline := Time.get_ticks_msec() + 20000
	while colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	# Ground blocks stream in after the colony.
	await get_tree().create_timer(4.0).timeout
	await _capture("colony")
	print("NAV  Base outside: nav %s, title '%s'" % [shell.nav_visible(), colony._header.title()])
	# The same view at night: windows, lamps and the floodlights' cones around the base. The
	# screen sets the real sun again once the hold-off ends.
	var model := colony._model
	colony._sun_left = 3600.0
	colony._view.set_sun(deg_to_rad(-25.0), deg_to_rad(250.0), model.star_kelvin, model.atmosphere_density,
		model.star_brightness(), model.star_size())
	await _capture("colony_night")
	colony._sun_left = 0.0
	if OS.get_cmdline_user_args().has("--only=map") or OS.get_cmdline_user_args().has("--only=galaxy"):
		await _capture_map(shell)
		await _finish(shell, session, had_session)
		return
	# Outside: a tap on the structure puts its card over it; the head opens the places.
	var home_roof := WorldGrid.to_scene(model.centre_cell(), colony._view.origin, model.size_x) \
		+ Vector3(0.0, ColonyView.HULL_CLOSED_HEIGHT, 0.0)
	colony._on_tap(colony._view._camera.unproject_position(home_roof) / colony._scale())
	await _capture("colony_structure_card")
	print("CARD  single tap selects: %s, card shown: %s" % [colony._structure_selected, colony._card.visible])
	var places := colony.open_places()
	await _until(func() -> bool: return colony._fleet.loaded, 10000)
	await _capture("places")
	print("PLACES  %d listed" % places.place_count())
	shell.handle_back()
	await get_tree().process_frame
	print("BACK  places closed: %s" % (not colony._layer_open(colony._places)))
	# A double tap enters the structure: its own navigation replaces the shell's.
	colony._last_tap_ms = Time.get_ticks_msec()
	colony._on_tap(colony._view._camera.unproject_position(home_roof) / colony._scale())
	await _capture("colony_opened")
	print("ENTER  double tap opened: %s, shell nav %s, structure nav %s" % [colony._opened, shell.nav_visible(),
		colony._structure_nav.visible])
	if OS.get_cmdline_user_args().has("--only=shapes"):
		await _capture_shapes(colony)
		await _finish(shell, session, had_session)
		return

	var layout := colony._model.layout
	var with_module := layout.modules()
	if not with_module.is_empty():
		colony._select(layout.to_absolute(with_module[0].origin))
		await _capture("colony_selected")
	for placed: StructureLayout.Module in with_module:
		if placed.module_type == "MINE":
			colony._select(layout.to_absolute(placed.origin))
			await _ground_ready(colony, layout.to_absolute(placed.origin))
			await _capture("colony_mine")
			print("INSPECT  MINE: %s | %s" % [colony._info.text.replace("\n", " / "), colony._ground.text.replace("\n", " / ")])
			colony._open_recipes(placed)
			await _capture("colony_recipes")
			colony._close_recipes()
			break
	# The other extracting modules and the ground: a pump, a collector (with the air), free
	# ground next to the structure, a hull without module and a cell one level below the ground.
	for kind: String in ["PUMP", "COLLECTOR"]:
		for placed: StructureLayout.Module in with_module:
			if placed.module_type == kind:
				var at := layout.to_absolute(placed.origin)
				colony._select(at)
				await _ground_ready(colony, at)
				await _capture("colony_inspect_" + kind.to_lower())
				print("INSPECT  %s: %s | %s" % [kind, colony._info.text.replace("\n", " / "), colony._ground.text.replace("\n", " / ")])
				break
	var ground_cell := layout.to_absolute(_free_neighbour(layout))
	colony._select(ground_cell)
	await _ground_ready(colony, ground_cell)
	await _capture("colony_inspect_ground")
	print("INSPECT  ground: %s | %s" % [colony._info.text, colony._ground.text.replace("\n", " / ")])
	var free_hull := _free_hull(layout)
	if free_hull != NO_CELL:
		colony._select(layout.to_absolute(free_hull))
		await _ground_ready(colony, layout.to_absolute(free_hull))
		await _capture("colony_inspect_hull")
	if colony._uses_levels() and colony._level_range().x < 0:
		colony._set_level(-1)
		var below := layout.to_absolute(Vector3i(1, 1, -1))
		colony._select(below)
		await _ground_ready(colony, below)
		await _capture("colony_inspect_underground")
		print("INSPECT  level -1: %s | %s" % [colony._info.text, colony._ground.text.replace("\n", " / ")])
		colony._set_level(0)
	colony._select(null)

	colony._set_mode(ColonyScreen.Mode.BUILD)
	await _capture("colony_build_palette")
	colony._palette._on_category("PRODUCTION")
	await _capture("colony_build_palette_production")
	colony._choose_tool("hull:STARTER")
	var free_cell := _free_neighbour(layout)
	colony._select(layout.to_absolute(free_cell))
	await _capture("colony_build_preview")
	# An extracting module says what it would yield on the chosen field.
	if free_hull != NO_CELL:
		colony._choose_tool("module:MINE")
		colony._select(layout.to_absolute(free_hull))
		await _ground_ready(colony, layout.to_absolute(free_hull))
		await _capture("colony_build_yield_mine")
		print("BUILD  mine here: %s" % colony._info.text.replace("\n", " / "))
		colony._choose_tool("module:COLLECTOR")
		colony._select(layout.to_absolute(free_hull))
		await _capture("colony_build_yield_collector")
		print("BUILD  collector here: %s" % colony._info.text.replace("\n", " / "))
	colony._choose_tool("module:SMELTER")
	colony._select(layout.to_absolute(Vector3i(0, 0, 0)))
	await _capture("colony_build_blocked")
	await _capture_shapes(colony)

	colony._set_mode(ColonyScreen.Mode.STORE)
	await _capture("colony_store")
	colony._store._select("IRON")
	colony._store._on_discard(10)
	await _capture("colony_store_discard")
	colony._store._select("")
	await _capture_details(shell, colony)
	await _capture_staff(shell, colony)

	# "×" leaves the structure: outside again with the shell's navigation.
	colony._close_x.pressed.emit()
	await get_tree().process_frame
	print("LEAVE  x closed the structure: %s, shell nav %s" % [not colony._opened, shell.nav_visible()])
	await _dock_screens(shell, colony)
	await _capture_fleet(shell)
	await _capture_map(shell)
	await _capture_profile(shell)
	await _finish(shell, session, had_session)


func _finish(shell: MainShell, session: SessionController, had_session: bool) -> void:
	shell.queue_free()
	if not had_session:
		await session.logout()
	get_tree().quit()


## Docks and a guest on the live server: two docks next to the colony, the founding preview, a
## guest founded by the screen's own Build button, picked by a tap, selected, opened, built on —
## then everything is taken down again, so the account is as before.
func _dock_screens(shell: MainShell, colony: ColonyScreen) -> void:
	var model := colony._model
	var host := model.layout
	if not model.guests.is_empty():
		print("SKIP  dock screens (the colony already has guests)")
		return
	var row := DockBuild.free_pair(host)
	var first := host.to_absolute(row[0])
	var second := host.to_absolute(row[1])
	var beyond := host.to_absolute(row[2])
	var docks := await model.send_ops([
		{"op": "placeHull", "hullType": "DOCK", "x": first.x, "y": first.y, "z": first.z},
		{"op": "placeHull", "hullType": "DOCK", "x": second.x, "y": second.y, "z": second.z},
	])
	print("DOCK  place docks: ", "ok" if docks.is_ok() else docks.error.code)
	if not docks.is_ok():
		return
	await _until(func() -> bool: return host.hull_at(row[1]) == "DOCK")
	# The docks lie at the colony's edge: bring them into the middle of the view above the panel.
	colony._view.look_at_cell(second)
	colony._applied_shift = 0.0
	colony._follow_bars()

	# On the open home structure a hull on a dock founds a guest.
	colony._select_structure(true)
	colony._open_structure(ColonyScreen.Mode.BUILD)
	colony._choose_tool("hull:STARTER")
	colony._select(first)
	await _capture("dock_found_preview")
	colony._on_primary()
	await _until(func() -> bool: return model.guests.size() == 1 and model.guest_list()[0].layout.hull_count() == 1)
	var guest: ColonyModel = model.guest_list()[0] if model.guests.size() == 1 else null
	print("DOCK  guest founded: ", guest != null, "  status: ", colony._status.text)
	if guest == null:
		await _remove_docks(model, first, second)
		return
	await _until(func() -> bool: return not guest.structure_name.is_empty())
	colony._close_structure()
	colony._select_structure(false)
	await _capture("dock_guest_closed")
	# The fleet: the colony and its new guest, the structure on screen marked.
	await _until(func() -> bool: return colony._fleet.fleet.find(guest.structure_id) != null, 10000)
	shell.show_tab(MainShell.Tab.FLEET)
	await _capture("fleet_with_guest")
	shell.show_tab(MainShell.Tab.BASE)

	# A tap on the guest's roof selects the guest, a tap on the home structure the home structure.
	var view := colony._view
	var roof := WorldGrid.to_scene(first + Vector3i(0, 0, 1), view.origin, model.size_x) \
		+ Vector3(0.0, view.lift_of(guest) + ColonyView.HULL_CLOSED_HEIGHT, 0.0)
	colony._last_tap_ms = 0
	colony._on_tap(view._camera.unproject_position(roof) / colony._scale())
	print("DOCK  tap on the guest selects it: ", colony._focus == guest and colony._structure_selected)
	await _capture("dock_guest_selected")
	var home_roof := WorldGrid.to_scene(model.centre_cell(), view.origin, model.size_x) + Vector3(0.0, ColonyView.HULL_CLOSED_HEIGHT, 0.0)
	colony._last_tap_ms = 0
	colony._on_tap(view._camera.unproject_position(home_roof) / colony._scale())
	print("DOCK  tap on the home structure selects it: ", colony._focus == model and colony._structure_selected)
	colony._focus = guest
	colony._select_structure(true)

	# The guest opened on its own: inspect its only hull, build next to it (from the host's
	# store), then try to leave the docks.
	colony._open_structure(ColonyScreen.Mode.VIEW)
	colony._select(first)
	await _capture("dock_guest_inspect")
	colony._set_mode(ColonyScreen.Mode.BUILD)
	colony._choose_tool("hull:STARTER")
	colony._select(second)
	await _capture("dock_guest_build")
	colony._on_primary()
	await _until(func() -> bool: return guest.layout.hull_count() == 2)
	print("DOCK  guest extended: ", guest.layout.hull_count() == 2, "  status: ", colony._status.text)
	colony._select(beyond)
	await _capture("dock_guest_build_blocked")
	colony._set_mode(ColonyScreen.Mode.STORE)
	await _capture("dock_guest_store")
	# Moving goods: give the guest some iron, choose it in its store (the move row shows the
	# host), then send it back.
	var given := await model.transfer_to(guest, "IRON", 5 * model.inventory.scale)
	print("DOCK  iron to the guest: ", given.is_ok())
	await get_tree().create_timer(1.0).timeout
	colony._store._select("IRON")
	await _capture("dock_guest_store_transfer")
	await colony._store._on_transfer(0)
	await _capture("dock_guest_store_transferred")
	print("DOCK  iron back to the host: ", colony._store._discard_status.text)
	colony._close_structure()
	colony._select_structure(false)
	await _capture("dock_guest_extended")

	# Clean up: the guest's last hull removes it, then the docks go.
	if guest.layout.hull_count() > 1:
		var side := await model.send_ops([{"op": "removeHull", "x": second.x, "y": second.y, "z": second.z + 1}])
		print("DOCK  remove the guest's second hull: ", "ok" if side.is_ok() else side.error.code)
		await _until(func() -> bool: return guest.layout.hull_count() == 1)
	var removed := await model.send_ops([{"op": "removeHull", "x": first.x, "y": first.y, "z": first.z + 1}])
	print("DOCK  remove the guest: ", "ok" if removed.is_ok() else removed.error.code)
	await _until(func() -> bool: return model.guests.is_empty())
	await _remove_docks(model, first, second)


## Hull shapes in Build, driven through the screen's own input (touch and mouse): the switch and
## its hint, a rectangle while the finger is still down and after it lifted, a square, a rectangle
## over the structure (its cells ignored), red cells on level 1 (overhang), foreign cells (a
## client-only sample: this account has no foreign neighbour), a second finger taking over the
## camera, and a small rectangle built with Build — then removed again.
func _capture_shapes(colony: ColonyScreen) -> void:
	var model := colony._model
	var layout := model.layout
	var low := Vector2i(1 << 30, 1 << 30)
	var high := -low
	for cell: Vector3i in layout.hull_cells():
		if cell.z == 0:
			var at := layout.to_absolute(cell)
			low = low.min(Vector2i(at.x, at.y))
			high = high.max(Vector2i(at.x, at.y))
	colony._set_level(0)
	colony._set_mode(ColonyScreen.Mode.BUILD)
	colony._choose_tool("hull:STARTER")
	colony._palette._shapes.tab(1).emit_signal("tapped")
	print("SHAPE  switch shown: %s, shape now %d" % [colony._palette.shapes_shown(), colony._shape])
	await _capture("colony_shape_hint")

	# A 6 × 4 rectangle east of the structure, the finger still down.
	var start := Vector3i(high.x + 1, low.y, 0)
	_centre(colony, start + Vector3i(2, 2, 0))
	_touch(colony, 0, start, true)
	for step: int in range(1, 6):
		_drag(colony, 0, start + Vector3i(step, mini(step, 3), 0))
	await _capture("colony_shape_drag")
	print("SHAPE  dragging: badge %s, info: %s" % [colony._shape_badge.texts(), colony._info.text.replace("\n", " / ")])
	_touch(colony, 0, start + Vector3i(5, 3, 0), false)
	await _capture("colony_shape_rectangle")
	print("SHAPE  rectangle: badge %s, build %s (disabled %s)" % [colony._shape_badge.texts(), colony._primary.text,
		colony._primary.disabled])

	# A second finger: the camera, and the rectangle before the drag comes back.
	var focus_before := colony._view.focus
	_touch(colony, 0, start + Vector3i(0, 2, 0), true)
	_drag(colony, 0, start + Vector3i(1, 2, 0))
	_touch(colony, 1, start + Vector3i(3, -2, 0), true)
	_drag(colony, 1, start + Vector3i(4, -3, 0))
	_touch(colony, 1, start + Vector3i(4, -3, 0), false)
	_touch(colony, 0, start + Vector3i(1, 2, 0), false)
	print("SHAPE  two fingers: camera moved %s, rectangle kept %s" % [not colony._view.focus.is_equal_approx(focus_before),
		colony._shape_start == start and colony._shape_end == start + Vector3i(5, 3, 0)])
	colony.recentre()

	# A square with the mouse: left drag marks, right drag pans.
	colony._palette._shapes.tab(2).emit_signal("tapped")
	_centre(colony, start + Vector3i(2, 2, 0))
	_mouse(colony, MOUSE_BUTTON_LEFT, start, true)
	_mouse_move(colony, start + Vector3i(3, 1, 0))
	_mouse(colony, MOUSE_BUTTON_LEFT, start + Vector3i(3, 1, 0), false)
	await _capture("colony_shape_square")
	print("SHAPE  square: badge %s" % [colony._shape_badge.texts()])

	# A rectangle across the structure: its own cells are ignored, the new ones around it count.
	colony._palette._shapes.tab(1).emit_signal("tapped")
	var across := Vector3i(low.x + 1, low.y + 1, 0)
	@warning_ignore("integer_division")
	_centre(colony, Vector3i((low.x + high.x) / 2 + 2, (low.y + high.y) / 2 + 1, 0))
	_touch(colony, 0, across, true)
	_drag(colony, 0, Vector3i(high.x + 2, high.y + 1, 0))
	_touch(colony, 0, Vector3i(high.x + 2, high.y + 1, 0), false)
	await _capture("colony_shape_over_structure")
	print("SHAPE  over the structure: badge %s, info: %s" % [colony._shape_badge.texts(), colony._info.text.replace("\n", " / ")])

	# Level 1: beyond the structure the hulls would hang in the air (overhang): red, skipped.
	colony._set_level(1)
	colony._palette._shapes.tab(1).emit_signal("tapped")
	var upper := Vector3i(high.x - 1, low.y, 1)
	_centre(colony, upper + Vector3i(2, 1, -1))
	_touch(colony, 0, upper, true)
	_drag(colony, 0, upper + Vector3i(4, 2, 0))
	_touch(colony, 0, upper + Vector3i(4, 2, 0), false)
	await _capture("colony_shape_overhang")
	print("SHAPE  level 1: badge %s, info: %s" % [colony._shape_badge.texts(), colony._info.text.replace("\n", " / ")])
	colony._set_level(0)

	# Foreign cells (client-only sample: the account has no foreign neighbour, so two cells are
	# marked as the server would refuse them).
	colony._palette._shapes.tab(1).emit_signal("tapped")
	_centre(colony, start + Vector3i(2, 1, 0))
	_touch(colony, 0, start, true)
	_drag(colony, 0, start + Vector3i(4, 2, 0))
	_touch(colony, 0, start + Vector3i(4, 2, 0), false)
	colony._foreign[start + Vector3i(4, 2, 0)] = true
	colony._foreign[start + Vector3i(4, 1, 0)] = true
	colony._refresh()
	var sample := Label.new()
	sample.text = "CLIENT-ONLY SAMPLE: two foreign cells injected"
	sample.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	sample.position = Vector2(24, 190)
	add_child(sample)
	await _capture("colony_shape_foreign_sample")
	print("SHAPE  foreign (sample): build disabled %s, info: %s" % [colony._primary.disabled, colony._info.text.replace("\n", " / ")])
	sample.queue_free()
	colony._foreign.clear()

	# Built for real: a 3 × 2 rectangle half over the structure's edge, then taken down again.
	var edge := _edge_cell(layout)
	_centre(colony, edge + Vector3i(1, 1, 0))
	_touch(colony, 0, edge, true)
	_drag(colony, 0, edge + Vector3i(2, 1, 0))
	_touch(colony, 0, edge + Vector3i(2, 1, 0), false)
	await _capture("colony_shape_small")
	var placed: Array[Vector3i] = colony._shape_plan.place.duplicate() if colony._shape_plan != null else []
	print("SHAPE  small: badge %s, %s" % [colony._shape_badge.texts(), colony._primary.text])
	colony._on_primary()
	await _until(func() -> bool: return not colony._busy and colony._shape_start == null)
	await _until(func() -> bool:
		for cell: Vector3i in placed:
			if layout.hull_at(layout.to_local(cell)).is_empty():
				return false
		return true)
	await _capture("colony_shape_built")
	print("SHAPE  built: %s" % colony._status.text)
	if not placed.is_empty():
		var removal: Array[Dictionary] = []
		for index: int in range(placed.size() - 1, -1, -1):
			removal.append({"op": "removeHull", "x": placed[index].x, "y": placed[index].y, "z": placed[index].z})
		var removed := await model.send_ops(removal)
		print("SHAPE  removed again: ", "ok" if removed.is_ok() else removed.error.code)
		await _until(func() -> bool: return layout.hull_at(layout.to_local(placed[0])).is_empty())
	colony._palette._shapes.tab(0).emit_signal("tapped")


## A ground-level hull (absolute) with a hull north of it and the 2 × 2 east of both free.
func _edge_cell(layout: StructureLayout) -> Vector3i:
	for cell: Vector3i in layout.hull_cells():
		if cell.z != 0 or layout.hull_at(cell + Vector3i(0, 1, 0)).is_empty():
			continue
		var free := true
		for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(2, 0, 0), Vector3i(1, 1, 0), Vector3i(2, 1, 0)]:
			free = free and layout.hull_at(cell + step).is_empty()
		if free:
			return layout.to_absolute(cell)
	return layout.to_absolute(_free_neighbour(layout))


## Puts an absolute cell in the middle of the room between the head and the bottom.
func _centre(colony: ColonyScreen, cell: Vector3i) -> void:
	colony._view.look_at_cell(cell)
	colony._applied_shift = 0.0
	colony._follow_bars()


## The screen position (in the colony screen) of an absolute cell's floor.
func _screen_point(colony: ColonyScreen, cell: Vector3i) -> Vector2:
	var view := colony._view
	var point := WorldGrid.to_scene(cell, view.origin, colony._model.size_x) + Vector3(0.0, ColonyView.HULL_FLOOR_HEIGHT, 0.0)
	return view._camera.unproject_position(point) / colony._scale()


func _touch(colony: ColonyScreen, index: int, cell: Vector3i, pressed: bool) -> void:
	var event := InputEventScreenTouch.new()
	event.index = index
	event.position = _screen_point(colony, cell)
	event.pressed = pressed
	colony._on_world_input(event)


func _drag(colony: ColonyScreen, index: int, cell: Vector3i) -> void:
	var event := InputEventScreenDrag.new()
	event.index = index
	event.position = _screen_point(colony, cell)
	var before: Vector2 = colony._touches.get(index, event.position)
	event.relative = event.position - before
	colony._on_world_input(event)


func _mouse(colony: ColonyScreen, button: MouseButton, cell: Vector3i, pressed: bool) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = button
	event.pressed = pressed
	event.position = _screen_point(colony, cell)
	colony._on_world_input(event)


func _mouse_move(colony: ColonyScreen, cell: Vector3i) -> void:
	var event := InputEventMouseMotion.new()
	event.position = _screen_point(colony, cell)
	event.relative = Vector2(40, 0)
	colony._on_world_input(event)


func _remove_docks(model: ColonyModel, first: Vector3i, second: Vector3i) -> void:
	var removed := await model.send_ops([
		{"op": "removeHull", "x": first.x, "y": first.y, "z": first.z},
		{"op": "removeHull", "x": second.x, "y": second.y, "z": second.z},
	])
	print("DOCK  remove docks: ", "ok" if removed.is_ok() else removed.error.code)
	await _until(func() -> bool: return model.layout.hull_at(model.layout.to_local(first)).is_empty())


func _until(condition: Callable, timeout_ms: int = 8000) -> void:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline and not condition.call():
		await get_tree().process_frame


## The structure's details over everything (the shell's navigation gives way): production,
## workers, log and research; then Back closes them again.
func _capture_details(shell: MainShell, colony: ColonyScreen) -> void:
	colony._set_mode(ColonyScreen.Mode.VIEW)
	colony._select(null)
	colony._on_title_pressed()
	var details := colony.details()
	await get_tree().create_timer(2.0).timeout
	await _capture("details_production")
	print("DETAILS  open: %s, shell nav %s" % [details != null, shell.nav_visible()])
	if details == null:
		return
	details.show_tab(StructureDetails.Tab.WORKERS)
	await _capture("details_workers")
	details.show_tab(StructureDetails.Tab.LOG)
	await get_tree().create_timer(2.0).timeout
	await _capture("details_log")
	await _capture_research(colony, details)
	# Back closes what is open in the research tab first, then the details.
	while colony.details() != null:
		shell.handle_back()
		await get_tree().process_frame
	print("BACK  details closed: %s, structure still open: %s" % [colony.details() == null, colony._opened])


## The research tab. With a real lab in the structure it aims the lab at the first research
## whose inputs are in the store and shows the progress; a fresh starter has no lab, so after the
## real (empty) state a made-up lab is shown — clearly a sample, nothing is sent for it.
func _capture_research(colony: ColonyScreen, details: StructureDetails) -> void:
	details.show_tab(StructureDetails.Tab.RESEARCH)
	await get_tree().create_timer(3.0).timeout
	await _capture("colony_research")
	var model := colony._model
	var panel := details.research_panel()
	if model.research == null:
		print("RESEARCH  not loaded: ", model.research_error.code if model.research_error != null else "?")
		return
	var catalog := Services.definitions.research
	var labs := model.research.labs_of(model.structure_id)
	print("RESEARCH  %d of %d researched, %d lab(s) here" % [
		catalog.researched_count(model.research.researched), catalog.selectable_count(), labs.size()])
	if not labs.is_empty():
		var lab := labs[0]
		if lab.slots_empty():
			for entry: ResearchCatalog.Tech in catalog.open_for_lab(lab.module_type, model.research.researched):
				if panel._missing_in_store(entry).is_empty():
					panel._choose_target(entry.key)
					await _capture("colony_research_plan")
					panel._on_apply()
					await get_tree().create_timer(4.0).timeout
					await _capture("colony_research_running")
					print("RESEARCH  aimed lab %d at %s: %s" % [lab.module_id, entry.key, panel._status.text])
					break
		return
	# Sample only: a running lab with a hint, and one being planned. Never sent to the server.
	var now := Services.clock.now_ms()
	var running := ResearchState.Lab.from_wire({
		"structureId": model.structure_id, "moduleId": 900001, "moduleType": "RESEARCH_LAB", "slotCount": 3,
		"slots": [{"resource": "COPPER_WIRE", "ratePerHour": 200000000},
			{"resource": "GLASS", "ratePerHour": 200000000}, {"resource": "IRON_PLATE", "ratePerHour": 200000000}],
		"status": "RESEARCHING", "hint": {"category": "HABITATION", "at": now - 60000},
		"progress": {"value": 560000000, "ratePerHour": 3600000000, "at": now, "goal": 900000000,
			"startedAt": now - 560000, "endsAt": now + 340000, "supplyPpb": 1000000000}})
	var idle := ResearchState.Lab.from_wire({
		"structureId": model.structure_id, "moduleId": 900002, "moduleType": "RESEARCH_LAB", "slotCount": 3,
		"slots": [null, null, null], "status": "NO_SLOTS"})
	model.research.apply_lab(running)
	model.research.apply_lab(idle)
	panel._lab_id = 900001
	panel._rebuild()
	print("SAMPLE  research tab with made-up labs (not from the server)")
	await _capture("colony_research_sample")
	panel._choose_lab(900002)
	var open := catalog.open_for_lab("RESEARCH_LAB", model.research.researched)
	if not open.is_empty():
		panel._choose_target(open[0].key)
	await _capture("colony_research_sample_plan")
	panel._lab_id = 0
	await model.reload_research()


## The staff of a module that needs workers: the line on the inspect card, the staffing in the
## structure details, and a plan that fills up with robots (not sent).
func _capture_staff(shell: MainShell, colony: ColonyScreen) -> void:
	colony._set_mode(ColonyScreen.Mode.VIEW)
	var model := colony._model
	var chosen: StructureLayout.Module = null
	for placed: StructureLayout.Module in model.layout.modules():
		if StructureDetails.staffable(Services.definitions.module(placed.module_type)) and not placed.is_building():
			chosen = placed
			if placed.module_type == "RESEARCH_LAB":
				break
	if chosen == null:
		print("STAFF  no module that needs workers")
		return
	colony._select(model.layout.to_absolute(chosen.origin))
	await _capture("colony_staff_line")
	colony._on_staff()
	var details := colony.details()
	await _capture("colony_staff_panel")
	details.workforce_panel()._on_fill(false, true)
	await _capture("colony_staff_plan")
	print("STAFF  %s: %s" % [chosen.module_type, details.workforce_panel()._verdict.text])
	# Back: the staffing, then the details.
	shell.handle_back()
	shell.handle_back()
	await get_tree().process_frame
	colony._select(null)


## The Fleet tab: ships and vehicles first, a structure's details (travel, show in Base, routes),
## the routes tab; a second tap on Fleet returns to the list, Back goes to Base.
func _capture_fleet(shell: MainShell) -> void:
	shell.show_tab(MainShell.Tab.FLEET)
	var panel := shell.stack(MainShell.Tab.FLEET).root() as FleetPanel
	await _until(func() -> bool: return shell.colony()._fleet.loaded, 10000)
	await _capture("fleet")
	var fleet := shell.colony()._fleet
	var entries := fleet.fleet.entries()
	if not entries.is_empty():
		var detail := panel.open_detail(entries[0].structure_id)
		await _capture("fleet_detail")
		print("FLEET  detail of %s: travel %s (%s)" % [entries[0].name,
			"offered" if not detail._travel_button.disabled else "not offered", detail._travel_note.text])
		shell.nav().entry(MainShell.Tab.FLEET).pressed.emit()
		await get_tree().process_frame
		print("FLEET  second tap returns to the list: %s" % (shell.stack(MainShell.Tab.FLEET).depth() == 0))
	panel._show_tab(true)
	await _capture("fleet_routes")
	panel._show_tab(false)
	shell.handle_back()
	print("BACK  from Fleet to Base: %s" % (shell.active_tab() == MainShell.Tab.BASE))


## The Profile tab: the player, the enterprise card, the account; the enterprise as a layer;
## "sign out" armed (not sent); Back closes the layer, then returns to Base.
func _capture_profile(shell: MainShell) -> void:
	shell.show_tab(MainShell.Tab.PROFILE)
	var profile := shell.stack(MainShell.Tab.PROFILE).root() as ProfileScreen
	await get_tree().create_timer(2.0).timeout
	await _capture("profile")
	profile.open_enterprise()
	await get_tree().create_timer(2.0).timeout
	await _capture("profile_enterprise")
	shell.handle_back()
	await get_tree().process_frame
	print("BACK  enterprise closed, still on Profile: %s" % (profile.enterprise_panel() == null
		and shell.active_tab() == MainShell.Tab.PROFILE))
	profile._on_sign_out()
	await _capture("profile_sign_out_armed")
	shell.handle_back()
	print("BACK  disarms sign-out: %s" % (not profile.is_sign_out_armed()))
	shell.handle_back()
	print("BACK  from Profile to Base: %s" % (shell.active_tab() == MainShell.Tab.BASE))
	# The performance display: on for a few seconds over the colony, then the copied report.
	var was_on := AppSettings.performance_display()
	shell.show_tab(MainShell.Tab.PROFILE)
	if not was_on:
		profile._on_performance()
	await _capture("profile_performance")
	shell.show_tab(MainShell.Tab.BASE)
	await get_tree().create_timer(4.0).timeout
	await _capture("colony_performance")
	profile._on_copy_report()
	print("PERF  report:\n%s" % PerfOverlay.current.report())
	if not was_on:
		profile._on_performance()


## The system map: the whole system, the home planet up close and selected, a giant with its
## moons, a moon, time-lapse; then Back returns to Base.
func _capture_map(shell: MainShell) -> void:
	shell.colony()._select_structure(false)
	shell.show_tab(MainShell.Tab.MAP)
	var screen := shell.stack(MainShell.Tab.MAP).root() as MapScreen
	await _capture("map_loading")
	await _until(func() -> bool: return screen._map != null or screen._state.visible and screen._state.mouse_filter == Control.MOUSE_FILTER_STOP, 15000)
	await get_tree().create_timer(1.0).timeout
	await _capture("map_overview")
	var map := screen._map
	if map == null:
		print("MAP  not loaded")
		shell.show_tab(MainShell.Tab.BASE)
		return
	print("MAP  %s: %d bodies, extent %.0f, fit zoom %.3f" % [map.star_name, map.bodies.size(), map.extent, screen._view.zoom()])
	for body: SystemMap.Body in map.star_orbits():
		print("MAP    %-24s %6.2f AU -> ring %6.1f, reach %5.1f, marker %4.1f" % [body.name, body.orbit_au, body.ring, body.reach(), body.marker])
	var home := Services.session.account.home_body_id
	screen._view.focus_body(home)
	await _capture("map_zoomed")
	screen._select(home)
	await _capture("map_selected")
	for body: SystemMap.Body in map.bodies:
		if body.type == "GAS_GIANT" or body.type == "ICE_GIANT":
			screen._view.focus_body(body.id)
			screen._select(body.id)
			await _capture("map_giant")
			if not body.moons.is_empty():
				screen._select(body.moons[body.moons.size() - 1])
				await _capture("map_moon")
			break
	screen._select("")
	screen._view.fit()
	screen._lapse_button.button_pressed = true
	await get_tree().create_timer(3.0).timeout
	await _capture("map_time_lapse")
	screen._lapse_button.button_pressed = false
	await _capture_galaxy(shell, screen)
	shell.handle_back()
	await get_tree().process_frame
	print("MAP  Back from the map root returns to Base: ", shell.active_tab() == MainShell.Tab.BASE)

	# The error state: a system the server does not know.
	var broken := MapScreen.new()
	broken.setup("sys-0_0_0-999999", home)
	add_child(broken)
	await _until(func() -> bool: return broken._state.mouse_filter == Control.MOUSE_FILTER_STOP, 15000)
	await _capture("map_error")
	broken.queue_free()


## The galaxy from the home system's map: the neighbourhood of home, the whole spiral, a middle
## zoom, a selected system and the map of a foreign system; then Back step by step to the map.
func _capture_galaxy(shell: MainShell, map: MapScreen) -> void:
	map._on_galaxy()
	var galaxy := map.galaxy()
	await _capture("galaxy_loading")
	await _until(func() -> bool: return galaxy._shape != null or galaxy._state.mouse_filter == Control.MOUSE_FILTER_STOP, 15000)
	if galaxy._shape == null:
		await _capture("galaxy_error")
		print("GALAXY  not loaded")
		map._close_galaxy()
		return
	# The systems around home load after the camera rested; the glow is computed meanwhile.
	await get_tree().create_timer(1.0).timeout
	await _until(func() -> bool: return not galaxy._loading and galaxy._glow_task < 0, 30000)
	await _capture("galaxy_near_home")
	var view := galaxy._view
	print("GALAXY  %s: home %s, own systems %d, visible radius %.0f ly, %d stars loaded, status: %s" % [
		galaxy._shape.galaxy_name, galaxy._home_system, galaxy._own.size(), view.visible_radius(),
		galaxy._store.entries().size(), galaxy._status.text])
	if galaxy._last != null:
		print("GALAXY  last sphere: radius %.1f, covered %.1f, truncated %s, rows %d" % [
			galaxy._last.radius, galaxy._last.covered, galaxy._last.truncated, galaxy._last.rows])
	print("GALAXY  stand-in stars %d, real stars %d" % [view._field.multimesh.instance_count, view._stars.multimesh.instance_count])
	await _galaxy_load_test(galaxy)
	# Sample only: the stars failed to load (made up, nothing sent).
	galaxy._load_error = ApiError.transport("sample")
	galaxy._show_status()
	await _capture("galaxy_stars_failed")
	print("SAMPLE  galaxy: star loading error (made up, not from the server)")
	galaxy._load_error = null
	# The rim of the galaxy, where the server has few or no systems (empty state).
	view.look_at_point(Vector2(galaxy._shape.view_extent(), 0.0), 150.0)
	await get_tree().create_timer(1.0).timeout
	await _until(func() -> bool: return not galaxy._loading, 20000)
	await _capture("galaxy_rim")
	print("GALAXY  rim: ", galaxy._status.text)

	galaxy._on_show_all()
	await get_tree().create_timer(1.0).timeout
	await _capture("galaxy_far")
	print("GALAXY  whole galaxy: %.1f ly/px, %d stand-in stars" % [view.units_per_px(), view._field.multimesh.instance_count])
	if galaxy._home != null:
		view.look_at_point(Vector2(galaxy._home.position.x, galaxy._home.position.y), 4000.0)
		await get_tree().create_timer(1.0).timeout
		await _capture("galaxy_middle")
		view.look_at_point(Vector2(galaxy._home.position.x, galaxy._home.position.y), 600.0)
		await get_tree().create_timer(1.0).timeout
		await _capture("galaxy_close")
		print("GALAXY  middle zoom: %d stand-in stars" % view._field.multimesh.instance_count)
	galaxy._on_home()
	await get_tree().create_timer(1.0).timeout
	await _until(func() -> bool: return not galaxy._loading, 20000)

	# A foreign system: the nearest star to home that is not home.
	var foreign := ""
	var best := INF
	for entry: GalaxySystems.Entry in galaxy._store.entries():
		if entry.id == galaxy._home_system or galaxy._home == null:
			continue
		var distance := entry.position.distance_to(galaxy._home.position)
		if distance < best:
			best = distance
			foreign = entry.id
	if foreign.is_empty():
		print("GALAXY  no foreign system loaded; the home system stands in")
		galaxy._select(galaxy._home_system)
		await _capture("galaxy_selected")
	else:
		galaxy._select(foreign)
		await _capture("galaxy_selected")
		print("GALAXY  selected %s (%.1f ly from home)" % [foreign, best])
		galaxy._open_system(foreign)
		var system_map := galaxy.system_map()
		await _until(func() -> bool: return system_map._map != null or system_map._state.mouse_filter == Control.MOUSE_FILTER_STOP, 15000)
		await get_tree().create_timer(1.0).timeout
		await _capture("galaxy_foreign_system")
		shell.handle_back()
		await get_tree().process_frame
		print("GALAXY  Back from the foreign map returns to the galaxy: ", galaxy.system_map() == null)
	shell.handle_back()
	shell.handle_back()
	await get_tree().process_frame
	print("GALAXY  Back twice more returns to the system map: ",
		map.galaxy() == null and shell.stack(MainShell.Tab.MAP).top() == map)


## The heaviest answer there is: 200 ly around the galactic centre (20 000 rows, truncated).
## Measures download, parsing and drawing it here on the main thread (the screen parses on a
## worker), checks how far the cut answer counts as covered, then restores the view.
func _galaxy_load_test(galaxy: GalaxyScreen) -> void:
	var view := galaxy._view
	var started := Time.get_ticks_msec()
	var raw := await Services.api.get_text("/v2/galaxy/systems?" + GalaxyCamera.query(Vector3.ZERO, 200.0), "application/x-ndjson")
	var fetched := Time.get_ticks_msec() - started
	if not raw.is_ok():
		print("GALAXY  core sphere failed: ", raw.error.code)
		return
	started = Time.get_ticks_msec()
	var stream := Ndjson.parse(raw.body)
	var parsed := Time.get_ticks_msec() - started
	started = Time.get_ticks_msec()
	var answer := GalaxySystems.from_stream(stream, Vector3.ZERO, 200.0, galaxy._shape.sector_size)
	var read := Time.get_ticks_msec() - started
	print("GALAXY  core sphere r=200: %d rows (end line %d), truncated %s, covered %.1f ly; %d KB, fetch %d ms, parse %d ms, entries %d ms" % [
		answer.entries.size(), answer.rows, answer.truncated, answer.covered, roundi(raw.body.length() / 1024.0), fetched, parsed, read])
	started = Time.get_ticks_msec()
	view.set_systems(answer.entries, GalaxySystems.area_density(answer))
	var built := Time.get_ticks_msec() - started
	started = Time.get_ticks_msec()
	view._size_stars()
	var sized := Time.get_ticks_msec() - started
	print("GALAXY  20 000 stars: buffer %d ms, resize on zoom %d ms" % [built, sized])
	view.set_systems(galaxy._store.entries(), GalaxySystems.area_density(galaxy._last))
	view.look_at_point(view.centre(), 3000.0)
	view._field_range = Rect2i()
	view._field_cells.clear()
	started = Time.get_ticks_msec()
	view._update_field(view.visible_radius())
	print("GALAXY  stand-in stars at 3000 ly from scratch: %d in %d ms" % [view._field.multimesh.instance_count, Time.get_ticks_msec() - started])
	view.look_at_point(view.centre(), GalaxyCamera.HOME_RADIUS)


## A hull of the ground level without a module (local); NO_CELL when every hull carries one.
func _free_hull(layout: StructureLayout) -> Vector3i:
	for cell: Vector3i in layout.hull_cells():
		if cell.z == 0 and layout.module_at(cell) == null and layout.hull_at(cell) == "STARTER":
			return cell
	return NO_CELL


## Waits until the ground (with its deposits) under an absolute cell is loaded.
func _ground_ready(colony: ColonyScreen, cell: Vector3i) -> void:
	await _until(func() -> bool: return colony._model.ground_cell(cell) != null, 8000)


## A free cell next to the structure, for the build preview.
func _free_neighbour(layout: StructureLayout) -> Vector3i:
	for cell: Vector3i in layout.hull_cells():
		for step: Vector3i in [Vector3i(1, 0, 0), Vector3i(0, -1, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0)]:
			if layout.hull_at(cell + step).is_empty():
				return cell + step
	return Vector3i(-1, 0, 0)


func _capture(file_name: String) -> void:
	await get_tree().create_timer(0.6).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	var saved := get_viewport().get_texture().get_image().save_png(path)
	print("%s  %s" % ["SAVED" if saved == OK else "FAIL ", path])
