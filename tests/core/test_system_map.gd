extends GdUnitTestSuite

const EPSILON := 0.001


## A small system as the server sends it: two planets, the outer one with two moons, a belt.
func _system() -> Dictionary:
	return {
		"systemId": "sys-1_2_3-4",
		"star": {"name": "Nu Eridani", "type": "M", "temperature": 2678.0},
		"bodies": [
			_body("p0", "Nu Eridani Primus", "TOXIC", "PLANET", "", 4500.0, 0.4, 1000.0, 0.0),
			_body("p1", "Nu Eridani Quintus", "GAS_GIANT", "PLANET", "", 42500.0, 2.8, 4000.0, 90.0),
			_body("m1", "Nu Eridani Quintus II", "MOON_ICY", "MOON", "p1", 500.0, 0.034, 200.0, 180.0),
			_body("m0", "Nu Eridani Quintus I", "MOON_ROCKY", "MOON", "p1", 2000.0, 0.017, 100.0, 0.0),
			_body("b0", "Nu Eridani Belt-1", "ASTEROID_S", "ASTEROID", "", 60.0, 9.5, 9000.0, 270.0),
		],
		"deposits": [
			{"bodyId": "p0", "resourceType": "SULFUR", "abundance": 40.0, "quality": 64.0},
			{"bodyId": "p0", "resourceType": "AMMONIA", "abundance": 55.0, "quality": 67.0},
			{"bodyId": "b0", "resourceType": "IRON_ORE", "abundance": 70.0, "quality": 50.0},
		],
	}


func _body(id: String, name: String, type: String, kind: String, parent: String, radius_km: float,
		au: float, period: float, phase0: float) -> Dictionary:
	var body := {"bodyId": id, "name": name, "type": type, "bodyType": kind, "radiusKm": radius_km,
		"orbit": {"radiusAu": au, "periodS": period, "phase0": phase0, "inclination": 1.0, "node": 20.0}}
	if not parent.is_empty():
		body["parentBodyId"] = parent
	return body


func test_from_system_reads_the_star_and_every_body() -> void:
	var map := SystemMap.from_system(_system())

	assert_str(map.system_id).is_equal("sys-1_2_3-4")
	assert_str(map.star_name).is_equal("Nu Eridani")
	assert_str(map.star_type).is_equal("M")
	assert_float(map.star_kelvin).is_equal(2678.0)
	assert_int(map.bodies.size()).is_equal(5)
	assert_str(map.body("m0").parent_id).is_equal("p1")
	assert_object(map.body("nope")).is_null()


func test_moons_are_linked_to_their_planet_innermost_first() -> void:
	var map := SystemMap.from_system(_system())

	assert_array(Array(map.body("p1").moons)).is_equal(["m0", "m1"])
	assert_bool(map.body("m0").is_moon()).is_true()
	assert_bool(map.body("b0").is_belt()).is_true()
	assert_float(map.body("m1").ring).is_greater(map.body("m0").ring)


func test_a_moon_without_its_planet_circles_the_star() -> void:
	var data := _system()
	(data["bodies"] as Array).append(_body("lost", "Lost", "MOON_ROCKY", "MOON", "gone", 500.0, 12.0, 100.0, 0.0))

	var map := SystemMap.from_system(data)

	assert_bool(map.body("lost").is_moon()).is_false()
	assert_int(map.star_orbits().size()).is_equal(4)


func test_star_orbits_are_planets_and_belts_outwards() -> void:
	var map := SystemMap.from_system(_system())
	var ids: Array[String] = []
	for body: SystemMap.Body in map.star_orbits():
		ids.append(body.id)

	assert_array(ids).is_equal(["p0", "p1", "b0"])


func test_orbit_angle_runs_once_around_per_period() -> void:
	assert_float(SystemMap.orbit_angle(0.5, 100.0, 0.0)).is_equal_approx(0.5, EPSILON)
	assert_float(SystemMap.orbit_angle(0.0, 100.0, 25.0)).is_equal_approx(PI / 2.0, EPSILON)
	# A whole number of periods later the body is back at its start angle.
	assert_float(SystemMap.orbit_angle(0.5, 100.0, 300.0)).is_equal_approx(0.5, EPSILON)
	# Without a period the body stays where it starts.
	assert_float(SystemMap.orbit_angle(0.5, 0.0, 300.0)).is_equal_approx(0.5, EPSILON)


