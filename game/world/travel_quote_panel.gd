class_name TravelQuotePanel
extends VBoxContainer
## The quote of one trip (`POST /v2/structures/{id}/travel/quote`) and the way to start it: the
## phases with their durations, the arrival, the fuel per kind against the structure's own supply
## (red when short; when the cargo holds it, a button moves it over), the mass against the lift of
## the drives, and every broken rule as a sentence. Starting is two-step, with the note that a
## journey cannot be cancelled. Quotes are asked for a moment after the last change (debounced);
## an answer to an older question is dropped.

## The trip started; `details` is the structure as the server sent it back (with `motion`).
signal started(details: Dictionary)
## A new quote arrived (null when it failed), e.g. to colour a landing ghost by the server's view.
signal quoted(quote: TravelPlan.Quote)

## Seconds after the last change before the quote is asked for.
const DEBOUNCE := 0.4

var _structure_id := 0
var _request: Dictionary = {}
var _quote: TravelPlan.Quote = null
var _asked := 0
var _due := -1.0
var _busy := false
var _armed := false
var _refresh_left := 0.0
## Shown instead of the quote while there is nothing to ask for ("" for nothing).
var _hint := ""

var _lines: VBoxContainer
var _note: Label
var _move: Button
var _start: Button


func setup(structure_id: int) -> void:
	_structure_id = structure_id


func _ready() -> void:
	add_theme_constant_override("separation", 10)
	_lines = Ui.column(6)
	add_child(_lines)
	_note = Ui.label("TRAVEL_NO_CANCEL", AppTheme.VARIATION_MUTED)
	_note.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	add_child(_note)
	_move = Ui.secondary_button("TRAVEL_MOVE_FUEL")
	_move.visible = false
	_move.pressed.connect(_on_move_fuel)
	add_child(_move)
	_start = Ui.primary_button("TRAVEL_START")
	_start.pressed.connect(_on_start)
	add_child(_start)
	_show()


func _process(delta: float) -> void:
	if _due >= 0.0:
		_due -= delta
		if _due < 0.0:
			_ask()
	_refresh_left -= delta
	if _refresh_left <= 0.0:
		_refresh_left = 1.0
		if _quote != null and not _busy:
			_show()


## Asks for a quote of this request soon; the panel shows "checking" until it is there.
func ask(request: Dictionary) -> void:
	_request = request
	_hint = ""
	_quote = null
	_armed = false
	_due = DEBOUNCE
	_show()


## Shows a hint instead of a quote (nothing chosen yet); `text` already translated.
func show_hint(text: String) -> void:
	_request = {}
	_quote = null
	_hint = text
	_armed = false
	_due = -1.0
	_asked += 1
	_show()


## The last quote; null while there is none.
func quote() -> TravelPlan.Quote:
	return _quote


func _ask() -> void:
	if _request.is_empty() or _structure_id == 0:
		return
	_asked += 1
	var mine := _asked
	var answer := await Services.api.post_json("/v2/structures/%d/travel/quote" % _structure_id, _request)
	if mine != _asked or not is_inside_tree():
		return
	if not answer.is_ok():
		_quote = null
		_show_error(ErrorText.describe(answer.error, self))
		quoted.emit(null)
		return
	_quote = TravelPlan.Quote.from_wire(answer.data)
	_show()
	quoted.emit(_quote)


