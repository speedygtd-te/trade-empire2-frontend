class_name SurfacePatch
extends RefCounted
## A rectangle of a body's surface (`GET /v2/bodies/{id}/surface`), in absolute cells.


class Cell:
	extends RefCounted
	## Biome key, upper case (PLAINS, MOUNTAIN …).
	var biome: String = ""
	## Asset variant 0..3.
	var variant: int = 0
	## Vegetation 0..6.
	var vegetation: int = 0
	## Elevation 0..1000.
	var elevation: int = 0
	## Moisture 0..1000.
	var moisture: int = 0
	## Deposits of the cell (`d`): resource key → richness 5..100 as the stream sends it (biome
	## of this level, no depth bonus). Only filled when the patch was asked for with deposits.
	var deposits: Dictionary = {}


var body_id: String = ""
var body_class: String = ""
var rev: int = -1
var x0: int = 0
var y0: int = 0
var x1: int = -1
var y1: int = -1
var z: int = 0
## Whether the cells carry their deposits (`includeDeposits`); an empty `deposits` then means
## the ground holds nothing.
var include_deposits := false
## True when the stream ended properly and delivered every announced row.
var complete := false

var _cells: Dictionary = {}


## Reads a finished surface stream; null when the first line is no surface header.
static func from_stream(stream: Ndjson) -> SurfacePatch:
	var header := stream.first()
	if not header.has("x0") or not header.has("rows"):
		return null
	var patch := SurfacePatch.new()
	patch.body_id = Wire.as_string(header.get("bodyId"))
	patch.body_class = Wire.as_string(header.get("bodyClass"))
	patch.rev = Wire.as_int(header.get("rev"), -1)
	patch.x0 = Wire.as_int(header.get("x0"))
	patch.y0 = Wire.as_int(header.get("y0"))
	patch.x1 = Wire.as_int(header.get("x1"), -1)
	patch.y1 = Wire.as_int(header.get("y1"), -1)
	patch.z = Wire.as_int(header.get("z"))
	patch.include_deposits = header.get("includeDeposits") == true
	var announced := Wire.as_int(header.get("rows"))
	var rows := 0
	for index: int in range(1, stream.objects.size()):
		var line := stream.objects[index]
		if line.has("y") and typeof(line.get("cells")) == TYPE_ARRAY:
			patch._read_row(line)
			rows += 1
	var end := stream.last()
	patch.complete = (
		stream.objects.size() > 1 and end.get("end") == true and rows == announced
		and Wire.as_int(end.get("rows"), -1) == rows
	)
	return patch


func width() -> int:
	return x1 - x0 + 1


func height() -> int:
	return y1 - y0 + 1


## The cell at absolute (x, y), or null outside the patch.
func cell(x: int, y: int) -> Cell:
	return _cells.get(Vector2i(x, y)) as Cell


func cell_count() -> int:
	return _cells.size()


func _read_row(line: Dictionary) -> void:
	var y := Wire.as_int(line.get("y"))
	var cells: Array = line.get("cells")
	for offset: int in cells.size():
		var data := Wire.as_dict(cells[offset])
		var entry := Cell.new()
		entry.biome = Wire.as_string(data.get("b"))
		entry.variant = Wire.as_int(data.get("v"))
		entry.vegetation = Wire.as_int(data.get("g"))
		entry.elevation = Wire.as_int(data.get("e"))
		entry.moisture = Wire.as_int(data.get("m"))
		var found: Variant = data.get("d")
		if typeof(found) == TYPE_ARRAY:
			var list: Array = found
			for item: Variant in list:
				var deposit := Wire.as_dict(item)
				var resource := Wire.as_string(deposit.get("r"))
				if not resource.is_empty():
					entry.deposits[resource] = Wire.as_int(deposit.get("R"))
		_cells[Vector2i(x0 + offset, y)] = entry
