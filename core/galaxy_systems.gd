class_name GalaxySystems
extends RefCounted
## The systems of the near galaxy view: rows of `GET /v2/galaxy/systems` (NDJSON: a header, one
## `GalaxySystem` per system, an end line `{end, rows, truncated}`), the spheres loaded so far,
## and which systems are the player's.
##
## A sphere answer is complete up to its radius unless it is truncated or its end line is
## missing. Rows come sector by sector, nearest sector centre first, so a cut answer still holds
## every system up to (centre distance of the last sector) − (half a sector diagonal): that is
## how far it counts as covered.

## Spheres kept in memory; the oldest is dropped first.
const MAX_SPHERES := 4


## One system as the galaxy view draws it.
class Entry:
	extends RefCounted
	var id := ""
	## Position in coordinate units (contract: light years for `milky_way`).
	var position := Vector3.ZERO
	var name := ""
	var star_type := ""
	var kelvin := 5800.0
	var luminosity := 1.0
	var mass := 1.0
	var planet_count := 0


## One sphere: what was asked for and what arrived.
class Answer:
	extends RefCounted
	var centre := Vector3.ZERO
	var radius := 0.0
	var entries: Array[Entry] = []
	## The end line arrived.
	var ended := false
	## The server stopped at its limit (`truncated`), or the end line is missing.
	var truncated := false
	## Rows the server says it sent (end line); -1 without an end line.
	var rows := -1
	## Up to this distance from the centre every system is in `entries`.
	var covered := 0.0


## A `GalaxySystem` row; null without a system id.
static func entry_from_wire(data: Dictionary) -> Entry:
	var entry := Entry.new()
	entry.id = Wire.as_string(data.get("systemId"))
	if entry.id.is_empty():
		return null
	entry.position = vector(data.get("position"))
	var star := Wire.as_dict(data.get("star"))
	entry.name = Wire.as_string(star.get("name"))
	entry.star_type = Wire.as_string(star.get("type"))
	var kelvin := SystemMap.number(star.get("temperature"))
	if kelvin > 0.0:
		entry.kelvin = kelvin
	entry.luminosity = maxf(SystemMap.number(star.get("luminosity")), 0.0)
	entry.mass = maxf(SystemMap.number(star.get("mass")), 0.0)
	entry.planet_count = maxi(Wire.as_int(data.get("planetCount")), 0)
	return entry


## The entry of a whole `SystemResponse` (for systems known before any sphere is loaded, such as
## the home system): planets are the bodies of type PLANET, as in `planetCount`.
static func entry_from_system(data: Dictionary) -> Entry:
	var entry := entry_from_wire(data)
	if entry == null:
		return null
	var count := 0
	var bodies: Array = data.get("bodies") if typeof(data.get("bodies")) == TYPE_ARRAY else []
	for item: Variant in bodies:
		if Wire.as_string(Wire.as_dict(item).get("bodyType")) == SystemMap.KIND_PLANET:
			count += 1
	entry.planet_count = count
	return entry


## A `Vec3` as Vector3; zero when it is missing.
static func vector(value: Variant) -> Vector3:
	var raw := Wire.as_dict(value)
	return Vector3(SystemMap.number(raw.get("x")), SystemMap.number(raw.get("y")), SystemMap.number(raw.get("z")))


## Reads a sphere answer. `centre` and `radius` are what was asked; the header's values win.
## `sector_size` decides how far a cut answer counts as covered.
static func from_stream(stream: Ndjson, centre: Vector3, radius: float, sector_size: Vector3) -> Answer:
	var answer := Answer.new()
	answer.centre = centre
	answer.radius = radius
	var seen := {}
	for index: int in stream.objects.size():
		var line := stream.objects[index]
		if line.has("systemId"):
			var entry := entry_from_wire(line)
			if entry != null and not seen.has(entry.id):
				seen[entry.id] = true
				answer.entries.append(entry)
		elif line.get("end") == true:
			answer.ended = true
			answer.rows = Wire.as_int(line.get("rows"), -1)
			answer.truncated = line.get("truncated") == true
		elif index == 0 and line.has("radius"):
			answer.centre = Vector3(SystemMap.number(line.get("x")), SystemMap.number(line.get("y")), SystemMap.number(line.get("z")))
			answer.radius = SystemMap.number(line.get("radius"))
	if not answer.ended:
		answer.truncated = true
	answer.covered = covered_radius(answer.centre, answer.radius, answer.truncated, answer.entries, sector_size)
	return answer


