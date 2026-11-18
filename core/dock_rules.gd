class_name DockRules
extends RefCounted
## Guests on docks: where they stand, which structure a cell belongs to, and a preview of the
## dock rules (contract: `buildOps`, section "Docks").
##
## A hull directly above an own DOCK hull that touches no guest founds a guest (a structure of
## its own, anchor `docked`); a hull touching exactly one guest extends it. A guest's X-Y bounding
## rectangle lies wholly on dock hulls of one level of its host, and rectangles of one level do
## not overlap. A dock under a guest stays, and a guest keeps a hull on its lowest level.
##
## Only a preview: the server decides. Every cell here is a local cell of the HOST; a guest's
## `offset` lies in that grid (guest local cell = host cell − offset).

const DOCK := "DOCK"

## What a hull placed at a host cell does.
enum Placement {
	## Joins the host (or is refused by the host's rules).
	HOST,
	## Founds a new guest on the dock below.
	FOUND,
	## Extends the guest it touches.
	EXTEND,
}

const _NEIGHBOURS: Array[Vector3i] = [
	Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0),
	Vector3i(0, -1, 0), Vector3i(0, 0, 1), Vector3i(0, 0, -1),
]


## The guest's local cell of a host cell.
static func guest_cell(guest: StructureLayout, host_cell: Vector3i) -> Vector3i:
	return host_cell - guest.offset


## The host cell of a guest's local cell.
static func host_cell_of(guest: StructureLayout, local: Vector3i) -> Vector3i:
	return local + guest.offset


## Level of the dock hulls a guest stands on.
static func dock_level(guest: StructureLayout) -> int:
	return guest.offset.z - 1


## X-Y bounding rectangle of a guest's hulls in the host's grid; empty without hulls.
static func dock_rect(guest: StructureLayout) -> Rect2i:
	var cells := guest.hull_cells()
	if cells.is_empty():
		return Rect2i()
	var low := Vector2i(cells[0].x, cells[0].y)
	var high := low
	for cell: Vector3i in cells:
		low = low.min(Vector2i(cell.x, cell.y))
		high = high.max(Vector2i(cell.x, cell.y))
	return Rect2i(low + Vector2i(guest.offset.x, guest.offset.y), high - low + Vector2i.ONE)


## The guest with a hull at a host cell, or null.
static func guest_at(guests: Array[StructureLayout], host_cell: Vector3i) -> StructureLayout:
	for guest: StructureLayout in guests:
		if not guest.hull_at(guest_cell(guest, host_cell)).is_empty():
			return guest
	return null


## Id of the structure (host or guest) with a hull at a host cell; 0 when the cell is free.
static func owner_at(host: StructureLayout, guests: Array[StructureLayout], host_cell: Vector3i) -> int:
	if not host.hull_at(host_cell).is_empty():
		return host.structure_id
	var guest := guest_at(guests, host_cell)
	return guest.structure_id if guest != null else 0


## The guest standing over a dock cell (its rectangle covers the cell on the cell's level), or null.
static func guest_on_dock(guests: Array[StructureLayout], host_cell: Vector3i) -> StructureLayout:
	for guest: StructureLayout in guests:
		if dock_level(guest) == host_cell.z and dock_rect(guest).has_point(Vector2i(host_cell.x, host_cell.y)):
			return guest
	return null


## Guests with a hull face to face with a host cell.
static func touching_guests(guests: Array[StructureLayout], host_cell: Vector3i) -> Array[StructureLayout]:
	var result: Array[StructureLayout] = []
	for guest: StructureLayout in guests:
		for step: Vector3i in _NEIGHBOURS:
			if not guest.hull_at(guest_cell(guest, host_cell + step)).is_empty():
				result.append(guest)
				break
	return result


## What a hull placed at a host cell would do: join the host, found a guest or extend one.
static func placement(host: StructureLayout, guests: Array[StructureLayout], host_cell: Vector3i) -> Placement:
	if not touching_guests(guests, host_cell).is_empty():
		return Placement.EXTEND
	if host.hull_at(host_cell + Vector3i(0, 0, -1)) == DOCK:
		return Placement.FOUND
	return Placement.HOST


