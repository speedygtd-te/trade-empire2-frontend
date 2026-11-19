class_name RouteEditor
extends Control
## One form for a route, over the whole screen. New route: transporter, stations A and B (from
## the own structures), the first stop, and per direction the goods loaded at the departing
## station; a live quote (debounced) says whether it can start, where it stops and what the first
## trip takes. Existing route: name and rules only (stations, transporter and stops are fixed;
## PATCH sends both directions). The server decides; this only prepares and previews.

signal closed
## A route was created or its rules saved.
signal saved(route_id: int)

## Seconds of quiet after a change before the quote is asked for.
const QUOTE_DELAY := 0.6
## Steps of the amount buttons, whole units.
const STEPS: Array[int] = [-10, -1, 1, 10]
## Amount a new cargo rule starts with.
const NEW_AMOUNT := 10

var _fleet: FleetModel
var _route_id := 0
var _draft := RoutePlan.Draft.new()
var _original_ab: Array[RoutePlan.Rule] = []
var _original_ba: Array[RoutePlan.Rule] = []
var _original_name := ""
## The rule being edited: direction (A or B) and index; -1 when none.
var _selected_letter := ""
var _selected_index := -1
## Fuel kinds of the transporter's drives (from its layout and the quote).
var _fuel_types := PackedStringArray()
## Station structure id → Inventory, ApiError or null while loading.
var _stocks: Dictionary = {}
var _quote: RoutePlan.Quote = null
var _quote_error: ApiError = null
var _quote_seq := 0
## Seconds until the quote is asked for; < 0 when none is due.
var _quote_due := -1.0
var _busy := false
## What the picker chooses: "transporter", "A", "B", "goods_A", "goods_B"; "" when closed.
var _picking := ""

var _title: Label
var _form_scroll: ScrollContainer
var _name_edit: LineEdit
var _ends: VBoxContainer
var _rules: VBoxContainer
var _quote_label: Label
var _picker: VBoxContainer
var _picker_title: Label
var _picker_state: Label
var _picker_list: VBoxContainer
var _result: Label
var _action: Button


## `route_id` 0 creates a route, prefilled with `transporter_id` when that is not 0.
func setup(fleet: FleetModel, route_id: int, transporter_id: int = 0) -> void:
	_fleet = fleet
	_route_id = route_id
	_draft.transporter_id = transporter_id
	var route := fleet.routes.book.find(route_id) if route_id != 0 else null
	if route != null:
		_draft.name = route.name
		_original_name = route.name
		_draft.transporter_id = route.transporter_id
		_draft.station_a = route.station_id(RoutePlan.A)
		_draft.station_b = route.station_id(RoutePlan.B)
		_draft.rules_ab = RoutePlan.copy_rules(route.rules_ab)
		_draft.rules_ba = RoutePlan.copy_rules(route.rules_ba)
		_original_ab = RoutePlan.copy_rules(route.rules_ab)
		_original_ba = RoutePlan.copy_rules(route.rules_ba)


