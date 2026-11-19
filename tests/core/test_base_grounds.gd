extends GdUnitTestSuite

## No seam (the seam has a test of its own).
const WIDTH := 0


static func _rect(x0: int, y0: int, width: int, height: int) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	for y: int in range(y0, y0 + height):
		for x: int in range(x0, x0 + width):
			cells.append(Vector2i(x, y))
	return cells


## Chebyshev distance of a cell to a rectangle's cells (0 inside).
static func _away(cell: Vector2i, x0: int, y0: int, width: int, height: int) -> int:
	var dx := maxi(maxi(x0 - cell.x, cell.x - (x0 + width - 1)), 0)
	var dy := maxi(maxi(y0 - cell.y, cell.y - (y0 + height - 1)), 0)
	return maxi(dx, dy)


static func _post_lines(plan: BaseGrounds.Plan) -> Array[String]:
	var lines: Array[String] = []
	for post: BaseGrounds.Post in plan.posts:
		lines.append("%d,%d %d %s" % [post.cell.x, post.cell.y, post.links, post.gate])
	lines.sort()
	return lines


static func _sorted(cells: Array[Vector2i]) -> Array[String]:
	var lines: Array[String] = []
	for cell: Vector2i in cells:
		lines.append("%d,%d" % [cell.x, cell.y])
	lines.sort()
	return lines


static func _posts_by_cell(plan: BaseGrounds.Plan) -> Dictionary:
	var result: Dictionary = {}
	for post: BaseGrounds.Post in plan.posts:
		result[post.cell] = post
	return result


func test_the_stage_follows_the_hull_count() -> void:
	assert_int(BaseGrounds.stage(0)).is_equal(BaseGrounds.Stage.START)
	assert_int(BaseGrounds.stage(BaseGrounds.CLEARED_FROM - 1)).is_equal(BaseGrounds.Stage.START)
	assert_int(BaseGrounds.stage(BaseGrounds.CLEARED_FROM)).is_equal(BaseGrounds.Stage.CLEARED)
	assert_int(BaseGrounds.stage(BaseGrounds.FENCED_FROM - 1)).is_equal(BaseGrounds.Stage.CLEARED)
	assert_int(BaseGrounds.stage(BaseGrounds.FENCED_FROM)).is_equal(BaseGrounds.Stage.FENCED)
	assert_int(BaseGrounds.stage(BaseGrounds.PAVED_FROM - 1)).is_equal(BaseGrounds.Stage.FENCED)
	assert_int(BaseGrounds.stage(BaseGrounds.PAVED_FROM)).is_equal(BaseGrounds.Stage.PAVED)
	assert_int(BaseGrounds.stage(BaseGrounds.WALLED_FROM - 1)).is_equal(BaseGrounds.Stage.PAVED)
	assert_int(BaseGrounds.stage(BaseGrounds.WALLED_FROM)).is_equal(BaseGrounds.Stage.WALLED)
	assert_int(BaseGrounds.stage(1000000)).is_equal(BaseGrounds.Stage.WALLED)


func test_a_fence_until_the_wall_replaces_it() -> void:
	assert_int(BaseGrounds.barrier(BaseGrounds.Stage.START)).is_equal(BaseGrounds.Barrier.NONE)
	assert_int(BaseGrounds.barrier(BaseGrounds.Stage.CLEARED)).is_equal(BaseGrounds.Barrier.NONE)
	assert_int(BaseGrounds.barrier(BaseGrounds.Stage.FENCED)).is_equal(BaseGrounds.Barrier.FENCE)
	assert_int(BaseGrounds.barrier(BaseGrounds.Stage.PAVED)).is_equal(BaseGrounds.Barrier.FENCE)
	assert_int(BaseGrounds.barrier(BaseGrounds.Stage.WALLED)).is_equal(BaseGrounds.Barrier.WALL)


