extends GdUnitTestSuite

const SECTOR := Vector3(50, 50, 50)


func _row(id: String, x: float, y: float, z: float, luminosity: float = 1.0) -> String:
	return JSON.stringify({"systemId": id, "position": {"x": x, "y": y, "z": z},
		"star": {"name": "Star " + id, "type": "G", "temperature": 5600.0, "luminosity": luminosity, "mass": 1.0},
		"planetCount": 7.0})


## An answer as `GET /v2/galaxy/systems` streams it (hand-written after the contract, draft.24).
func _stream(rows: PackedStringArray, end: String) -> Ndjson:
	var lines := PackedStringArray()
	lines.append('{"rev":700,"gameTime":17300000,"x":0.0,"y":0.0,"z":0.0,"radius":100.0,"sectors":64,"maxSystems":20000,"visibility":"all"}')
	lines.append_array(rows)
	if not end.is_empty():
		lines.append(end)
	return Ndjson.parse("\n".join(lines) + "\n")


func test_entry_from_wire_reads_position_star_and_planets() -> void:
	var entry := GalaxySystems.entry_from_wire(Wire.parse_object(_row("sys-0_0_0-3", 12.5, -7.25, 1.0, 0.4)))

	assert_str(entry.id).is_equal("sys-0_0_0-3")
	assert_vector(entry.position).is_equal(Vector3(12.5, -7.25, 1.0))
	assert_str(entry.name).is_equal("Star sys-0_0_0-3")
	assert_str(entry.star_type).is_equal("G")
	assert_float(entry.kelvin).is_equal(5600.0)
	assert_float(entry.luminosity).is_equal(0.4)
	assert_float(entry.mass).is_equal(1.0)
	assert_int(entry.planet_count).is_equal(7)


func test_entry_from_wire_reads_the_draft_30_star() -> void:
	var row := {"systemId": "sys-12_-3_0-417", "position": {"x": 1.0, "y": 2.0, "z": 0.0}, "planetCount": 5.0,
		"star": {"name": "Brevan Thakoris", "type": "RED_GIANT", "temperature": 4100.0, "luminosity": 380.0,
			"mass": 1.4, "radius": 38.5, "spectralClass": "K3 III", "catalog": "TEC 12:-3:0/417"}}
	var entry := GalaxySystems.entry_from_wire(row)

	assert_float(entry.radius).is_equal(38.5)
	assert_str(entry.spectral_class).is_equal("K3 III")
	assert_str(entry.catalog).is_equal("TEC 12:-3:0/417")


func test_entry_from_wire_without_the_draft_30_fields() -> void:
	var entry := GalaxySystems.entry_from_wire(Wire.parse_object(_row("sys-0_0_0-3", 1.0, 2.0, 3.0)))

	assert_float(entry.radius).is_equal(0.0)
	assert_str(entry.spectral_class).is_empty()
	assert_str(entry.catalog).is_empty()


func test_entry_without_id_is_null() -> void:
	assert_object(GalaxySystems.entry_from_wire({"position": {"x": 1, "y": 2, "z": 3}})).is_null()


func test_entry_from_system_counts_planets_only() -> void:
	var system := {"systemId": "sys--110_49_-1-101", "position": {"x": -5485.81, "y": 2481.66, "z": -15.44},
		"star": {"name": "Chi Carinae", "type": "M", "temperature": 3669.0, "luminosity": 0.078, "mass": 0.441},
		"bodies": [{"bodyType": "PLANET"}, {"bodyType": "MOON"}, {"bodyType": "PLANET"}, {"bodyType": "ASTEROID"}]}
	var entry := GalaxySystems.entry_from_system(system)

	assert_str(entry.name).is_equal("Chi Carinae")
	assert_vector(entry.position).is_equal(Vector3(-5485.81, 2481.66, -15.44))
	assert_int(entry.planet_count).is_equal(2)


