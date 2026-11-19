class_name ProductionPanel
extends ScrollContainer
## The Production tab of the structure details, built around the balance of the rate solution
## (ProductionBalance): a short supply summary (energy, life support and how many inhabitants it
## carries, inhabitants per tier, staff), then a table of every resource that moves — made, used
## and net per hour, short ones first in red with the time until the stock runs empty — and the
## module types with what runs and what stands still. A tap on a resource opens which module
## types make and use it. The server decides; this only shows its answer.

## Filter of the resource table.
enum Filter { ALL, SHORT }

## Width of a number column of the table (canvas px).
const NUMBER_WIDTH := 112
## Below this a running-empty time is amber (one day).
const SOON_MS := 24 * 3600000
## Indent of a resource's makers and users under its row.
const DETAIL_INDENT := 24
## The resource icon left of a row (a little smaller than in other lists: the numbers need room)
## and its gap to the name.
const ICON_SIZE := 40
const ICON_GAP := 10

var _structure: ColonyModel
var _filter: Filter = Filter.ALL
## Resource → true for the rows that are open.
var _open: Dictionary = {}
## The time-to-empty labels to count down: [Label, ProductionBalance.Row].
var _countdowns: Array[Array] = []

var _column: VBoxContainer


func setup(structure: ColonyModel) -> void:
	_structure = structure


func _ready() -> void:
	horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_column = Ui.column(20)
	add_child(_column)


## Builds the page again from the structure's last rate solution.
func reload() -> void:
	if _column == null:
		return
	for child: Node in _column.get_children():
		child.queue_free()
	_countdowns.clear()
	if Services.definitions == null or not _structure.production_known():
		if _structure.production_error != null:
			_add_error(_column)
		else:
			_column.add_child(Ui.label("COMMON_LOADING", AppTheme.VARIATION_MUTED))
		return
	if _structure.production_error != null:
		_add_error(_column)
	_add_supply()
	_add_resources()
	_add_modules()


## Counts the running-empty times down (once a second).
func tick() -> void:
	for entry: Array in _countdowns:
		var label := entry[0] as Label
		var row := entry[1] as ProductionBalance.Row
		if is_instance_valid(label):
			_paint_note(label, row)


## Shows the table filtered (for the chips and review scenes).
func set_filter(filter: Filter) -> void:
	_filter = filter
	reload()


## Opens or closes the makers and users of a resource.
func set_open(resource: String, on: bool) -> void:
	if on:
		_open[resource] = true
	else:
		_open.erase(resource)
	reload()


func _add_error(parent: Control) -> void:
	var line := Ui.dynamic_label()
	line.text = tr("DETAILS_PRODUCTION_FAILED") + " " + ErrorText.describe(_structure.production_error, self)
	line.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	parent.add_child(line)
	var retry := Ui.secondary_button("COMMON_RETRY")
	retry.pressed.connect(func() -> void: _structure.reload_production())
	parent.add_child(retry)


## A titled panel; returns the container for its rows.
func _section(title_key: String) -> VBoxContainer:
	var panel := PanelContainer.new()
	_column.add_child(panel)
	var rows := Ui.column(10)
	panel.add_child(rows)
	rows.add_child(Ui.label(title_key, AppTheme.VARIATION_MUTED))
	return rows


# --- supply ---------------------------------------------------------------------------------

