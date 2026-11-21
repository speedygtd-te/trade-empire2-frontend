class_name WorldCard
extends PanelContainer
## A half-transparent card that stands beside a point of the 3D view and follows it while the
## camera pans and zooms: the structure card outside ("Enter structure"), the inspect card of a
## field inside. It stays readable on a phone: at most MAX_WIDTH wide, kept inside the free
## room (above the point, below it when there is no room above, slid in from the edges, never on
## it: CardPlacement), and content taller than MAX_SHARE of the room scrolls. A head (header())
## and a foot (footer(), the buttons) stay in sight while the content between them scrolls.

## Widest a card gets (canvas px).
const MAX_WIDTH := 560.0
## Distance between the point and the card.
const GAP := 28.0
## Highest share of the free room's height a card takes before its content scrolls.
const MAX_SHARE := 0.6
## Space between head, content and foot.
const SEPARATION := 12

var _column: VBoxContainer
var _header: VBoxContainer
var _scroll: ScrollContainer
var _content: VBoxContainer
var _footer: VBoxContainer


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
	_column = Ui.column(SEPARATION)
	add_child(_column)
	_header = Ui.column(SEPARATION)
	_column.add_child(_header)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_column.add_child(_scroll)
	_content = Ui.column(SEPARATION)
	_scroll.add_child(_content)
	_footer = Ui.column(SEPARATION)
	_column.add_child(_footer)


## The column the card's controls go into (scrolls when the card is short).
func content() -> VBoxContainer:
	return _content


## Above the content, always in sight (a title with "×").
func header() -> VBoxContainer:
	return _header


## Below the content, always in sight (the buttons).
func footer() -> VBoxContainer:
	return _footer


## Puts the card beside `anchor` (in the parent's coordinates) inside `room`, `clear` away from it.
func place(anchor: Vector2, room: Rect2, clear: float = GAP) -> void:
	place_beside(Rect2(anchor, Vector2.ZERO).grow(clear), room)


## Puts the card inside `room` beside the area `avoid` (CardPlacement): above it when it fits
## there, otherwise on the side with more room, its content scrolling when that side is too short.
func place_beside(avoid: Rect2, room: Rect2) -> void:
	var box := get_theme_stylebox("panel")
	var frame := box.get_minimum_size() if box != null else Vector2.ZERO
	# Head and foot do not scroll: they count like the frame.
	for part: VBoxContainer in [_header, _footer]:
		part.visible = _shows_something(part)
		if part.visible:
			frame.y += part.get_combined_minimum_size().y + SEPARATION
	var wanted := _content.get_combined_minimum_size().y
	var shortest := float(AppTheme.TOUCH_MIN)
	var card := CardPlacement.rect(avoid, room, MAX_WIDTH, wanted, frame, room.size.y * MAX_SHARE, shortest)
	_scroll.custom_minimum_size = Vector2(card.size.x - (box.get_minimum_size().x if box != null else 0.0),
		card.size.y - frame.y)
	position = card.position
	size = card.size


static func _shows_something(part: Control) -> bool:
	for child: Node in part.get_children():
		if child is Control and (child as Control).visible:
			return true
	return false
