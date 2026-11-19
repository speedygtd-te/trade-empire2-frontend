class_name EnterpriseDiplomacyTab
extends EnterpriseTab
## The own enterprise's relations: stance (red hostile, grey neutral, green allied), open
## proposals, alliances that still hold for a while after they ended, and the steps the player
## may take (SET_DIPLOMACY; war and ending an alliance two-step). A new relation starts from the
## list of enterprises. Players without an enterprise can be invited from here (MANAGE_MEMBERS).

## How often the remaining pact times are refreshed (seconds).
const REFRESH_SECONDS := 1.0

var _column: VBoxContainer
var _state: Label
## Choosing an enterprise for a new relation.
var _picking := false
## A faction chosen from the list that has no relation yet; "" when none.
var _target := ""
## Pact labels to update: faction → Label.
var _pact_labels: Dictionary = {}
var _left := 0.0


func _build() -> void:
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_state)
	_column = scroll_column(self, 12)
	model.diplomacy_changed.connect(refresh)
	model.list_changed.connect(_on_list_changed)
	model.changed.connect(refresh)


func shown() -> void:
	model.reload_diplomacy()
	if not model.list_loaded:
		model.reload_list()


func handle_back() -> bool:
	if super.handle_back():
		return true
	if _picking or not _target.is_empty():
		_picking = false
		_target = ""
		refresh()
		return true
	return false


func _process(delta: float) -> void:
	if not is_visible_in_tree() or model.diplomacy == null:
		return
	_left -= delta
	if _left > 0.0:
		return
	_left = REFRESH_SECONDS
	var now := Services.clock.now_ms()
	for faction: String in _pact_labels.keys():
		var label := _pact_labels[faction] as Label
		if is_instance_valid(label):
			label.text = _pact_text(faction, now)


func _on_list_changed() -> void:
	if _picking:
		refresh()


func refresh() -> void:
	if _column == null:
		return
	clear(_column)
	_pact_labels.clear()
	var view := model.mine
	var diplomacy := model.diplomacy
	_state.visible = diplomacy == null
	if diplomacy == null:
		_state.text = tr("COMMON_LOADING") if model.diplomacy_error == null else \
			tr("DIPLOMACY_LOAD_FAILED") + "\n" + ErrorText.describe(model.diplomacy_error, self)
		if model.diplomacy_error != null:
			var retry := Ui.secondary_button("COMMON_RETRY")
			retry.pressed.connect(func() -> void: model.reload_diplomacy())
			_column.add_child(retry)
		return
	if _picking:
		_picker(diplomacy)
		return
	var acting := view != null and view.has_flag("SET_DIPLOMACY")
	if view != null and not acting:
		_column.add_child(Ui.label("DIPLOMACY_NO_RIGHT", AppTheme.VARIATION_MUTED))
	if acting:
		var new_relation := Ui.secondary_button("DIPLOMACY_NEW")
		new_relation.pressed.connect(func() -> void:
			_picking = true
			armed = ""
			refresh())
		_column.add_child(new_relation)
	var shown: Dictionary = {}
	if not _target.is_empty() and diplomacy.relation(_target) == null:
		_relation_card(diplomacy, _target, acting)
		shown[_target] = true
	for relation: Diplomacy.Relation in diplomacy.relations:
		_relation_card(diplomacy, relation.faction, acting)
		shown[relation.faction] = true
	var now := Services.clock.now_ms()
	for faction: String in diplomacy.ending_pacts.keys():
		if not shown.has(faction) and diplomacy.pact_remaining_ms(faction, now) > 0:
			_relation_card(diplomacy, faction, acting)
			shown[faction] = true
	if shown.is_empty():
		_column.add_child(Ui.label("DIPLOMACY_EMPTY", AppTheme.VARIATION_MUTED))


func _relation_card(diplomacy: Diplomacy, faction: String, acting: bool) -> void:
	var rows := card(_column)
	var relation := diplomacy.relation(faction)
	var title := relation.name if relation != null and not relation.name.is_empty() else faction_text(faction)
	text_label(rows, title, AppTheme.VARIATION_HEADING)
	var stance := diplomacy.stance_with(faction)
	var stance_label := text_label(rows, stance_text(stance, self))
	stance_label.add_theme_color_override("font_color", stance_color(stance))
	if relation != null and not relation.proposal_kind.is_empty():
		var key := ""
		if diplomacy.proposed_by_us(faction):
			key = "DIPLOMACY_WE_PROPOSED_ALLIANCE" if relation.proposal_kind == "alliance" else "DIPLOMACY_WE_PROPOSED_PEACE"
		else:
			key = "DIPLOMACY_THEY_PROPOSE_ALLIANCE" if relation.proposal_kind == "alliance" else "DIPLOMACY_THEY_PROPOSE_PEACE"
		text_label(rows, tr(key)).add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	var now := Services.clock.now_ms()
	if diplomacy.pact_remaining_ms(faction, now) > 0:
		var pact := text_label(rows, _pact_text(faction, now))
		pact.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		_pact_labels[faction] = pact
	if not Diplomacy.is_enterprise(faction):
		rows.add_child(Ui.label("DIPLOMACY_SOLO_PLAYER", AppTheme.VARIATION_MUTED))
		_invite_button(rows, faction)
	if not acting:
		return
	var steps := diplomacy.steps(faction)
	if steps.is_empty():
		return
	var actions := button_row(rows)
	for step: String in steps:
		var dangerous := step == Diplomacy.STEP_WAR or step == Diplomacy.STEP_BREAK
		var key := step + ":" + faction
		var text := tr(_step_key(step, relation))
		if armed == key:
			text = tr("DIPLOMACY_CONFIRM")
		var button := action_button(actions, text, dangerous, step == Diplomacy.STEP_ACCEPT)
		button.disabled = busy
		button.pressed.connect(_on_step.bind(faction, step))
	for step: String in steps:
		if armed == step + ":" + faction:
			var warning := "DIPLOMACY_WAR_WARNING" if step == Diplomacy.STEP_WAR else "DIPLOMACY_BREAK_WARNING"
			var shown := text_label(rows, tr(warning))
			shown.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
			reveal(shown)


