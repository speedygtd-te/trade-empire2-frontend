extends GdUnitTestSuite
## ModuleMotion: roles from node names, the motions, solar panels and how much a module works.

const MODELS := "res://game/world/models/"


func test_the_role_comes_from_the_node_name() -> void:
	assert_str(ModuleMotion.role_of("move_rotor")).is_equal("rotor")
	assert_str(ModuleMotion.role_of("move_fan_2")).is_equal("fan")
	assert_str(ModuleMotion.role_of("move_fan_2_001")).is_equal("fan")
	assert_str(ModuleMotion.role_of("move_dish.001")).is_equal("dish")
	assert_str(ModuleMotion.role_of("te_pump")).is_empty()
	assert_str(ModuleMotion.role_of("move_wobble")).is_empty()


func test_a_spinning_part_turns_round_its_up_axis() -> void:
	# A quarter turn of the rotor.
	var quarter := 0.25 / 0.45
	var pose := ModuleMotion.offset("rotor", quarter, 0.0)

	assert_float(pose.basis.get_euler().y).is_equal_approx(PI / 2.0, 0.001)
	assert_vector(pose.origin).is_equal(Vector3.ZERO)


func test_a_sweeping_part_stays_within_its_amplitude() -> void:
	var amplitude: float = (ModuleMotion.ROLES["dish"] as Array)[2]
	assert_float(ModuleMotion.offset("dish", 0.0, 0.0).basis.get_euler().y).is_equal_approx(0.0, 0.0001)
	var widest := 0.0
	for step: int in 200:
		var turn := ModuleMotion.offset("dish", step * 0.37, 0.3).basis.get_euler().y
		widest = maxf(widest, absf(turn))
	assert_float(widest).is_less_equal(amplitude + 0.0001)
	assert_float(widest).is_greater(amplitude * 0.9)


func test_a_stroking_part_moves_up_and_down_only() -> void:
	var amplitude: float = (ModuleMotion.ROLES["rod"] as Array)[2]
	for step: int in 50:
		var pose := ModuleMotion.offset("rod", step * 0.13, 0.0)
		assert_float(pose.origin.x).is_equal(0.0)
		assert_float(pose.origin.z).is_equal(0.0)
		assert_float(absf(pose.origin.y)).is_less_equal(amplitude + 0.0001)
		assert_bool(pose.basis.is_equal_approx(Basis.IDENTITY)).is_true()


func test_a_solar_panel_faces_a_low_sun_and_leans_at_most_so_far() -> void:
	# Sun low over +X: the panel's face turns that way and leans as far as it may.
	var basis := ModuleMotion.sun_basis(Vector3(1.0, 0.1, 0.0).normalized())

	assert_float(basis.y.angle_to(Vector3.UP)).is_equal_approx(ModuleMotion.PANEL_MAX_TILT, 0.001)
	assert_float(basis.y.x).is_greater(0.5)
	assert_float(absf(basis.y.z)).is_less(0.001)


func test_a_solar_panel_under_a_high_sun_keeps_a_little_lean() -> void:
	var basis := ModuleMotion.sun_basis(Vector3.UP)

	assert_float(basis.y.angle_to(Vector3.UP)).is_equal_approx(ModuleMotion.PANEL_MIN_TILT, 0.001)


func test_a_solar_panel_follows_the_sun_between_the_limits() -> void:
	var to_sun := Vector3(0.0, cos(0.6), -sin(0.6))
	var basis := ModuleMotion.sun_basis(to_sun)

	assert_float(basis.y.angle_to(to_sun)).is_less(0.001)


func test_activity_of_a_type_is_the_product_of_its_factors_best_bucket_counts() -> void:
	var buckets := [
		{"moduleType": "PUMP", "running": 500000, "workforce": 1000000, "utility": 800000},
		{"moduleType": "PUMP", "running": 1000000, "workforce": 250000, "utility": 1000000},
		{"moduleType": "SOLAR_PANEL", "running": 1000000, "workforce": 1000000, "utility": 1000000},
	]
	var by_type := ModuleMotion.activity_by_type(buckets, 1000000)

	assert_float(by_type["PUMP"]).is_equal_approx(0.4, 0.0001)
	assert_float(by_type["SOLAR_PANEL"]).is_equal_approx(1.0, 0.0001)


func test_a_module_that_does_not_work_stands_still() -> void:
	var by_type := {"PUMP": 0.7}

	assert_float(ModuleMotion.activity("PUMP", true, false, false, by_type, 1.0)).is_equal(0.0)
	assert_float(ModuleMotion.activity("PUMP", false, true, false, by_type, 1.0)).is_equal(0.0)
	assert_float(ModuleMotion.activity("PUMP", false, false, true, by_type, 1.0)).is_equal(0.0)
	assert_float(ModuleMotion.activity("PUMP", false, false, false, by_type, 1.0)).is_equal_approx(0.7, 0.0001)
	# Without a recipe (a telescope) it works as far as there is power.
	assert_float(ModuleMotion.activity("TELESCOPE_MODULE", false, false, false, by_type, 0.5)).is_equal_approx(0.5, 0.0001)


func test_every_moving_part_in_the_models_has_a_known_role() -> void:
	var found := 0
	for file: String in DirAccess.get_files_at(MODELS):
		if not file.ends_with(".glb"):
			continue
		var scene := load(MODELS + file) as PackedScene
		var root := scene.instantiate() as Node3D
		for node: Node in root.find_children(ModuleMotion.PREFIX + "*", "Node3D", true, false):
			found += 1
			assert_str(ModuleMotion.role_of(String(node.name))).override_failure_message(
				"%s has the moving part %s without a known role" % [file, node.name]).is_not_empty()
		root.free()
	# The models were built with their moving parts (scripts/3d/models).
	assert_int(found).is_greater(15)
