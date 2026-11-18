class_name StorePanel
extends VBoxContainer
## The store of the colony: every item with its amount now and its rate per hour, plus how
## full the store is. Amounts are extrapolated from the flows every second.

## Most of the screen stays free for the colony; the list scrolls.
const LIST_HEIGHT := 460

## Amounts offered for discarding, in whole units; 0 stands for everything.
const DISCARD_AMOUNTS: Array[int] = [1, 10, 0]

var _model: ColonyModel
var _summary: Label
var _balance: Label
var _scroll: ScrollContainer
var _list: VBoxContainer
var _inventory: Inventory
## Item → [amount label, rate label].
var _rows: Dictionary = {}
var _group := ButtonGroup.new()
## The item chosen for discarding; "" when none.
var _selected := ""
## The amount waiting for its second tap (DISCARD_AMOUNTS entry); -1 when none.
var _armed := -1
var _busy := false
var _discard_bar: HBoxContainer
var _discard_buttons: Array[Button] = []
var _discard_status: Label


func setup(model: ColonyModel) -> void:
	_model = model


func _ready() -> void:
	add_theme_constant_override("separation", 12)
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


## Shows the energy and life support balance and warnings of the colony.
func show_balance(model: ColonyModel) -> void:
	var scale := _inventory.scale if _inventory != null else 1000000
	var lines := PackedStringArray([
		tr("STORE_POWER").format({
			"production": AmountFormat.units(model.power[0] / scale),
			"consumption": AmountFormat.units(model.power[1] / scale)}),
		tr("STORE_LIFE_SUPPORT").format({
			"production": AmountFormat.units(model.life_support[0] / scale),
			"consumption": AmountFormat.units(model.life_support[1] / scale)}),
	])
	var short := model.power[1] > model.power[0] or model.life_support[1] > model.life_support[0]
	if model.food_shortage:
		lines.append(tr("STORE_FOOD_SHORTAGE"))
		short = true
	if model.storage_full:
		lines.append(tr("STORE_FULL"))
		short = true
	_balance.text = "\n".join(lines)
	if short:
		_balance.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	else:
		_balance.remove_theme_color_override("font_color")


## Shows a (new) inventory; rows are rebuilt.
func show_inventory(inventory: Inventory) -> void:
	_inventory = inventory
	for child: Node in _list.get_children():
		child.queue_free()
	_rows.clear()
	if inventory == null:
		return
	var definitions := Services.definitions
	var entries: Array[Array] = []
	for key: String in inventory.item_keys():
		var shown := definitions.resource_name(key) if definitions != null else ""
		entries.append([shown if not shown.is_empty() else tr("STORE_UNKNOWN_ITEM"), key])
	entries.sort_custom(_by_name)
	for entry: Array in entries:
		# The whole row is a button: tapping it chooses the item for discarding.
		var key: String = entry[1]
		var row_button := Button.new()
		row_button.toggle_mode = true
		row_button.button_group = _group
		row_button.flat = true
		row_button.custom_minimum_size = Vector2(0, AppTheme.TOUCH_MIN)
		row_button.button_pressed = key == _selected
		row_button.pressed.connect(_select.bind(key))
		var row := HBoxContainer.new()
		row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row_button.add_child(row)
		row.add_theme_constant_override("separation", 16)
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
	if not _rows.has(_selected):
		_selected = ""
	_update_discard_bar()
	tick()


func _select(item: String) -> void:
	_selected = item
	_armed = -1
	_discard_status.text = ""
	_update_discard_bar()


func _update_discard_bar() -> void:
	_discard_bar.visible = not _selected.is_empty()
	if _selected.is_empty():
		return
	var item_name := _item_name(_selected)
	for index: int in DISCARD_AMOUNTS.size():
		var amount := DISCARD_AMOUNTS[index]
		var label := tr("STORE_DISCARD_ALL") if amount == 0 else tr("STORE_DISCARD_N").format({"count": amount})
		_discard_buttons[index].text = tr("STORE_DISCARD_CONFIRM") if amount == _armed else label
		_discard_buttons[index].disabled = _busy
	if _armed < 0:
		_discard_status.text = tr("STORE_DISCARD_HINT").format({"name": item_name})


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
		_discard_status.add_theme_color_override("font_color", AppTheme.COLOR_OK)
		_discard_status.text = tr("STORE_DISCARDED").format({"count": AmountFormat.units(units), "name": _item_name(_selected)})
	else:
		_discard_status.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		_discard_status.text = ErrorText.describe(result.error, self)
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
