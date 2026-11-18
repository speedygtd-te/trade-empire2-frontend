class_name Ndjson
extends RefCounted
## A finished NDJSON answer (layout and surface streams): one JSON object per line.
##
## The backend ends both streams with an end line; without it the stream was cut off and the
## answer must not be used as a whole.

## Every line as a parsed object, in order. Lines that are no JSON object are left out and
## counted in `broken_lines`.
var objects: Array[Dictionary] = []
var broken_lines := 0


static func parse(text: String) -> Ndjson:
	var result := Ndjson.new()
	for line: String in text.split("\n", false):
		var trimmed := line.strip_edges()
		if trimmed.is_empty():
			continue
		var json := JSON.new()
		if json.parse(trimmed) != OK or typeof(json.data) != TYPE_DICTIONARY:
			result.broken_lines += 1
			continue
		result.objects.append(Wire.as_dict(json.data))
	return result


func first() -> Dictionary:
	return objects[0] if not objects.is_empty() else {}


func last() -> Dictionary:
	return objects[objects.size() - 1] if not objects.is_empty() else {}
