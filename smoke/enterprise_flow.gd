class_name EnterpriseFlow
extends Node
## End-to-end check of enterprises, roles, taxes, the inventory, the log and diplomacy against
## the server, with two own accounts: A (`.local/enterprise-a-account.json`, signed in through
## the session like the app) and B (`.local/enterprise-b-account.json`, its own ApiClient and
## event stream). Both act through EnterpriseModel, the model the screens use.
##
##   node tools/dev-account.cjs --account enterprise-a /v2/me   (and --account enterprise-b)
##   powershell -File tools\colony-smoke.ps1 -Scene enterprise_flow
##
## A founds (closed), B applies, withdraws, is rejected, applies, is admitted; roles with their
## rules; taxes (announced increase, cancel, refusals); inventory; log; removing, inviting,
## joining by invitation, leaving; B founds its own; alliance proposed, withdrawn, accepted,
## broken; war and peace; the logo. Both enterprises are dissolved at the end (also left-overs
## of an aborted run at the start), so the flow can run again.

const ACCOUNT_A := "res://.local/enterprise-a-account.json"
const ACCOUNT_B := "res://.local/enterprise-b-account.json"
## How long to wait for an event (ms).
const EVENT_WAIT := 8000
## How long to wait for the logo at the end (ms): it is generated outside.
const LOGO_WAIT := 90000

var _failures := 0
var _a: EnterpriseModel
var _b: EnterpriseModel
var _b_api: ApiClient
var _b_events: EventStream
## Events seen by A and B: [type, data].
var _events_a: Array[Array] = []
var _events_b: Array[Array] = []


func _ready() -> void:
	_run()


func _check(ok: bool, label: String) -> void:
	if not ok:
		_failures += 1
	print("%s  %s" % ["PASS" if ok else "FAIL", label])


func _note(text: String) -> void:
	print("ENTERPRISE  " + text)


func _code(result: ApiResult) -> String:
	if result.is_ok():
		return "(none)"
	return "transport: " + result.error.message if result.error.is_transport() else result.error.code


## Checks that a call was refused with `code`.
func _refused(result: ApiResult, code: String, label: String) -> void:
	_check(not result.is_ok() and result.error.code == code, "%s → %s (got %s)" % [label, code, _code(result)])


func _ok(result: ApiResult, label: String) -> bool:
	_check(result.is_ok(), "%s (%s)" % [label, _code(result)])
	return result.is_ok()


func _wait_until(condition: Callable, timeout_ms: int) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline:
		if condition.call():
			return true
		await get_tree().process_frame
	return condition.call()


## Waits for an event of `type` (about `id` when given) that arrived after index `from`.
func _wait_event(events: Array[Array], type: String, from: int, id: String = "") -> bool:
	var seen := func() -> bool:
		for index: int in range(from, events.size()):
			var entry: Array = events[index]
			var data: Dictionary = entry[1]
			if entry[0] == type and (id.is_empty() or Wire.as_string(data.get("enterpriseId")) == id):
				return true
		return false
	return await _wait_until(seen, EVENT_WAIT)


func _event_types(events: Array[Array], from: int) -> String:
	var types := PackedStringArray()
	for index: int in range(from, events.size()):
		var entry: Array = events[index]
		types.append(str(entry[0]))
	return ", ".join(types) if not types.is_empty() else "none"


func _account(path: String) -> Dictionary:
	return Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(path)))


