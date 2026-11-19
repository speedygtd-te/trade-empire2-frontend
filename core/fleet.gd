class_name Fleet
extends RefCounted
## The player's own structures and where they are: from the structure list
## (`StructureSummary`), the details of moving ones (`StructureResponse.motion`) and the movement
## events. A structure stands on a surface, is docked on a host, rests in orbit of a body or is
## under way; while it launches it still stands where it was (cells occupied) but has a motion.

enum Where { SURFACE, DOCKED, ORBIT, TRANSIT }

const SPACE_DRIVE := "SPACE_DRIVE"
const GROUND_DRIVE := "GROUND_DRIVE"


## One own structure.
class Entry:
	extends RefCounted
	var structure_id := 0
	var name := ""
	## base, ship, vehicle or station.
	var kind := ""
	var capabilities := PackedStringArray()
	var favorite := false
	## Anchor: type surface/free/docked; for free its kind orbit/transit.
	var anchor_type := ""
	var anchor_kind := ""
	var body_id := ""
	var host_id := 0
	var offset := Vector3i.ZERO
	## The trip under way (also during the launch, while the anchor is still the old one); null
	## when it rests.
	var motion: TravelMotion = null
	## The route it drives as transporter (0: none) and the routes it is a station of.
	var route_id := 0
	var routes: Array[int] = []
	var total_hulls := 0
	var total_modules := 0

	func where() -> Where:
		match anchor_type:
			"surface":
				return Where.SURFACE
			"docked":
				return Where.DOCKED
			"free":
				return Where.ORBIT if anchor_kind == "orbit" else Where.TRANSIT
		return Where.TRANSIT

	## Under way at game time `t`: in transit, or launching from where it stands.
	func is_moving(t: int) -> bool:
		if where() == Where.TRANSIT:
			return true
		return motion != null and t < motion.arrival_at

	func can_fly() -> bool:
		return capabilities.has(SPACE_DRIVE)

	func can_drive() -> bool:
		return capabilities.has(GROUND_DRIVE)

	## Sets the anchor from a wire `Anchor`.
	func set_anchor(value: Variant) -> void:
		var anchor := Wire.as_dict(value)
		anchor_type = Wire.as_string(anchor.get("type"))
		anchor_kind = Wire.as_string(anchor.get("kind"))
		body_id = Wire.as_string(anchor.get("bodyId"))
		host_id = Wire.as_int(anchor.get("hostId")) if anchor_type == "docked" else 0
		var at := Wire.as_dict(anchor.get("offset"))
		offset = Vector3i(Wire.as_int(at.get("x")), Wire.as_int(at.get("y")), Wire.as_int(at.get("z")))


var _entries: Dictionary = {}


## Takes the structure list (`StructureSummary` items): the fleet is exactly these from now on;
## what is known of a trip stays for structures that are still there.
func apply_list(items: Array) -> void:
	var seen: Dictionary = {}
	for value: Variant in items:
		var summary := Wire.as_dict(value)
		var id := Wire.as_int(summary.get("structureId"))
		if id == 0:
			continue
		seen[id] = true
		var entry := find(id)
		if entry == null:
			entry = Entry.new()
			entry.structure_id = id
			_entries[id] = entry
		_read(entry, summary)
	for id: int in _entries.keys():
		if not seen.has(id):
			_entries.erase(id)


## Takes the details of one structure (`StructureResponse`): anchor, motion, routes.
func apply_details(details: Dictionary) -> void:
	var id := Wire.as_int(details.get("structureId"))
	if id == 0:
		return
	var entry := find(id)
	if entry == null:
		entry = Entry.new()
		entry.structure_id = id
		_entries[id] = entry
	_read(entry, details)
	entry.motion = TravelMotion.from_wire(details.get("motion"))
	entry.route_id = Wire.as_int(details.get("routeId"))
	entry.routes.clear()
	if typeof(details.get("routes")) == TYPE_ARRAY:
		var ids: Array = details.get("routes")
		for value: Variant in ids:
			entry.routes.append(Wire.as_int(value))


## Applies an event of the stream; returns whether it changed the fleet. Unknown structures
## (another player's, or not loaded yet) are left alone: the next list brings them.
func apply_event(type: String, data: Dictionary) -> bool:
	var entry := find(Wire.as_int(data.get("structureId")))
	match type:
		"travel.started":
			if entry == null:
				return false
			entry.motion = TravelMotion.from_wire(data.get("motion"))
			return true
		"structure.anchorChanged":
			if entry == null:
				return false
			entry.set_anchor(data.get("anchor"))
			return true
		"travel.arrived", "travel.blocked":
			if entry == null:
				return false
			entry.set_anchor(data.get("anchor"))
			entry.motion = null
			return true
		"route.created", "route.updated":
			var route := Wire.as_dict(data.get("route"))
			var transporter := find(Wire.as_int(route.get("transporterId")))
			if transporter == null:
				return false
			transporter.route_id = Wire.as_int(route.get("routeId"))
			return true
		"route.deleted":
			var gone := Wire.as_int(data.get("routeId"))
			var changed := false
			for other: Entry in _entries.values():
				if other.route_id == gone:
					other.route_id = 0
					changed = true
				if other.routes.has(gone):
					other.routes.erase(gone)
					changed = true
			return changed
	return false


