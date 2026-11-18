class_name TravelTrack
extends RefCounted
## Where a flight shows on the maps. The legs of a flight run between fixed points of the galaxy
## in nano-light-years: the positions of bodies and the centres of systems (SPEC-mobil 1.1, 3.3).
## The system map draws bodies on their visible orbits instead, so each end of a leg is snapped
## to the visible place of the body (or star) it starts or ends at, and the structure moves
## between those by the share of the leg's time that has passed. A leg whose end is no point of
## the shown system (between systems) is not on that map.
##
## Display only, like the system map itself.

## How close (light years) a leg's end has to be to a body or star to count as that point. Bodies
## of one system lie at least about 0.001 LY apart; the server rounds positions to 1e-6 units.
const SNAP_LY := 0.0004


## One point the legs can start or end at: its place in the galaxy (light years) and on the map.
class Anchor:
	extends RefCounted
	var galaxy := Vector3.ZERO
	var map := Vector2.ZERO

	static func make(galaxy_ly: Vector3, map_point: Vector2) -> Anchor:
		var anchor := Anchor.new()
		anchor.galaxy = galaxy_ly
		anchor.map = map_point
		return anchor


## A point of a leg (nano-light-years) in light years.
static func light_years(point: PackedInt64Array) -> Vector3:
	return Vector3(point[0] / float(TravelMotion.NLY_PER_LY), point[1] / float(TravelMotion.NLY_PER_LY),
		point[2] / float(TravelMotion.NLY_PER_LY))


## The map point of the anchor nearest to `galaxy_ly` within SNAP_LY; null when none.
static func snap(galaxy_ly: Vector3, anchors: Array[Anchor]) -> Variant:
	var best: Anchor = null
	var best_distance := SNAP_LY
	for anchor: Anchor in anchors:
		var distance := anchor.galaxy.distance_to(galaxy_ly)
		if distance <= best_distance:
			best_distance = distance
			best = anchor
	return best.map if best != null else null


## The index of the leg that runs at `t` (the first before it starts, the last after the end);
## -1 without legs.
static func leg_index(motion: TravelMotion, t: int) -> int:
	if motion.legs.is_empty():
		return -1
	for index: int in motion.legs.size():
		if t < motion.legs[index].end:
			return index
	return motion.legs.size() - 1


## Share of a leg's time that has passed at `t`, 0..1.
static func leg_share(leg: TravelMotion.Leg, t: int) -> float:
	if leg.end <= leg.start:
		return 1.0
	return clampf(float(t - leg.start) / float(leg.end - leg.start), 0.0, 1.0)


## Where a flight is on a system map at `t`: between the visible places of its leg's ends;
## null when the running leg does not start and end in this system.
static func map_point(motion: TravelMotion, t: int, anchors: Array[Anchor]) -> Variant:
	var index := leg_index(motion, t)
	if index < 0 or motion.frame != TravelMotion.FRAME_GALAXY:
		return null
	var leg := motion.legs[index]
	var from: Variant = snap(light_years(leg.from), anchors)
	var to: Variant = snap(light_years(leg.to), anchors)
	if from == null or to == null:
		return null
	var start: Vector2 = from
	var end: Vector2 = to
	return start.lerp(end, leg_share(leg, t))


## The parts of a flight on a system map: [from, to] for every moving leg that starts and ends
## in this system, for drawing its path.
static func map_path(motion: TravelMotion, anchors: Array[Anchor]) -> Array[PackedVector2Array]:
	var result: Array[PackedVector2Array] = []
	if motion.frame != TravelMotion.FRAME_GALAXY:
		return result
	for leg: TravelMotion.Leg in motion.legs:
		if leg.from == leg.to:
			continue
		var from: Variant = snap(light_years(leg.from), anchors)
		var to: Variant = snap(light_years(leg.to), anchors)
		if from != null and to != null:
			result.append(PackedVector2Array([from as Vector2, to as Vector2]))
	return result


## Where a flight is on the galaxy map at `t` (galactic x, y in coordinate units): smoothly
## between its leg's ends. `ly_per_unit` from the galaxy (`lyPerUnit`).
static func galaxy_point(motion: TravelMotion, t: int, ly_per_unit: float) -> Vector2:
	var index := leg_index(motion, t)
	if index < 0:
		return Vector2.ZERO
	var leg := motion.legs[index]
	var share := leg_share(leg, t)
	var from := light_years(leg.from)
	var to := light_years(leg.to)
	var here := from.lerp(to, share) / maxf(ly_per_unit, 0.000001)
	return Vector2(here.x, here.y)


## Start and end of a flight on the galaxy map (coordinate units), for its line.
static func galaxy_ends(motion: TravelMotion, ly_per_unit: float) -> PackedVector2Array:
	if motion.legs.is_empty():
		return PackedVector2Array()
	var from := light_years(motion.legs[0].from) / maxf(ly_per_unit, 0.000001)
	var to := light_years(motion.legs[motion.legs.size() - 1].to) / maxf(ly_per_unit, 0.000001)
	return PackedVector2Array([Vector2(from.x, from.y), Vector2(to.x, to.y)])


## Whether a flight leaves its system for another (its galaxy legs span more than SNAP_LY × 50).
static func is_interstellar(motion: TravelMotion) -> bool:
	if motion.frame != TravelMotion.FRAME_GALAXY or motion.legs.is_empty():
		return false
	var from := light_years(motion.legs[0].from)
	var to := light_years(motion.legs[motion.legs.size() - 1].to)
	return from.distance_to(to) > SNAP_LY * 50.0


## Smooth position of a drive on the ground at `t` (cells, x not wrapped: along the leg as the
## server sends it), for drawing a moving vehicle between whole cells.
static func ground_point(motion: TravelMotion, t: int) -> Vector3:
	var index := leg_index(motion, t)
	if index < 0:
		return Vector3.ZERO
	var leg := motion.legs[index]
	var share := leg_share(leg, t)
	var from := Vector3(leg.from[0], leg.from[1], leg.from[2])
	var to := Vector3(leg.to[0], leg.to[1], leg.to[2])
	return from.lerp(to, share)
