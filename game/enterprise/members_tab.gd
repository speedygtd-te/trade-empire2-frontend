class_name EnterpriseMembersTab
extends EnterpriseTab
## The members with their roles. With MANAGE_MEMBERS: applications (admit / reject), open
## invitations (take back) and removing members (two-step). With MANAGE_ROLES: giving and taking
## roles — only the ones the player may grant. A tap on a member opens these.

var _column: VBoxContainer
## The member opened for roles and removal; "" when none.
var _open := ""


func _build() -> void:
	_column = scroll_column(self, 12)
	model.changed.connect(refresh)


func handle_back() -> bool:
	if super.handle_back():
		return true
	if not _open.is_empty():
		_open = ""
		refresh()
		return true
	return false


func refresh() -> void:
	if _column == null:
		return
	clear(_column)
	var view := model.mine
	if view == null:
		return
	if view.has_flag("MANAGE_MEMBERS"):
		_applications(view)
		_invites(view)
	_column.add_child(Ui.label("ENTERPRISE_MEMBERS", AppTheme.VARIATION_MUTED))
	var now := Services.clock.now_ms()
	for member: Enterprise.Member in view.members:
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		var role_names := PackedStringArray()
		for role: Enterprise.Role in view.roles_of(member.player_id):
			role_names.append(role.name)
		var title := member.player_name
		if member.player_id == model.player_id():
			title = tr("ENTERPRISE_YOU").format({"name": member.player_name})
		row.text = "%s\n%s" % [title, tr("ENTERPRISE_MEMBER_LINE").format({
			"roles": ", ".join(role_names) if not role_names.is_empty() else tr("ENTERPRISE_NO_ROLES"),
			"duration": TimeFormat.duration(maxi(now - member.joined_at, 0))})]
		row.set_chosen(member.player_id == _open)
		row.tapped.connect(_toggle.bind(member.player_id))
		_column.add_child(row)
		if member.player_id == _open:
			_member_actions(view, member)


func _applications(view: Enterprise) -> void:
	var rows := card(_column)
	rows.add_child(Ui.label("ENTERPRISE_APPLICATIONS", AppTheme.VARIATION_MUTED))
	if view.applications.is_empty():
		rows.add_child(Ui.label("ENTERPRISE_NO_APPLICATIONS", AppTheme.VARIATION_MUTED))
	for applicant: Enterprise.PlayerRef in view.applications:
		text_label(rows, applicant.player_name)
		var actions := button_row(rows)
		var admit := action_button(actions, tr("ENTERPRISE_ADMIT"), false, true)
		admit.disabled = busy
		admit.pressed.connect(_on_admit.bind(applicant.player_id))
		var key := "reject:" + applicant.player_id
		var reject := action_button(actions, tr("ENTERPRISE_REJECT_CONFIRM") if armed == key else tr("ENTERPRISE_REJECT"), true)
		reject.disabled = busy
		reject.pressed.connect(_on_reject.bind(applicant.player_id))


func _invites(view: Enterprise) -> void:
	if view.invites.is_empty():
		return
	var rows := card(_column)
	rows.add_child(Ui.label("ENTERPRISE_INVITES", AppTheme.VARIATION_MUTED))
	for invitee: Enterprise.PlayerRef in view.invites:
		var line := button_row(rows)
		var who := text_label(line, invitee.player_name)
		who.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var key := "revoke:" + invitee.player_id
		var revoke := action_button(line, tr("ENTERPRISE_REVOKE_CONFIRM") if armed == key else tr("ENTERPRISE_REVOKE"), true)
		revoke.size_flags_horizontal = Control.SIZE_SHRINK_END
		revoke.disabled = busy
		revoke.pressed.connect(_on_revoke.bind(invitee.player_id))


## Role switches and removal for the opened member.
func _member_actions(view: Enterprise, member: Enterprise.Member) -> void:
	var rows := card(_column)
	var me := model.player_id()
	var any := false
	if view.has_flag("MANAGE_ROLES"):
		rows.add_child(Ui.label("ENTERPRISE_ROLES_OF_MEMBER", AppTheme.VARIATION_MUTED))
		for role: Enterprise.Role in view.roles:
			var holds := member.role_ids.has(role.role_id)
			var button := ListButton.new()
			button.text = tr("ENTERPRISE_ROLE_HELD").format({"role": role.name}) if holds else role.name
			button.alignment = HORIZONTAL_ALIGNMENT_LEFT
			button.set_chosen(holds)
			var allowed := view.can_revoke(role, member.player_id) if holds else view.can_grant(role)
			if not holds and member.role_ids.size() >= Enterprise.ROLES_PER_MEMBER_MAX:
				allowed = false
			button.disabled = busy or not allowed
			button.tapped.connect(_on_role.bind(member.player_id, role.role_id, holds))
			rows.add_child(button)
			any = true
	if view.can_kick(member.player_id, me):
		var key := "kick:" + member.player_id
		var kick := action_button(rows, tr("ENTERPRISE_KICK_CONFIRM") if armed == key else tr("ENTERPRISE_KICK"), true)
		kick.disabled = busy
		kick.pressed.connect(_on_kick.bind(member.player_id))
		if armed == key:
			var warning := text_label(rows, tr("ENTERPRISE_KICK_WARNING"))
			warning.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
			reveal(warning)
		any = true
	if not any:
		text_label(rows, tr("ENTERPRISE_MEMBER_NOTHING") if member.player_id != me else tr("ENTERPRISE_MEMBER_SELF"), AppTheme.VARIATION_MUTED)


func _toggle(player: String) -> void:
	_open = "" if _open == player else player
	armed = ""
	say("")
	refresh()


func _on_admit(player: String) -> void:
	await run(func() -> ApiResult: return await model.admit(player), "ENTERPRISE_ADMITTED")


func _on_reject(player: String) -> void:
	if confirm("reject:" + player):
		await run(func() -> ApiResult: return await model.reject(player), "ENTERPRISE_REJECTED")


func _on_revoke(player: String) -> void:
	if confirm("revoke:" + player):
		await run(func() -> ApiResult: return await model.revoke_invite(player), "ENTERPRISE_REVOKED")


func _on_kick(player: String) -> void:
	if confirm("kick:" + player):
		if await run(func() -> ApiResult: return await model.kick(player), "ENTERPRISE_KICKED"):
			_open = ""
			refresh()


func _on_role(player: String, role_id: String, holds: bool) -> void:
	if holds:
		await run(func() -> ApiResult: return await model.unassign_role(player, role_id))
	else:
		await run(func() -> ApiResult: return await model.assign_role(player, role_id))