## How far around `centre` the entries are complete: the whole radius of a full answer; for a cut
## one the centre distance of the farthest sector that sent a row, less half a sector diagonal
## (that sector may be incomplete, all nearer ones are not).
static func covered_radius(centre: Vector3, radius: float, truncated: bool, entries: Array[Entry], sector_size: Vector3) -> float:
	if not truncated:
		return radius
	var farthest := 0.0
	for entry: Entry in entries:
		var sector := sector_of_system(entry.id, entry.position, sector_size)
		var middle := (Vector3(sector) + Vector3(0.5, 0.5, 0.5)) * sector_size
		farthest = maxf(farthest, middle.distance_to(centre))
	return clampf(farthest - sector_size.length() * 0.5, 0.0, radius)


## The sector of a system: from its id `sys-{sx}_{sy}_{sz}-{i}` (contract), else from its
## position (a system can lie exactly on its sector's upper edge, so the id is the better source).
static func sector_of_system(system_id: String, position: Vector3, sector_size: Vector3) -> Vector3i:
	if system_id.begins_with("sys-"):
		var rest := system_id.substr(4)
		var cut := rest.rfind("-")
		if cut > 0:
			var parts := rest.substr(0, cut).split("_")
			if parts.size() == 3 and parts[0].is_valid_int() and parts[1].is_valid_int() and parts[2].is_valid_int():
				return Vector3i(parts[0].to_int(), parts[1].to_int(), parts[2].to_int())
	return Vector3i(floori(position.x / sector_size.x), floori(position.y / sector_size.y), floori(position.z / sector_size.z))


## The system of a body id: `planet-{systemId}-{i}` or `planet-{systemId}-{i}-moon-{m}`
## (contract); "" for anything else.
static func system_of_body(body_id: String) -> String:
	if not body_id.begins_with("planet-"):
		return ""
	var rest := body_id.substr(7)
	var moon := rest.rfind("-moon-")
	if moon > 0:
		rest = rest.substr(0, moon)
	var cut := rest.rfind("-")
	if cut <= 0 or not rest.substr(cut + 1).is_valid_int():
		return ""
	var system := rest.substr(0, cut)
	return system if system.begins_with("sys-") else ""


## The systems the player has structures in, from body ids (keys of
## `SystemMap.structures_by_body`); sorted, each once.
static func own_systems(body_ids: Array) -> PackedStringArray:
	var found := {}
	for body: Variant in body_ids:
		var system := system_of_body(Wire.as_string(body))
		if not system.is_empty():
			found[system] = true
	var result := PackedStringArray(found.keys())
	result.sort()
	return result


## Radius (px) of a star's dot: logarithmic in its luminosity (the Sun 4 px, ten times brighter
## 1.4 px more), clamped to 2..10 px so neither a red dwarf vanishes nor a giant covers its
## neighbours.
static func star_px(luminosity: float) -> float:
	return clampf(4.0 + 1.4 * log(maxf(luminosity, 0.000001)) / log(10.0), 2.0, 10.0)


## Stars per unit² of an answer seen from above: its rows over the disc out to the farthest one
## (in x, y); 0 without rows.
static func area_density(answer: Answer) -> float:
	var farthest := 0.0
	for entry: Entry in answer.entries:
		farthest = maxf(farthest, Vector2(entry.position.x - answer.centre.x, entry.position.y - answer.centre.y).length())
	if answer.entries.is_empty() or farthest <= 0.0:
		return 0.0
	return answer.entries.size() / (PI * farthest * farthest)


## Index of the entry nearest to `point` (x, y; z is ignored, the view is from above) within
## `reach`; -1 when none.
static func pick(entries: Array[Entry], point: Vector2, reach: float) -> int:
	var best := -1
	var best_distance := reach * reach
	for index: int in entries.size():
		var at := entries[index].position
		var distance := Vector2(at.x - point.x, at.y - point.y).length_squared()
		if distance <= best_distance:
			best_distance = distance
			best = index
	return best


## The spheres loaded so far, newest last.
var spheres: Array[Answer] = []
var _all: Array[Entry] = []
var _by_id: Dictionary = {}


## Keeps an answer; the oldest sphere goes when there are more than MAX_SPHERES.
func add(answer: Answer) -> void:
	spheres.append(answer)
	while spheres.size() > MAX_SPHERES:
		spheres.remove_at(0)
	_all.clear()
	_by_id.clear()
	for index: int in range(spheres.size() - 1, -1, -1):
		for entry: Entry in spheres[index].entries:
			if not _by_id.has(entry.id):
				_by_id[entry.id] = entry
				_all.append(entry)


## True when a loaded sphere holds every system within `radius` of `centre`.
func covers(centre: Vector3, radius: float) -> bool:
	for answer: Answer in spheres:
		if centre.distance_to(answer.centre) + radius <= answer.covered:
			return true
	return false


## Every loaded system, each once.
func entries() -> Array[Entry]:
	return _all


func find(system_id: String) -> Entry:
	return _by_id.get(system_id) as Entry


func clear() -> void:
	spheres.clear()
	_all.clear()
	_by_id.clear()
