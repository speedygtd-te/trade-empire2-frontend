extends GdUnitTestSuite
## The star on the map screens: the colony's light uses the server's radius (draft.30), the
## texts show the spectral class when sent and the type's text otherwise.


func test_star_size_uses_the_server_radius_when_sent() -> void:
	var model := ColonyModel.new()
	model.star_luminosity = 150.0
	model.star_kelvin = 4000.0
	model.star_distance_au = 5.0
	var estimated := model.star_size()
	model.star_radius = 40.0
	var sent := model.star_size()
	model.free()

	assert_float(estimated).is_equal_approx(SkyLight.star_radius(150.0, 4000.0) / 5.0, 0.0001)
	assert_float(sent).is_equal_approx(8.0, 0.0001)


func test_star_class_text_prefers_the_spectral_class() -> void:
	var translator := Node.new()
	var with_class := BodyPanel.star_class_text("K3 III", "RED_GIANT", translator)
	var without := BodyPanel.star_class_text("", "RED_GIANT", translator)
	var kind := BodyPanel.star_kind_text("K3 III", "RED_GIANT", translator)
	var kind_without := BodyPanel.star_kind_text("", "RED_GIANT", translator)
	translator.free()

	assert_str(with_class).is_equal("K3 III")
	assert_str(without).is_equal("Red giant")
	assert_str(kind).is_equal("K3 III · Red giant")
	assert_str(kind_without).is_equal("Red giant")
