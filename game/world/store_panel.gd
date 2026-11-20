class_name StorePanel
extends VBoxContainer
## The store of the colony: every item with its amount now and its rate per hour, plus how
## full the store is. Amounts are extrapolated from the flows every second. A chosen item can be
## moved to a docked guest or to the host (transfer), or discarded (two-step).
##
## At a structure of the enterprise (draft.38) a note says whose store it is: the flagship's is
## the enterprise inventory every enterprise structure builds and flies from; a daughter's is its
## own, topped up by the server from the enterprise inventory. Discarding, moving and transfers
## there need MANAGE_TREASURY; without it a line says so instead of the buttons.

## Most of the screen stays free for the colony; the list scrolls.
const LIST_HEIGHT := 460

## Amounts offered for discarding and moving, in whole units; 0 stands for everything.
const DISCARD_AMOUNTS: Array[int] = [1, 10, 0]
const TRANSFER_AMOUNTS: Array[int] = [1, 10, 0]
const MOVE_AMOUNTS: Array[int] = [1, 10, 0]
## The two areas of a store: the own supply and the cargo hold (storage modules set to cargo).
const AREA_SUPPLY := "selfUse"
const AREA_CARGO := "transport"

var _model: ColonyModel
## Whose store this is, at an enterprise structure (muted, above the fill).
var _note: Label
var _summary: Label
var _balance: Label
var _scroll: ScrollContainer
var _list: VBoxContainer
var _inventory: Inventory
## Item → [amount label, rate label].
var _rows: Dictionary = {}
## The item chosen for discarding; "" when none.
var _selected := ""
## The amount waiting for its second tap (DISCARD_AMOUNTS entry); -1 when none.
var _armed := -1
var _busy := false
var _discard_bar: HBoxContainer
var _discard_buttons: Array[Button] = []
var _discard_status: Label
var _transfer_bar: VBoxContainer
## Where items go, and (with several guests) a button that picks the next one.
var _target_label: Label
var _target_button: Button
var _transfer_buttons: Array[Button] = []
var _target_index := 0
## A result line (moved, refused) stays until another item is chosen.
var _keep_status := false
## The area of the chosen item: the own supply ("selfUse") or the cargo hold ("transport").
var _area := AREA_SUPPLY
## Moving the chosen item between the own supply and the cargo hold.
var _move_bar: VBoxContainer
var _move_label: Label
var _move_buttons: Array[Button] = []


func setup(model: ColonyModel) -> void:
	_model = model
	_target_index = 0


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	_note = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_note.visible = false
	add_child(_note)
	_summary = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_summary)
	_balance = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_balance)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.custom_minimum_size = Vector2(0, LIST_HEIGHT)
	add_child(_scroll)
	_list = Ui.column(4)
	_scroll.add_child(_list)
	_discard_status = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_discard_status)
	_discard_bar = HBoxContainer.new()
	_discard_bar.add_theme_constant_override("separation", 12)
	_discard_bar.visible = false
	add_child(_discard_bar)
	for amount: int in DISCARD_AMOUNTS:
		var button := Ui.secondary_button("")
		button.theme_type_variation = AppTheme.VARIATION_DANGER_BUTTON
		button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		button.pressed.connect(_on_discard.bind(amount))
		_discard_bar.add_child(button)
		_discard_buttons.append(button)
	_transfer_bar = Ui.column(8)
	_transfer_bar.visible = false
	add_child(_transfer_bar)
	move_child(_transfer_bar, _discard_bar.get_index())
	_target_label = Ui.dynamic_label()
	_target_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_target_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_transfer_bar.add_child(_target_label)
	var amounts := HBoxContainer.new()
	amounts.add_theme_constant_override("separation", 12)
	_transfer_bar.add_child(amounts)
	for amount: int in TRANSFER_AMOUNTS:
		var button := Ui.secondary_button("")
		button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(_on_transfer.bind(amount))
		amounts.add_child(button)
		_transfer_buttons.append(button)
	_target_button = Ui.secondary_button("STORE_TRANSFER_NEXT")
	_target_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_target_button.pressed.connect(_on_next_target)
	amounts.add_child(_target_button)
	_move_bar = Ui.column(8)
	_move_bar.visible = false
	add_child(_move_bar)
	move_child(_move_bar, _discard_bar.get_index())
	_move_label = Ui.dynamic_label()
	_move_bar.add_child(_move_label)
	var moves := HBoxContainer.new()
	moves.add_theme_constant_override("separation", 12)
	_move_bar.add_child(moves)
	for amount: int in MOVE_AMOUNTS:
		var button := Ui.secondary_button("")
		button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(_on_move.bind(amount))
		moves.add_child(button)
		_move_buttons.append(button)
	# Routes unload and load without a rate change of the transporter's cargo: follow them.
	Services.events.event_received.connect(_on_event)


