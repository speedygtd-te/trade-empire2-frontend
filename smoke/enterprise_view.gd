extends Control
## Pictures of the enterprise screens for review, live with the two accounts of
## smoke/enterprise_flow.gd (A through the session as the app does, B through its own client):
## Browse with an invitation and its detail, Found with suggestions, the overview with the logo,
## diplomacy with an ended alliance and an open proposal, taxes with announced increases and the
## editor, the inventory (live, then a made-up sample — never sent), members with an application
## and with role switches, the role editor, the dissolve warning and the log. Both enterprises
## are dissolved at the end.
##
##   godot --path . --resolution 720x1280 res://smoke/enterprise_view.tscn -- --out=build/enterprise

const ACCOUNT_A := "res://.local/enterprise-a-account.json"
const ACCOUNT_B := "res://.local/enterprise-b-account.json"

var _out_dir := "user://enterprise"
var _a: EnterpriseModel
var _b: EnterpriseModel
var _panel: EnterprisePanel


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var account_a := _account(ACCOUNT_A)
	var account_b := _account(ACCOUNT_B)
	if account_a.is_empty() or account_b.is_empty():
		print("SKIP  no enterprise accounts (node tools/dev-account.cjs --account enterprise-a /v2/me, and enterprise-b)")
		get_tree().quit(2)
		return
	var had_session := not SessionStore.new().load_token(Services.server.base).is_empty()
	var error := await Services.session.login(Wire.as_string(account_a.get("email")), Wire.as_string(account_a.get("password")))
	if error != null:
		print("SKIP  sign-in failed: %s" % (error.message if error.is_transport() else error.code))
		get_tree().quit(1)
		return
	await _until(func() -> bool: return Services.definitions != null, 15000)
	_a = EnterpriseModel.new()
	add_child(_a)
	var b_api := ApiClient.new()
	b_api.base_url = Services.server.base
	add_child(b_api)
	var login := await b_api.post_json("/v2/auth/login", {"email": Wire.as_string(account_b.get("email")),
		"password": Wire.as_string(account_b.get("password"))}, false)
	if not login.is_ok():
		print("SKIP  B sign-in failed: %s" % login.error.code)
		get_tree().quit(1)
		return
	b_api.token = Wire.as_string(login.data.get("token"))
	var me_b := await b_api.get_json("/v2/me")
	var b_events := EventStream.new()
	add_child(b_events)
	b_events.start(Services.server, b_api.token, me_b.rev)
	_b = EnterpriseModel.new()
	_b.setup(b_api, b_events, Account.from_me(me_b.data))
	add_child(_b)
	await _until(func() -> bool: return Services.events.state() == EventStream.State.OPEN, 10000)
	await _clean_up()

	# B founds a closed enterprise and invites A.
	var names := Enterprise.suggestions_from_wire((await _b.suggest_names()).data)
	var b_found := await _b.found(names[0], "Haulers of the outer belt. We share routes and ore.", false)
	print("VIEW  B founds %s: %s" % [names[0].name, _code(b_found)])
	print("VIEW  B invites A: %s" % _code(await _b.invite(_a.player_id())))
	await _until(func() -> bool: return _a.invitations.size() > 0, 8000)

	_panel = EnterprisePanel.new()
	_panel.setup(_a)
	add_child(_panel)
	await _until(func() -> bool: return _a.loaded and _a.list_loaded, 8000)
	var browse := _panel.current_tab() as EnterpriseBrowseTab
	await browse.shown()
	await _capture("enterprise_browse")
	browse._show_detail(_b.mine.enterprise_id)
	await _until(func() -> bool: return _a.details.has(_b.mine.enterprise_id), 8000)
	await _capture("enterprise_browse_detail")
	browse._show_detail("")
	_panel.show_tab(1)
	var found := _panel.current_tab() as EnterpriseFoundTab
	await _until(func() -> bool: return not found._suggestions.is_empty(), 8000)
	found._description.text = "Miners and traders of the home system."
	found._closed_button.button_pressed = true
	await _capture("enterprise_found")

	# A founds; the panel turns into the member view.
	await found._on_found()
	await _until(func() -> bool: return _a.mine != null and _panel.current_tab() is EnterpriseOverviewTab, 8000)
	print("VIEW  A founded %s, logo %s" % [_a.mine.name if _a.mine != null else "-", _a.mine.logo.status if _a.mine != null else "-"])
	await _capture("enterprise_overview_pending")
	await _until(func() -> bool: return _a.mine != null and not _a.mine.logo.is_pending(), 90000)
	await get_tree().create_timer(3.0).timeout
	print("VIEW  logo now %s" % _a.mine.logo.status)
	await _capture("enterprise_overview")

	# Diplomacy: an alliance that ended (still friends for an hour) and a new proposal.
	var fa := _b.mine.faction
	var fb := _a.mine.faction
	print("VIEW  alliance: %s, accept: %s, break: %s, propose again: %s" % [
		_code(await _a.diplomacy_step(fa, "alliance")), _code(await _b.diplomacy_step(fb, "accept")),
		_code(await _a.diplomacy_step(fa, "break")), _code(await _b.diplomacy_step(fb, "alliance"))])
	_panel.show_tab(3)
	await _until(func() -> bool: return _a.diplomacy != null and _a.diplomacy.proposed_to_us(fa), 8000)
	await _capture("enterprise_diplomacy")
	var diplomacy := _panel.current_tab() as EnterpriseDiplomacyTab
	diplomacy._on_step(fa, "war")
	await _capture("enterprise_diplomacy_war_armed")
	diplomacy.armed = ""
	diplomacy._picking = true
	diplomacy.refresh()
	await _capture("enterprise_diplomacy_pick")
	diplomacy._picking = false
	diplomacy.refresh()

	# Taxes: two announced increases, then the editor on one of them.
	print("VIEW  taxes: %s" % _code(await _a.set_taxes({"IRON": 10, "WATER": 5})))
	_panel.show_tab(4)
	var taxes := _panel.current_tab() as EnterpriseTaxesTab
	await _until(func() -> bool: return _a.taxes != null, 8000)
	await _capture("enterprise_taxes")
	taxes._choose("IRON")
	taxes._on_step(5)
	await _capture("enterprise_taxes_edit")
	taxes._on_undo()
	taxes._chosen = ""
	taxes._show_stock(true)
	await _until(func() -> bool: return _a.stock != null, 8000)
	await _capture("enterprise_inventory")
	var now := Services.clock.now_ms()
	_a.stock = EnterpriseTaxes.Stock.from_wire({"at": now, "items": [
		{"resource": "IRON", "value": 1520000000, "ratePerHour": 36000000},
		{"resource": "WATER", "value": 230500000, "ratePerHour": 9000000},
		{"resource": "COPPER", "value": 8000000, "ratePerHour": 500000},
	]})
	_a.stock_changed.emit()
	print("SAMPLE  inventory with made-up goods (not from the server)")
	await _capture("enterprise_inventory_sample")
	_a.reload_stock()

	# B leaves its own (dissolves it) and applies to A's.
	print("VIEW  B dissolves: %s, applies: %s" % [_code(await _b.dissolve()), _code(await _b.apply_to(_a.mine.enterprise_id))])
	await _a.reload()
	_panel.show_tab(1)
	await _capture("enterprise_members_application")
	var members := _panel.current_tab() as EnterpriseMembersTab
	await members._on_admit(_b.player_id())
	var created := await _a.create_role("Officer", PackedStringArray(["MANAGE_MEMBERS", "SET_DIPLOMACY"]))
	print("VIEW  admit and role: %s" % _code(created))
	await _a.assign_role(_b.player_id(), Wire.as_string(created.data.get("roleId")))
	members._toggle(_b.player_id())
	await _capture("enterprise_members_roles")
	members._on_kick(_b.player_id())
	await _capture("enterprise_members_kick_armed")
	members.armed = ""
	members._toggle(_b.player_id())
	_panel.show_tab(2)
	await _capture("enterprise_roles")
	var roles := _panel.current_tab() as EnterpriseRolesTab
	roles._open_editor(Wire.as_string(created.data.get("roleId")))
	await _capture("enterprise_role_editor")
	roles._close_editor()
	roles._open_editor(Enterprise.FOUNDER_ROLE)
	await _capture("enterprise_role_editor_founder")
	roles._close_editor()

	_panel.show_tab(0)
	var overview := _panel.current_tab() as EnterpriseOverviewTab
	overview._on_dissolve()
	await _until(func() -> bool: return _a.stock != null, 5000)
	overview.refresh()
	await _capture("enterprise_dissolve_warning")
	overview.armed = ""
	overview.refresh()
	_panel.show_tab(5)
	await get_tree().create_timer(2.0).timeout
	await _capture("enterprise_log")

	_panel.queue_free()
	await _clean_up()
	b_events.stop()
	if not had_session:
		await Services.session.logout()
	get_tree().quit()


func _clean_up() -> void:
	for model: EnterpriseModel in [_a, _b]:
		await model.reload()
		if model.mine == null:
			continue
		var result: ApiResult = null
		if model.mine.has_flag("DISSOLVE"):
			result = await model.dissolve()
		else:
			result = await model.leave()
		print("VIEW  enterprise ended: %s" % _code(result))


func _account(path: String) -> Dictionary:
	return Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(path)))


func _code(result: ApiResult) -> String:
	return "ok" if result.is_ok() else result.error.code


func _until(condition: Callable, timeout_ms: int = 8000) -> void:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline and not condition.call():
		await get_tree().process_frame


func _capture(file_name: String) -> void:
	await get_tree().create_timer(1.0).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	var saved := get_viewport().get_texture().get_image().save_png(path)
	print("%s  %s" % ["SAVED" if saved == OK else "FAIL ", path])
