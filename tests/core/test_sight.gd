extends GdUnitTestSuite
## Sight (draft.25): the spheres and telescopes as the server sends them, the upgrade preview and
## the circles the galaxy map draws.


## A ground telescope at level 1 as the live server sent it (`GET /v2/sight`, 2026-11-19).
static func telescope_wire() -> Dictionary:
	return {"structureId": 208, "moduleId": 217, "moduleType": "TELESCOPE_MODULE", "kind": "ground",
		"x": 4, "y": 1, "z": 0, "level": 1, "rangeLy": 10.0, "effective": true,
		"next": {"level": 2, "rangeLy": 14.0, "durationMs": 2520000.0, "cost": [
			{"resource": "ELECTRONICS", "amount": 1600000000.0},
			{"resource": "GLASS", "amount": 960000000.0},
			{"resource": "SILICON_WAFER", "amount": 640000000.0}]}}


static func sight_wire() -> Dictionary:
	return {"rev": 160, "gameTime": 4053840.0, "observations": [
		{"center": {"x": 4860.03, "y": -3667.26, "z": 37.49}, "radiusLy": 10.0, "since": 4050636.0, "source": "telescope"},
		{"center": {"x": 4900.0, "y": -3600.0, "z": 0.0}, "radiusLy": 0.0, "since": 1.0, "source": "structure"}],
		"telescopes": [telescope_wire()]}


func test_sight_reads_observations_and_telescopes() -> void:
	var sight := Sight.from_wire(sight_wire())

	assert_int(sight.observations.size()).is_equal(2)
	var first := sight.observations[0]
	assert_vector(first.centre).is_equal_approx(Vector3(4860.03, -3667.26, 37.49), Vector3(0.001, 0.001, 0.001))
	assert_float(first.radius_ly).is_equal(10.0)
	assert_int(first.since).is_equal(4050636)
	assert_bool(first.is_telescope()).is_true()
	assert_bool(sight.observations[1].is_telescope()).is_false()
	assert_int(sight.telescopes.size()).is_equal(1)


func test_telescope_reads_level_range_and_next_level() -> void:
	var telescope := Sight.telescope_from_wire(telescope_wire())

	assert_int(telescope.structure_id).is_equal(208)
	assert_int(telescope.module_id).is_equal(217)
	assert_str(telescope.kind).is_equal("ground")
	assert_vector(telescope.cell).is_equal(Vector3i(4, 1, 0))
	assert_int(telescope.level).is_equal(1)
	assert_float(telescope.range_ly).is_equal(10.0)
	assert_bool(telescope.effective).is_true()
	assert_bool(telescope.is_upgrading()).is_false()
	assert_bool(telescope.has_next()).is_true()
	assert_int(telescope.next_level).is_equal(2)
	assert_float(telescope.next_range_ly).is_equal(14.0)
	assert_int(telescope.next_duration_ms).is_equal(2520000)
	assert_int(telescope.next_cost.size()).is_equal(3)
	assert_str(telescope.next_cost[0].resource).is_equal("ELECTRONICS")
	assert_int(telescope.next_cost[0].amount).is_equal(1600000000)


func test_running_upgrade_and_highest_level() -> void:
	var wire := telescope_wire()
	wire["upgrade"] = {"to": 2, "completesAt": 4100000.0}
	var running := Sight.telescope_from_wire(wire)
	assert_bool(running.is_upgrading()).is_true()
	assert_int(running.upgrade_to).is_equal(2)
	assert_int(running.completes_at).is_equal(4100000)

	var top := telescope_wire()
	top["level"] = 20
	top.erase("next")
	var highest := Sight.telescope_from_wire(top)
	assert_bool(highest.has_next()).is_false()
	assert_int(highest.next_cost.size()).is_equal(0)


func test_malformed_entries_are_skipped() -> void:
	assert_object(Sight.telescope_from_wire({"level": 1})).is_null()
	assert_object(Sight.observation_from_wire({"radiusLy": 3.0})).is_null()
	var sight := Sight.from_wire({"observations": "nope"})
	assert_int(sight.observations.size()).is_equal(0)
	assert_int(sight.telescopes.size()).is_equal(0)


