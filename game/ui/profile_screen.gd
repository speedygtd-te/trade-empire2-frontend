class_name ProfileScreen
extends Control
## The Profile tab: the player, the enterprise as a card (logo, name and role, or the invitation
## to join or found one) that opens the enterprise as a layer, the account, the live connection
## with the app version and the 3D detail, and signing out — two taps, the first one arms it.

## Size of the logo on the enterprise card.
const LOGO := 96
## How long the armed "sign out" waits for its second tap (seconds).
const DISARM_SECONDS := 5.0

## The player's enterprise (set before adding).
var enterprise: EnterpriseModel = null
## The player's structures (set before adding): names the home body.
var fleet: FleetModel = null

var _detail_tier := -1
var _events_received := 0
var _armed_left := 0.0
var _enterprise_panel: EnterprisePanel = null

var _name: Label
var _home: Label
var _card: Control
var _card_logo: EnterpriseLogo
var _card_name: Label
var _card_line: Label
var _email_value: Label
var _home_value: Label
var _expires_value: Label
var _stream_value: Label
var _game_time_value: Label
var _events_value: Label
var _detail_value: Label
var _sign_out: Button
var _sign_out_hint: Label
var _performance: Button
var _copy: Button
var _performance_status: Label
var _high_detail: Button
var _hd_status: Label
var _hd_retry: Button
## The game second the clock lines were written for (-1 while the clock stands).
var _shown_second := -2


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	_build()
	Services.events.state_changed.connect(_on_stream_state_changed)
	Services.events.event_received.connect(_on_event_received)
	_on_stream_state_changed(Services.events.state())
	if enterprise != null:
		enterprise.changed.connect(_show_enterprise)
		enterprise.list_changed.connect(_show_enterprise)
	if fleet != null:
		fleet.changed.connect(_show_home)
	visibility_changed.connect(_on_visibility_changed)
	refresh()


func _process(delta: float) -> void:
	if _armed_left > 0.0:
		_armed_left -= delta
		if _armed_left <= 0.0:
			_disarm()
	if not is_visible_in_tree():
		return
	var clock := Services.clock
	var now := clock.now_ms()
	# The lines show seconds at most: written once a second, not every frame.
	var second := now / 1000 if clock.is_running() else -1
	if second == _shown_second:
		return
	_shown_second = second
	var time_text := TimeFormat.clock(now)
	_game_time_value.text = time_text if clock.is_running() else tr("HOME_GAME_TIME_PAUSED").format({"time": time_text})
	var account := Services.session.account
	if account != null and clock.is_synced():
		_expires_value.text = tr("HOME_SESSION_EXPIRES_IN").format({"duration": TimeFormat.duration(account.session_expires_at_ms - now)})


## Back takes back an armed "sign out"; otherwise there is nothing to close here.
func handle_back() -> bool:
	if _armed_left > 0.0:
		_disarm()
		return true
	return false


## Loads the enterprise again and updates what may have changed (the tab was opened).
func refresh() -> void:
	_show_home()
	_show_enterprise()
	if enterprise != null:
		enterprise.reload()


## The measured detail tier of the 3D view (DetailGovernor.Tier); -1 when none was measured.
func set_detail_tier(tier: int) -> void:
	_detail_tier = tier
	if _detail_value == null:
		return
	_detail_value.text = PerfOverlay.tier_name(tier, self)


## Opens the enterprise as a layer over the profile.
func open_enterprise() -> void:
	if enterprise == null or (_enterprise_panel != null and is_instance_valid(_enterprise_panel)
			and not _enterprise_panel.is_queued_for_deletion()):
		return
	_enterprise_panel = EnterprisePanel.new()
	_enterprise_panel.setup(enterprise)
	ScreenStack.push_onto(self, _enterprise_panel)


## The enterprise layer while it is open; null otherwise.
func enterprise_panel() -> EnterprisePanel:
	if _enterprise_panel == null or not is_instance_valid(_enterprise_panel) or _enterprise_panel.is_queued_for_deletion():
		return null
	return _enterprise_panel


## Whether "sign out" waits for its second tap.
func is_sign_out_armed() -> bool:
	return _armed_left > 0.0


# --- building the screen --------------------------------------------------------------------

