class_name ModuleMotion
extends RefCounted
## How the moving parts of module models move: rotors and fans turn, dishes and telescopes pan,
## a pump rod strokes, solar panels follow the sun. Purely cosmetic and client-side.
##
## A model carries its moving parts as child nodes named "move_<role>[_n]" (scripts/3d/models,
## kit.Builder.moving); the node's origin is the pivot, its own up axis (+Y) the axis it turns
## around. The role decides the motion (ROLES).
##
## How fast a part moves follows how much its module works (`activity`, 0..1): a part of a module
## under construction, switched off or idle stands still; a module that runs at half its rate
## moves at half speed. That is a picture of the server's rate solution, never a second truth.

enum Kind {
	## Turns around its up axis without end; rate in turns per second.
	SPIN,
	## Pans to and fro around its up axis; rate is the period in seconds, amplitude in radians.
	SWEEP,
	## Goes up and down along its up axis; rate is the period in seconds, amplitude in cells.
	STROKE,
	## Faces the sun by day, rests at night (sun_basis).
	SUN,
}

const PREFIX := "move_"
## Role -> [kind, rate, amplitude].
const ROLES := {
	"rotor": [Kind.SPIN, 0.45, 0.0],
	"fan": [Kind.SPIN, 1.1, 0.0],
	"drill": [Kind.SPIN, 0.6, 0.0],
	"sensor": [Kind.SPIN, 0.12, 0.0],
	"dish": [Kind.SWEEP, 26.0, 1.22],
	"scope": [Kind.SWEEP, 44.0, 0.87],
	"rod": [Kind.STROKE, 2.6, 0.05],
	"panel": [Kind.SUN, 0.0, 0.0],
}
## A solar panel leans at least this much (radians from flat) and at most this much.
const PANEL_MIN_TILT := 0.17
const PANEL_MAX_TILT := 1.05
## The sun counts as up from this elevation (radians) on.
const SUN_UP := 0.05


## The role of a node from its name ("move_fan_2" -> "fan"); "" when it is no moving part or
## its role is unknown. Godot may append a suffix to imported names ("move_fan_2_001").
static func role_of(node_name: String) -> String:
	if not node_name.begins_with(PREFIX):
		return ""
	var role := ""
	for character: String in node_name.substr(PREFIX.length()):
		if character == "_" or character.is_valid_int() or character == ".":
			break
		role += character
	return role if ROLES.has(role) else ""


static func kind_of(role: String) -> Kind:
	var entry: Array = ROLES[role]
	return entry[0]


## The movement of a part on top of its resting pose after `progress` seconds of work; `phase`
## (0..1) shifts it per part, so neighbours do not move in step. SUN parts do not move here.
static func offset(role: String, progress: float, phase: float) -> Transform3D:
	var entry: Array = ROLES[role]
	var kind: Kind = entry[0]
	var rate: float = entry[1]
	var amplitude: float = entry[2]
	match kind:
		Kind.SPIN:
			return Transform3D(Basis(Vector3.UP, TAU * fposmod(progress * rate + phase, 1.0)), Vector3.ZERO)
		Kind.SWEEP:
			return Transform3D(Basis(Vector3.UP, amplitude * sin(TAU * (progress / rate + phase))), Vector3.ZERO)
		Kind.STROKE:
			return Transform3D(Basis.IDENTITY, Vector3(0.0, amplitude * sin(TAU * (progress / rate + phase)), 0.0))
	return Transform3D.IDENTITY


## The orientation of a solar panel whose face (+Y) looks towards `to_sun` (unit vector in the
## panel's parent space): turned towards the sun's direction, leaning between PANEL_MIN_TILT and
## PANEL_MAX_TILT.
static func sun_basis(to_sun: Vector3) -> Basis:
	var tilt := clampf(acos(clampf(to_sun.y, -1.0, 1.0)), PANEL_MIN_TILT, PANEL_MAX_TILT)
	var turn := atan2(to_sun.x, to_sun.z)
	return Basis(Vector3.UP, turn) * Basis(Vector3.RIGHT, tilt)


## How much each module type works by the server's rate solution (`buckets` of
## GET /v2/structures/{id}/production; factors in `micro`): running × workforce × utility, the
## best bucket of a type counts.
static func activity_by_type(buckets: Array, micro: int) -> Dictionary:
	var result: Dictionary = {}
	var unit := float(maxi(micro, 1))
	for entry: Variant in buckets:
		var bucket := Wire.as_dict(entry)
		var type := Wire.as_string(bucket.get("moduleType"))
		if type.is_empty():
			continue
		var factor := Wire.as_int(bucket.get("running")) / unit \
			* Wire.as_int(bucket.get("workforce")) / unit \
			* Wire.as_int(bucket.get("utility")) / unit
		var before: float = result.get(type, 0.0)
		result[type] = maxf(before, clampf(factor, 0.0, 1.0))
	return result


## How much one module works (0..1). Under construction, switched off or idle (no blueprint,
## wrong place) it stands still; a type with a recipe works as its bucket; one without (sensors,
## telescopes) as far as there is power (`without_recipe`).
static func activity(module_type: String, building: bool, disabled: bool, idle: bool,
		by_type: Dictionary, without_recipe: float) -> float:
	if building or disabled or idle:
		return 0.0
	if by_type.has(module_type):
		var known: float = by_type[module_type]
		return known
	return clampf(without_recipe, 0.0, 1.0)