func test_the_cleared_ring_widens_with_the_base_up_to_a_limit() -> void:
	assert_int(BaseGrounds.clear_radius(BaseGrounds.CLEARED_FROM - 1)).is_equal(0)
	assert_int(BaseGrounds.clear_radius(150)).is_equal(3)
	assert_int(BaseGrounds.clear_radius(1500)).is_equal(5)
	assert_int(BaseGrounds.clear_radius(7500)).is_equal(10)
	assert_int(BaseGrounds.clear_radius(10000)).is_equal(BaseGrounds.CLEAR_MAX)
	assert_int(BaseGrounds.clear_radius(1000000)).is_equal(BaseGrounds.CLEAR_MAX)
	var previous := 0
	for hulls: int in range(BaseGrounds.CLEARED_FROM, 20000, 50):
		var radius := BaseGrounds.clear_radius(hulls)
		assert_int(radius).is_greater_equal(previous)
		previous = radius
	# Beyond the mast ring (2) from the start, and beyond the fence once there is one.
	assert_int(BaseGrounds.clear_radius(BaseGrounds.CLEARED_FROM)).is_greater(2)
	assert_int(BaseGrounds.clear_radius(BaseGrounds.FENCED_FROM)).is_greater_equal(BaseGrounds.FENCE_DISTANCE)


func test_a_small_base_leaves_the_land_as_it_is() -> void:
	var plan := BaseGrounds.plan(_rect(0, 0, 12, 12), [], WIDTH)
	assert_int(plan.stage).is_equal(BaseGrounds.Stage.START)
	assert_array(plan.cleared).is_empty()
	assert_array(plan.posts).is_empty()
	assert_array(plan.paved).is_empty()


func test_an_empty_footprint_has_no_grounds() -> void:
	var plan := BaseGrounds.plan([], [], WIDTH)
	assert_int(plan.stage).is_equal(BaseGrounds.Stage.START)
	assert_array(plan.cleared).is_empty()


func test_stacked_floors_count_as_hulls() -> void:
	var footprint := _rect(0, 0, 10, 8)
	footprint.append_array(_rect(0, 0, 10, 8))
	assert_int(BaseGrounds.plan(footprint, [], WIDTH).stage).is_equal(BaseGrounds.Stage.CLEARED)


func test_the_cleared_ring_surrounds_the_base_and_spares_other_structures() -> void:
	var occupied: Array[Vector2i] = [Vector2i(-2, 3), Vector2i(16, -1)]
	var plan := BaseGrounds.plan(_rect(0, 0, 15, 10), occupied, WIDTH)
	var radius := plan.clear_radius
	assert_int(plan.stage).is_equal(BaseGrounds.Stage.CLEARED)
	assert_int(radius).is_equal(3)
	assert_array(plan.posts).is_empty()
	var cleared: Dictionary = {}
	for cell: Vector2i in plan.cleared:
		var away := _away(cell, 0, 0, 15, 10)
		assert_int(away).is_between(1, radius + 1)
		assert_bool(cell in occupied).is_false()
		cleared[cell] = true
	var ragged := 0
	for y: int in range(-radius - 1, 10 + radius + 1):
		for x: int in range(-radius - 1, 15 + radius + 1):
			var cell := Vector2i(x, y)
			var away := _away(cell, 0, 0, 15, 10)
			if away >= 1 and away <= radius and cell not in occupied:
				assert_bool(cleared.has(cell)).override_failure_message("not cleared: %s" % cell).is_true()
			if away == radius + 1 and cleared.has(cell):
				ragged += 1
	# About half of the ring beyond is cleared.
	var beyond := 2 * (15 + 10 + 4 * (radius + 1)) - 4
	assert_int(ragged * 4).is_between(beyond, beyond * 3)


func test_the_fence_is_a_closed_ring_outside_the_masts() -> void:
	var plan := BaseGrounds.plan(_rect(0, 0, 40, 38), [], WIDTH)
	var d := BaseGrounds.FENCE_DISTANCE
	assert_int(plan.stage).is_equal(BaseGrounds.Stage.FENCED)
	assert_int(plan.barrier).is_equal(BaseGrounds.Barrier.FENCE)
	assert_array(plan.paved).is_empty()
	assert_int(plan.posts.size()).is_equal(2 * (40 + 2 * d + 38 + 2 * d) - 4)
	var posts := _posts_by_cell(plan)
	for post: BaseGrounds.Post in plan.posts:
		assert_int(_away(post.cell, 0, 0, 40, 38)).is_equal(d)
		assert_bool(post.gate).is_false()
		# Every post joins two others: along a side or round a corner.
		var links := 0
		for bit: int in [BaseGrounds.NORTH, BaseGrounds.EAST, BaseGrounds.SOUTH, BaseGrounds.WEST]:
			if post.links & bit:
				links += 1
		assert_int(links).is_equal(2)
	var corner: BaseGrounds.Post = posts[Vector2i(-d, -d)]
	assert_int(corner.links).is_equal(BaseGrounds.NORTH | BaseGrounds.EAST)
	var side: BaseGrounds.Post = posts[Vector2i(10, 38 + d - 1)]
	assert_int(side.links).is_equal(BaseGrounds.EAST | BaseGrounds.WEST)