## Shows the energy and life support balance and warnings of the colony.
func show_balance(model: ColonyModel) -> void:
	_balance.text = balance_text(model)
	if is_short(model):
		_balance.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	else:
		_balance.remove_theme_color_override("font_color")


## Energy and life support (made / used per hour) and the colony's warnings, one per line.
static func balance_text(model: ColonyModel) -> String:
	var scale := model.inventory.scale if model.inventory != null else 1000000
	var lines := PackedStringArray([
		TranslationServer.translate("STORE_POWER").format({
			"production": AmountFormat.units(model.power[0] / scale),
			"consumption": AmountFormat.units(model.power[1] / scale)}),
		TranslationServer.translate("STORE_LIFE_SUPPORT").format({
			"production": AmountFormat.units(model.life_support[0] / scale),
			"consumption": AmountFormat.units(model.life_support[1] / scale)}),
	])
	if model.food_shortage:
		lines.append(TranslationServer.translate("STORE_FOOD_SHORTAGE"))
	if model.storage_full:
		lines.append(TranslationServer.translate("STORE_FULL"))
	if not model.taxed.is_empty():
		lines.append(TranslationServer.translate("STORE_TAXED").format({"items": taxed_text(model.taxed, scale)}))
	return "\n".join(lines)


## "Iron 2/h, Water 0.5/h": what goes to the enterprise as tax.
static func taxed_text(taxed: Array[Array], scale: int) -> String:
	var parts := PackedStringArray()
	for entry: Array in taxed:
		var key: String = entry[0]
		var rate: int = entry[1]
		var shown := Services.definitions.resource_name(key) if Services.definitions != null else ""
		if shown.is_empty():
			shown = TranslationServer.translate("STORE_UNKNOWN_ITEM")
		parts.append("%s %s" % [shown, AmountFormat.rate(rate, scale).trim_prefix("+")])
	return ", ".join(parts)


## Whether something runs short: more used than made, no food, or the store is full.
static func is_short(model: ColonyModel) -> bool:
	return model.power[1] > model.power[0] or model.life_support[1] > model.life_support[0] \
		or model.food_shortage or model.storage_full