func is_new() -> bool:
	return _route_id == 0


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
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 16)
	column.add_child(top)
	_title = Ui.label("ROUTE_NEW_TITLE" if is_new() else "ROUTE_EDIT_TITLE", AppTheme.VARIATION_HEADING)
	_title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	top.add_child(_title)
	var close := Ui.secondary_button("COMMON_CLOSE")
	close.size_flags_horizontal = Control.SIZE_SHRINK_END
	close.pressed.connect(func() -> void: closed.emit())
	top.add_child(close)

	_form_scroll = ScrollContainer.new()
	_form_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_form_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_form_scroll)
	var form := Ui.column(16)
	_form_scroll.add_child(form)
	_name_edit = Ui.line_edit("ROUTE_NAME_HINT")
	_name_edit.max_length = RoutePlan.MAX_NAME
	_name_edit.text = _draft.name
	_name_edit.text_changed.connect(_on_name_changed)
	form.add_child(_name_edit)
	_ends = Ui.column(10)
	form.add_child(_ends)
	_rules = Ui.column(10)
	form.add_child(_rules)
	_quote_label = Ui.dynamic_label()
	form.add_child(_quote_label)

	_picker = Ui.column(12)
	_picker.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_picker.visible = false
	column.add_child(_picker)
	_picker_title = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_picker.add_child(_picker_title)
	_picker_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_picker.add_child(_picker_state)
	var picker_scroll := ScrollContainer.new()
	picker_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	picker_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_picker.add_child(picker_scroll)
	_picker_list = Ui.column(10)
	_picker_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	picker_scroll.add_child(_picker_list)
	var cancel := Ui.secondary_button("COMMON_CLOSE")
	cancel.pressed.connect(_close_picker)
	_picker.add_child(cancel)

	_result = Ui.dynamic_label()
	_result.visible = false
	column.add_child(_result)
	_action = Ui.primary_button("ROUTE_CREATE" if is_new() else "ROUTE_SAVE")
	_action.pressed.connect(_on_action)
	column.add_child(_action)

	_fleet.changed.connect(_rebuild_ends)
	_rebuild_ends()
	_rebuild_rules()
	_load_transporter()
	for station: int in [_draft.station_a, _draft.station_b]:
		_load_stock(station)
	_changed()


## Back closes the picker first, then the editor.
func handle_back() -> void:
	if _picker.visible:
		_close_picker()
	else:
		closed.emit()


func _process(delta: float) -> void:
	if _quote_due < 0.0:
		return
	_quote_due -= delta
	if _quote_due < 0.0:
		_run_quote()


# --- the two ends -----------------------------------------------------------------------------

func _rebuild_ends() -> void:
	for child: Node in _ends.get_children():
		child.queue_free()
	var a := RouteList.structure_name(_fleet, _draft.station_a, self) if _draft.station_a != 0 else tr("ROUTE_CHOOSE")
	var b := RouteList.structure_name(_fleet, _draft.station_b, self) if _draft.station_b != 0 else tr("ROUTE_CHOOSE")
	var transporter := RouteList.structure_name(_fleet, _draft.transporter_id, self) \
		if _draft.transporter_id != 0 else tr("ROUTE_CHOOSE")
	if not is_new():
		var fixed := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
		fixed.text = tr("ROUTE_FIXED_ENDS").format({"transporter": transporter, "a": a, "b": b})
		_ends.add_child(fixed)
		return
	_ends.add_child(_choice(tr("ROUTE_TRANSPORTER").format({"name": transporter}), "transporter"))
	_ends.add_child(_choice(tr("ROUTE_STATION_A").format({"name": a}), RoutePlan.A))
	_ends.add_child(_choice(tr("ROUTE_STATION_B").format({"name": b}), RoutePlan.B))
	var start := Ui.secondary_button("")
	start.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	match _draft.start_at:
		RoutePlan.A:
			start.text = tr("ROUTE_START_AT").format({"name": a})
		RoutePlan.B:
			start.text = tr("ROUTE_START_AT").format({"name": b})
		_:
			start.text = tr("ROUTE_START_NEARER")
	start.pressed.connect(_on_start)
	_ends.add_child(start)


func _choice(text: String, what: String) -> Button:
	var button := Ui.secondary_button("")
	button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	button.text = text
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	button.pressed.connect(_open_picker.bind(what))
	return button


func _on_start() -> void:
	match _draft.start_at:
		"":
			_draft.start_at = RoutePlan.A
		RoutePlan.A:
			_draft.start_at = RoutePlan.B
		_:
			_draft.start_at = ""
	_rebuild_ends()
	_changed()


func _on_name_changed(text: String) -> void:
	_draft.name = text
	_changed()


# --- rules ------------------------------------------------------------------------------------