func test_the_fence_follows_an_inner_corner() -> void:
	# An L: 40×30 with a 30×20 arm on top of its left part.
	var footprint := _rect(0, 0, 40, 30)
	footprint.append_array(_rect(0, 30, 30, 20))
	var plan := BaseGrounds.plan(footprint, [], WIDTH)
	var d := BaseGrounds.FENCE_DISTANCE
	var posts := _posts_by_cell(plan)
	# The inner corner of the line lies d out from the L's inner corner (29, 29) on both axes.
	var inner: BaseGrounds.Post = posts.get(Vector2i(29 + d, 29 + d))
	assert_object(inner).is_not_null()
	assert_int(inner.links).is_equal(BaseGrounds.NORTH | BaseGrounds.EAST)
	for post: BaseGrounds.Post in plan.posts:
		var away := mini(_away(post.cell, 0, 0, 40, 30), _away(post.cell, 0, 30, 30, 20))
		assert_int(away).is_equal(d)


func test_the_fence_opens_before_the_docks() -> void:
	var footprint := _rect(0, 0, 40, 38)
	var docks: Array[Vector2i] = [Vector2i(39, 18), Vector2i(39, 19)]
	var plan := BaseGrounds.plan(footprint, [], WIDTH, docks)
	var d := BaseGrounds.FENCE_DISTANCE
	var posts := _posts_by_cell(plan)
	var gap := BaseGrounds.GATE_REACH
	for y: int in range(18 - gap, 19 + gap + 1):
		assert_bool(posts.has(Vector2i(39 + d, y))).override_failure_message("fence in the gap at y %d" % y).is_false()
	var below: BaseGrounds.Post = posts[Vector2i(39 + d, 18 - gap - 1)]
	var above: BaseGrounds.Post = posts[Vector2i(39 + d, 19 + gap + 1)]
	assert_bool(below.gate).is_true()
	assert_int(below.links).is_equal(BaseGrounds.SOUTH)
	assert_bool(above.gate).is_true()
	assert_int(above.links).is_equal(BaseGrounds.NORTH)
	var gates := 0
	for post: BaseGrounds.Post in plan.posts:
		if post.gate:
			gates += 1
	assert_int(gates).is_equal(2)


func test_the_fence_leaves_other_structures_alone() -> void:
	var d := BaseGrounds.FENCE_DISTANCE
	var occupied := _rect(10, -d - 1, 3, 2)
	var plan := BaseGrounds.plan(_rect(0, 0, 40, 38), occupied, WIDTH)
	var posts := _posts_by_cell(plan)
	for cell: Vector2i in occupied:
		assert_bool(posts.has(cell)).is_false()
	assert_bool((posts[Vector2i(9, -d)] as BaseGrounds.Post).gate).is_true()
	assert_bool((posts[Vector2i(13, -d)] as BaseGrounds.Post).gate).is_true()


func test_a_courtyard_gets_no_fence_and_is_paved() -> void:
	# A 100×100 square with a 30×30 courtyard: 9 100 hulls.
	var footprint: Array[Vector2i] = []
	for cell: Vector2i in _rect(0, 0, 100, 100):
		if cell.x < 35 or cell.x >= 65 or cell.y < 35 or cell.y >= 65:
			footprint.append(cell)
	var plan := BaseGrounds.plan(footprint, [], WIDTH)
	assert_int(plan.stage).is_equal(BaseGrounds.Stage.PAVED)
	for post: BaseGrounds.Post in plan.posts:
		assert_int(_away(post.cell, 0, 0, 100, 100)).is_equal(BaseGrounds.FENCE_DISTANCE)
	var paved: Dictionary = {}
	for cell: Vector2i in plan.paved:
		paved[cell] = true
	for cell: Vector2i in _rect(35, 35, 30, 30):
		assert_bool(paved.has(cell)).override_failure_message("courtyard not paved: %s" % cell).is_true()