func test_orbit_angle_stays_exact_at_large_game_times() -> void:
	# Five years of game time against a two-day moon.
	var t := 5.0 * 365.0 * 86400.0 + 237261.0 / 4.0
	var expected := fposmod(SystemMap.orbit_angle(0.0, 237261.0, t), TAU)

	assert_float(expected).is_equal_approx(fposmod(TAU * t / 237261.0, TAU), 0.0001)


func test_on_ring_runs_counter_clockwise_on_screen() -> void:
	var east := SystemMap.on_ring(10.0, 0.0)
	var north := SystemMap.on_ring(10.0, PI / 2.0)

	assert_vector(east).is_equal_approx(Vector2(10.0, 0.0), Vector2(EPSILON, EPSILON))
	# A quarter turn later the body is above the star (screen y points down).
	assert_vector(north).is_equal_approx(Vector2(0.0, -10.0), Vector2(EPSILON, EPSILON))


func test_position_follows_the_orbit_and_moons_their_planet() -> void:
	var map := SystemMap.from_system(_system())
	var planet := map.body("p0")

	assert_vector(map.position("p0", 0.0)).is_equal_approx(Vector2(planet.ring, 0.0), Vector2(EPSILON, EPSILON))
	assert_vector(map.position("p0", 250.0)).is_equal_approx(Vector2(0.0, -planet.ring), Vector2(EPSILON, EPSILON))
	# The moon at phase 0 stands right of its planet, one ring out.
	var moon := map.body("m0")
	var host := map.position("p1", 0.0)
	assert_vector(map.position("m0", 0.0)).is_equal_approx(host + Vector2(moon.ring, 0.0), Vector2(EPSILON, EPSILON))
	assert_vector(map.position("unknown", 0.0)).is_equal(Vector2.ZERO)


func test_orbit_radii_grow_on_a_log_scale_when_there_is_room() -> void:
	var radii := SystemMap.orbit_radii(PackedFloat64Array([1.0, 2.0, 4.0]), PackedFloat64Array([5.0, 5.0, 5.0]))
	var first := SystemMap.STAR_RADIUS + SystemMap.CLEARANCE + 5.0
	var step := SystemMap.LOG_UNIT * log(2.0)

	assert_float(radii[0]).is_equal_approx(first, EPSILON)
	# Doubling the distance is the same step each time.
	assert_float(radii[1] - radii[0]).is_equal_approx(step, EPSILON)
	assert_float(radii[2] - radii[1]).is_equal_approx(step, EPSILON)


func test_orbit_radii_keep_moon_systems_apart() -> void:
	# Two close orbits, the inner with a wide moon system: the step makes room for it.
	var radii := SystemMap.orbit_radii(PackedFloat64Array([1.0, 1.1]), PackedFloat64Array([60.0, 10.0]))

	assert_float(radii[1] - radii[0]).is_equal_approx(60.0 + SystemMap.CLEARANCE + 10.0, EPSILON)
	assert_int(SystemMap.orbit_radii(PackedFloat64Array(), PackedFloat64Array()).size()).is_equal(0)


func test_layout_leaves_every_band_clear_of_the_next() -> void:
	var map := SystemMap.from_system(_system())
	var orbits := map.star_orbits()

	assert_float(orbits[0].ring - orbits[0].reach()).is_greater(SystemMap.STAR_RADIUS)
	for index: int in range(1, orbits.size()):
		var gap := (orbits[index].ring - orbits[index].reach()) - (orbits[index - 1].ring + orbits[index - 1].reach())
		assert_float(gap).is_greater_equal(SystemMap.CLEARANCE - EPSILON)
	assert_float(map.extent).is_equal_approx(orbits[2].ring + orbits[2].reach(), EPSILON)


func test_marker_radius_follows_the_body_size_within_its_kind() -> void:
	var earth := SystemMap.marker_radius(4000.0, "PLANET")
	var giant := SystemMap.marker_radius(42500.0, "PLANET")

	assert_float(giant).is_greater(earth)
	assert_float(SystemMap.marker_radius(1.0, "PLANET")).is_equal(SystemMap.PLANET_MARKER.x)
	assert_float(SystemMap.marker_radius(1.0e6, "PLANET")).is_equal(SystemMap.PLANET_MARKER.y)
	assert_float(SystemMap.marker_radius(0.0, "MOON")).is_equal(SystemMap.MOON_MARKER.x)
	assert_float(SystemMap.marker_radius(1.0e6, "ASTEROID")).is_equal(SystemMap.ASTEROID_MARKER.y)