func _build() -> void:
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(margin)
	var column := Ui.column(16)
	margin.add_child(column)
	var header := LayerHeader.new()
	header.show_back(false)
	header.set_title(tr("PROFILE_TITLE"))
	column.add_child(header)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(scroll)
	var content := Ui.column(24)
	scroll.add_child(content)

	var account := Services.session.account
	_name = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	_name.text = account.player_name if account != null else ""
	content.add_child(_name)
	_home = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	content.add_child(_home)

	content.add_child(Ui.label("PROFILE_ENTERPRISE", AppTheme.VARIATION_MUTED))
	_card = _build_card()
	content.add_child(_card)

	var account_rows := _panel(content, "HOME_ACCOUNT")
	_email_value = _row(account_rows, "HOME_EMAIL")
	_email_value.text = account.email if account != null else ""
	_home_value = _row(account_rows, "HOME_HOME_BODY")
	_expires_value = _row(account_rows, "HOME_SESSION")

	var live_rows := _panel(content, "HOME_LIVE")
	_stream_value = _row(live_rows, "HOME_STREAM_STATUS")
	_game_time_value = _row(live_rows, "HOME_GAME_TIME")
	_events_value = _row(live_rows, "HOME_EVENTS_RECEIVED")
	_events_value.text = "0"
	var version := _row(live_rows, "HOME_CLIENT_VERSION")
	match Services.contract_status:
		0:
			version.text = tr("HOME_VERSION_CURRENT")
			version.add_theme_color_override("font_color", AppTheme.COLOR_OK)
		1:
			version.text = tr("HOME_VERSION_OUTDATED")
			version.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		_:
			version.text = tr("HOME_VERSION_UNKNOWN")
	_detail_value = _row(live_rows, "PROFILE_DETAIL")
	set_detail_tier(_detail_tier)

	# The performance display (PerfOverlay) and sharing its last minute.
	var performance_rows := _panel(content, "PROFILE_PERFORMANCE")
	performance_rows.add_child(Ui.label("PROFILE_PERFORMANCE_HINT", AppTheme.VARIATION_MUTED))
	_performance = Ui.secondary_button("PROFILE_PERFORMANCE_ON")
	_performance.pressed.connect(_on_performance)
	performance_rows.add_child(_performance)
	_copy = Ui.secondary_button("PROFILE_PERFORMANCE_COPY")
	_copy.pressed.connect(_on_copy_report)
	performance_rows.add_child(_copy)
	_performance_status = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	performance_rows.add_child(_performance_status)
	_show_performance()
	# The high-detail models of the top tier (DetailGovernor.Tier.ULTRA).
	performance_rows.add_child(Ui.label("PROFILE_HD_HINT", AppTheme.VARIATION_MUTED))
	_high_detail = Ui.secondary_button("PROFILE_HD_OFF")
	_high_detail.pressed.connect(_on_high_detail)
	performance_rows.add_child(_high_detail)
	# Their package, downloaded on devices that may use them (HdPackageService).
	_hd_status = _row(performance_rows, "PROFILE_HD_PACKAGE")
	_hd_retry = Ui.secondary_button("PROFILE_HD_PACKAGE_RETRY")
	_hd_retry.pressed.connect(_on_hd_retry)
	performance_rows.add_child(_hd_retry)
	Services.hd_package.changed.connect(_show_hd_package)
	_show_high_detail()

	_sign_out = Ui.secondary_button("HOME_SIGN_OUT")
	_sign_out.pressed.connect(_on_sign_out)
	content.add_child(_sign_out)
	_sign_out_hint = Ui.label("PROFILE_SIGN_OUT_HINT", AppTheme.VARIATION_MUTED)
	_sign_out_hint.visible = false
	content.add_child(_sign_out_hint)
	content.add_child(Ui.spacer(8))


## The enterprise card: logo, name and a line; a tap opens the enterprise. The content decides the
## card's size; the button behind it takes the taps (and lets a swipe scroll the page).
func _build_card() -> Control:
	var card := MarginContainer.new()
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.custom_minimum_size = Vector2(0, AppTheme.TOUCH_MIN)
	var button := ListButton.new()
	button.tapped.connect(open_enterprise)
	card.add_child(button)
	var inner := MarginContainer.new()
	inner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side: String in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		inner.add_theme_constant_override(side, 20)
	card.add_child(inner)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	inner.add_child(row)
	if enterprise != null:
		_card_logo = EnterpriseLogo.new(enterprise, LOGO)
		row.add_child(_card_logo)
	var names := Ui.column(4)
	names.alignment = BoxContainer.ALIGNMENT_CENTER
	names.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(names)
	_card_name = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	_card_name.mouse_filter = Control.MOUSE_FILTER_IGNORE
	names.add_child(_card_name)
	_card_line = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_card_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	names.add_child(_card_line)
	var arrow := Ui.label("COMMON_CHEVRON", AppTheme.VARIATION_HEADING)
	arrow.size_flags_horizontal = Control.SIZE_SHRINK_END
	arrow.autowrap_mode = TextServer.AUTOWRAP_OFF
	arrow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(arrow)
	return card


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


