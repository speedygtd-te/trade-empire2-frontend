extends GdUnitTestSuite

## Shape of a real draft.31 answer of the live server (a fresh base), plus a probe area, a drive
## and a sighting in the contract's shape.
const ANSWER := {
	"rev": 519, "gameTime": 8765832, "bodyId": "planet-sys-96_-73_1-72-1", "fog": true,
	"areas": [
		{"x0": 8, "y0": -4, "x1": 8, "y1": -4, "radius": 1000, "since": 8704587, "source": "structure"},
		{"x0": 40000, "y0": 100, "x1": 40000, "y1": 100, "radius": 5000, "since": 9000000, "source": "probe"},
		{"x0": 98000, "y0": 10000, "x1": 2000, "y1": 10000, "radius": 1000, "since": 9100000, "source": "vehicle"},
	],
	"sightings": [
		{"structureId": 51, "ownerId": 7, "ownerName": "Mira", "x": 40100, "y": 120, "hulls": 30,
			"seenAt": 9000000, "probeId": 3},
	],
}
const SIZE_X := 100000


func test_reads_areas_and_sightings() -> void:
	var map := RevealMap.from_wire(ANSWER)

	assert_str(map.body_id).is_equal("planet-sys-96_-73_1-72-1")
	assert_bool(map.fog).is_true()
	assert_int(map.areas.size()).is_equal(3)
	assert_int(map.areas[0].radius).is_equal(1000)
	assert_str(map.areas[1].source).is_equal(RevealMap.SOURCE_PROBE)
	assert_int(map.sightings.size()).is_equal(1)
	var seen := map.sightings[0]
	assert_str(seen.owner_name).is_equal("Mira")
	assert_int(seen.hulls).is_equal(30)
	assert_int(seen.seen_at).is_equal(9000000)
	assert_int(seen.footprint_side()).is_equal(6)


func test_a_disc_covers_up_to_its_radius() -> void:
	var map := RevealMap.from_wire(ANSWER)

	assert_bool(map.is_revealed(8, -4, SIZE_X)).is_true()
	# Exactly 1 000 cells east: inside (the live server reveals x = 1008 on row −4).
	assert_bool(map.is_revealed(1008, -4, SIZE_X)).is_true()
	assert_bool(map.is_revealed(1009, -4, SIZE_X)).is_false()
	# (0, 996) is 1 000.03 cells away: outside, as on the live server.
	assert_bool(map.is_revealed(0, 996, SIZE_X)).is_false()
	assert_bool(map.is_revealed(43000, 100, SIZE_X)).is_true()


func test_a_capsule_runs_over_the_seam() -> void:
	var map := RevealMap.from_wire(ANSWER)

	# The drive from x 98 000 across the seam to x 2 000 (= 102 000).
	assert_bool(map.is_revealed(99500, 10900, SIZE_X)).is_true()
	assert_bool(map.is_revealed(1500, 9100, SIZE_X)).is_true()
	assert_bool(map.is_revealed(99500, 11100, SIZE_X)).is_false()
	# Wrapped copies of the same cells.
	assert_bool(map.is_revealed(-500, 10000, SIZE_X)).is_true()
	assert_bool(map.is_revealed(201500, 10000, SIZE_X)).is_true()


func test_without_fog_everything_is_explored() -> void:
	var old := ANSWER.duplicate(true)
	old["fog"] = false
	var map := RevealMap.from_wire(old)

	assert_bool(map.is_revealed(70000, 3000, SIZE_X)).is_true()
	assert_float(map.explored_share(SIZE_X, 1000)).is_equal(1.0)


func test_footprint_must_be_explored_cell_by_cell() -> void:
	var map := RevealMap.from_wire(ANSWER)
	var inside: Array[Vector3i] = [Vector3i(1007, -4, 0), Vector3i(1008, -4, 0)]
	var across: Array[Vector3i] = [Vector3i(1008, -4, 0), Vector3i(1009, -4, 0)]

	assert_bool(map.covers_all(inside, SIZE_X)).is_true()
	assert_bool(map.covers_all(across, SIZE_X)).is_false()


func test_newest_probe_area_and_count() -> void:
	var map := RevealMap.from_wire(ANSWER)

	assert_int(map.probe_count()).is_equal(1)
	assert_that(map.newest_probe_area().centre()).is_equal(Vector2i(40000, 100))
	assert_object(RevealMap.from_wire({"areas": []}).newest_probe_area()).is_null()


func test_explored_share_adds_the_areas_up() -> void:
	var map := RevealMap.from_wire({"fog": true, "areas": [
		{"x0": 0, "y0": 0, "x1": 0, "y1": 0, "radius": 100, "since": 1, "source": "probe"}]})

	assert_float(map.explored_share(1000, 1000)).is_equal_approx(PI * 0.01, 0.0001)
	assert_float(map.explored_share(10, 10)).is_equal(1.0)


func test_other_answers_are_no_map() -> void:
	assert_object(RevealMap.from_wire({"error": "NOT_FOUND"})).is_null()
