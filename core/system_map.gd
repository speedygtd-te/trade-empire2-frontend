class_name SystemMap
extends RefCounted
## A star system laid out for the map: where each body stands on its orbit at a game time, and a
## display scale on which every orbit stays visible and tappable. Display only — the server
## never asks the client where a body is.
##
## Orbits are circles (`Body.orbit`, contract): the angle is θ(t) = phase0 + 360° · t / periodS
## with t the game time in seconds. Inclination and node are left out; the map is the orbit plane
## seen from above (+z), so bodies run counter-clockwise. Map coordinates have the star at the
## origin and y pointing down (screen convention).
##
## Display scale: real distances span orders of magnitude (0.4 to 30 AU in one system, moons at a
## few thousandths of an AU around their planet), so the map keeps only their order. Each orbit
## around the star lies a logarithmic step beyond the previous one (LOG_UNIT per factor e), but
## never closer than the two neighbours need for their moon systems (CLEARANCE between them).
## Moons sit on rings per rank around their planet (MOON_FIRST, then MOON_STEP apart). Marker
## sizes follow the body's radius on a log scale, clamped per kind. Distances that are no orbit
## (the star's habitable zone and frost line, draft.30) go through the same scale (ring_of_au).

## Map units: radius of the star's disc.
const STAR_RADIUS := 26.0
## Free space between the outer edge of one orbit's band and the inner edge of the next.
const CLEARANCE := 18.0
## Map units per factor e in orbit radius (log scale).
const LOG_UNIT := 120.0
## First moon ring: this far outside the planet's marker; further rings MOON_STEP apart.
const MOON_FIRST := 10.0
const MOON_STEP := 8.0
## Half the width of an asteroid belt's band.
const BELT_HALF_WIDTH := 10.0
## Body radii (km) mapped to the smallest and largest marker of a kind.
const KM_SMALL := 100.0
const KM_LARGE := 50000.0
## Marker radius range (map units) per kind: x smallest, y largest.
const PLANET_MARKER := Vector2(6.0, 20.0)
const MOON_MARKER := Vector2(3.0, 6.0)
const ASTEROID_MARKER := Vector2(3.0, 5.0)
## A zone (habitable zone, frost line) is drawn only this far outside the star's disc.
const ZONE_MIN_WIDTH := 4.0
## The map grows to show a zone beyond the outermost orbit, by at most this much.
const ZONE_MAX_REACH := LOG_UNIT

const KIND_PLANET := "PLANET"
const KIND_MOON := "MOON"
const KIND_ASTEROID := "ASTEROID"


class Body:
	extends RefCounted
	var id := ""
	var name := ""
	## Body type (EARTH_LIKE, GAS_GIANT, …) and kind (PLANET, MOON, ASTEROID).
	var type := ""
	var kind := ""
	## The planet of a moon; "" otherwise (also for a moon whose planet is missing).
	var parent_id := ""
	var radius_km := 0.0
	var orbit_au := 0.0
	var period_s := 0.0
	## Orbit angle at game time 0, radians.
	var phase0 := 0.0
	## Marker radius and orbit radius on the map (around the star, or around the planet for a
	## moon), map units.
	var marker := 0.0
	var ring := 0.0
	## Moon ids of a planet, innermost first.
	var moons: PackedStringArray = []
	## The body as the server sent it (environment, grid, …), for the details.
	var data: Dictionary = {}
	## Derived physics (`Body.physics`, draft.30); null when the server sent none.
	var physics: BodyPhysics = null

	func is_moon() -> bool:
		return not parent_id.is_empty()

	func is_belt() -> bool:
		return kind == KIND_ASTEROID

	## Radius on the map of everything that circles with this body: its moons, or the belt's band.
	func reach() -> float:
		if is_belt():
			return maxf(BELT_HALF_WIDTH, marker)
		if moons.is_empty():
			return marker
		return SystemMap.moon_ring(moons.size() - 1, marker) + MOON_MARKER.y


