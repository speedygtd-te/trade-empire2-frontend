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
## shapes in Build; `--only=storage` to a storage module in Inspect, switched for real (with
## `--account=<name>` for an account whose store has room, e.g. `routes`); `--only=inspect` to the
## inspect card (module, empty hull, "More", armed removal, fields near the edges, Back), e.g. with
## `--account=showcase`.

const DEV_ACCOUNT := "res://.local/dev-account.json"
## The account of `--only=probes_live` (fresh draft.31 accounts own probes and launchers).
const PROBES_ACCOUNT := "res://.local/probes2-account.json"
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

	var account_path := PROBES_ACCOUNT if OS.get_cmdline_user_args().has("--only=probes_live") else DEV_ACCOUNT
	# `--account=<name>`: another account of tools/dev-account.cjs (.local/<name>-account.json),
	# e.g. one whose store has room for `--only=storage` to switch for real.
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--account="):
			account_path = "res://.local/%s-account.json" % argument.trim_prefix("--account=")
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(account_path)))
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
	if OS.get_cmdline_user_args().has("--only=inspect"):
		await _capture_inspect(shell, colony)
		await _finish(shell, session, had_session)
		return
	if OS.get_cmdline_user_args().has("--only=shapes"):
		await _capture_shapes(colony)
		await _finish(shell, session, had_session)
		return
	if OS.get_cmdline_user_args().has("--only=telescope"):
		await _capture_telescope(colony)
		await _finish(shell, session, had_session)
		return
	if OS.get_cmdline_user_args().has("--only=storage"):
		await _capture_storage(colony)
		await _finish(shell, session, had_session)
		return
	if OS.get_cmdline_user_args().has("--only=fog"):
		await _capture_fog(colony)
		await _finish(shell, session, had_session)
		return
	if OS.get_cmdline_user_args().has("--only=probes_live"):
		await _capture_probes_live(shell, colony)
		await _finish(shell, session, had_session)
		return
	if OS.get_cmdline_user_args().has("--only=probes"):
		await _capture_probes(shell, colony)
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
	await _capture_telescope(colony)
	await _capture_storage(colony)
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
	# A staircase: every free hull of the level cyan or red (no hull above on a flat colony).
	colony._choose_tool("module:STAIRCASE")
	colony._select(null)
	await _capture("colony_shaft_spots")
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
	await _capture_production(colony, details)
	details.show_tab(StructureDetails.Tab.WORKERS)
	await _capture("details_workers")
	await _capture_blueprints(colony, details)
	details.show_tab(StructureDetails.Tab.LOG)
	await get_tree().create_timer(2.0).timeout
	await _capture("details_log")
	await _capture_research(colony, details)
	# Back closes what is open in the research tab first, then the details.
	while colony.details() != null:
		shell.handle_back()
		await get_tree().process_frame
	print("BACK  details closed: %s, structure still open: %s" % [colony.details() == null, colony._opened])


## The Production tab: the real balance with a resource opened (who makes and uses it), the
## "Short" filter; then, because a fresh starter runs short of nothing, a made-up balance with
## short resources — clearly a sample, never sent — and the real one loaded again.
func _capture_production(colony: ColonyScreen, details: StructureDetails) -> void:
	var model := colony._model
	var panel := details.production_panel()
	var lines := PackedStringArray()
	var opened := ""
	for row: ProductionBalance.Row in model.totals:
		lines.append("%s %+d" % [row.resource, row.net])
		if opened.is_empty() and row.consumed > 0:
			opened = row.resource
	print("PRODUCTION  totals: %s | population %s | coverage %d" % [", ".join(lines), model.population,
		model.life_support_coverage])
	if not opened.is_empty():
		panel.set_open(opened, true)
		await _capture("details_production_open")
		panel.set_open(opened, false)
	panel.set_filter(ProductionPanel.Filter.SHORT)
	await _capture("details_production_short")
	panel.set_filter(ProductionPanel.Filter.ALL)
	var real_totals := model.totals
	var real_flows := model.production_flows
	var real_population := model.population
	var scale := Services.definitions.fixed_point_scale
	model.totals = ProductionBalance.totals_from_wire([
		{"resource": "COPPER", "producedPerHour": 0, "consumedPerHour": 6 * scale, "taxedPerHour": 0, "netPerHour": -6 * scale},
		{"resource": "IRON", "producedPerHour": 78 * scale, "consumedPerHour": 40 * scale, "taxedPerHour": 4 * scale, "netPerHour": 38 * scale},
		{"resource": "OXYGEN", "producedPerHour": 25 * scale, "consumedPerHour": 85 * scale, "taxedPerHour": 0, "netPerHour": -60 * scale},
		{"resource": "WATER", "producedPerHour": 20 * scale, "consumedPerHour": 20 * scale, "taxedPerHour": 0, "netPerHour": 0},
		{"resource": "IRON_PLATE", "producedPerHour": 20 * scale, "consumedPerHour": 0, "taxedPerHour": 0, "netPerHour": 20 * scale},
	])
	model.production_flows = ProductionBalance.flows_from_wire([
		{"moduleType": "SMELTER", "modules": 2, "inputs": [{"resource": "COPPER", "effective": 6 * scale},
			{"resource": "IRON", "effective": 40 * scale}], "outputs": [{"resource": "IRON_PLATE", "effective": 20 * scale}]},
		{"moduleType": "COLLECTOR", "modules": 1, "inputs": [], "outputs": [{"resource": "OXYGEN", "effective": 25 * scale}]},
		{"moduleType": "LIFE_SUPPORT", "modules": 1, "inputs": [{"resource": "OXYGEN", "effective": 85 * scale}], "outputs": []},
	])
	model.population = [12, 3, 0, 0, 0]
	panel.set_open("OXYGEN", true)
	print("SAMPLE  production tab with a made-up balance (not from the server)")
	await _capture("details_production_sample")
	panel.set_open("OXYGEN", false)
	model.totals = real_totals
	model.production_flows = real_flows
	model.population = real_population
	panel.reload()