func _run() -> void:
	await get_tree().process_frame
	var account_a := _account(ACCOUNT_A)
	var account_b := _account(ACCOUNT_B)
	if account_a.is_empty() or account_b.is_empty():
		print("FAIL  no enterprise accounts (node tools/dev-account.cjs --account enterprise-a /v2/me, and enterprise-b)")
		get_tree().quit(2)
		return
	print("server: ", Services.server.base)
	var signed_in := await Services.session.login(Wire.as_string(account_a.get("email")), Wire.as_string(account_a.get("password")))
	_check(signed_in == null, "A signs in")
	if signed_in != null:
		get_tree().quit(1)
		return
	await _wait_until(func() -> bool: return Services.definitions != null, 15000)
	_a = EnterpriseModel.new()
	add_child(_a)
	_a.event_seen.connect(func(type: String, data: Dictionary) -> void: _events_a.append([type, data]))

	_b_api = ApiClient.new()
	_b_api.base_url = Services.server.base
	add_child(_b_api)
	var login := await _b_api.post_json("/v2/auth/login", {"email": Wire.as_string(account_b.get("email")),
		"password": Wire.as_string(account_b.get("password"))}, false)
	_check(login.is_ok(), "B signs in (%s)" % _code(login))
	if not login.is_ok():
		_finish()
		return
	_b_api.token = Wire.as_string(login.data.get("token"))
	var me_b := await _b_api.get_json("/v2/me")
	var player_b := Account.from_me(me_b.data)
	_b_events = EventStream.new()
	add_child(_b_events)
	_b_events.start(Services.server, _b_api.token, me_b.rev)
	_b = EnterpriseModel.new()
	_b.setup(_b_api, _b_events, player_b)
	add_child(_b)
	_b.event_seen.connect(func(type: String, data: Dictionary) -> void: _events_b.append([type, data]))
	await _wait_until(func() -> bool: return Services.events.state() == EventStream.State.OPEN \
		and _b_events.state() == EventStream.State.OPEN, 10000)
	_check(_b_events.state() == EventStream.State.OPEN, "both event streams are open")
	var id_a := _a.player_id()
	var id_b := _b.player_id()
	_note("A is player %s, B is player %s" % [id_a, id_b])

	await _clean_up("left-over")
	var enterprise := await _found_and_apply(id_b)
	if enterprise.is_empty():
		await _clean_up("after failure")
		_finish()
		return
	await _roles(id_a, id_b)
	await _taxes()
	await _stock_and_log()
	await _members(enterprise, id_b)
	var other := await _diplomacy(enterprise, id_b)
	await _logo()
	await _dissolve_both(enterprise, other)
	_finish()


## Dissolves (or leaves) whatever enterprise A and B are in.
func _clean_up(why: String) -> void:
	for model: EnterpriseModel in [_a, _b]:
		await model.reload()
		if model.mine == null:
			continue
		var id := model.mine.enterprise_id
		var result: ApiResult = null
		if model.mine.has_flag("DISSOLVE"):
			result = await model.dissolve()
		else:
			result = await model.leave()
		_note("%s enterprise %s ended: %s" % [why, id, _code(result)])


## A founds a closed enterprise; B applies, withdraws, is rejected, applies and is admitted.
func _found_and_apply(id_b: String) -> String:
	var names := await _a.suggest_names()
	var suggestions := Enterprise.suggestions_from_wire(names.data)
	var shown := PackedStringArray()
	for suggestion: Enterprise.Suggestion in suggestions:
		shown.append("%s [%s]" % [suggestion.name, suggestion.ticker])
	_check(names.is_ok() and suggestions.size() >= 1 and suggestions.size() <= 5,
		"name suggestions: %d (%s)" % [suggestions.size(), ", ".join(shown)])
	if suggestions.is_empty():
		return ""
	_check(typeof(suggestions[0].components.get("shape")) == TYPE_INT, "components are integers")
	var start_a := _events_a.size()
	var founded := await _a.found(suggestions[0], "Smoke test enterprise", false)
	if not _ok(founded, "A founds %s (closed)" % suggestions[0].name):
		return ""
	var mine := _a.mine
	var id := mine.enterprise_id
	_check(mine.name == suggestions[0].name and mine.ticker == suggestions[0].ticker, "name and ticker as suggested")
	_check(mine.is_founder() and mine.role(Enterprise.FOUNDER_ROLE) != null and mine.role(Enterprise.FOUNDER_ROLE).system,
		"A holds the founder role (id 1, system)")
	var all := true
	for flag: String in Enterprise.FLAGS:
		all = all and mine.has_flag(flag)
	_check(all, "founder has every right: %s" % ", ".join(mine.my_flags))
	_check(not mine.is_open() and mine.faction == "enterprise-" + id, "closed, faction %s" % mine.faction)
	_check(mine.logo.status in ["pending", "ready", "failed"] and mine.logo.urls.size() == 3,
		"logo %s, %d sizes (%s)" % [mine.logo.status, mine.logo.urls.size(), mine.logo.url])
	await _a.reload()
	_check(_a.account.enterprise_id == id and _a.account.enterprise_flags.has("SET_TAX"), "/v2/me names the enterprise and the rights")
	_refused(await _a.found(suggestions[min(1, suggestions.size() - 1)], "", true), "ALREADY_IN_ENTERPRISE", "A founds a second one")
	_note("A events after founding: %s" % _event_types(_events_a, start_a))

	await _b.reload_list()
	_check(_b.summary(id) != null, "B sees the enterprise in the list (%d listed)" % _b.summaries.size())
	_refused(await _b.join(id), "JOIN_CLOSED", "B joins a closed enterprise")
	var before := _events_a.size()
	if not _ok(await _b.apply_to(id), "B applies"):
		return ""
	_check((_b.details[id] as Enterprise).applied, "B's view says applied")
	await _wait_event(_events_a, "enterprise.updated", before, id)
	_note("A events after the application: %s" % _event_types(_events_a, before))
	await _a.reload()
	_check(_a.mine.applications.size() == 1 and _a.mine.applications[0].player_id == id_b, "A sees B's application")
	_ok(await _b.withdraw_application(id), "B withdraws the application")
	_check(not (_b.details[id] as Enterprise).applied, "B's view no longer says applied")
	_ok(await _b.apply_to(id), "B applies again")
	await _a.reload()
	if _ok(await _a.reject(id_b), "A rejects B"):
		_check(_a.mine.applications.is_empty(), "no application left")
	_ok(await _b.apply_to(id), "B applies a third time")
	var before_b := _events_b.size()
	before = _events_a.size()
	if not _ok(await _a.admit(id_b), "A admits B"):
		return ""
	_check(_a.mine.members.size() == 2, "two members")
	await _wait_event(_events_a, "enterprise.memberJoined", before, id)
	_check(_event_types(_events_a, before).contains("enterprise.memberJoined"), "A got enterprise.memberJoined")
	await _wait_until(func() -> bool: return _b.mine != null, EVENT_WAIT)
	_note("B events after admission: %s" % _event_types(_events_b, before_b))
	_check(_b.mine != null and _b.mine.enterprise_id == id, "B's model follows into the enterprise")
	_check(_b.account.enterprise_id == id, "B's account names the enterprise")
	return id


