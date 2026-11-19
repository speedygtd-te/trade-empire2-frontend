extends Control
## Root scene: shows the screen that matches the session state.

var _screen: Control = null


func _ready() -> void:
	theme = AppTheme.build()
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)

	Services.session.changed.connect(_on_session_changed)
	_on_session_changed()
	Services.session.restore()


func _notification(what: int) -> void:
	# Android back: close the topmost layer, never quit the app from here.
	if what != NOTIFICATION_WM_GO_BACK_REQUEST:
		return
	if _screen is LoginScreen:
		(_screen as LoginScreen).handle_back()
	elif _screen is MainShell:
		(_screen as MainShell).handle_back()


func _on_session_changed() -> void:
	match Services.session.status:
		SessionController.Status.RESTORING:
			_show(_build_loading())
		SessionController.Status.SIGNED_OUT:
			# Keep an existing login screen: a failed attempt must not wipe the input.
			if not _screen is LoginScreen:
				_show(LoginScreen.new())
		SessionController.Status.SIGNED_IN:
			if not _screen is MainShell:
				_show(MainShell.new())
		SessionController.Status.UNREACHABLE:
			_show(_build_unreachable())


func _show(screen: Control) -> void:
	if _screen != null:
		_screen.queue_free()
	_screen = screen
	add_child(screen)


func _build_loading() -> Control:
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var text := Ui.label("COMMON_LOADING", AppTheme.VARIATION_MUTED)
	text.autowrap_mode = TextServer.AUTOWRAP_OFF
	text.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	center.add_child(text)
	return center


## A stored session exists but the backend did not answer. The session is kept.
func _build_unreachable() -> Control:
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var column := Ui.column(24)
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	margin.add_child(column)

	column.add_child(Ui.label("UNREACHABLE_TITLE", AppTheme.VARIATION_HEADING))
	column.add_child(Ui.label("UNREACHABLE_BODY", AppTheme.VARIATION_MUTED))
	var error := Services.session.last_error
	if error != null:
		var detail := Ui.dynamic_label(AppTheme.VARIATION_ERROR)
		detail.text = ErrorText.describe(error, self)
		column.add_child(detail)
	column.add_child(Ui.spacer(16))

	var retry := Ui.primary_button("COMMON_RETRY")
	retry.pressed.connect(_on_retry)
	column.add_child(retry)
	var sign_out := Ui.secondary_button("UNREACHABLE_SIGN_OUT")
	sign_out.pressed.connect(_on_sign_out)
	column.add_child(sign_out)
	return margin


func _on_retry() -> void:
	Services.session.retry()


func _on_sign_out() -> void:
	Services.session.logout()
