class_name ListButton
extends Button
## A button inside a scrolling list on a touch screen. A swipe that starts on it scrolls the list
## (the input passes on to the ScrollContainer) and does not count as a tap; only a tap emits
## `tapped`. The chosen entry is shown with `set_chosen`, not by toggling: a swipe could
## otherwise flip it.

signal tapped

## How far (canvas px) the list may move between press and release and still count as a tap.
const TAP_SLOP := 12.0

var _chosen := false
var _scroll: ScrollContainer
var _offset_at_press := Vector2.ZERO


func _init() -> void:
	toggle_mode = true
	mouse_filter = Control.MOUSE_FILTER_PASS
	auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	custom_minimum_size = Vector2(0, AppTheme.TOUCH_MIN)
	button_down.connect(_on_down)
	toggled.connect(_on_toggled)


func _enter_tree() -> void:
	var node := get_parent()
	while node != null and not (node is ScrollContainer):
		node = node.get_parent()
	_scroll = node as ScrollContainer


## Marks the entry as the chosen one (drawn like a pressed toggle).
func set_chosen(on: bool) -> void:
	_chosen = on
	set_pressed_no_signal(on)


func is_chosen() -> bool:
	return _chosen


func _offset() -> Vector2:
	if _scroll == null:
		return Vector2.ZERO
	return Vector2(_scroll.scroll_horizontal, _scroll.scroll_vertical)


func _on_down() -> void:
	_offset_at_press = _offset()


func _on_toggled(_on: bool) -> void:
	# The look follows the chosen state, never the click; the owner decides what is chosen.
	set_pressed_no_signal(_chosen)
	if _offset().distance_to(_offset_at_press) <= TAP_SLOP:
		tapped.emit()
