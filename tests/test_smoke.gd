extends GdUnitTestSuite
## Proves that the test runner works in this project.


func test_gdscript_int_is_64_bit() -> void:
	var max_int64: int = 9223372036854775807
	assert_int(max_int64).is_greater(9007199254740993)