func _rebuild_rules() -> void:
	for child: Node in _rules.get_children():
		child.queue_free()
	for letter: String in [RoutePlan.A, RoutePlan.B]:
		var other := RoutePlan.B if letter == RoutePlan.A else RoutePlan.A
		var heading := Ui.dynamic_label(AppTheme.VARIATION_HEADING)
		heading.text = tr("ROUTE_RULES_FROM").format({
			"from": _station_name(letter), "to": _station_name(other)})
		_rules.add_child(heading)
		var rules := _draft.rules_from(letter)
		if rules.is_empty():
			var empty := Ui.label("ROUTE_RULES_EMPTY", AppTheme.VARIATION_MUTED)
			_rules.add_child(empty)
		for index: int in rules.size():
			var row := ListButton.new()
			row.alignment = HORIZONTAL_ALIGNMENT_LEFT
			row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			row.text = _rule_line(letter, rules[index])
			row.set_chosen(letter == _selected_letter and index == _selected_index)
			row.tapped.connect(_select_rule.bind(letter, index))
			_rules.add_child(row)
			if letter == _selected_letter and index == _selected_index:
				_rules.add_child(_rule_bar(rules[index]))
		var add := Ui.secondary_button("ROUTE_ADD_GOODS")
		add.disabled = rules.size() >= RoutePlan.MAX_RULES or _draft.station_id(letter) == 0
		add.pressed.connect(_open_picker.bind("goods_" + letter))
		_rules.add_child(add)
	if not _fuel_types.is_empty():
		var fuel := Ui.secondary_button("ROUTE_TOP_UP_FUEL")
		fuel.pressed.connect(_on_top_up_fuel)
		_rules.add_child(fuel)


func _station_name(letter: String) -> String:
	var id := _draft.station_id(letter)
	return RouteList.structure_name(_fleet, id, self) if id != 0 else tr("ROUTE_STATION_" + letter + "_SHORT")


## "Iron · 50 as cargo · 120 in store" / "Hydrogen · fill own supply".
func _rule_line(letter: String, rule: RoutePlan.Rule) -> String:
	var item := RouteList.item_name(rule.resource, self)
	var text := ""
	if rule.is_supply():
		text = tr("ROUTE_RULE_SUPPLY_MAX").format({"item": item}) if rule.is_max() else \
			tr("ROUTE_RULE_SUPPLY").format({"item": item, "count": AmountFormat.units(rule.amount)})
	else:
		text = tr("ROUTE_RULE_CARGO_MAX").format({"item": item}) if rule.is_max() else \
			tr("ROUTE_RULE_CARGO").format({"item": item, "count": AmountFormat.units(rule.amount)})
	var stock := _stocks.get(_draft.station_id(letter)) as Inventory
	if stock != null:
		text += "\n" + tr("ROUTE_RULE_STOCK").format({
			"count": AmountFormat.units(stock.units(rule.resource, Services.clock.now_ms()))})
	return text


## Amount steps, "Max", cargo or supply, and remove for the chosen rule.
func _rule_bar(rule: RoutePlan.Rule) -> VBoxContainer:
	var bar := Ui.column(8)
	var steps := HBoxContainer.new()
	steps.add_theme_constant_override("separation", 8)
	bar.add_child(steps)
	for step: int in STEPS:
		var button := Ui.secondary_button("")
		button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		button.text = ("%+d" % step).replace("-", "−")
		button.pressed.connect(_on_step.bind(step))
		steps.add_child(button)
		if step == -1:
			var count := Ui.dynamic_label()
			count.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			count.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			count.text = tr("ROUTE_MAX") if rule.is_max() else AmountFormat.units(rule.amount)
			steps.add_child(count)
	var modes := HBoxContainer.new()
	modes.add_theme_constant_override("separation", 8)
	bar.add_child(modes)
	var max_button := Ui.secondary_button("ROUTE_MAX")
	max_button.toggle_mode = true
	max_button.set_pressed_no_signal(rule.is_max())
	max_button.pressed.connect(_on_max)
	modes.add_child(max_button)
	var into := Ui.secondary_button("ROUTE_INTO_SUPPLY" if rule.is_supply() else "ROUTE_INTO_CARGO")
	into.pressed.connect(_on_into)
	modes.add_child(into)
	var remove := Ui.secondary_button("ROUTE_REMOVE_RULE")
	remove.theme_type_variation = AppTheme.VARIATION_DANGER_BUTTON
	remove.pressed.connect(_on_remove)
	modes.add_child(remove)
	var hint := Ui.label("ROUTE_SUPPLY_HINT" if rule.is_supply() else "ROUTE_CARGO_HINT", AppTheme.VARIATION_MUTED)
	bar.add_child(hint)
	return bar