## The Blueprints tab against the server: closed rows, the mines opened, the recipe list of the
## mines' group; then the group's blueprint is cleared through the tab (a "None" group in amber,
## the tab's badge, the result line), the recipe list of the "None" group, and the old blueprint
## set again the same way — the account is as before.
func _capture_blueprints(colony: ColonyScreen, details: StructureDetails) -> void:
	details.show_tab(StructureDetails.Tab.BLUEPRINTS)
	var panel := details.blueprints_panel()
	await _capture("details_blueprints")
	var model := colony._model
	var mine: StructureLayout.Module = null
	for placed: StructureLayout.Module in model.layout.modules():
		if placed.module_type == "MINE" and not placed.blueprint.is_empty():
			mine = placed
			break
	if mine == null:
		print("BLUEPRINTS  no mine with a blueprint")
		return
	var before := mine.blueprint
	panel.set_open("MINE", true)
	await _capture("details_blueprints_open")
	panel.open_picker("MINE", before)
	await _ground_ready(colony, model.layout.to_absolute(mine.origin))
	panel.open_picker("MINE", before)
	await _capture("details_blueprints_picker")
	print("BLUEPRINTS  picker for MINE/%s, Back closes it: %s" % [before, details.handle_back() and not panel.is_picking()])
	var mine_id := mine.module_id
	panel._on_chosen("")
	await _until(func() -> bool: return model.layout.module(mine_id).blueprint.is_empty() and not panel._busy, 10000)
	await get_tree().create_timer(1.5).timeout
	await _capture("details_blueprints_none")
	print("BLUEPRINTS  cleared: %s | badge %s" % [panel.status_text(), details.nav().has_badge(StructureDetails.Tab.BLUEPRINTS)])
	panel.open_picker("MINE", "")
	await _capture("details_blueprints_picker_none")
	panel._on_chosen(before)
	await _until(func() -> bool: return model.layout.module(mine_id).blueprint == before and not panel._busy, 10000)
	await get_tree().create_timer(1.5).timeout
	await _capture("details_blueprints_result")
	print("BLUEPRINTS  set again: %s | badge %s" % [panel.status_text(), details.nav().has_badge(StructureDetails.Tab.BLUEPRINTS)])
	# The yield line over many spots, with made-up numbers (the starter has one mine only).
	var span := BlueprintGroups.YieldSpan.new()
	span.resource = "IRON"
	span.spots = 6
	span.working = 4
	span.low_richness = 21
	span.high_richness = 48
	span.low_rate = 21000000
	span.high_rate = 48000000
	print("SAMPLE  yield over 6 spots: %s" % panel._span_text(span))


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
	panel._show_tab(FleetPanel.TAB_ROUTES)
	await _capture("fleet_routes")
	panel._show_tab(FleetPanel.TAB_STRUCTURES)
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
	# Scrolled down to the performance panel (display, report, high-detail models).
	for found: Node in profile.find_children("*", "ScrollContainer", true, false):
		(found as ScrollContainer).scroll_vertical = 100000
	await _capture("profile_performance")
	# The status line of the high-detail package while it downloads and after a failure (here
	# the models are built in, so both are made up).
	var hd := Services.hd_package
	var real := hd.package
	var sample := HdPackage.new()
	sample.set_eligibility(true, true)
	sample.check_started()
	sample.download_started(35062744)
	sample.progress(14025000)
	hd.package = sample
	print("SAMPLE  high-detail package downloading, then failed (made up, models are built in)")
	await _capture("profile_hd_downloading")
	sample.failed(Time.get_ticks_msec())
	await _capture("profile_hd_failed")
	hd.package = real
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
	# The rest of the details (physics, draft.30): scrolled down.
	await get_tree().process_frame
	screen._details._scroll.scroll_vertical = 140
	await _capture("map_selected_scrolled")
	print("MAP  star %s, catalog %s, habitable zone %s AU, frost line %.3f AU" % [map.star.spectral_class,
		map.star.catalog, map.star.habitable_zone_au, map.star.frost_line_au])
	for body: SystemMap.Body in map.bodies:
		var physics := body.physics
		print("MAP    %-24s %-11s %7s °C  %s" % [body.name, body.type,
			BodyPhysics.celsius(SystemMap.number(Wire.as_dict(body.data.get("environment")).get("temperature"))),
			"physics: %s Earth masses, %s g/cm3, %s AU, flux %s, Teq %s °C" % [BodyPhysics.figure(physics.mass_earth),
			BodyPhysics.figure(physics.density), BodyPhysics.figure(physics.star_distance_au), BodyPhysics.figure(physics.flux),
			BodyPhysics.celsius(physics.equilibrium_c)] if physics != null else "no physics"])
	# The outermost body: beyond the frost line (when the star has one).
	var outermost := map.star_orbits()[map.star_orbits().size() - 1]
	screen._view.focus_body(outermost.id)
	screen._select(outermost.id)
	await _capture("map_outer")
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
	await _until(func() -> bool: return not galaxy._sight_loading, 8000)
	if galaxy._sight != null:
		for observation: Sight.Observation in galaxy._sight.observations:
			print("SIGHT  sphere %s r=%.1f ly at (%.1f, %.1f, %.1f)" % [observation.source, observation.radius_ly,
				observation.centre.x, observation.centre.y, observation.centre.z])
		print("SIGHT  %d circles on screen; line: %s" % [view._circles.size(), galaxy._sight_line.text])
	else:
		print("SIGHT  not loaded: ", galaxy._sight_error.code if galaxy._sight_error != null else "-")
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


