extends Control
## Saves a picture of each screen, so the UI can be reviewed without a person at the window.
##
## Root script of smoke/screenshots.tscn; run through tools\screenshots.ps1. It has to be a scene
## (not a `-s` script): the screens use the `Services` autoload, which only exists in a normal
## run. The signed-in screens use the development account of tools/dev-account.cjs
## (.local/dev-account.json, created by `node tools/dev-account.cjs`); without it they are skipped.

const DEV_ACCOUNT := "res://.local/dev-account.json"

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

	var colony := ColonyScreen.new()
	add_child(colony)
	var deadline := Time.get_ticks_msec() + 20000
	while colony._model.structure_id == 0 and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	# Ground blocks stream in after the colony.
	await get_tree().create_timer(4.0).timeout
	await _capture("colony")
	colony._select_structure(true)
	await _capture("colony_structure")
	colony._open_structure(ColonyScreen.Mode.VIEW)
	await _capture("colony_opened")

	var layout := colony._model.layout
	var with_module := layout.modules()
	if not with_module.is_empty():
		colony._select(layout.to_absolute(with_module[0].origin))
		await _capture("colony_selected")
	for placed: StructureLayout.Module in with_module:
		if placed.module_type == "MINE":
			colony._select(layout.to_absolute(placed.origin))
			await _capture("colony_mine")
			colony._open_recipes(placed)
			await _capture("colony_recipes")
			colony._close_recipes()
			break

	colony._set_mode(ColonyScreen.Mode.BUILD)
	colony._choose_tool("hull:STARTER")
	var free_cell := _free_neighbour(layout)
	colony._select(layout.to_absolute(free_cell))
	await _capture("colony_build_preview")
	colony._choose_tool("module:SMELTER")
	colony._select(layout.to_absolute(Vector3i(0, 0, 0)))
	await _capture("colony_build_blocked")

	colony._set_mode(ColonyScreen.Mode.STORE)
	await _capture("colony_store")
	colony._store._select("IRON")
	colony._store._on_discard(10)
	await _capture("colony_store_discard")
	colony._store._select("")
	colony._set_mode(ColonyScreen.Mode.LOG)
	await get_tree().create_timer(2.0).timeout
	await _capture("colony_log")
	await _capture_research(colony)

	colony._close_structure()
	await _dock_screens(colony)
	colony._on_menu()
	await get_tree().create_timer(1.0).timeout
	await _capture("account")
	colony.queue_free()
	if not had_session:
		await session.logout()
	get_tree().quit()


## Docks and a guest on the live server: two docks next to the colony, the founding preview, a
## guest founded by the screen's own Build button, picked by a tap, selected, opened, built on —
## then everything is taken down again, so the account is as before.
func _dock_screens(colony: ColonyScreen) -> void:
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
	colony._view.pan(Vector2(0.0, -colony._bottom.size.y * 0.5 * colony._scale()), Vector2(colony._viewport.size))

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

	# A tap on the guest's roof selects the guest, a tap on the home structure the home structure.
	var view := colony._view
	var roof := WorldGrid.to_scene(first + Vector3i(0, 0, 1), view.origin, model.size_x) \
		+ Vector3(0.0, view.lift_of(guest) + ColonyView.HULL_CLOSED_HEIGHT, 0.0)
	colony._on_tap(view._camera.unproject_position(roof) / colony._scale())
	print("DOCK  tap on the guest selects it: ", colony._focus == guest and colony._structure_selected)
	await _capture("dock_guest_selected")
	var home_roof := WorldGrid.to_scene(model.centre_cell(), view.origin, model.size_x) + Vector3(0.0, ColonyView.HULL_CLOSED_HEIGHT, 0.0)
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


## The research tab. With a real lab in the structure it aims the lab at the first research
## whose inputs are in the store and shows the progress; a fresh starter has no lab, so after the
## real (empty) state a made-up lab is shown — clearly a sample, nothing is sent for it.
func _capture_research(colony: ColonyScreen) -> void:
	colony._set_mode(ColonyScreen.Mode.RESEARCH)
	await get_tree().create_timer(3.0).timeout
	await _capture("colony_research")
	var model := colony._model
	var panel := colony._research
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
