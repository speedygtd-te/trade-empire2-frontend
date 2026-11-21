class_name TradeDockScreen
extends Control
## One trade platform (draft.44), a layer of the Fleet tab: who owns it, where it is, how full its
## trade inventory is, the foreign ships docked at it, and its open offers. With an own ship
## docked there (`ship_id`), the ship trades: take an offer (two-step: it shows what the ship
## gives and gets), place a new offer from its cargo hold, and collect what is due. The server
## decides; refusals show as text. "‹ Back" or Back closes it (Back first closes the new offer).

signal closed

var _fleet: FleetModel
var _host_id := 0
var _ship_id := 0

## The ship's store (cargo hold); null while loading.
var _cargo: Inventory = null
## Offer id waiting for the second tap of Take; 0 when none.
var _armed := 0
var _busy := false
## The new offer being written: items and what is picked now ("offer", "demand" or "").
var _offer_item := ""
var _demand_item := ""
var _picking := ""

var _header: LayerHeader
var _info: Label
var _ship_box: VBoxContainer
var _ship_line: Label
var _collect: Button
var _new_offer: Button
var _status: Label
var _offers: VBoxContainer
var _main: ScrollContainer
var _form: VBoxContainer
var _offer_pick: Button
var _offer_amount: LineEdit
var _offer_all: Button
var _demand_pick: Button
var _demand_amount: LineEdit
var _preview: Label
var _place: Button
var _picker: VBoxContainer
var _picker_title: Label
var _picker_list: VBoxContainer


## `ship_id`: an own ship docked at the platform (0: only look).
func setup(fleet: FleetModel, host_id: int, ship_id: int) -> void:
	_fleet = fleet
	_host_id = host_id
	_ship_id = ship_id


func host_id() -> int:
	return _host_id


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(margin)
	var column := Ui.column(16)
	margin.add_child(column)
	_header = LayerHeader.new()
	_header.back_pressed.connect(func() -> void:
		if not handle_back():
			closed.emit())
	column.add_child(_header)

	_main = ScrollContainer.new()
	_main.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_main.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_main)
	var content := Ui.column(16)
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_main.add_child(content)
	_info = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	content.add_child(_info)
	_ship_box = Ui.column(10)
	content.add_child(_ship_box)
	_ship_line = Ui.dynamic_label()
	_ship_box.add_child(_ship_line)
	_collect = Ui.primary_button("TRADE_COLLECT")
	_collect.pressed.connect(_on_collect)
	_ship_box.add_child(_collect)
	_new_offer = Ui.secondary_button("TRADE_NEW_OFFER")
	_new_offer.pressed.connect(_open_form)
	_ship_box.add_child(_new_offer)
	_status = Ui.dynamic_label()
	_status.visible = false
	content.add_child(_status)
	content.add_child(Ui.label("TRADE_SECTION_OFFERS", AppTheme.VARIATION_HEADING))
	_offers = Ui.column(10)
	content.add_child(_offers)

	_form = Ui.column(12)
	_form.visible = false
	_form.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_form)
	_form.add_child(Ui.label("TRADE_FORM_GIVE", AppTheme.VARIATION_HEADING))
	_offer_pick = _pick_button()
	_offer_pick.pressed.connect(_open_picker.bind("offer"))
	_form.add_child(_offer_pick)
	var give := HBoxContainer.new()
	give.add_theme_constant_override("separation", 12)
	_form.add_child(give)
	_offer_amount = _amount_field()
	give.add_child(_offer_amount)
	_offer_all = Ui.secondary_button("TRADE_FORM_ALL")
	_offer_all.pressed.connect(_on_all)
	give.add_child(_offer_all)
	_form.add_child(Ui.label("TRADE_FORM_WANT", AppTheme.VARIATION_HEADING))
	_demand_pick = _pick_button()
	_demand_pick.pressed.connect(_open_picker.bind("demand"))
	_form.add_child(_demand_pick)
	_demand_amount = _amount_field()
	_form.add_child(_demand_amount)
	_preview = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_form.add_child(_preview)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 16)
	_form.add_child(actions)
	var cancel := Ui.secondary_button("COMMON_CANCEL")
	cancel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cancel.pressed.connect(_close_form)
	actions.add_child(cancel)
	_place = Ui.primary_button("TRADE_PLACE")
	_place.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_place.pressed.connect(_on_place)
	actions.add_child(_place)

	_picker = Ui.column(12)
	_picker.visible = false
	_picker.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_picker)
	_picker_title = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	_picker.add_child(_picker_title)
	var picker_scroll := ScrollContainer.new()
	picker_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	picker_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_picker.add_child(picker_scroll)
	_picker_list = Ui.column(4)
	_picker_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	picker_scroll.add_child(_picker_list)

	_fleet.trade.changed.connect(_update)
	_update()
	if not _fleet.trade.loaded:
		_fleet.trade.reload()
	_load_cargo()