## Shows a (new) inventory; rows are rebuilt.
func show_inventory(inventory: Inventory) -> void:
	_inventory = inventory
	var note := EnterpriseStructures.store_note(_model.owner_kind, _model.is_flagship()) if _model != null else ""
	_note.text = tr(note) if not note.is_empty() else ""
	_note.visible = not note.is_empty()
	for child: Node in _list.get_children():
		child.queue_free()
	_rows.clear()
	if inventory == null:
		_summary.text = tr("COMMON_LOADING")
		return
	_summary.text = ""
	if inventory.item_keys().is_empty():
		var empty := Ui.label("STORE_EMPTY", AppTheme.VARIATION_MUTED)
		_list.add_child(empty)
	var definitions := Services.definitions
	var entries: Array[Array] = []
	for key: String in inventory.item_keys():
		var shown := definitions.resource_name(key) if definitions != null else ""
		entries.append([shown if not shown.is_empty() else tr("STORE_UNKNOWN_ITEM"), key])
	entries.sort_custom(_by_name)
	for entry: Array in entries:
		# The whole row is a button: tapping it chooses the item for discarding.
		var key: String = entry[1]
		# A swipe that starts on a row scrolls the list (ListButton).
		var row_button := ListButton.new()
		row_button.flat = true
		row_button.set_chosen(key == _selected)
		row_button.tapped.connect(_select.bind(key))
		row_button.set_meta("item", key)
		var row := HBoxContainer.new()
		row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row_button.add_child(row)
		row.add_theme_constant_override("separation", 16)
		row.add_child(Ui.resource_icon(key, ResourceIcon.ROW_SIZE, true))
		var name_label := Ui.dynamic_label()
		name_label.text = entry[0]
		name_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		row.add_child(name_label)
		var rate_label := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
		rate_label.size_flags_horizontal = Control.SIZE_SHRINK_END
		rate_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		row.add_child(rate_label)
		var amount_label := Ui.dynamic_label()
		amount_label.size_flags_horizontal = Control.SIZE_SHRINK_END
		amount_label.custom_minimum_size = Vector2(150, 0)
		amount_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		amount_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		row.add_child(amount_label)
		for label: Label in [name_label, rate_label, amount_label]:
			label.mouse_filter = Control.MOUSE_FILTER_IGNORE
			label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		_list.add_child(row_button)
		_rows[key] = [amount_label, rate_label]
	_add_cargo(inventory)
	var still := _rows.has(_selected) if _area == AREA_SUPPLY else inventory.cargo_amount(_selected) > 0
	if not still:
		_selected = ""
		_area = AREA_SUPPLY
	_update_discard_bar()
	tick()


## The cargo hold below the store: how full it is, what it holds (rows choose an item to move
## back), and every storage module with its mode and a button to switch it.
func _add_cargo(inventory: Inventory) -> void:
	var modules: Array[StructureLayout.Module] = []
	if _model != null:
		modules = _model.storage_modules()
	if not inventory.has_cargo_area() and modules.is_empty():
		return
	_list.add_child(Ui.spacer(8))
	_list.add_child(Ui.label("STORE_CARGO_TITLE", AppTheme.VARIATION_HEADING))
	var fill := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	if inventory.transport_capacity > 0:
		@warning_ignore("integer_division")
		fill.text = tr("STORE_CARGO_FILL").format({
			"used": AmountFormat.units(inventory.transport_used / inventory.scale),
			"capacity": AmountFormat.units(inventory.transport_capacity / inventory.scale)})
	else:
		fill.text = tr("STORE_CARGO_NONE")
	_list.add_child(fill)
	var keys := inventory.cargo_keys()
	if keys.is_empty() and inventory.transport_capacity > 0:
		_list.add_child(Ui.label("STORE_CARGO_EMPTY", AppTheme.VARIATION_MUTED))
	for key: String in keys:
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		Ui.add_resource_icon(row, key, true)
		row.text = tr("STORE_CARGO_ROW").format({"name": _item_name(key),
			"count": AmountFormat.units(inventory.cargo_units(key))})
		row.set_chosen(_area == AREA_CARGO and key == _selected)
		row.set_meta("cargo", key)
		row.tapped.connect(_select.bind(key, AREA_CARGO))
		_list.add_child(row)
	if modules.is_empty():
		return
	_list.add_child(Ui.label("STORE_MODULES_TITLE", AppTheme.VARIATION_HEADING))
	for module: StructureLayout.Module in modules:
		_list.add_child(_module_row(module, inventory.scale))


## One storage module: its name, size and mode, and a button switching it to the other area.
func _module_row(module: StructureLayout.Module, scale: int) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	var definition := Services.definitions.module(module.module_type)
	var label := Ui.dynamic_label()
	label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	label.text = tr("STORE_MODULE_ROW").format({"module": definition.display_name if definition != null else tr("LOG_SOMETHING"),
		"capacity": AmountFormat.units(storage_units(module, scale)), "mode": mode_text(module, self)})
	row.add_child(label)
	# A swipe that starts on the button scrolls the list (ListButton).
	var switch := ListButton.new()
	switch.text = tr("STORE_TO_SUPPLY") if module.storage_mode == AREA_CARGO else tr("STORE_TO_CARGO")
	switch.custom_minimum_size = Vector2(220, AppTheme.TOUCH_MIN)
	switch.size_flags_horizontal = Control.SIZE_SHRINK_END
	switch.disabled = _busy
	switch.tapped.connect(_on_switch_mode.bind(module.module_id, other_mode(module)))
	row.add_child(switch)
	return row


