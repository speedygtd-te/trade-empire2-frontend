class_name RevealMap
extends RefCounted
## What the player has explored of one body's surface (draft.31, `GET /v2/bodies/{id}/reveal`):
## the explored areas and the foreign structures probes have seen there.
##
## An area is a capsule: every cell within `radius` of the segment (x0, y0)–(x1, y1) is explored
## (a disc is a segment of length 0); x wraps around the body. The surface stream itself marks the
## unexplored cells (SurfacePatch.is_hidden); the areas serve where cells are not loaded: the
## border, the landing check, the share explored. The server decides; this only shows.

## Where an area comes from (contract `RevealArea.source`).
const SOURCE_HOME := "home"
const SOURCE_STRUCTURE := "structure"
const SOURCE_PROBE := "probe"
const SOURCE_VEHICLE := "vehicle"


## One explored capsule.
class Area:
	extends RefCounted
	var x0 := 0
	var y0 := 0
	var x1 := 0
	var y1 := 0
	var radius := 0
	## Game time (ms) since when it is explored.
	var since := 0
	var source := ""

	## The middle of the segment (x not wrapped).
	func centre() -> Vector2i:
		@warning_ignore("integer_division")
		return Vector2i((x0 + x1) / 2, (y0 + y1) / 2)

	## Whether the cell (x, y) lies in it; `size_x` is the body's width (0: no wrapping).
	func covers(x: int, y: int, size_x: int) -> bool:
		var limit := float(radius) * float(radius)
		# The segment runs the short way round (x1 may come wrapped); the copy of x nearest to
		# its start, and that copy's neighbours across the seam.
		var start := Vector2(x0, y0)
		var end := Vector2(x0 + WorldGrid.wrapped_delta(x0, x1, size_x), y1)
		var near := x0 + WorldGrid.wrapped_delta(x0, x, size_x)
		if RevealMap.distance_squared(Vector2(near, y), start, end) <= limit:
			return true
		if size_x <= 0:
			return false
		for copy: int in [near - size_x, near + size_x]:
			if RevealMap.distance_squared(Vector2(copy, y), start, end) <= limit:
				return true
		return false

	func is_probe() -> bool:
		return source == RevealMap.SOURCE_PROBE


## A foreign structure as a probe saw it (a snapshot, not live).
class Sighting:
	extends RefCounted
	var structure_id := 0
	## Player id of the owner, a string like every player id (draft.31 first sent a number; both
	## are read).
	var owner_id := ""
	var owner_name := ""
	## The structure's local origin (absolute cell).
	var x := 0
	var y := 0
	var hulls := 0
	## Game time (ms) when the probe saw it.
	var seen_at := 0
	var probe_id := 0
	## The ground plan seen from above (draft.32): runs Vector3i(dy, dx0, dx1) relative to the
	## origin, cells x + dx0 … x + dx1 of row y + dy. Empty for older snapshots.
	var footprint: Array[Vector3i] = []

	## Edge of a square of about as many cells as the structure has hulls (at least 1): the
	## stand-in shape while no footprint is known.
	func footprint_side() -> int:
		return maxi(1, ceili(sqrt(float(maxi(hulls, 1)))))

	## The cells it covers (absolute, x not wrapped): the footprint, or without one the square
	## stand-in from its origin.
	func cells() -> Array[Vector2i]:
		var result: Array[Vector2i] = []
		if not footprint.is_empty():
			for run: Vector3i in footprint:
				for dx: int in range(run.y, run.z + 1):
					result.append(Vector2i(x + dx, y + run.x))
			return result
		var side := footprint_side()
		for dy: int in side:
			for dx: int in side:
				result.append(Vector2i(x + dx, y + dy))
		return result

	func has_footprint() -> bool:
		return not footprint.is_empty()


var body_id := ""
## False only in an old world before the migration: then everything is explored.
var fog := true
var areas: Array[Area] = []
var sightings: Array[Sighting] = []


