extends Control
## Pictures of the enterprise's structures (draft.38, package 2) for review, and what live says.
##
## Live first: with the travel account (when its ship rests in orbit) the colony shows a structure
## in orbit without ground and opens it for building (`POST /v2/structures/{id}/ops`); with
## enterprise account A the structure ops path is probed (a free local cell of the own base: the
## server answers in local cells; a foreign structure: NOT_STRUCTURE_OWNER).
##
## Then made-up states no test account can reach (a flagship costs about 1.55 M units): A's own
## base posing as an enterprise structure — the palette without MANAGE_TREASURY and without a
## standing flagship, the enterprise inventory's items, the flagship's and a daughter's store notes
## —, the enterprise section of Fleet with a daughter and an enterprise fleet, forming a fleet, and
## a travel quote paid from the enterprise inventory. Those files end in `_SAMPLE`; nothing of them
## is sent.
##
##   godot --path . --resolution 720x1280 res://smoke/enterprise_build_view.tscn -- --out=build/enterprise2

const ACCOUNT_A := "res://.local/enterprise-a-account.json"
const ACCOUNT_TRAVEL := "res://.local/travel-account.json"

var _out_dir := "user://enterprise2"


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
	await _orbit_views()
	if not await _sign_in(ACCOUNT_A):
		get_tree().quit(1)
		return
	await _live_probes()
	await _samples()
	get_tree().quit(0)


func _sign_in(path: String) -> bool:
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(path)))
	if account.is_empty():
		print("SKIP  no account %s" % path)
		return false
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("FAIL  sign-in %s: %s" % [path, error.message if error.is_transport() else error.code])
		return false
	await _until(func() -> bool: return Services.definitions != null, 15000)
	return true


## A structure resting in orbit: drawn without ground, opened for building (live).
func _orbit_views() -> void:
	if not await _sign_in(ACCOUNT_TRAVEL):
		return
	var list := await FleetModel.list_structures()
	var orbiting := 0
	if list.is_ok():
		for entry: Variant in list.data.get("items"):
			var anchor := Wire.as_dict(Wire.as_dict(entry).get("anchor"))
			if Wire.as_string(anchor.get("type")) == "free" and Wire.as_string(anchor.get("kind")) == "orbit":
				orbiting = Wire.as_int(Wire.as_dict(entry).get("structureId"))
	if orbiting == 0:
		print("SKIP  no structure of the travel account rests in orbit")
		return
	var colony := ColonyScreen.new()
	colony.start_structure = orbiting
	add_child(colony)
	await _until(func() -> bool: return colony._model.structure_id != 0 and colony._model.layout.rev >= 0, 30000)
	await get_tree().create_timer(4.0).timeout
	print("LIVE  orbit structure %d: in_orbit=%s detached=%s" % [orbiting, colony._model.in_orbit, colony._model.detached])
	await _capture("orbit_outside")
	colony._select_structure(true)
	colony._open_structure(ColonyScreen.Mode.BUILD)
	await get_tree().create_timer(2.0).timeout
	await _capture("orbit_build")
	# The structure ops path with a cell next to the structure (refused without the item, or
	# accepted and taken back; nothing stays).
	var probe := await colony._model.send_ops([{"op": "setBlueprint", "x": 999, "y": 999, "z": 0}])
	print("LIVE  orbit structure ops (free cell): %s" % _code(probe))
	colony.queue_free()


func _live_probes() -> void:
	var list := await FleetModel.list_structures()
	var own := Wire.as_int(Wire.as_dict((list.data.get("items") as Array)[0]).get("structureId")) if list.is_ok() else 0
	var local := await Services.api.post_json("/v2/structures/%d/ops" % own,
		{"mode": "atomic", "ops": [{"op": "setBlueprint", "x": 999, "y": 999, "z": 0}]})
	print("LIVE  POST /v2/structures/%d/ops (free local cell): %s" % [own, _code(local)])
	var foreign := await Services.api.post_json("/v2/structures/1/ops",
		{"mode": "atomic", "ops": [{"op": "setBlueprint", "x": 0, "y": 0, "z": 0}]})
	print("LIVE  POST /v2/structures/1/ops (foreign): %s" % _code(foreign))
	var fleets := await Services.api.get_json("/v2/fleets")
	print("LIVE  GET /v2/fleets: %s" % _code(fleets))


