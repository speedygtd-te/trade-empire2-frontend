extends GdUnitTestSuite

const EPSILON := 0.001


func test_dot_arrays_hold_a_fan_of_triangles_per_dot() -> void:
	var centres := PackedVector2Array([Vector2(10, 20), Vector2(-5, 0)])
	var arrays := MapShapes.dot_arrays(centres, 2.0, 8)
	var vertices: PackedVector2Array = arrays[Mesh.ARRAY_VERTEX]
	var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	var colors: PackedColorArray = arrays[Mesh.ARRAY_COLOR]

	assert_int(arrays.size()).is_equal(Mesh.ARRAY_MAX)
	assert_int(vertices.size()).is_equal(2 * 9)
	assert_int(colors.size()).is_equal(vertices.size())
	assert_int(indices.size()).is_equal(2 * 8 * 3)
	assert_vector(vertices[0]).is_equal(Vector2(10, 20))
	assert_vector(vertices[9]).is_equal(Vector2(-5, 0))
	# Every corner lies on the dot's circle.
	for index: int in range(1, 9):
		assert_float(vertices[index].distance_to(Vector2(10, 20))).is_equal_approx(2.0, EPSILON)
	# The second dot's triangles use its own vertices only.
	for index: int in range(24, 48):
		assert_int(indices[index]).is_between(9, 17)
	assert_int(indices[47]).is_equal(10)


func test_dot_mesh_is_null_without_dots() -> void:
	assert_object(MapShapes.dot_mesh(PackedVector2Array(), 2.0)).is_null()


func test_dot_mesh_has_one_surface_of_triangles() -> void:
	var mesh := MapShapes.dot_mesh(PackedVector2Array([Vector2.ZERO]), 3.0)

	assert_int(mesh.get_surface_count()).is_equal(1)
	assert_int(mesh.surface_get_array_index_len(0)).is_equal(MapShapes.DOT_SEGMENTS * 3)


func test_belt_dots_lie_in_the_band_at_the_zoom() -> void:
	var pattern := PackedVector2Array([Vector2(0.0, 0.0), Vector2(PI * 0.5, 1.0), Vector2(PI, -1.0)])
	var dots := MapShapes.belt_dots(pattern, 100.0, 10.0, 2.0)

	assert_vector(dots[0]).is_equal_approx(Vector2(200.0, 0.0), Vector2.ONE * EPSILON)
	# Counter-clockwise on screen (y down), as the bodies run: a quarter turn is up.
	assert_vector(dots[1]).is_equal_approx(Vector2(0.0, -220.0), Vector2.ONE * EPSILON)
	assert_vector(dots[2]).is_equal_approx(Vector2(-180.0, 0.0), Vector2.ONE * EPSILON)


func test_a_turned_belt_mesh_puts_the_dots_where_the_belt_has_turned_to() -> void:
	var pattern := PackedVector2Array([Vector2(0.3, 0.5)])
	var turn := 1.1
	var dot := MapShapes.belt_dots(pattern, 100.0, 10.0, 1.5)[0]
	var turned := Transform2D(-turn, Vector2(40, 50)) * dot

	assert_vector(turned).is_equal_approx(Vector2(40, 50) + SystemMap.on_ring(105.0 * 1.5, 0.3 + turn), Vector2.ONE * EPSILON)


func test_dash_segments_follow_draw_arc_angles() -> void:
	var segments := MapShapes.dash_segments(50.0, 0.0, PI * 0.5, 2, 5)

	assert_int(segments.size()).is_equal(2 * 5 * 2)
	assert_vector(segments[0]).is_equal_approx(Vector2(50.0, 0.0), Vector2.ONE * EPSILON)
	# Each dash is half a step long and its pieces join up.
	assert_vector(segments[9]).is_equal_approx(Vector2.from_angle(PI * 0.25) * 50.0, Vector2.ONE * EPSILON)
	assert_vector(segments[2]).is_equal_approx(segments[1], Vector2.ONE * EPSILON)
	# The second dash starts a step further, clockwise on screen like draw_arc.
	assert_vector(segments[10]).is_equal_approx(Vector2(0.0, 50.0), Vector2.ONE * EPSILON)


func test_dash_segments_are_empty_without_dashes() -> void:
	assert_int(MapShapes.dash_segments(50.0, 0.0, 0.1, 0).size()).is_equal(0)