## A telescope in Inspect (when the account has one): level, range and the next level from the
## server; Upgrade sent for real (the server starts it or refuses, e.g. INSUFFICIENT_STOCK on a
## fresh account); then, made up and never sent, an affordable next level and a running upgrade.
func _capture_telescope(colony: ColonyScreen) -> void:
	var layout := colony._model.layout
	var scope_module: StructureLayout.Module = null
	for placed: StructureLayout.Module in layout.modules():
		if Sight.is_telescope(placed.module_type):
			scope_module = placed
			break
	if scope_module == null:
		print("TELESCOPE  none in this structure (place one to see the inspect card)")
		return
	var at := layout.to_absolute(scope_module.origin)
	colony._select(at)
	await _until(func() -> bool: return colony._model.telescope(scope_module.module_id) != null, 8000)
	await _capture("colony_inspect_telescope")
	print("TELESCOPE  %s | %s | button '%s' disabled %s" % [colony._scope.text.replace("\n", " / "),
		colony._scope_next.text.replace("\n", " / "), colony._secondary.text, colony._secondary.disabled])
	var scope := colony._model.telescope(scope_module.module_id)
	if scope == null:
		return
	# For real: the server starts the upgrade or says why not.
	if not scope.is_upgrading() and scope.has_next():
		await colony._upgrade_telescope(scope_module)
		await get_tree().create_timer(1.5).timeout
		await _capture("colony_inspect_telescope_sent")
		print("TELESCOPE  upgrade sent: %s | %s" % [colony._status.text, colony._scope.text.replace("\n", " / ")])
		scope = colony._model.telescope(scope_module.module_id)
	if scope.is_upgrading():
		print("TELESCOPE  upgrading to %d, completes at %d (now %d)" % [scope.upgrade_to, scope.completes_at, Services.clock.now_ms()])
		return
	# Samples only (made up, nothing sent): a store that holds the cost, then a running upgrade.
	var saved_cost := scope.next_cost
	var cheap: Array[Sight.Cost] = []
	for cost: Sight.Cost in saved_cost:
		var small := Sight.Cost.new()
		small.resource = cost.resource
		small.amount = 1000000
		cheap.append(small)
	scope.next_cost = cheap
	colony._status.text = ""
	colony._refresh()
	await _capture("colony_inspect_telescope_ready_sample")
	print("SAMPLE  telescope affordable: button disabled %s" % colony._secondary.disabled)
	scope.next_cost = saved_cost
	scope.upgrade_to = scope.level + 1
	scope.completes_at = Services.clock.now_ms() + scope.next_duration_ms
	colony._refresh()
	await _capture("colony_inspect_telescope_upgrading_sample")
	print("SAMPLE  telescope upgrading: %s" % colony._scope.text.replace("\n", " / "))
	scope.upgrade_to = 0
	colony._model.reload_telescopes()
	colony._select(null)