var system_id := ""
## The star with everything the server sent (spectral class, zones, …); the three fields below
## repeat its name, type and temperature.
var star := StarInfo.new()
var star_name := ""
var star_type := ""
var star_kelvin := 5800.0
## Bodies in the contract's order: planets in orbit order, each followed by its moons, belts last.
var bodies: Array[Body] = []
## Radius of the whole map around the star (outermost band), map units.
var extent := STAR_RADIUS

var _by_id: Dictionary = {}
var _deposits: Dictionary = {}


## The map of a `SystemResponse`.
static func from_system(data: Dictionary) -> SystemMap:
	var map := SystemMap.new()
	map.system_id = Wire.as_string(data.get("systemId"))
	map.star = StarInfo.from_wire(Wire.as_dict(data.get("star")))
	map.star_name = map.star.name
	map.star_type = map.star.type
	map.star_kelvin = map.star.kelvin
	var list: Array = data.get("bodies") if typeof(data.get("bodies")) == TYPE_ARRAY else []
	for item: Variant in list:
		var raw := Wire.as_dict(item)
		var entry := Body.new()
		entry.id = Wire.as_string(raw.get("bodyId"))
		if entry.id.is_empty() or map._by_id.has(entry.id):
			continue
		entry.name = Wire.as_string(raw.get("name"))
		entry.type = Wire.as_string(raw.get("type"))
		entry.kind = Wire.as_string(raw.get("bodyType"))
		entry.parent_id = Wire.as_string(raw.get("parentBodyId"))
		entry.radius_km = number(raw.get("radiusKm"))
		var orbit := Wire.as_dict(raw.get("orbit"))
		entry.orbit_au = number(orbit.get("radiusAu"))
		entry.period_s = number(orbit.get("periodS"))
		entry.phase0 = deg_to_rad(number(orbit.get("phase0")))
		entry.data = raw
		entry.physics = BodyPhysics.from_wire(raw.get("physics"))
		map.bodies.append(entry)
		map._by_id[entry.id] = entry
	map._link_moons()
	map._lay_out()
	var deposits: Array = data.get("deposits") if typeof(data.get("deposits")) == TYPE_ARRAY else []
	for entry: Variant in deposits:
		var deposit := Wire.as_dict(entry)
		var owner := Wire.as_string(deposit.get("bodyId"))
		if not map._deposits.has(owner):
			var fresh: Array[Dictionary] = []
			map._deposits[owner] = fresh
		(map._deposits[owner] as Array[Dictionary]).append(deposit)
	for owner: String in map._deposits.keys():
		(map._deposits[owner] as Array[Dictionary]).sort_custom(_more_abundant)
	return map


## The body with this id; null when unknown.
func body(id: String) -> Body:
	return _by_id.get(id) as Body


## Bodies that circle the star (planets and belts), innermost first.
func star_orbits() -> Array[Body]:
	var result: Array[Body] = []
	for entry: Body in bodies:
		if not entry.is_moon():
			result.append(entry)
	result.sort_custom(func(a: Body, b: Body) -> bool: return a.orbit_au < b.orbit_au)
	return result


## Where the body stands on the map at game time `t_s` (seconds); a moon circles its planet.
func position(id: String, t_s: float) -> Vector2:
	var entry := body(id)
	if entry == null:
		return Vector2.ZERO
	var own := on_ring(entry.ring, orbit_angle(entry.phase0, entry.period_s, t_s))
	if entry.is_moon():
		return position(entry.parent_id, t_s) + own
	return own


## The body nearest to `point` (map units) within `reach` at game time `t_s`; "" when none.
## Moons only count with `with_moons` (the map hides them when zoomed out).
func pick(point: Vector2, t_s: float, reach: float, with_moons: bool = true) -> String:
	var best := ""
	var best_distance := reach
	for entry: Body in bodies:
		if entry.is_moon() and not with_moons:
			continue
		var distance := point.distance_to(position(entry.id, t_s)) - entry.marker
		if distance <= best_distance:
			best_distance = distance
			best = entry.id
	return best