func _add_supply() -> void:
	var structure := _structure
	var box := _section("DETAILS_BALANCE")
	var scale := Services.definitions.fixed_point_scale if Services.definitions.fixed_point_scale > 0 else 1000000
	@warning_ignore("integer_division")
	var power := _line(box, tr("STORE_POWER").format({"production": AmountFormat.units(structure.power[0] / scale),
		"consumption": AmountFormat.units(structure.power[1] / scale)}))
	if structure.power[1] > structure.power[0]:
		power.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	@warning_ignore("integer_division")
	var life := _line(box, tr("STORE_LIFE_SUPPORT").format({"production": AmountFormat.units(structure.life_support[0] / scale),
		"consumption": AmountFormat.units(structure.life_support[1] / scale)}))
	if structure.life_support[1] > structure.life_support[0]:
		life.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	var people := 0
	var tiers := PackedStringArray()
	for tier: int in structure.population.size():
		var count: int = structure.population[tier]
		people += count
		if count > 0:
			tiers.append(tr("DETAILS_POPULATION_TIER").format({"tier": tier + 1, "count": AmountFormat.units(count)}))
	if people == 0:
		_line(box, tr("DETAILS_POPULATION_NONE"), AppTheme.VARIATION_MUTED)
	else:
		var percent := floori(structure.life_support_coverage / 10000.0)
		var carried := _line(box, tr("DETAILS_POPULATION").format({"tiers": " · ".join(tiers), "percent": percent}))
		if structure.life_support_coverage < 1000000:
			carried.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	var workforce := structure.workforce
	if workforce.needed_total() > 0:
		var staff := _line(box, tr("DETAILS_STAFF").format({"assigned": workforce.assigned_total(),
			"needed": workforce.needed_total()}), AppTheme.VARIATION_MUTED)
		if workforce.assigned_total() < workforce.needed_total():
			staff.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	if structure.food_shortage:
		_line(box, tr("STORE_FOOD_SHORTAGE")).add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	if structure.storage_full:
		_line(box, tr("STORE_FULL")).add_theme_color_override("font_color", AppTheme.COLOR_PENDING)


func _line(parent: Control, text: String, variation: String = "") -> Label:
	var label := Ui.dynamic_label(variation)
	label.text = text
	parent.add_child(label)
	return label


# --- resources ------------------------------------------------------------------------------

func _add_resources() -> void:
	var box := _section("DETAILS_RESOURCES")
	var rows := ProductionBalance.sorted(_structure.totals, _names(_structure.totals))
	if rows.is_empty():
		box.add_child(Ui.label("DETAILS_RESOURCES_EMPTY", AppTheme.VARIATION_MUTED))
		return
	var short := ProductionBalance.short(rows)
	var chips := HBoxContainer.new()
	chips.add_theme_constant_override("separation", 12)
	box.add_child(chips)
	var group := ButtonGroup.new()
	for entry: Array in [[Filter.ALL, tr("DETAILS_FILTER_ALL").format({"count": rows.size()})],
			[Filter.SHORT, tr("DETAILS_FILTER_SHORT").format({"count": short.size()})]]:
		var filter: Filter = entry[0]
		var chip := Ui.tab_button("", group)
		chip.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		chip.text = entry[1]
		chip.button_pressed = filter == _filter
		chip.pressed.connect(set_filter.bind(filter))
		chips.add_child(chip)
	var shown := short if _filter == Filter.SHORT else rows
	if shown.is_empty():
		box.add_child(Ui.label("DETAILS_RESOURCES_NONE_SHORT", AppTheme.VARIATION_MUTED))
		return
	var heads: Array[String] = [tr("DETAILS_COLUMN_MADE"), tr("DETAILS_COLUMN_USED"), tr("DETAILS_COLUMN_NET")]
	var head := _cells(tr("DETAILS_COLUMN_RESOURCE"), heads, AppTheme.COLOR_MUTED)
	(head.get_child(0) as Label).add_theme_font_size_override("font_size", AppTheme.FONT_SIZE_SMALL)
	# Indented like the rows' content, so the columns line up.
	var head_margin := MarginContainer.new()
	head_margin.add_theme_constant_override("margin_left", 16 + ICON_SIZE + ICON_GAP)
	head_margin.add_theme_constant_override("margin_right", 16)
	head_margin.add_child(head)
	box.add_child(head_margin)
	for row: ProductionBalance.Row in shown:
		_add_resource_row(box, row)


func _names(rows: Array[ProductionBalance.Row]) -> Dictionary:
	var names: Dictionary = {}
	for row: ProductionBalance.Row in rows:
		names[row.resource] = _resource_name(row.resource)
	return names


func _resource_name(key: String) -> String:
	var name := Services.definitions.resource_name(key)
	return name if not name.is_empty() else tr("STORE_UNKNOWN_ITEM")


## A line of the table: the name and three right-aligned numbers.
func _cells(name: String, numbers: Array[String], color: Color, net_color: Color = Color(0, 0, 0, 0)) -> HBoxContainer:
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 8)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var name_label := _cell_label(name, color)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_label.clip_text = true
	line.add_child(name_label)
	for index: int in numbers.size():
		var paint := net_color if index == numbers.size() - 1 and net_color.a > 0.0 else color
		var number := _cell_label(numbers[index], paint)
		number.custom_minimum_size = Vector2(NUMBER_WIDTH, 0)
		number.size_flags_horizontal = Control.SIZE_FILL
		number.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		number.add_theme_font_size_override("font_size", AppTheme.FONT_SIZE_SMALL)
		line.add_child(number)
	return line