func test_concrete_reaches_from_the_base_to_the_fence() -> void:
	var d := BaseGrounds.FENCE_DISTANCE
	var occupied: Array[Vector2i] = [Vector2i(-2, 5)]
	var plan := BaseGrounds.plan(_rect(0, 0, 90, 84), occupied, WIDTH)
	assert_int(plan.stage).is_equal(BaseGrounds.Stage.PAVED)
	assert_int(plan.barrier).is_equal(BaseGrounds.Barrier.FENCE)
	assert_int(plan.paved.size()).is_equal((90 + 2 * d) * (84 + 2 * d) - 90 * 84 - 1)
	assert_int(plan.outward.size()).is_equal(plan.paved.size())
	for index: int in plan.paved.size():
		var cell := plan.paved[index]
		var away := _away(cell, 0, 0, 90, 84)
		assert_int(away).is_between(1, d)
		# Only the fence's own cells stop at its line.
		if away < d:
			assert_int(plan.outward[index]).is_equal(0)
		if cell == Vector2i(-d, -d):
			assert_int(plan.outward[index]).is_equal(BaseGrounds.WEST | BaseGrounds.SOUTH | BaseGrounds.SOUTH_WEST
				| BaseGrounds.NORTH_WEST | BaseGrounds.SOUTH_EAST)
		if cell == Vector2i(10, -d):
			assert_int(plan.outward[index]).is_equal(BaseGrounds.SOUTH | BaseGrounds.SOUTH_EAST | BaseGrounds.SOUTH_WEST)
	assert_bool(Vector2i(-2, 5) in plan.paved).is_false()


func test_a_very_large_base_gets_a_wall() -> void:
	var plan := BaseGrounds.plan(_rect(0, 0, 100, 100), [], WIDTH)
	assert_int(plan.stage).is_equal(BaseGrounds.Stage.WALLED)
	assert_int(plan.barrier).is_equal(BaseGrounds.Barrier.WALL)
	assert_int(plan.posts.size()).is_equal(4 * (100 + 2 * BaseGrounds.FENCE_DISTANCE) - 4)
	assert_bool(plan.paved.is_empty()).is_false()


func test_the_same_base_gives_the_same_grounds_in_any_order() -> void:
	var footprint := _rect(0, 0, 40, 38)
	var shuffled := footprint.duplicate()
	shuffled.reverse()
	var docks: Array[Vector2i] = [Vector2i(0, 10)]
	var first := BaseGrounds.plan(footprint, [], WIDTH, docks)
	var again := BaseGrounds.plan(shuffled, [], WIDTH, docks)
	assert_array(_post_lines(again)).is_equal(_post_lines(first))
	assert_array(_sorted(again.cleared)).is_equal(_sorted(first.cleared))


func test_the_seam_of_the_body_changes_nothing() -> void:
	var size_x := 500
	var across := _rect(480, 10, 40, 38)
	var wrapped: Array[Vector2i] = []
	for cell: Vector2i in across:
		wrapped.append(Vector2i(WorldGrid.wrap_x(cell.x, size_x), cell.y))
	var docks: Array[Vector2i] = [Vector2i(519, 20)]
	var from_absolute := BaseGrounds.plan(across, [Vector2i(-25, 10)], size_x, docks)
	var from_wrapped := BaseGrounds.plan(wrapped, [Vector2i(475, 10)], size_x, [Vector2i(19, 20)])
	assert_array(_post_lines(from_wrapped)).is_equal(_post_lines(from_absolute))
	assert_array(_sorted(from_wrapped.cleared)).is_equal(_sorted(from_absolute.cleared))
	assert_int(from_absolute.posts.size()).is_greater(0)
	for post: BaseGrounds.Post in from_absolute.posts:
		assert_int(post.cell.x).is_between(0, size_x - 1)
		assert_bool(post.cell == Vector2i(475, 10)).is_false()


func test_growing_the_base_changes_the_fence_only_nearby() -> void:
	var before := _rect(0, 0, 40, 38)
	var after := before.duplicate()
	after.append_array(_rect(40, 10, 3, 3))
	var near := Rect2i(Vector2i(30, 0), Vector2i(25, 25))
	assert_array(_far_from(BaseGrounds.plan(after, [], WIDTH), near)).is_equal(
		_far_from(BaseGrounds.plan(before, [], WIDTH), near))


static func _far_from(plan: BaseGrounds.Plan, near: Rect2i) -> Array[String]:
	var lines: Array[String] = []
	for post: BaseGrounds.Post in plan.posts:
		if not near.has_point(post.cell):
			lines.append("%s %d" % [post.cell, post.links])
	lines.sort()
	return lines
