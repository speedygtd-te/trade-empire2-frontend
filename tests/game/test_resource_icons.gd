extends GdUnitTestSuite
## ResourceIcon: every resource the game knows has its icon (rendered from its 3D model by
## smoke/resource_icons.tscn), unknown ones have none and the rows show the name alone.

## The NATURAL and PRODUCED resources of /v2/definitions (contract draft.30), plus the coming
## exploration probe.
const KNOWN: Array[String] = [
	"ALUMINUM", "AMMONIA", "CARBON", "COPPER", "CRYOGENIC_FLUIDS", "HELIUM_3", "HYDROGEN", "IRON",
	"METHANE", "NITROGEN", "NULL_G_MATERIALS", "OXYGEN", "PLATINUM_GROUP", "RARE_EARTHS", "SILICON",
	"SULFUR", "TITANIUM", "URANIUM", "WATER",
	"ADVANCED_ELECTRONICS", "ALGAE", "ALUMINUM_PLATE", "AMMUNITION", "CARBON_FIBER", "COMPOSITE_ARMOR",
	"COPPER_WIRE", "ELECTRONICS", "ENERGY", "FOOD", "FUSION_FUEL", "GLASS", "HOUSING", "IRON_PLATE",
	"MISSILE", "MOTOR", "PLASTIC", "PROTEIN", "ROBOT_T1", "ROBOT_T2", "ROBOT_T3", "ROBOT_T4", "ROBOT_T5",
	"SENSOR_ARRAY", "SHIELD_EMITTER", "SILICON_WAFER", "STRUCTURAL_FRAME", "TITANIUM_PLATE",
	"WEAPON_COMPONENT",
	"PROBE",
	# Coming: ammunition of the enterprise rocket launcher (SPEC-enterprise-flaggschiff.md 5.4).
	"ENTERPRISE_ROCKET",
]


func test_the_file_is_the_key_in_lower_case() -> void:
	assert_str(ResourceIcon.path("IRON_PLATE")).is_equal("res://game/ui/resource_icons/iron_plate.png")
	assert_str(ResourceIcon.path("HELIUM_3")).is_equal("res://game/ui/resource_icons/helium_3.png")


func test_a_key_that_is_no_resource_key_has_no_file() -> void:
	assert_str(ResourceIcon.path("")).is_empty()
	assert_str(ResourceIcon.path("../iron")).is_empty()
	assert_str(ResourceIcon.path("iron")).is_empty()
	assert_str(ResourceIcon.path("IRON PLATE")).is_empty()


func test_every_known_resource_has_an_icon() -> void:
	for key: String in KNOWN:
		var texture := ResourceIcon.texture(key)
		assert_object(texture).override_failure_message("no icon for " + key).is_not_null()
		if texture != null:
			assert_int(texture.get_width()).override_failure_message(key).is_greater_equal(96)
			assert_int(texture.get_height()).is_equal(texture.get_width())


func test_every_icon_file_belongs_to_a_known_resource() -> void:
	for file: String in DirAccess.get_files_at(ResourceIcon.FOLDER):
		if file.ends_with(".png"):
			assert_bool(file.get_basename().to_upper() in KNOWN).override_failure_message(file).is_true()


func test_an_unknown_resource_has_no_icon() -> void:
	assert_object(ResourceIcon.texture("UNOBTAINIUM")).is_null()
	assert_object(ResourceIcon.texture("")).is_null()


func test_the_row_icon_takes_no_room_without_a_picture() -> void:
	var known := Ui.resource_icon("IRON")
	var unknown := Ui.resource_icon("UNOBTAINIUM")

	assert_bool(known.visible).is_true()
	assert_vector(known.custom_minimum_size).is_equal(Vector2(ResourceIcon.ROW_SIZE, ResourceIcon.ROW_SIZE))
	assert_bool(unknown.visible).is_false()
	known.free()
	unknown.free()


func test_in_a_list_the_row_icon_keeps_its_room_without_a_picture() -> void:
	var unknown := Ui.resource_icon("UNOBTAINIUM", 40, true)

	assert_bool(unknown.visible).is_true()
	assert_object(unknown.texture).is_null()
	assert_vector(unknown.custom_minimum_size).is_equal(Vector2(40, 40))
	unknown.free()


func test_a_row_button_gets_the_icon_at_row_size() -> void:
	var button := Button.new()
	Ui.add_resource_icon(button, "WATER")

	assert_object(button.icon).is_same(ResourceIcon.texture("WATER"))
	assert_int(button.get_theme_constant("icon_max_width")).is_equal(ResourceIcon.ROW_SIZE)
	assert_int(button.get_theme_constant("h_separation")).is_equal(ResourceIcon.ROW_GAP)
	button.free()


func test_a_row_button_without_an_icon_keeps_its_room_only_when_asked() -> void:
	var plain := Button.new()
	var kept := Button.new()
	Ui.add_resource_icon(plain, "UNOBTAINIUM")
	Ui.add_resource_icon(kept, "UNOBTAINIUM", true)

	assert_object(plain.icon).is_null()
	assert_object(kept.icon).is_same(ResourceIcon.blank())
	assert_int(kept.icon.get_width()).is_equal(ResourceIcon.ROW_SIZE)
	plain.free()
	kept.free()