## Invite a player without an enterprise whose faction is known from diplomacy.
func _invite_button(rows: VBoxContainer, faction: String) -> void:
	var view := model.mine
	if view == null or not view.has_flag("MANAGE_MEMBERS") or not faction.begins_with("player-"):
		return
	var player := faction.trim_prefix("player-")
	for invitee: Enterprise.PlayerRef in view.invites:
		if invitee.player_id == player:
			rows.add_child(Ui.label("DIPLOMACY_INVITED", AppTheme.VARIATION_MUTED))
			return
	var invite := action_button(rows, tr("DIPLOMACY_INVITE"))
	invite.disabled = busy
	invite.pressed.connect(func() -> void:
		await run(func() -> ApiResult: return await model.invite(player), "DIPLOMACY_INVITE_SENT"))


func _picker(diplomacy: Diplomacy) -> void:
	_column.add_child(Ui.label("DIPLOMACY_PICK", AppTheme.VARIATION_MUTED))
	var any := false
	for summary: Enterprise.Summary in model.summaries:
		var faction := Enterprise.faction_of(summary.enterprise_id)
		if faction == diplomacy.faction:
			continue
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.text = "%s  [%s]\n%s" % [summary.name, summary.ticker, stance_text(diplomacy.stance_with(faction), self)]
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.tapped.connect(_pick.bind(faction))
		_column.add_child(row)
		any = true
	if not any:
		_column.add_child(Ui.label("DIPLOMACY_PICK_EMPTY" if model.list_loaded else "COMMON_LOADING", AppTheme.VARIATION_MUTED))
	if model.list_loaded and not model.next_cursor.is_empty():
		var more := Ui.secondary_button("ENTERPRISE_MORE")
		more.pressed.connect(func() -> void: model.reload_list(true))
		_column.add_child(more)
	var back := Ui.secondary_button("ENTERPRISE_CANCEL")
	back.pressed.connect(func() -> void:
		_picking = false
		refresh())
	_column.add_child(back)


func _pick(faction: String) -> void:
	_picking = false
	_target = faction
	refresh()


func _pact_text(faction: String, now: int) -> String:
	var remaining := model.diplomacy.pact_remaining_ms(faction, now) if model.diplomacy != null else 0
	return tr("DIPLOMACY_PACT_ENDING").format({"duration": TimeFormat.duration(remaining)})


## The stances the screen names (DIPLOMACY_STANCE_<STANCE>).
const STANCES: PackedStringArray = [Diplomacy.HOSTILE, Diplomacy.NEUTRAL, Diplomacy.ALLIED]


static func stance_text(stance: String, translator: Object) -> String:
	return translator.tr("DIPLOMACY_STANCE_" + (stance if STANCES.has(stance) else Diplomacy.NEUTRAL).to_upper())


static func stance_color(stance: String) -> Color:
	match stance:
		Diplomacy.HOSTILE:
			return AppTheme.COLOR_DANGER
		Diplomacy.ALLIED:
			return AppTheme.COLOR_OK
	return AppTheme.COLOR_MUTED


static func _step_key(step: String, relation: Diplomacy.Relation) -> String:
	match step:
		Diplomacy.STEP_WAR:
			return "DIPLOMACY_STEP_WAR"
		Diplomacy.STEP_PEACE:
			return "DIPLOMACY_STEP_PEACE"
		Diplomacy.STEP_ALLIANCE:
			return "DIPLOMACY_STEP_ALLIANCE"
		Diplomacy.STEP_ACCEPT:
			return "DIPLOMACY_STEP_ACCEPT_ALLIANCE" if relation != null and relation.proposal_kind == "alliance" else "DIPLOMACY_STEP_ACCEPT_PEACE"
		Diplomacy.STEP_WITHDRAW:
			return "DIPLOMACY_STEP_WITHDRAW"
		Diplomacy.STEP_BREAK:
			return "DIPLOMACY_STEP_BREAK"
	return "DIPLOMACY_STEP_OTHER"


func _on_step(faction: String, step: String) -> void:
	if (step == Diplomacy.STEP_WAR or step == Diplomacy.STEP_BREAK) and not confirm(step + ":" + faction):
		return
	if await run(func() -> ApiResult: return await model.diplomacy_step(faction, step), "DIPLOMACY_DONE"):
		if model.diplomacy != null and model.diplomacy.relation(faction) != null:
			_target = ""