## Back closes the picker, then the new offer; false when nothing is open (the stack closes it).
func handle_back() -> bool:
	if _picker.visible:
		_close_picker()
		return true
	if _form.visible:
		_close_form()
		return true
	return false


func _ship() -> Fleet.Entry:
	return _fleet.fleet.find(_ship_id) if _ship_id != 0 else null


## Whether the ship is (still) docked directly at this platform.
func _docked() -> bool:
	var ship := _ship()
	return ship != null and ship.where() == Fleet.Where.DOCKED and ship.host_id == _host_id


func _update() -> void:
	var book := _fleet.trade.book
	var host := book.host(_host_id)
	if host == null:
		_header.set_title(tr("TRADE_PLATFORM"))
		_header.set_subtitle("")
		_info.text = tr("TRADE_READER_MISSING") if _fleet.trade.reader_missing else tr("TRADE_PLATFORM_OUT_OF_SIGHT")
	else:
		_header.set_title(host.name)
		_header.set_subtitle("%s · %s" % [host.owner_name, _fleet.trade.place_text(host, self)])
		var lines: PackedStringArray = [tr("TRADE_PLATFORM_FILL").format({
			"used": AmountFormat.units(host.used), "capacity": AmountFormat.units(host.capacity),
			"hosts": host.active_hosts})]
		if not host.guests.is_empty():
			var names: PackedStringArray = []
			for guest: Trade.Guest in host.guests:
				names.append("%s (%s)" % [guest.name, guest.owner_name])
			lines.append(tr("TRADE_PLATFORM_GUESTS").format({"ships": ", ".join(names)}))
		_info.text = "\n".join(lines)
	_update_ship()
	_rebuild_offers()
	_update_preview()


func _update_ship() -> void:
	var ship := _ship()
	var docked := _docked()
	var due := _fleet.trade.book.balance_at(_host_id)
	if ship == null or not docked:
		_ship_line.text = tr("TRADE_DOCK_TO_TRADE")
		_collect.visible = false
		_new_offer.visible = false
		if not due.is_empty():
			_ship_line.text += "\n" + tr("TRADE_DUE_HERE").format({"goods": TradeList.goods_line(due, self)})
		return
	var hold := tr("COMMON_LOADING")
	if _cargo != null:
		@warning_ignore("integer_division")
		hold = tr("STORE_CARGO_FILL").format({"used": AmountFormat.units(_cargo.transport_used / _cargo.scale),
			"capacity": AmountFormat.units(_cargo.transport_capacity / _cargo.scale)})
	_ship_line.text = tr("TRADE_SHIP_HERE").format({"ship": ship.name, "hold": hold})
	_collect.visible = not due.is_empty()
	_collect.text = tr("TRADE_COLLECT_GOODS").format({"goods": TradeList.goods_line(due, self)})
	_collect.disabled = _busy
	_new_offer.visible = true
	_new_offer.disabled = _busy


