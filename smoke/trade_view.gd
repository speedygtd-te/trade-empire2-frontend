extends Control
## Pictures of the trade screens (draft.44) for review, with the developer account
## (.local/dev-account.json; `--account=<name>` takes .local/<name>-account.json): the Fleet's Trade tab as the
## server answers it (without a Trade Reader: the hint), then `_SAMPLE` states filled in the client
## only — platforms in range, own offers and goods waiting, the ship docked at a foreign platform
## (offers, Take armed, a new offer with its preview, the item picker). Without an own ship a
## sample ship stands in. Sends nothing.
##
##   godot --path . --resolution 720x1280 res://smoke/trade_view.tscn -- --out=build/trade

const ACCOUNT := "res://.local/dev-account.json"
const HOST_ID := 990001

var _out_dir := "user://trade"


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = AppTheme.build()
	_run()


func _run() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--out="):
			_out_dir = argument.trim_prefix("--out=")
	var account_path := ACCOUNT
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--account="):
			account_path = "res://.local/%s-account.json" % argument.trim_prefix("--account=")
	DirAccess.make_dir_recursive_absolute(_out_dir)
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(account_path)))
	if account.is_empty():
		print("SKIP  no %s" % account_path)
		get_tree().quit(2)
		return
	var error := await Services.session.login(Wire.as_string(account.get("email")), Wire.as_string(account.get("password")))
	if error != null:
		print("SKIP  sign-in failed: %s" % (error.message if error.is_transport() else error.code))
		get_tree().quit(1)
		return
	await _until(func() -> bool: return Services.definitions != null, 10000)
	var shell := MainShell.new()
	add_child(shell)
	await _until(func() -> bool: return shell.colony()._model.inventory != null, 20000)
	await get_tree().create_timer(2.0).timeout
	var fleet := shell.colony()._fleet
	await _until(func() -> bool: return fleet.loaded, 20000)
	shell.show_tab(MainShell.Tab.FLEET)
	var stack := shell.stack(MainShell.Tab.FLEET)
	var panel := stack.root() as FleetPanel
	panel.show_trade()
	await _until(func() -> bool: return fleet.trade.loaded or fleet.trade.error != null, 15000)
	print("VIEW  live: loaded %s, reader missing %s, error %s, hosts %d, my offers %d" % [fleet.trade.loaded,
		fleet.trade.reader_missing, fleet.trade.error.code if fleet.trade.error != null else "-",
		fleet.trade.book.hosts.size(), fleet.trade.book.my_offers.size()])
	await _capture("trade_tab_live")

	# --- samples, client only ---
	var me := Services.session.account.player_id
	var ships := fleet.fleet.ships()
	if ships.is_empty():
		var sample := Fleet.Entry.new()
		sample.structure_id = HOST_ID + 50
		sample.name = "Kestrel"
		sample.kind = "ship"
		sample.capabilities = PackedStringArray([Fleet.SPACE_DRIVE])
		sample.total_hulls = 12
		fleet.fleet._entries[sample.structure_id] = sample
		ships = fleet.fleet.ships()
	var ship := ships[0]
	# Keep the model from overwriting the samples with the server's answers.
	fleet.trade.frozen = true
	fleet.trade.reader_missing = false
	fleet.trade.error = null
	fleet.trade.loaded = true
	fleet.trade.body_names["SAMPLE-B"] = "Kepler Prime b"
	fleet.trade.book.apply_hosts({"hosts": [
		_host(HOST_ID, "Meridian Exchange", "Ola Brandt", "orbit", 3, [{"structureId": ship.structure_id,
			"name": ship.name, "ownerId": me, "ownerName": "You"}, {"structureId": 5, "name": "Tern", "ownerId": "p-x",
			"ownerName": "Kasimir"}]),
		_host(HOST_ID + 1, "Dustline Bazaar", "Mira Holt", "surface", 1, []),
	]})
	fleet.trade.book.apply_offers({"offers": [
		_offer(1, HOST_ID, "p-x", "Kasimir", "FUSION_DRIVE_MODULE", 20, "TITANIUM_PLATE", 400000),
		_offer(2, HOST_ID, "p-y", "Ola Brandt", "ADVANCED_ELECTRONICS", 500, "HYDROGEN", 12000),
		_offer(3, HOST_ID, me, "You", "IRON", 2000, "WATER", 1500),
	]})
	fleet.trade.book.apply_mine({"offers": [_offer(3, HOST_ID, me, "You", "IRON", 2000, "WATER", 1500),
		_offer(4, HOST_ID + 1, me, "You", "IRON_PLATE", 300, "SENSOR_ARRAY", 25)],
		"balances": [{"hostId": HOST_ID + 1, "ownerId": me, "items": [{"resource": "COPPER", "amount": 950},
			{"resource": "HYDROGEN", "amount": 120}]}]})
	ship.set_anchor({"type": "docked", "hostId": HOST_ID, "offset": {"x": 0, "y": 0, "z": 1}})
	fleet.trade.changed.emit()
	fleet.changed.emit()
	await _capture("trade_tab_SAMPLE")

	var screen := panel.open_platform(HOST_ID, ship.structure_id)
	await get_tree().create_timer(1.5).timeout
	var scale := Services.definitions.fixed_point_scale
	screen._cargo = Inventory.from_wire({"structureId": ship.structure_id, "capacity": 0,
		"transport": {"capacity": 900000 * scale, "used": 452000 * scale, "items": [
			{"resource": "TITANIUM_PLATE", "amount": 450000 * scale}, {"resource": "WATER", "amount": 2000 * scale}]}}, scale)
	screen._update()
	await _capture("trade_platform_SAMPLE")
	screen._on_take(1)
	await _capture("trade_platform_take_armed_SAMPLE")
	screen._armed = 0
	screen._open_form()
	screen._offer_item = "TITANIUM_PLATE"
	screen._offer_amount.text = "50000"
	screen._demand_item = "FUSION_DRIVE_MODULE"
	screen._demand_amount.text = "3"
	screen._update_preview()
	await _capture("trade_offer_too_small_SAMPLE")
	screen._demand_amount.text = "20"
	screen._update_preview()
	await _capture("trade_offer_preview_SAMPLE")
	screen._open_picker("demand")
	await _capture("trade_offer_picker_SAMPLE")
	screen._close_picker()
	screen._close_form()
	stack.pop_to_root()
	panel.open_platform(HOST_ID + 1, 0)
	await get_tree().create_timer(1.0).timeout
	await _capture("trade_platform_look_SAMPLE")
	stack.pop_to_root()
	panel._show_tab(FleetPanel.TAB_STRUCTURES)
	panel.open_detail(ship.structure_id)
	await get_tree().create_timer(1.0).timeout
	await _capture("trade_ship_detail_SAMPLE")
	get_tree().quit()