func _samples() -> void:
	var account := Services.session.account
	var real_flags := account.enterprise_flags
	var real_enterprise := account.enterprise_id
	account.enterprise_id = "sample"
	var now := Services.clock.now_ms()

	var fleet := FleetModel.new()
	add_child(fleet)
	var colony := ColonyScreen.new()
	colony.fleet = fleet
	add_child(colony)
	await _until(func() -> bool: return colony._model.structure_id != 0 and colony._model.inventory != null, 30000)
	await get_tree().create_timer(4.0).timeout
	var model := colony._model
	var home_id := model.structure_id
	# The own base posing as a daughter of the enterprise.
	model.owner_kind = "enterprise"
	model.flagship_known = true
	model.flagship_id = 0
	account.enterprise_flags = PackedStringArray()
	colony._select_structure(true)
	colony._open_structure(ColonyScreen.Mode.BUILD)
	await _capture("enterprise_build_no_right_SAMPLE")
	account.enterprise_flags = PackedStringArray(["MANAGE_TREASURY"])
	colony._fill_palette()
	await _capture("enterprise_build_no_flagship_SAMPLE")
	# A standing flagship elsewhere; the enterprise inventory holds enterprise items.
	model.flagship_id = 990001
	model.enterprise_inventory = Inventory.from_wire({"structureId": 990001, "capacity": 1000000000000000, "items": [
		{"item": "HULL_ENTERPRISE_HULL_STANDARD", "value": 24000000, "ratePerHour": 0, "at": now},
		{"item": "HULL_ENTERPRISE_DOCK", "value": 6000000, "ratePerHour": 0, "at": now},
		{"item": "HULL_ENTERPRISE_PLATFORM", "value": 8000000, "ratePerHour": 0, "at": now},
		{"item": "ENTERPRISE_GENERATOR_MODULE", "value": 2000000, "ratePerHour": 0, "at": now},
		{"item": "ENTERPRISE_HABITAT_T3_MODULE", "value": 4000000, "ratePerHour": 0, "at": now},
		{"item": "LIFE_SUPPORT_MODULE", "value": 3000000, "ratePerHour": 0, "at": now},
		{"item": "PUMP_MODULE", "value": 5000000, "ratePerHour": 0, "at": now},
	]}, 1000000)
	colony._fill_palette()
	await _capture("enterprise_build_palette_SAMPLE")
	colony._set_mode(ColonyScreen.Mode.STORE)
	colony._store.show_inventory(model.inventory)
	await _capture("enterprise_store_daughter_SAMPLE")
	account.enterprise_flags = PackedStringArray()
	var keys := model.inventory.item_keys()
	if not keys.is_empty():
		colony._store._select(keys[0])
	await _capture("enterprise_store_no_right_SAMPLE")
	account.enterprise_flags = PackedStringArray(["MANAGE_TREASURY", "COMMAND_ENTERPRISE_FLEET"])
	model.flagship_id = home_id
	colony._store.show_inventory(model.inventory)
	await _capture("enterprise_store_flagship_SAMPLE")
	colony.queue_free()

	# Fleet: the flagship in orbit, a daughter docked on it, an enterprise fleet.
	await _until(func() -> bool: return fleet.loaded, 15000)
	var body := fleet.fleet.body_of(home_id)
	var flagship := EnterpriseFlagship.StructureRef.new()
	flagship.structure_id = 990001
	flagship.name = "Sample Flagship"
	flagship.flagship = true
	var daughter := EnterpriseFlagship.StructureRef.new()
	daughter.structure_id = 990002
	daughter.name = "Sample Daughter"
	var scout := EnterpriseFlagship.StructureRef.new()
	scout.structure_id = 990003
	scout.name = "Sample Scout"
	var refs: Array[EnterpriseFlagship.StructureRef] = [flagship, daughter, scout]
	fleet.fleet.apply_enterprise(refs, "sample")
	for id: int in [990001, 990002, 990003]:
		var anchor := {"type": "free", "kind": "orbit", "bodyId": body}
		if id == 990002:
			anchor = {"type": "docked", "hostId": 990001, "offset": {"x": 8, "y": 0, "z": 1}}
		fleet.fleet.apply_details({"structureId": id, "kind": "ship", "ownerKind": "enterprise", "enterpriseId": "sample",
			"capabilities": ["SPACE_DRIVE"], "anchor": anchor, "aggregates": {"totalHulls": 20}})
	fleet.groups.put(FleetGroups.Group.from_wire({"fleetId": 990100, "name": "Sample Enterprise Fleet",
		"ownerId": "enterprise-account", "members": [
			{"structureId": 990001, "name": "Sample Flagship", "moving": false, "mass": 4000000000},
			{"structureId": 990003, "name": "Sample Scout", "moving": false, "mass": 300000000}],
		"location": {"bodyId": body}}))
	fleet.fleet.set_fleet_members(990100, {990001: true, 990003: true})
	var panel := FleetPanel.new()
	panel.setup(fleet, 0)
	add_child(panel)
	fleet.changed.emit()
	await _capture("enterprise_fleet_SAMPLE")
	panel.queue_free()
	fleet.groups.remove(990100)
	fleet.fleet.set_fleet_members(990100, {})
	var create := FleetGroupCreate.new()
	create.setup(fleet)
	add_child(create)
	create.toggle(990001)
	await _capture("enterprise_fleet_create_SAMPLE")
	create.queue_free()

	# A trip of the flagship: the fuel comes from the enterprise inventory.
	var quote := TravelQuotePanel.new()
	quote.setup(990001, true)
	quote.position = Vector2(24, 200)
	quote.size = Vector2(672, 600)
	var backdrop := ColorRect.new()
	backdrop.color = AppTheme.COLOR_BACKGROUND
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(backdrop)
	add_child(quote)
	quote._request = {"mode": "flight", "target": {"type": "surface", "bodyId": body}}
	quote._quote = TravelPlan.Quote.from_wire({"ok": true, "errors": [], "mass": 4000000000, "maxMass": 4800000000,
		"warpLevel": 3, "interstellar": false, "distanceNly": 0, "speedCellsPerMinute": 0, "departAt": now,
		"liftoffAt": now + 600000, "cruiseEndAt": now + 600000, "arrivalAt": now + 1500000,
		"fuel": [{"resource": "FUSION_FUEL", "amount": 12000000, "selfUse": 830000000, "inTransport": 0}],
		"atmosphereFactor": {"departure": 1000000, "arrival": 1425000}})
	quote._show()
	await _capture("enterprise_travel_quote_SAMPLE")
	print("SAMPLE  enterprise build gating, palette, stores, fleet, fleet creation, quote (not from the server)")
	account.enterprise_flags = real_flags
	account.enterprise_id = real_enterprise


func _code(result: ApiResult) -> String:
	return "ok" if result.is_ok() else "%s (%d)" % [result.error.code, result.error.http_status]


func _until(condition: Callable, timeout_ms: int = 8000) -> void:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline and not condition.call():
		await get_tree().process_frame


func _capture(file_name: String) -> void:
	await get_tree().create_timer(1.2).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	get_viewport().get_texture().get_image().save_png(path)
	print("SAVED  %s" % path)
