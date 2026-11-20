class_name TravelPlan
extends RefCounted
## Planning a trip of one own structure (`POST /v2/structures/{id}/travel/quote` and `…/travel`):
## the request, the quote read for display, where the structure would stand at a landing site,
## a suggested site, a place on a host's docks and the line of a drive.
##
## Only a preview: the server decides. The client knows the cells of the player's own structures
## and checks against them (taken, touching an own structure); foreign hulls, reservations and
## protected zones come only from the quote.

const MODE_FLIGHT := "flight"
const MODE_GROUND := "ground"
## Waypoints a drive may have (TravelRequest.waypoints, maxItems).
const MAX_WAYPOINTS := 16
const DOCK := "DOCK"
## Atmosphere factor ×1.0 in micro-units (`atmosphereFactor`, draft.36).
const ATMOSPHERE_NONE := 1000000

## The client's check of a landing or stopping site.
enum Site {
	OK,
	## A cell of the site holds a hull of an own structure.
	OCCUPIED,
	## The site would touch an own structure face to face (TOUCHES_OWN_STRUCTURE).
	TOUCHES_OWN,
	## A cell lies outside the body's grid in y.
	OUT_OF_BOUNDS,
}

const _FACES: Array[Vector3i] = [
	Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0),
	Vector3i(0, -1, 0), Vector3i(0, 0, 1), Vector3i(0, 0, -1),
]


## One fuel of the quote: what the trip burns and what the structure holds (micro-units).
class FuelRow:
	extends RefCounted
	var resource := ""
	var amount := 0
	## In the structure's own supply: only this is burned.
	var self_use := 0
	## In its cargo area: never burned, but it can be moved into the own supply.
	var in_transport := 0

	func is_short() -> bool:
		return self_use < amount

	## How much the own supply lacks (0 when it is enough).
	func missing() -> int:
		return maxi(0, amount - self_use)

	## Short, and the cargo holds enough to make up for it.
	func movable() -> bool:
		return is_short() and in_transport >= missing()