## A `RevealResponse`; null when it is none (no `areas` list).
static func from_wire(data: Dictionary) -> RevealMap:
	if typeof(data.get("areas")) != TYPE_ARRAY:
		return null
	var map := RevealMap.new()
	map.body_id = Wire.as_string(data.get("bodyId"))
	map.fog = data.get("fog") != false
	var raw: Array = data.get("areas")
	for item: Variant in raw:
		var entry := Wire.as_dict(item)
		var area := Area.new()
		area.x0 = Wire.as_int(entry.get("x0"))
		area.y0 = Wire.as_int(entry.get("y0"))
		area.x1 = Wire.as_int(entry.get("x1"), area.x0)
		area.y1 = Wire.as_int(entry.get("y1"), area.y0)
		area.radius = maxi(Wire.as_int(entry.get("radius")), 0)
		area.since = Wire.as_int(entry.get("since"))
		area.source = Wire.as_string(entry.get("source"))
		map.areas.append(area)
	var seen: Array = data.get("sightings") if typeof(data.get("sightings")) == TYPE_ARRAY else []
	for item: Variant in seen:
		var entry := Wire.as_dict(item)
		var sighting := Sighting.new()
		sighting.structure_id = Wire.as_int(entry.get("structureId"))
		var owner: Variant = entry.get("ownerId")
		sighting.owner_id = Wire.as_string(owner) if typeof(owner) == TYPE_STRING else (str(Wire.as_int(owner)) if owner != null else "")
		sighting.owner_name = Wire.as_string(entry.get("ownerName"))
		sighting.x = Wire.as_int(entry.get("x"))
		sighting.y = Wire.as_int(entry.get("y"))
		sighting.hulls = Wire.as_int(entry.get("hulls"))
		sighting.seen_at = Wire.as_int(entry.get("seenAt"))
		sighting.probe_id = Wire.as_int(entry.get("probeId"))
		var runs: Array = entry.get("footprint") if typeof(entry.get("footprint")) == TYPE_ARRAY else []
		for part: Variant in runs:
			if typeof(part) == TYPE_ARRAY:
				var run: Array = part
				if run.size() == 3:
					var dx0 := Wire.as_int(run[1])
					var dx1 := Wire.as_int(run[2])
					if dx1 >= dx0:
						sighting.footprint.append(Vector3i(Wire.as_int(run[0]), dx0, dx1))
		map.sightings.append(sighting)
	return map


## Squared distance of a point from the segment a–b.
static func distance_squared(point: Vector2, a: Vector2, b: Vector2) -> float:
	var along := b - a
	var length := along.length_squared()
	var t := 0.0
	if length > 0.0:
		t = clampf((point - a).dot(along) / length, 0.0, 1.0)
	return point.distance_squared_to(a + along * t)


## Whether a cell is explored. Without fog everything is.
func is_revealed(x: int, y: int, size_x: int) -> bool:
	if not fog:
		return true
	for area: Area in areas:
		if area.covers(x, y, size_x):
			return true
	return false


## Whether every cell of a footprint (absolute cells; z ignored) is explored.
func covers_all(cells: Array[Vector3i], size_x: int) -> bool:
	for cell: Vector3i in cells:
		if not is_revealed(cell.x, cell.y, size_x):
			return false
	return true


## The newest area a probe explored; null when none did.
func newest_probe_area() -> Area:
	var best: Area = null
	for area: Area in areas:
		if area.is_probe() and (best == null or area.since > best.since):
			best = area
	return best


## How many areas probes explored.
func probe_count() -> int:
	var count := 0
	for area: Area in areas:
		if area.is_probe():
			count += 1
	return count


## About which share (0..1) of a body of `size_x` × `size_y` cells is explored: the areas' sizes
## added up (overlaps counted twice, so it can only be too high), at most 1. 1 without fog.
func explored_share(size_x: int, size_y: int) -> float:
	if not fog:
		return 1.0
	if size_x <= 0 or size_y <= 0:
		return 0.0
	var sum := 0.0
	for area: Area in areas:
		var r := float(area.radius)
		var length := Vector2(area.x1 - area.x0, area.y1 - area.y0).length()
		sum += PI * r * r + 2.0 * r * length
	return clampf(sum / (float(size_x) * float(size_y)), 0.0, 1.0)