## A storage module in Inspect (when the structure has one): its mode and size, then switched for
## real to the other area and back (`setStorageMode`) — the card while sending, with the result,
## and the Inventory tab's row for the same module in between. A store too full for the switch
## shows the server's refusal; then the other mode is only a sample (made up, never sent).
func _capture_storage(colony: ColonyScreen) -> void:
	var layout := colony._model.layout
	var store_module: StructureLayout.Module = null
	for placed: StructureLayout.Module in layout.modules():
		if colony._switches_storage(placed):
			store_module = placed
			break
	if store_module == null:
		print("STORAGE  none in this structure (place one to see the inspect card)")
		return
	var at := layout.to_absolute(store_module.origin)
	var start_mode := store_module.storage_mode
	colony._select(at)
	await _capture("colony_inspect_storage")
	print("STORAGE  %s | button '%s'" % [colony._scope.text, colony._secondary.text])
	# While sending (held as a sample: the server answers before a picture is taken).
	colony._busy = true
	colony._status.text = tr("COLONY_SENDING")
	colony._refresh()
	await _capture("colony_inspect_storage_sending_sample")
	print("SAMPLE  sending: %s | button disabled %s" % [colony._status.text, colony._secondary.disabled])
	colony._busy = false
	for step: int in 2:
		var to := StorePanel.other_mode(store_module)
		await colony._switch_storage(store_module)
		store_module = colony._model.layout.module(store_module.module_id)
		await _capture("colony_inspect_storage_switched_%d" % step)
		print("STORAGE  to %s: %s | %s | button '%s'" % [to, colony._status.text, colony._scope.text, colony._secondary.text])
		if store_module.storage_mode != to:
			# Refused (e.g. the store is too full): the other mode as a sample only.
			store_module.storage_mode = to
			colony._status.text = ""
			colony._refresh()
			await _capture("colony_inspect_storage_other_sample")
			print("SAMPLE  storage as %s: %s | button '%s'" % [to, colony._scope.text, colony._secondary.text])
			store_module.storage_mode = start_mode
			colony._refresh()
			break
		if step == 0:
			# The Inventory tab lists the same module with the new mode.
			colony._set_mode(ColonyScreen.Mode.STORE)
			await get_tree().process_frame
			colony._store._scroll.scroll_vertical = int(colony._store._list.size.y)
			await _capture("colony_store_storage_modules")
			print("STORAGE  inventory tab: %s" % _storage_rows(colony._store))
			colony._set_mode(ColonyScreen.Mode.VIEW)
			colony._select(at)
	print("STORAGE  back to %s: %s" % [start_mode, colony._model.layout.module(store_module.module_id).storage_mode == start_mode])
	colony._status.text = ""
	colony._select(null)


## The texts of the Inventory tab's storage module rows.
func _storage_rows(store: StorePanel) -> String:
	var texts := PackedStringArray()
	for row: Node in store._list.get_children():
		if row is HBoxContainer and row.get_child_count() == 2 and row.get_child(0) is Label:
			texts.append((row.get_child(0) as Label).text)
	return " / ".join(texts)


## The surface fog of draft.31 on the live server: a fresh base sees 1 000 cells around itself, so
## the camera goes to the edge of that circle (east of the base), close and far; then a tap on an
## unexplored cell (the structure is open) shows what Inspect says there.
func _capture_fog(colony: ColonyScreen) -> void:
	var model := colony._model
	var centre := model.centre_cell()
	# The explored circle around the base ends 1 000 fields east of the base's origin.
	var origin := model.layout.to_absolute(Vector3i.ZERO)
	var edge := Vector3i(origin.x - 997, origin.y, 0)
	_centre(colony, edge)
	colony._view.zoom = 14.0
	colony._view._update_camera()
	await _until(func() -> bool: return model.surface.is_loaded(model.surface.block_of(edge.x, edge.y)), 10000)
	await get_tree().create_timer(3.0).timeout
	await _capture("colony_fog_edge")
	print("FOG  edge at %s: hidden %s, inside hidden %s" % [edge, model.surface.is_hidden(edge.x + 8, edge.y),
		model.surface.is_hidden(edge.x - 8, edge.y)])
	colony._view.zoom = ColonyView.ZOOM_MAX
	colony._view._update_camera()
	model.ensure_surface(edge)
	await get_tree().create_timer(4.0).timeout
	await _capture("colony_fog_far")
	colony._view.zoom = ColonyView.ZOOM_DEFAULT
	colony._view._update_camera()
	var unknown := Vector3i(edge.x + 6, edge.y, 0)
	colony._select(unknown)
	await get_tree().create_timer(1.5).timeout
	await _capture("colony_inspect_unexplored")
	print("FOG  inspect unexplored: %s | %s" % [colony._info.text, colony._ground.text])
	colony._select(null)
	colony.recentre()