## A quote (`TravelQuote`).
class Quote:
	extends RefCounted
	var ok := false
	## Codes of every rule the trip breaks.
	var errors := PackedStringArray()
	## Mass of the structure and its guests without cargo, and the lift limit of its finished
	## space drives (0 for a drive on the ground), micro-units.
	var mass := 0
	var max_mass := 0
	var warp_level := 0
	var interstellar := false
	var distance_nly := 0
	var speed_cells_per_minute := 0
	var depart_at := 0
	var liftoff_at := 0
	var cruise_end_at := 0
	var arrival_at := 0
	var fuel: Array[FuelRow] = []
	## How much the air lengthens launch and landing and raises the launch fuel (draft.36,
	## `atmosphereFactor`), micro-units: ATMOSPHERE_NONE = ×1.0 (no air, orbit, older servers).
	var atmosphere_departure := ATMOSPHERE_NONE
	var atmosphere_arrival := ATMOSPHERE_NONE

	## Reads a quote; null when the answer is not one.
	static func from_wire(value: Variant) -> Quote:
		var data := Wire.as_dict(value)
		if typeof(data.get("ok")) != TYPE_BOOL:
			return null
		var quote := Quote.new()
		quote.ok = data.get("ok") == true
		if typeof(data.get("errors")) == TYPE_ARRAY:
			var codes: Array = data.get("errors")
			for code: Variant in codes:
				quote.errors.append(Wire.as_string(code))
		quote.mass = Wire.as_int(data.get("mass"))
		quote.max_mass = Wire.as_int(data.get("maxMass"))
		quote.warp_level = Wire.as_int(data.get("warpLevel"))
		quote.interstellar = data.get("interstellar") == true
		quote.distance_nly = Wire.as_int(data.get("distanceNly"))
		quote.speed_cells_per_minute = Wire.as_int(data.get("speedCellsPerMinute"))
		quote.depart_at = Wire.as_int(data.get("departAt"))
		quote.liftoff_at = Wire.as_int(data.get("liftoffAt"), quote.depart_at)
		quote.cruise_end_at = Wire.as_int(data.get("cruiseEndAt"), quote.liftoff_at)
		quote.arrival_at = Wire.as_int(data.get("arrivalAt"), quote.cruise_end_at)
		var atmosphere := Wire.as_dict(data.get("atmosphereFactor"))
		quote.atmosphere_departure = Wire.as_int(atmosphere.get("departure"), ATMOSPHERE_NONE)
		quote.atmosphere_arrival = Wire.as_int(atmosphere.get("arrival"), ATMOSPHERE_NONE)
		if typeof(data.get("fuel")) == TYPE_ARRAY:
			var rows: Array = data.get("fuel")
			for entry: Variant in rows:
				var row := Wire.as_dict(entry)
				var fuel_row := FuelRow.new()
				fuel_row.resource = Wire.as_string(row.get("resource"))
				fuel_row.amount = Wire.as_int(row.get("amount"))
				fuel_row.self_use = Wire.as_int(row.get("selfUse"))
				fuel_row.in_transport = Wire.as_int(row.get("inTransport"))
				quote.fuel.append(fuel_row)
		return quote

	## Whether air slows the launch (factor above ×1.0).
	func air_on_launch() -> bool:
		return atmosphere_departure > ATMOSPHERE_NONE

	## Whether air slows the landing (factor above ×1.0).
	func air_on_landing() -> bool:
		return atmosphere_arrival > ATMOSPHERE_NONE

	## Duration of the launch phase (0 without one: from orbit, vehicles).
	func launch_ms() -> int:
		return maxi(0, liftoff_at - depart_at)

	## Duration of the cruise (0 when the target is at the start body).
	func cruise_ms() -> int:
		return maxi(0, cruise_end_at - liftoff_at)

	## Duration of the landing phase (0 for an orbit target).
	func landing_ms() -> int:
		return maxi(0, arrival_at - cruise_end_at)

	func total_ms() -> int:
		return maxi(0, arrival_at - depart_at)

	## Whether the lift limit is known (a finished space drive) and the mass stays within it.
	func mass_within_limit() -> bool:
		return max_mass > 0 and mass <= max_mass

	## Fuels the own supply lacks.
	func short_fuel() -> Array[FuelRow]:
		var result: Array[FuelRow] = []
		for row: FuelRow in fuel:
			if row.is_short():
				result.append(row)
		return result

	## Fuels that lack in the own supply but lie in the cargo area in sufficient amount.
	func movable_fuel() -> Array[FuelRow]:
		var result: Array[FuelRow] = []
		for row: FuelRow in fuel:
			if row.movable():
				result.append(row)
		return result


# --- requests -------------------------------------------------------------------------------

## Target: the orbit of a body.
static func orbit_target(body_id: String) -> Dictionary:
	return {"type": "orbit", "bodyId": body_id}


## Target: land or stop with the structure's local cell (0, 0) on the absolute cell `at`.
static func surface_target(body_id: String, at: Vector2i) -> Dictionary:
	return {"type": "surface", "bodyId": body_id, "x": int(at.x), "y": int(at.y)}


## Target: dock on an own host; `offset` is the host's local cell under the structure's local
## origin (the dock level lies at offset.z − 1).
static func dock_target(host_id: int, offset: Vector3i) -> Dictionary:
	return {"type": "dock", "hostId": host_id,
		"offset": {"x": int(offset.x), "y": int(offset.y), "z": int(offset.z)}}


## The request body (`TravelRequest`). Waypoints are sent only for a drive and only when there
## are any; whole numbers throughout.
static func request(mode: String, target: Dictionary, waypoints: Array[Vector2i] = []) -> Dictionary:
	var body := {"mode": mode, "target": target}
	if mode == MODE_GROUND and not waypoints.is_empty():
		var points: Array[Dictionary] = []
		for point: Vector2i in waypoints:
			points.append({"x": int(point.x), "y": int(point.y)})
		body["waypoints"] = points
	return body