func test_upgrade_block_in_order_of_importance() -> void:
	var telescope := Sight.telescope_from_wire(telescope_wire())
	var rich := {"ELECTRONICS": 2000000000, "GLASS": 1000000000, "SILICON_WAFER": 700000000}
	var poor := {"ELECTRONICS": 1005000000, "GLASS": 1000000000, "SILICON_WAFER": 700000000}

	assert_int(telescope.upgrade_block(false, rich, true)).is_equal(Sight.Block.UPGRADE_OK)
	assert_int(telescope.upgrade_block(false, poor, true)).is_equal(Sight.Block.STOCK)
	assert_array(Array(telescope.lacking(poor))).contains_exactly(["ELECTRONICS"])
	# An unknown store does not block: the server decides.
	assert_int(telescope.upgrade_block(false, {}, false)).is_equal(Sight.Block.UPGRADE_OK)
	assert_int(telescope.upgrade_block(true, rich, true)).is_equal(Sight.Block.BUILDING)
	telescope.upgrade_to = 2
	assert_int(telescope.upgrade_block(false, rich, true)).is_equal(Sight.Block.RUNNING)
	telescope.next_level = 0
	assert_int(telescope.upgrade_block(false, rich, true)).is_equal(Sight.Block.MAX_LEVEL)


func test_best_range_counts_only_effective_telescopes() -> void:
	var sight := Sight.from_wire(sight_wire())
	assert_float(sight.best_range_ly()).is_equal(10.0)
	assert_int(sight.idle_count()).is_equal(0)
	sight.telescopes[0].effective = false
	assert_float(sight.best_range_ly()).is_equal(0.0)
	assert_int(sight.idle_count()).is_equal(1)


func test_covers_inside_a_sphere_only() -> void:
	var sight := Sight.from_wire(sight_wire())
	assert_bool(sight.covers(Vector3(4865.0, -3667.0, 37.0))).is_true()
	assert_bool(sight.covers(Vector3(4900.0, -3600.0, 0.0))).is_true()
	assert_bool(sight.covers(Vector3(4880.0, -3667.0, 37.0))).is_false()


func test_by_module_and_is_telescope() -> void:
	var map := Sight.by_module(Sight.telescopes_from_wire(sight_wire()))
	assert_bool(map.has(217)).is_true()
	assert_bool(Sight.is_telescope("SPACE_TELESCOPE_MODULE")).is_true()
	assert_bool(Sight.is_telescope("MINE")).is_false()


func test_ly_text_rounds_like_players_read_it() -> void:
	assert_str(Sight.ly_text(14.0)).is_equal("14")
	assert_str(Sight.ly_text(1442.4)).is_equal("1 442")
	assert_str(Sight.ly_text(9.84)).is_equal("9.8")


func test_radius_px_follows_zoom_and_scale() -> void:
	assert_float(Sight.radius_px(10.0, 1.0, 0.05)).is_equal_approx(200.0, 0.001)
	assert_float(Sight.radius_px(10.0, 2.0, 0.05)).is_equal_approx(100.0, 0.001)
	assert_float(Sight.radius_px(10.0, 1.0, 0.0)).is_equal(0.0)


func test_pick_circles_keeps_visible_ones_largest_first() -> void:
	var view := Rect2(0, 0, 720, 1000)
	var circles: Array[Vector4] = [
		Vector4(100, 100, 30, 1),
		Vector4(-500, 100, 100, 1),
		Vector4(-50, 500, 60, 0),
		Vector4(300, 300, 2, 1),
	]
	var kept := Sight.pick_circles(circles, view, 10.0, 8, 12.0)
	assert_int(kept.size()).is_equal(3)
	assert_float(kept[0].z).is_equal(60.0)
	assert_float(kept[1].z).is_equal(30.0)
	# The tiny one grew to the minimum.
	assert_float(kept[2].z).is_equal(12.0)
	assert_int(Sight.pick_circles(circles, view, 10.0, 1, 12.0).size()).is_equal(1)


func test_veil_fades_out_towards_the_whole_galaxy() -> void:
	assert_float(Sight.veil_share(100.0, 400.0, 40000.0, 0.5, 0.1)).is_equal(0.5)
	assert_float(Sight.veil_share(40000.0, 400.0, 40000.0, 0.5, 0.1)).is_equal_approx(0.1, 0.0001)
	assert_float(Sight.veil_share(4000.0, 400.0, 40000.0, 0.5, 0.1)).is_equal_approx(0.3, 0.0001)