## Probes and exploration (draft.31). Live: the reveal of the home body, a landing site in the fog
## (travel site picker), the body panel's explored line, the empty probe list. Made up and marked
## SAMPLE (a fresh account has no launcher or probe, and nobody seen): a solar panel shown as a
## launcher (its card without and with probes in store), the target choice (Launch is sent for
## real: the server refuses, the module is no launcher), a probe area, a drive and a foreign
## structure near the base, the probe list with a probe under way and one arrived, the explored
## ground of the body, the notice of an arrival. Everything made up is put back.
func _capture_probes(shell: MainShell, colony: ColonyScreen) -> void:
	var model := colony._model
	var fleet := colony._fleet
	var probes := fleet.probes
	await _until(func() -> bool: return fleet.loaded, 10000)
	print("PROBES  supported: %s" % probes.supported())
	var live := await probes.load_reveal(model.body_id)
	print("PROBES  live reveal: %s" % ("none" if live == null else "fog %s, %d areas, %d sightings" % [
		live.fog, live.areas.size(), live.sightings.size()]))
	var centre := model.centre_cell()

	# Live: a landing site in the fog is refused before the server is asked.
	var site := TravelSiteScreen.new()
	site.setup(model, TravelSiteScreen.MODE_LAND, model.body_id, fleet)
	ScreenStack.push_onto(colony, site)
	await _until(func() -> bool: return not site._loading.visible, 15000)
	await get_tree().create_timer(1.0).timeout
	var fogged := Vector2i(centre.x + 1003, centre.y)
	site._suggested = false
	site._site = fogged
	site._view.zoom = 16.0
	site._view.look_at_cell(Vector3i(fogged.x, fogged.y, 0))
	site._show_site()
	await get_tree().create_timer(4.0).timeout
	await _capture("probe_site_unexplored")
	print("SITE  in the fog: %s | client ok %s" % [site._hint.text, site._client_ok])
	ScreenStack.close_layer(site)
	await get_tree().process_frame

	# Live: the probe list (empty on a fresh account).
	shell.show_tab(MainShell.Tab.FLEET)
	var panel := shell.stack(MainShell.Tab.FLEET).root() as FleetPanel
	panel.show_probes()
	await _until(func() -> bool: return probes.loaded or probes.error != null, 8000)
	await _capture("probe_list_live")
	print("PROBES  live list: %d, tab shown %s" % [probes.list.probes.size(), panel._probes_tab.visible])

	# Live: the explored line of the home body on the system map.
	shell.show_tab(MainShell.Tab.MAP)
	var map_screen := shell.stack(MainShell.Tab.MAP).root() as MapScreen
	await _until(func() -> bool: return map_screen._map != null, 15000)
	await get_tree().create_timer(1.0).timeout
	map_screen._select(model.body_id)
	await get_tree().create_timer(2.0).timeout
	await _capture("probe_map_body")
	print("MAP  explored line: %s" % (map_screen._details._explored.text if map_screen._details._explored != null else "-"))
	map_screen._select("")
	shell.show_tab(MainShell.Tab.BASE)
	await get_tree().process_frame

	# SAMPLE (live cannot show it: nobody else stands near a fresh account): a foreign structure a
	# probe saw near the base, as a ghost in the colony and on the map of the explored ground.
	var banner := Ui.dynamic_label()
	banner.text = "SAMPLE: made-up foreign sighting"
	banner.add_theme_color_override("font_color", Color.MAGENTA)
	banner.autowrap_mode = TextServer.AUTOWRAP_OFF
	banner.position = Vector2(24, 140)
	add_child(banner)
	var now := Services.clock.now_ms()
	var wire := {"bodyId": model.body_id, "fog": true, "areas": [], "sightings": [
		{"structureId": 77, "ownerId": "5", "ownerName": "Orsk Mining", "x": centre.x + 12, "y": centre.y + 5,
			"hulls": 20, "seenAt": now - 8100000, "probeId": 9000,
			"footprint": [[0, 0, 5], [1, 0, 5], [2, 0, 1], [3, 0, 1], [4, 0, 1]]}]}
	var areas: Array = []
	if live != null:
		for area: RevealMap.Area in live.areas:
			areas.append({"x0": area.x0, "y0": area.y0, "x1": area.x1, "y1": area.y1, "radius": area.radius,
				"since": area.since, "source": area.source})
	wire["areas"] = areas
	probes._reveals[model.body_id] = RevealMap.from_wire(wire)
	probes.reveal_changed.emit(model.body_id)
	colony._select(null)
	colony._close_structure()
	colony._view.zoom = 18.0
	colony._view.look_at_cell(Vector3i(centre.x + 13, centre.y + 7, 0))
	await get_tree().create_timer(2.0).timeout
	await _capture("SAMPLE_colony_sighting")
	shell.show_tab(MainShell.Tab.FLEET)
	var explored := panel.open_exploration(model.body_id)
	await _until(func() -> bool: return explored._size_x > 0, 15000)
	explored._map.map.set_zoom(40.0)
	explored._map.look_at(Vector2i(centre.x, centre.y))
	await get_tree().create_timer(1.0).timeout
	await _capture("SAMPLE_probe_explored_sighting")
	print("SAMPLE  explored: %s" % explored._lines.text.replace("\n", " / "))
	ScreenStack.close_layer(explored)
	shell.show_tab(MainShell.Tab.BASE)

	# Back to the real state.
	banner.queue_free()
	await probes.load_reveal(model.body_id)
	colony.recentre()


