class_name BottomNav
extends PanelContainer
## The navigation along the whole bottom edge: equal entries of an icon and a short text. The
## active entry has a cyan bar on top and a cyan text, the others a muted text; the icons keep
## their own colours. An entry can carry a badge dot (something is going on there). Below the
## entries the bar keeps the system bar's inset free.

## The player tapped entry `index` (also the active one: the owner decides what a second tap does).
signal tab_pressed(index: int)

var _row: HBoxContainer
var _box: StyleBoxFlat
var _buttons: Array[Button] = []
var _bars: Array[ColorRect] = []
var _labels: Array[Label] = []
var _badges: Array[Control] = []
var _selected := -1


func _init() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_box = StyleBoxFlat.new()
	_box.bg_color = AppTheme.COLOR_PANEL
	_box.border_color = AppTheme.COLOR_PANEL_LIGHT
	_box.border_width_top = 2
	add_theme_stylebox_override("panel", _box)
	_row = HBoxContainer.new()
	_row.add_theme_constant_override("separation", 0)
	add_child(_row)


func _ready() -> void:
	get_viewport().size_changed.connect(_apply_inset)
	_apply_inset()


## Adds an entry with a translation key and an icon; returns its index.
func add_entry(text_key: String, icon: Texture2D) -> int:
	var index := _buttons.size()
	var button := Button.new()
	button.theme_type_variation = AppTheme.VARIATION_NAV_BUTTON
	button.custom_minimum_size = Vector2(AppTheme.TOUCH_MIN, AppTheme.NAV_HEIGHT)
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(func() -> void: tab_pressed.emit(index))
	_row.add_child(button)
	var column := VBoxContainer.new()
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", 6)
	button.add_child(column)
	var bar := ColorRect.new()
	bar.custom_minimum_size = Vector2(0, AppTheme.NAV_BAR)
	bar.color = AppTheme.COLOR_TRANSPARENT
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(bar)
	column.add_child(Ui.spacer(4))
	var picture := TextureRect.new()
	picture.texture = icon
	picture.custom_minimum_size = Vector2(AppTheme.NAV_ICON, AppTheme.NAV_ICON)
	picture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	picture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	picture.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	picture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(picture)
	# The badge sits on the icon's upper right corner.
	var badge := Panel.new()
	var dot := StyleBoxFlat.new()
	dot.bg_color = AppTheme.COLOR_PENDING
	dot.border_color = AppTheme.COLOR_PANEL
	dot.set_border_width_all(2)
	dot.set_corner_radius_all(AppTheme.BADGE_SIZE)
	badge.add_theme_stylebox_override("panel", dot)
	badge.size = Vector2(AppTheme.BADGE_SIZE, AppTheme.BADGE_SIZE)
	badge.position = Vector2(AppTheme.NAV_ICON - AppTheme.BADGE_SIZE * 0.5, -AppTheme.BADGE_SIZE * 0.25)
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.visible = false
	picture.add_child(badge)
	var label := Ui.label(text_key)
	label.add_theme_font_size_override("font_size", AppTheme.FONT_SIZE_SMALL)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(label)
	_buttons.append(button)
	_bars.append(bar)
	_labels.append(label)
	_badges.append(badge)
	_paint(index)
	return index


func entry_count() -> int:
	return _buttons.size()


## The entry's button (for review scenes and tests).
func entry(index: int) -> Button:
	return _buttons[index] if index >= 0 and index < _buttons.size() else null


func selected() -> int:
	return _selected


## Marks entry `index` as the active one (no signal).
func select(index: int) -> void:
	_selected = index
	for position: int in _buttons.size():
		_paint(position)


## Shows or hides entry `index` (the others share the width).
func set_entry_visible(index: int, on: bool) -> void:
	if index >= 0 and index < _buttons.size():
		_buttons[index].visible = on


## Shows or hides the badge dot of entry `index`.
func set_badge(index: int, on: bool) -> void:
	if index >= 0 and index < _badges.size():
		_badges[index].visible = on


func has_badge(index: int) -> bool:
	return index >= 0 and index < _badges.size() and _badges[index].visible


## Whether entry `index` is drawn as the active one.
func is_marked(index: int) -> bool:
	return index >= 0 and index < _bars.size() and _bars[index].color == AppTheme.COLOR_ACCENT


func _paint(index: int) -> void:
	var active := index == _selected
	_bars[index].color = AppTheme.COLOR_ACCENT if active else AppTheme.COLOR_TRANSPARENT
	_labels[index].add_theme_color_override("font_color", AppTheme.COLOR_ACCENT if active else AppTheme.COLOR_MUTED)


## Keeps the system bar (gesture bar, home indicator) free below the entries.
func _apply_inset() -> void:
	_box.content_margin_bottom = SafeAreaMargin.insets(get_viewport()).w