func _cell_label(text: String, color: Color) -> Label:
	var label := Ui.dynamic_label()
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_color_override("font_color", color)
	return label


func _add_resource_row(parent: Control, row: ProductionBalance.Row) -> void:
	var open := _open.has(row.resource)
	var button := ListButton.new()
	button.tapped.connect(set_open.bind(row.resource, not open))
	parent.add_child(button)
	# The icon of the resource left of its name and numbers.
	var line := HBoxContainer.new()
	line.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	line.offset_left = 16
	line.offset_right = -16
	line.add_theme_constant_override("separation", ICON_GAP)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(line)
	line.add_child(Ui.resource_icon(row.resource, ICON_SIZE, true))
	var content := VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.alignment = BoxContainer.ALIGNMENT_CENTER
	content.add_theme_constant_override("separation", 0)
	content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	line.add_child(content)
	var net_color := AppTheme.COLOR_MUTED
	match row.state():
		ProductionBalance.State.SHORT:
			net_color = AppTheme.COLOR_DANGER
		ProductionBalance.State.SURPLUS:
			net_color = AppTheme.COLOR_OK
	var numbers: Array[String] = [_amount(row.produced), _amount(row.consumed), _net(row.net)]
	content.add_child(_cells(_resource_name(row.resource), numbers, AppTheme.COLOR_TEXT, net_color))
	var note := _cell_label("", AppTheme.COLOR_MUTED)
	note.add_theme_font_size_override("font_size", AppTheme.FONT_SIZE_SMALL)
	content.add_child(note)
	_paint_note(note, row)
	if row.state() == ProductionBalance.State.SHORT:
		_countdowns.append([note, row])
	if open:
		_add_uses(parent, row)


## Per hour as whole or tenth units without sign: "78", "0.5"; "0" at rest.
func _amount(micro_per_hour: int) -> String:
	var text := AmountFormat.rate(absi(micro_per_hour), _scale()).trim_prefix("+").trim_suffix("/h")
	return text if not text.is_empty() else "0"


## The change of the stock with its sign: "+78", "−3"; "±0" when balanced.
func _net(micro_per_hour: int) -> String:
	var text := AmountFormat.rate(micro_per_hour, _scale()).trim_suffix("/h")
	return text if not text.is_empty() else "±0"


func _scale() -> int:
	return Services.definitions.fixed_point_scale if Services.definitions.fixed_point_scale > 0 else 1000000


## The small line under a resource: when a shrinking stock runs empty, and the tax.
func _paint_note(label: Label, row: ProductionBalance.Row) -> void:
	var parts := PackedStringArray()
	var color := AppTheme.COLOR_MUTED
	if row.state() == ProductionBalance.State.SHORT and _structure.inventory != null:
		var flow := _structure.inventory.flow(row.resource)
		var stock := flow.amount_at(Services.clock.now_ms()) if flow != null else 0
		var left := ProductionBalance.ms_to_empty(stock, row.net)
		if left == 0:
			parts.append(tr("DETAILS_EMPTY_NOW"))
			color = AppTheme.COLOR_DANGER
		else:
			parts.append(tr("DETAILS_EMPTY_IN").format({"time": TimeFormat.duration(left)}))
			if left < SOON_MS:
				color = AppTheme.COLOR_PENDING
	if row.taxed > 0:
		parts.append(tr("DETAILS_TAXED").format({"rate": _amount(row.taxed)}))
	label.text = " · ".join(parts)
	label.visible = not parts.is_empty()
	label.add_theme_color_override("font_color", color)


