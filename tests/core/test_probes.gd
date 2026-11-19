extends GdUnitTestSuite

## A `ProbesResponse` in the contract's shape (draft.31), newest first.
const ANSWER := {
	"rev": 600, "gameTime": 100000,
	"probes": [
		{"probeId": 2, "structureId": 302, "moduleId": 330, "bodyId": "moon-1", "x": 1200, "y": -40,
			"radius": 5000, "launchedAt": 90000, "arrivesAt": 210000, "status": "flying"},
		{"probeId": 1, "structureId": 302, "moduleId": 330, "bodyId": "planet-1", "x": 50000, "y": 3,
			"radius": 5000, "launchedAt": 10000, "arrivesAt": 70000, "status": "arrived"},
	],
}


func test_reads_the_probes() -> void:
	var list := Probes.from_wire(ANSWER)

	assert_int(list.probes.size()).is_equal(2)
	var first := list.probes[0]
	assert_int(first.probe_id).is_equal(2)
	assert_str(first.body_id).is_equal("moon-1")
	assert_int(first.x).is_equal(1200)
	assert_int(first.y).is_equal(-40)
	assert_int(first.radius).is_equal(5000)
	assert_int(first.arrives_at).is_equal(210000)


func test_flight_state_follows_status_and_clock() -> void:
	var list := Probes.from_wire(ANSWER)
	var flying := list.find(2)

	assert_bool(flying.is_flying(100000)).is_true()
	assert_int(flying.remaining_ms(100000)).is_equal(110000)
	assert_float(flying.progress(150000)).is_equal_approx(0.5, 0.0001)
	# Past the arrival the clock says it is there, before the event comes.
	assert_bool(flying.is_flying(210000)).is_false()
	assert_bool(list.find(1).is_flying(20000)).is_false()
	assert_int(list.flying(100000).size()).is_equal(1)
	assert_int(list.to_body("planet-1").size()).is_equal(1)


func test_an_event_updates_or_adds_a_probe() -> void:
	var list := Probes.from_wire(ANSWER)
	var arrived := (ANSWER["probes"][0] as Dictionary).duplicate()
	arrived["status"] = "arrived"

	list.apply(arrived)
	assert_int(list.probes.size()).is_equal(2)
	assert_str(list.find(2).status).is_equal(Probes.STATUS_ARRIVED)

	var launched := {"probeId": 3, "structureId": 302, "moduleId": 330, "bodyId": "planet-1", "x": 0, "y": 0,
		"radius": 5000, "launchedAt": 120000, "arrivesAt": 180000, "status": "flying"}
	list.apply(launched)
	assert_int(list.probes.size()).is_equal(3)
	assert_int(list.probes[0].probe_id).is_equal(3)
	assert_object(list.apply({"status": "flying"})).is_null()


func test_launch_block_names_the_first_thing_to_fix() -> void:
	var scale := 1000000

	assert_int(Probes.launch_block(true, false, false, true, 0, scale, true)).is_equal(Probes.Block.BUILDING)
	assert_int(Probes.launch_block(false, true, false, false, 0, scale, true)).is_equal(Probes.Block.DISABLED)
	assert_int(Probes.launch_block(false, false, true, false, 0, scale, true)).is_equal(Probes.Block.MOVING)
	assert_int(Probes.launch_block(false, false, false, true, scale, scale, true)).is_equal(Probes.Block.NO_POWER)
	assert_int(Probes.launch_block(false, false, false, false, scale - 1, scale, true)).is_equal(Probes.Block.NO_PROBE)
	assert_int(Probes.launch_block(false, false, false, false, scale, scale, true)).is_equal(Probes.Block.LAUNCH_OK)
	# An unknown store does not block: the server checks.
	assert_int(Probes.launch_block(false, false, false, false, 0, scale, false)).is_equal(Probes.Block.LAUNCH_OK)


func test_launch_body_wraps_x_and_keeps_y_in_the_band() -> void:
	var body := Probes.launch_body(330, "moon-1", -10, 900, 1000, 1000)

	assert_dict(body).is_equal({"moduleId": 330, "bodyId": "moon-1", "x": 990, "y": 500})
	assert_int(typeof(body["x"])).is_equal(TYPE_INT)
	assert_int(Probes.launch_body(1, "b", 5, -900, 1000, 1000)["y"]).is_equal(-500)