func find(id: int) -> Entry:
	return _entries.get(id) as Entry


func size() -> int:
	return _entries.size()


## Every structure, the favourites first, then by name and id.
func entries() -> Array[Entry]:
	var result: Array[Entry] = []
	for value: Entry in _entries.values():
		result.append(value)
	result.sort_custom(func(a: Entry, b: Entry) -> bool:
		if a.favorite != b.favorite:
			return a.favorite
		if a.name != b.name:
			return a.name.naturalnocasecmp_to(b.name) < 0
		return a.structure_id < b.structure_id)
	return result


## The body a structure is at: its own on a surface or in orbit, its host's when docked; "" under
## way.
func body_of(id: int) -> String:
	var current := find(id)
	for _step: int in 8:
		if current == null:
			return ""
		match current.where():
			Where.SURFACE, Where.ORBIT:
				return current.body_id
			Where.DOCKED:
				current = find(current.host_id)
			_:
				return ""
	return ""


## The structures per body (body id → ids, in `entries` order); under way ones are left out.
func by_body() -> Dictionary:
	var result: Dictionary = {}
	for value: Entry in entries():
		var body := body_of(value.structure_id)
		if body.is_empty():
			continue
		if not result.has(body):
			result[body] = PackedInt64Array()
		var ids: PackedInt64Array = result[body]
		ids.append(value.structure_id)
		result[body] = ids
	return result


## The bodies the player stands on: structures on the surface or docked to one there (orbit and
## trips left out), in `entries` order. Each place names its main structure, the one Base opens
## there: a base before anything else, standing before docked, then the most modules.
func places() -> Array[Place]:
	var result: Array[Place] = []
	var by_id: Dictionary = {}
	for value: Entry in entries():
		var where := value.where()
		if where != Where.SURFACE and where != Where.DOCKED:
			continue
		var body := body_of(value.structure_id)
		if body.is_empty():
			continue
		var place := by_id.get(body) as Place
		if place == null:
			place = Place.new()
			place.body_id = body
			by_id[body] = place
			result.append(place)
		place.structure_ids.append(value.structure_id)
		var best := find(place.main_id)
		if best == null or _better_main(value, best):
			place.main_id = value.structure_id
	return result


## The structures that can travel (a space or ground drive), in `entries` order.
func movables() -> Array[Entry]:
	var result: Array[Entry] = []
	for value: Entry in entries():
		if value.can_fly() or value.can_drive():
			result.append(value)
	return result


static func _better_main(a: Entry, b: Entry) -> bool:
	if (a.kind == "base") != (b.kind == "base"):
		return a.kind == "base"
	if (a.where() == Where.SURFACE) != (b.where() == Where.SURFACE):
		return a.where() == Where.SURFACE
	return a.total_modules > b.total_modules


## A body with own structures (Fleet.places).
class Place:
	extends RefCounted
	var body_id := ""
	## The structures there, standing and docked.
	var structure_ids := PackedInt64Array()
	## The one to open there.
	var main_id := 0


## The structures standing on one body's surface (not docked, not in orbit).
func on_surface(body_id: String) -> Array[Entry]:
	var result: Array[Entry] = []
	for value: Entry in entries():
		if value.where() == Where.SURFACE and value.body_id == body_id:
			result.append(value)
	return result


func _read(entry: Entry, data: Dictionary) -> void:
	entry.name = Wire.as_string(data.get("name"), entry.name)
	entry.kind = Wire.as_string(data.get("kind"), entry.kind)
	entry.favorite = data.get("favorite") == true
	if typeof(data.get("capabilities")) == TYPE_ARRAY:
		entry.capabilities = PackedStringArray()
		var values: Array = data.get("capabilities")
		for value: Variant in values:
			entry.capabilities.append(Wire.as_string(value))
	if data.has("anchor"):
		entry.set_anchor(data.get("anchor"))
	entry.total_hulls = Wire.as_int(data.get("totalHulls"), entry.total_hulls)
	entry.total_modules = Wire.as_int(data.get("totalModules"), entry.total_modules)
