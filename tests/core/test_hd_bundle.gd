extends GdUnitTestSuite

const MANIFEST_URL := "https://assets.example.test/game/hd/manifest.json"
const SHA_A := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const SHA_B := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"


func _manifest(bundles: Array) -> String:
	return JSON.stringify({"schema": 1, "bundles": bundles})


func _bundle(version: String, format: int = 1, engine: String = "4.7", sha: String = SHA_A) -> Dictionary:
	return {"format": format, "engine": engine, "version": version, "path": version + "/models_hd.pck",
		"size": 35062744, "sha256": sha}


func test_pick_takes_the_entry_of_this_format_and_engine() -> void:
	var text := _manifest([_bundle("old", 0), _bundle("v1"), _bundle("other-engine", 1, "4.8")])

	var entry := HdBundle.pick(text, MANIFEST_URL, 1, "4.7")

	assert_object(entry).is_not_null()
	assert_str(entry.version).is_equal("v1")
	assert_str(entry.url).is_equal("https://assets.example.test/game/hd/v1/models_hd.pck")
	assert_int(entry.size).is_equal(35062744)
	assert_str(entry.sha256).is_equal(SHA_A)


func test_pick_lower_cases_the_checksum_and_takes_the_last_fitting_entry() -> void:
	var text := _manifest([_bundle("v1"), _bundle("v2", 1, "4.7", SHA_B.to_upper())])

	var entry := HdBundle.pick(text, MANIFEST_URL, 1, "4.7")

	assert_str(entry.version).is_equal("v2")
	assert_str(entry.sha256).is_equal(SHA_B)


func test_pick_has_nothing_for_another_format_or_engine() -> void:
	var text := _manifest([_bundle("v1", 2), _bundle("v2", 1, "4.6")])

	assert_object(HdBundle.pick(text, MANIFEST_URL, 1, "4.7")).is_null()
	assert_bool(HdBundle.is_manifest(text)).is_true()


func test_pick_refuses_broken_manifests_and_entries() -> void:
	assert_object(HdBundle.pick("", MANIFEST_URL, 1, "4.7")).is_null()
	assert_object(HdBundle.pick("<html>", MANIFEST_URL, 1, "4.7")).is_null()
	assert_object(HdBundle.pick('{"schema":2,"bundles":[]}', MANIFEST_URL, 1, "4.7")).is_null()
	assert_bool(HdBundle.is_manifest("<html>")).is_false()
	assert_bool(HdBundle.is_manifest('{"schema":1}')).is_false()
	var bad_hash := _bundle("v1")
	bad_hash["sha256"] = "1234"
	var bad_version := _bundle("../evil")
	bad_version["path"] = "x/models_hd.pck"
	var too_big := _bundle("v1")
	too_big["size"] = HdBundle.MAX_SIZE + 1
	var escaping := _bundle("v1")
	escaping["path"] = "../../secret.pck"
	for broken: Dictionary in [bad_hash, bad_version, too_big, escaping]:
		assert_object(HdBundle.pick(_manifest([broken]), MANIFEST_URL, 1, "4.7")).is_null()


func test_resolve_keeps_https_addresses_and_refuses_others() -> void:
	assert_str(HdBundle.resolve(MANIFEST_URL, "https://cdn.example.test/a.pck")).is_equal("https://cdn.example.test/a.pck")
	assert_str(HdBundle.resolve(MANIFEST_URL, "http://cdn.example.test/a.pck")).is_empty()
	assert_str(HdBundle.resolve(MANIFEST_URL, "/root.pck")).is_empty()
	assert_str(HdBundle.resolve(MANIFEST_URL, "")).is_empty()
	assert_str(HdBundle.resolve("http://insecure.test/manifest.json", "a.pck")).is_empty()


func test_engine_tag_is_major_and_minor() -> void:
	assert_str(HdBundle.engine_tag({"major": 4, "minor": 7, "patch": 2})).is_equal("4.7")


func test_safe_versions() -> void:
	assert_bool(HdBundle.is_safe_version("20261120-1a2b3c4d5e6f")).is_true()
	assert_bool(HdBundle.is_safe_version("v1.2_b")).is_true()
	for unsafe: String in ["", ".hidden", "a/b", "a b", "a\\b", "x".repeat(65), "ä"]:
		assert_bool(HdBundle.is_safe_version(unsafe)).override_failure_message(unsafe).is_false()


func test_record_round_trip() -> void:
	var entry := HdBundle.Entry.new()
	entry.version = "v3"
	entry.size = 12
	entry.sha256 = SHA_B

	var back := HdBundle.parse_record(HdBundle.current_record(entry))

	assert_str(back.version).is_equal("v3")
	assert_int(back.size).is_equal(12)
	assert_str(back.sha256).is_equal(SHA_B)
	assert_object(HdBundle.parse_record("")).is_null()
	assert_object(HdBundle.parse_record('{"version":"../x","size":1,"sha256":"%s"}' % SHA_B)).is_null()


func test_paths_live_in_the_cache_folder() -> void:
	assert_str(HdBundle.pack_path("v3")).is_equal("user://hd/v3.pck")
	assert_str(HdBundle.part_path("v3")).is_equal("user://hd/v3.part")


func test_stale_files_keep_only_the_pack_in_use_and_its_record() -> void:
	var files := PackedStringArray(["v2.pck", "v3.pck", "v3.part", "v4.part", "current.json"])

	assert_array(Array(HdBundle.stale_files(files, "v3"))).contains_exactly(["v2.pck", "v3.part", "v4.part"])
	assert_array(Array(HdBundle.stale_files(files, ""))).contains_exactly(Array(files))


func test_file_sha256_matches_the_known_digest() -> void:
	var path := "user://test_hd_bundle_hash.bin"
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string("abc")
	file.close()

	var digest := HdBundle.file_sha256(path)
	DirAccess.remove_absolute(path)

	assert_str(digest).is_equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
	assert_str(HdBundle.file_sha256("user://missing_file.bin")).is_empty()
	assert_bool(HdBundle.is_sha256(digest)).is_true()
	assert_bool(HdBundle.is_sha256(digest.to_upper())).is_false()