func _on_switch_mode(module_id: int, mode: String) -> void:
	if _busy or _model == null:
		return
	_busy = true
	_refresh_buttons()
	var result := await _model.set_storage_mode(module_id, mode)
	_busy = false
	_show_status(switch_result_text(result, mode, self), AppTheme.COLOR_OK if result.is_ok() else AppTheme.COLOR_DANGER)
	_refresh_buttons()


# --- a storage module's mode, shared with the inspect card (ColonyScreen) ---------------------

## The area a storage module's switch moves it to: the cargo hold from the own supply and back.
static func other_mode(module: StructureLayout.Module) -> String:
	return AREA_SUPPLY if module.storage_mode == AREA_CARGO else AREA_CARGO


## "own supply" or "cargo hold"; "… (under construction)" while the module is built (the server
## lets it switch then already; its capacity counts once it is done).
static func mode_text(module: StructureLayout.Module, translator: Object) -> String:
	var mode := translator.tr("STORE_MODE_CARGO") if module.storage_mode == AREA_CARGO else translator.tr("STORE_MODE_SUPPLY")
	if module.is_building():
		mode = translator.tr("STORE_MODE_BUILDING").format({"mode": mode})
	return mode


## The whole units a storage module adds to its area (0 when it is no storage module).
static func storage_units(module: StructureLayout.Module, scale: int) -> int:
	var definition: GameDefinitions.ModuleDef = Services.definitions.module(module.module_type) \
		if Services.definitions != null else null
	@warning_ignore("integer_division")
	return (definition.storage_capacity if definition != null else 0) / maxi(scale, 1)


## The line after switching a storage module to `mode`: what it holds now, or why not.
static func switch_result_text(result: ApiResult, mode: String, translator: Object) -> String:
	if not result.is_ok():
		return ErrorText.describe(result.error, translator)
	return translator.tr("STORE_MODE_SET_CARGO") if mode == AREA_CARGO else translator.tr("STORE_MODE_SET_SUPPLY")


## The row moving the chosen item between the own supply and the cargo hold: shown for a cargo
## item, and for a store item when there is a cargo hold.
func _update_move_bar() -> void:
	var cargo := _area == AREA_CARGO
	_move_bar.visible = not _selected.is_empty() and _inventory != null \
		and (cargo or _inventory.transport_capacity > 0)
	if not _move_bar.visible:
		return
	_move_label.text = tr("STORE_MOVE_TO_SUPPLY") if cargo else tr("STORE_MOVE_TO_CARGO")
	for index: int in MOVE_AMOUNTS.size():
		var amount := MOVE_AMOUNTS[index]
		_move_buttons[index].text = tr("STORE_TRANSFER_ALL") if amount == 0 else str(amount)
		_move_buttons[index].disabled = _busy


func _on_move(amount: int) -> void:
	if _busy or _selected.is_empty() or _model == null or _inventory == null:
		return
	_armed = -1
	var from := _area
	var have := _inventory.cargo_units(_selected) if from == AREA_CARGO else _inventory.units(_selected, Services.clock.now_ms())
	var units := TransferPlan.units_for(amount, have)
	if units <= 0:
		_show_status(tr("STORE_TRANSFER_NOTHING"), AppTheme.COLOR_DANGER)
		return
	var micro := units * _inventory.scale
	if from == AREA_SUPPLY and micro > _inventory.cargo_room():
		_show_status(tr("STORE_MOVE_NO_ROOM"), AppTheme.COLOR_DANGER)
		return
	var item := _selected
	_busy = true
	_refresh_buttons()
	var result := await _model.move_storage(from, item, micro)
	_busy = false
	if result.is_ok():
		var key := "STORE_MOVED_TO_SUPPLY" if from == AREA_CARGO else "STORE_MOVED_TO_CARGO"
		_show_status(tr(key).format({"count": AmountFormat.units(units), "name": _item_name(item)}), AppTheme.COLOR_OK)
	else:
		_show_status(ErrorText.describe(result.error, self), AppTheme.COLOR_DANGER)
	_refresh_buttons()