## Probes for real on the live server (account `probes2`: a fresh draft.31 account gets probes and
## launchers): the launcher's card, the system map in probe pick mode, the target on the home body
## just beyond the explored circle, Launch, the countdown on the card and in the Fleet tab, the
## events as they come, the arrival (notice, the ground at the fog's edge loading anew), the probe
## list, the explored ground and the structure log. Places a launcher first when there is none.
func _capture_probes_live(shell: MainShell, colony: ColonyScreen) -> void:
	var model := colony._model
	var fleet := colony._fleet
	var probes := fleet.probes
	var seen_events: Array[String] = []
	Services.events.event_received.connect(func(event: SseEvent) -> void:
		if event.type.begins_with("probe."):
			seen_events.append(event.type)
			print("EVENT  %s %s" % [event.type, event.data]))
	await _until(func() -> bool: return fleet.loaded and probes.loaded, 15000)
	var launcher := _launcher_of(model)
	if launcher == null:
		var spot := model.layout.to_absolute(Vector3i(4, 0, 0))
		var built := await model.send_ops([
			{"op": "placeHull", "hullType": "PLATFORM_OUTDOOR", "x": spot.x, "y": spot.y, "z": 0},
			{"op": "placeModule", "moduleType": Probes.LAUNCHER, "x": spot.x, "y": spot.y, "z": 0, "rotation": 0}])
		print("LAUNCHER  placed: %s" % ("ok" if built.is_ok() else built.error.code))
		await _until(func() -> bool: return _launcher_of(model) != null, 10000)
		launcher = _launcher_of(model)
	if launcher == null:
		print("SKIP  live probes (no launcher)")
		return
	await _until(func() -> bool: return Services.clock.now_ms() > launcher.completes_at + 2000, 30000)
	model.reload_layout()
	await get_tree().create_timer(2.0).timeout
	launcher = model.layout.module(launcher.module_id)
	var at := model.layout.to_absolute(launcher.origin)
	colony._select(at)
	await get_tree().create_timer(1.5).timeout
	await _capture("probe_launcher_card")
	print("LAUNCHER  card: %s | %s | button '%s' disabled %s" % [colony._scope.text.replace("\n", " / "),
		colony._scope_block.text, colony._secondary.text, colony._secondary.disabled])

	# Launch probe… → the system map (probe pick) → the home body → its surface map.
	colony._on_secondary()
	var pick := shell.stack(MainShell.Tab.BASE).top() as MapScreen
	if pick == null:
		print("FAIL  no map opened")
		return
	await _until(func() -> bool: return pick._map != null, 15000)
	await get_tree().create_timer(1.0).timeout
	pick._select(model.body_id)
	await get_tree().create_timer(2.0).timeout
	await _capture("probe_map_pick")
	pick._details._choose.pressed.emit()
	await get_tree().process_frame
	var target := shell.stack(MainShell.Tab.BASE).top() as ProbeTargetScreen
	if target == null:
		print("FAIL  no target screen")
		return
	await _until(func() -> bool: return target._size_x > 0, 15000)
	await get_tree().create_timer(1.0).timeout
	await _capture("probe_target_hint")
	# The target: north of the base, so its circle covers the edge of the explored circle there
	# (east and west were explored by earlier runs).
	var centre := model.centre_cell()
	var aim := Vector2i(centre.x + 30, centre.y + 5500)
	target._map.cell_tapped.emit(aim)
	await _until(func() -> bool: return not target._asking, 8000)
	await get_tree().process_frame
	await _capture("probe_target")
	print("PREVIEW  supported %s, quote %s" % [target._preview_supported,
		"-" if target._quote == null else "ok %s, %d ms, errors %s" % [target._quote.ok, target._quote.flight_ms, target._quote.errors]])
	print("TARGET  %s | reason '%s' | launch disabled %s" % [target._lines.text.replace("\n", " / "), target._reason.text,
		target._launch.disabled])
	var ref: WeakRef = weakref(target)
	target._launch.pressed.emit()
	var settled := func() -> bool:
		var screen := ref.get_ref() as ProbeTargetScreen
		return not ScreenStack.is_open(screen) or not screen._busy and screen._status.visible
	await _until(settled, 15000)
	await get_tree().create_timer(0.5).timeout
	if ScreenStack.is_open(target):
		await _capture("probe_target_failed")
		print("FAIL  launch: %s" % target._status.text)
		return
	await _capture("probe_launched_notice")
	print("LAUNCHED  notice: %s" % colony._notice.text)
	var flying := probes.list.flying(Services.clock.now_ms())
	if flying.is_empty():
		print("FAIL  no probe under way after the launch")
		return
	var probe := flying[0]
	print("PROBE  %d to %s (%d, %d), flight %s" % [probe.probe_id, probe.body_id, probe.x, probe.y,
		TimeFormat.duration(probe.arrives_at - probe.launched_at)])
	colony._select(at)
	await get_tree().create_timer(1.0).timeout
	await _capture("probe_launcher_flying")
	print("LAUNCHER  card: %s" % colony._scope.text.replace("\n", " / "))
	shell.show_tab(MainShell.Tab.FLEET)
	var panel := shell.stack(MainShell.Tab.FLEET).root() as FleetPanel
	panel.show_probes()
	await get_tree().create_timer(1.5).timeout
	await _capture("probe_list_flying")

	# The fog's edge east of the base, before and after the arrival.
	shell.show_tab(MainShell.Tab.BASE)
	colony._select(null)
	colony._close_structure()
	# The explored circle around the base ends 1 000 fields east of the base's origin.
	var origin := model.layout.to_absolute(Vector3i.ZERO)
	var edge := Vector3i(origin.x, origin.y + 997, 0)
	colony._view.zoom = 16.0
	_centre(colony, edge)
	await get_tree().create_timer(4.0).timeout
	await _capture("probe_edge_before")
	print("EDGE  hidden north of the edge before: %s" % model.surface.is_hidden(edge.x, edge.y + 6))
	var arrived := [false]
	probes.arrived.connect(func(_probe: Probes.Probe, _sightings: int) -> void: arrived[0] = true)
	var wait_ms := probe.remaining_ms(Services.clock.now_ms()) + 60000
	print("WAIT  %s for the arrival" % TimeFormat.duration(wait_ms))
	await _until(func() -> bool: return arrived[0], wait_ms)
	print("ARRIVED  event seen: %s, events %s" % [arrived[0], ", ".join(seen_events)])
	await get_tree().create_timer(1.0).timeout
	await _capture("probe_arrived_notice")
	print("ARRIVED  notice: %s" % colony._notice.text)
	await _until(func() -> bool: return model.surface.is_loaded(model.surface.block_of(edge.x, edge.y + 6)), 15000)
	await get_tree().create_timer(4.0).timeout
	await _capture("probe_edge_after")
	print("EDGE  hidden north of the edge after: %s" % model.surface.is_hidden(edge.x, edge.y + 6))

	# The wreck where the probe came down, and what Inspect says there.
	colony._view.zoom = 8.0
	_centre(colony, Vector3i(probe.x, probe.y, 0))
	await get_tree().create_timer(4.0).timeout
	await _capture("probe_wreck")
	colony.enter_structure()
	colony._view.look_at_cell(Vector3i(probe.x, probe.y, 0))
	colony._select(Vector3i(probe.x, probe.y, 0))
	await get_tree().create_timer(2.0).timeout
	await _capture("probe_wreck_inspect")
	print("WRECK  inspect: %s" % colony._info.text.replace("\n", " / "))
	colony._select(null)
	colony._close_structure()
	var reveal := probes.reveal(model.body_id)
	if reveal != null:
		for area: RevealMap.Area in reveal.areas:
			print("AREA  %s (%d, %d)-(%d, %d) r %d since %d" % [area.source, area.x0, area.y0, area.x1, area.y1, area.radius, area.since])

	shell.show_tab(MainShell.Tab.FLEET)
	panel.show_probes()
	await get_tree().create_timer(1.0).timeout
	await _capture("probe_list_arrived")
	var explored := panel.open_exploration(model.body_id)
	await _until(func() -> bool: return explored._size_x > 0, 15000)
	await get_tree().create_timer(1.0).timeout
	await _capture("probe_explored")
	print("EXPLORED  %s" % explored._lines.text.replace("\n", " / "))
	ScreenStack.close_layer(explored)
	shell.show_tab(MainShell.Tab.BASE)

	# The structure log names the launch and the arrival.
	var details := colony.open_details(StructureDetails.Tab.LOG)
	if details != null:
		await get_tree().create_timer(3.0).timeout
		await _capture("probe_structure_log")
		ScreenStack.close_layer(details)