func test_landed_probes_lie_on_their_body() -> void:
	var list := Probes.from_wire(ANSWER)

	assert_int(list.landed_on("planet-1", 100000).size()).is_equal(1)
	# The one under way lies there only once its arrival time passed.
	assert_int(list.landed_on("moon-1", 100000).size()).is_equal(0)
	assert_int(list.landed_on("moon-1", 210000).size()).is_equal(1)


func test_a_hull_over_the_cell_hides_the_wreck() -> void:
	var landed := Probes.from_wire(ANSWER).landed_on("planet-1", 100000)
	var impacts := Probes.impacts_by_cell(landed, "42", {}, 100000)

	assert_int(Probes.visible_wrecks(impacts, {}).size()).is_equal(1)
	assert_int(Probes.visible_wrecks(impacts, {Vector2i(50000, 3): true}).size()).is_equal(0)
	# Cells are wrapped; a probe sent to x = 150 000 lies on x = 50 000.
	var far := Probes.new()
	far.apply({"probeId": 5, "bodyId": "planet-1", "x": 150000, "y": 3, "launchedAt": 0, "arrivesAt": 1, "status": "arrived"})
	var far_impacts := Probes.impacts_by_cell(far.landed_on("planet-1", 10), "42", {}, 100000)
	assert_bool(far_impacts.has(Vector2i(50000, 3))).is_true()
	assert_int(Probes.visible_wrecks(far_impacts, {Vector2i(50000, 3): true}).size()).is_equal(0)


func test_impacts_from_the_surface_and_own_probes_merge_once_per_probe() -> void:
	var landed := Probes.from_wire(ANSWER).landed_on("planet-1", 100000)
	# The surface (draft.32) names the own probe 1 and a foreign one on the same cell, and another
	# foreign one elsewhere.
	var surface := {
		Vector2i(50000, 3): [Probes.Impact.from_wire({"probeId": 1, "ownerId": "42", "at": 70000}, 50000, 3),
			Probes.Impact.from_wire({"probeId": 9, "ownerId": "7", "at": 20000}, 50000, 3)],
		Vector2i(-10, 0): [Probes.Impact.from_wire({"probeId": 11, "ownerId": "7", "at": 5}, -10, 0)],
	}

	var impacts := Probes.impacts_by_cell(landed, "42", surface, 100000)

	assert_int(impacts.size()).is_equal(2)
	var here: Array = impacts[Vector2i(50000, 3)]
	assert_int(here.size()).is_equal(2)
	# Oldest first.
	assert_int((here[0] as Probes.Impact).probe_id).is_equal(9)
	assert_str((here[1] as Probes.Impact).owner_id).is_equal("42")
	assert_bool(impacts.has(Vector2i(99990, 0))).is_true()


func test_a_preview_names_flight_time_and_every_violated_condition() -> void:
	var good := Probes.Quote.from_wire({"rev": 1, "gameTime": 100, "ok": true, "errors": [], "flightMs": 60000, "arrivesAt": 60100})
	var bad := Probes.Quote.from_wire({"ok": false, "errors": ["SYSTEM_NOT_DISCOVERED", "NO_PROBE"], "flightMs": 3600000,
		"arrivesAt": 3600100})

	assert_bool(good.ok).is_true()
	assert_int(good.flight_ms).is_equal(60000)
	assert_int(good.arrives_at).is_equal(60100)
	assert_bool(bad.ok).is_false()
	assert_array(Array(bad.errors)).contains_exactly(["SYSTEM_NOT_DISCOVERED", "NO_PROBE"])


func test_supported_only_with_the_launcher_in_the_game_data() -> void:
	assert_bool(Probes.supported(null)).is_false()
	assert_bool(Probes.is_launcher("PROBE_LAUNCHER")).is_true()
	assert_bool(Probes.is_launcher("TELESCOPE_MODULE")).is_false()
