extends GdUnitTestSuite

const ROOM := Rect2(0, 100, 720, 1000)
const FRAME := Vector2(44, 44)
const SHORTEST := 88.0


func _rect(avoid: Rect2, wanted: float) -> Rect2:
	return CardPlacement.rect(avoid, ROOM, 560.0, wanted, FRAME, ROOM.size.y * 0.6, SHORTEST)


## A field around `point`, `clear` free on every side.
func _field(point: Vector2, clear: float) -> Rect2:
	return Rect2(point, Vector2.ZERO).grow(clear)


func test_above_the_field_when_it_fits() -> void:
	var avoid := _field(Vector2(360, 800), 100.0)
	var card := _rect(avoid, 300.0)
	assert_float(card.end.y).is_equal_approx(avoid.position.y, 0.5)
	assert_bool(card.intersects(avoid)).is_false()


func test_below_when_the_field_is_near_the_top() -> void:
	var avoid := _field(Vector2(360, 200), 100.0)
	var card := _rect(avoid, 300.0)
	assert_float(card.position.y).is_equal_approx(avoid.end.y, 0.5)
	assert_bool(card.intersects(avoid)).is_false()


func test_never_on_the_field_in_the_middle() -> void:
	# A tall card in the middle: it shrinks (scrolls) rather than covering the field.
	var avoid := _field(Vector2(360, 600), 120.0)
	var card := _rect(avoid, 900.0)
	assert_bool(card.intersects(avoid)).is_false()
	assert_bool(ROOM.encloses(card)).is_true()


func test_fixed_parts_count_into_the_height() -> void:
	# A large footer (buttons) leaves less for the scrolling part, never pushes onto the field.
	var avoid := _field(Vector2(360, 600), 120.0)
	var card := CardPlacement.rect(avoid, ROOM, 560.0, 400.0, Vector2(44, 200), 600.0, SHORTEST)
	assert_bool(card.intersects(avoid)).is_false()


func test_stays_inside_the_room_at_the_edges() -> void:
	for point: Vector2 in [Vector2(10, 300), Vector2(710, 300), Vector2(10, 1080), Vector2(710, 1080)]:
		var avoid := _field(point, 100.0)
		var card := _rect(avoid, 300.0)
		assert_bool(ROOM.grow(-CardPlacement.EDGE + 0.5).encloses(card)).is_true()
		assert_bool(card.intersects(avoid)).is_false()


func test_narrow_room_limits_the_width() -> void:
	var room := Rect2(0, 0, 400, 1000)
	var card := CardPlacement.rect(_field(Vector2(200, 700), 60.0), room, 560.0, 200.0, FRAME, 600.0, SHORTEST)
	assert_float(card.size.x).is_equal(400.0 - CardPlacement.EDGE * 2.0)


func test_field_box_holds_every_point_and_the_finger() -> void:
	var box := CardPlacement.field_box(PackedVector2Array([Vector2(100, 50), Vector2(60, 120), Vector2(140, 130)]), 20.0)
	assert_vector(box.position).is_equal(Vector2(40, 30))
	assert_vector(box.end).is_equal(Vector2(160, 150))
	assert_bool(CardPlacement.field_box(PackedVector2Array(), 20.0).has_area()).is_false()
