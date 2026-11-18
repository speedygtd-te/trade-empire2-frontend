class_name StructureLayout
extends RefCounted
## The hulls and modules of one structure (`GET /v2/structures/{id}/layout`), kept up to date
## with delta loads (`since`). Cells are local to the structure's grid; `offset` turns them
## into absolute cells of the body (surface anchor). A docked guest's `offset` lies in its
## host's grid; `base` (the host's offset) completes the way to absolute cells.

const CHUNK := 16
## "No level": what top_in_column answers for an empty column.
const NO_LEVEL := -(1 << 30)


## A guest docked on this structure (header `guests`).
class Guest:
	extends RefCounted
	var structure_id: int = 0
	## Local cell of this structure that holds the guest's local origin.
	var offset: Vector3i = Vector3i.ZERO
	## X-Y bounding rectangle in this structure's grid (inclusive bounds as Rect2i: position =
	## smallest corner, end = largest corner + 1); empty for a guest without hulls.
	var rect: Rect2i = Rect2i()
	## Level of the dock hulls under the guest (offset.z − 1).
	var dock_z: int = 0


class Module:
	extends RefCounted
	var module_id: int = 0
	var module_type: String = ""
	## Smallest corner of the footprint, local.
	var origin: Vector3i = Vector3i.ZERO
	## Unrotated size from the game data.
	var size: Vector3i = Vector3i.ONE
	## 0, 90, 180 or 270 degrees around the vertical axis.
	var rotation: int = 0
	## "building" or "active".
	var status: String = ""
	## Game time (ms) when a module under construction is finished.
	var completes_at: int = 0
	var blueprint: String = ""

	## Size of the footprint after rotation: 90 and 270 swap x and y.
	func extent() -> Vector3i:
		if rotation == 90 or rotation == 270:
			return Vector3i(size.y, size.x, size.z)
		return size

	func is_building() -> bool:
		return status == "building"

	## Every local cell of the footprint.
	func cells() -> Array[Vector3i]:
		var result: Array[Vector3i] = []
		var span := extent()
		for dz: int in span.z:
			for dy: int in span.y:
				for dx: int in span.x:
					result.append(origin + Vector3i(dx, dy, dz))
		return result


var structure_id: int = 0
## "surface", "free" or "docked".
var anchor_type: String = ""
var body_id: String = ""
## Absolute cell = base + offset + local cell.
var offset: Vector3i = Vector3i.ZERO
## Docked guest: the host's offset (set by whoever knows the host); 0 for any other anchor.
var base: Vector3i = Vector3i.ZERO
## Docked guest: the structure it stands on; 0 otherwise.
var host_id: int = 0
var kind: String = ""
## The state the layout is valid for; the next delta load asks `since` this.
var rev: int = -1
## Guests docked on this structure, by id (from the last header).
var guests: Array[Guest] = []

## Local cell → hull type.
var _hulls: Dictionary = {}
## Module id → Module.
var _modules: Dictionary = {}
## Local cell → module id, for every cell of every footprint.
var _module_cells: Dictionary = {}
## Chunk → local cells of its hulls, and chunk → ids of the modules that have their origin there.
var _chunk_hulls: Dictionary = {}
var _chunk_modules: Dictionary = {}


## Applies a finished layout stream (full or delta). Returns false and changes nothing when
## the stream is not a complete layout of this structure.
func apply(stream: Ndjson) -> bool:
	var header := stream.first()
	var end := stream.last()
	if Wire.as_string(header.get("line")) != "header" or Wire.as_string(end.get("line")) != "end":
		return false
	var id := Wire.as_int(header.get("structureId"))
	if structure_id != 0 and id != structure_id:
		return false
	var chunks: Array[Dictionary] = []
	for index: int in range(1, stream.objects.size() - 1):
		if Wire.as_string(stream.objects[index].get("line")) == "chunk":
			chunks.append(stream.objects[index])
	if chunks.size() != Wire.as_int(header.get("chunks"), -1):
		return false

	structure_id = id
	var anchor := Wire.as_dict(header.get("anchor"))
	anchor_type = Wire.as_string(anchor.get("type"))
	body_id = Wire.as_string(anchor.get("bodyId"))
	offset = _position(Wire.as_dict(anchor.get("offset")))
	host_id = Wire.as_int(anchor.get("hostId")) if anchor_type == "docked" else 0
	kind = Wire.as_string(header.get("kind"))
	guests = _read_guests(header.get("guests"))
	if not header.has("since"):
		_clear()
	for chunk: Dictionary in chunks:
		_apply_chunk(chunk)
	rev = Wire.as_int(header.get("rev"), rev)
	return true


## Hull type at a local cell; "" when there is none.
func hull_at(cell: Vector3i) -> String:
	return Wire.as_string(_hulls.get(cell))


## The module covering a local cell, or null.
func module_at(cell: Vector3i) -> Module:
	if not _module_cells.has(cell):
		return null
	return _modules.get(_module_cells[cell]) as Module


func module(module_id: int) -> Module:
	return _modules.get(module_id) as Module


func hull_cells() -> Array[Vector3i]:
	var result: Array[Vector3i] = []
	for cell: Vector3i in _hulls.keys():
		result.append(cell)
	return result


func modules() -> Array[Module]:
	var result: Array[Module] = []
	for entry: Module in _modules.values():
		result.append(entry)
	return result


func hull_count() -> int:
	return _hulls.size()


func module_count() -> int:
	return _modules.size()