func _selected_rule() -> RoutePlan.Rule:
	if _selected_letter.is_empty():
		return null
	var rules := _draft.rules_from(_selected_letter)
	return rules[_selected_index] if _selected_index >= 0 and _selected_index < rules.size() else null


func _select_rule(letter: String, index: int) -> void:
	if _selected_letter == letter and _selected_index == index:
		_selected_letter = ""
		_selected_index = -1
	else:
		_selected_letter = letter
		_selected_index = index
	_rebuild_rules()


func _on_step(step: int) -> void:
	var rule := _selected_rule()
	if rule == null:
		return
	rule.amount = maxi((0 if rule.is_max() else rule.amount) + step, 1)
	_rules_changed()


func _on_max() -> void:
	var rule := _selected_rule()
	if rule == null:
		return
	rule.amount = NEW_AMOUNT if rule.is_max() else 0
	_rules_changed()


func _on_into() -> void:
	var rule := _selected_rule()
	if rule == null:
		return
	var other := RoutePlan.INTO_CARGO if rule.is_supply() else RoutePlan.INTO_SUPPLY
	if RoutePlan.find_rule(_draft.rules_from(_selected_letter), rule.resource, other) >= 0:
		_show_result(tr("ROUTE_RULE_TWICE"), AppTheme.COLOR_DANGER)
		return
	rule.into = other
	_rules_changed()


func _on_remove() -> void:
	var rules := _draft.rules_from(_selected_letter)
	if _selected_index >= 0 and _selected_index < rules.size():
		rules.remove_at(_selected_index)
	_selected_letter = ""
	_selected_index = -1
	_rules_changed()


func _on_top_up_fuel() -> void:
	var changed := RoutePlan.top_up_fuel(_draft.rules_ab, _fuel_types)
	changed = RoutePlan.top_up_fuel(_draft.rules_ba, _fuel_types) or changed
	if changed:
		_rules_changed()
	else:
		_show_result(tr("ROUTE_FUEL_ALREADY"), AppTheme.COLOR_OK)


func _add_goods(letter: String, item: String) -> void:
	var rules := _draft.rules_from(letter)
	var into := RoutePlan.INTO_CARGO
	if not RoutePlan.can_add(rules, item, into):
		into = RoutePlan.INTO_SUPPLY
	if not RoutePlan.can_add(rules, item, into):
		_show_result(tr("ROUTE_RULE_TWICE"), AppTheme.COLOR_DANGER)
		return
	rules.append(RoutePlan.Rule.make(item, into, NEW_AMOUNT))
	_selected_letter = letter
	_selected_index = rules.size() - 1
	_rules_changed()


func _rules_changed() -> void:
	_rebuild_rules()
	_changed()


# --- pickers ----------------------------------------------------------------------------------

func _open_picker(what: String) -> void:
	_picking = what
	_form_scroll.visible = false
	_action.visible = false
	_result.visible = false
	_picker.visible = true
	_fill_picker()


func _close_picker() -> void:
	_picking = ""
	_picker.visible = false
	_form_scroll.visible = true
	_action.visible = true
	_update_action()


