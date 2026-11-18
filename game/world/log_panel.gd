class_name LogPanel
extends VBoxContainer
## The colony's log: what happened, newest first, with how long ago. Older pages load on
## request. Entry types the client does not know yet are left out (new types are not breaking).

const LIST_HEIGHT := 520
const PAGE := 50

var _model: ColonyModel
var _list: VBoxContainer
var _older: Button
var _empty: Label
var _oldest_seq := 0
var _loading := false


func setup(model: ColonyModel) -> void:
	_model = model


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(0, LIST_HEIGHT)
	add_child(scroll)
	_list = Ui.column(14)
	scroll.add_child(_list)
	_empty = Ui.label("LOG_EMPTY", AppTheme.VARIATION_MUTED)
	_empty.visible = false
	add_child(_empty)
	_older = Ui.secondary_button("LOG_OLDER")
	_older.visible = false
	_older.pressed.connect(_load_older)
	add_child(_older)


## Loads the newest page (again).
func reload() -> void:
	for child: Node in _list.get_children():
		child.queue_free()
	_oldest_seq = 0
	await _load_page("?limit=%d" % PAGE)


func _load_older() -> void:
	if _oldest_seq > 0:
		await _load_page("?limit=%d&before=%d" % [PAGE, _oldest_seq])


func _load_page(query: String) -> void:
	if _loading or _model == null or _model.structure_id == 0:
		return
	_loading = true
	var answer := await Services.api.get_ndjson("/v2/structures/%d/logs%s" % [_model.structure_id, query])
	_loading = false
	var page := StructureLog.from_stream(answer.stream) if answer.is_ok() else null
	if page == null:
		_empty.visible = true
		_empty.text = ErrorText.describe(answer.error, self) if answer.error != null else tr("LOG_EMPTY")
		return
	var now := Services.clock.now_ms()
	for entry: StructureLog.Entry in page.entries:
		var text := describe(entry)
		if text.is_empty():
			continue
		var row := Ui.column(2)
		var what := Ui.dynamic_label()
		what.text = text
		row.add_child(what)
		var when := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
		when.text = tr("LOG_AGO").format({"duration": TimeFormat.duration(maxi(now - entry.game_time_ms, 0))})
		row.add_child(when)
		_list.add_child(row)
	if not page.entries.is_empty():
		_oldest_seq = page.oldest_seq()
	_older.visible = page.more
	_empty.text = tr("LOG_EMPTY")
	_empty.visible = _list.get_child_count() == 0 and page.entries.is_empty()


## The sentence for one entry; "" for types the client does not know.
func describe(entry: StructureLog.Entry) -> String:
	var fields := entry.fields
	var module_name := _module_name(Wire.as_string(fields.get("moduleType")))
	var recipe := _recipe_name(Wire.as_string(fields.get("blueprint")))
	var items := _items(StructureLog.items_of(entry))
	match entry.type:
		"founded":
			return tr("LOG_FOUNDED")
		"merged":
			return tr("LOG_MERGED")
		"guestAdded":
			return tr("LOG_GUEST_ADDED")
		"guestRemoved":
			return tr("LOG_GUEST_REMOVED")
		"hullsPlaced":
			return tr("LOG_HULLS_PLACED").format({"hulls": _hulls(Wire.as_dict(fields.get("hulls")))})
		"hullsRemoved":
			return tr("LOG_HULLS_REMOVED").format({"hulls": _hulls(Wire.as_dict(fields.get("hulls")))})
		"modulePlaced":
			return tr("LOG_MODULE_PLACED").format({"module": module_name})
		"moduleRemoved":
			return tr("LOG_MODULE_REMOVED").format({"module": module_name})
		"moduleCompleted":
			return tr("LOG_MODULE_COMPLETED").format({"module": module_name})
		"blueprintSet", "defaultBlueprintSet":
			if recipe.is_empty():
				return tr("LOG_RECIPE_REMOVED").format({"module": module_name})
			return tr("LOG_RECIPE_SET").format({"module": module_name, "recipe": recipe})
		"shaftExtended":
			return tr("LOG_SHAFT_EXTENDED").format({"floors": Wire.as_int(fields.get("floors"))})
		"transferIn":
			return tr("LOG_TRANSFER_IN").format({"items": items})
		"transferOut":
			return tr("LOG_TRANSFER_OUT").format({"items": items})
		"discarded":
			return tr("LOG_DISCARDED").format({"items": items})
		"granted":
			return tr("LOG_GRANTED").format({"items": items})
		"capSet":
			return tr("LOG_CAP_SET").format({"resource": _resource_name(Wire.as_string(fields.get("resource")))})
		"workforceSet":
			return tr("LOG_WORKFORCE_SET")
		"labSlotsSet":
			return tr("LOG_LAB_SLOTS_SET")
		"researchCompleted":
			return tr("LOG_RESEARCH_COMPLETED")
	return ""


func _module_name(key: String) -> String:
	var module_def := Services.definitions.module(key) if Services.definitions != null else null
	return module_def.display_name if module_def != null else tr("LOG_SOMETHING")


func _recipe_name(key: String) -> String:
	if key.is_empty():
		return ""
	var recipe := Services.definitions.blueprint(key) if Services.definitions != null else null
	return recipe.display_name if recipe != null else tr("LOG_SOMETHING")


func _resource_name(key: String) -> String:
	var shown := Services.definitions.resource_name(key) if Services.definitions != null else ""
	return shown if not shown.is_empty() else tr("STORE_UNKNOWN_ITEM")


func _items(items: Array[Array]) -> String:
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	var parts := PackedStringArray()
	for item: Array in items:
		var key: String = item[0]
		var amount: int = item[1]
		@warning_ignore("integer_division")
		parts.append("%s %s" % [AmountFormat.units(amount / maxi(scale, 1)), _resource_name(key)])
	return ", ".join(parts)


func _hulls(counts: Dictionary) -> String:
	var parts := PackedStringArray()
	for key: String in counts.keys():
		var hull := Services.definitions.hull(key) if Services.definitions != null else null
		var shown := hull.display_name if hull != null else tr("LOG_SOMETHING")
		parts.append("%d %s" % [Wire.as_int(counts[key]), shown])
	return ", ".join(parts)
