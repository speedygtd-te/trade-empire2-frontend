class_name BuildRules
extends RefCounted
## Preview of the build rules, so the player sees before sending whether a placement can work.
##
## Only a preview: the server decides (`POST /v2/bodies/{id}/ops`) and checks more (foreign
## neighbours, overhang, items, tiers). Cells are local to the structure.

enum Verdict {
	OK,
	## The cell already has a hull.
	OCCUPIED,
	## A new hull needs a face neighbour of the same structure.
	NOT_CONNECTED,
	## Only the ground level can be built on for now.
	WRONG_LEVEL,
	## A module needs a hull under every cell of its footprint.
	NO_HULL,
	## A footprint cell already carries a module.
	HULL_OCCUPIED,
	## The hull's slot type does not match the module (INDOOR / OUTDOOR / UNDER_WATER).
	POSITIONING,
	## Not in the structure's inventory.
	NO_ITEM,
	## The hull carries a module; remove the module first.
	HULL_HAS_MODULE,
	## The game data does not know the type.
	UNKNOWN_TYPE,
}

const _NEIGHBOURS: Array[Vector3i] = [
	Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0),
	Vector3i(0, -1, 0), Vector3i(0, 0, 1), Vector3i(0, 0, -1),
]


static func check_place_hull(layout: StructureLayout, cell: Vector3i) -> Verdict:
	if cell.z != 0:
		return Verdict.WRONG_LEVEL
	if not layout.hull_at(cell).is_empty():
		return Verdict.OCCUPIED
	for step: Vector3i in _NEIGHBOURS:
		if not layout.hull_at(cell + step).is_empty():
			return Verdict.OK
	return Verdict.NOT_CONNECTED


## `origin` is the smallest corner of the footprint, `rotation` 0/90/180/270.
static func check_place_module(
	layout: StructureLayout, definitions: GameDefinitions, module_type: String, origin: Vector3i,
	rotation: int = 0
) -> Verdict:
	var module_def := definitions.module(module_type)
	if module_def == null:
		return Verdict.UNKNOWN_TYPE
	for cell: Vector3i in footprint(module_def.size, origin, rotation):
		var hull_type := layout.hull_at(cell)
		if hull_type.is_empty():
			return Verdict.NO_HULL
		if layout.module_at(cell) != null:
			return Verdict.HULL_OCCUPIED
		var hull_def := definitions.hull(hull_type)
		if hull_def == null or not module_def.positioning.has(hull_def.module_positioning):
			return Verdict.POSITIONING
	return Verdict.OK


static func check_remove_hull(layout: StructureLayout, cell: Vector3i) -> Verdict:
	if layout.hull_at(cell).is_empty():
		return Verdict.NO_HULL
	if layout.module_at(cell) != null:
		return Verdict.HULL_HAS_MODULE
	return Verdict.OK


## Cells of a footprint of unrotated `size` with its smallest corner at `origin`.
static func footprint(size: Vector3i, origin: Vector3i, rotation: int) -> Array[Vector3i]:
	var span := Vector3i(size.y, size.x, size.z) if rotation == 90 or rotation == 270 else size
	var cells: Array[Vector3i] = []
	for dz: int in span.z:
		for dy: int in span.y:
			for dx: int in span.x:
				cells.append(origin + Vector3i(dx, dy, dz))
	return cells

