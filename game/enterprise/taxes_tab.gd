class_name EnterpriseTaxesTab
extends EnterpriseTab
## Taxes and the enterprise inventory. Rates: one rate per taxable resource (0 to the maximum),
## announced increases with the time they start; with SET_TAX a chosen rate can be stepped and
## the whole table saved (lower rates count at once, higher ones after a day). Inventory: what
## the taxes collected, counted up every second and loaded again every minute.

const STEPS: Array[int] = [-5, -1, 1, 5]
## How often the inventory is loaded again while shown (seconds).
const STOCK_RELOAD_SECONDS := 60.0
const TICK_SECONDS := 1.0

var _rates_tab: Button
var _stock_tab: Button
var _rates: VBoxContainer
var _stock: VBoxContainer
var _state: Label
var _list: VBoxContainer
var _editor: VBoxContainer
var _editor_label: Label
var _step_buttons: Array[Button] = []
var _save: Button
var _undo: Button
var _summary: Label
var _stock_state: Label
var _stock_list: VBoxContainer
## Resource → [amount label, rate label] of the inventory rows.
var _stock_rows: Dictionary = {}
## Resource → percent being edited; starts from what the table is headed for.
var _draft: Dictionary = {}
var _dirty := false
var _chosen := ""
var _showing_stock := false
var _tick := 0.0
var _reload := 0.0


func _build() -> void:
	var tabs := HBoxContainer.new()
	add_child(tabs)
	var group := ButtonGroup.new()
	_rates_tab = Ui.tab_button("TAX_TAB_RATES", group)
	_rates_tab.pressed.connect(_show_stock.bind(false))
	tabs.add_child(_rates_tab)
	_stock_tab = Ui.tab_button("TAX_TAB_INVENTORY", group)
	_stock_tab.pressed.connect(_show_stock.bind(true))
	tabs.add_child(_stock_tab)

	_rates = Ui.column(10)
	_rates.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_rates)
	_rates.add_child(Ui.label("TAX_INTRO", AppTheme.VARIATION_MUTED))
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_rates.add_child(_state)
	_list = scroll_column(_rates, 4)
	_editor = Ui.column(8)
	_rates.add_child(_editor)
	_editor_label = Ui.dynamic_label()
	_editor.add_child(_editor_label)
	var steps := button_row(_editor)
	for step: int in STEPS:
		var button := action_button(steps, ("+%d" if step > 0 else "%d") % step)
		button.pressed.connect(_on_step.bind(step))
		_step_buttons.append(button)
	_summary = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_rates.add_child(_summary)
	var actions := button_row(_rates)
	_save = action_button(actions, tr("TAX_SAVE"), false, true)
	_save.pressed.connect(_on_save)
	_undo = action_button(actions, tr("TAX_UNDO"))
	_undo.pressed.connect(_on_undo)

	_stock = Ui.column(10)
	_stock.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_stock)
	_stock.add_child(Ui.label("TAX_INVENTORY_NOTE", AppTheme.VARIATION_MUTED))
	_stock_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_stock.add_child(_stock_state)
	_stock_list = scroll_column(_stock, 4)

	model.taxes_changed.connect(_on_taxes_changed)
	model.stock_changed.connect(_fill_stock)
	model.changed.connect(refresh)
	_show_stock(false)


func shown() -> void:
	if not _dirty and model.taxes != null:
		_draft = model.taxes.targets()
		refresh()
	model.reload_taxes()
	model.reload_stock()
	_reload = STOCK_RELOAD_SECONDS


func handle_back() -> bool:
	if super.handle_back():
		return true
	if not _chosen.is_empty():
		_chosen = ""
		refresh()
		return true
	return false


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	_tick -= delta
	if _tick <= 0.0:
		_tick = TICK_SECONDS
		if _showing_stock:
			_update_stock()
		elif model.taxes != null:
			_update_pending_lines()
	_reload -= delta
	if _reload <= 0.0:
		_reload = STOCK_RELOAD_SECONDS
		if _showing_stock:
			model.reload_stock()


func _show_stock(on: bool) -> void:
	_showing_stock = on
	_rates_tab.set_pressed_no_signal(not on)
	_stock_tab.set_pressed_no_signal(on)
	_rates.visible = not on
	_stock.visible = on
	if on:
		_fill_stock()


func _on_taxes_changed() -> void:
	if not _dirty and model.taxes != null:
		_draft = model.taxes.targets()
	refresh()


func _can_edit() -> bool:
	return model.mine != null and model.mine.has_flag("SET_TAX") and model.taxes != null


func refresh() -> void:
	if _list == null:
		return
	clear(_list)
	var taxes := model.taxes
	_state.visible = taxes == null
	if taxes == null:
		_state.text = tr("COMMON_LOADING") if model.taxes_error == null else \
			tr("TAX_LOAD_FAILED") + "\n" + ErrorText.describe(model.taxes_error, self)
		_editor.visible = false
		_save.visible = false
		_undo.visible = false
		_summary.visible = false
		return
	var definitions := Services.definitions
	var keys := definitions.taxable_resources() if definitions != null else PackedStringArray()
	# Rates for resources the game data does not offer (yet) still show.
	for key: String in taxes.rates.keys():
		if not keys.has(key):
			keys.append(key)
	var set_keys: Array[String] = []
	var rest: Array[String] = []
	for key: String in keys:
		if taxes.rates.has(key) or Wire.as_int(_draft.get(key)) > 0:
			set_keys.append(key)
		else:
			rest.append(key)
	keys = PackedStringArray(set_keys + rest)
	if keys.is_empty():
		_state.visible = true
		_state.text = tr("TAX_NOTHING_TAXABLE")
	var editable := _can_edit()
	for key: String in keys:
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.set_meta("resource", key)
		row.set_chosen(key == _chosen)
		row.disabled = not editable
		row.tapped.connect(_choose.bind(key))
		_list.add_child(row)
	_update_pending_lines()
	_editor.visible = editable and not _chosen.is_empty()
	if _editor.visible:
		var value := Wire.as_int(_draft.get(_chosen))
		_editor_label.text = tr("TAX_EDITING").format({"resource": resource_text(_chosen, self), "percent": value,
			"max": taxes.max_percent})
		for index: int in STEPS.size():
			var next := value + STEPS[index]
			_step_buttons[index].disabled = busy or next < 0 or next > taxes.max_percent
	_save.visible = editable
	_undo.visible = editable and _dirty
	_save.disabled = busy or not taxes.differs(_draft)
	_summary.visible = true
	_summary.text = _change_summary(taxes) if editable else tr("TAX_READ_ONLY")


