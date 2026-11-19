class_name LayerHeader
extends HBoxContainer
## The head of a screen: "‹ Back" on the left (on a layer pushed over a tab), the title with an
## optional line below it, and optional actions on the right (e.g. the "×" that leaves a mode).
## Long titles end in an ellipsis instead of pushing the buttons out. A tappable title (a "›"
## after it) opens something about it: the place picker, the structure details.

## The player tapped Back.
signal back_pressed
## The player tapped the title (only while it is tappable).
signal title_pressed

## Pointer travel (canvas px) up to which a press on the title still counts as a tap.
const TAP_SLOP := 18.0

var _back: Button
var _names: VBoxContainer
var _title: Label
var _title_text := ""
var _subtitle: Label
var _tappable := false
var _press_at := Vector2.ZERO
var _pressed := false


func _init() -> void:
	add_theme_constant_override("separation", 16)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_back = Ui.secondary_button("COMMON_BACK")
	_back.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_back.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_back.pressed.connect(func() -> void: back_pressed.emit())
	add_child(_back)
	_names = Ui.column(4)
	_names.alignment = BoxContainer.ALIGNMENT_CENTER
	_names.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_names.gui_input.connect(_on_names_input)
	add_child(_names)
	_title = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	_title.autowrap_mode = TextServer.AUTOWRAP_OFF
	_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_names.add_child(_title)
	_subtitle = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_subtitle.autowrap_mode = TextServer.AUTOWRAP_OFF
	_subtitle.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_subtitle.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_subtitle.visible = false
	_names.add_child(_subtitle)


## Shows or hides "‹ Back" (hidden on a tab's root).
func show_back(on: bool) -> void:
	_back.visible = on


func has_back() -> bool:
	return _back.visible


## The title, already translated.
func set_title(text: String) -> void:
	_title_text = text
	_title.text = text + " " + tr("COMMON_CHEVRON") if _tappable else text


func title() -> String:
	return _title_text


## The line below the title, already translated; hidden while empty.
func set_subtitle(text: String) -> void:
	_subtitle.text = text
	_subtitle.visible = not text.is_empty()


func subtitle() -> String:
	return _subtitle.text


## Makes the title a button (with a "›" after it) that sends `title_pressed`.
func set_title_tappable(on: bool) -> void:
	_tappable = on
	_names.mouse_filter = Control.MOUSE_FILTER_STOP if on else Control.MOUSE_FILTER_IGNORE
	_names.custom_minimum_size = Vector2(0, AppTheme.TOUCH_MIN) if on else Vector2.ZERO
	set_title(_title_text)


func is_title_tappable() -> bool:
	return _tappable


## Adds a control (a button) at the right end.
func add_action(action: Control) -> void:
	action.size_flags_horizontal = Control.SIZE_SHRINK_END
	action.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	add_child(action)


## A square "×" button for the right end that leaves a mode or closes a full screen.
static func close_button() -> Button:
	var button := Ui.secondary_button("COMMON_CLOSE_X")
	button.add_theme_font_size_override("font_size", AppTheme.FONT_SIZE_HEADING)
	button.custom_minimum_size = Vector2(AppTheme.TOUCH_MIN, AppTheme.TOUCH_MIN)
	return button


func _on_names_input(event: InputEvent) -> void:
	if not _tappable:
		return
	var touch := event as InputEventScreenTouch
	var mouse := event as InputEventMouseButton
	var drag := event as InputEventScreenDrag
	if touch != null:
		_track(touch.pressed, touch.position)
	elif mouse != null and mouse.button_index == MOUSE_BUTTON_LEFT and mouse.device != InputEvent.DEVICE_ID_EMULATION:
		_track(mouse.pressed, mouse.position)
	elif drag != null and _press_at.distance_to(drag.position) > TAP_SLOP:
		_pressed = false


func _track(down: bool, at: Vector2) -> void:
	if down:
		_pressed = true
		_press_at = at
		return
	if _pressed and _press_at.distance_to(at) <= TAP_SLOP:
		title_pressed.emit()
	_pressed = false
