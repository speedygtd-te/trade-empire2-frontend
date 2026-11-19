class_name EnterpriseRolesTab
extends EnterpriseTab
## The roles with their rights and holders. With MANAGE_ROLES: a new role, and per role an editor
## with its name, its rights as switches (only rights the player holds can be switched; the
## founder role's rights are fixed) and delete (two-step; never the founder role).

## Marks the editor of a new role.
const NEW_ROLE := "new"

var _column: VBoxContainer
## The role in the editor (NEW_ROLE for a new one); "" for the list.
var _editing := ""
var _name: LineEdit
var _flags: PackedStringArray = []


func _build() -> void:
	_column = scroll_column(self, 12)
	model.changed.connect(_on_changed)


func handle_back() -> bool:
	if super.handle_back():
		return true
	if not _editing.is_empty():
		_close_editor()
		return true
	return false


func _on_changed() -> void:
	var view := model.mine
	if not _editing.is_empty() and _editing != NEW_ROLE and (view == null or view.role(_editing) == null):
		_editing = ""
	refresh()


func refresh() -> void:
	if _column == null:
		return
	var view := model.mine
	var typed := _name.text if _name != null and is_instance_valid(_name) else ""
	clear(_column)
	if view == null:
		return
	if not _editing.is_empty():
		_editor(view, typed)
		return
	if view.has_flag("MANAGE_ROLES"):
		var create := Ui.primary_button("ENTERPRISE_NEW_ROLE")
		create.disabled = busy or view.roles.size() >= Enterprise.ROLES_MAX
		create.pressed.connect(_open_editor.bind(NEW_ROLE))
		_column.add_child(create)
	for role: Enterprise.Role in view.roles:
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		var title := role.name
		if role.system:
			title = tr("ENTERPRISE_FOUNDER_ROLE").format({"name": role.name})
		row.text = "%s · %s\n%s" % [title, tr("ENTERPRISE_HOLDERS").format({"count": role.member_count}),
			flags_text(role.flags, self)]
		row.disabled = not view.can_edit_role(role)
		row.tapped.connect(_open_editor.bind(role.role_id))
		_column.add_child(row)


func _editor(view: Enterprise, typed: String) -> void:
	var role := view.role(_editing) if _editing != NEW_ROLE else null
	var rows := card(_column)
	rows.add_child(Ui.label("ENTERPRISE_NEW_ROLE" if role == null else "ENTERPRISE_EDIT_ROLE", AppTheme.VARIATION_HEADING))
	rows.add_child(Ui.label("ENTERPRISE_ROLE_NAME", AppTheme.VARIATION_MUTED))
	_name = Ui.line_edit("ENTERPRISE_ROLE_NAME_HINT")
	_name.max_length = Enterprise.ROLE_NAME_MAX
	_name.text = typed
	_name.text_changed.connect(func(_text: String) -> void: _update_save())
	rows.add_child(_name)
	rows.add_child(Ui.label("ENTERPRISE_ROLE_RIGHTS", AppTheme.VARIATION_MUTED))
	var locked := role != null and role.system
	if locked:
		rows.add_child(Ui.label("ENTERPRISE_FOUNDER_LOCKED", AppTheme.VARIATION_MUTED))
	for flag: String in Enterprise.FLAGS:
		var on := _flags.has(flag)
		var button := ListButton.new()
		button.text = tr("ENTERPRISE_ROLE_HELD").format({"role": flag_text(flag, self)}) if on else flag_text(flag, self)
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.set_chosen(on)
		# Only rights the player holds can be switched; the founder role's never.
		button.disabled = busy or locked or not view.has_flag(flag)
		button.tapped.connect(_toggle_flag.bind(flag))
		rows.add_child(button)
	if not locked:
		rows.add_child(Ui.label("ENTERPRISE_ROLE_RIGHTS_NOTE", AppTheme.VARIATION_MUTED))
	var actions := button_row(rows)
	var save := action_button(actions, tr("ENTERPRISE_SAVE"), false, true)
	save.name = "Save"
	save.pressed.connect(_on_save)
	var cancel := action_button(actions, tr("ENTERPRISE_CANCEL"))
	cancel.pressed.connect(_close_editor)
	if role != null and not role.system:
		var key := "delete:" + role.role_id
		var delete := action_button(rows, tr("ENTERPRISE_DELETE_ROLE_CONFIRM") if armed == key else tr("ENTERPRISE_DELETE_ROLE"), true)
		delete.disabled = busy
		delete.pressed.connect(_on_delete.bind(role.role_id))
		if armed == key:
			var warning := text_label(rows, tr("ENTERPRISE_DELETE_ROLE_WARNING").format({"count": role.member_count}))
			warning.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
			reveal(warning)
	_update_save()


func _update_save() -> void:
	var save := _column.find_child("Save", true, false) as Button
	if save != null and _name != null:
		save.disabled = busy or _name.text.strip_edges().is_empty()


func _open_editor(role_id: String) -> void:
	var view := model.mine
	if view == null:
		return
	var role := view.role(role_id)
	_editing = role_id
	_flags = role.flags.duplicate() if role != null else PackedStringArray()
	armed = ""
	say("")
	_name = null
	refresh()
	if _name != null:
		_name.text = role.name if role != null else ""
		_update_save()


func _close_editor() -> void:
	_editing = ""
	armed = ""
	_name = null
	refresh()


func _toggle_flag(flag: String) -> void:
	if _flags.has(flag):
		_flags.remove_at(_flags.find(flag))
	else:
		_flags.append(flag)
	refresh()


func _on_save() -> void:
	var role_name := _name.text.strip_edges() if _name != null else ""
	if role_name.is_empty():
		return
	var flags := _flags.duplicate()
	var editing := _editing
	var ok := false
	if editing == NEW_ROLE:
		ok = await run(func() -> ApiResult: return await model.create_role(role_name, flags), "ENTERPRISE_ROLE_SAVED")
	else:
		ok = await run(func() -> ApiResult: return await model.update_role(editing, role_name, flags), "ENTERPRISE_ROLE_SAVED")
	if ok:
		_close_editor()


func _on_delete(role_id: String) -> void:
	if confirm("delete:" + role_id):
		if await run(func() -> ApiResult: return await model.delete_role(role_id), "ENTERPRISE_ROLE_DELETED"):
			_close_editor()