func _fill_picker() -> void:
	for child: Node in _picker_list.get_children():
		child.queue_free()
	_picker_state.text = ""
	if _picking.begins_with("goods_"):
		_fill_goods(_picking.trim_prefix("goods_"))
		return
	_picker_title.text = tr("ROUTE_PICK_TRANSPORTER") if _picking == "transporter" else \
		tr("ROUTE_PICK_STATION").format({"letter": _picking})
	var now := Services.clock.now_ms()
	var shown := 0
	for entry: Fleet.Entry in _fleet.fleet.entries():
		var reason := ""
		if _picking == "transporter":
			if not entry.can_fly() and not entry.can_drive():
				continue
			if entry.route_id != 0:
				reason = tr("ROUTE_PICK_BUSY")
		else:
			if entry.structure_id == _draft.transporter_id:
				continue
			if entry.is_moving(now):
				reason = tr("ROUTE_PICK_MOVING")
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		var line := FleetPanel.status_text(_fleet, entry, now, self)
		row.text = "%s\n%s" % [entry.name, line if reason.is_empty() else reason]
		row.disabled = not reason.is_empty()
		row.set_chosen(entry.structure_id == _current_pick())
		row.tapped.connect(_on_picked.bind(entry.structure_id))
		_picker_list.add_child(row)
		shown += 1
	if shown == 0:
		_picker_state.text = tr("ROUTE_PICK_NO_TRANSPORTER") if _picking == "transporter" else tr("ROUTE_PICK_NO_STATION")
	if not _fleet.loaded:
		_picker_state.text = tr("FLEET_LOADING")


func _current_pick() -> int:
	match _picking:
		"transporter":
			return _draft.transporter_id
		RoutePlan.A:
			return _draft.station_a
		RoutePlan.B:
			return _draft.station_b
	return 0


func _on_picked(structure_id: int) -> void:
	match _picking:
		"transporter":
			_draft.transporter_id = structure_id
			if _draft.station_a == structure_id:
				_draft.station_a = 0
			if _draft.station_b == structure_id:
				_draft.station_b = 0
			_fuel_types = PackedStringArray()
			_load_transporter()
		RoutePlan.A:
			_draft.station_a = structure_id
			if _draft.station_b == structure_id:
				_draft.station_b = 0
			_load_stock(structure_id)
		RoutePlan.B:
			_draft.station_b = structure_id
			if _draft.station_a == structure_id:
				_draft.station_a = 0
			_load_stock(structure_id)
	_close_picker()
	_rebuild_ends()
	_rebuild_rules()
	_changed()


## The goods of the loading station's store to choose from.
func _fill_goods(letter: String) -> void:
	var station := _draft.station_id(letter)
	_picker_title.text = tr("ROUTE_PICK_GOODS").format({"station": _station_name(letter)})
	var stock: Variant = _stocks.get(station)
	if stock == null:
		_picker_state.text = tr("COMMON_LOADING")
		return
	if stock is ApiError:
		_picker_state.text = ErrorText.describe(stock as ApiError, self)
		var again := Ui.secondary_button("COMMON_RETRY")
		again.pressed.connect(func() -> void:
			_stocks.erase(station)
			_load_stock(station)
			_fill_picker())
		_picker_list.add_child(again)
		return
	var inventory := stock as Inventory
	var now := Services.clock.now_ms()
	var entries: Array[Array] = []
	for key: String in inventory.item_keys():
		var units := inventory.units(key, now)
		if units > 0:
			entries.append([RouteList.item_name(key, self), key, units])
	entries.sort_custom(func(left: Array, right: Array) -> bool:
		var one: String = left[0]
		var other: String = right[0]
		return one.naturalnocasecmp_to(other) < 0)
	var rules := _draft.rules_from(letter)
	for entry: Array in entries:
		var key: String = entry[1]
		var units: int = entry[2]
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.text = tr("ROUTE_PICK_GOODS_ROW").format({"item": entry[0], "count": AmountFormat.units(units)})
		row.disabled = not RoutePlan.can_add(rules, key, RoutePlan.INTO_CARGO) \
			and not RoutePlan.can_add(rules, key, RoutePlan.INTO_SUPPLY)
		row.tapped.connect(func() -> void:
			_close_picker()
			_add_goods(letter, key))
		_picker_list.add_child(row)
	if entries.is_empty():
		_picker_state.text = tr("ROUTE_PICK_NO_GOODS")


