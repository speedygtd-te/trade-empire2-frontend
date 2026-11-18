extends GdUnitTestSuite

## The example of the contract (draft.15).
const STREAM := (
	'{"structureId":3,"rev":812,"gameTime":5400000,"order":"desc","rows":2,"retained":57,"cap":1000,"oldestSeq":1,"newestSeq":57}\n'
	+ '{"seq":57,"gameTime":5390000,"rev":811,"type":"transferOut","counterpartId":9,"items":[{"resource":"IRON","amount":30000000}]}\n'
	+ '{"seq":56,"gameTime":5100000,"rev":790,"type":"moduleCompleted","moduleId":41,"moduleType":"HABITAT","x":4,"y":0,"z":0}\n'
	+ '{"end":true,"rows":2,"more":true}\n'
)


func test_reads_entries_newest_first() -> void:
	var page := StructureLog.from_stream(Ndjson.parse(STREAM))

	assert_int(page.entries.size()).is_equal(2)
	assert_int(page.entries[0].seq).is_equal(57)
	assert_str(page.entries[0].type).is_equal("transferOut")
	assert_int(page.entries[1].game_time_ms).is_equal(5100000)
	assert_str(Wire.as_string(page.entries[1].fields.get("moduleType"))).is_equal("HABITAT")
	assert_bool(page.complete).is_true()
	assert_bool(page.more).is_true()
	assert_int(page.oldest_seq()).is_equal(56)


func test_items_of_an_entry() -> void:
	var page := StructureLog.from_stream(Ndjson.parse(STREAM))

	assert_array(StructureLog.items_of(page.entries[0])).is_equal([["IRON", 30000000]])
	assert_array(StructureLog.items_of(page.entries[1])).is_empty()


func test_empty_log_as_the_live_server_sends_it() -> void:
	var page := StructureLog.from_stream(Ndjson.parse(
		'{"structureId":9,"rev":930,"gameTime":27294359,"order":"desc","rows":0,"retained":0,"cap":1000}\n'
		+ '{"end":true,"rows":0,"more":false}'
	))

	assert_int(page.entries.size()).is_equal(0)
	assert_bool(page.complete).is_true()
	assert_bool(page.more).is_false()
	assert_int(page.oldest_seq()).is_equal(0)


func test_cut_stream_is_incomplete() -> void:
	var cut := STREAM.substr(0, STREAM.find('{"end"'))

	assert_bool(StructureLog.from_stream(Ndjson.parse(cut)).complete).is_false()


func test_other_answers_are_no_log() -> void:
	assert_object(StructureLog.from_stream(Ndjson.parse('{"line":"header","rev":1}'))).is_null()
