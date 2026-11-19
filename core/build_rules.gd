class_name BuildRules
extends RefCounted
## Preview of the build rules, so the player sees before sending whether a placement can work.
##
## Only a preview: the server decides (`POST /v2/bodies/{id}/ops`) and checks more (foreign
## neighbours, items, tiers). Cells are local to the structure; the level rules (grid, height
## limits, environment, overhang) work on absolute cells (LevelRules).

enum Verdict {
	OK,
	## The cell already has a hull.
	OCCUPIED,
	## A new hull needs a face neighbour of the same structure.
	NOT_CONNECTED,
	## A module needs a hull under every cell of its footprint.
	NO_HULL,
	## A footprint cell already carries a module (or is the head of a shaft).
	HULL_OCCUPIED,
	## The hull's slot type does not match the module (INDOOR / OUTDOOR / UNDER_WATER).
	POSITIONING,
	## Not in the structure's inventory.
	NO_ITEM,
	## The hull carries a module (or a shaft head); remove the module first.
	HULL_HAS_MODULE,
	## The game data does not know the type.
	UNKNOWN_TYPE,
	## A guest's X-Y bounding rectangle would leave the dock hulls of its host (DockRules).
	DOCK_AREA_TOO_SMALL,
	## The rectangle would overlap another guest, or the hull would touch two guests.
	DOCK_SPACE_BLOCKED,
	## A guest stands on this dock hull.
	HULL_HAS_GUEST,
	## A guest has to keep a hull on its lowest level, directly on the dock.
	NOT_ON_DOCK,
	## The hull type cannot be built on a body's surface (only on a guest or in space).
	INVALID_HULL_TYPE,
	## The level lies outside the body's grid.
	OUT_OF_BOUNDS,
	## The hull type's own height limit (STARTER 0..1, GLASS_CARBON not below the ground).
	HULL_Z_RESTRICTED,
	## The hull type does not suit the cell's environment (underground, under water …).
	INCOMPATIBLE_HULL,
	## Above the ground a hull needs a hull among the nine cells below it.
	OVERHANG_EXCEEDED,
	## A staircase or elevator needs a free hull of the structure directly above it.
	NO_HULL_ABOVE,
	## The hull above carries a module.
	HULL_ABOVE_OCCUPIED,
	## Only a staircase or elevator forms a shaft.
	NOT_VERTICAL_ACCESS,
	## The shaft's lowest floor is still under construction.
	BASE_BUILDING,
	## The shaft has its maximum number of floors.
	SHAFT_TOO_TALL,
	## A hull of a shape here would found or extend a guest (HullShapes); Single places those.
	GUEST_PLACEMENT,
}

const _NEIGHBOURS: Array[Vector3i] = [
	Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0),
	Vector3i(0, -1, 0), Vector3i(0, 0, 1), Vector3i(0, 0, -1),
]
const _UP := Vector3i(0, 0, 1)


## A hull at a local cell of one structure: free, face to face with the structure, and above the
## ground resting on something (overhang). `supports`: further structures whose hulls carry it
## (the guests of a host).
static func check_place_hull(layout: StructureLayout, cell: Vector3i,
		supports: Array[StructureLayout] = []) -> Verdict:
	if not layout.hull_at(cell).is_empty():
		return Verdict.OCCUPIED
	var connected := false
	for step: Vector3i in _NEIGHBOURS:
		if not layout.hull_at(cell + step).is_empty():
			connected = true
			break
	if not connected:
		return Verdict.NOT_CONNECTED
	var carriers: Array[StructureLayout] = [layout]
	carriers.append_array(supports)
	if not LevelRules.overhang_ok(carriers, layout.to_absolute(cell)):
		return Verdict.OVERHANG_EXCEEDED
	return Verdict.OK


## `origin` is the smallest corner of the footprint, `rotation` 0/90/180/270. A staircase or
## elevator also needs the hull above it free.
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
	if module_def.vertical_access:
		return _check_free_above(layout, origin)
	return Verdict.OK


## A further floor on the shaft that covers a local cell (any floor or its head): the shaft's
## lowest floor is finished, it is not at its height limit, and above its head stands a free hull.
static func check_extend_shaft(layout: StructureLayout, definitions: GameDefinitions, cell: Vector3i) -> Verdict:
	var placed := layout.module_at(cell)
	var module_def := definitions.module(placed.module_type) if placed != null else null
	if module_def == null or not module_def.vertical_access:
		return Verdict.NOT_VERTICAL_ACCESS
	var floors := layout.shaft_of(placed)
	if floors[0].is_building():
		return Verdict.BASE_BUILDING
	if floors.size() >= LevelRules.MAX_SHAFT_FLOORS:
		return Verdict.SHAFT_TOO_TALL
	return _check_free_above(layout, layout.shaft_head(placed))


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


static func _check_free_above(layout: StructureLayout, cell: Vector3i) -> Verdict:
	if layout.hull_at(cell + _UP).is_empty():
		return Verdict.NO_HULL_ABOVE
	if layout.module_at(cell + _UP) != null:
		return Verdict.HULL_ABOVE_OCCUPIED
	return Verdict.OK
