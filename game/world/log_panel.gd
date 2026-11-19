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
	await _name_travel_places(page.entries)
	if not is_inside_tree():
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
		"corePlaced":
			return tr("LOG_CORE_PLACED")
		"intentFallback":
			return tr("LOG_INTENT_FALLBACK")
		"stanceSet":
			return tr("LOG_STANCE_SET")
		"combatWarning":
			return tr("LOG_COMBAT_WARNING")
		"combatStarted":
			return tr("LOG_COMBAT_STARTED")
		"combatEnded":
			return tr("LOG_COMBAT_ENDED")
		"hullDestroyed":
			return tr("LOG_HULL_DESTROYED")
		"captured":
			return tr("LOG_CAPTURED")
		"hullRepaired":
			return tr("LOG_HULL_REPAIRED")
		"travelStarted":
			return _travel_started(fields)
		"travelArrived":
			return _travel_arrived(fields)
		"travelBlocked":
			return _travel_blocked(fields)
		"routeArrived":
			return tr("LOG_ROUTE_ARRIVED")
		"routeDeparted":
			return tr("LOG_ROUTE_DEPARTED")
		"routeStalled":
			return tr("LOG_ROUTE_STALLED")
		"routePaused":
			return tr("LOG_ROUTE_PAUSED")
		"routeDeleted":
			return tr("LOG_ROUTE_DELETED")
		"routeTransfer":
			return tr("LOG_ROUTE_TRANSFER")
		"routeFuelPaid":
			return tr("LOG_ROUTE_FUEL_PAID")
		"telescopeObserved":
			return tr("LOG_TELESCOPE_OBSERVED")
		"telescopeUpgradeStarted":
			return tr("LOG_TELESCOPE_UPGRADE_STARTED")
		"telescopeUpgraded":
			return tr("LOG_TELESCOPE_UPGRADED")
	return ""


## Names of bodies and own structures that trips mention ("body:<id>" / "structure:<id>" →
## name), kept for the session.
static var _travel_names: Dictionary = {}


## Looks up the names of the places the trips of a page mention that are not known yet.
func _name_travel_places(entries: Array[StructureLog.Entry]) -> void:
	for entry: StructureLog.Entry in entries:
		if not entry.type.begins_with("travel"):
			continue
		var body := Wire.as_string(entry.fields.get("bodyId"))
		if not body.is_empty() and not _travel_names.has("body:" + body):
			var answer := await Services.api.get_json("/v2/bodies/" + body.uri_encode())
			if answer.is_ok():
				_travel_names["body:" + body] = Wire.as_string(answer.data.get("name"))
		var host := Wire.as_int(entry.fields.get("hostId"))
		if host != 0 and not _travel_names.has("structure:%d" % host):
			var answer := await Services.api.get_json("/v2/structures/%d" % host)
			if answer.is_ok():
				_travel_names["structure:%d" % host] = Wire.as_string(answer.data.get("name"))


func _travel_place(fields: Dictionary, kind: String) -> String:
	var key := "body:" + Wire.as_string(fields.get("bodyId")) if kind == "body" else "structure:%d" % Wire.as_int(fields.get("hostId"))
	var known := Wire.as_string(_travel_names.get(key))
	return known if not known.is_empty() else tr("LOG_SOMETHING")


## "Set off for …" with the target and the fuel taken for the trip.
func _travel_started(fields: Dictionary) -> String:
	var text := tr("LOG_TRAVEL_STARTED")
	match Wire.as_string(fields.get("target")):
		"orbit":
			text = tr("LOG_TRAVEL_STARTED_ORBIT").format({"body": _travel_place(fields, "body")})
		"surface":
			text = tr("LOG_TRAVEL_STARTED_SURFACE").format({"body": _travel_place(fields, "body"),
				"x": Wire.as_int(fields.get("x")), "y": Wire.as_int(fields.get("y"))})
		"dock":
			text = tr("LOG_TRAVEL_STARTED_DOCK").format({"host": _travel_place(fields, "host")})
	var fuel: Array[Array] = []
	if typeof(fields.get("fuel")) == TYPE_ARRAY:
		var rows: Array = fields.get("fuel")
		for value: Variant in rows:
			var row := Wire.as_dict(value)
			fuel.append([Wire.as_string(row.get("resource")), Wire.as_int(row.get("amount"))])
	if not fuel.is_empty():
		text += " " + tr("LOG_TRAVEL_FUEL").format({"items": _items(fuel)})
	return text


func _travel_arrived(fields: Dictionary) -> String:
	match Wire.as_string(fields.get("anchor")):
		"orbit":
			return tr("LOG_TRAVEL_ARRIVED_ORBIT").format({"body": _travel_place(fields, "body")})
		"surface":
			return tr("LOG_TRAVEL_ARRIVED_SURFACE").format({"body": _travel_place(fields, "body")})
		"docked":
			return tr("LOG_TRAVEL_ARRIVED_DOCKED").format({"host": _travel_place(fields, "host")})
	return tr("LOG_TRAVEL_ARRIVED")


func _travel_blocked(fields: Dictionary) -> String:
	var reason := ApiError.new()
	reason.code = Wire.as_string(fields.get("reason"))
	return tr("LOG_TRAVEL_BLOCKED_REASON").format({"reason": ErrorText.describe(reason, self),
		"body": _travel_place(fields, "body")})


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