## Preview of placing a hull at a host cell, guests and docks included.
static func check_place_hull(host: StructureLayout, guests: Array[StructureLayout], host_cell: Vector3i) -> BuildRules.Verdict:
	if owner_at(host, guests, host_cell) != 0:
		return BuildRules.Verdict.OCCUPIED
	var touching := touching_guests(guests, host_cell)
	if touching.size() > 1:
		return BuildRules.Verdict.DOCK_SPACE_BLOCKED
	var column := Rect2i(Vector2i(host_cell.x, host_cell.y), Vector2i.ONE)
	if touching.size() == 1:
		var guest := touching[0]
		var rect := dock_rect(guest)
		return _check_area(host, guests, guest, rect.merge(column) if rect.has_area() else column, dock_level(guest))
	if host.hull_at(host_cell + Vector3i(0, 0, -1)) == DOCK:
		return _check_area(host, guests, null, column, host_cell.z - 1)
	return BuildRules.check_place_hull(host, host_cell)


## Preview of removing the hull at a host cell from `structure` (the host or one of the guests).
static func check_remove_hull(
	host: StructureLayout, guests: Array[StructureLayout], structure: StructureLayout, host_cell: Vector3i
) -> BuildRules.Verdict:
	if structure == host:
		var verdict := BuildRules.check_remove_hull(host, host_cell)
		if verdict != BuildRules.Verdict.OK:
			return verdict
		if host.hull_at(host_cell) == DOCK and guest_on_dock(guests, host_cell) != null:
			return BuildRules.Verdict.HULL_HAS_GUEST
		return BuildRules.Verdict.OK
	var local := guest_cell(structure, host_cell)
	var own := BuildRules.check_remove_hull(structure, local)
	if own != BuildRules.Verdict.OK:
		return own
	if local.z == 0 and structure.hull_count() > 1:
		var on_dock := 0
		for cell: Vector3i in structure.hull_cells():
			if cell.z == 0:
				on_dock += 1
		if on_dock == 1:
			return BuildRules.Verdict.NOT_ON_DOCK
	return BuildRules.Verdict.OK


## Whether removing the hull at a host cell removes the whole guest (it is its last hull).
static func removes_guest(guest: StructureLayout, host_cell: Vector3i) -> bool:
	return guest.is_docked() and guest.hull_count() == 1 and not guest.hull_at(guest_cell(guest, host_cell)).is_empty()


## The host cell a tap on the column (host x, y) aims at while `focus` (the host or a guest)
## is open. `new_hull`: a hull is to be placed (it goes on top); otherwise the topmost hull of the
## column is meant (inspect, remove, place a module). On the host a new hull on a dock goes on
## the dock (it founds a guest); on a guest an empty column aims at its lowest level.
static func target_cell(host: StructureLayout, focus: StructureLayout, column: Vector2i, new_hull: bool) -> Vector3i:
	if focus == host or not focus.is_docked():
		var top := host.top_in_column(column.x, column.y)
		if top == StructureLayout.NO_LEVEL:
			return Vector3i(column.x, column.y, 0)
		if new_hull and host.hull_at(Vector3i(column.x, column.y, top)) == DOCK:
			return Vector3i(column.x, column.y, top + 1)
		return Vector3i(column.x, column.y, top)
	var local := column - Vector2i(focus.offset.x, focus.offset.y)
	var level := focus.top_in_column(local.x, local.y)
	if level == StructureLayout.NO_LEVEL:
		level = 0
	elif new_hull:
		level += 1
	return host_cell_of(focus, Vector3i(local.x, local.y, level))


## Every column of `rect` has a dock hull on `dock_z`, and no other guest of that level
## overlaps it.
static func _check_area(
	host: StructureLayout, guests: Array[StructureLayout], except: StructureLayout, rect: Rect2i, dock_z: int
) -> BuildRules.Verdict:
	for y: int in range(rect.position.y, rect.end.y):
		for x: int in range(rect.position.x, rect.end.x):
			if host.hull_at(Vector3i(x, y, dock_z)) != DOCK:
				return BuildRules.Verdict.DOCK_AREA_TOO_SMALL
	for other: StructureLayout in guests:
		if other != except and dock_level(other) == dock_z and dock_rect(other).intersects(rect):
			return BuildRules.Verdict.DOCK_SPACE_BLOCKED
	return BuildRules.Verdict.OK
