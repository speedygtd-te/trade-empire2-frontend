extends GdUnitTestSuite
## ResourceIcon for the store items that build modules and hulls: every one the game knows has
## its icon (rendered from the model the colony shows by smoke/resource_icons.tscn --items), and
## the item folder holds nothing else.

## The MODULE_ITEM resources of /v2/definitions (contract draft.31), plus the coming probe
## launcher (Backend-V2/docs/SPEC-sonden.md).
const MODULE_ITEMS: Array[String] = [
	"ACADEMY_MODULE", "ADVANCED_SCHOOL_MODULE", "ARMOR_PLATING_MODULE", "ARMS_PLANT_MODULE",
	"ASSEMBLER_MODULE", "ATMOSPHERIC_PROCESSOR_MODULE", "AUTOCANNON_MODULE", "BASIC_SCHOOL_MODULE",
	"BASIC_STORAGE_MODULE", "BEAM_LASER_MODULE", "BIG_PUMP_MODULE", "BIOLOGY_LAB_MODULE",
	"BIOSPHERE_MODULE", "BOTANICAL_GARDEN_MODULE", "CATTLE_FARM_MODULE", "CHEMICAL_PLANT_MODULE",
	"CHEMICAL_THRUSTER_MODULE", "CHEMISTRY_LAB_MODULE", "COLLECTOR_MODULE", "CORE_MODULE_MODULE",
	"DEEP_DRILL_MODULE", "DEEP_SPACE_SENSOR_MODULE", "DRIVE_WORKS_MODULE",
	"ELECTRONICS_FACTORY_MODULE", "ELECTRONICS_LAB_MODULE", "ELEVATOR_MODULE", "ELITE_ACADEMY_MODULE",
	"ENGINEERING_LAB_MODULE", "ENTERTAINMENT_CENTER_MODULE", "EPSTEIN_DRIVE_MODULE",
	"EXPERIENCE_ARENA_MODULE", "FACTORY_MODULE", "FUSION_DRIVE_MODULE", "FUSION_REACTOR_MODULE",
	"GALLERY_MODULE", "GEOTHERMAL_PLANT_MODULE", "GREENHOUSE_FARM_MODULE", "GREENHOUSE_MODULE",
	"GUARD_POST_MODULE", "HABITAT_MODULE", "HABITAT_T2_MODULE", "HABITAT_T3_MODULE",
	"HABITAT_T4_MODULE", "HABITAT_T5_MODULE", "HEAVY_CANNON_MODULE", "HEAVY_WHEEL_MODULE",
	"HOSPITAL_MODULE", "HOUSING_FACTORY_MODULE", "HULL_FORGE_MODULE", "HYDROPONIC_BAY_MODULE",
	"INTERSTELLAR_NAVIGATION_MODULE", "ION_DRIVE_MODULE", "LARGE_STORAGE_MODULE",
	"LIFE_SUPPORT_MODULE", "LUXURY_PROMENADE_MODULE", "MEDICAL_CENTER_MODULE", "MEDIUM_CANNON_MODULE",
	"MINE_MODULE", "MINIATURIZATION_FACTORY_MODULE", "MISSILE_LAUNCHER_MODULE", "MONUMENT_MODULE",
	"ORBITAL_COLLECTOR_MODULE", "PARK_MODULE_MODULE", "PHYSICS_LAB_MODULE", "PLANETARY_SENSOR_MODULE",
	"PLANETOLOGY_LAB_MODULE", "PROBE_LAUNCHER_MODULE", "PULSE_LASER_MODULE", "PUMP_MODULE",
	"RECREATION_CORNER_MODULE", "REFINERY_MODULE", "RESEARCH_INSTITUTE_MODULE", "RESEARCH_LAB_MODULE",
	"ROBOT_BAY_LARGE_MODULE", "ROBOT_BAY_MODULE", "RTG_MODULE", "SANITATION_STATION_MODULE",
	"SECURITY_CENTER_MODULE", "SENSOR_POST_MODULE", "SHIELD_GENERATOR_MODULE", "SMELTER_MODULE",
	"SOLAR_PANEL_MODULE", "SPACE_TELESCOPE_MODULE_MODULE", "SPINAL_LASER_MODULE", "STAIRCASE_MODULE",
	"TELESCOPE_MODULE_MODULE", "TIDAL_GENERATOR_MODULE", "TRACKS_MODULE", "TRADE_MODULE_MODULE",
	"UNIVERSITY_MODULE", "WATER_FARM_MODULE", "WATER_SYNTHESIZER_MODULE", "WHEEL_MODULE",
	"WIND_TURBINE_MODULE", "WORMHOLE_MODULE_MODULE",
]
## The HULL_ITEM resources of /v2/definitions (contract draft.31).
const HULL_ITEMS: Array[String] = [
	"HULL_AIRTIGHT", "HULL_COMPOSITE", "HULL_COMPOSITE_PLATFORM_SPACE", "HULL_DOCK",
	"HULL_GLASS_CARBON", "HULL_PLATFORM_OUTDOOR", "HULL_PLATFORM_SPACE", "HULL_PLATFORM_UNDERWATER",
	"HULL_PRESSURIZED", "HULL_REINFORCED", "HULL_STANDARD", "HULL_STARTER",
]


func test_an_item_icon_lies_in_the_item_folder() -> void:
	assert_str(ResourceIcon.path("PUMP_MODULE", ResourceIcon.ITEM_FOLDER)).is_equal("res://game/ui/item_icons/pump_module.png")


func test_every_module_and_hull_item_has_an_icon() -> void:
	for key: String in MODULE_ITEMS + HULL_ITEMS:
		var texture := ResourceIcon.texture(key)
		assert_object(texture).override_failure_message("no icon for " + key).is_not_null()
		if texture != null:
			assert_int(texture.get_width()).override_failure_message(key).is_greater_equal(96)
			assert_int(texture.get_height()).is_equal(texture.get_width())


func test_every_item_icon_file_belongs_to_a_known_item() -> void:
	var known := MODULE_ITEMS + HULL_ITEMS
	for file: String in DirAccess.get_files_at(ResourceIcon.ITEM_FOLDER):
		if file.ends_with(".png"):
			assert_bool(file.get_basename().to_upper() in known).override_failure_message(file).is_true()


func test_every_item_icon_is_imported_small_with_mipmaps() -> void:
	for file: String in DirAccess.get_files_at(ResourceIcon.ITEM_FOLDER):
		if file.ends_with(".png.import"):
			var settings := ConfigFile.new()
			assert_int(settings.load(ResourceIcon.ITEM_FOLDER + file)).is_equal(OK)
			assert_int(settings.get_value("params", "compress/mode", 0)).override_failure_message(file).is_equal(1)
			assert_bool(settings.get_value("params", "mipmaps/generate", false)).override_failure_message(file).is_true()