## The text of each rate row: rate now, announced increase with its start, the change planned.
func _update_pending_lines() -> void:
	var taxes := model.taxes
	if taxes == null:
		return
	var now := Services.clock.now_ms()
	for child: Node in _list.get_children():
		var row := child as ListButton
		if row == null or row.is_queued_for_deletion():
			continue
		var key: String = row.get_meta("resource", "")
		var lines := PackedStringArray()
		lines.append(tr("TAX_ROW").format({"resource": resource_text(key, self), "percent": taxes.percent(key)}))
		var pending := taxes.pending(key)
		if pending != null:
			lines.append(tr("TAX_PENDING").format({"percent": pending.pending_percent,
				"duration": TimeFormat.duration(maxi(pending.effective_at - now, 0))}))
		var target := Wire.as_int(taxes.targets().get(key))
		var planned := Wire.as_int(_draft.get(key))
		if planned != target:
			lines.append(tr("TAX_PLANNED").format({"percent": planned}))
		row.text = "\n".join(lines)
		if pending != null or planned != target:
			row.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		else:
			row.remove_theme_color_override("font_color")


## "2 changes: 1 lower at once, 1 higher after 24h" for the draft.
func _change_summary(taxes: EnterpriseTaxes) -> String:
	var targets := taxes.targets()
	var lower := 0
	var higher := 0
	var keys: Dictionary = {}
	for key: Variant in _draft.keys():
		keys[key] = true
	for key: Variant in targets.keys():
		keys[key] = true
	for key: Variant in keys.keys():
		var planned := Wire.as_int(_draft.get(key))
		if planned == Wire.as_int(targets.get(key)):
			continue
		if taxes.is_increase(str(key), planned):
			higher += 1
		else:
			lower += 1
	if lower + higher == 0:
		return tr("TAX_NO_CHANGES").format({"duration": TimeFormat.duration(taxes.increase_delay_ms)})
	return tr("TAX_CHANGES").format({"lower": lower, "higher": higher, "duration": TimeFormat.duration(taxes.increase_delay_ms)})


func _choose(key: String) -> void:
	_chosen = "" if _chosen == key else key
	refresh()


func _on_step(step: int) -> void:
	if _chosen.is_empty() or model.taxes == null:
		return
	_draft[_chosen] = clampi(Wire.as_int(_draft.get(_chosen)) + step, 0, model.taxes.max_percent)
	_dirty = model.taxes.differs(_draft)
	say("")
	refresh()


func _on_undo() -> void:
	if model.taxes != null:
		_draft = model.taxes.targets()
	_dirty = false
	refresh()


func _on_save() -> void:
	var draft := _draft.duplicate()
	if await run(func() -> ApiResult: return await model.set_taxes(draft), "TAX_SAVED"):
		_dirty = false
		_draft = model.taxes.targets()
		refresh()


func _fill_stock() -> void:
	if _stock_list == null:
		return
	clear(_stock_list)
	_stock_rows.clear()
	var stock := model.stock
	_stock_state.visible = stock == null or stock.items.is_empty()
	if stock == null:
		_stock_state.text = tr("COMMON_LOADING") if model.stock_error == null else \
			tr("TAX_INVENTORY_FAILED") + "\n" + ErrorText.describe(model.stock_error, self)
		return
	_stock_state.text = tr("TAX_INVENTORY_EMPTY")
	var keys: Array[String] = []
	for item: Array in stock.items:
		var key: String = item[0]
		keys.append(key)
	keys.sort_custom(func(a: String, b: String) -> bool: return resource_text(a, self).naturalnocasecmp_to(resource_text(b, self)) < 0)
	for key: String in keys:
		var row := HBoxContainer.new()
		row.custom_minimum_size = Vector2(0, 56)
		row.add_theme_constant_override("separation", 16)
		_stock_list.add_child(row)
		var name_label := text_label(row, resource_text(key, self))
		name_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		var rate := text_label(row, "", AppTheme.VARIATION_MUTED)
		rate.size_flags_horizontal = Control.SIZE_SHRINK_END
		rate.autowrap_mode = TextServer.AUTOWRAP_OFF
		var amount := text_label(row, "")
		amount.size_flags_horizontal = Control.SIZE_SHRINK_END
		amount.custom_minimum_size = Vector2(170, 0)
		amount.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		amount.autowrap_mode = TextServer.AUTOWRAP_OFF
		_stock_rows[key] = [amount, rate]
	_update_stock()


func _update_stock() -> void:
	var stock := model.stock
	if stock == null:
		return
	var now := Services.clock.now_ms()
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	for key: String in _stock_rows.keys():
		var labels: Array = _stock_rows[key]
		var amount := labels[0] as Label
		var rate := labels[1] as Label
		@warning_ignore("integer_division")
		amount.text = AmountFormat.units(stock.value_at(key, now) / maxi(scale, 1))
		rate.text = AmountFormat.rate(stock.rate_of(key), scale)