func test_a_full_answer_covers_its_radius() -> void:
	var stream := _stream([_row("sys-0_0_0-0", 10, 10, 0), _row("sys-1_0_0-0", 60, 5, 0)],
		'{"end":true,"rows":2,"truncated":false}')
	var answer := GalaxySystems.from_stream(stream, Vector3(1, 1, 1), 90.0, SECTOR)

	assert_int(answer.entries.size()).is_equal(2)
	assert_bool(answer.ended).is_true()
	assert_bool(answer.truncated).is_false()
	assert_int(answer.rows).is_equal(2)
	# The header's sphere wins over the one asked for.
	assert_vector(answer.centre).is_equal(Vector3.ZERO)
	assert_float(answer.radius).is_equal(100.0)
	assert_float(answer.covered).is_equal(100.0)


func test_a_truncated_answer_covers_up_to_its_farthest_complete_sector() -> void:
	# The last row lies in sector (1, 0, 0), centre (75, 25, 25) → 83.0 from the centre; minus
	# half a sector diagonal (43.3) → 39.7.
	var stream := _stream([_row("sys-0_0_0-0", 10, 10, 0), _row("sys-1_0_0-0", 60, 5, 0)],
		'{"end":true,"rows":2,"truncated":true}')
	var answer := GalaxySystems.from_stream(stream, Vector3.ZERO, 100.0, SECTOR)

	assert_bool(answer.truncated).is_true()
	assert_float(answer.covered).is_equal_approx(Vector3(75, 25, 25).length() - SECTOR.length() * 0.5, 0.001)


func test_an_answer_without_end_line_counts_as_cut() -> void:
	var stream := _stream([_row("sys-0_0_0-0", 10, 10, 0)], "")
	var answer := GalaxySystems.from_stream(stream, Vector3.ZERO, 100.0, SECTOR)

	assert_bool(answer.ended).is_false()
	assert_bool(answer.truncated).is_true()
	assert_int(answer.rows).is_equal(-1)
	assert_float(answer.covered).is_less(100.0)


func test_an_empty_answer_is_complete() -> void:
	var answer := GalaxySystems.from_stream(_stream([], '{"end":true,"rows":0,"truncated":false}'), Vector3.ZERO, 100.0, SECTOR)

	assert_int(answer.entries.size()).is_equal(0)
	assert_float(answer.covered).is_equal(100.0)


func test_rows_are_kept_once() -> void:
	var stream := _stream([_row("sys-0_0_0-0", 10, 10, 0), _row("sys-0_0_0-0", 10, 10, 0)],
		'{"end":true,"rows":2,"truncated":false}')

	assert_int(GalaxySystems.from_stream(stream, Vector3.ZERO, 100.0, SECTOR).entries.size()).is_equal(1)


func test_covered_radius_of_a_full_answer_is_its_radius() -> void:
	var none: Array[GalaxySystems.Entry] = []

	assert_float(GalaxySystems.covered_radius(Vector3.ZERO, 80.0, false, none, SECTOR)).is_equal(80.0)
	assert_float(GalaxySystems.covered_radius(Vector3.ZERO, 80.0, true, none, SECTOR)).is_equal(0.0)


func test_sector_of_system_reads_the_id() -> void:
	assert_vector(GalaxySystems.sector_of_system("sys--110_49_-1-101", Vector3.ZERO, SECTOR)).is_equal(Vector3i(-110, 49, -1))
	# A system on its sector's upper edge: the id knows the sector, the position would not.
	assert_vector(GalaxySystems.sector_of_system("sys-0_0_0-4", Vector3(50, 0, 0), SECTOR)).is_equal(Vector3i(0, 0, 0))
	assert_vector(GalaxySystems.sector_of_system("odd", Vector3(-1, 51, 0), SECTOR)).is_equal(Vector3i(-1, 1, 0))


