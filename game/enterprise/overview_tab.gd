class_name EnterpriseOverviewTab
extends EnterpriseTab
## The own enterprise at a glance: description and who may join (editable with EDIT_IDENTITY),
## the player's roles and rights, leaving and dissolving (both two-step; dissolving names what
## the enterprise inventory loses).

var _column: VBoxContainer
var _editing := false
var _description: LineEdit
var _open_button: Button


func _build() -> void:
	_column = scroll_column(self, 14)
	model.changed.connect(refresh)
	model.stock_changed.connect(refresh)


func shown() -> void:
	_editing = false
	if model.mine != null and model.stock == null:
		model.reload_stock()


func handle_back() -> bool:
	if super.handle_back():
		return true
	if _editing:
		_editing = false
		refresh()
		return true
	return false


func refresh() -> void:
	if _column == null:
		return
	var view := model.mine
	# An update while editing keeps what was typed.
	var draft := view.description if view != null else ""
	var draft_open := view.is_open() if view != null else true
	if _editing and _description != null and is_instance_valid(_description):
		draft = _description.text
		draft_open = _open_button.button_pressed
	clear(_column)
	if view == null:
		return
	var about := card(_column)
	if _editing:
		about.add_child(Ui.label("ENTERPRISE_DESCRIPTION", AppTheme.VARIATION_MUTED))
		_description = Ui.line_edit("ENTERPRISE_DESCRIPTION_HINT")
		_description.max_length = Enterprise.DESCRIPTION_MAX
		_description.text = draft
		about.add_child(_description)
		about.add_child(Ui.label("ENTERPRISE_WHO_JOINS", AppTheme.VARIATION_MUTED))
		var modes := button_row(about)
		var group := ButtonGroup.new()
		_open_button = Ui.tab_button("ENTERPRISE_JOIN_MODE_OPEN", group)
		modes.add_child(_open_button)
		var closed := Ui.tab_button("ENTERPRISE_JOIN_MODE_CLOSED", group)
		modes.add_child(closed)
		_open_button.button_pressed = draft_open
		closed.button_pressed = not draft_open
		var actions := button_row(about)
		var save := action_button(actions, tr("ENTERPRISE_SAVE"), false, true)
		save.disabled = busy
		save.pressed.connect(_on_save)
		var cancel := action_button(actions, tr("ENTERPRISE_CANCEL"))
		cancel.pressed.connect(func() -> void:
			_editing = false
			refresh())
	else:
		text_label(about, view.description if not view.description.is_empty() else tr("ENTERPRISE_NO_DESCRIPTION"),
			"" if not view.description.is_empty() else AppTheme.VARIATION_MUTED)
		text_label(about, tr("ENTERPRISE_JOIN_MODE_OPEN") if view.is_open() else tr("ENTERPRISE_JOIN_MODE_CLOSED"), AppTheme.VARIATION_MUTED)
		var members := text_label(about, cap_text(view, self))
		if view.is_full():
			members.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		var age := maxi(Services.clock.now_ms() - view.founded_at, 0)
		text_label(about, tr("ENTERPRISE_FOUNDED_AGO").format({"duration": TimeFormat.duration(age)}), AppTheme.VARIATION_MUTED)
		if view.has_flag("EDIT_IDENTITY"):
			var edit := Ui.secondary_button("ENTERPRISE_EDIT")
			edit.pressed.connect(func() -> void:
				_editing = true
				refresh())
			about.add_child(edit)

	var me := card(_column)
	me.add_child(Ui.label("ENTERPRISE_YOUR_PLACE", AppTheme.VARIATION_MUTED))
	var role_names := PackedStringArray()
	for role: Enterprise.Role in view.roles_of(model.player_id()):
		role_names.append(role.name)
	text_label(me, tr("ENTERPRISE_YOUR_ROLES").format({"roles": ", ".join(role_names) if not role_names.is_empty() else tr("ENTERPRISE_NO_ROLES")}))
	text_label(me, tr("ENTERPRISE_YOUR_RIGHTS").format({"rights": flags_text(view.my_flags, self)}), AppTheme.VARIATION_MUTED)

	var out := card(_column)
	var last := view.members.size() <= 1
	if view.leave_blocked():
		text_label(out, tr("ENTERPRISE_LEAVE_BLOCKED"), AppTheme.VARIATION_MUTED)
	else:
		var leave := action_button(out, tr("ENTERPRISE_LEAVE_CONFIRM") if armed == "leave" else tr("ENTERPRISE_LEAVE"), true)
		leave.disabled = busy
		leave.pressed.connect(_on_leave)
		if armed == "leave":
			var warning := tr("ENTERPRISE_LEAVE_LAST_WARNING").format({"lost": _loss_text()}) if last else tr("ENTERPRISE_LEAVE_WARNING")
			var shown := text_label(out, warning)
			shown.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
			reveal(shown)
	if view.has_flag("DISSOLVE"):
		var dissolve := action_button(out, tr("ENTERPRISE_DISSOLVE_CONFIRM") if armed == "dissolve" else tr("ENTERPRISE_DISSOLVE"), true)
		dissolve.disabled = busy
		dissolve.pressed.connect(_on_dissolve)
		if armed == "dissolve":
			var shown := text_label(out, tr("ENTERPRISE_DISSOLVE_WARNING").format({"lost": _loss_text()}))
			shown.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
			reveal(shown)


## What the enterprise inventory would lose now, as "1 234 Iron, 56 Water"; a plain sentence
## when it is empty or not known.
func _loss_text() -> String:
	var stock := model.stock
	if stock == null:
		return tr("ENTERPRISE_LOSS_UNKNOWN") if model.stock_error != null else tr("COMMON_LOADING")
	var now := Services.clock.now_ms()
	var parts := PackedStringArray()
	for item: Array in stock.items:
		var key: String = item[0]
		var value := stock.value_at(key, now)
		if value > 0:
			parts.append(goods_text(key, value, self))
	return ", ".join(parts) if not parts.is_empty() else tr("ENTERPRISE_LOSS_NOTHING")


func _on_save() -> void:
	var text := _description.text.strip_edges()
	var open := _open_button.button_pressed
	if await run(func() -> ApiResult: return await model.update_identity(text, open), "ENTERPRISE_SAVED"):
		_editing = false
		refresh()


func _on_leave() -> void:
	if not confirm("leave"):
		model.reload_stock()
		return
	await run(func() -> ApiResult: return await model.leave())


func _on_dissolve() -> void:
	if not confirm("dissolve"):
		model.reload_stock()
		return
	await run(func() -> ApiResult: return await model.dissolve())
