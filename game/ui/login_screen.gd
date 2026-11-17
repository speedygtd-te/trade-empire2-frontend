class_name LoginScreen
extends Control
## Sign in or create an account. The only form of the game.

enum Mode { SIGN_IN, REGISTER }

var _mode: Mode = Mode.SIGN_IN
var _busy := false
## The backend asked us to wait (RATE_LIMITED); submitting is blocked until then.
var _locked_until_ms := 0

var _scroll: ScrollContainer
var _sign_in_tab: Button
var _register_tab: Button
var _email: LineEdit
var _password: LineEdit
var _password_hint: Label
var _player_name: LineEdit
var _player_name_hint: Label
var _register_note: Label
var _error: Label
var _submit: Button
var _keyboard_spacer: Control


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build()
	_apply_mode()


func _process(_delta: float) -> void:
	_submit.disabled = _busy or Time.get_ticks_msec() < _locked_until_ms
	_keep_focus_above_keyboard()


## Hardware back: from "create account" back to "sign in". Returns true when handled.
func handle_back() -> bool:
	if _mode == Mode.REGISTER and not _busy:
		_sign_in_tab.button_pressed = true
		return true
	return false


func _build() -> void:
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(margin)

	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	margin.add_child(_scroll)

	var column := Ui.column(24)
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.add_child(column)

	column.add_child(Ui.spacer(96))
	var title := Ui.label("APP_TITLE", AppTheme.VARIATION_TITLE)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(title)
	column.add_child(Ui.spacer(32))

	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 0)
	var group := ButtonGroup.new()
	_sign_in_tab = Ui.tab_button("LOGIN_TAB_SIGN_IN", group)
	_register_tab = Ui.tab_button("LOGIN_TAB_REGISTER", group)
	_sign_in_tab.button_pressed = true
	_sign_in_tab.toggled.connect(_on_tab_toggled)
	tabs.add_child(_sign_in_tab)
	tabs.add_child(_register_tab)
	column.add_child(tabs)

	_email = Ui.line_edit("LOGIN_EMAIL")
	_email.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_EMAIL_ADDRESS
	_email.text_submitted.connect(_on_email_submitted)
	column.add_child(_email)

	_password = Ui.line_edit("LOGIN_PASSWORD")
	_password.secret = true
	_password.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_PASSWORD
	_password.text_submitted.connect(_on_password_submitted)
	column.add_child(_password)
	_password_hint = Ui.label("LOGIN_PASSWORD_HINT", AppTheme.VARIATION_MUTED)
	column.add_child(_password_hint)

	_player_name = Ui.line_edit("LOGIN_PLAYER_NAME")
	_player_name.max_length = CredentialsCheck.PLAYER_NAME_MAX
	_player_name.text_submitted.connect(_on_player_name_submitted)
	column.add_child(_player_name)
	_player_name_hint = Ui.label("LOGIN_PLAYER_NAME_HINT", AppTheme.VARIATION_MUTED)
	column.add_child(_player_name_hint)

	_error = Ui.dynamic_label(AppTheme.VARIATION_ERROR)
	_error.visible = false
	column.add_child(_error)

	_submit = Ui.primary_button("LOGIN_SUBMIT_SIGN_IN")
	_submit.pressed.connect(_on_submit)
	column.add_child(_submit)

	_register_note = Ui.label("LOGIN_REGISTER_NOTE", AppTheme.VARIATION_MUTED)
	_register_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(_register_note)

	if OS.is_debug_build():
		var server := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
		server.text = tr("LOGIN_SERVER").format({"server": Services.server.base})
		server.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		column.add_child(server)

	_keyboard_spacer = Ui.spacer(0)
	column.add_child(_keyboard_spacer)


func _apply_mode() -> void:
	var registering := _mode == Mode.REGISTER
	_password_hint.visible = registering
	_player_name.visible = registering
	_player_name_hint.visible = registering
	_register_note.visible = registering
	_submit.text = "LOGIN_SUBMIT_REGISTER" if registering else "LOGIN_SUBMIT_SIGN_IN"
	_hide_error()


func _set_busy(busy: bool) -> void:
	_busy = busy
	_email.editable = not busy
	_password.editable = not busy
	_player_name.editable = not busy
	_sign_in_tab.disabled = busy
	_register_tab.disabled = busy
	if busy:
		_submit.text = "LOGIN_BUSY"
	else:
		_submit.text = "LOGIN_SUBMIT_REGISTER" if _mode == Mode.REGISTER else "LOGIN_SUBMIT_SIGN_IN"


func _show_error(text: String) -> void:
	_error.text = text
	_error.visible = true


func _hide_error() -> void:
	_error.visible = false


func _on_tab_toggled(sign_in_selected: bool) -> void:
	_mode = Mode.SIGN_IN if sign_in_selected else Mode.REGISTER
	_apply_mode()


func _on_email_submitted(_text: String) -> void:
	_password.grab_focus()


func _on_password_submitted(_text: String) -> void:
	if _mode == Mode.REGISTER:
		_player_name.grab_focus()
	else:
		_on_submit()


func _on_player_name_submitted(_text: String) -> void:
	_on_submit()


func _on_submit() -> void:
	if _busy or Time.get_ticks_msec() < _locked_until_ms:
		return
	var registering := _mode == Mode.REGISTER
	var email := _email.text.strip_edges()
	var password := _password.text
	var player_name := _player_name.text.strip_edges()

	var problem := CredentialsCheck.email_problem(email)
	if problem.is_empty():
		problem = CredentialsCheck.password_problem(password, registering)
	if problem.is_empty() and registering:
		problem = CredentialsCheck.player_name_problem(player_name)
	if not problem.is_empty():
		_show_error(tr(problem))
		return

	_hide_error()
	_set_busy(true)
	var error: ApiError
	if registering:
		error = await Services.session.register(email, password, player_name)
	else:
		error = await Services.session.login(email, password)
	if is_queued_for_deletion():
		# Signed in: the app has already replaced this screen.
		return
	_set_busy(false)
	if error == null:
		return
	if error.code == ApiError.CODE_RATE_LIMITED and error.retry_after_ms > 0:
		_locked_until_ms = Time.get_ticks_msec() + error.retry_after_ms
	_show_error(_describe(error))


## The backend names the rejected field of a VALIDATION_FAILED; say which one it was.
func _describe(error: ApiError) -> String:
	if error.code == "VALIDATION_FAILED":
		match Wire.as_string(error.details.get("field")):
			"email":
				return tr(CredentialsCheck.KEY_EMAIL)
			"password":
				return tr(CredentialsCheck.KEY_PASSWORD)
			"playerName":
				return tr(CredentialsCheck.KEY_PLAYER_NAME)
	return ErrorText.describe(error, self)


## While the on-screen keyboard is open, pad the bottom by its height and scroll the focused
## field into view.
func _keep_focus_above_keyboard() -> void:
	var window_height := DisplayServer.window_get_size().y
	var keyboard_height := 0.0
	if window_height > 0 and DisplayServer.has_feature(DisplayServer.FEATURE_VIRTUAL_KEYBOARD):
		var keyboard_pixels := DisplayServer.virtual_keyboard_get_height()
		keyboard_height = keyboard_pixels * get_viewport_rect().size.y / window_height
	if is_equal_approx(_keyboard_spacer.custom_minimum_size.y, keyboard_height):
		return
	_keyboard_spacer.custom_minimum_size.y = keyboard_height
	var focused := get_viewport().gui_get_focus_owner()
	if focused != null and _scroll.is_ancestor_of(focused):
		_scroll.ensure_control_visible.call_deferred(focused)