## Moves what the own supply lacks of each fuel from the cargo area into it
## (`POST /v2/structures/{id}/storage/move`); rows that need nothing are left out.
static func fuel_move_request(rows: Array[FuelRow]) -> Dictionary:
	var items: Array[Dictionary] = []
	for row: FuelRow in rows:
		var amount := mini(row.missing(), row.in_transport)
		if amount > 0:
			items.append({"resource": row.resource, "amount": amount})
	return {"from": "transport", "items": items}


# --- where the structure would stand --------------------------------------------------------

## Every local cell of the travelling structure in its own grid: its hulls and those of its
## guests (a guest's local cell plus its offset in the host's grid).
static func mover_cells(layout: StructureLayout, guests: Array[StructureLayout] = []) -> Array[Vector3i]:
	var result: Array[Vector3i] = layout.hull_cells()
	for guest: StructureLayout in guests:
		for cell: Vector3i in guest.hull_cells():
			result.append(cell + guest.offset)
	return result


## The middle of the cells in x and y (rounded down), local.
static func centre_of(cells: Array[Vector3i]) -> Vector2i:
	if cells.is_empty():
		return Vector2i.ZERO
	var low := Vector2i(cells[0].x, cells[0].y)
	var high := low
	for cell: Vector3i in cells:
		low = low.min(Vector2i(cell.x, cell.y))
		high = high.max(Vector2i(cell.x, cell.y))
	return Vector2i(floori((low.x + high.x) / 2.0), floori((low.y + high.y) / 2.0))


## Absolute cells of a structure standing with its local (0, 0) on `at`: its lowest level on the
## ground (z = 0). x is not wrapped (the cells stay next to each other).
static func site_cells(cells: Array[Vector3i], at: Vector2i) -> Array[Vector3i]:
	var lowest := 0
	for index: int in cells.size():
		lowest = cells[index].z if index == 0 else mini(lowest, cells[index].z)
	var result: Array[Vector3i] = []
	for cell: Vector3i in cells:
		result.append(Vector3i(at.x + cell.x, at.y + cell.y, cell.z - lowest))
	return result


## Where the local origin goes so that the structure's middle stands on `cell`.
static func origin_for_centre(cells: Array[Vector3i], cell: Vector2i) -> Vector2i:
	return cell - centre_of(cells)


## Checks a site against the cells of the own structures (`taken`: absolute cell with x wrapped
## into the grid → true). `size_x` wraps x; `size_y` bounds y, which runs from −size_y/2 (incl.)
## to size_y/2 (excl.) around the equator (0: not known).
static func check_site(cells: Array[Vector3i], taken: Dictionary, size_x: int, size_y: int = 0) -> Site:
	var own: Dictionary = {}
	@warning_ignore("integer_division")
	var half := size_y / 2
	for cell: Vector3i in cells:
		if size_y > 0 and (cell.y < -half or cell.y >= half):
			return Site.OUT_OF_BOUNDS
		own[_wrapped(cell, size_x)] = true
	for cell: Vector3i in cells:
		if taken.has(_wrapped(cell, size_x)):
			return Site.OCCUPIED
	for cell: Vector3i in cells:
		for face: Vector3i in _FACES:
			var next := _wrapped(cell + face, size_x)
			if not own.has(next) and taken.has(next):
				return Site.TOUCHES_OWN
	return Site.OK


## A free site near `around` (absolute cell): the local origin for the first site on rings
## around it that passes check_site, so next to an own structure it keeps one field of distance.
## null when none within `radius` fields.
static func suggest_site(cells: Array[Vector3i], taken: Dictionary, around: Vector2i, size_x: int,
		size_y: int = 0, radius: int = 24) -> Variant:
	var centre := centre_of(cells)
	for ring: int in radius + 1:
		for offset: Vector2i in ring_cells(ring):
			var at := around + offset - centre
			if check_site(site_cells(cells, at), taken, size_x, size_y) == Site.OK:
				return at
	return null


## The cells of a square ring at distance `ring` around (0, 0), nearest to the middle first
## (ring 0 is the middle itself).
static func ring_cells(ring: int) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	if ring == 0:
		result.append(Vector2i.ZERO)
		return result
	for y: int in range(-ring, ring + 1):
		for x: int in range(-ring, ring + 1):
			if maxi(absi(x), absi(y)) == ring:
				result.append(Vector2i(x, y))
	result.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		var da := a.length_squared()
		var db := b.length_squared()
		if da != db:
			return da < db
		return a.y < b.y if a.y != b.y else a.x < b.x)
	return result