func _roles(id_a: String, id_b: String) -> void:
	var created := await _a.create_role("Officer", PackedStringArray(["MANAGE_MEMBERS"]))
	if not _ok(created, "A creates the role Officer with MANAGE_MEMBERS"):
		return
	var role_id := Wire.as_string(created.data.get("roleId"))
	_check(_a.mine.role(role_id) != null and _a.mine.role(role_id).flags == PackedStringArray(["MANAGE_MEMBERS"]),
		"role %s listed with its right" % role_id)
	_ok(await _a.assign_role(id_b, role_id), "A gives B the role")
	_check(_a.mine.member(id_b).role_ids.has(role_id), "B holds it in A's view")
	await _b.reload()
	_check(_b.mine.has_flag("MANAGE_MEMBERS") and not _b.mine.has_flag("MANAGE_ROLES"), "B has MANAGE_MEMBERS only")
	_check(_b.account.enterprise_flags.has("MANAGE_MEMBERS"), "B's /v2/me lists the right")
	_refused(await _b.create_role("Spy", PackedStringArray(["SET_DIPLOMACY"])), "MISSING_FLAG", "B creates a role without MANAGE_ROLES")
	_refused(await _b.kick(id_b), "VALIDATION_FAILED", "B removes itself")
	var founder_kick := await _b.kick(id_a)
	_note("B removes the founder: %s" % _code(founder_kick))
	_check(not founder_kick.is_ok(), "B cannot remove the founder")
	_ok(await _a.update_role(Enterprise.FOUNDER_ROLE, "Founders", PackedStringArray()), "A renames the founder role")
	_check(_a.mine.role(Enterprise.FOUNDER_ROLE).name == "Founders" and _a.mine.role(Enterprise.FOUNDER_ROLE).flags.size() == Enterprise.FLAGS.size(),
		"founder role renamed, rights kept")
	_refused(await _a.api.patch_json("/v2/enterprises/%s/roles/1" % _a.mine.enterprise_id, {"flags": ["MANAGE_MEMBERS"]}),
		"SYSTEM_ROLE_LOCKED", "A changes the founder role's rights")
	_refused(await _a.delete_role(Enterprise.FOUNDER_ROLE), "SYSTEM_ROLE_LOCKED", "A deletes the founder role")
	_refused(await _a.unassign_role(id_a, Enterprise.FOUNDER_ROLE), "LAST_FOUNDER", "A drops the founder role")
	_refused(await _a.leave(), "LAST_FOUNDER", "A leaves as the only founder")
	_ok(await _a.unassign_role(id_b, role_id), "A takes the role from B")
	_check(not _a.mine.member(id_b).role_ids.has(role_id), "B no longer holds it")
	_ok(await _a.update_role(role_id, "Treasurer", PackedStringArray(["SET_TAX"])), "A edits the role")
	_check(_a.mine.role(role_id).name == "Treasurer" and _a.mine.role(role_id).has_flag("SET_TAX"), "role renamed with SET_TAX")
	_ok(await _a.delete_role(role_id), "A deletes the role")
	_check(_a.mine.role(role_id) == null, "role gone")


