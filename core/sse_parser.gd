class_name SseParser
extends RefCounted
## Turns the lines of a text/event-stream into events.
##
## Implements the part of the Server-Sent Events format the backend uses: the fields `event`,
## `data` and `id`, comment lines starting with ":" (the heartbeat) and a blank line that ends an
## event. Other fields are ignored. An event without any `data` line is dropped, as the format
## requires.

var _type := ""
var _id := ""
var _data := PackedStringArray()


## Feeds one line (without its terminator). Returns the event this line completed, or null.
func push_line(line: String) -> SseEvent:
	if line.is_empty():
		return _dispatch()
	if line.begins_with(":"):
		return null

	var field := line
	var value := ""
	var colon := line.find(":")
	if colon != -1:
		field = line.substr(0, colon)
		value = line.substr(colon + 1)
		if value.begins_with(" "):
			value = value.substr(1)

	match field:
		"event":
			_type = value
		"data":
			_data.append(value)
		"id":
			_id = value
	return null


## Drops a half-received event, e.g. after the connection was lost.
func reset() -> void:
	_type = ""
	_id = ""
	_data = PackedStringArray()


func _dispatch() -> SseEvent:
	if _data.is_empty():
		reset()
		return null
	var event := SseEvent.new()
	if not _type.is_empty():
		event.type = _type
	event.data = "\n".join(_data)
	event.id = _id
	reset()
	return event