## Absolute cells (x wrapped) of hulls of the given layouts, for check_site.
static func taken_cells(layouts: Array[StructureLayout], size_x: int) -> Dictionary:
	var result: Dictionary = {}
	for layout: StructureLayout in layouts:
		for cell: Vector3i in layout.hull_cells():
			result[_wrapped(layout.to_absolute(cell), size_x)] = true
	return result


# --- docking --------------------------------------------------------------------------------

## A place for the travelling structure (`cells`, its local cells with guests) on the docks of
## `host` (local cells of the host): the offset for a dock target, or null when no dock area of
## one level holds its X-Y rectangle without overlapping the rectangle of a guest docked there
## (the host's layout header lists them; `except` is left out, e.g. the structure itself) or a
## hull of the host. Lowest level first, then by y and x.
static func dock_offset(host: StructureLayout, cells: Array[Vector3i], except: int = 0) -> Variant:
	var guests: Array[StructureLayout.Guest] = []
	for guest: StructureLayout.Guest in host.guests:
		if guest.structure_id != except:
			guests.append(guest)
	if cells.is_empty():
		return null
	var low := Vector2i(cells[0].x, cells[0].y)
	var high := low
	for cell: Vector3i in cells:
		low = low.min(Vector2i(cell.x, cell.y))
		high = high.max(Vector2i(cell.x, cell.y))
	var docks: Array[Vector3i] = []
	for cell: Vector3i in host.hull_cells():
		if DockRules.is_dock(host.hull_at(cell)):
			docks.append(cell)
	docks.sort_custom(func(a: Vector3i, b: Vector3i) -> bool:
		if a.z != b.z:
			return a.z < b.z
		return a.y < b.y if a.y != b.y else a.x < b.x)
	for dock: Vector3i in docks:
		var offset := Vector3i(dock.x - low.x, dock.y - low.y, dock.z + 1)
		if _fits_on_docks(host, guests, cells, offset, low, high):
			return offset
	return null


static func _fits_on_docks(host: StructureLayout, guests: Array[StructureLayout.Guest], cells: Array[Vector3i],
		offset: Vector3i, low: Vector2i, high: Vector2i) -> bool:
	var level := offset.z - 1
	var rect := Rect2i(Vector2i(low.x + offset.x, low.y + offset.y), high - low + Vector2i.ONE)
	for y: int in range(rect.position.y, rect.end.y):
		for x: int in range(rect.position.x, rect.end.x):
			if not DockRules.is_dock(host.hull_at(Vector3i(x, y, level))):
				return false
	for other: StructureLayout.Guest in guests:
		if other.dock_z == level and other.rect.intersects(rect):
			return false
	for cell: Vector3i in cells:
		if not host.hull_at(cell + offset).is_empty():
			return false
	return true


# --- driving --------------------------------------------------------------------------------

## The corners of a drive from `start` through the waypoints to `target` (x unwrapped: each
## step takes the shorter way around the body, as the server does), for drawing the line.
static func drive_points(start: Vector2i, waypoints: Array[Vector2i], target: Vector2i, size_x: int) -> Array[Vector2i]:
	var result: Array[Vector2i] = [start]
	var stops: Array[Vector2i] = []
	stops.append_array(waypoints)
	stops.append(target)
	var last := start
	for stop: Vector2i in stops:
		var next := Vector2i(WorldGrid.unwrap_x(stop.x, last.x, size_x), stop.y)
		result.append(next)
		last = next
	return result


## Whether another waypoint may be added to `count` waypoints.
static func can_add_waypoint(count: int) -> bool:
	return count < MAX_WAYPOINTS


static func _wrapped(cell: Vector3i, size_x: int) -> Vector3i:
	return Vector3i(WorldGrid.wrap_x(cell.x, size_x), cell.y, cell.z)