func _taxes() -> void:
	await _a.reload_taxes()
	var taxes := _a.taxes
	_check(taxes != null and taxes.max_percent == 50 and taxes.increase_delay_ms == 86400000,
		"taxes: max %d %%, increases after %d ms" % [taxes.max_percent if taxes != null else -1, taxes.increase_delay_ms if taxes != null else -1])
	var key := "IRON" if Services.definitions.is_taxable("IRON") else Services.definitions.taxable_resources()[0]
	var before_a := _events_a.size()
	var before_b := _events_b.size()
	var raised := await _a.set_taxes({key: 10})
	if _ok(raised, "A raises the tax on %s to 10 %%" % key):
		var pending := _a.taxes.pending(key)
		_check(_a.taxes.percent(key) == 0 and pending != null and pending.pending_percent == 10, "the raise is announced, 0 % still counts")
		if pending != null:
			var lead := pending.effective_at - raised.game_time_ms
			_check(absi(lead - _a.taxes.increase_delay_ms) < 120000, "it counts %d ms later" % lead)
	await _wait_event(_events_a, "enterprise.taxes", before_a)
	_check(_event_types(_events_a, before_a).contains("enterprise.taxes"), "A got enterprise.taxes")
	await _wait_event(_events_b, "enterprise.taxes", before_b)
	_check(_event_types(_events_b, before_b).contains("enterprise.taxes"), "B got enterprise.taxes")
	var again := await _a.set_taxes({key: 5})
	if _ok(again, "A announces 5 % instead"):
		_check(_a.taxes.pending(key) != null and _a.taxes.pending(key).pending_percent == 5, "the announcement is 5 %")
	if _ok(await _a.set_taxes({}), "A sets the table back to nothing"):
		_check(not _a.taxes.rates.has(key), "the announcement is cancelled")
	var utility := ""
	var item := ""
	for value: Variant in Services.definitions.bundle.get("resources"):
		var row := Wire.as_dict(value)
		if row.get("utility") == true and utility.is_empty():
			utility = Wire.as_string(row.get("key"))
		if Wire.as_string(row.get("kind")) == "MODULE_ITEM" and item.is_empty():
			item = Wire.as_string(row.get("key"))
	_refused(await _a.set_taxes({utility: 5}), "NOT_TAXABLE", "A taxes the utility %s" % utility)
	_refused(await _a.set_taxes({item: 5}), "NOT_TAXABLE", "A taxes the module item %s" % item)
	_refused(await _a.api.put_json("/v2/enterprises/%s/taxes" % _a.mine.enterprise_id,
		{"rates": [{"resource": key, "percent": 51}]}), "VALIDATION_FAILED", "A sets 51 %")
	await _b.reload()
	_refused(await _b.set_taxes({key: 5}), "MISSING_FLAG", "B sets taxes without SET_TAX")
	_note("a lower rate counting at once needs a rate that already counts (a day after a raise): not checked live")


func _stock_and_log() -> void:
	await _a.reload_stock()
	_check(_a.stock != null and _a.stock.at > 0, "A reads the inventory (%d goods)" % (_a.stock.items.size() if _a.stock != null else -1))
	await _b.reload_stock()
	_check(_b.stock != null, "B reads the inventory as a member")
	var answer := await _a.load_log(0, 50)
	var kinds := PackedStringArray()
	if _ok(answer, "A reads the log"):
		var page := EnterpriseLog.from_wire(answer.data)
		for entry: EnterpriseLog.Entry in page.entries:
			if not kinds.has(entry.kind):
				kinds.append(entry.kind)
	_note("log kinds: %s" % ", ".join(kinds))
	for wanted: String in ["founded", "applied", "applicationWithdrawn", "rejected", "admitted", "roleCreated",
			"roleAssigned", "roleUnassigned", "roleUpdated", "roleDeleted", "taxRate"]:
		_check(kinds.has(wanted), "log holds %s" % wanted)
	var older := await _a.load_log(EnterpriseLog.from_wire(answer.data).oldest, 50)
	_check(older.is_ok(), "older page of the log (%s)" % _code(older))


