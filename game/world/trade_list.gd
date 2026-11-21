class_name TradeList
extends VBoxContainer
## The Trade tab of the Fleet (draft.44): own ships docked at a trade platform (a tap opens the
## platform with that ship, TradeDockScreen), the player's open offers (withdraw, two-step), the
## goods waiting on platforms to be collected, and the platforms in sight of the player's
## telescopes (a tap shows the platform and its offers). Without a working Trade Reader the
## platforms stay hidden and a line says how to see them. Loading, empty and error states.

## The player wants to see a platform; `ship_id` is an own ship docked there (0: none).
signal platform_requested(host_id: int, ship_id: int)

var _fleet: FleetModel
var _state: Label
var _retry: Button
var _list: VBoxContainer
## Offer id waiting for the second tap of Withdraw; 0 when none.
var _armed := 0
var _busy := false
## Why the last withdrawal was refused; "" when none.
var _message := ""


func setup(fleet: FleetModel) -> void:
	_fleet = fleet


func _ready() -> void:
	add_theme_constant_override("separation", 16)
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_state)
	_retry = Ui.secondary_button("COMMON_RETRY")
	_retry.visible = false
	_retry.pressed.connect(func() -> void:
		_retry.visible = false
		_fleet.trade.reload())
	add_child(_retry)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(scroll)
	_list = Ui.column(10)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_list)
	_fleet.trade.changed.connect(_rebuild)
	_fleet.changed.connect(_rebuild)
	visibility_changed.connect(func() -> void:
		if is_visible_in_tree():
			_fleet.trade.reload())
	_rebuild()


## Own ships docked directly at a platform in sight: [ship entry, platform].
static func docked_ships(fleet: FleetModel) -> Array[Array]:
	var result: Array[Array] = []
	for entry: Fleet.Entry in fleet.fleet.ships():
		if entry.where() != Fleet.Where.DOCKED:
			continue
		var host := fleet.trade.book.host(entry.host_id)
		if host != null:
			result.append([entry, host])
	return result


## "20 Iron for 30 Water".
static func offer_line(offer: Trade.Offer, translator: Object) -> String:
	return translator.tr("TRADE_OFFER_LINE").format({
		"offer": AmountFormat.units(offer.offer.amount), "offer_item": item_name(offer.offer.resource, translator),
		"demand": AmountFormat.units(offer.demand.amount), "demand_item": item_name(offer.demand.resource, translator)})


static func item_name(key: String, translator: Object) -> String:
	var shown := Services.definitions.resource_name(key) if Services.definitions != null else ""
	return shown if not shown.is_empty() else translator.tr("STORE_UNKNOWN_ITEM")


## "Iron 95 · Water 20".
static func goods_line(items: Array[Trade.Goods], translator: Object) -> String:
	var parts: PackedStringArray = []
	for goods: Trade.Goods in items:
		parts.append("%s %s" % [item_name(goods.resource, translator), AmountFormat.units(goods.amount)])
	return " · ".join(parts)


