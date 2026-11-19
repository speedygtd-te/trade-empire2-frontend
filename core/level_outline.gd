class_name LevelOutline
extends RefCounted
## Lines that help building on another level: the outline of a neighbouring level's hulls, and
## the borders inside it where one hull type meets another (e.g. starter hulls next to outdoor
## platforms, so the player sees where they can build on top). Pure: cells come in, edges go out.
##
## Cells are a Dictionary Vector2i (x, y) → hull type (String). An edge is a Vector3i
## (x, y, side) of a cell: SIDE_NORTH = towards y + 1, SIDE_SOUTH = y − 1, SIDE_EAST = x + 1,
## SIDE_WEST = x − 1.

const SIDE_NORTH := 0
const SIDE_SOUTH := 1
const SIDE_EAST := 2
const SIDE_WEST := 3
const _STEPS: Array[Vector2i] = [Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0)]


## The edges of the cells' outline: every side whose neighbour is not one of the cells.
static func outline(cells: Dictionary) -> Array[Vector3i]:
	var edges: Array[Vector3i] = []
	for key: Vector2i in cells.keys():
		for side: int in _STEPS.size():
			if not cells.has(key + _STEPS[side]):
				edges.append(Vector3i(key.x, key.y, side))
	return edges


## The borders between neighbouring cells of different hull types, each once (as the north or
## east side of the cell it belongs to).
static func type_borders(cells: Dictionary) -> Array[Vector3i]:
	var edges: Array[Vector3i] = []
	for key: Vector2i in cells.keys():
		for side: int in [SIDE_NORTH, SIDE_EAST]:
			var other: Vector2i = key + _STEPS[side]
			if cells.has(other) and cells[other] != cells[key]:
				edges.append(Vector3i(key.x, key.y, side))
	return edges