## Distance of a body from the star in AU: `physics.starDistanceAu` when sent, else its orbit (a
## moon: its planet's); 0 for an unknown body.
func star_distance_au(id: String) -> float:
	var entry := body(id)
	if entry == null:
		return 0.0
	if entry.physics != null and entry.physics.star_distance_au > 0.0:
		return entry.physics.star_distance_au
	if entry.is_moon():
		var planet := body(entry.parent_id)
		return planet.orbit_au if planet != null else 0.0
	return entry.orbit_au


## Radius on the map (map units) of a distance from the star in AU, on the same scale as the
## orbits: between two orbits in proportion of the logarithms (as the orbits themselves are
## spaced), inside the first and beyond the last LOG_UNIT per factor e; never inside the star's
## disc. Monotonic, so a zone's edges keep their order and the bodies in it stay in it.
func ring_of_au(au: float) -> float:
	var anchors_au := PackedFloat64Array()
	var anchors_ring := PackedFloat64Array()
	for entry: Body in star_orbits():
		if entry.orbit_au <= 0.0:
			continue
		if not anchors_au.is_empty() and entry.orbit_au <= anchors_au[anchors_au.size() - 1]:
			continue
		anchors_au.append(entry.orbit_au)
		anchors_ring.append(entry.ring)
	var inner := STAR_RADIUS
	if au <= 0.0:
		return inner
	if anchors_au.is_empty():
		return maxf(inner, STAR_RADIUS + CLEARANCE + LOG_UNIT * log(au))
	var last := anchors_au.size() - 1
	if au <= anchors_au[0]:
		return maxf(inner, anchors_ring[0] - LOG_UNIT * log(anchors_au[0] / au))
	if au >= anchors_au[last]:
		return anchors_ring[last] + LOG_UNIT * log(au / anchors_au[last])
	for index: int in last:
		var low := anchors_au[index]
		var high := anchors_au[index + 1]
		if au <= high:
			var share := log(au / low) / log(high / low)
			return lerpf(anchors_ring[index], anchors_ring[index + 1], share)
	return anchors_ring[last]


## The habitable zone on the map: x inner, y outer radius (map units); ZERO when the star has none
## or it would vanish in the star's disc.
func habitable_zone_rings() -> Vector2:
	if not star.has_habitable_zone():
		return Vector2.ZERO
	var rings := Vector2(ring_of_au(star.habitable_zone_au.x), ring_of_au(star.habitable_zone_au.y))
	return rings if rings.y > STAR_RADIUS + ZONE_MIN_WIDTH else Vector2.ZERO


## The frost line on the map (map units); 0 when the star has none or it lies in the star's disc.
func frost_line_ring() -> float:
	if not star.has_frost_line():
		return 0.0
	var ring := ring_of_au(star.frost_line_au)
	return ring if ring > STAR_RADIUS + ZONE_MIN_WIDTH else 0.0


## The deposits of a body, most abundant first: {resourceType, abundance, quality}.
func deposits_of(id: String) -> Array[Dictionary]:
	var found: Variant = _deposits.get(id)
	if found == null:
		return []
	return found as Array[Dictionary]


## Orbit angle (radians) at game time `t_s`: θ = phase0 + 2π · t / period. A missing period
## leaves the body at its start angle.
static func orbit_angle(phase0: float, period_s: float, t_s: float) -> float:
	if period_s <= 0.0:
		return phase0
	return phase0 + TAU * fposmod(t_s, period_s) / period_s


## Point on a ring of `radius` at `angle` (radians, counter-clockwise on screen, y down).
static func on_ring(radius: float, angle: float) -> Vector2:
	return Vector2(cos(angle), -sin(angle)) * radius