func test_system_of_body_follows_the_id_format() -> void:
	assert_str(GalaxySystems.system_of_body("planet-sys--110_49_-1-101-1")).is_equal("sys--110_49_-1-101")
	assert_str(GalaxySystems.system_of_body("planet-sys-3_4_0-12-0-moon-2")).is_equal("sys-3_4_0-12")
	assert_str(GalaxySystems.system_of_body("structure-5")).is_equal("")
	assert_str(GalaxySystems.system_of_body("planet-nothing")).is_equal("")


func test_own_systems_are_sorted_and_unique() -> void:
	var own := GalaxySystems.own_systems(["planet-sys-2_0_0-1-0", "planet-sys-1_0_0-4-2-moon-0",
		"planet-sys-2_0_0-1-3", "junk"])

	assert_array(Array(own)).is_equal(["sys-1_0_0-4", "sys-2_0_0-1"])


func test_star_size_grows_with_luminosity_within_limits() -> void:
	assert_float(GalaxySystems.star_px(1.0)).is_equal(4.0)
	assert_float(GalaxySystems.star_px(10.0)).is_equal_approx(5.4, 0.0001)
	assert_float(GalaxySystems.star_px(0.0)).is_equal(2.0)
	assert_float(GalaxySystems.star_px(1.0e9)).is_equal(10.0)


func test_pick_takes_the_nearest_within_reach_from_above() -> void:
	var entries: Array[GalaxySystems.Entry] = []
	for row: String in [_row("a", 0, 0, 40), _row("b", 10, 0, -40), _row("c", 100, 100, 0)]:
		entries.append(GalaxySystems.entry_from_wire(Wire.parse_object(row)))

	assert_int(GalaxySystems.pick(entries, Vector2(7, 1), 5.0)).is_equal(1)
	assert_int(GalaxySystems.pick(entries, Vector2(50, 50), 5.0)).is_equal(-1)


func test_store_covers_inside_a_loaded_sphere_only() -> void:
	var store := GalaxySystems.new()
	var answer := GalaxySystems.from_stream(_stream([_row("sys-0_0_0-0", 10, 10, 0)],
		'{"end":true,"rows":1,"truncated":false}'), Vector3.ZERO, 100.0, SECTOR)
	store.add(answer)

	assert_bool(store.covers(Vector3(20, 0, 0), 80.0)).is_true()
	assert_bool(store.covers(Vector3(30, 0, 0), 80.0)).is_false()
	assert_object(store.find("sys-0_0_0-0")).is_not_null()
	assert_object(store.find("nope")).is_null()


func test_store_merges_spheres_and_drops_the_oldest() -> void:
	var store := GalaxySystems.new()
	for index: int in GalaxySystems.MAX_SPHERES + 1:
		var rows := PackedStringArray([_row("sys-0_0_0-0", 1, 1, 0), _row("sys-9_0_0-%d" % index, 460, 0, 0)])
		store.add(GalaxySystems.from_stream(_stream(rows, '{"end":true,"rows":2,"truncated":false}'), Vector3.ZERO, 100.0, SECTOR))

	assert_int(store.spheres.size()).is_equal(GalaxySystems.MAX_SPHERES)
	# One shared system plus one of each kept sphere.
	assert_int(store.entries().size()).is_equal(1 + GalaxySystems.MAX_SPHERES)
	assert_object(store.find("sys-9_0_0-0")).is_null()
	store.clear()
	assert_int(store.entries().size()).is_equal(0)


func test_area_density_spreads_the_rows_over_their_disc() -> void:
	var stream := _stream([_row("sys-0_0_0-0", 10, 0, 30), _row("sys-0_0_0-1", 0, -20, 0)],
		'{"end":true,"rows":2,"truncated":false}')
	var answer := GalaxySystems.from_stream(stream, Vector3.ZERO, 100.0, SECTOR)

	assert_float(GalaxySystems.area_density(answer)).is_equal_approx(2.0 / (PI * 400.0), 0.000001)
	var empty := GalaxySystems.from_stream(_stream([], '{"end":true,"rows":0,"truncated":false}'), Vector3.ZERO, 100.0, SECTOR)
	assert_float(GalaxySystems.area_density(empty)).is_equal(0.0)
