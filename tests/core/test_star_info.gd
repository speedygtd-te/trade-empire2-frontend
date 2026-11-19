extends GdUnitTestSuite
## The star as the contract sends it: draft.29 (without the physics fields) and draft.30.


## A G star as draft.30 sends it on a real-scale galaxy.
static func star_wire() -> Dictionary:
	return {"starId": "star-1", "name": "Brevan Thakoris", "type": "G", "luminosity": 1.21, "mass": 1.05,
		"temperature": 5890.0, "metallicity": 0.1, "radius": 1.03, "spectralClass": "G1 V",
		"catalog": "TEC 12:-3:0/417", "habitableZoneAu": [1.045, 1.837], "frostLineAu": 2.97}


func test_draft_30_star_reads_every_field() -> void:
	var star := StarInfo.from_wire(star_wire())

	assert_str(star.name).is_equal("Brevan Thakoris")
	assert_str(star.type).is_equal("G")
	assert_float(star.kelvin).is_equal(5890.0)
	assert_float(star.luminosity).is_equal(1.21)
	assert_float(star.mass).is_equal(1.05)
	assert_float(star.radius).is_equal(1.03)
	assert_str(star.spectral_class).is_equal("G1 V")
	assert_str(star.catalog).is_equal("TEC 12:-3:0/417")
	assert_vector(star.habitable_zone_au).is_equal(Vector2(1.045, 1.837))
	assert_float(star.frost_line_au).is_equal(2.97)
	assert_bool(star.has_habitable_zone()).is_true()
	assert_bool(star.has_frost_line()).is_true()


func test_draft_29_star_keeps_the_absent_values() -> void:
	var star := StarInfo.from_wire({"name": "Nu Eridani", "type": "M", "temperature": 2678.0, "luminosity": 0.01,
		"mass": 0.2})

	assert_float(star.radius).is_equal(0.0)
	assert_str(star.spectral_class).is_empty()
	assert_str(star.catalog).is_empty()
	assert_vector(star.habitable_zone_au).is_equal(Vector2.ZERO)
	assert_float(star.frost_line_au).is_equal(0.0)
	assert_bool(star.has_habitable_zone()).is_false()
	assert_bool(star.has_frost_line()).is_false()
	assert_bool(star.in_habitable_zone(0.1)).is_false()
	assert_bool(star.beyond_frost_line(100.0)).is_false()


func test_an_empty_star_gives_the_defaults() -> void:
	var star := StarInfo.from_wire({})

	assert_float(star.kelvin).is_equal(5800.0)
	assert_float(star.luminosity).is_equal(1.0)
	assert_float(star.mass).is_equal(1.0)


func test_zone_needs_two_ordered_positive_numbers() -> void:
	assert_vector(StarInfo.zone([0.5, 0.9])).is_equal(Vector2(0.5, 0.9))
	assert_vector(StarInfo.zone([0.9, 0.5])).is_equal(Vector2.ZERO)
	assert_vector(StarInfo.zone([0.0, 0.5])).is_equal(Vector2.ZERO)
	assert_vector(StarInfo.zone([0.5])).is_equal(Vector2.ZERO)
	assert_vector(StarInfo.zone("0.5,0.9")).is_equal(Vector2.ZERO)
	assert_vector(StarInfo.zone(null)).is_equal(Vector2.ZERO)


func test_radius_comes_from_the_server_when_sent() -> void:
	# A red giant: the server's radius wins over the estimate from luminosity and temperature.
	assert_float(StarInfo.radius_or_estimate(42.0, 150.0, 4000.0)).is_equal(42.0)
	assert_float(StarInfo.radius_or_estimate(0.0, 150.0, 4000.0)).is_equal_approx(SkyLight.star_radius(150.0, 4000.0), 0.0001)
	assert_float(StarInfo.from_wire(star_wire()).radius_suns()).is_equal(1.03)
	assert_float(StarInfo.from_wire({"luminosity": 1.0, "temperature": 5778.0}).radius_suns()).is_equal_approx(1.0, 0.001)


func test_habitable_zone_and_frost_line_by_distance() -> void:
	var star := StarInfo.from_wire(star_wire())

	assert_bool(star.in_habitable_zone(1.2)).is_true()
	assert_bool(star.in_habitable_zone(1.045)).is_true()
	assert_bool(star.in_habitable_zone(0.9)).is_false()
	assert_bool(star.in_habitable_zone(2.0)).is_false()
	assert_bool(star.beyond_frost_line(2.0)).is_false()
	assert_bool(star.beyond_frost_line(5.2)).is_true()
