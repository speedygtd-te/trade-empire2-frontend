extends GdUnitTestSuite


func test_same_version() -> void:
	assert_int(Contract.compare(Contract.VERSION)).is_equal(0)


func test_newer_and_older_drafts() -> void:
	assert_int(Contract.compare("2.0.0-draft.99")).is_equal(1)
	assert_int(Contract.compare("2.0.0-draft.1")).is_equal(-1)


func test_missing_version() -> void:
	assert_int(Contract.compare("")).is_equal(2)


func test_matches_the_backend_contract_file() -> void:
	# Guards against forgetting to raise VERSION after adapting to a new contract.
	var spec := FileAccess.get_file_as_string("F:/Trade Empire/Backend-V2/openapi.yaml")
	if spec.is_empty():
		return
	var found := RegEx.create_from_string("version: (2\\.0\\.0-draft\\.\\d+)").search(spec)
	assert_object(found).is_not_null()
	assert_str(found.get_string(1)).is_equal(Contract.VERSION)
