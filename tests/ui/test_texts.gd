extends GdUnitTestSuite
## Guards the rule that the player never sees a raw key or error code.

const TRANSLATION_PATH := "res://i18n/strings.en.translation"
const SOURCE_DIRS: PackedStringArray = ["res://game", "res://core", "res://net"]
const KEY_PATTERN := '"((?:APP|COMMON|LOGIN|UNREACHABLE|HOME|ERROR|COLONY|STORE|RECIPE|LOG|RESEARCH|WORKFORCE|MAP|GALAXY|FLEET|TRAVEL|ROUTE|LEVEL|ENTERPRISE|DIPLOMACY|TAX|NAV|PROFILE|STRUCTURE|DETAILS|PLACES|PERF|SIGHT|PROBE)_[A-Z0-9_]*[A-Z0-9])"'
## Game-data keys that look like text keys (a lab type); error codes are skipped as well.
const NOT_TEXT_KEYS: PackedStringArray = ["RESEARCH_LAB", "PROBE_LAUNCHER", "ENTERPRISE_DOCK", "ENTERPRISE_FACTORY",
	"ENTERPRISE_HULL_STANDARD", "ENTERPRISE_HULL_GLASS", "ENTERPRISE_HULL_ARMORED", "ENTERPRISE_PLATFORM",
	"ENTERPRISE_PLATFORM_ARMORED"]

var _translation: Translation


func before() -> void:
	_translation = load(TRANSLATION_PATH)
	TranslationServer.set_locale("en")


func _has_text(key: String) -> bool:
	return not String(_translation.get_message(key)).is_empty()


func _collect_scripts(dir: String, into: PackedStringArray) -> void:
	for file: String in DirAccess.get_files_at(dir):
		if file.ends_with(".gd"):
			into.append(dir + "/" + file)
	for sub: String in DirAccess.get_directories_at(dir):
		_collect_scripts(dir + "/" + sub, into)


func test_translation_file_is_loaded() -> void:
	assert_object(_translation).is_not_null()
	assert_bool(_has_text("APP_TITLE")).is_true()


func test_every_handled_error_code_has_a_text() -> void:
	for code: String in ErrorText.HANDLED_CODES:
		assert_bool(_has_text("ERROR_" + code)).override_failure_message(
			"no translation for ERROR_" + code
		).is_true()


func test_every_text_key_used_in_code_exists() -> void:
	var scripts := PackedStringArray()
	for dir: String in SOURCE_DIRS:
		_collect_scripts(dir, scripts)
	var pattern := RegEx.new()
	pattern.compile(KEY_PATTERN)
	var checked := 0
	for path: String in scripts:
		var source := FileAccess.get_file_as_string(path)
		for found: RegExMatch in pattern.search_all(source):
			var key := found.get_string(1)
			if NOT_TEXT_KEYS.has(key) or ErrorText.HANDLED_CODES.has(key):
				continue
			checked += 1
			assert_bool(_has_text(key)).override_failure_message(
				"%s uses %s, which has no translation" % [path, key]
			).is_true()
	# The scan must actually have found the keys, otherwise this test proves nothing.
	assert_int(checked).is_greater(30)


func test_every_build_verdict_has_a_text() -> void:
	# The colony screen builds these keys from the enum names.
	for verdict: String in BuildRules.Verdict.keys():
		assert_bool(_has_text("BUILD_VERDICT_" + verdict)).override_failure_message(
			"no translation for BUILD_VERDICT_" + verdict
		).is_true()


func test_every_build_category_has_a_text() -> void:
	# The build palette builds these keys from the category names.
	var categories := Array(BuildCatalog.ORDER)
	categories.append(BuildCatalog.OTHER)
	for category: String in categories:
		assert_bool(_has_text("COLONY_CATEGORY_" + category)).override_failure_message(
			"no translation for COLONY_CATEGORY_" + category
		).is_true()


func test_every_module_slot_has_a_text() -> void:
	for slot: String in ["INDOOR", "OUTDOOR", "UNDER_WATER"]:
		assert_bool(_has_text("SLOT_" + slot)).override_failure_message("no translation for SLOT_" + slot).is_true()

