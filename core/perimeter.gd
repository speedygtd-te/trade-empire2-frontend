class_name Perimeter
extends RefCounted
## The decoration around a base on the surface: lamp masts, radar, antennas and small beacons on
## free cells one and two cells away from it (Chebyshev distance). Purely cosmetic and client-side;
## the server knows nothing about it and nothing blocks a build there (a hull placed on such a cell
## simply takes its place, the decoration moves aside).
##
## Everything is deterministic per absolute cell (x wrapped to the body's width): the same base
## looks the same on every load and every device. Items are chosen by a hash rank per cell under a
## least spacing, so growing the structure changes the choice near the change and, for the radar,
## at most where the radar was.
##
## Placement:
## - Lamp masts stand on the outer ring (distance 2), outer corners first, then by rank; two masts
##   keep LAMP_SPACING apart. Their lamps point away from the structure (`direction`).
## - One radar (two from RADARS_FROM_CELLS footprint cells on, RADAR_SPACING apart) on the outer
##   ring, not next to a mast.
## - Antennas on the outer ring, about one in ANTENNA_SHARE of the cells left, not next to
##   anything.
## - Beacons on the inner ring (distance 1), about one in BEACON_SHARE, BEACON_SPACING apart and not
##   next to anything.
## - The cells right next to docks stay clear (DOCK_CLEARANCE), and so does every cell another
##   structure (or an underground part of this one) occupies.

enum Kind { LAMP, RADAR, ANTENNA, BEACON }

## Least Chebyshev distance between two lamp masts.
const LAMP_SPACING := 4
## Footprint cells from which a base gets a second radar, and the least distance between two.
const RADARS_FROM_CELLS := 48
const MAX_RADARS := 2
const RADAR_SPACING := 8
## About one in this many free ring cells carries an antenna or a beacon.
const ANTENNA_SHARE := 5
const BEACON_SHARE := 4
const BEACON_SPACING := 3
## Least distance between any two items of different kinds (2: never side by side).
const ITEM_SPACING := 2
## Cells within this distance of a dock carry nothing: the pad's edge stays open. Only the inner
## ring; masts on the outer ring light the docks like the rest of the base.
const DOCK_CLEARANCE := 1
## Resolution of the rank and phase streams.
const RANK_STEPS := 65536


## One decorated cell.
class Spot:
	extends RefCounted
	## Absolute cell (x wrapped into the body's width).
	var cell := Vector2i.ZERO
	var kind: Kind = Kind.LAMP
	## Unit vector pointing away from the structure, from its nearest footprint cells: x along the
	## cell x axis, y along the cell y axis.
	var direction := Vector2(0.0, -1.0)
	## Chebyshev distance to the footprint (1 or 2).
	var distance := 2
	## 0..1 per cell: where a radar starts its turn, how a beacon's blink is shifted.
	var phase := 0.0


## Ring cell being considered (unwrapped coordinates around the footprint).
class _Candidate:
	extends RefCounted
	var at := Vector2i.ZERO
	var distance := 3
	var away := Vector2.ZERO
	var corner := true
	var rank := 0


