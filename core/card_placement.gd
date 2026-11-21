class_name CardPlacement
extends RefCounted
## Where a card over the 3D view goes (WorldCard): beside what it belongs to, never on it. `avoid`
## is the area to keep free on screen — the field with its module plus room for the finger
## (`field_box`) — the card stands above it when it fits there, otherwise on the side with more
## room, so it neither covers the field nor puts a button where the finger just tapped. It keeps
## EDGE from the edges of the free room; a card taller than its side gets a shorter height (its
## content scrolls), at least `shortest`.

## Distance kept from the edges of the free room.
const EDGE := 16.0


## The card's rectangle: `width` wide at most, `wanted` the height of its scrolling content,
## `frame` the size its frame and fixed parts add, `max_height` the tallest the content may get
## before it scrolls.
static func rect(avoid: Rect2, room: Rect2, width: float, wanted: float, frame: Vector2, max_height: float,
		shortest: float) -> Rect2:
	var card_width := minf(width, room.size.x - EDGE * 2.0)
	var target := minf(wanted, max_height)
	var above := avoid.position.y - room.position.y - EDGE - frame.y
	var below := room.end.y - EDGE - avoid.end.y - frame.y
	var on_top := above >= target or above >= below
	var space := above if on_top else below
	var height := clampf(target, 0.0, maxf(space, shortest))
	var size := Vector2(card_width, height + frame.y)
	var middle := avoid.get_center().x
	var x := clampf(middle - size.x * 0.5, room.position.x + EDGE, room.end.x - size.x - EDGE)
	var y := avoid.position.y - size.y if on_top else avoid.end.y
	y = clampf(y, room.position.y + EDGE, maxf(room.end.y - size.y - EDGE, room.position.y + EDGE))
	return Rect2(Vector2(x, y).round(), size)


## The area a card keeps free around a field: the box around the field's points on screen (the
## top of its module, the corners of its floor), grown by `finger` on every side.
static func field_box(points: PackedVector2Array, finger: float) -> Rect2:
	if points.is_empty():
		return Rect2()
	var box := Rect2(points[0], Vector2.ZERO)
	for point: Vector2 in points:
		box = box.expand(point)
	return box.grow(finger)
