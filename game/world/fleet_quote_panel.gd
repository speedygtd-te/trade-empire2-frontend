class_name FleetQuotePanel
extends VBoxContainer
## The quote of a joint flight into an orbit (`POST /v2/fleets/{id}/travel/quote`) and the way to
## start it: the shared phases and arrival, who sets the pace and the launch, the fuel the fleet
## needs against what all its ships carry (the shared supply, red when short), what each ship
## gives, and every broken rule — the fleet's and each ship's — as a sentence. Starting is
## two-step, with the note that a flight cannot be cancelled. An answer to an older question is
## dropped.

## The flight started (the fleet model has its command and the members' trips).
signal started

var _model: FleetModel
var _fleet_id := 0
var _body_id := ""
var _quote: FleetGroups.Quote = null
var _asked := 0
var _busy := false
var _armed := false
## Why the last start failed (translated, one line per reason); cleared by a new target.
var _failure := PackedStringArray()

var _lines: VBoxContainer
var _note: Label
var _start: Button


func setup(model: FleetModel, fleet_id: int) -> void:
	_model = model
	_fleet_id = fleet_id


func _ready() -> void:
	add_theme_constant_override("separation", 10)
	_lines = Ui.column(6)
	add_child(_lines)
	_note = Ui.label("TRAVEL_NO_CANCEL", AppTheme.VARIATION_MUTED)
	_note.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	add_child(_note)
	_start = Ui.primary_button("FLEETS_START")
	_start.pressed.connect(_on_start)
	add_child(_start)
	_show()


## Asks for the quote of a flight into the orbit of `body_id`.
func ask(body_id: String) -> void:
	if body_id != _body_id:
		_failure.clear()
	_body_id = body_id
	_quote = null
	_armed = false
	_show()
	_asked += 1
	var mine := _asked
	var answer := await _model.quote_group_travel(_fleet_id, body_id)
	if mine != _asked or not is_inside_tree():
		return
	if not answer.is_ok():
		_quote = null
		_show_error(ErrorText.describe(answer.error, self))
		return
	_quote = FleetGroups.Quote.from_wire(answer.data)
	_show()


## The last quote; null while there is none.
func quote() -> FleetGroups.Quote:
	return _quote


func _show() -> void:
	if _lines == null:
		return
	for child: Node in _lines.get_children():
		child.queue_free()
	_start.disabled = true
	_start.text = tr("FLEETS_START")
	_note.visible = false
	if _body_id.is_empty():
		return
	for line: String in _failure:
		_line(line, AppTheme.COLOR_DANGER)
	if _quote == null:
		_line(tr("TRAVEL_QUOTE_LOADING"), AppTheme.COLOR_MUTED)
		return
	var trip := _quote.trip
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	_line(TravelQuotePanel.phase_line(trip, false, self), AppTheme.COLOR_TEXT)
	_line(tr("TRAVEL_ARRIVAL").format({"duration": TimeFormat.duration(trip.total_ms())}), AppTheme.COLOR_TEXT)
	if trip.distance_nly > 0:
		_line(tr("TRAVEL_DISTANCE").format({"ly": TravelQuotePanel.light_years(trip.distance_nly)}), AppTheme.COLOR_MUTED)
	if trip.interstellar:
		_line(tr("TRAVEL_INTERSTELLAR"), AppTheme.COLOR_PENDING)
	var pace := PackedStringArray()
	if _quote.longest_launch != 0 and _quote.members.size() > 1:
		pace.append(tr("FLEETS_LAUNCH_SET_BY").format({"name": _member_name(_quote.longest_launch)}))
	if _quote.slowest != 0 and _quote.members.size() > 1 and trip.cruise_ms() > 0:
		pace.append(tr("FLEETS_PACE_SET_BY").format({"name": _member_name(_quote.slowest), "warp": trip.warp_level}))
	if not pace.is_empty():
		_line(" · ".join(pace), AppTheme.COLOR_MUTED)
	for row: TravelPlan.FuelRow in trip.fuel:
		_line(tr("FLEETS_FUEL").format({"resource": _resource_name(row.resource),
			"amount": _whole(row.amount, scale), "on_board": _whole(row.self_use, scale)}),
			AppTheme.COLOR_DANGER if row.is_short() else AppTheme.COLOR_OK)
	for code: String in trip.errors:
		_line(_error(code), AppTheme.COLOR_DANGER)
	for member: FleetGroups.MemberQuote in _quote.members:
		if not member.errors.is_empty():
			var reasons := PackedStringArray()
			for code: String in member.errors:
				reasons.append(_error(code))
			_line(tr("FLEETS_MEMBER_BLOCKED").format({"name": _member_name(member.structure_id),
				"reasons": " ".join(reasons)}), AppTheme.COLOR_DANGER)
		elif not member.draw.is_empty() or not member.need.is_empty():
			_line(tr("FLEETS_MEMBER_DRAW").format({"name": _member_name(member.structure_id),
				"rows": _amounts(member.draw, scale)}), AppTheme.COLOR_MUTED)
	_note.visible = trip.ok
	_start.disabled = _busy or not trip.ok
	_start.text = tr("TRAVEL_CONFIRM_START") if _armed else tr("FLEETS_START")