## The first probe launcher of a structure; null when it has none.
func _launcher_of(model: ColonyModel) -> StructureLayout.Module:
	for placed: StructureLayout.Module in model.layout.modules():
		if Probes.is_launcher(placed.module_type):
			return placed
	return null


## A hull of the ground level without a module (local); NO_CELL when every hull carries one.
## The inspect card (`--only=inspect`): a module and an empty hull, "More" opened, the removal
## armed (never confirmed; a tap on another field must disarm it), the
## card beside fields near the edges of the view, and Back closing only the card.
func _capture_inspect(shell: MainShell, colony: ColonyScreen) -> void:
	var layout := colony._focus.layout
	var module: StructureLayout.Module = null
	for placed: StructureLayout.Module in layout.modules():
		if placed.module_type != ColonyScreen.CORE_MODULE and not layout.is_shaft(placed) and placed.origin.z == 0:
			module = placed
			break
	if module == null:
		print("INSPECT  no module to show")
		return
	var at := layout.to_absolute(module.origin)
	colony._select(at)
	await _ground_ready(colony, at)
	await _capture("inspect_module")
	_print_card(colony, "module")
	colony._toggle_more()
	await _capture("inspect_more")
	_print_card(colony, "more")
	colony._on_remove()
	await _capture("inspect_armed")
	_print_card(colony, "armed")
	# Never a second tap here: it would remove for real (the bounce guard is in tests/core).
	# Another field while armed disarms.
	var other := layout.to_absolute(_free_neighbour(layout))
	colony._select(other)
	print("INSPECT  other field: armed %s" % colony._arm.is_set())
	colony._select(at)
	print("INSPECT  back on the module: armed %s, more open %s" % [colony._arm.is_set(), colony._more_open])
	var free_hull := _free_hull(layout)
	if free_hull != NO_CELL:
		colony._select(layout.to_absolute(free_hull))
		await _ground_ready(colony, layout.to_absolute(free_hull))
		await _capture("inspect_hull")
		_print_card(colony, "hull")
	# Near the edges: the field is moved there, the card must stay beside it and on screen.
	var spots := {"top": Vector2(0.5, 0.22), "bottom": Vector2(0.5, 0.78), "left": Vector2(0.08, 0.5),
		"right": Vector2(0.9, 0.35)}
	for spot: String in spots.keys():
		colony._select(at)
		var share: Vector2 = spots[spot]
		var room := colony._free_rect()
		var wanted := room.position + room.size * share
		for _step: int in 4:
			var now := colony._view.cell_point(at) / colony._scale()
			colony._view.pan((wanted - now) * colony._scale(), Vector2(colony._viewport.size))
			await get_tree().process_frame
		await _capture("inspect_edge_" + spot)
		var anchor := colony._view.cell_point(at) / colony._scale()
		var card := colony._inspect.get_rect()
		var field := CardPlacement.field_box(colony._field_points(at), 0.0)
		print("INSPECT  edge %s: field %s, card %s, covers field %s, inside %s" % [spot, anchor.round(), card,
			card.intersects(field), colony.get_rect().encloses(card)])
	colony.recentre()
	# Back closes the card only; the structure stays open.
	colony._select(at)
	await get_tree().process_frame
	shell.handle_back()
	await get_tree().process_frame
	print("BACK  card closed %s, structure still open %s" % [not colony._inspect.visible, colony._opened])
	await _capture("inspect_after_back")
	shell.handle_back()
	await get_tree().process_frame
	print("BACK  second press left the structure: %s" % (not colony._opened))


func _print_card(colony: ColonyScreen, what: String) -> void:
	var buttons := PackedStringArray()
	for button: Button in [colony._staff, colony._secondary, colony._primary, colony._more, colony._remove]:
		if button.is_visible_in_tree():
			buttons.append("%s%s" % [button.text, " (off)" if button.disabled else ""])
	print("INSPECT  %s: %s | %s | buttons %s | card %s" % [what, colony._info.text.replace("\n", " / "),
		colony._ground.text.replace("\n", " / "), ", ".join(buttons), colony._inspect.get_rect()])


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
