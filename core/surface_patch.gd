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
	## Probes that landed on the cell (`p`, draft.32; any player's), oldest first; empty without.
	var impacts: Array[Probes.Impact] = []


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
## Cells the player has not explored (draft.31: `null` in `SurfaceRow.cells`) → true. They have
## no terrain and no deposits; `cell` returns null for them.
var _hidden: Dictionary = {}
## Cells with impact sites (draft.32) → their Array of Probes.Impact.
var _impact_cells: Dictionary = {}
## Elevation of every cell, row by row from (x0, y0); -1 where unexplored or not sent. For the
## relief, which reads hundreds of cells per block (TerrainRelief).
var _elevations := PackedInt32Array()
## 1 where the cell carries a water biome (LevelRules.is_water_biome), row by row like _elevations.
var _water := PackedByteArray()


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
	patch._elevations.resize(maxi(patch.width(), 0) * maxi(patch.height(), 0))
	patch._elevations.fill(-1)
	patch._water.resize(patch._elevations.size())
	patch._water.fill(0)
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


## Elevation of the cell at absolute (x, y); -1 when unexplored or outside the patch.
func elevation(x: int, y: int) -> int:
	if x < x0 or x > x1 or y < y0 or y > y1:
		return -1
	return _elevations[(y - y0) * (x1 - x0 + 1) + x - x0]


## Whether the cell at absolute (x, y) carries a water biome; false when unexplored or outside.
func is_water(x: int, y: int) -> bool:
	if x < x0 or x > x1 or y < y0 or y > y1:
		return false
	return _water[(y - y0) * (x1 - x0 + 1) + x - x0] == 1


func cell_count() -> int:
	return _cells.size()


## Whether the cell at absolute (x, y) lies in the patch but is not explored (fog, draft.31).
func is_hidden(x: int, y: int) -> bool:
	return _hidden.has(Vector2i(x, y))


func hidden_count() -> int:
	return _hidden.size()


## The cells of the patch with impact sites (draft.32): cell → Array of Probes.Impact.
func impact_cells() -> Dictionary:
	return _impact_cells


func _read_row(line: Dictionary) -> void:
	var y := Wire.as_int(line.get("y"))
	var cells: Array = line.get("cells")
	for offset: int in cells.size():
		if typeof(cells[offset]) != TYPE_DICTIONARY:
			_hidden[Vector2i(x0 + offset, y)] = true
			continue
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
		var landed: Variant = data.get("p")
		if typeof(landed) == TYPE_ARRAY:
			var list: Array = landed
			for item: Variant in list:
				entry.impacts.append(Probes.Impact.from_wire(Wire.as_dict(item), x0 + offset, y))
			_impact_cells[Vector2i(x0 + offset, y)] = entry.impacts
		_cells[Vector2i(x0 + offset, y)] = entry
		if y >= y0 and y <= y1 and offset < width():
			_elevations[(y - y0) * width() + offset] = entry.elevation
			_water[(y - y0) * width() + offset] = 1 if LevelRules.is_water_biome(entry.biome) else 0