## Under an open resource: the module types that make and use it, and what the inhabitants eat.
func _add_uses(parent: Control, row: ProductionBalance.Row) -> void:
	var indent := MarginContainer.new()
	indent.add_theme_constant_override("margin_left", DETAIL_INDENT)
	parent.add_child(indent)
	var lines := Ui.column(4)
	indent.add_child(lines)
	var flows := _structure.production_flows
	var made := ProductionBalance.uses(flows, row.resource, false)
	var used := ProductionBalance.uses(flows, row.resource, true)
	var other := ProductionBalance.other_use(row, flows)
	if made.is_empty() and used.is_empty() and other == 0:
		_line(lines, tr("DETAILS_USES_NONE"), AppTheme.VARIATION_MUTED)
		return
	for entry: Array in [["DETAILS_MADE_BY", made], ["DETAILS_USED_BY", used]]:
		var raw: Array = entry[1]
		var list: Array[ProductionBalance.Use] = []
		list.assign(raw)
		for use: ProductionBalance.Use in list:
			var module_def := Services.definitions.module(use.module_type)
			var type_name := module_def.display_name if module_def != null else tr("STORE_UNKNOWN_ITEM")
			_line(lines, tr(Wire.as_string(entry[0])).format({"name": type_name, "count": use.modules,
				"rate": _amount(use.rate)}), AppTheme.VARIATION_MUTED)
	if other > 0:
		_line(lines, tr("DETAILS_USED_BY_PEOPLE").format({"rate": _amount(other)}), AppTheme.VARIATION_MUTED)


# --- modules --------------------------------------------------------------------------------

func _add_modules() -> void:
	var modules := _section("DETAILS_MODULES")
	var rows := _type_rows()
	if rows.is_empty():
		modules.add_child(Ui.label("DETAILS_NO_MODULES", AppTheme.VARIATION_MUTED))
	for row: Dictionary in rows:
		var name_label := Ui.dynamic_label()
		name_label.text = tr("DETAILS_TYPE_COUNT").format({"name": row.get("name"), "count": row.get("count")})
		modules.add_child(name_label)
		var line := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
		var parts := PackedStringArray()
		var running: int = row.get("running")
		var activity: float = row.get("activity")
		if running > 0:
			parts.append(tr("DETAILS_RUNNING").format({"percent": roundi(activity / running * 100.0)}))
		var building: int = row.get("building")
		if building > 0:
			parts.append(tr("DETAILS_BUILDING").format({"count": building}))
		var idle: Dictionary = row.get("idle")
		for reason: String in idle.keys():
			parts.append(_idle_text(reason, Wire.as_int(idle.get(reason))))
		line.text = " · ".join(parts)
		if not idle.is_empty():
			line.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		modules.add_child(line)


## One entry per module type: name, count, running ones with their summed activity, modules
## under construction and idle ones by reason; sorted by name.
func _type_rows() -> Array[Dictionary]:
	var by_type: Dictionary = {}
	var now := Services.clock.now_ms()
	for placed: StructureLayout.Module in _structure.layout.modules():
		var row: Dictionary = by_type.get(placed.module_type, {})
		if row.is_empty():
			var module_def := Services.definitions.module(placed.module_type)
			row = {"name": module_def.display_name if module_def != null else tr("STORE_UNKNOWN_ITEM"),
				"count": 0, "running": 0, "activity": 0.0, "building": 0, "idle": {}}
			by_type[placed.module_type] = row
		row["count"] = Wire.as_int(row.get("count")) + 1
		if placed.is_building() and placed.completes_at > now:
			row["building"] = Wire.as_int(row.get("building")) + 1
			continue
		var reason := Wire.as_string(_structure.idle_reasons.get(placed.module_id))
		if not reason.is_empty():
			var idle: Dictionary = row.get("idle")
			idle[reason] = Wire.as_int(idle.get(reason)) + 1
			continue
		row["running"] = Wire.as_int(row.get("running")) + 1
		var sum: float = row.get("activity")
		row["activity"] = sum + _structure.module_activity(placed)
	var result: Array[Dictionary] = []
	for row: Dictionary in by_type.values():
		result.append(row)
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return Wire.as_string(a.get("name")).naturalnocasecmp_to(Wire.as_string(b.get("name"))) < 0)
	return result


func _idle_text(reason: String, count: int) -> String:
	match reason:
		"NO_BLUEPRINT":
			return tr("DETAILS_IDLE_NO_RECIPE").format({"count": count})
		"LOCATION":
			return tr("DETAILS_IDLE_LOCATION").format({"count": count})
	return tr("DETAILS_IDLE_OTHER").format({"count": count})
