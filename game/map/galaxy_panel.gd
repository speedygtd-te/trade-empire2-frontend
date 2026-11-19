class_name GalaxyPanel
extends VBoxContainer
## Details of a system tapped on the galaxy map: its star, planets, distance from home, whether
## the player is there, and the way into its system map. With draft.30 the star's spectral class
## stands before its type and its catalog designation at the end.

## The player closed the details.
signal closed
## The player wants the system map of the shown system.
signal open_requested(system_id: String)

var _system_id := ""
var _title: Label
var _kind: Label
var _lines: VBoxContainer
var _open: Button


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
	_lines = Ui.column(8)
	add_child(_lines)
	_open = Ui.primary_button("GALAXY_OPEN_SYSTEM")
	_open.pressed.connect(func() -> void: open_requested.emit(_system_id))
	add_child(_open)


## Shows a system. `home` is the home system's entry (null when unknown); `is_own` says the
## player has structures there.
func show_system(entry: GalaxySystems.Entry, home: GalaxySystems.Entry, is_own: bool, ly_per_unit: float) -> void:
	_system_id = entry.id
	_title.text = entry.name if not entry.name.is_empty() else tr("GALAXY_UNNAMED")
	_kind.text = BodyPanel.star_kind_text(entry.spectral_class, entry.star_type, self)
	for child: Node in _lines.get_children():
		child.queue_free()
	var is_home := home != null and home.id == entry.id
	if is_home:
		_line(tr("GALAXY_HOME_HERE"), AppTheme.COLOR_OK)
	elif is_own:
		_line(tr("GALAXY_OWN_HERE"), AppTheme.COLOR_OK)
	_line(tr("GALAXY_STAR_LINE").format({"kelvin": AmountFormat.units(roundi(entry.kelvin)),
		"luminosity": GalaxyPanel.suns(entry.luminosity), "mass": GalaxyPanel.suns(entry.mass)}))
	if entry.planet_count == 0:
		_line(tr("GALAXY_PLANETS_NONE"))
	elif entry.planet_count == 1:
		_line(tr("GALAXY_PLANETS_ONE"))
	else:
		_line(tr("GALAXY_PLANETS").format({"count": entry.planet_count}))
	if home != null and not is_home:
		var distance := home.position.distance_to(entry.position) * ly_per_unit
		_line(tr("GALAXY_DISTANCE").format({"ly": GalaxyPanel.light_years(distance)}), AppTheme.COLOR_MUTED)
	if not entry.catalog.is_empty():
		_line(tr("GALAXY_CATALOG").format({"catalog": entry.catalog}), AppTheme.COLOR_MUTED)


## A value in suns: two significant digits below 10, whole numbers above.
static func suns(value: float) -> String:
	if value >= 10.0:
		return AmountFormat.units(roundi(value))
	if value >= 0.1:
		return "%.2f" % value if value < 1.0 else "%.1f" % value
	return "%.3f" % value


## A distance in light years: one decimal below 10, whole numbers above.
static func light_years(value: float) -> String:
	return "%.1f" % value if value < 10.0 else AmountFormat.units(roundi(value))


func _line(text: String, color: Color = AppTheme.COLOR_TEXT) -> void:
	var label := Ui.dynamic_label()
	label.text = text
	label.add_theme_font_size_override("font_size", AppTheme.FONT_SIZE_SMALL)
	if color != AppTheme.COLOR_TEXT:
		label.add_theme_color_override("font_color", color)
	_lines.add_child(label)
