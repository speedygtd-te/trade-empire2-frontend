class_name EnterpriseBrowseTab
extends EnterpriseTab
## Without an enterprise: every enterprise with logo, ticker, members and how to get in;
## invitations first. A tap opens one with its description and members, and joining, applying
## or taking an application back.

const LOGO_SIZE := 72

var _state: Label
var _retry: Button
var _list_box: VBoxContainer
var _list: VBoxContainer
var _more: Button
var _detail: VBoxContainer
## The enterprise open in detail; "" for the list.
var _open := ""


func _build() -> void:
	_list_box = Ui.column(12)
	_list_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_list_box)
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_list_box.add_child(_state)
	_retry = Ui.secondary_button("COMMON_RETRY")
	_retry.pressed.connect(func() -> void: model.reload_list())
	_list_box.add_child(_retry)
	_list = scroll_column(_list_box, 10)
	_more = Ui.secondary_button("ENTERPRISE_MORE")
	_more.pressed.connect(func() -> void: model.reload_list(true))
	_list_box.add_child(_more)
	_detail = Ui.column(12)
	_detail.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_detail.visible = false
	add_child(_detail)
	model.list_changed.connect(refresh)


func shown() -> void:
	model.reload_list()
	for id: String in model.invitations.keys():
		if not model.details.has(id):
			await model.load_detail(id)
	refresh()


func handle_back() -> bool:
	if super.handle_back():
		return true
	if not _open.is_empty():
		_show_detail("")
		return true
	return false


func refresh() -> void:
	if _list == null:
		return
	_list_box.visible = _open.is_empty()
	_detail.visible = not _open.is_empty()
	if not _open.is_empty():
		_fill_detail()
		return
	clear(_list)
	_retry.visible = false
	_more.visible = model.list_loaded and not model.next_cursor.is_empty()
	if not model.list_loaded:
		_state.visible = true
		if model.list_error != null:
			_state.text = tr("ENTERPRISE_LIST_FAILED") + "\n" + ErrorText.describe(model.list_error, self)
			_retry.visible = true
		else:
			_state.text = tr("COMMON_LOADING")
		return
	_state.visible = model.summaries.is_empty() and model.invitations.is_empty()
	_state.text = tr("ENTERPRISE_LIST_EMPTY")
	# Invitations first, highlighted.
	for id: String in model.invitations.keys():
		var known := model.details.get(id) as Enterprise
		var summary := model.summary(id)
		if known == null and summary == null:
			continue
		_row(id, known.name if known != null else summary.name,
			known.ticker if known != null else summary.ticker,
			known.member_count if known != null else summary.member_count,
			known.logo if known != null else summary.logo, tr("ENTERPRISE_INVITED"), true)
	for summary: Enterprise.Summary in model.summaries:
		if model.invitations.has(summary.enterprise_id):
			continue
		var known := model.details.get(summary.enterprise_id) as Enterprise
		var how := tr("ENTERPRISE_OPEN") if summary.is_open() else tr("ENTERPRISE_CLOSED")
		if known != null and known.applied:
			how = tr("ENTERPRISE_APPLIED")
		_row(summary.enterprise_id, summary.name, summary.ticker, summary.member_count, summary.logo, how)


func _row(id: String, title: String, ticker: String, members: int, logo: Enterprise.Logo, how: String,
		highlight: bool = false) -> void:
	var button := ListButton.new()
	button.flat = false
	button.custom_minimum_size = Vector2(0, LOGO_SIZE + 32)
	button.tapped.connect(_show_detail.bind(id))
	_list.add_child(button)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.offset_left = 16
	row.offset_right = -16
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(row)
	var picture := EnterpriseLogo.new(model, LOGO_SIZE)
	row.add_child(picture)
	picture.show_logo(logo)
	var texts := Ui.column(2)
	texts.alignment = BoxContainer.ALIGNMENT_CENTER
	texts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(texts)
	var heading := text_label(texts, "%s  [%s]" % [title, ticker])
	heading.autowrap_mode = TextServer.AUTOWRAP_OFF
	heading.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var line := text_label(texts, "%s · %s" % [members_text(members, self), how], AppTheme.VARIATION_MUTED)
	if highlight:
		line.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)


