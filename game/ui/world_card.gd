class_name WorldCard
extends PanelContainer
## A half-transparent card that stands over a point of the 3D view and follows it while the
## camera pans and zooms: the structure card outside ("Enter structure"), the inspect card of a
## field inside. It stays readable on a phone: at most MAX_WIDTH wide, kept inside the free
## room (above the point, below it when there is no room above, slid in from the edges), and
## content taller than MAX_SHARE of the room scrolls.

## Widest a card gets (canvas px).
const MAX_WIDTH := 560.0
## Distance between the point and the card.
const GAP := 28.0
## Distance kept from the edges of the free room.
const EDGE := 16.0
## Highest share of the free room's height a card takes before its content scrolls.
const MAX_SHARE := 0.6

var _scroll: ScrollContainer
var _content: VBoxContainer


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	var box := StyleBoxFlat.new()
	box.bg_color = Color(AppTheme.COLOR_PANEL, 0.82)
	box.border_color = AppTheme.COLOR_BORDER
	box.set_border_width_all(2)
	box.set_corner_radius_all(16)
	box.set_content_margin_all(20)
	add_theme_stylebox_override("panel", box)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(_scroll)
	_content = Ui.column(12)
	_scroll.add_child(_content)


## The column the card's controls go into.
func content() -> VBoxContainer:
	return _content


## Puts the card over `anchor` (in the parent's coordinates) inside `room`: above the point when
## it fits there, otherwise on the side with more room (the point stays in sight), its content
## scrolling when that side is too short.
func place(anchor: Vector2, room: Rect2) -> void:
	var width := minf(MAX_WIDTH, room.size.x - EDGE * 2.0)
	var wanted := _content.get_combined_minimum_size().y
	var box := get_theme_stylebox("panel")
	var frame := box.get_minimum_size() if box != null else Vector2.ZERO
	var shortest := float(AppTheme.TOUCH_MIN) * 2.0
	var above := anchor.y - GAP - room.position.y - EDGE - frame.y
	var below := room.end.y - EDGE - anchor.y - GAP - frame.y
	var on_top := above >= minf(wanted, room.size.y * MAX_SHARE) or above >= below
	var space := above if on_top else below
	var height := clampf(minf(wanted, room.size.y * MAX_SHARE), 0.0, maxf(space, shortest))
	_scroll.custom_minimum_size = Vector2(width - frame.x, height)
	var card := Vector2(width, height + frame.y)
	var x := clampf(anchor.x - card.x * 0.5, room.position.x + EDGE, room.end.x - card.x - EDGE)
	var y := anchor.y - GAP - card.y if on_top else anchor.y + GAP
	y = clampf(y, room.position.y + EDGE, maxf(room.end.y - card.y - EDGE, room.position.y + EDGE))
	position = Vector2(x, y).round()
	size = card
