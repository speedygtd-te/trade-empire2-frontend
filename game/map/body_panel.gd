class_name BodyPanel
extends VBoxContainer
## Details of a body tapped on the system map: what it is, its size and orbit, air, whether it
## has a surface to build on, the player's structures there and its deposits.

## The player closed the details.
signal closed
## The player chose the shown body (pick mode: a target of a trip).
signal chosen(body_id: String)

## Body and star types with their own text (MAP_BODY_TYPE_*, MAP_STAR_TYPE_*); a test checks them.
const BODY_TYPES: PackedStringArray = ["EARTH_LIKE", "DESERT", "OCEAN", "ICE", "VOLCANIC", "BARREN",
	"TOXIC", "GAS_GIANT", "ICE_GIANT", "ASTEROID_M", "ASTEROID_C", "ASTEROID_S", "MOON_ROCKY",
	"MOON_ICY", "MOON_VOLCANIC"]
const STAR_TYPES: PackedStringArray = ["O", "B", "A", "F", "G", "K", "M", "WHITE_DWARF", "RED_GIANT", "NEUTRON"]
## Highest the list of details grows before it scrolls (canvas px).
const MAX_LIST_HEIGHT := 300.0

var _title: Label
var _kind: Label
var _scroll: ScrollContainer
var _lines: VBoxContainer
var _body_id := ""
## Pick mode: why the body cannot be chosen, and the button that chooses it.
var _pick_note: Label
var _choose: Button


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 16)
	add_child(header)
	var names := Ui.column(4)
	header.add_child(names)
	_title = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	_title.autowrap_mode = TextServer.AUTOWRAP_OFF
	_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	names.add_child(_title)
	_kind = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	names.add_child(_kind)
	var close := Ui.secondary_button("COMMON_CLOSE")
	close.size_flags_horizontal = Control.SIZE_SHRINK_END
	close.pressed.connect(func() -> void: closed.emit())
	header.add_child(close)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(_scroll)
	_lines = Ui.column(8)
	_scroll.add_child(_lines)
	_pick_note = Ui.dynamic_label(AppTheme.VARIATION_ERROR)
	_pick_note.visible = false
	add_child(_pick_note)
	_choose = Ui.primary_button("MAP_PICK_ORBIT")
	_choose.visible = false
	_choose.pressed.connect(func() -> void: chosen.emit(_body_id))
	add_child(_choose)


## Pick mode: offers to choose the shown body as the target of a trip (`text_key` on the button);
## `reason` (translated) says why it cannot be chosen, "" when it can. An empty key hides it.
func show_pick(text_key: String, reason: String) -> void:
	_choose.visible = not text_key.is_empty()
	_choose.text = text_key
	_choose.disabled = not reason.is_empty()
	_pick_note.visible = _choose.visible and not reason.is_empty()
	_pick_note.text = reason


## Readable name of a body type ("Earth-like planet"); a generic one for types this build does
## not know.
static func type_text(type: String, translator: Object) -> String:
	return translator.tr("MAP_BODY_TYPE_" + type) if BODY_TYPES.has(type) else translator.tr("MAP_BODY_TYPE_UNKNOWN")


static func star_text(type: String, translator: Object) -> String:
	return translator.tr("MAP_STAR_TYPE_" + type) if STAR_TYPES.has(type) else translator.tr("MAP_STAR_TYPE_UNKNOWN")


## Shows a body of the map. `structures` are the names of the player's structures there.
func show_body(map: SystemMap, body_id: String, structures: PackedStringArray, is_home: bool) -> void:
	var body := map.body(body_id)
	if body == null:
		return
	_body_id = body_id
	_title.text = body.name
	var kind := type_text(body.type, self)
	if body.is_moon():
		var planet := map.body(body.parent_id)
		kind = tr("MAP_MOON_OF").format({"type": kind, "planet": planet.name})
	_kind.text = kind
	for child: Node in _lines.get_children():
		child.queue_free()

	if is_home:
		_line(tr("MAP_HOME_HERE"), AppTheme.COLOR_OK)
	if not structures.is_empty():
		_line(tr("MAP_STRUCTURES_HERE").format({"names": ", ".join(structures)}), AppTheme.COLOR_OK)

	var environment := Wire.as_dict(body.data.get("environment"))
	_line(tr("MAP_SIZE").format({
		"radius": AmountFormat.units(roundi(body.radius_km)),
		"gravity": "%.1f" % SystemMap.number(environment.get("gravity")),
		"temperature": "%d" % roundi(SystemMap.number(environment.get("temperature")))}))
	var period := TimeFormat.duration(roundi(body.period_s * 1000.0))
	if body.is_moon():
		_line(tr("MAP_ORBIT_PLANET").format({"planet": map.body(body.parent_id).name, "period": period}))
	else:
		_line(tr("MAP_ORBIT_STAR").format({"au": "%.2f" % body.orbit_au, "period": period}))

	if Wire.as_dict(body.data.get("grid")).is_empty() or body.data.get("surfaceBuildable") == false:
		_line(tr("MAP_SURFACE_NONE"))
	else:
		_line(tr("MAP_SURFACE_BUILDABLE"))

	var gases := SystemMap.atmosphere_shares(Wire.as_dict(environment.get("atmosphere")))
	if gases.is_empty():
		_line(tr("MAP_ATMOSPHERE_NONE"))
	else:
		var parts := PackedStringArray()
		for gas: Array in gases:
			var share: float = gas[1]
			parts.append(tr("MAP_GAS_SHARE").format({"name": _resource_name(str(gas[0])), "share": _percent(share)}))
		_line(tr("MAP_ATMOSPHERE").format({"gases": ", ".join(parts),
			"density": "%.1f" % SystemMap.number(environment.get("atmosphereDensity"))}))

	var deposits := map.deposits_of(body_id)
	if deposits.is_empty():
		_line(tr("MAP_DEPOSITS_NONE"), AppTheme.COLOR_MUTED)
	else:
		_line(tr("MAP_DEPOSITS"), AppTheme.COLOR_MUTED)
		for deposit: Dictionary in deposits:
			_line(tr("MAP_DEPOSIT").format({"name": _resource_name(Wire.as_string(deposit.get("resourceType"))),
				"abundance": Wire.as_int(deposit.get("abundance")), "quality": Wire.as_int(deposit.get("quality"))}))
	_scroll.scroll_vertical = 0
	_fit_height.call_deferred()


## The list takes the room its lines need, up to MAX_LIST_HEIGHT; beyond that it scrolls.
func _fit_height() -> void:
	await get_tree().process_frame
	_scroll.custom_minimum_size = Vector2(0.0, minf(_lines.get_combined_minimum_size().y, MAX_LIST_HEIGHT))


func _line(text: String, color: Color = AppTheme.COLOR_TEXT) -> void:
	var label := Ui.dynamic_label()
	label.text = text
	label.add_theme_font_size_override("font_size", AppTheme.FONT_SIZE_SMALL)
	if color != AppTheme.COLOR_TEXT:
		label.add_theme_color_override("font_color", color)
	_lines.add_child(label)


func _resource_name(key: String) -> String:
	var definitions := Services.definitions
	var found := definitions.resource_name(key) if definitions != null else ""
	return found if not found.is_empty() else tr("MAP_UNKNOWN_RESOURCE")


## A share 0..1 as a percentage: whole numbers, one decimal below 10 %.
static func _percent(share: float) -> String:
	var percent := share * 100.0
	return "%.1f" % percent if percent < 10.0 else "%d" % roundi(percent)
