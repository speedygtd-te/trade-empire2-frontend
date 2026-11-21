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
## The enterprise's dock (draft.38): founds daughter structures of the enterprise like DOCK founds
## guests, and members dock their own ships on it.
const ENTERPRISE_DOCK := "ENTERPRISE_DOCK"
## Every hull type that is a dock.
const DOCK_TYPES: PackedStringArray = [DOCK, ENTERPRISE_DOCK]

## Whether a hull type is a dock (DOCK, ENTERPRISE_DOCK).
static func is_dock(hull_type: String) -> bool:
	return DOCK_TYPES.has(hull_type)


## Whether a structure has a dock hull (new structures can be founded on it).
static func has_dock(layout: StructureLayout) -> bool:
	for cell: Vector3i in layout.hull_cells():
		if is_dock(layout.hull_at(cell)):
			return true
	return false


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
	if is_dock(host.hull_at(host_cell + Vector3i(0, 0, -1))):
		return Placement.FOUND
	return Placement.HOST


## Preview of placing a hull at a host cell, guests and docks included. With a hull type, the game
## data and the site the level rules are checked too: a hull of the host by type, grid, height
## limit and environment (LevelRules.check_hull_cell); a guest's hull by grid and the type's
## height limit on the guest's own level (guests skip the environment). Without them only the
## places are checked.
static func check_place_hull(host: StructureLayout, guests: Array[StructureLayout], host_cell: Vector3i,
		hull_type: String = "", definitions: GameDefinitions = null, site: LevelRules.Site = null) -> BuildRules.Verdict:
	var touching := touching_guests(guests, host_cell)
	var on_dock := is_dock(host.hull_at(host_cell + Vector3i(0, 0, -1)))
	var checked := not hull_type.is_empty() and definitions != null and site != null
	if checked:
		var absolute := host.to_absolute(host_cell)
		var cell_verdict := BuildRules.Verdict.OK
		if touching.is_empty() and not on_dock:
			cell_verdict = LevelRules.check_hull_cell(definitions, hull_type, absolute, site)
		elif definitions.hull(hull_type) == null:
			cell_verdict = BuildRules.Verdict.INVALID_HULL_TYPE
		elif not LevelRules.in_bounds(site, absolute.z):
			cell_verdict = BuildRules.Verdict.OUT_OF_BOUNDS
		if cell_verdict != BuildRules.Verdict.OK:
			return cell_verdict
	if owner_at(host, guests, host_cell) != 0:
		return BuildRules.Verdict.OCCUPIED
	if touching.size() > 1:
		return BuildRules.Verdict.DOCK_SPACE_BLOCKED
	var column := Rect2i(Vector2i(host_cell.x, host_cell.y), Vector2i.ONE)
	if touching.size() == 1:
		var guest := touching[0]
		var local := guest_cell(guest, host_cell)
		if local.z < 0:
			return BuildRules.Verdict.NOT_ON_DOCK
		if checked and not LevelRules.hull_z_allowed(hull_type, local.z):
			return BuildRules.Verdict.HULL_Z_RESTRICTED
		var rect := dock_rect(guest)
		return _check_area(host, guests, guest, rect.merge(column) if rect.has_area() else column, dock_level(guest))
	if on_dock:
		if checked and not LevelRules.hull_z_allowed(hull_type, 0):
			return BuildRules.Verdict.HULL_Z_RESTRICTED
		return _check_area(host, guests, null, column, host_cell.z - 1)
	# Off the docks: the host's own rules; touching nothing it would be a new structure off the
	# docks (FOUND_ONLY_ON_DOCK). The guests carry a hull above them as well (overhang).
	return BuildRules.check_place_hull(host, host_cell, guests)


## Preview of removing the hull at a host cell from `structure` (the host or one of the guests).
static func check_remove_hull(
	host: StructureLayout, guests: Array[StructureLayout], structure: StructureLayout, host_cell: Vector3i
) -> BuildRules.Verdict:
	if structure == host:
		var verdict := BuildRules.check_remove_hull(host, host_cell)
		if verdict != BuildRules.Verdict.OK:
			return verdict
		if is_dock(host.hull_at(host_cell)) and guest_on_dock(guests, host_cell) != null:
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
## is open. On the host it is the cell on the active `level` (absolute z): a new hull goes
## exactly there, anything else (inspect, remove, place a module) means the hull there — but a
## new hull on a dock goes on the dock (it founds a guest). A guest keeps its own stacking:
## `new_hull` goes on top of the column, anything else means its topmost hull, and an empty
## column aims at its lowest level.
static func target_cell(host: StructureLayout, focus: StructureLayout, column: Vector2i, new_hull: bool,
		level: int = 0) -> Vector3i:
	if focus == host or not focus.is_docked():
		var cell := Vector3i(column.x, column.y, level - host.offset.z - host.base.z)
		if new_hull and is_dock(host.hull_at(cell)):
			return cell + Vector3i(0, 0, 1)
		return cell
	var local := column - Vector2i(focus.offset.x, focus.offset.y)
	var top := focus.top_in_column(local.x, local.y)
	if top == StructureLayout.NO_LEVEL:
		top = 0
	elif new_hull:
		top += 1
	return host_cell_of(focus, Vector3i(local.x, local.y, top))


## Every column of `rect` has a dock hull on `dock_z`, and no other guest of that level
## overlaps it.
static func _check_area(
	host: StructureLayout, guests: Array[StructureLayout], except: StructureLayout, rect: Rect2i, dock_z: int
) -> BuildRules.Verdict:
	for y: int in range(rect.position.y, rect.end.y):
		for x: int in range(rect.position.x, rect.end.x):
			if not is_dock(host.hull_at(Vector3i(x, y, dock_z))):
				return BuildRules.Verdict.DOCK_AREA_TOO_SMALL
	for other: StructureLayout in guests:
		if other != except and dock_level(other) == dock_z and dock_rect(other).intersects(rect):
			return BuildRules.Verdict.DOCK_SPACE_BLOCKED
	return BuildRules.Verdict.OK