# --- performance display --------------------------------------------------------------------

func _on_performance() -> void:
	AppSettings.set_performance_display(not AppSettings.performance_display())
	_performance_status.text = ""
	_show_performance()


func _show_performance() -> void:
	var on := AppSettings.performance_display()
	_performance.text = tr("PROFILE_PERFORMANCE_OFF") if on else tr("PROFILE_PERFORMANCE_ON")
	_copy.disabled = not on


func _on_high_detail() -> void:
	AppSettings.set_high_detail_models(not AppSettings.high_detail_models())
	_show_high_detail()


func _show_high_detail() -> void:
	_high_detail.text = tr("PROFILE_HD_OFF") if AppSettings.high_detail_models() else tr("PROFILE_HD_ON")
	_show_hd_package()


## The status line of the high-detail package; red with a retry button after a failure.
func _show_hd_package() -> void:
	var package := Services.hd_package
	_hd_status.text = package.status_text()
	var failed := package.package.state == HdPackage.State.FAILED and package.package.is_eligible()
	if failed:
		_hd_status.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	elif package.is_ready():
		_hd_status.add_theme_color_override("font_color", AppTheme.COLOR_OK)
	elif package.package.state in [HdPackage.State.CHECKING, HdPackage.State.DOWNLOADING, HdPackage.State.VERIFYING]:
		_hd_status.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	else:
		_hd_status.remove_theme_color_override("font_color")
	_hd_retry.visible = package.can_retry()


func _on_hd_retry() -> void:
	Services.hd_package.retry()


## Copies the report of the last minute (device, frame times, draw calls …) to the clipboard.
func _on_copy_report() -> void:
	var overlay := PerfOverlay.current
	if overlay == null or not AppSettings.performance_display():
		return
	DisplayServer.clipboard_set(overlay.report())
	_performance_status.text = tr("PROFILE_PERFORMANCE_COPIED").format({"seconds": roundi(overlay.measured_seconds())})


# --- contents -------------------------------------------------------------------------------

func _show_home() -> void:
	if _home == null:
		return
	var account := Services.session.account
	var home_id := account.home_body_id if account != null else ""
	var text := ""
	if home_id.is_empty():
		text = tr("HOME_NO_COLONY")
	elif fleet != null and not fleet.body_name(home_id).is_empty():
		text = fleet.body_name(home_id)
	else:
		text = tr("COMMON_LOADING")
	_home_value.text = text
	_home.text = tr("PROFILE_HOME_LINE").format({"body": text}) if not home_id.is_empty() else text


func _show_enterprise() -> void:
	if _card_name == null:
		return
	if enterprise == null:
		_card.visible = false
		return
	var mine := enterprise.mine
	if mine != null:
		_card_name.text = mine.name
		var roles := PackedStringArray()
		for role_id: String in mine.my_role_ids:
			var role := mine.role(role_id)
			if role != null and not role.name.is_empty():
				roles.append(role.name)
		var line := mine.ticker
		if not roles.is_empty():
			line += " · " + ", ".join(roles)
		_card_line.text = line
		_card_line.remove_theme_color_override("font_color")
		if _card_logo != null:
			_card_logo.show_logo(mine.logo)
		return
	if _card_logo != null:
		_card_logo.show_logo(null)
	_card_name.text = tr("PROFILE_ENTERPRISE_JOIN")
	if not enterprise.loaded and enterprise.error != null:
		_card_line.text = tr("ENTERPRISE_LOAD_FAILED")
		_card_line.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		return
	_card_line.remove_theme_color_override("font_color")
	if not enterprise.loaded:
		_card_line.text = tr("COMMON_LOADING")
	elif not enterprise.invitations.is_empty():
		_card_line.text = tr("PROFILE_ENTERPRISE_INVITED").format({"count": enterprise.invitations.size()})
		_card_line.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	else:
		_card_line.text = tr("PROFILE_ENTERPRISE_NONE")


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


# --- signing out ----------------------------------------------------------------------------

func _on_sign_out() -> void:
	if _armed_left <= 0.0:
		_armed_left = DISARM_SECONDS
		_sign_out.text = tr("PROFILE_SIGN_OUT_CONFIRM")
		_sign_out.theme_type_variation = AppTheme.VARIATION_DANGER_BUTTON
		_sign_out_hint.visible = true
		return
	_disarm()
	Services.session.logout()


func _disarm() -> void:
	_armed_left = 0.0
	_sign_out.text = tr("HOME_SIGN_OUT")
	_sign_out.theme_type_variation = ""
	_sign_out_hint.visible = false


func _on_visibility_changed() -> void:
	if not is_visible_in_tree() and _armed_left > 0.0:
		_disarm()