## The decorated cells around one structure. `footprint`: its cells on and above the ground
## (absolute x, y; x may run past the seam); `occupied`: cells taken by anything else (other
## structures, guests, its own underground parts); `size_x`: width of the body (x wraps; 0 or less:
## it does not); `docks`: the structure's dock cells. Order: lamps, radars, antennas, beacons, each
## by rank.
static func spots(footprint: Array[Vector2i], occupied: Array[Vector2i], size_x: int,
		docks: Array[Vector2i] = []) -> Array[Spot]:
	var result: Array[Spot] = []
	if footprint.is_empty():
		return result
	var reference := footprint[0].x
	var own: Dictionary = {}
	var centre := Vector2.ZERO
	for cell: Vector2i in footprint:
		var at := Vector2i(WorldGrid.unwrap_x(cell.x, reference, size_x), cell.y)
		if not own.has(at):
			own[at] = true
			centre += Vector2(at)
	centre /= own.size()
	var blocked: Dictionary = {}
	for cell: Vector2i in occupied:
		blocked[_key(cell, size_x)] = true
	for cell: Vector2i in docks:
		for dy: int in range(-DOCK_CLEARANCE, DOCK_CLEARANCE + 1):
			for dx: int in range(-DOCK_CLEARANCE, DOCK_CLEARANCE + 1):
				blocked[_key(cell + Vector2i(dx, dy), size_x)] = true

	# The two rings: per cell its distance, the summed offsets from its nearest footprint cells,
	# and whether all of those lie diagonally (an outer corner).
	var ring: Dictionary = {}
	for cell: Vector2i in own.keys():
		for dy: int in range(-2, 3):
			for dx: int in range(-2, 3):
				var at := cell + Vector2i(dx, dy)
				if own.has(at):
					continue
				var distance := maxi(absi(dx), absi(dy))
				var diagonal := absi(dx) == absi(dy)
				var entry: _Candidate = ring.get(at)
				if entry == null:
					entry = _Candidate.new()
					entry.at = at
					ring[at] = entry
				if distance < entry.distance:
					entry.distance = distance
					entry.away = Vector2(dx, dy)
					entry.corner = diagonal
				elif distance == entry.distance:
					entry.away += Vector2(dx, dy)
					entry.corner = entry.corner and diagonal

	var outer: Array[_Candidate] = []
	var inner: Array[_Candidate] = []
	for entry: _Candidate in ring.values():
		var key := _key(entry.at, size_x)
		if blocked.has(key):
			continue
		entry.rank = PropRules.key_hash(key.x * 137 + 71, key.y * 59 + 13, RANK_STEPS)
		if entry.away.length_squared() < 0.0001:
			entry.away = Vector2(entry.at) - centre
		(outer if entry.distance == 2 else inner).append(entry)
	_sort(outer)
	_sort(inner)

	var placed: Array[Spot] = []
	# Lamp masts: outer corners first, then by rank.
	var corners_first := outer.duplicate()
	corners_first.sort_custom(func(a: _Candidate, b: _Candidate) -> bool:
		if a.corner != b.corner:
			return a.corner
		return _before(a, b))
	for entry: _Candidate in corners_first:
		if _far_enough(placed, entry.at, size_x, LAMP_SPACING, Kind.LAMP):
			placed.append(_spot(entry, Kind.LAMP, size_x))

	# Radar: the lowest rank of its own stream among the cells left.
	var radars := 1 if own.size() < RADARS_FROM_CELLS else MAX_RADARS
	var by_radar_rank := outer.duplicate()
	by_radar_rank.sort_custom(func(a: _Candidate, b: _Candidate) -> bool:
		var first := _radar_rank(a, size_x)
		var second := _radar_rank(b, size_x)
		return first < second if first != second else _before(a, b))
	for entry: _Candidate in by_radar_rank:
		if radars == 0:
			break
		if _far_enough(placed, entry.at, size_x, RADAR_SPACING, Kind.RADAR):
			placed.append(_spot(entry, Kind.RADAR, size_x))
			radars -= 1

	for entry: _Candidate in outer:
		if entry.rank % ANTENNA_SHARE == 0 \
				and _far_enough(placed, entry.at, size_x, ITEM_SPACING, Kind.ANTENNA):
			placed.append(_spot(entry, Kind.ANTENNA, size_x))
	for entry: _Candidate in inner:
		if (entry.rank >> 4) % BEACON_SHARE == 0 \
				and _far_enough(placed, entry.at, size_x, BEACON_SPACING, Kind.BEACON):
			placed.append(_spot(entry, Kind.BEACON, size_x))
	return placed


static func _spot(entry: _Candidate, kind: Kind, size_x: int) -> Spot:
	var spot := Spot.new()
	spot.cell = _key(entry.at, size_x)
	spot.kind = kind
	spot.distance = entry.distance
	spot.direction = entry.away.normalized()
	spot.phase = float(PropRules.key_hash(spot.cell.x * 31 + 5, spot.cell.y * 97 + 41, RANK_STEPS)) / RANK_STEPS
	return spot


## Whether a cell keeps `spacing` from every placed item of the same kind and ITEM_SPACING from
## the others.
static func _far_enough(placed: Array[Spot], at: Vector2i, size_x: int, spacing: int,
		kind: Kind) -> bool:
	for spot: Spot in placed:
		var x := WorldGrid.unwrap_x(spot.cell.x, at.x, size_x)
		var gap := maxi(absi(x - at.x), absi(spot.cell.y - at.y))
		if gap < (spacing if spot.kind == kind else ITEM_SPACING):
			return false
	return true


static func _radar_rank(entry: _Candidate, size_x: int) -> int:
	var key := _key(entry.at, size_x)
	return PropRules.key_hash(key.x * 211 + 3, key.y * 173 + 89, RANK_STEPS)


static func _sort(entries: Array[_Candidate]) -> void:
	entries.sort_custom(_before)


## Rank order, ties broken by the cell so the order never depends on how the input was sorted.
static func _before(a: _Candidate, b: _Candidate) -> bool:
	if a.rank != b.rank:
		return a.rank < b.rank
	if a.at.y != b.at.y:
		return a.at.y < b.at.y
	return a.at.x < b.at.x


static func _key(cell: Vector2i, size_x: int) -> Vector2i:
	return Vector2i(WorldGrid.wrap_x(cell.x, size_x), cell.y)