func _rebuild_offers() -> void:
	for child: Node in _offers.get_children():
		child.queue_free()
	var list := _fleet.trade.book.offers_at(_host_id)
	if list.is_empty():
		_offers.add_child(Ui.label("TRADE_NO_OFFERS", AppTheme.VARIATION_MUTED))
		return
	var now := Services.clock.now_ms()
	var me := Services.session.account.player_id if Services.session.account != null else ""
	for offer: Trade.Offer in list:
		var panel := PanelContainer.new()
		var column := Ui.column(8)
		panel.add_child(column)
		var line := Ui.dynamic_label()
		line.text = TradeList.offer_line(offer, self)
		var head := HBoxContainer.new()
		head.add_theme_constant_override("separation", 12)
		head.add_child(Ui.resource_icon(offer.offer.resource))
		line.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		head.add_child(line)
		column.add_child(head)
		var detail := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
		detail.text = tr("TRADE_OFFER_DETAIL").format({"owner": offer.owner_name,
			"net": AmountFormat.units(offer.net_offer), "item": TradeList.item_name(offer.offer.resource, self),
			"fee": AmountFormat.units(offer.fee_offer), "duration": TimeFormat.duration(maxi(offer.expires_at - now, 0))})
		column.add_child(detail)
		if offer.is_mine(me):
			column.add_child(Ui.label("TRADE_YOUR_OFFER", AppTheme.VARIATION_MUTED))
		elif _docked():
			var reason := Trade.check_accept(offer, me, _cargo.cargo_units(offer.demand.resource)) if _cargo != null else ""
			if _armed == offer.offer_id:
				var deal := Ui.dynamic_label()
				deal.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
				deal.text = tr("TRADE_TAKE_DEAL").format({
					"give": AmountFormat.units(offer.demand.amount), "give_item": TradeList.item_name(offer.demand.resource, self),
					"get": AmountFormat.units(offer.net_offer), "get_item": TradeList.item_name(offer.offer.resource, self)})
				column.add_child(deal)
			var take := Ui.primary_button("TRADE_TAKE_CONFIRM" if _armed == offer.offer_id else "TRADE_TAKE")
			take.disabled = _busy or _cargo == null or not reason.is_empty()
			var offer_id := offer.offer_id
			take.pressed.connect(func() -> void: _on_take(offer_id))
			column.add_child(take)
			if not reason.is_empty() and _cargo != null:
				var why := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
				why.text = tr("ERROR_" + reason)
				column.add_child(why)
		_offers.add_child(panel)


func _on_take(offer_id: int) -> void:
	if _armed != offer_id:
		_armed = offer_id
		_rebuild_offers()
		return
	_armed = 0
	_busy = true
	_update()
	var result := await _fleet.trade.accept(_ship_id, offer_id)
	_busy = false
	if result.is_ok():
		_show_status(tr("TRADE_TAKEN"), AppTheme.COLOR_OK)
	else:
		_show_status(ErrorText.describe(result.error, self), AppTheme.COLOR_DANGER)
	_load_cargo()
	_update()


func _on_collect() -> void:
	_busy = true
	_update()
	var result := await _fleet.trade.collect(_ship_id)
	_busy = false
	if result.is_ok():
		var collected := Trade.Goods.list(result.data.get("collected"))
		var remaining := Trade.Goods.list(result.data.get("remaining"))
		var text := tr("TRADE_COLLECTED").format({"goods": TradeList.goods_line(collected, self)}) if not collected.is_empty() \
			else tr("TRADE_COLLECTED_NOTHING")
		if not remaining.is_empty():
			text += "\n" + tr("TRADE_COLLECT_REST").format({"goods": TradeList.goods_line(remaining, self)})
		_show_status(text, AppTheme.COLOR_OK if remaining.is_empty() else AppTheme.COLOR_PENDING)
	else:
		_show_status(ErrorText.describe(result.error, self), AppTheme.COLOR_DANGER)
	_load_cargo()
	_update()


func _load_cargo() -> void:
	if _ship_id == 0:
		return
	var answer := await Services.api.get_json("/v2/structures/%d/inventory" % _ship_id)
	if not is_inside_tree():
		return
	if answer.is_ok():
		var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
		_cargo = Inventory.from_wire(answer.data, scale)
	_update()


func _show_status(text: String, color: Color) -> void:
	_status.text = text
	_status.add_theme_color_override("font_color", color)
	_status.visible = true


# --- new offer --------------------------------------------------------------------------------

func _pick_button() -> Button:
	var button := Ui.secondary_button("")
	button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	return button


func _amount_field() -> LineEdit:
	var field := Ui.line_edit("TRADE_FORM_AMOUNT")
	field.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_NUMBER
	field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	field.text_changed.connect(func(_text: String) -> void: _update_preview())
	return field


func _open_form() -> void:
	_main.visible = false
	_form.visible = true
	_status.visible = false
	_update_preview()


func _close_form() -> void:
	_form.visible = false
	_main.visible = true