func _rebuild() -> void:
	for child: Node in _list.get_children():
		child.queue_free()
	var model := _fleet.trade
	_retry.visible = model.error != null
	if not model.supported():
		_state.visible = true
		_state.text = tr("TRADE_NOT_SUPPORTED")
		return
	if not model.loaded and model.error == null:
		_state.visible = true
		_state.text = tr("TRADE_LOADING")
		return
	_state.visible = model.error != null or not _message.is_empty()
	_state.remove_theme_color_override("font_color")
	if not _message.is_empty():
		_state.text = _message
		_state.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	elif model.error != null:
		_state.text = ErrorText.describe(model.error, self)
	var book := model.book
	var docked := docked_ships(_fleet)
	if not docked.is_empty():
		_heading("TRADE_SECTION_DOCKED")
		for pair: Array in docked:
			var ship: Fleet.Entry = pair[0]
			var host: Trade.Host = pair[1]
			var row := _row("%s\n%s" % [ship.name, tr("TRADE_SHIP_AT").format({"host": host.name})])
			var ship_id := ship.structure_id
			var host_id := host.structure_id
			row.tapped.connect(func() -> void: platform_requested.emit(host_id, ship_id))
	if not book.my_offers.is_empty():
		_heading("TRADE_SECTION_MINE")
		var now := Services.clock.now_ms()
		for offer: Trade.Offer in book.my_offers:
			_list.add_child(_my_offer(offer, now))
	if not book.my_balances.is_empty():
		_heading("TRADE_SECTION_COLLECT")
		for balance: Trade.Balance in book.my_balances:
			var host := book.host(balance.host_id)
			var where := host.name if host != null else tr("TRADE_PLATFORM_OUT_OF_SIGHT")
			var line := Ui.dynamic_label()
			line.text = "%s\n%s" % [where, goods_line(balance.items, self)]
			_list.add_child(line)
		_list.add_child(Ui.label("TRADE_COLLECT_HINT", AppTheme.VARIATION_MUTED))
	_heading("TRADE_SECTION_PLATFORMS")
	if model.reader_missing:
		_list.add_child(Ui.label("TRADE_READER_MISSING", AppTheme.VARIATION_MUTED))
		return
	var hosts := book.host_list()
	if hosts.is_empty():
		_list.add_child(Ui.label("TRADE_NO_PLATFORMS", AppTheme.VARIATION_MUTED))
		return
	for host: Trade.Host in hosts:
		var row := _row("%s\n%s" % [host.name, _host_line(host)])
		var host_id := host.structure_id
		row.tapped.connect(func() -> void: platform_requested.emit(host_id, _ship_at(host_id)))


func _host_line(host: Trade.Host) -> String:
	return tr("TRADE_PLATFORM_LINE").format({"owner": host.owner_name, "place": _fleet.trade.place_text(host, self),
		"offers": host.offers})


func _ship_at(host_id: int) -> int:
	for pair: Array in docked_ships(_fleet):
		var host: Trade.Host = pair[1]
		var ship: Fleet.Entry = pair[0]
		if host.structure_id == host_id:
			return ship.structure_id
	return 0


func _my_offer(offer: Trade.Offer, now: int) -> Control:
	var panel := PanelContainer.new()
	var column := Ui.column(8)
	panel.add_child(column)
	var line := Ui.dynamic_label()
	line.text = offer_line(offer, self)
	column.add_child(line)
	var host := _fleet.trade.book.host(offer.host_id)
	var detail := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	detail.text = tr("TRADE_MINE_LINE").format({
		"host": host.name if host != null else tr("TRADE_PLATFORM_OUT_OF_SIGHT"),
		"net": AmountFormat.units(offer.net_demand), "item": item_name(offer.demand.resource, self),
		"duration": TimeFormat.duration(maxi(offer.expires_at - now, 0))})
	column.add_child(detail)
	var withdraw := Ui.secondary_button("TRADE_WITHDRAW_CONFIRM" if _armed == offer.offer_id else "TRADE_WITHDRAW")
	if _armed == offer.offer_id:
		withdraw.theme_type_variation = AppTheme.VARIATION_DANGER_BUTTON
	withdraw.disabled = _busy
	var offer_id := offer.offer_id
	withdraw.pressed.connect(func() -> void: _on_withdraw(offer_id))
	column.add_child(withdraw)
	return panel


func _on_withdraw(offer_id: int) -> void:
	if _armed != offer_id:
		_armed = offer_id
		_message = ""
		_rebuild()
		return
	_armed = 0
	_busy = true
	_rebuild()
	var result := await _fleet.trade.withdraw(offer_id)
	_busy = false
	_message = "" if result.is_ok() else ErrorText.describe(result.error, self)
	_rebuild()


func _heading(key: String) -> void:
	_list.add_child(Ui.label(key, AppTheme.VARIATION_HEADING))


func _row(text: String) -> ListButton:
	var row := ListButton.new()
	row.alignment = HORIZONTAL_ALIGNMENT_LEFT
	row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.text = text
	_list.add_child(row)
	return row