## Display radii of the orbits around the star: `radii_au` sorted outwards, `reaches` the room
## each orbit's band needs on either side (moon system or belt). Each orbit lies LOG_UNIT · ln
## of the real ratio beyond the previous one, but at least far enough that the bands keep
## CLEARANCE; the first leaves the star's disc free.
static func orbit_radii(radii_au: PackedFloat64Array, reaches: PackedFloat64Array) -> PackedFloat64Array:
	var result := PackedFloat64Array()
	for index: int in radii_au.size():
		var reach := reaches[index] if index < reaches.size() else 0.0
		if index == 0:
			result.append(STAR_RADIUS + CLEARANCE + reach)
			continue
		var previous_reach := reaches[index - 1] if index - 1 < reaches.size() else 0.0
		var needed := previous_reach + CLEARANCE + reach
		var step := 0.0
		if radii_au[index - 1] > 0.0 and radii_au[index] > radii_au[index - 1]:
			step = LOG_UNIT * log(radii_au[index] / radii_au[index - 1])
		result.append(result[index - 1] + maxf(needed, step))
	return result


## Marker radius (map units) of a body of `radius_km`: logarithmic between KM_SMALL and KM_LARGE,
## within the range of its kind.
static func marker_radius(radius_km: float, kind: String) -> float:
	var span := PLANET_MARKER
	if kind == KIND_MOON:
		span = MOON_MARKER
	elif kind == KIND_ASTEROID:
		span = ASTEROID_MARKER
	var share := 0.0
	if radius_km > 0.0:
		share = clampf(log(radius_km / KM_SMALL) / log(KM_LARGE / KM_SMALL), 0.0, 1.0)
	return lerpf(span.x, span.y, share)


## Radius of the ring of the moon with `rank` (0 = innermost) around a planet whose marker has
## radius `planet_marker`.
static func moon_ring(rank: int, planet_marker: float) -> float:
	return planet_marker + MOON_FIRST + MOON_STEP * rank


## The body's name without the star's name in front, for labels on the map: draft.30 names
## planets "{star} b, c …", moons "{planet} I, II …" and belts "{star} Belt-1" ("Brevan Thakoris
## b I" → "b I"); older worlds "{star} Primus …" ("Nu Eridani Secundus I" → "Secundus I"). The
## full name when that would leave nothing or the star's name is not in front.
static func short_name(body_name: String, name_of_star: String) -> String:
	if name_of_star.is_empty() or not body_name.begins_with(name_of_star + " "):
		return body_name
	var rest := body_name.substr(name_of_star.length() + 1).strip_edges()
	return rest if not rest.is_empty() else body_name


## The gases of an atmosphere (`Environment.atmosphere`) as [gas, share] pairs, largest share
## first; gases without a share are left out.
static func atmosphere_shares(atmosphere: Dictionary) -> Array[Array]:
	var result: Array[Array] = []
	for gas: Variant in atmosphere.keys():
		var share := number(atmosphere[gas])
		if typeof(gas) == TYPE_STRING and share > 0.0:
			result.append([gas, share])
	result.sort_custom(func(a: Array, b: Array) -> bool:
		var share_a: float = a[1]
		var share_b: float = b[1]
		return share_a > share_b if share_a != share_b else str(a[0]) < str(b[0]))
	return result


## The player's structures per body from `StructureSummary` items: body id → names. On the
## ground (`surface`) and in orbit (`free` with `kind` orbit) the anchor names the body; a guest
## (`docked`) is where its host is. Structures in transit belong to no body.
static func structures_by_body(items: Array) -> Dictionary:
	var anchors := {}
	for entry: Variant in items:
		var summary := Wire.as_dict(entry)
		anchors[Wire.as_int(summary.get("structureId"))] = Wire.as_dict(summary.get("anchor"))
	var result := {}
	for entry: Variant in items:
		var summary := Wire.as_dict(entry)
		var where := _anchor_body(Wire.as_dict(summary.get("anchor")), anchors, 0)
		if where.is_empty():
			continue
		if not result.has(where):
			result[where] = PackedStringArray()
		var names: PackedStringArray = result[where]
		names.append(Wire.as_string(summary.get("name")))
		result[where] = names
	return result


