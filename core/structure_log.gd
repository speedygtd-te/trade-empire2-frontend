class_name StructureLog
extends RefCounted
## One page of a structure's log (`GET /v2/structures/{id}/logs`), newest first.


class Entry:
	extends RefCounted
	## Counts from 1 per structure without gaps.
	var seq := 0
	var game_time_ms := 0
	## founded, hullsPlaced, modulePlaced, moduleCompleted, blueprintSet, discarded …
	var type := ""
	## The type's own fields, as sent.
	var fields: Dictionary = {}


var entries: Array[Entry] = []
## The server holds older entries than the last one of this page.
var more := false
## The stream ended properly.
var complete := false


## Reads a finished log stream; null when the first line is no log header.
static func from_stream(stream: Ndjson) -> StructureLog:
	var header := stream.first()
	if not header.has("order") or not header.has("structureId"):
		return null
	var page := StructureLog.new()
	for index: int in range(1, stream.objects.size()):
		var line := stream.objects[index]
		if line.has("seq") and line.has("type"):
			var entry := Entry.new()
			entry.seq = Wire.as_int(line.get("seq"))
			entry.game_time_ms = Wire.as_int(line.get("gameTime"))
			entry.type = Wire.as_string(line.get("type"))
			entry.fields = line
			page.entries.append(entry)
	var end := stream.last()
	page.complete = end.get("end") == true and Wire.as_int(end.get("rows"), -1) == page.entries.size()
	page.more = end.get("more") == true
	return page


## The `seq` to ask `before` for the next older page; 0 when the page is empty.
func oldest_seq() -> int:
	return entries[entries.size() - 1].seq if not entries.is_empty() else 0


## Items of an entry (discarded, transfers, grants) as [resource, micro-units] pairs.
static func items_of(entry: Entry) -> Array[Array]:
	var result: Array[Array] = []
	var items: Variant = entry.fields.get("items")
	if typeof(items) != TYPE_ARRAY:
		return result
	var list: Array = items
	for item: Variant in list:
		var row := Wire.as_dict(item)
		result.append([Wire.as_string(row.get("resource")), Wire.as_int(row.get("amount"))])
	return result