func _on_event(event: SseEvent) -> void:
	if _model == null or _model.structure_id == 0 or not event.type.begins_with("route."):
		return
	if event.type != "route.arrived" and event.type != "route.departed":
		return
	var data := Wire.parse_object(event.data)
	var id := _model.structure_id
	if Wire.as_int(data.get("transporterId")) == id or Wire.as_int(data.get("stationId")) == id \
			or Wire.as_int(data.get("fuelPayerId")) == id:
		_model.reload_inventory()


func _select(item: String, area: String = AREA_SUPPLY) -> void:
	_selected = item
	_area = area
	for child: Node in _list.get_children():
		if child is ListButton:
			var row := child as ListButton
			var tagged: String = row.get_meta("item", "")
			var cargo: String = row.get_meta("cargo", "")
			row.set_chosen(tagged == item and area == AREA_SUPPLY or cargo == item and area == AREA_CARGO)
	_armed = -1
	_discard_status.remove_theme_color_override("font_color")
	_discard_status.text = ""
	_keep_status = false
	_update_discard_bar()


func _update_discard_bar() -> void:
	var reason := _model.manage_reason() if _model != null else ""
	if not reason.is_empty():
		# Enterprise structure without MANAGE_TREASURY: say so instead of the buttons.
		_move_bar.visible = false
		_discard_bar.visible = false
		_transfer_bar.visible = false
		_discard_status.remove_theme_color_override("font_color")
		_discard_status.text = "" if _selected.is_empty() else tr("ENTERPRISE_NEEDS_TREASURY").format(
			{"right": tr("ENTERPRISE_FLAG_MANAGE_TREASURY")})
		return
	_update_move_bar()
	# Discarding and moving to a guest or host work on the own supply only.
	_discard_bar.visible = not _selected.is_empty() and _area == AREA_SUPPLY
	if not _discard_bar.visible:
		_transfer_bar.visible = false
		if not _keep_status:
			_discard_status.text = ""
		return
	var item_name := _item_name(_selected)
	for index: int in DISCARD_AMOUNTS.size():
		var amount := DISCARD_AMOUNTS[index]
		var label := tr("STORE_DISCARD_ALL") if amount == 0 else tr("STORE_DISCARD_N").format({"count": amount})
		_discard_buttons[index].text = tr("STORE_DISCARD_CONFIRM") if amount == _armed else label
		_discard_buttons[index].disabled = _busy
	if _armed < 0 and not _keep_status:
		_discard_status.text = tr("STORE_DISCARD_HINT").format({"name": item_name})
	_update_transfer_bar()


## The move row: shown when this structure has a host or docked guests.
func _update_transfer_bar() -> void:
	var others: Array[ColonyModel] = []
	if _model != null:
		others = _model.counterparts()
	_transfer_bar.visible = not _selected.is_empty() and _area == AREA_SUPPLY and not others.is_empty()
	if not _transfer_bar.visible:
		return
	_target_index = posmod(_target_index, others.size())
	var target := others[_target_index]
	_target_label.text = tr("STORE_TRANSFER_TO").format({"name": target.structure_name})
	_target_button.visible = others.size() > 1
	_target_button.disabled = _busy
	for index: int in TRANSFER_AMOUNTS.size():
		var amount := TRANSFER_AMOUNTS[index]
		_transfer_buttons[index].text = tr("STORE_TRANSFER_ALL") if amount == 0 else str(amount)
		_transfer_buttons[index].disabled = _busy


func _on_next_target() -> void:
	_target_index += 1
	_update_transfer_bar()