func _open_picker(what: String) -> void:
	_picking = what
	_form.visible = false
	_picker.visible = true
	for child: Node in _picker_list.get_children():
		child.queue_free()
	var definitions := Services.definitions
	var keys := PackedStringArray()
	if what == "offer":
		_picker_title.text = tr("TRADE_PICK_GIVE")
		if _cargo != null:
			for key: String in _cargo.cargo_keys():
				if definitions == null or definitions.is_tradable(key):
					keys.append(key)
		if keys.is_empty():
			_picker_list.add_child(Ui.label("TRADE_PICK_GIVE_NONE", AppTheme.VARIATION_MUTED))
	else:
		_picker_title.text = tr("TRADE_PICK_WANT")
		if definitions != null:
			keys = definitions.tradable_items()
	for key: String in keys:
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		Ui.add_resource_icon(row, key, true)
		var item := TradeList.item_name(key, self)
		row.text = tr("ROUTE_PICK_GOODS_ROW").format({"item": item, "count": AmountFormat.units(_cargo.cargo_units(key))}) \
			if what == "offer" and _cargo != null else item
		row.set_chosen(key == (_offer_item if what == "offer" else _demand_item))
		row.tapped.connect(_on_picked.bind(key))
		_picker_list.add_child(row)


func _on_picked(key: String) -> void:
	if _picking == "offer":
		_offer_item = key
	else:
		_demand_item = key
	_close_picker()


func _close_picker() -> void:
	_picking = ""
	_picker.visible = false
	_form.visible = true
	_update_preview()


func _on_all() -> void:
	if _cargo != null and not _offer_item.is_empty():
		_offer_amount.text = str(_cargo.cargo_units(_offer_item))
		_update_preview()


static func _amount(field: LineEdit) -> int:
	var text := field.text.strip_edges().replace(" ", "").replace(",", "").replace(".", "")
	return text.to_int() if text.is_valid_int() else 0


func _update_preview() -> void:
	if _form == null:
		return
	_offer_pick.text = TradeList.item_name(_offer_item, self) if not _offer_item.is_empty() else tr("TRADE_PICK_GIVE")
	_demand_pick.text = TradeList.item_name(_demand_item, self) if not _demand_item.is_empty() else tr("TRADE_PICK_WANT")
	if not _offer_item.is_empty():
		Ui.add_resource_icon(_offer_pick, _offer_item, true)
	if not _demand_item.is_empty():
		Ui.add_resource_icon(_demand_pick, _demand_item, true)
	var give := _amount(_offer_amount)
	var want := _amount(_demand_amount)
	var held := _cargo.cargo_units(_offer_item) if _cargo != null and not _offer_item.is_empty() else 0
	var problem := Trade.check_offer(Services.definitions, _offer_item, give, _demand_item, want, held)
	if _offer_item.is_empty() or _demand_item.is_empty():
		_preview.text = tr("TRADE_FORM_HINT").format({"least": _least()})
		_preview.remove_theme_color_override("font_color")
	elif not problem.is_empty():
		_preview.text = tr("TRADE_FORM_" + problem).format({"least": _least(), "held": AmountFormat.units(held)})
		_preview.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	else:
		_preview.text = tr("TRADE_FORM_PREVIEW").format({
			"taker": AmountFormat.units(Trade.net(give)), "give_item": TradeList.item_name(_offer_item, self),
			"you": AmountFormat.units(Trade.net(want)), "want_item": TradeList.item_name(_demand_item, self),
			"fee_give": AmountFormat.units(Trade.fee(give)), "fee_want": AmountFormat.units(Trade.fee(want))})
		_preview.add_theme_color_override("font_color", AppTheme.COLOR_OK)
	_place.disabled = _busy or not problem.is_empty()


func _least() -> int:
	return Services.definitions.trade_min_amount if Services.definitions != null else 20


func _on_place() -> void:
	var give := _amount(_offer_amount)
	var want := _amount(_demand_amount)
	_busy = true
	_update_preview()
	var result := await _fleet.trade.place(_ship_id, _offer_item, give, _demand_item, want)
	_busy = false
	if result.is_ok():
		_offer_item = ""
		_demand_item = ""
		_offer_amount.text = ""
		_demand_amount.text = ""
		_close_form()
		_show_status(tr("TRADE_PLACED"), AppTheme.COLOR_OK)
		_load_cargo()
	else:
		_preview.text = ErrorText.describe(result.error, self)
		_preview.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	_update_preview()
