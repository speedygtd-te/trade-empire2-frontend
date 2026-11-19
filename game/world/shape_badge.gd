class_name ShapeBadge
extends PanelContainer
## The small label at a hull shape being dragged (like V1): how many hulls it places, big, and
## below it the shape's size, the skipped fields and, when the store runs short, how many hulls
## are there. It stands above-left of the shape's end cell (where the finger is), so the finger
## does not cover it, and follows that cell while the camera moves. Taps go through it.

## Distance between the point and the badge (canvas px).
const GAP := 36.0
## Distance kept from the edges of the free room.
const EDGE := 16.0

var _count: Label
var _line: Label


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	var box := StyleBoxFlat.new()
	box.bg_color = Color(AppTheme.COLOR_PANEL, 0.88)
	box.border_color = AppTheme.COLOR_ACCENT
	box.set_border_width_all(3)
	box.set_corner_radius_all(14)
	box.content_margin_left = 18
	box.content_margin_right = 18
	box.content_margin_top = 6
	box.content_margin_bottom = 10
	add_theme_stylebox_override("panel", box)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 0)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(column)
	_count = Ui.dynamic_label(AppTheme.VARIATION_TITLE)
	_count.autowrap_mode = TextServer.AUTOWRAP_OFF
	_count.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_count.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(_count)
	_line = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_line.autowrap_mode = TextServer.AUTOWRAP_OFF
	_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(_line)


## Shows `count` (cyan when the shape can be built, red when it cannot) and a line under it.
func show_count(count: int, line: String, ok: bool) -> void:
	_count.text = str(count)
	_count.add_theme_color_override("font_color", AppTheme.COLOR_ACCENT if ok else AppTheme.COLOR_DANGER)
	var box := get_theme_stylebox("panel") as StyleBoxFlat
	if box != null:
		box.border_color = AppTheme.COLOR_ACCENT if ok else AppTheme.COLOR_DANGER
	_line.text = line
	_line.visible = not line.is_empty()
	visible = true
	reset_size()


## The current text of the count and the line (for checks).
func texts() -> PackedStringArray:
	return PackedStringArray([_count.text, _line.text])


## Puts the badge above-left of `anchor` (in the parent's coordinates) inside `room`; where there
## is no room there it slides right or below, never over the point itself.
func place(anchor: Vector2, room: Rect2) -> void:
	var badge := get_combined_minimum_size()
	size = badge
	var x := anchor.x - GAP - badge.x
	if x < room.position.x + EDGE:
		x = anchor.x + GAP
	var y := anchor.y - GAP - badge.y
	if y < room.position.y + EDGE:
		y = anchor.y + GAP
	x = clampf(x, room.position.x + EDGE, maxf(room.end.x - badge.x - EDGE, room.position.x + EDGE))
	y = clampf(y, room.position.y + EDGE, maxf(room.end.y - badge.y - EDGE, room.position.y + EDGE))
	position = Vector2(x, y).round()