func test_moon_rings_start_outside_the_planet() -> void:
	assert_float(SystemMap.moon_ring(0, 12.0)).is_equal(12.0 + SystemMap.MOON_FIRST)
	assert_float(SystemMap.moon_ring(2, 12.0) - SystemMap.moon_ring(1, 12.0)).is_equal(SystemMap.MOON_STEP)


func test_reach_covers_the_outermost_moon() -> void:
	var map := SystemMap.from_system(_system())
	var giant := map.body("p1")
	var lone := map.body("p0")

	assert_float(giant.reach()).is_equal(SystemMap.moon_ring(1, giant.marker) + SystemMap.MOON_MARKER.y)
	assert_float(lone.reach()).is_equal(lone.marker)
	assert_float(map.body("b0").reach()).is_equal(SystemMap.BELT_HALF_WIDTH)


func test_pick_finds_the_nearest_body_within_reach() -> void:
	var map := SystemMap.from_system(_system())
	var near_p0 := map.position("p0", 0.0) + Vector2(3.0, 0.0)

	assert_str(map.pick(near_p0, 0.0, 10.0)).is_equal("p0")
	assert_str(map.pick(Vector2(0.0, 0.0), 0.0, 5.0)).is_equal("")
	var on_moon := map.position("m0", 0.0)
	assert_str(map.pick(on_moon, 0.0, 2.0)).is_equal("m0")
	# Without moons the planet next to them is found instead.
	assert_str(map.pick(on_moon, 0.0, 40.0, false)).is_equal("p1")


func test_deposits_of_a_body_most_abundant_first() -> void:
	var map := SystemMap.from_system(_system())
	var deposits := map.deposits_of("p0")

	assert_int(deposits.size()).is_equal(2)
	assert_str(Wire.as_string(deposits[0].get("resourceType"))).is_equal("AMMONIA")
	assert_int(map.deposits_of("p1").size()).is_equal(0)


## A G star system as draft.30 sends it: names "{star} b, c …", star with zones, bodies with
## physics (the belt and the moon without, as the field is optional).
func _system_30() -> Dictionary:
	var system := {
		"systemId": "sys-12_-3_0-417",
		"star": {"name": "Brevan Thakoris", "type": "G", "temperature": 5890.0, "luminosity": 1.21, "mass": 1.05,
			"radius": 1.03, "spectralClass": "G1 V", "catalog": "TEC 12:-3:0/417",
			"habitableZoneAu": [1.045, 1.837], "frostLineAu": 2.97},
		"bodies": [
			_body("b", "Brevan Thakoris b", "VOLCANIC", "PLANET", "", 3000.0, 0.35, 1000.0, 0.0),
			_body("c", "Brevan Thakoris c", "EARTH_LIKE", "PLANET", "", 6000.0, 1.1, 4000.0, 40.0),
			_body("c1", "Brevan Thakoris c I", "MOON_ROCKY", "MOON", "c", 900.0, 0.002, 100.0, 0.0),
			_body("d", "Brevan Thakoris d", "GAS_GIANT", "PLANET", "", 40000.0, 5.2, 9000.0, 90.0),
			_body("belt", "Brevan Thakoris Belt-1", "ASTEROID_C", "ASTEROID", "", 60.0, 2.4, 7000.0, 270.0),
		],
		"deposits": [],
	}
	var bodies: Array = system["bodies"]
	(bodies[1] as Dictionary)["physics"] = {"massEarth": 1.02, "density": 5.5, "escapeVelocity": 11.3,
		"starDistanceAu": 1.1, "flux": 1.0, "equilibriumTemperature": -16.0}
	(bodies[0] as Dictionary)["physics"] = {"massEarth": 0.12, "density": 5.1, "escapeVelocity": 4.4,
		"starDistanceAu": 0.35, "flux": 9.9, "equilibriumTemperature": 190.0}
	return system


