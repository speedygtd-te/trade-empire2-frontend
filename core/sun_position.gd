class_name SunPosition
extends RefCounted
## Where the sun stands at a spot of a body at a game time, after the backend's draft
## docs/SPEC-himmelsmechanik.md (circular orbits, a tilted spin axis). Purely visual: the
## server never asks the client about it.
##
## Frame: the body orbits its star in the x-y plane, counter-clockwise seen from +z. The spin
## axis leans from +z by `axial_tilt` towards the direction `tilt_azimuth` in the orbit plane.
## `from_body` maps the contract's `Body.orbit` and `Body.rotation` (draft.18) onto these fields.

## Orbit: period in seconds of game time, angle at game time 0 (radians).
var orbit_period_s := 3600.0
var orbit_phase0 := 0.0
## Rotation: sidereal period in seconds, +1 for EAST (prograde), -1 for WEST.
var rotation_period_s := 600.0
var rotation_direction := 1.0
## Angle of the zero meridian at game time 0 (radians).
var meridian0 := 0.0
var axial_tilt := 0.0
var tilt_azimuth := 0.0


class SunInSky:
	extends RefCounted
	## Height of the sun above the horizon (radians, negative at night).
	var elevation := 0.0
	## Direction of the sun along the horizon, clockwise from north (radians).
	var azimuth := 0.0


## Position of the spot at latitude `lat` and longitude `lon` (radians) at game time `t_s`
## (seconds).
func sky_at(lat: float, lon: float, t_s: float) -> SunInSky:
	var theta := orbit_phase0 + TAU * t_s / orbit_period_s
	# Direction from the body to its star.
	var to_star := Vector3(-cos(theta), -sin(theta), 0.0)

	var axis := Vector3(sin(axial_tilt) * cos(tilt_azimuth), sin(axial_tilt) * sin(tilt_azimuth), cos(axial_tilt))
	var first := axis.cross(Vector3(0.0, 0.0, 1.0))
	first = first.normalized() if first.length() > 0.000001 else Vector3(1.0, 0.0, 0.0)
	var second := axis.cross(first)

	var spin := meridian0 + rotation_direction * TAU * t_s / rotation_period_s
	var angle := lon + spin
	var up := (first * cos(angle) + second * sin(angle)) * cos(lat) + axis * sin(lat)

	var sky := SunInSky.new()
	sky.elevation = asin(clampf(up.dot(to_star), -1.0, 1.0))
	var east := axis.cross(up)
	if east.length() < 0.000001:
		sky.azimuth = 0.0
		return sky
	east = east.normalized()
	var north := up.cross(east)
	sky.azimuth = fposmod(atan2(to_star.dot(east), to_star.dot(north)), TAU)
	return sky


## Length of a solar day (noon to noon) in seconds.
func solar_day_s() -> float:
	var spin_rate := rotation_direction / rotation_period_s
	var orbit_rate := 1.0 / orbit_period_s
	var relative := absf(spin_rate - orbit_rate)
	return 1.0 / relative if relative > 0.0 else INF


## Latitude and longitude (radians) of a cell on the surface band (`Grid`, draft.18): x runs
## once around the equator (`size_x` cells, x and x ± N are the same cell), y runs from
## -size_y/2 to size_y/2 with the equator at y = 0; tiles are square, so the band is ±45°.
## (SPEC-himmelsmechanik puts the equator at y = size_y / 2; the contract wins.)
static func cell_angles(x: int, y: int, size_x: int) -> Vector2:
	if size_x <= 0:
		return Vector2.ZERO
	var lon := TAU * float(posmod(x, size_x)) / size_x
	var lat := y * TAU / size_x
	return Vector2(lat, lon)


## The sun of a body from the contract (`Body.orbit`, `Body.rotation`; angles in degrees,
## periods in game seconds). A moon passes its planet as `parent`: the star's direction follows
## the planet's orbit, the spin is the moon's own. Null when the data is missing or invalid.
static func from_body(body: Dictionary, parent: Dictionary = {}) -> SunPosition:
	var orbit := Wire.as_dict((parent if not parent.is_empty() else body).get("orbit"))
	var rotation := Wire.as_dict(body.get("rotation"))
	var orbit_period := _number(orbit.get("periodS"))
	var rotation_period := _number(rotation.get("periodS"))
	if orbit_period <= 0.0 or rotation_period <= 0.0:
		return null
	var sun := SunPosition.new()
	sun.orbit_period_s = orbit_period
	sun.orbit_phase0 = deg_to_rad(_number(orbit.get("phase0")))
	sun.rotation_period_s = rotation_period
	sun.rotation_direction = -1.0 if Wire.as_string(rotation.get("direction")) == "WEST" else 1.0
	sun.meridian0 = deg_to_rad(_number(rotation.get("meridian0")))
	sun.axial_tilt = deg_to_rad(_number(rotation.get("axialTilt")))
	sun.tilt_azimuth = deg_to_rad(_number(rotation.get("tiltAzimuth")))
	return sun


static func _number(value: Variant) -> float:
	if typeof(value) == TYPE_FLOAT:
		var number: float = value
		return number
	if typeof(value) == TYPE_INT:
		var whole: int = value
		return whole
	return 0.0
