extends GdUnitTestSuite

const EPSILON := 0.000001


## The live `milky_way` galaxy as `GET /v2/galaxy` sends it (2.0.0-draft.24).
func _galaxy() -> Dictionary:
	return {"rev": 695, "gameTime": 17226511, "galaxyId": "galaxy-1", "name": "Galaxy 1116014313",
		"seed": 1116014313, "preset": "milky_way", "galaxyType": "SPIRAL", "radius": 50000.0, "armCount": 4.0,
		"armTightness": 0.6, "coreRadius": 3000.0, "diskThickness": 1000.0, "age": 13.0,
		"sectorSize": {"x": 50.0, "y": 50.0, "z": 50.0}, "lyPerUnit": 1.0, "zLimit": 3000.0,
		"density": {"core": 0.02, "disk": 0.0008, "halo": 2e-6, "cap": 0.02}}


func _shape() -> GalaxyShape:
	return GalaxyShape.from_galaxy(_galaxy())


func test_from_galaxy_reads_every_parameter() -> void:
	var shape := _shape()

	assert_str(shape.galaxy_name).is_equal("Galaxy 1116014313")
	assert_float(shape.radius).is_equal(50000.0)
	assert_int(shape.arm_count).is_equal(4)
	assert_float(shape.arm_tightness).is_equal(0.6)
	assert_float(shape.core_radius).is_equal(3000.0)
	assert_float(shape.disk_thickness).is_equal(1000.0)
	assert_float(shape.z_limit).is_equal(3000.0)
	assert_float(shape.core).is_equal(0.02)
	assert_float(shape.disk).is_equal(0.0008)
	assert_float(shape.halo).is_equal(2e-6)
	assert_float(shape.cap).is_equal(0.02)
	assert_vector(shape.sector_size).is_equal(Vector3(50, 50, 50))
	assert_float(shape.ly_per_unit).is_equal(1.0)


func test_from_galaxy_without_radius_is_null() -> void:
	assert_object(GalaxyShape.from_galaxy({"name": "x"})).is_null()


func test_missing_optional_values_mean_unlimited() -> void:
	var data := _galaxy()
	data.erase("zLimit")
	(data["density"] as Dictionary).erase("cap")
	var shape := GalaxyShape.from_galaxy(data)

	assert_float(shape.z_limit).is_equal(0.0)
	assert_float(shape.cap).is_equal(0.0)
	assert_float(shape.density(Vector3(20000, 0, 5000))).is_greater(0.0)


func test_density_at_the_centre_is_the_core() -> void:
	# core 0.02 + disk 0.0008 · (1 + 4 · 0) + halo 2e-6 = 0.020802, capped at 0.02.
	assert_float(_shape().density(Vector3.ZERO)).is_equal_approx(0.02, EPSILON)


func test_density_follows_the_formula_in_the_disk() -> void:
	var shape := _shape()
	var point := Vector3(-5485.81, 2481.66, -15.44)
	var r := Vector2(point.x, point.y).length()
	var d := point.length()
	var expected := 0.02 * exp(-2.0 * pow(d / 3000.0, 2.0)) \
		+ 0.0008 * exp(-r / 15000.0) * exp(-15.44 / 500.0) * (1.0 + 4.0 * shape.arm(point.x, point.y)) \
		+ 2e-6 * exp(-2.0 * d / 50000.0)

	assert_float(shape.density(point)).is_equal_approx(expected, 1e-9)


func test_density_is_zero_beyond_the_edge_and_the_z_limit() -> void:
	var shape := _shape()

	assert_float(shape.density(Vector3(75001, 0, 0))).is_equal(0.0)
	assert_float(shape.density(Vector3(10000, 0, 3001))).is_equal(0.0)
	assert_float(shape.density(Vector3(10000, 0, 2999))).is_greater(0.0)


func test_arm_is_strongest_on_a_spiral_and_zero_on_the_axis() -> void:
	var shape := _shape()
	# Arm k = 0 at r: angle = ln(r / 1500) / 0.6.
	var r := 12000.0
	var angle := log(r / 1500.0) / 0.6
	var on_arm := Vector2(cos(angle), sin(angle)) * r
	# Between two arms (four arms: a quarter turn apart).
	var between := Vector2(cos(angle + PI / 4.0), sin(angle + PI / 4.0)) * r

	assert_float(shape.arm(on_arm.x, on_arm.y)).is_equal_approx(1.0, 0.0001)
	assert_float(shape.arm(between.x, between.y)).is_less(0.2)
	assert_float(shape.arm(0.5, 0.0)).is_equal(0.0)


func test_without_arms_the_arm_term_is_zero() -> void:
	var data := _galaxy()
	data["armCount"] = 0.0
	var shape := GalaxyShape.from_galaxy(data)

	assert_float(shape.arm(12000.0, 3000.0)).is_equal(0.0)