func test_draft_30_system_reads_star_and_physics() -> void:
	var map := SystemMap.from_system(_system_30())

	assert_str(map.star_name).is_equal("Brevan Thakoris")
	assert_str(map.star.spectral_class).is_equal("G1 V")
	assert_str(map.star.catalog).is_equal("TEC 12:-3:0/417")
	assert_float(map.star.radius).is_equal(1.03)
	assert_vector(map.star.habitable_zone_au).is_equal(Vector2(1.045, 1.837))
	assert_float(map.body("c").physics.mass_earth).is_equal(1.02)
	assert_float(map.body("c").physics.equilibrium_c).is_equal(-16.0)
	assert_object(map.body("belt").physics).is_null()
	assert_object(map.body("c1").physics).is_null()


func test_draft_29_system_has_no_physics_and_no_zones() -> void:
	var map := SystemMap.from_system(_system())

	assert_str(map.star.spectral_class).is_empty()
	assert_object(map.body("p0").physics).is_null()
	assert_vector(map.habitable_zone_rings()).is_equal(Vector2.ZERO)
	assert_float(map.frost_line_ring()).is_equal(0.0)


func test_star_distance_from_physics_else_from_the_orbit() -> void:
	var map := SystemMap.from_system(_system_30())

	assert_float(map.star_distance_au("c")).is_equal(1.1)
	# The moon has no physics: its planet's orbit.
	assert_float(map.star_distance_au("c1")).is_equal(1.1)
	assert_float(map.star_distance_au("belt")).is_equal(2.4)
	assert_float(map.star_distance_au("nope")).is_equal(0.0)
	assert_float(SystemMap.from_system(_system()).star_distance_au("m0")).is_equal(2.8)


func test_ring_of_au_meets_every_orbit_and_keeps_the_order() -> void:
	var map := SystemMap.from_system(_system_30())

	for body: SystemMap.Body in map.star_orbits():
		assert_float(map.ring_of_au(body.orbit_au)).is_equal_approx(body.ring, EPSILON)
	var previous := 0.0
	for au: float in [0.01, 0.1, 0.35, 0.7, 1.0, 1.1, 2.0, 2.4, 3.0, 5.2, 10.0, 40.0]:
		var ring := map.ring_of_au(au)
		assert_float(ring).is_greater_equal(previous)
		assert_float(ring).is_greater_equal(SystemMap.STAR_RADIUS)
		previous = ring
	# Beyond the last orbit: LOG_UNIT per factor e.
	var outer := map.body("d")
	assert_float(map.ring_of_au(5.2 * exp(1.0))).is_equal_approx(outer.ring + SystemMap.LOG_UNIT, EPSILON)


func test_zones_lie_between_the_orbits_they_belong_to() -> void:
	var map := SystemMap.from_system(_system_30())
	var zone := map.habitable_zone_rings()
	var frost := map.frost_line_ring()

	# The earth-like planet at 1.1 AU is in the band; the belt at 2.4 AU inside the frost line,
	# the giant at 5.2 AU beyond it.
	assert_float(zone.x).is_less(map.body("c").ring)
	assert_float(zone.y).is_greater(map.body("c").ring)
	assert_float(zone.y).is_less(map.body("belt").ring)
	assert_float(frost).is_greater(map.body("belt").ring)
	assert_float(frost).is_less(map.body("d").ring)


func test_a_zone_inside_the_star_disc_is_not_drawn() -> void:
	# A white dwarf: its habitable zone lies far inside the first orbit (at least 1 AU).
	var data := _system_30()
	var star: Dictionary = data["star"]
	star["habitableZoneAu"] = [0.0001, 0.0002]
	star["frostLineAu"] = 0.0003
	var map := SystemMap.from_system(data)

	assert_vector(map.habitable_zone_rings()).is_equal(Vector2.ZERO)
	assert_float(map.frost_line_ring()).is_equal(0.0)


func test_the_map_grows_to_show_a_frost_line_beyond_the_last_orbit() -> void:
	var data := _system_30()
	var star: Dictionary = data["star"]
	star["frostLineAu"] = 8.0
	var map := SystemMap.from_system(data)
	var orbits_edge := map.body("d").ring + map.body("d").reach()

	assert_float(map.frost_line_ring()).is_greater(orbits_edge)
	assert_float(map.extent).is_equal_approx(map.frost_line_ring() + SystemMap.CLEARANCE, EPSILON)
	# Far beyond, the map grows only so far.
	star["frostLineAu"] = 5000.0
	assert_float(SystemMap.from_system(data).extent).is_equal_approx(orbits_edge + SystemMap.ZONE_MAX_REACH, EPSILON)