func _show_error(text: String) -> void:
	for child: Node in _lines.get_children():
		child.queue_free()
	_line(tr("TRAVEL_QUOTE_FAILED"), AppTheme.COLOR_DANGER)
	_line(text, AppTheme.COLOR_DANGER)
	_note.visible = false
	_start.disabled = true


func _on_start() -> void:
	if _busy or _quote == null or not _quote.trip.ok:
		return
	if not _armed:
		_armed = true
		_show()
		return
	_armed = false
	_busy = true
	_start.disabled = true
	_start.text = tr("TRAVEL_STARTING")
	var answer := await _model.start_group_travel(_fleet_id, _body_id)
	_busy = false
	if not is_inside_tree():
		return
	if answer.is_ok():
		_failure.clear()
		started.emit()
		return
	# Something changed since the quote: say why (each ship that keeps the fleet down) and ask again.
	_failure = PackedStringArray([ErrorText.describe(answer.error, self)])
	var blocked := FleetGroups.not_ready_members(answer.error)
	for id: int in blocked.keys():
		var reasons := PackedStringArray()
		var codes: PackedStringArray = blocked[id]
		for code: String in codes:
			reasons.append(_error(code))
		_failure.append(tr("FLEETS_MEMBER_BLOCKED").format({"name": _member_name(id), "reasons": " ".join(reasons)}))
	ask(_body_id)


func _member_name(structure_id: int) -> String:
	var group := _model.groups.find(_fleet_id)
	var member := group.member(structure_id) if group != null else null
	if member != null and not member.name.is_empty():
		return member.name
	var entry := _model.fleet.find(structure_id)
	return entry.name if entry != null else tr("FLEET_UNKNOWN_PLACE")


func _amounts(amounts: Dictionary, scale: int) -> String:
	if amounts.is_empty():
		return tr("FLEETS_DRAWS_NOTHING")
	var parts := PackedStringArray()
	for resource: String in amounts.keys():
		parts.append("%s %s" % [_whole(Wire.as_int(amounts[resource]), scale), _resource_name(resource)])
	return ", ".join(parts)


func _error(code: String) -> String:
	var error := ApiError.new()
	error.code = code
	return ErrorText.describe(error, self)


static func _whole(value: int, scale: int) -> String:
	return AmountFormat.amount(value, scale)


func _line(text: String, color: Color) -> void:
	var label := Ui.dynamic_label()
	label.text = text
	label.add_theme_font_size_override("font_size", AppTheme.FONT_SIZE_SMALL)
	if color != AppTheme.COLOR_TEXT:
		label.add_theme_color_override("font_color", color)
	_lines.add_child(label)


func _resource_name(key: String) -> String:
	var shown := Services.definitions.resource_name(key) if Services.definitions != null else ""
	return shown if not shown.is_empty() else tr("STORE_UNKNOWN_ITEM")