func test_every_lab_status_and_research_field_has_a_text() -> void:
	# The research panel builds these keys from the server's values.
	for status: String in ResearchPanel.STATUSES:
		assert_bool(_has_text("RESEARCH_STATUS_" + status)).override_failure_message(
			"no translation for RESEARCH_STATUS_" + status
		).is_true()
	for category: String in ResearchPanel.CATEGORIES:
		assert_bool(_has_text("RESEARCH_CATEGORY_" + category)).override_failure_message(
			"no translation for RESEARCH_CATEGORY_" + category
		).is_true()


func test_every_body_and_star_type_has_a_text() -> void:
	# The system map builds these keys from the server's values.
	for type: String in BodyPanel.BODY_TYPES:
		assert_bool(_has_text("MAP_BODY_TYPE_" + type)).override_failure_message(
			"no translation for MAP_BODY_TYPE_" + type
		).is_true()
	for type: String in BodyPanel.STAR_TYPES:
		assert_bool(_has_text("MAP_STAR_TYPE_" + type)).override_failure_message(
			"no translation for MAP_STAR_TYPE_" + type
		).is_true()


func test_every_biome_has_a_text() -> void:
	# The inspect card names the terrain of a field from the server's biome keys.
	for biome: String in BiomeColors.TABLE.keys():
		assert_bool(_has_text("COLONY_BIOME_" + biome)).override_failure_message(
			"no translation for COLONY_BIOME_" + biome
		).is_true()


func test_every_structure_kind_has_a_text() -> void:
	# The fleet list builds these keys from the server's kinds (StructureKind).
	for kind: String in ["BASE", "SHIP", "VEHICLE", "STATION"]:
		assert_bool(_has_text("FLEET_KIND_" + kind)).override_failure_message(
			"no translation for FLEET_KIND_" + kind
		).is_true()


func test_every_enterprise_right_and_stance_has_a_text() -> void:
	# The enterprise screens build these keys from the server's values.
	for flag: String in Enterprise.FLAGS:
		assert_bool(_has_text("ENTERPRISE_FLAG_" + flag)).override_failure_message(
			"no translation for ENTERPRISE_FLAG_" + flag
		).is_true()
	for stance: String in EnterpriseDiplomacyTab.STANCES:
		assert_bool(_has_text("DIPLOMACY_STANCE_" + stance.to_upper())).override_failure_message(
			"no translation for DIPLOMACY_STANCE_" + stance.to_upper()
		).is_true()


func test_transport_failure_gets_the_connection_text() -> void:
	assert_str(ErrorText.key_for(ApiError.transport("refused"))).is_equal("ERROR_NO_CONNECTION")


func test_known_code_gets_its_own_text() -> void:
	var error := ApiError.from_response(409, '{"error":"EMAIL_TAKEN","message":"x"}')

	assert_str(ErrorText.key_for(error)).is_equal("ERROR_EMAIL_TAKEN")


func test_unknown_codes_get_the_generic_text_not_the_raw_code() -> void:
	var build_error := ApiError.from_response(409, '{"error":"BATCH_TOO_LARGE","message":"x"}')
	var proxy_error := ApiError.from_response(502, "<html>Bad Gateway</html>")

	assert_str(ErrorText.key_for(build_error)).is_equal("ERROR_UNKNOWN")
	assert_str(ErrorText.key_for(proxy_error)).is_equal("ERROR_UNKNOWN")


func test_rate_limit_text_names_the_waiting_time() -> void:
	var translator: Node = auto_free(Node.new())
	var body := '{"error":"RATE_LIMITED","message":"x","details":{"retryAfterMs":12500}}'
	var error := ApiError.from_response(429, body)

	var text := ErrorText.describe(error, translator)

	assert_str(text).is_equal("Too many attempts. Try again in 13 s.")


func test_rate_limit_without_waiting_time_uses_the_plain_text() -> void:
	var translator: Node = auto_free(Node.new())
	var error := ApiError.from_response(429, '{"error":"RATE_LIMITED","message":"x"}')

	var text := ErrorText.describe(error, translator)

	assert_str(text).is_equal("Too many attempts. Please wait a moment and try again.")