## Local cell of an absolute cell of the body.
func to_local(absolute: Vector3i) -> Vector3i:
	return absolute - offset - base


func to_absolute(local: Vector3i) -> Vector3i:
	return local + offset + base


func is_docked() -> bool:
	return anchor_type == "docked"


## Levels (local z) that carry at least one hull, lowest first.
func levels() -> Array[int]:
	var found: Dictionary = {}
	for cell: Vector3i in _hulls.keys():
		found[cell.z] = true
	var result: Array[int] = []
	for z: int in found.keys():
		result.append(z)
	result.sort()
	return result


## Highest level (local z) with a hull in the column at local x, y; NO_LEVEL when the column
## is empty.
func top_in_column(x: int, y: int) -> int:
	var top := NO_LEVEL
	for cell: Vector3i in _hulls.keys():
		if cell.x == x and cell.y == y and cell.z > top:
			top = cell.z
	return top


## Marks a module as finished (SSE `module.completed`) without a reload.
func complete_module(module_id: int) -> void:
	var entry := module(module_id)
	if entry != null:
		entry.status = "active"


func _clear() -> void:
	_hulls.clear()
	_modules.clear()
	_module_cells.clear()
	_chunk_hulls.clear()
	_chunk_modules.clear()


func _apply_chunk(line: Dictionary) -> void:
	var coords: Array = line.get("chunk") if typeof(line.get("chunk")) == TYPE_ARRAY else []
	if coords.size() != 3:
		return
	var chunk := Vector3i(Wire.as_int(coords[0]), Wire.as_int(coords[1]), Wire.as_int(coords[2]))
	var base := chunk * CHUNK

	for cell: Vector3i in _chunk_hulls.get(chunk, []):
		_hulls.erase(cell)
	_chunk_hulls.erase(chunk)
	for module_id: int in _chunk_modules.get(chunk, []):
		_remove_module(module_id)
	_chunk_modules.erase(chunk)
	if line.get("empty") == true:
		return

	var types: Array = line.get("hullTypes") if typeof(line.get("hullTypes")) == TYPE_ARRAY else []
	var cells: Array[Vector3i] = []
	for entry: Variant in line.get("hulls") if typeof(line.get("hulls")) == TYPE_ARRAY else []:
		if typeof(entry) != TYPE_ARRAY:
			continue
		var values: Array = entry
		if values.size() != 4:
			continue
		var type_index := Wire.as_int(values[3], -1)
		if type_index < 0 or type_index >= types.size():
			continue
		var cell := base + Vector3i(Wire.as_int(values[0]), Wire.as_int(values[1]), Wire.as_int(values[2]))
		_hulls[cell] = Wire.as_string(types[type_index])
		cells.append(cell)
	_chunk_hulls[chunk] = cells

	var ids: Array[int] = []
	for entry: Variant in line.get("modules") if typeof(line.get("modules")) == TYPE_ARRAY else []:
		var placed := _read_module(Wire.as_dict(entry))
		if placed.module_id == 0:
			continue
		_remove_module(placed.module_id)
		_modules[placed.module_id] = placed
		for cell: Vector3i in placed.cells():
			_module_cells[cell] = placed.module_id
		ids.append(placed.module_id)
	_chunk_modules[chunk] = ids


func _remove_module(module_id: int) -> void:
	var entry := module(module_id)
	if entry == null:
		return
	for cell: Vector3i in entry.cells():
		if _module_cells.get(cell) == module_id:
			_module_cells.erase(cell)
	_modules.erase(module_id)


static func _read_module(data: Dictionary) -> Module:
	var entry := Module.new()
	entry.module_id = Wire.as_int(data.get("moduleId"))
	entry.module_type = Wire.as_string(data.get("moduleType"))
	entry.origin = Vector3i(Wire.as_int(data.get("x")), Wire.as_int(data.get("y")), Wire.as_int(data.get("z")))
	var size := _position(Wire.as_dict(data.get("size")))
	entry.size = Vector3i(maxi(size.x, 1), maxi(size.y, 1), maxi(size.z, 1))
	entry.rotation = Wire.as_int(data.get("rotation"))
	entry.status = Wire.as_string(data.get("status"))
	entry.completes_at = Wire.as_int(data.get("completesAt"))
	entry.blueprint = Wire.as_string(data.get("blueprint"))
	return entry


static func _read_guests(value: Variant) -> Array[Guest]:
	var result: Array[Guest] = []
	if typeof(value) != TYPE_ARRAY:
		return result
	var entries: Array = value
	for entry: Variant in entries:
		var data := Wire.as_dict(entry)
		var guest := Guest.new()
		guest.structure_id = Wire.as_int(data.get("structureId"))
		if guest.structure_id == 0:
			continue
		guest.offset = _position(Wire.as_dict(data.get("offset")))
		guest.dock_z = guest.offset.z - 1
		var rect := Wire.as_dict(data.get("rect"))
		if not rect.is_empty():
			var low := Vector2i(Wire.as_int(rect.get("minX")), Wire.as_int(rect.get("minY")))
			var high := Vector2i(Wire.as_int(rect.get("maxX")), Wire.as_int(rect.get("maxY")))
			guest.rect = Rect2i(low, high - low + Vector2i.ONE)
			guest.dock_z = Wire.as_int(rect.get("z"), guest.dock_z)
		result.append(guest)
	return result


static func _position(data: Dictionary) -> Vector3i:
	return Vector3i(Wire.as_int(data.get("x")), Wire.as_int(data.get("y")), Wire.as_int(data.get("z")))