func _on_transfer(amount: int) -> void:
	if _busy or _selected.is_empty() or _model == null or _inventory == null:
		return
	var others := _model.counterparts()
	if others.is_empty():
		return
	var target := others[posmod(_target_index, others.size())]
	_armed = -1
	var now := Services.clock.now_ms()
	var units := TransferPlan.units_for(amount, _inventory.units(_selected, now))
	if units <= 0:
		_show_status(tr("STORE_TRANSFER_NOTHING"), AppTheme.COLOR_DANGER)
		return
	var micro := units * _inventory.scale
	var room := target.inventory
	if room != null and room.used != null and not TransferPlan.fits(micro, room.capacity, room.used.amount_at(now)):
		_show_status(tr("STORE_TRANSFER_NO_ROOM").format({"name": target.structure_name}), AppTheme.COLOR_DANGER)
		return
	var item := _selected
	_busy = true
	_refresh_buttons()
	var result := await _model.transfer_to(target, item, micro)
	_busy = false
	if result.is_ok():
		_show_status(tr("STORE_TRANSFERRED").format({"count": AmountFormat.units(units),
			"name": _item_name(item), "target": target.structure_name}), AppTheme.COLOR_OK)
	else:
		_show_status(ErrorText.describe(result.error, self), AppTheme.COLOR_DANGER)
	_refresh_buttons()


## Enables or disables the buttons while a request runs, without touching the status line.
func _refresh_buttons() -> void:
	for button: Button in _discard_buttons:
		button.disabled = _busy
	_update_transfer_bar()
	_update_move_bar()


func _show_status(text: String, color: Color) -> void:
	_discard_status.add_theme_color_override("font_color", color)
	_discard_status.text = text
	_keep_status = true


func _on_discard(amount: int) -> void:
	if _busy or _selected.is_empty() or _model == null or _inventory == null:
		return
	if _armed != amount:
		_armed = amount
		_discard_status.remove_theme_color_override("font_color")
		_discard_status.text = tr("STORE_DISCARD_WARNING")
		_update_discard_bar()
		return
	_armed = -1
	var have := _inventory.units(_selected, Services.clock.now_ms())
	var units := have if amount == 0 else mini(amount, have)
	if units <= 0:
		_discard_status.text = tr("STORE_DISCARD_NOTHING")
		_update_discard_bar()
		return
	_busy = true
	_update_discard_bar()
	var result := await _model.discard(_selected, units * _inventory.scale)
	_busy = false
	if result.is_ok():
		_show_status(tr("STORE_DISCARDED").format({"count": AmountFormat.units(units), "name": _item_name(_selected)}), AppTheme.COLOR_OK)
	else:
		_show_status(ErrorText.describe(result.error, self), AppTheme.COLOR_DANGER)
	_update_discard_bar()


func _item_name(key: String) -> String:
	var shown := Services.definitions.resource_name(key) if Services.definitions != null else ""
	return shown if not shown.is_empty() else tr("STORE_UNKNOWN_ITEM")


static func _by_name(a: Array, b: Array) -> bool:
	var left: String = a[0]
	var right: String = b[0]
	return left < right


## Updates the amounts to the current game time.
func tick() -> void:
	if _inventory == null:
		return
	var now := Services.clock.now_ms()
	for key: String in _rows.keys():
		var labels: Array = _rows[key]
		var flow := _inventory.flow(key)
		(labels[0] as Label).text = AmountFormat.units(_inventory.units(key, now))
		var rate := AmountFormat.rate(flow.rate_per_hour, _inventory.scale) if flow != null else ""
		var rate_label := labels[1] as Label
		rate_label.text = rate
		if flow != null and flow.rate_per_hour < 0:
			rate_label.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		elif flow != null and flow.rate_per_hour > 0:
			rate_label.add_theme_color_override("font_color", AppTheme.COLOR_OK)
	if _inventory.used != null and _inventory.capacity > 0:
		@warning_ignore("integer_division")
		var used_units := _inventory.used.amount_at(now) / _inventory.scale
		@warning_ignore("integer_division")
		var capacity_units := _inventory.capacity / _inventory.scale
		_summary.text = tr("STORE_FILL").format({
			"used": AmountFormat.units(used_units), "capacity": AmountFormat.units(capacity_units)})