func _show_detail(id: String) -> void:
	_open = id
	armed = ""
	say("")
	refresh()
	if not id.is_empty() and not model.details.has(id):
		var answer := await model.load_detail(id)
		if not answer.is_ok() and is_inside_tree():
			say_error(answer.error)
		if _open == id:
			refresh()


func _fill_detail() -> void:
	clear(_detail)
	var view := model.details.get(_open) as Enterprise
	var summary := model.summary(_open)
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 16)
	_detail.add_child(top)
	var picture := EnterpriseLogo.new(model, 128)
	top.add_child(picture)
	picture.show_logo(view.logo if view != null else (summary.logo if summary != null else null))
	var names := Ui.column(4)
	top.add_child(names)
	var title := view.name if view != null else (summary.name if summary != null else "")
	var ticker := view.ticker if view != null else (summary.ticker if summary != null else "")
	text_label(names, title, AppTheme.VARIATION_HEADING)
	text_label(names, ticker, AppTheme.VARIATION_MUTED)
	if view == null:
		text_label(_detail, tr("COMMON_LOADING"), AppTheme.VARIATION_MUTED)
		_back_button()
		return
	var rows := card(_detail)
	text_label(rows, view.description if not view.description.is_empty() else tr("ENTERPRISE_NO_DESCRIPTION"),
		"" if not view.description.is_empty() else AppTheme.VARIATION_MUTED)
	text_label(rows, tr("ENTERPRISE_JOIN_MODE_OPEN") if view.is_open() else tr("ENTERPRISE_JOIN_MODE_CLOSED"), AppTheme.VARIATION_MUTED)
	var names_list := PackedStringArray()
	for member: Enterprise.Member in view.members:
		names_list.append(member.player_name)
	text_label(rows, tr("ENTERPRISE_MEMBER_LIST").format({"count": view.member_count, "names": ", ".join(names_list)}), AppTheme.VARIATION_MUTED)
	if view.member_cap >= 0:
		var cap := text_label(rows, cap_text(view, self))
		if view.is_full():
			cap.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	if view.is_full():
		# Joining, applying to be admitted and accepting an invitation wait for a free place.
		text_label(_detail, tr("ENTERPRISE_FULL_NOTE"), "").add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	if view.invited:
		text_label(_detail, tr("ENTERPRISE_INVITED_NOTE"), "").add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	if view.invited or view.is_open():
		var join := Ui.primary_button("ENTERPRISE_JOIN")
		join.disabled = busy or view.is_full()
		join.pressed.connect(_on_join)
		_detail.add_child(join)
	elif view.applied:
		text_label(_detail, tr("ENTERPRISE_APPLIED_NOTE"), "").add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		var withdraw := action_button(_detail, tr("ENTERPRISE_WITHDRAW_CONFIRM") if armed == "withdraw" else tr("ENTERPRISE_WITHDRAW"), true)
		withdraw.disabled = busy
		withdraw.pressed.connect(_on_withdraw)
	else:
		var apply := Ui.primary_button("ENTERPRISE_APPLY")
		apply.disabled = busy
		apply.pressed.connect(_on_apply)
		_detail.add_child(apply)
		text_label(_detail, tr("ENTERPRISE_APPLY_NOTE"), AppTheme.VARIATION_MUTED)
	var filler := Control.new()
	filler.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_detail.add_child(filler)
	_back_button()


func _back_button() -> void:
	var back := Ui.secondary_button("ENTERPRISE_BACK_TO_LIST")
	back.pressed.connect(_show_detail.bind(""))
	_detail.add_child(back)


func _on_join() -> void:
	var id := _open
	if await run(func() -> ApiResult: return await model.join(id)):
		_open = ""


func _on_apply() -> void:
	var id := _open
	await run(func() -> ApiResult: return await model.apply_to(id), "ENTERPRISE_APPLIED_DONE")


func _on_withdraw() -> void:
	if not confirm("withdraw"):
		return
	var id := _open
	await run(func() -> ApiResult: return await model.withdraw_application(id), "ENTERPRISE_WITHDRAWN_DONE")