## A removes B, invites, takes back and invites again; B joins by invitation and leaves.
func _members(id: String, id_b: String) -> void:
	var before_b := _events_b.size()
	if _ok(await _a.kick(id_b), "A removes B"):
		_check(_a.mine.members.size() == 1, "one member left")
	await _wait_until(func() -> bool: return _b.mine == null, EVENT_WAIT)
	_note("B events after removal: %s" % _event_types(_events_b, before_b))
	_check(_b.mine == null and _b.account.enterprise_id.is_empty(), "B's model follows out of the enterprise")
	before_b = _events_b.size()
	_ok(await _a.invite(id_b), "A invites B")
	_check(_a.mine.invites.size() == 1, "A sees the invitation")
	await _wait_event(_events_b, "enterprise.invited", before_b, id)
	_check(_b.invitations.has(id), "B got enterprise.invited")
	_ok(await _a.revoke_invite(id_b), "A takes the invitation back")
	_refused(await _a.revoke_invite(id_b), "NOT_INVITED", "A takes it back twice")
	_ok(await _a.invite(id_b), "A invites B again")
	await _b.load_detail(id)
	_check((_b.details[id] as Enterprise).invited, "B's view says invited")
	if _ok(await _b.join(id), "B joins the closed enterprise by invitation"):
		_check(_b.mine != null and _b.invitations.is_empty(), "B is a member, the invitation is used up")
	var left := await _b.leave()
	if _ok(left, "B leaves"):
		_check(Wire.as_int(left.data.get("effectiveAt")) > left.game_time_ms and str(left.data.get("dissolved")) == "false",
			"leaving counts in combat %d ms later" % (Wire.as_int(left.data.get("effectiveAt")) - left.game_time_ms))
	await _b.reload_diplomacy()
	var faction := Enterprise.faction_of(id)
	_check(_b.diplomacy != null and _b.diplomacy.pact_remaining_ms(faction, Services.clock.now_ms()) > 0,
		"B stays a friend of the enterprise for a while (endingPacts)")
	if _ok(await _a.update_identity("Open to all now", true), "A changes description and join mode"):
		_check(_a.mine.is_open() and _a.mine.description == "Open to all now", "the enterprise is open")


## B founds its own; the two go through alliance, break, war and peace.
func _diplomacy(id: String, id_b: String) -> String:
	var names := await _b.suggest_names()
	var suggestions := Enterprise.suggestions_from_wire(names.data)
	if suggestions.is_empty() or not _ok(await _b.found(suggestions[0], "", true), "B founds %s" % (suggestions[0].name if not suggestions.is_empty() else "?")):
		return ""
	var other := _b.mine.enterprise_id
	var fa := Enterprise.faction_of(other)
	var fb := Enterprise.faction_of(id)
	await _a.reload_diplomacy()
	_check(_a.diplomacy.faction == fb and _a.diplomacy.steps(fa) == PackedStringArray(["alliance", "war"]),
		"A may propose an alliance or declare war")
	var before_b := _events_b.size()
	_ok(await _a.diplomacy_step(fa, "alliance"), "A proposes an alliance")
	_check(_a.diplomacy.proposed_by_us(fa) and _a.diplomacy.steps(fa) == PackedStringArray(["withdraw", "war"]), "A's proposal is open")
	await _wait_event(_events_b, "diplomacy.proposal", before_b)
	_check(_event_types(_events_b, before_b).contains("diplomacy.proposal"), "B got diplomacy.proposal")
	_ok(await _a.diplomacy_step(fa, "withdraw"), "A withdraws it")
	_check(not _a.diplomacy.proposed_by_us(fa), "no proposal left")
	_refused(await _a.diplomacy_step(fa, "accept"), "PROPOSAL_NOT_FOUND", "A accepts a proposal that is not there")
	_ok(await _a.diplomacy_step(fa, "alliance"), "A proposes the alliance again")
	await _b.reload_diplomacy()
	_check(_b.diplomacy.proposed_to_us(fb) and _b.diplomacy.steps(fb).has("accept"), "B sees the proposal to accept")
	var before_a := _events_a.size()
	_ok(await _b.diplomacy_step(fb, "accept"), "B accepts")
	_check(_b.diplomacy.stance_with(fb) == Diplomacy.ALLIED, "allied for B")
	await _wait_event(_events_a, "diplomacy.changed", before_a)
	_check(_event_types(_events_a, before_a).contains("diplomacy.changed"), "A got diplomacy.changed")
	await _wait_until(func() -> bool: return _a.diplomacy.stance_with(fa) == Diplomacy.ALLIED, EVENT_WAIT)
	_check(_a.diplomacy.stance_with(fa) == Diplomacy.ALLIED and _a.diplomacy.steps(fa) == PackedStringArray(["break", "war"]),
		"allied for A (model reloaded on the event)")
	_ok(await _a.diplomacy_step(fa, "break"), "A ends the alliance")
	var remaining := _a.diplomacy.pact_remaining_ms(fa, Services.clock.now_ms())
	_check(_a.diplomacy.stance_with(fa) == Diplomacy.NEUTRAL and remaining > 3000000,
		"neutral again, friends in combat for %d ms (endingPacts)" % remaining)
	_ok(await _a.diplomacy_step(fa, "war"), "A declares war")
	_check(_a.diplomacy.stance_with(fa) == Diplomacy.HOSTILE and _a.diplomacy.steps(fa) == PackedStringArray(["peace"]), "at war")
	_refused(await _a.diplomacy_step(fa, "alliance"), "INVALID_DIPLOMACY", "A proposes an alliance out of war")
	_ok(await _b.diplomacy_step(fb, "peace"), "B proposes peace")
	await _a.reload_diplomacy()
	_check(_a.diplomacy.proposed_to_us(fa) and _a.diplomacy.steps(fa).has("accept"), "A may accept peace")
	_ok(await _a.diplomacy_step(fa, "accept"), "A accepts peace")
	_check(_a.diplomacy.stance_with(fa) == Diplomacy.NEUTRAL, "neutral again")
	var bogus := await _a.api.post_json("/v2/diplomacy/%s/bogus" % fa, {})
	_check(not bogus.is_ok() and bogus.error.http_status == 404, "an unknown step is 404 (%s)" % _code(bogus))
	var member := await _a.diplomacy_step("player-" + id_b, "war")
	_note("war on a player inside an enterprise: %s" % _code(member))
	_check(not member.is_ok(), "a member is only reachable through the enterprise")
	return other


