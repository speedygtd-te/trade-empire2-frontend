class_name HomeScreen
extends Control
## Account page, opened from the colony's menu: the account, the live connection, the running
## game time and signing out.

## Name of the home colony's body; set by the screen that opens this page.
var home_name := ""

var _events_received := 0

var _stream_value: Label
var _game_time_value: Label
var _events_value: Label
var _expires_value: Label


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build()
	Services.events.state_changed.connect(_on_stream_state_changed)
	Services.events.event_received.connect(_on_event_received)
	_on_stream_state_changed(Services.events.state())


func _process(_delta: float) -> void:
	var clock := Services.clock
	var now := clock.now_ms()
	var time_text := TimeFormat.clock(now)
	if clock.is_running():
		_game_time_value.text = time_text
	else:
		_game_time_value.text = tr("HOME_GAME_TIME_PAUSED").format({"time": time_text})

	var account := Services.session.account
	if account != null and clock.is_synced():
		var remaining := account.session_expires_at_ms - now
		_expires_value.text = tr("HOME_SESSION_EXPIRES_IN").format({"duration": TimeFormat.duration(remaining)})


func _build() -> void:
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(margin)

	var column := Ui.column(24)
	margin.add_child(column)

	var account := Services.session.account
	column.add_child(Ui.spacer(24))
	var welcome := Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	welcome.text = tr("HOME_WELCOME").format({"name": account.player_name})
	column.add_child(welcome)

	var account_rows := _panel(column, "HOME_ACCOUNT")
	_row(account_rows, "HOME_EMAIL").text = account.email
	var home_body := _row(account_rows, "HOME_HOME_BODY")
	home_body.text = tr("HOME_NO_COLONY") if account.home_body_id.is_empty() else home_name
	_expires_value = _row(account_rows, "HOME_SESSION")

	var live_rows := _panel(column, "HOME_LIVE")
	_stream_value = _row(live_rows, "HOME_STREAM_STATUS")
	_game_time_value = _row(live_rows, "HOME_GAME_TIME")
	_events_value = _row(live_rows, "HOME_EVENTS_RECEIVED")
	_events_value.text = "0"

	var filler := Control.new()
	filler.size_flags_vertical = Control.SIZE_EXPAND_FILL
	filler.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(filler)

	var sign_out := Ui.secondary_button("HOME_SIGN_OUT")
	sign_out.pressed.connect(_on_sign_out)
	column.add_child(sign_out)


## Adds a titled panel to `parent` and returns the container for its rows.
func _panel(parent: Container, title_key: String) -> VBoxContainer:
	var panel := PanelContainer.new()
	parent.add_child(panel)
	var rows := Ui.column(16)
	panel.add_child(rows)
	rows.add_child(Ui.label(title_key, AppTheme.VARIATION_MUTED))
	return rows


## Adds a "caption … value" row and returns the value label.
func _row(parent: Container, caption_key: String) -> Label:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	parent.add_child(row)
	var caption := Ui.label(caption_key, AppTheme.VARIATION_MUTED)
	caption.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	caption.autowrap_mode = TextServer.AUTOWRAP_OFF
	row.add_child(caption)
	var value := Ui.dynamic_label()
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	value.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	value.autowrap_mode = TextServer.AUTOWRAP_OFF
	value.clip_text = true
	row.add_child(value)
	return value


func _on_stream_state_changed(state: EventStream.State) -> void:
	match state:
		EventStream.State.OPEN:
			_stream_value.text = tr("HOME_STREAM_OPEN")
			_stream_value.add_theme_color_override("font_color", AppTheme.COLOR_OK)
		EventStream.State.CONNECTING:
			_stream_value.text = tr("HOME_STREAM_CONNECTING")
			_stream_value.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		EventStream.State.WAITING:
			_stream_value.text = tr("HOME_STREAM_WAITING")
			_stream_value.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		EventStream.State.STOPPED:
			_stream_value.text = tr("HOME_STREAM_STOPPED")
			_stream_value.add_theme_color_override("font_color", AppTheme.COLOR_MUTED)


func _on_event_received(_event: SseEvent) -> void:
	_events_received += 1
	_events_value.text = str(_events_received)


func _on_sign_out() -> void:
	Services.session.logout()