func test_short_name_drops_the_star_name() -> void:
	assert_str(SystemMap.short_name("Brevan Thakoris b", "Brevan Thakoris")).is_equal("b")
	assert_str(SystemMap.short_name("Brevan Thakoris b II", "Brevan Thakoris")).is_equal("b II")
	assert_str(SystemMap.short_name("Brevan Thakoris Belt-1", "Brevan Thakoris")).is_equal("Belt-1")
	assert_str(SystemMap.short_name("Nu Eridani Secundus I", "Nu Eridani")).is_equal("Secundus I")
	assert_str(SystemMap.short_name("Kepler", "Nu Eridani")).is_equal("Kepler")
	assert_str(SystemMap.short_name("Nu Eridani", "Nu Eridani")).is_equal("Nu Eridani")
	assert_str(SystemMap.short_name("Nu Eridanix", "Nu Eridani")).is_equal("Nu Eridanix")
	assert_str(SystemMap.short_name("Primus", "")).is_equal("Primus")


func test_atmosphere_shares_largest_first() -> void:
	var shares := SystemMap.atmosphere_shares({"OXYGEN": 0.215, "NITROGEN": 0.721, "HELIUM_3": 0.0})

	assert_int(shares.size()).is_equal(2)
	assert_str(str(shares[0][0])).is_equal("NITROGEN")
	assert_float(SystemMap.number(shares[1][1])).is_equal_approx(0.215, EPSILON)
	assert_int(SystemMap.atmosphere_shares({}).size()).is_equal(0)


func test_structures_by_body_on_ground_in_orbit_and_docked() -> void:
	var items := [
		{"structureId": 1.0, "name": "Base", "anchor": {"type": "surface", "bodyId": "p0"}},
		{"structureId": 2.0, "name": "Station", "anchor": {"type": "free", "kind": "orbit", "bodyId": "p1"}},
		{"structureId": 3.0, "name": "Ship", "anchor": {"type": "free", "kind": "transit", "location": "transit"}},
		{"structureId": 4.0, "name": "Guest", "anchor": {"type": "docked", "hostId": 1.0}},
		{"structureId": 5.0, "name": "Stray", "anchor": {"type": "docked", "hostId": 99.0}},
	]

	var by_body: Dictionary = SystemMap.structures_by_body(items)
	var on_ground: PackedStringArray = by_body["p0"]
	var in_orbit: PackedStringArray = by_body["p1"]

	assert_array(Array(on_ground)).is_equal(["Base", "Guest"])
	assert_array(Array(in_orbit)).is_equal(["Station"])
	assert_int(by_body.size()).is_equal(2)


func test_place_labels_keeps_the_earlier_labels() -> void:
	var candidates: Array[Array] = [[Rect2(0, 0, 10, 10)], [Rect2(5, 5, 10, 10)], [Rect2(20, 0, 10, 10)], [Rect2(12, 0, 6, 4)]]

	assert_array(Array(SystemMap.place_labels(candidates))).is_equal([0, -1, 0, 0])


func test_place_labels_tries_the_next_candidate() -> void:
	# Below is taken by the first label, so the second goes above.
	var candidates: Array[Array] = [[Rect2(0, 10, 10, 5)], [Rect2(0, 10, 10, 5), Rect2(0, -10, 10, 5)]]

	assert_array(Array(SystemMap.place_labels(candidates))).is_equal([0, 1])


func test_place_labels_keeps_clear_of_obstacles() -> void:
	var candidates: Array[Array] = [[Rect2(0, 0, 10, 10)], [Rect2(20, 0, 10, 10)]]
	var obstacles: Array[Rect2] = [Rect2(5, 5, 2, 2), Rect2(100, 100, 5, 5)]

	var none: Array[Array] = []

	assert_array(Array(SystemMap.place_labels(candidates, obstacles))).is_equal([-1, 0])
	assert_int(SystemMap.place_labels(none).size()).is_equal(0)


func test_number_reads_floats_and_ints() -> void:
	assert_float(SystemMap.number(2.5)).is_equal(2.5)
	assert_float(SystemMap.number(3)).is_equal(3.0)
	assert_float(SystemMap.number("4")).is_equal(0.0)
	assert_float(SystemMap.number(null)).is_equal(0.0)
