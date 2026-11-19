class_name EnterpriseLogTab
extends EnterpriseTab
## The enterprise's log, newest first, a page at a time. Names come from the member list (and
## invitations, applications, relations); anyone else is a neutral placeholder, never an id.

const PAGE := 50

var _state: Label
var _list: VBoxContainer
var _older: Button
var _oldest := 0
var _loading := false


func _build() -> void:
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_state)
	_list = scroll_column(self, 14)
	_older = Ui.secondary_button("ENTERPRISE_LOG_OLDER")
	_older.visible = false
	_older.pressed.connect(func() -> void: _load(_oldest))
	add_child(_older)


func shown() -> void:
	reload()


## Loads the newest page (again).
func reload() -> void:
	clear(_list)
	_oldest = 0
	await _load(0)


func refresh() -> void:
	if _state == null:
		return
	_state.visible = _loading and _list.get_child_count() == 0


func _load(before: int) -> void:
	if _loading:
		return
	_loading = true
	_state.text = tr("COMMON_LOADING")
	refresh()
	var answer := await model.load_log(before, PAGE)
	_loading = false
	if not is_inside_tree():
		return
	if not answer.is_ok():
		_state.visible = true
		_state.text = tr("ENTERPRISE_LOG_FAILED") + "\n" + ErrorText.describe(answer.error, self)
		return
	var page := EnterpriseLog.from_wire(answer.data)
	var now := Services.clock.now_ms()
	for entry: EnterpriseLog.Entry in page.entries:
		var text := describe(entry)
		if text.is_empty():
			continue
		var row := Ui.column(2)
		text_label(row, text)
		text_label(row, tr("LOG_AGO").format({"duration": TimeFormat.duration(maxi(now - entry.game_time_ms, 0))}),
			AppTheme.VARIATION_MUTED)
		_list.add_child(row)
	if page.oldest > 0:
		_oldest = page.oldest
	_older.visible = page.more
	_state.visible = _list.get_child_count() == 0
	_state.text = tr("ENTERPRISE_LOG_EMPTY")


## The sentence of one entry; "" for kinds (or values) the client does not know.
func describe(entry: EnterpriseLog.Entry) -> String:
	var actor := player_text(entry.actor_id) if not entry.actor_id.is_empty() else tr("ENTERPRISE_SOMEONE")
	var subject_id := entry.player_id if not entry.player_id.is_empty() else entry.actor_id
	var player := player_text(subject_id) if not subject_id.is_empty() else tr("ENTERPRISE_SOMEONE")
	var role := _role_text(entry.role_id)
	var fields := {"actor": actor, "player": player, "role": role}
	match entry.kind:
		"founded":
			return tr("ENTERPRISE_LOG_FOUNDED").format(fields)
		"joined":
			return tr("ENTERPRISE_LOG_JOINED").format(fields)
		"left":
			return tr("ENTERPRISE_LOG_LEFT").format(fields)
		"kicked":
			return tr("ENTERPRISE_LOG_KICKED").format(fields)
		"invited":
			return tr("ENTERPRISE_LOG_INVITED").format(fields)
		"inviteRevoked":
			return tr("ENTERPRISE_LOG_INVITE_REVOKED").format(fields)
		"applied":
			return tr("ENTERPRISE_LOG_APPLIED").format(fields)
		"applicationWithdrawn":
			return tr("ENTERPRISE_LOG_APPLICATION_WITHDRAWN").format(fields)
		"admitted":
			return tr("ENTERPRISE_LOG_ADMITTED").format(fields)
		"rejected":
			return tr("ENTERPRISE_LOG_REJECTED").format(fields)
		"roleCreated":
			return tr("ENTERPRISE_LOG_ROLE_CREATED").format(fields)
		"roleUpdated":
			return tr("ENTERPRISE_LOG_ROLE_UPDATED").format(fields)
		"roleDeleted":
			return tr("ENTERPRISE_LOG_ROLE_DELETED").format(fields)
		"roleAssigned":
			return tr("ENTERPRISE_LOG_ROLE_ASSIGNED").format(fields)
		"roleUnassigned":
			return tr("ENTERPRISE_LOG_ROLE_UNASSIGNED").format(fields)
		"identityUpdated":
			return tr("ENTERPRISE_LOG_IDENTITY_UPDATED").format(fields)
		"diplomacy":
			return _diplomacy_text(entry, actor)
		"logo":
			if entry.value == "ready":
				return tr("ENTERPRISE_LOG_LOGO_READY")
			if entry.value == "failed":
				return tr("ENTERPRISE_LOG_LOGO_FAILED")
			return ""
		"taxRate":
			var tax := {"actor": actor, "resource": resource_text(entry.resource, self), "percent": entry.percent,
				"duration": TimeFormat.duration(maxi(entry.effective_at - entry.game_time_ms, 0))}
			if entry.effective_at > entry.game_time_ms:
				return tr("ENTERPRISE_LOG_TAX_ANNOUNCED").format(tax)
			return tr("ENTERPRISE_LOG_TAX_SET").format(tax)
		"taxRateEffective":
			return tr("ENTERPRISE_LOG_TAX_EFFECTIVE").format({"resource": resource_text(entry.resource, self),
				"percent": entry.percent})
	return ""


func _diplomacy_text(entry: EnterpriseLog.Entry, actor: String) -> String:
	var fields := {"actor": actor, "faction": faction_text(entry.faction)}
	match entry.value:
		"war":
			return tr("ENTERPRISE_LOG_WAR").format(fields)
		"peace":
			return tr("ENTERPRISE_LOG_PEACE").format(fields)
		"peaceProposed":
			return tr("ENTERPRISE_LOG_PEACE_PROPOSED").format(fields)
		"alliance":
			return tr("ENTERPRISE_LOG_ALLIANCE").format(fields)
		"allianceProposed":
			return tr("ENTERPRISE_LOG_ALLIANCE_PROPOSED").format(fields)
		"proposalWithdrawn":
			return tr("ENTERPRISE_LOG_PROPOSAL_WITHDRAWN").format(fields)
		"allianceBroken":
			return tr("ENTERPRISE_LOG_ALLIANCE_BROKEN").format(fields)
	return tr("ENTERPRISE_LOG_DIPLOMACY").format(fields)


func _role_text(role_id: String) -> String:
	var found := model.mine.role(role_id) if model.mine != null and not role_id.is_empty() else null
	return found.name if found != null else tr("ENTERPRISE_SOME_ROLE")
