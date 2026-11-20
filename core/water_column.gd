class_name WaterColumn
extends RefCounted
## Deep water (contract draft.39): a water tile carries a water column of `d` levels, z = −(d−1) … 0,
## each with the surface's water biome; the sea floor starts at z = −d. The depth is not sent as a
## field: the client learns it from the biomes of the levels it has loaded. Up to draft.38 every
## water column is one level deep (no level below 0 carries water).
##
## Display only, not in the contract: the sea level the colony view draws water at (water is a flat
## surface, not the hills of its elevation; te-gen `water_depth`, docs/SPEC-tiefes-wasser.md).

## Deepest water column the server makes (te-gen `MAX_WATER_DEPTH`, 600 m).
const MAX_DEPTH := 60
## Elevation `e` (0..1000) under which a body type's water lies: its sea level (te-gen biome
## thresholds; EARTH_LIKE oceans under 0.30, OCEAN worlds under 0.65, lakes on icy and toxic bodies
## under 0.20).
const SEA_LEVEL := {
	"EARTH_LIKE": 300.0,
	"OCEAN": 650.0,
	"ICE": 200.0,
	"MOON_ICY": 200.0,
	"TOXIC": 200.0,
}


## The sea level of a body type in elevation units; NAN for a body without one (water there keeps
## its own elevation).
static func sea_level(body_type: String) -> float:
	var found: Variant = SEA_LEVEL.get(body_type)
	return found if found != null else NAN


## The elevation the colony view draws a cell at: water down to `level` (sea_level) lies flat at
## it; land, and water above the sea level (a vent pool on a slope), keep `elevation`.
static func drawn_elevation(elevation: float, water: bool, level: float) -> float:
	if water and not is_nan(level) and elevation <= level:
		return level
	return elevation


## The depth (levels) of a column as far as the loaded levels tell: `biomes` maps level z (≤ 0) to
## its biome there. 0 when the ground level is known to be dry; otherwise one more than the deepest
## level known to be water (the column is unbroken from level 0 down), at least 1 on water; −1 when
## nothing is known yet.
static func known_depth(biomes: Dictionary) -> int:
	var surface := Wire.as_string(biomes.get(0))
	if surface.is_empty():
		var deepest := -1
		for z: int in biomes.keys():
			if z <= 0 and LevelRules.is_water_biome(Wire.as_string(biomes[z])):
				deepest = maxi(deepest, -z)
		return deepest + 1 if deepest >= 0 else -1
	if not LevelRules.is_water_biome(surface):
		return 0
	var depth := 1
	for z: int in biomes.keys():
		if z < 0 and LevelRules.is_water_biome(Wire.as_string(biomes[z])):
			depth = maxi(depth, 1 - z)
	return mini(depth, MAX_DEPTH)


## Levels below the sea floor (or below the ground on land) that count for the depth bonus at level
## `z` (te-gen `tile_richness`: `|z| − (d − 1)`); 0 inside the water column and above the ground.
## `depth` < 0 (unknown) counts as land.
static func bonus_levels(z: int, depth: int) -> int:
	if z >= 0:
		return 0
	return maxi(0, -z - maxi(0, depth - 1))


## Whether level `z` of a column `depth` levels deep lies in its water.
static func in_column(z: int, depth: int) -> bool:
	return z <= 0 and z > -depth