func _show() -> void:
	if _lines == null:
		return
	for child: Node in _lines.get_children():
		child.queue_free()
	_move.visible = false
	_start.disabled = true
	_start.text = tr("TRAVEL_START")
	_note.visible = false
	if not _hint.is_empty():
		_line(_hint, AppTheme.COLOR_MUTED)
		return
	if _request.is_empty():
		return
	if _quote == null:
		_line(tr("TRAVEL_QUOTE_LOADING"), AppTheme.COLOR_MUTED)
		return
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	_line(phase_line(_quote, Wire.as_string(_request.get("mode")) == TravelPlan.MODE_GROUND, self), AppTheme.COLOR_TEXT)
	_line(tr("TRAVEL_ARRIVAL").format({"duration": TimeFormat.duration(_quote.total_ms())}), AppTheme.COLOR_TEXT)
	if _quote.distance_nly > 0:
		_line(tr("TRAVEL_DISTANCE").format({"ly": light_years(_quote.distance_nly)}), AppTheme.COLOR_MUTED)
	if _quote.interstellar:
		_line(tr("TRAVEL_INTERSTELLAR"), AppTheme.COLOR_PENDING)
	if _quote.max_mass > 0:
		_line(tr("TRAVEL_MASS").format({"mass": _whole(_quote.mass, scale),
			"limit": _whole(_quote.max_mass, scale)}),
			AppTheme.COLOR_OK if _quote.mass_within_limit() else AppTheme.COLOR_DANGER)
	for row: TravelPlan.FuelRow in _quote.fuel:
		var text := tr("TRAVEL_FUEL").format({"resource": _resource_name(row.resource),
			"amount": _whole(row.amount, scale),
			"on_board": _whole(row.self_use, scale)})
		if row.is_short() and row.in_transport > 0:
			text += " · " + tr("TRAVEL_FUEL_IN_CARGO").format({"amount": _whole(row.in_transport, scale)})
		_line(text, AppTheme.COLOR_DANGER if row.is_short() else AppTheme.COLOR_OK)
	for code: String in _quote.errors:
		var error := ApiError.new()
		error.code = code
		_line(ErrorText.describe(error, self), AppTheme.COLOR_DANGER)
	_move.visible = not _quote.movable_fuel().is_empty()
	_move.disabled = _busy
	_note.visible = _quote.ok
	_start.disabled = _busy or not _quote.ok
	_start.text = tr("TRAVEL_CONFIRM_START") if _armed else tr("TRAVEL_START")


func _show_error(text: String) -> void:
	for child: Node in _lines.get_children():
		child.queue_free()
	_line(tr("TRAVEL_QUOTE_FAILED"), AppTheme.COLOR_DANGER)
	_line(text, AppTheme.COLOR_DANGER)
	_move.visible = false
	_note.visible = false
	_start.disabled = true


## The phases of a quote in one line: launch, cruise and landing of a flight (the ones it has),
## or the drive with its speed.
static func phase_line(quote: TravelPlan.Quote, ground: bool, translator: Object) -> String:
	if ground:
		return translator.tr("TRAVEL_PHASE_DRIVE").format({"duration": TimeFormat.duration(quote.total_ms()),
			"speed": AmountFormat.units(quote.speed_cells_per_minute)})
	var parts := PackedStringArray()
	if quote.launch_ms() > 0:
		parts.append(translator.tr("TRAVEL_PHASE_LAUNCH").format({"duration": TimeFormat.duration(quote.launch_ms())}))
	if quote.cruise_ms() > 0:
		parts.append(translator.tr("TRAVEL_PHASE_CRUISE").format({"duration": TimeFormat.duration(quote.cruise_ms())}))
	if quote.landing_ms() > 0:
		parts.append(translator.tr("TRAVEL_PHASE_LANDING").format({"duration": TimeFormat.duration(quote.landing_ms())}))
	if parts.is_empty():
		return translator.tr("TRAVEL_PHASE_NONE")
	return " · ".join(parts)


## Nano-light-years as light years: three decimals below 10, one below 1000, whole above.
static func light_years(nly: int) -> String:
	var value := nly / float(TravelMotion.NLY_PER_LY)
	if value < 10.0:
		return "%.3f" % value
	if value < 1000.0:
		return "%.1f" % value
	return AmountFormat.units(roundi(value))


## Micro-units as whole units.
static func _whole(value: int, scale: int) -> String:
	@warning_ignore("integer_division")
	return AmountFormat.units(value / maxi(scale, 1))


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


func _on_start() -> void:
	if _busy or _quote == null or not _quote.ok:
		return
	if not _armed:
		_armed = true
		_show()
		return
	_armed = false
	_busy = true
	_start.disabled = true
	_start.text = tr("TRAVEL_STARTING")
	var answer := await Services.api.post_json("/v2/structures/%d/travel" % _structure_id, _request)
	_busy = false
	if not is_inside_tree():
		return
	if answer.is_ok():
		started.emit(answer.data)
		return
	_show()
	_line(ErrorText.describe(answer.error, self), AppTheme.COLOR_DANGER)
	# Something changed since the quote: ask again.
	ask(_request)


func _on_move_fuel() -> void:
	if _busy or _quote == null:
		return
	var body := TravelPlan.fuel_move_request(_quote.movable_fuel())
	_busy = true
	_move.disabled = true
	_move.text = tr("TRAVEL_MOVING_FUEL")
	var answer := await Services.api.post_json("/v2/structures/%d/storage/move" % _structure_id, body)
	_busy = false
	if not is_inside_tree():
		return
	_move.text = tr("TRAVEL_MOVE_FUEL")
	if not answer.is_ok():
		_show()
		_line(ErrorText.describe(answer.error, self), AppTheme.COLOR_DANGER)
		return
	ask(_request)
