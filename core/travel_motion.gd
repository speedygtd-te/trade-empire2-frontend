class_name TravelMotion
extends RefCounted
## A structure's trip (`Motion` of GET /v2/structures/{id} and `travel.started`): legs with times,
## the phase times and the target. The server sends nothing between events, so the client works
## out where the structure is from the legs, with the contract's formula (whole numbers, floor
## towards −∞, x wrapped around the body):
##   pos(t) = from + floor((to − from) × (t − start) / (end − start))
## Before the first leg the structure is at its `from`, after the last at its `to`; a leg whose
## `from` equals its `to` is the launch or landing phase. In the galaxy frame coordinates are
## nano-light-years (1 LY = 1e9) and can reach 1e14; `(to − from) × (t − start)` would overflow
## 64 bits, so the product is split (_scaled).

const FRAME_GALAXY := "galaxy"
const FRAME_BODY := "body"
## Nano-light-years per light-year (galaxy frame).
const NLY_PER_LY := 1000000000

enum Phase { LAUNCHING, CRUISE, LANDING, DRIVING, ARRIVED }


## One straight piece of the trip.
class Leg:
	extends RefCounted
	var from := PackedInt64Array([0, 0, 0])
	var to := PackedInt64Array([0, 0, 0])
	var start := 0
	var end := 0


## Fuel burned over the trip (already taken from the store at the command; for display).
class Fuel:
	extends RefCounted
	var resource := ""
	var total := 0
	var from := 0
	var to := 0


## "flight" or "ground".
var mode := ""
var depart_at := 0
var liftoff_at := 0
var cruise_end_at := 0
var arrival_at := 0
## FRAME_GALAXY or FRAME_BODY.
var frame := ""
## Body frame: the body the cells belong to, and its width for the wrap in x.
var body_id := ""
var grid_size_x := 0
var legs: Array[Leg] = []
## The target as sent (TravelTarget): type orbit/surface/dock, bodyId, x, y, hostId, offset.
var target: Dictionary = {}
var fuel: Array[Fuel] = []
var warp_level := 0
var mass := 0


## Reads a `Motion`; null when it is none.
static func from_wire(value: Variant) -> TravelMotion:
	var data := Wire.as_dict(value)
	if data.is_empty() or typeof(data.get("legs")) != TYPE_ARRAY:
		return null
	var motion := TravelMotion.new()
	motion.mode = Wire.as_string(data.get("mode"))
	motion.depart_at = Wire.as_int(data.get("departAt"))
	motion.liftoff_at = Wire.as_int(data.get("liftoffAt"), motion.depart_at)
	motion.cruise_end_at = Wire.as_int(data.get("cruiseEndAt"), motion.liftoff_at)
	motion.arrival_at = Wire.as_int(data.get("arrivalAt"), motion.cruise_end_at)
	motion.frame = Wire.as_string(data.get("frame"))
	motion.body_id = Wire.as_string(data.get("bodyId"))
	motion.grid_size_x = Wire.as_int(data.get("gridSizeX"))
	motion.target = Wire.as_dict(data.get("target"))
	motion.warp_level = Wire.as_int(data.get("warpLevel"))
	motion.mass = Wire.as_int(data.get("mass"))
	var legs: Array = data.get("legs")
	for entry: Variant in legs:
		var row := Wire.as_dict(entry)
		var leg := Leg.new()
		leg.from = _vector(row.get("from"))
		leg.to = _vector(row.get("to"))
		leg.start = Wire.as_int(row.get("start"))
		leg.end = Wire.as_int(row.get("end"))
		motion.legs.append(leg)
	if typeof(data.get("fuel")) == TYPE_ARRAY:
		var rows: Array = data.get("fuel")
		for entry: Variant in rows:
			var row := Wire.as_dict(entry)
			var burn := Fuel.new()
			burn.resource = Wire.as_string(row.get("resource"))
			burn.total = Wire.as_int(row.get("total"))
			burn.from = Wire.as_int(row.get("from"))
			burn.to = Wire.as_int(row.get("to"))
			motion.fuel.append(burn)
	return motion


## Where the structure is at game time `t` (ms): [x, y, z] in the frame's units; in the body
## frame x lies within the body's width.
func position_at(t: int) -> PackedInt64Array:
	if legs.is_empty():
		return PackedInt64Array([0, 0, 0])
	var result := legs[0].from
	for leg: Leg in legs:
		if t < leg.start:
			break
		if t >= leg.end:
			result = leg.to
			continue
		result = PackedInt64Array()
		for axis: int in 3:
			result.append(leg.from[axis] + _scaled(leg.to[axis] - leg.from[axis], t - leg.start, leg.end - leg.start))
		break
	if frame == FRAME_BODY and grid_size_x > 0:
		result = PackedInt64Array([posmod(result[0], grid_size_x), result[1], result[2]])
	return result


## The phase at game time `t`.
func phase_at(t: int) -> Phase:
	if t >= arrival_at:
		return Phase.ARRIVED
	if mode == "ground":
		return Phase.DRIVING
	if t < liftoff_at:
		return Phase.LAUNCHING
	if t < cruise_end_at:
		return Phase.CRUISE
	return Phase.LANDING


## How far the whole trip is at `t`, 0..1.
func progress_at(t: int) -> float:
	var span := arrival_at - depart_at
	if span <= 0:
		return 1.0
	return clampf(float(t - depart_at) / span, 0.0, 1.0)


## Milliseconds until arrival, never negative.
func remaining_ms(t: int) -> int:
	return maxi(0, arrival_at - t)


## How much of one fuel has been burned by `t` (micro-units), by the contract's formula.
func fuel_burned_at(burn: Fuel, t: int) -> int:
	if t <= burn.from:
		return 0
	if t >= burn.to or burn.to <= burn.from:
		return burn.total
	return _scaled(burn.total, t - burn.from, burn.to - burn.from)


func target_type() -> String:
	return Wire.as_string(target.get("type"))


## The body the trip ends at ("" for a dock target: it is where the host is).
func target_body_id() -> String:
	return Wire.as_string(target.get("bodyId"))


func target_host_id() -> int:
	return Wire.as_int(target.get("hostId"))


## floor(delta × elapsed / span) for 0 ≤ elapsed ≤ span, span > 0, without overflowing 64 bits
## for |delta| up to about 1e15 and span up to about 3e9: delta = q × span + r with 0 ≤ r < span.
static func _scaled(delta: int, elapsed: int, span: int) -> int:
	if span <= 0:
		return delta
	var quotient := floor_div(delta, span)
	var rest := delta - quotient * span
	return quotient * elapsed + floor_div(rest * elapsed, span)


## Integer division rounding towards −∞ (GDScript's `/` cuts towards zero); `divisor` > 0.
static func floor_div(value: int, divisor: int) -> int:
	@warning_ignore("integer_division")
	var quotient := value / divisor
	if value % divisor != 0 and value < 0:
		quotient -= 1
	return quotient


static func _vector(value: Variant) -> PackedInt64Array:
	var data := Wire.as_dict(value)
	return PackedInt64Array([Wire.as_int(data.get("x")), Wire.as_int(data.get("y")), Wire.as_int(data.get("z"))])
