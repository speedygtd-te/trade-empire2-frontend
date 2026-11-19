class_name BodyPhysics
extends RefCounted
## Derived physics of a body (`Body.physics`, draft.30, real-scale galaxies only): mass, density,
## escape velocity, distance to the star, starlight and the temperature from starlight alone.
## Display only. A body without `physics` has none (`from_wire` gives null); the body panel then
## leaves the section out. Also the number texts the panel shows them with.

## Earth masses, g/cm³, km/s.
var mass_earth := 0.0
var density := 0.0
var escape_velocity := 0.0
## Distance to the star in AU (a moon: its planet's).
var star_distance_au := 0.0
## Starlight at the body, Earth = 1.
var flux := 0.0
## Temperature from starlight alone, without greenhouse (°C).
var equilibrium_c := 0.0


## `Body.physics`; null when it is missing or not an object.
static func from_wire(value: Variant) -> BodyPhysics:
	if typeof(value) != TYPE_DICTIONARY:
		return null
	var data: Dictionary = value
	if data.is_empty():
		return null
	var physics := BodyPhysics.new()
	physics.mass_earth = maxf(SystemMap.number(data.get("massEarth")), 0.0)
	physics.density = maxf(SystemMap.number(data.get("density")), 0.0)
	physics.escape_velocity = maxf(SystemMap.number(data.get("escapeVelocity")), 0.0)
	physics.star_distance_au = maxf(SystemMap.number(data.get("starDistanceAu")), 0.0)
	physics.flux = maxf(SystemMap.number(data.get("flux")), 0.0)
	physics.equilibrium_c = SystemMap.number(data.get("equilibriumTemperature"))
	return physics


## How much warmer the surface is than starlight alone makes it (greenhouse effect, inner and
## tidal heat), in °C; negative when it is colder.
func warming(surface_c: float) -> float:
	return surface_c - equilibrium_c


## A temperature in whole °C with a real minus and thousands groups: "−273", "14", "1 050".
static func celsius(value: float) -> String:
	var whole := roundi(value)
	return ("−" if whole < 0 else "") + AmountFormat.units(absi(whole))


## A temperature difference with its sign: "+33", "−4", "0".
static func celsius_change(value: float) -> String:
	var whole := roundi(value)
	return ("+" if whole > 0 else "") + celsius(whole)


## A positive measure for reading, about three significant digits: "1 234", "318", "12.4",
## "5.51", "0.82", "0.053", "0.0012"; "0" for zero and below.
static func figure(value: float) -> String:
	if value <= 0.0:
		return "0"
	if value >= 100.0:
		return AmountFormat.units(roundi(value))
	if value >= 10.0:
		return "%.1f" % value
	if value >= 1.0:
		return "%.2f" % value
	# Two significant digits below 1, at least two decimals, at most six.
	var decimals := clampi(1 - floori(log(value) / log(10.0)), 2, 6)
	return String.num(value, decimals).pad_decimals(decimals)