func _logo() -> void:
	var start := Time.get_ticks_msec()
	await _wait_until(func() -> bool: return _a.mine != null and not _a.mine.logo.is_pending(), LOGO_WAIT)
	var logo_events := 0
	for entry: Array in _events_a:
		if entry[0] == "enterprise.logo":
			logo_events += 1
	_note("logo %s after %d s, %d enterprise.logo event(s)" % [_a.mine.logo.status, roundi((Time.get_ticks_msec() - start) / 1000.0), logo_events])
	_check(_a.mine.logo.status != "pending", "the logo left pending (%s)" % _a.mine.logo.status)
	var bytes := await _a.api.get_bytes(_a.mine.logo.url_for(64))
	var image := Image.new()
	_check(not bytes.is_empty() and image.load_webp_from_buffer(bytes) == OK,
		"logo picture loads: %d bytes, %dx%d, alpha %s" % [bytes.size(), image.get_width(), image.get_height(), str(image.detect_alpha() != Image.ALPHA_NONE)])


func _dissolve_both(id: String, other: String) -> void:
	if not other.is_empty():
		var gone := await _b.dissolve()
		_ok(gone, "B dissolves its enterprise")
		_check(gone.is_ok() and str(gone.data.get("dissolved")) == "true" and _b.mine == null, "dissolved, B is alone")
	var before := _events_a.size()
	var ended := await _a.dissolve()
	_ok(ended, "A dissolves the enterprise")
	_check(ended.is_ok() and str(ended.data.get("dissolved")) == "true" and _a.mine == null and _a.account.enterprise_id.is_empty(),
		"dissolved, A is alone")
	await _wait_event(_events_a, "enterprise.dissolved", before, id)
	_note("A events after dissolving: %s" % _event_types(_events_a, before))
	await _a.reload()
	_check(_a.mine == null and _a.account.enterprise_id.is_empty(), "/v2/me names no enterprise")
	await _a.reload_list()
	_check(_a.summary(id) == null and (other.is_empty() or _a.summary(other) == null), "both are gone from the list")
	_refused(await _a.api.get_json("/v2/enterprises/" + id), "ENTERPRISE_NOT_FOUND", "the enterprise is gone")


func _finish() -> void:
	if _b_events != null:
		_b_events.stop()
	print("%s  enterprise flow: %d failure(s)" % ["PASS" if _failures == 0 else "FAIL", _failures])
	await Services.session.logout()
	get_tree().quit(0 if _failures == 0 else 1)