# --- data -------------------------------------------------------------------------------------

## The fuel kinds of the transporter's drives, from its layout and the game data.
func _load_transporter() -> void:
	var id := _draft.transporter_id
	if id == 0 or Services.definitions == null:
		return
	var answer := await Services.api.get_ndjson("/v2/structures/%d/layout" % id)
	if not answer.is_ok() or id != _draft.transporter_id:
		return
	var layout := StructureLayout.new()
	if not layout.apply(answer.stream):
		return
	for module: StructureLayout.Module in layout.modules():
		var definition := Services.definitions.module(module.module_type)
		if definition != null and not definition.fuel_type.is_empty() and not _fuel_types.has(definition.fuel_type):
			_fuel_types.append(definition.fuel_type)
	_rebuild_rules()


func _load_stock(station: int) -> void:
	if station == 0 or _stocks.get(station) is Inventory:
		return
	_stocks.erase(station)
	var answer := await Services.api.get_json("/v2/structures/%d/inventory" % station)
	if answer.is_ok():
		var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
		_stocks[station] = Inventory.from_wire(answer.data, scale)
	else:
		_stocks[station] = answer.error
	if _picking.begins_with("goods_"):
		_fill_picker()
	_rebuild_rules()


# --- quote and saving -------------------------------------------------------------------------

## Something in the form changed: a new route asks for a new quote soon.
func _changed() -> void:
	_result.visible = false
	if is_new():
		_quote = null
		_quote_error = null
		_quote_seq += 1
		_quote_due = QUOTE_DELAY if _draft.is_complete() and _rules_ok() else -1.0
	_show_quote()
	_update_action()


func _rules_ok() -> bool:
	return RoutePlan.problem(_draft.rules_ab) == RoutePlan.Problem.NONE \
		and RoutePlan.problem(_draft.rules_ba) == RoutePlan.Problem.NONE


func _run_quote() -> void:
	var seq := _quote_seq
	var answer := await _fleet.routes.quote(_draft)
	if seq != _quote_seq or not is_inside_tree():
		return
	if answer.is_ok():
		_quote = RoutePlan.Quote.from_wire(answer.data)
		for fuel: String in _quote.fuel_types():
			if not _fuel_types.has(fuel):
				_fuel_types.append(fuel)
				_rebuild_rules()
	else:
		_quote_error = answer.error
	_show_quote()
	_update_action()


func _show_quote() -> void:
	if not is_new():
		_quote_label.visible = false
		return
	_quote_label.visible = true
	_quote_label.remove_theme_color_override("font_color")
	if not _draft.is_complete():
		_quote_label.text = tr("ROUTE_QUOTE_INCOMPLETE")
		_quote_label.add_theme_color_override("font_color", AppTheme.COLOR_MUTED)
		return
	if not _rules_ok():
		_quote_label.text = tr("ROUTE_RULE_TWICE")
		_quote_label.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		return
	if _quote_error != null:
		_quote_label.text = ErrorText.describe(_quote_error, self)
		_quote_label.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		return
	if _quote == null:
		_quote_label.text = tr("ROUTE_QUOTE_CHECKING")
		_quote_label.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		return
	_quote_label.text = quote_text(_quote, _draft, _fleet, self)
	_quote_label.add_theme_color_override("font_color", AppTheme.COLOR_OK if _quote.ok else AppTheme.COLOR_DANGER)


