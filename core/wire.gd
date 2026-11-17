class_name Wire
extends RefCounted
## Reads values out of parsed JSON.
##
## Godot's JSON parser returns every number as float (measured on 4.7.2), so integers from the
## backend must be converted explicitly. Values up to 2^53 convert exactly; larger ones lose
## their lowest bits. Requests must be built from real `int` values: JSON.stringify writes an
## int as `5` but a float as `5.0`, which the backend rejects for integer fields.


## Integer value of a JSON number; `fallback` when the value is missing or not a number.
static func as_int(value: Variant, fallback: int = 0) -> int:
	match typeof(value):
		TYPE_FLOAT:
			var number: float = value
			return int(number)
		TYPE_INT:
			var whole: int = value
			return whole
	return fallback


## String value; `fallback` when the value is missing or not a string.
static func as_string(value: Variant, fallback: String = "") -> String:
	if typeof(value) == TYPE_STRING:
		var text: String = value
		return text
	return fallback


## Dictionary value; an empty dictionary when the value is missing or not an object.
static func as_dict(value: Variant) -> Dictionary:
	if typeof(value) == TYPE_DICTIONARY:
		var dict: Dictionary = value
		return dict
	return {}


## Parses a JSON object; an empty dictionary when the text is not a JSON object.
static func parse_object(text: String) -> Dictionary:
	var json := JSON.new()
	if json.parse(text) != OK:
		return {}
	return as_dict(json.data)