func _host(id: int, host_name: String, owner: String, location: String, offers: int, guests: Array) -> Dictionary:
	return {"structureId": id, "name": host_name, "ownerId": "p-%d" % id, "ownerName": owner, "systemId": "S",
		"position": [0.0, 0.0, 0.0], "bodyId": "SAMPLE-B", "location": location, "x": 10, "y": 4,
		"activeHosts": 2, "capacity": 100000, "used": 43120, "offers": offers, "guests": guests}


func _offer(id: int, host: int, owner: String, owner_name: String, give: String, give_amount: int,
		want: String, want_amount: int) -> Dictionary:
	var now := Services.clock.now_ms()
	return {"offerId": id, "hostId": host, "ownerId": owner, "ownerName": owner_name,
		"offer": {"resource": give, "amount": give_amount}, "demand": {"resource": want, "amount": want_amount},
		"feeOffer": Trade.fee(give_amount), "feeDemand": Trade.fee(want_amount),
		"netOffer": Trade.net(give_amount), "netDemand": Trade.net(want_amount),
		"placedAt": now - 3600000, "expiresAt": now + 9 * 86400000}


func _until(condition: Callable, timeout_ms: int = 8000) -> void:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline and not condition.call():
		await get_tree().process_frame


func _capture(file_name: String) -> void:
	await get_tree().create_timer(0.8).timeout
	await RenderingServer.frame_post_draw
	var path := "%s/%s.png" % [_out_dir, file_name]
	var saved := get_viewport().get_texture().get_image().save_png(path)
	print("%s  %s" % ["SAVED" if saved == OK else "FAIL ", path])