## What a quote says: whether the route can start (or every reason why not), its kind, the stop
## sites and the first trip with its fuel.
static func quote_text(quote: RoutePlan.Quote, draft: RoutePlan.Draft, fleet: FleetModel, translator: Object) -> String:
	var lines := PackedStringArray()
	if quote.ok:
		lines.append(translator.tr("ROUTE_QUOTE_OK"))
	else:
		var seen: Dictionary = {}
		for code: String in quote.errors:
			var text := RouteList.code_text(code, translator)
			if not seen.has(text):
				seen[text] = true
				lines.append(text)
		if quote.errors.is_empty():
			lines.append(translator.tr("ROUTE_QUOTE_REFUSED"))
	if not quote.kind.is_empty():
		lines.append(translator.tr("ROUTE_QUOTE_KIND").format({
			"kind": translator.tr("ROUTE_KIND_SHIP") if quote.kind == RoutePlan.KIND_SHIP else translator.tr("ROUTE_KIND_GROUND")}))
	for letter: String in [RoutePlan.A, RoutePlan.B]:
		var has := quote.has_stop_a if letter == RoutePlan.A else quote.has_stop_b
		var stop := quote.stop_a if letter == RoutePlan.A else quote.stop_b
		var station_name := RouteList.structure_name(fleet, draft.station_id(letter), translator)
		if has:
			lines.append(translator.tr("ROUTE_QUOTE_STOP").format({"station": station_name, "x": stop.x, "y": stop.y}))
		elif quote.kind == RoutePlan.KIND_SHIP:
			lines.append(translator.tr("ROUTE_QUOTE_ORBIT").format({"station": station_name}))
	if quote.has_trip:
		var first := quote.start_at if not quote.start_at.is_empty() else RoutePlan.A
		lines.append(translator.tr("ROUTE_QUOTE_TRIP").format({
			"station": RouteList.structure_name(fleet, draft.station_id(first), translator),
			"duration": TimeFormat.duration(quote.trip_ms)}))
		var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
		for row: Array in quote.fuel:
			var key: String = row[0]
			var need: int = row[1]
			var have: int = row[2]
			var cargo: int = row[3]
			@warning_ignore("integer_division")
			var text: String = translator.tr("ROUTE_QUOTE_FUEL").format({"count": AmountFormat.units(ceili(need / float(scale))),
				"item": RouteList.item_name(key, translator), "have": AmountFormat.units(have / scale)})
			if have < need and cargo > 0:
				text += " " + translator.tr("ROUTE_QUOTE_FUEL_IN_CARGO")
			lines.append(text)
	return "\n".join(lines)


func _update_action() -> void:
	if is_new():
		_action.disabled = _busy or _quote == null or not _quote.ok or not _draft.is_complete() or not _rules_ok()
	else:
		var changed := not RoutePlan.same_rules(_draft.rules_ab, _original_ab) \
			or not RoutePlan.same_rules(_draft.rules_ba, _original_ba) \
			or (not RoutePlan.clean_name(_draft.name).is_empty() and RoutePlan.clean_name(_draft.name) != _original_name)
		_action.disabled = _busy or not changed or not _rules_ok()


func _on_action() -> void:
	if _busy:
		return
	_busy = true
	_update_action()
	var result: ApiResult
	if is_new():
		result = await _fleet.routes.create(_draft)
	else:
		var renamed := RoutePlan.clean_name(_draft.name)
		result = await _fleet.routes.update_rules(_route_id, _draft.rules_ab, _draft.rules_ba,
			renamed if renamed != _original_name else "")
	_busy = false
	if result.is_ok():
		saved.emit(Wire.as_int(result.data.get("routeId")))
		return
	_show_result(ErrorText.describe(result.error, self), AppTheme.COLOR_DANGER)
	_update_action()


func _show_result(text: String, color: Color) -> void:
	_result.text = text
	_result.add_theme_color_override("font_color", color)
	_result.visible = true
