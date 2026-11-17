extends Control
## Saves a picture of each screen, so the UI can be reviewed without a person at the window.
##
## Root script of smoke/screenshots.tscn; run through tools\screenshots.ps1. It has to be a scene
## (not a `-s` script): the screens use the `Services` autoload, which only exists in a normal
## run. The signed-in screen is only captured when the local dev backend runs and knows the dev
## account.

const DEV_EMAIL := "dev1@example.test"
const DEV_PASSWORD := "DevPass-0001"

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
	login.queue_free()
	await get_tree().process_frame

	var session := Services.session
	var had_session := not SessionStore.new().load_token(Services.server.base).is_empty()
	var error := await session.login(DEV_EMAIL, DEV_PASSWORD)
	if error == null:
		var home := HomeScreen.new()
		add_child(home)
		await get_tree().create_timer(2.0).timeout
		await _capture("home")
		home.queue_free()
		if not had_session:
			await session.logout()
	else:
		print("SKIP  home (dev sign-in failed: %s)" % (error.message if error.is_transport() else error.code))

	get_tree().quit()


func _capture(file_name: String) -> void:
	await get_tree().create_timer(0.4).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	var saved := get_viewport().get_texture().get_image().save_png(path)
	print("%s  %s" % ["SAVED" if saved == OK else "FAIL ", path])