## Where labels go without overlapping: for each label a list of candidate boxes (preferred
## first), greedy in the given order (put the important labels first). A label takes its first
## candidate that overlaps neither a box placed before nor any of the `obstacles` (things drawn
## anyway, such as the bodies). Returns the chosen candidate per label, -1 for none.
static func place_labels(candidates: Array[Array], obstacles: Array[Rect2] = []) -> PackedInt32Array:
	var kept: Array[Rect2] = []
	kept.append_array(obstacles)
	var result := PackedInt32Array()
	for options: Array in candidates:
		var chosen := -1
		for index: int in options.size():
			var box: Rect2 = options[index]
			var free := true
			for other: Rect2 in kept:
				if box.intersects(other):
					free = false
					break
			if free:
				chosen = index
				kept.append(box)
				break
		result.append(chosen)
	return result


## A JSON number as float (Godot reads every JSON number as float; ints from tests too).
static func number(value: Variant) -> float:
	if typeof(value) == TYPE_FLOAT:
		var real: float = value
		return real
	if typeof(value) == TYPE_INT:
		var whole: int = value
		return whole
	return 0.0


static func _anchor_body(anchor: Dictionary, anchors: Dictionary, depth: int) -> String:
	var type := Wire.as_string(anchor.get("type"))
	if type == "surface":
		return Wire.as_string(anchor.get("bodyId"))
	if type == "free":
		return Wire.as_string(anchor.get("bodyId")) if Wire.as_string(anchor.get("kind")) == "orbit" else ""
	if type == "docked" and depth < 8:
		var host: Variant = anchors.get(Wire.as_int(anchor.get("hostId")))
		if host != null:
			return _anchor_body(host as Dictionary, anchors, depth + 1)
	return ""


static func _more_abundant(a: Dictionary, b: Dictionary) -> bool:
	var abundance_a := Wire.as_int(a.get("abundance"))
	var abundance_b := Wire.as_int(b.get("abundance"))
	if abundance_a != abundance_b:
		return abundance_a > abundance_b
	return Wire.as_string(a.get("resourceType")) < Wire.as_string(b.get("resourceType"))


## Moons join their planet in orbit order; a moon whose planet is missing circles the star.
func _link_moons() -> void:
	for entry: Body in bodies:
		if entry.is_moon():
			var planet := body(entry.parent_id)
			if planet == null or planet.is_moon():
				entry.parent_id = ""
				continue
			planet.moons.append(entry.id)
	for entry: Body in bodies:
		if entry.moons.size() > 1:
			var ordered: Array[Body] = []
			for id: String in entry.moons:
				ordered.append(body(id))
			ordered.sort_custom(func(a: Body, b: Body) -> bool: return a.orbit_au < b.orbit_au)
			var ids := PackedStringArray()
			for moon: Body in ordered:
				ids.append(moon.id)
			entry.moons = ids


func _lay_out() -> void:
	for entry: Body in bodies:
		var kind := entry.kind
		if entry.is_moon():
			kind = KIND_MOON
		elif kind == KIND_MOON:
			kind = KIND_PLANET
		entry.marker = marker_radius(entry.radius_km, kind)
	for entry: Body in bodies:
		for rank: int in entry.moons.size():
			body(entry.moons[rank]).ring = moon_ring(rank, entry.marker)
	var orbits := star_orbits()
	var radii := PackedFloat64Array()
	var reaches := PackedFloat64Array()
	for entry: Body in orbits:
		radii.append(entry.orbit_au)
		reaches.append(entry.reach())
	var rings := orbit_radii(radii, reaches)
	extent = STAR_RADIUS
	for index: int in orbits.size():
		orbits[index].ring = rings[index]
		extent = maxf(extent, rings[index] + reaches[index])
	# Zones beyond the outermost orbit: the map grows to show them, within ZONE_MAX_REACH.
	var orbits_extent := extent
	var zone_edge := maxf(habitable_zone_rings().y, frost_line_ring())
	if zone_edge > 0.0:
		extent = maxf(extent, minf(zone_edge + CLEARANCE, orbits_extent + ZONE_MAX_REACH))
