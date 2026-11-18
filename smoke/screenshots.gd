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

	colony._on_menu()
	await get_tree().create_timer(1.0).timeout
	await _capture("account")
	colony.queue_free()
	if not had_session:
		await session.logout()
	get_tree().quit()


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
