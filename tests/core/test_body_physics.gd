extends GdUnitTestSuite
## A body's physics (draft.30) and the number texts of the body panel.


func test_from_wire_reads_every_field() -> void:
	var physics := BodyPhysics.from_wire({"massEarth": 0.82, "density": 5.4, "escapeVelocity": 10.1,
		"starDistanceAu": 1.07, "flux": 1.06, "equilibriumTemperature": -18.0})

	assert_float(physics.mass_earth).is_equal(0.82)
	assert_float(physics.density).is_equal(5.4)
	assert_float(physics.escape_velocity).is_equal(10.1)
	assert_float(physics.star_distance_au).is_equal(1.07)
	assert_float(physics.flux).is_equal(1.06)
	assert_float(physics.equilibrium_c).is_equal(-18.0)


func test_without_physics_there_is_none() -> void:
	assert_object(BodyPhysics.from_wire(null)).is_null()
	assert_object(BodyPhysics.from_wire({})).is_null()
	assert_object(BodyPhysics.from_wire("physics")).is_null()


func test_warming_is_surface_over_starlight_alone() -> void:
	var physics := BodyPhysics.from_wire({"equilibriumTemperature": -18.0})

	assert_float(physics.warming(15.0)).is_equal(33.0)
	assert_float(physics.warming(-18.0)).is_equal(0.0)


func test_celsius_spans_absolute_zero_to_molten() -> void:
	assert_str(BodyPhysics.celsius(-273.15)).is_equal("−273")
	assert_str(BodyPhysics.celsius(-0.4)).is_equal("0")
	assert_str(BodyPhysics.celsius(14.4)).is_equal("14")
	assert_str(BodyPhysics.celsius(504.0)).is_equal("504")
	assert_str(BodyPhysics.celsius(1049.6)).is_equal(AmountFormat.units(1050))
	assert_str(BodyPhysics.celsius(-1200.0)).is_equal("−" + AmountFormat.units(1200))


func test_celsius_change_has_its_sign() -> void:
	assert_str(BodyPhysics.celsius_change(33.0)).is_equal("+33")
	assert_str(BodyPhysics.celsius_change(-4.0)).is_equal("−4")
	assert_str(BodyPhysics.celsius_change(0.2)).is_equal("0")
	assert_str(BodyPhysics.celsius_change(1450.0)).is_equal("+" + AmountFormat.units(1450))


func test_figure_keeps_about_three_significant_digits() -> void:
	assert_str(BodyPhysics.figure(1234.4)).is_equal(AmountFormat.units(1234))
	assert_str(BodyPhysics.figure(318.0)).is_equal("318")
	assert_str(BodyPhysics.figure(12.43)).is_equal("12.4")
	assert_str(BodyPhysics.figure(5.512)).is_equal("5.51")
	assert_str(BodyPhysics.figure(0.82)).is_equal("0.82")
	assert_str(BodyPhysics.figure(0.0534)).is_equal("0.053")
	assert_str(BodyPhysics.figure(0.00123)).is_equal("0.0012")
	assert_str(BodyPhysics.figure(0.0)).is_equal("0")
	assert_str(BodyPhysics.figure(-3.0)).is_equal("0")
