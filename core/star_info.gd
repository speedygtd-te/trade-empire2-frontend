class_name StarInfo
extends RefCounted
## The star of a system as the contract sends it (`Star`, `GalaxyStar`).
##
## draft.30 ("physically consistent star systems") adds `radius`, `spectralClass` and `catalog`,
## and on real-scale galaxies the habitable zone and the frost line. Every one of them may be
## missing (older servers, other galaxies): then they keep their absent-value (0, "", ZERO) and
## the client falls back to what it did before (the radius from luminosity and temperature, the
## star type's text, no zones on the map).

var name := ""
## Star type (O … M, WHITE_DWARF, RED_GIANT, NEUTRON).
var type := ""
## Surface temperature (Kelvin), luminosity and mass (suns); defaults when missing.
var kelvin := 5800.0
var luminosity := 1.0
var mass := 1.0
## Radius in solar radii; 0 when not sent.
var radius := 0.0
## Spectral class ("G2 V", "K3 III", "DA3", "NS"); "" when not sent.
var spectral_class := ""
## Catalog designation ("TEC 12:-3:0/417"); "" when not sent.
var catalog := ""
## Habitable zone in AU: x inner, y outer edge; ZERO when not sent.
var habitable_zone_au := Vector2.ZERO
## Frost line in AU; 0 when not sent.
var frost_line_au := 0.0


## A `Star` or `GalaxyStar` object; an empty one gives the defaults.
static func from_wire(data: Dictionary) -> StarInfo:
	var star := StarInfo.new()
	star.name = Wire.as_string(data.get("name"))
	star.type = Wire.as_string(data.get("type"))
	var kelvin := SystemMap.number(data.get("temperature"))
	if kelvin > 0.0:
		star.kelvin = kelvin
	var luminosity := SystemMap.number(data.get("luminosity"))
	if luminosity > 0.0:
		star.luminosity = luminosity
	var mass := SystemMap.number(data.get("mass"))
	if mass > 0.0:
		star.mass = mass
	star.radius = maxf(SystemMap.number(data.get("radius")), 0.0)
	star.spectral_class = Wire.as_string(data.get("spectralClass")).strip_edges()
	star.catalog = Wire.as_string(data.get("catalog")).strip_edges()
	star.habitable_zone_au = zone(data.get("habitableZoneAu"))
	star.frost_line_au = maxf(SystemMap.number(data.get("frostLineAu")), 0.0)
	return star


## `habitableZoneAu` ([inner, outer]) as a Vector2; ZERO unless it is two numbers with
## 0 < inner < outer.
static func zone(value: Variant) -> Vector2:
	if typeof(value) != TYPE_ARRAY:
		return Vector2.ZERO
	var pair: Array = value
	if pair.size() != 2:
		return Vector2.ZERO
	var inner := SystemMap.number(pair[0])
	var outer := SystemMap.number(pair[1])
	if inner <= 0.0 or outer <= inner:
		return Vector2.ZERO
	return Vector2(inner, outer)


## Radius in solar radii: the server's `radius` when it sent one, else derived from luminosity
## and temperature (SkyLight.star_radius, Stefan–Boltzmann).
static func radius_or_estimate(radius_suns: float, luminosity_suns: float, kelvin_value: float) -> float:
	if radius_suns > 0.0:
		return radius_suns
	return SkyLight.star_radius(luminosity_suns, kelvin_value)


## This star's radius in solar radii (radius_or_estimate).
func radius_suns() -> float:
	return radius_or_estimate(radius, luminosity, kelvin)


func has_habitable_zone() -> bool:
	return habitable_zone_au != Vector2.ZERO


func has_frost_line() -> bool:
	return frost_line_au > 0.0


## Whether a distance from the star (AU) lies in the habitable zone; false without one.
func in_habitable_zone(distance_au: float) -> bool:
	return has_habitable_zone() and distance_au >= habitable_zone_au.x and distance_au <= habitable_zone_au.y


## Whether a distance from the star (AU) lies beyond the frost line; false without one.
func beyond_frost_line(distance_au: float) -> bool:
	return has_frost_line() and distance_au > frost_line_au