func test_column_density_adds_the_terms_seen_from_above() -> void:
	var shape := _shape()
	var x := 9000.0
	var y := -4000.0
	var r := Vector2(x, y).length()
	var expected := 0.02 * exp(-2.0 * pow(r / 3000.0, 2.0)) * 3000.0 * sqrt(PI / 2.0) \
		+ 0.0008 * exp(-r / 15000.0) * (1.0 + 4.0 * shape.arm(x, y)) * 1000.0 \
		+ 2e-6 * exp(-2.0 * r / 50000.0) * 50000.0

	assert_float(shape.column_density(x, y)).is_equal_approx(expected, 1e-6)
	assert_float(shape.column_density(80000.0, 0.0)).is_equal(0.0)


func test_brightness_is_one_at_the_centre_and_falls_outwards() -> void:
	var shape := _shape()

	assert_float(shape.brightness(0.0, 0.0)).is_equal_approx(1.0, EPSILON)
	assert_float(shape.brightness(10000.0, 0.0)).is_less(shape.brightness(3000.0, 0.0))
	assert_float(shape.brightness(10000.0, 0.0)).is_greater(0.0)
	assert_float(shape.brightness(80000.0, 0.0)).is_equal(0.0)


func test_tint_is_warm_in_the_core_and_blue_on_an_arm() -> void:
	var shape := _shape()
	var r := 20000.0
	var angle := log(r / 1500.0) / 0.6
	var arm := shape.tint(cos(angle) * r, sin(angle) * r)
	var centre := shape.tint(0.0, 0.0)

	assert_float(centre.r).is_greater(centre.b)
	assert_float(arm.b).is_greater(arm.r)


func test_sector_of_a_point_floors_each_axis() -> void:
	var shape := _shape()

	assert_vector(shape.sector_of(Vector3(-5485.81, 2481.66, -15.44))).is_equal(Vector3i(-110, 49, -1))
	assert_vector(shape.sector_of(Vector3(0, 49.99, 50))).is_equal(Vector3i(0, 0, 1))
	assert_vector(shape.sector_centre(Vector3i(-110, 49, -1))).is_equal(Vector3(-5475, 2475, -25))


func test_sector_id_has_the_contract_format() -> void:
	assert_str(GalaxyShape.sector_id(Vector3i(-110, 49, -1))).is_equal("-110_49_-1")


func test_query_radius_is_small_in_the_core_and_full_outside() -> void:
	var shape := _shape()
	# Core: 0.02 per ly³ → (12000 / (0.02 · 4/3 π))^(1/3) ≈ 52 ly.
	var core_limit := shape.query_radius_limit(Vector3.ZERO)
	var outer_limit := shape.query_radius_limit(Vector3(45000, 0, 0))

	assert_float(core_limit).is_equal_approx(52.3, 0.2)
	assert_float(outer_limit).is_equal(GalaxyShape.MAX_QUERY_RADIUS)
	assert_float(shape.query_radius_limit(Vector3(90000, 0, 0))).is_equal(GalaxyShape.MAX_QUERY_RADIUS)


func test_cell_points_are_deterministic_and_inside_their_cell() -> void:
	var shape := _shape()
	var first := shape.cell_points(3, -2, 1000.0, 60, 7)
	var again := shape.cell_points(3, -2, 1000.0, 60, 7)
	var other := shape.cell_points(3, -2, 1000.0, 60, 8)

	assert_int(first.size()).is_greater(0)
	assert_array(Array(first)).is_equal(Array(again))
	assert_array(Array(first)).is_not_equal(Array(other))
	for point: Vector3 in first:
		assert_float(point.x).is_between(3000.0, 4000.0)
		assert_float(point.y).is_between(-2000.0, -1000.0)
		assert_float(point.z).is_between(0.0, 1.0)


func test_cell_points_follow_the_brightness() -> void:
	var shape := _shape()
	var near_core := shape.cell_points(0, 0, 1000.0, 200, 1)
	var outskirts := shape.cell_points(60, 0, 1000.0, 200, 1)
	var outside := shape.cell_points(200, 0, 1000.0, 200, 1)

	assert_int(near_core.size()).is_greater(outskirts.size())
	assert_int(outside.size()).is_equal(0)


func test_cell_seed_differs_per_cell() -> void:
	assert_int(GalaxyShape.cell_seed(1, 2, 0)).is_not_equal(GalaxyShape.cell_seed(2, 1, 0))
	assert_int(GalaxyShape.cell_seed(1, 2, 0)).is_equal(GalaxyShape.cell_seed(1, 2, 0))
	assert_int(GalaxyShape.cell_seed(-5, -9, 3)).is_greater_equal(0)


func test_top_view_is_bright_in_the_middle_and_dark_in_the_corner() -> void:
	var image := _shape().top_view(33)

	assert_int(image.get_width()).is_equal(33)
	assert_float(image.get_pixel(16, 16).a).is_greater(0.9)
	assert_float(image.get_pixel(0, 0).a).is_equal(0.0)
	assert_float(_shape().view_extent()).is_equal(50000.0 * GalaxyShape.VIEW_EXTENT)
