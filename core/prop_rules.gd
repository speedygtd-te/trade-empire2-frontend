class_name PropRules
extends RefCounted
## Which props (trees, rocks, ice, vents …) stand on a cell of the surface, after the V1 client
## (`src/views/grid/propThemes.ts` and `propLayout.ts` there). Purely cosmetic: the backend only
## sends the vegetation value `g` (0..6, `SurfaceCell.g`); what it shows is decided here.
##
## Everything is deterministic per absolute cell (x wrapped to the body's width), so a cell looks
## the same every time and on every device. The hashes are V1's, bit for bit; the streams
## (count, key, variant, position, size) hash distinct points so they do not correlate.
##
## Differences to V1, which drew sprites in an isometric 2D view:
## - The position is a point of the cell's ground square in cells (V1 projected the same point to
##   the screen); standing props keep inside SCATTER_SPAN of the cell.
## - Two new streams: a turn around the up axis (3D models have a side) and a rank, the order in
##   which a dense field is thinned out when the view drops detail.
## - The size factors of the V1 sprites are not here: sizes belong to the models and sprites.

## Highest vegetation value the backend sends.
const MAX_G := 6
## Size spread of one prop around its family's size (V1 PROP_SCALE_MIN/MAX).
const SCALE_MIN := 0.85
const SCALE_MAX := 1.15
## Resolution of the position and size streams (V1 JITTER_STEPS, SCALE_STEPS).
const JITTER_STEPS := 16
const SCALE_STEPS := 8
## Share of the cell edge over which the foot of a standing prop is spread, centred. V1 used the
## whole ground square (1.0); 3D props have a width, so they keep a margin and do not reach onto a
## neighbouring hull.
const SCATTER_SPAN := 0.8
## Flat props lying on the ground (puddles, floes, craters) stay near the centre: their whole
## area has to fit the cell (V1 JITTER 0.28 of the half tile).
const DECAL_JITTER := 0.14
const DECALS: Array[String] = ["lava_puddle", "ice_floe", "crater_decal"]
## Steps of the turn around the up axis.
const TURN_STEPS := 16
## Resolution of the thinning rank.
const RANK_STEPS := 1024

## Vent covers over underground hulls (a hull below the surface, none on it): the share of such
## cells that get one, and the four kinds (V1 VENT_DENSITY, VENT_KEYS).
const VENT_DENSITY := 0.1
const VENT_KEYS: Array[String] = ["vent_grate", "vent_pipe", "vent_stack", "vent_fan"]
const _VENT_MODULUS := 1000

## Biome → keys (a family; "" draws nothing, V1's null sentinel), the count at the lowest and
## at the highest g that carries props, the lowest such g (default 1) and per family a subset of
## its variants. V1 PROP_THEMES, unchanged; the reasons for every number are documented there.
## Biomes without an entry carry no props (OCEAN and FROZEN_LAKE on purpose).
const THEMES := {
	"FOREST": {"keys": ["tree"], "min": 7, "max": 18},
	"SWAMP": {"keys": ["swamp"], "min": 4, "max": 12},
	"OASIS": {"keys": ["palm"], "min": 2, "max": 8},
	"MOUNTAIN": {"keys": ["rock"], "min": 1, "max": 4},
	"BEACH": {"keys": ["palm", "driftwood", "rock_arid"], "min": 1, "max": 4},
	"DESERT_PATCH": {"keys": ["palm", "rock_sand", "rock_sand"], "min": 1, "max": 4},
	"ROCKY_DESERT": {"keys": ["rock"], "min": 1, "max": 4},
	"SNOW_PEAK": {"keys": ["rock_snow"], "min": 1, "max": 2},
	"PLAINS": {"keys": ["", "", "grass", "bush", "tree_leafy"], "min": 1, "max": 4},
	"OBSIDIAN_RIDGE": {"keys": ["lava_rock"], "min": 1, "max": 4},
	"BASALT_PLAIN": {"keys": ["basalt_column", "basalt_column", "rock_ash", "basalt_column", "charred_tree"], "min": 1, "max": 4},
	"ASH_FIELD": {"keys": ["charred_tree", "rock_ash", "rock_ash"], "min": 1, "max": 2},
	"LAVA_FLOW": {"keys": ["charred_tree_ember", "lava_crust", "lava_rock"], "min": 1, "max": 2},
	"CALDERA": {"keys": ["lava_rock", "lava_puddle", "lava_rock", "charred_tree_ember", "lava_rock"], "min": 1, "max": 4},
	"FUMAROLE": {"keys": ["sulfur_vent", "sulfur_vent", "sulfur_chunk"], "min": 1, "max": 2},
	"ICE_SHELF": {"keys": ["ice_floe"], "min": 1, "max": 2},
	"GLACIER": {"keys": ["ice_block", "ice_block", ""], "min": 2, "max": 4, "min_g": 0},
	"PERMAFROST": {"keys": ["ice_rubble", "ice_rubble", ""], "min": 2, "max": 4, "min_g": 0},
	"TUNDRA": {"keys": ["ice_rubble", "ice_rubble", ""], "min": 2, "max": 4},
	"CREVASSE": {"keys": ["ice_block"], "min": 1, "max": 2},
	"CRATER": {"keys": ["crater_decal"], "variants": {"crater_decal": [2, 3]}, "min": 1, "max": 2, "min_g": 0},
	"IMPACT_CRATER": {"keys": ["crater_decal"], "variants": {"crater_decal": [2, 3]}, "min": 1, "max": 2, "min_g": 0},
	"REGOLITH": {"keys": ["crater_decal"], "variants": {"crater_decal": [1, 2]}, "min": 1, "max": 2},
	"METALLIC_SURFACE": {"keys": ["crater_decal"], "variants": {"crater_decal": [1, 2]}, "min": 1, "max": 2},
	"DUST_PLAIN": {"keys": ["crater_decal"], "variants": {"crater_decal": [0, 1]}, "min": 1, "max": 2},
	"DUST_BASIN": {"keys": ["crater_decal"], "variants": {"crater_decal": [0, 1]}, "min": 1, "max": 2},
	"SILICATE_PLAIN": {"keys": ["crater_decal"], "variants": {"crater_decal": [0, 1]}, "min": 1, "max": 2},
}

## Variants the client has of each family (models in game/world/models/props, sprites in
## game/world/props). The variant stream is taken modulo this, so it never names a missing one.
const VARIANTS := {
	"tree": 8, "tree_leafy": 5, "palm": 4, "charred_tree": 5, "charred_tree_ember": 5,
	"rock": 3, "rock_arid": 3, "rock_sand": 3, "rock_snow": 3, "rock_ash": 3, "sulfur_chunk": 3,
	"lava_rock": 3, "basalt_column": 3, "ice_block": 3, "sulfur_vent": 3,
	"vent_grate": 1, "vent_pipe": 1, "vent_stack": 1, "vent_fan": 1,
	"grass": 6, "bush": 5, "swamp": 8, "driftwood": 4, "ice_rubble": 5, "lava_crust": 3,
	"crater_decal": 4, "lava_puddle": 3, "ice_floe": 5,
}


## One prop on a cell.
class Prop:
	extends RefCounted
	var family: String = ""
	var variant: int = 0
	## Foot point from the cell centre in cells: x along the cell's x, y along its y.
	var offset := Vector2.ZERO
	## Size factor around 1 (SCALE_MIN..SCALE_MAX).
	var scale: float = 1.0
	## Turn around the up axis, radians.
	var turn: float = 0.0
	## 0..1: when the view thins a field out, props with a lower rank stay longest.
	var rank: float = 0.0


## The props of a cell: `x` wrapped into the body's width, `biome` as sent (upper case), `g` the
## vegetation value. Empty for a biome without props and for g below its lowest prop-bearing
## value. A key drawing nothing ("") drops its instance without shifting the others (V1).
static func layout(x: int, y: int, biome: String, g: int) -> Array[Prop]:
	var props: Array[Prop] = []
	var theme: Dictionary = THEMES.get(biome, {})
	if theme.is_empty():
		return props
	var keys: Array = theme["keys"]
	var low: int = theme["min"]
	var high: int = theme["max"]
	var min_g: int = theme.get("min_g", 1)
	var count := count_for_g(g, low, high, min_g)
	for index: int in count:
		var family: String = keys[key_hash(x * 53 + 13 + index * 131, y * 37 + 7 + index * 89, keys.size())]
		if family.is_empty():
			continue
		var prop := Prop.new()
		prop.family = family
		prop.variant = _variant(theme, family, x, y, index)
		var jitter_x := _centered(floor_variant(x * 97 + 3 + index * 211, y * 29 + 11 + index * 71, JITTER_STEPS))
		var jitter_y := _centered(floor_variant(x * 41 + 19 + index * 167, y * 83 + 23 + index * 43, JITTER_STEPS))
		var reach := DECAL_JITTER if family in DECALS else SCATTER_SPAN * 0.5
		prop.offset = Vector2(jitter_x, jitter_y) * reach
		var size := floor_variant(x * 67 + 29 + index * 199, y * 59 + 17 + index * 113, SCALE_STEPS)
		prop.scale = SCALE_MIN + float(size) / (SCALE_STEPS - 1) * (SCALE_MAX - SCALE_MIN)
		prop.turn = TAU * key_hash(x * 113 + 37 + index * 61, y * 47 + 53 + index * 139, TURN_STEPS) / TURN_STEPS
		prop.rank = float(key_hash(x * 179 + 43 + index * 233, y * 101 + 59 + index * 157, RANK_STEPS)) / RANK_STEPS
		props.append(prop)
	return props


## The vent cover on a cell above an underground hull, or null: only VENT_DENSITY of such cells
## get one. A smaller density keeps a subset of the covers of a larger one (V1 ventLayout).
static func vent(x: int, y: int, density: float = VENT_DENSITY) -> Prop:
	if key_hash(x * 149 + 41, y * 89 + 17, _VENT_MODULUS) >= density * _VENT_MODULUS:
		return null
	var prop := Prop.new()
	prop.family = VENT_KEYS[key_hash(x * 211 + 5, y * 173 + 61, VENT_KEYS.size())]
	# Fittings follow the grid: a quarter turn at most.
	prop.turn = PI * 0.5 * key_hash(x * 113 + 37, y * 47 + 53, 4)
	prop.rank = float(key_hash(x * 179 + 43, y * 101 + 59, RANK_STEPS)) / RANK_STEPS
	return prop


## Number of props at vegetation `g` within a biome's band: none below `min_g`, `low` at min_g,
## `high` at MAX_G, rounded linearly in between (V1 countForG, rounding half up like Math.round).
static func count_for_g(g: int, low: int, high: int, min_g: int = 1) -> int:
	if g < min_g:
		return 0
	var share := float(mini(g, MAX_G) - min_g) / (MAX_G - min_g)
	return floori(low + (high - low) * share + 0.5)


## Share of a field's props that is drawn (0..1) at a detail tier (DetailGovernor) and zoom
## (visible height of the view in cells). `big`: trees, columns, blocks, vents — they carry the
## look and stay longest; small props (stones, grass, puddles) are a few pixels from afar and go
## first. On a slow device only big props are drawn ("a missing tree disturbs less than
## stutter").
static func visible_share(tier: DetailGovernor.Tier, zoom: float, big: bool) -> float:
	var band: Array = _SHARE_BIG[tier] if big else _SHARE_SMALL[tier]
	var full_until: float = band[0]
	var least_at: float = band[1]
	var least: float = band[2]
	var first: float = band[3]
	if zoom <= full_until:
		return first
	return lerpf(first, least, clampf((zoom - full_until) / (least_at - full_until), 0.0, 1.0))


## Whether big 3D props cast shadows: only on the tiers with sun shadows and close enough that a
## shadow is more than a few pixels (each shadow split draws every caster again).
static func casts_shadows(tier: DetailGovernor.Tier, zoom: float) -> bool:
	match tier:
		DetailGovernor.Tier.FAST:
			return zoom <= 16.0
		DetailGovernor.Tier.MEDIUM:
			return zoom <= 12.0
	return false


## How many surface blocks around the one under the camera carry props at a detail tier.
static func reach(tier: DetailGovernor.Tier) -> int:
	return 1 if tier == DetailGovernor.Tier.SLOW else 3


## Per tier: (zoom up to which the first share holds, zoom from which the least share holds,
## least share, first share).
const _SHARE_BIG := {
	DetailGovernor.Tier.FAST: [16.0, 40.0, 0.6, 1.0],
	DetailGovernor.Tier.MEDIUM: [12.0, 36.0, 0.4, 1.0],
	DetailGovernor.Tier.SLOW: [9.0, 30.0, 0.25, 0.7],
}
const _SHARE_SMALL := {
	DetailGovernor.Tier.FAST: [14.0, 28.0, 0.0, 1.0],
	DetailGovernor.Tier.MEDIUM: [10.0, 22.0, 0.0, 1.0],
	DetailGovernor.Tier.SLOW: [1.0, 2.0, 0.0, 0.0],
}


## Whether a biome carries props at all.
static func has_props(biome: String) -> bool:
	return THEMES.has(biome)


## V1 floorVariant: the hash of the ground tiles, one mix round; an index in 0..count-1.
static func floor_variant(x: int, y: int, count: int) -> int:
	var h := _to_signed((_imul(x, 374761393) + _imul(y, 668265263)) & 0xFFFFFFFF)
	h = _to_signed(_imul(h ^ ((h & 0xFFFFFFFF) >> 13), 1274126177))
	return absi(h) % count


## V1 keyHash: two mix rounds and a finishing avalanche, for categorical choices; an index in
## 0..count-1.
static func key_hash(x: int, y: int, count: int) -> int:
	var h := (_imul(x, 374761393) + _imul(y, 668265263)) & 0xFFFFFFFF
	h = _imul(h ^ (h >> 15), 2246822519)
	h = _imul(h ^ (h >> 13), 3266489917)
	h ^= h >> 16
	return h % count


static func _variant(theme: Dictionary, family: String, x: int, y: int, index: int) -> int:
	var available: int = VARIANTS.get(family, 1)
	var subsets: Dictionary = theme.get("variants", {})
	var subset: Array = subsets.get(family, [])
	if not subset.is_empty():
		var chosen: int = subset[key_hash(x * 71 + 23 + index * 149, y * 43 + 31 + index * 97, subset.size())]
		return mini(chosen, available - 1)
	return floor_variant(x * 31 + 7 + index * 101, y * 13 + 5 + index * 57, available)


## A bucket 0..steps-1 → -1..1.
static func _centered(bucket: int) -> float:
	return float(bucket) / (JITTER_STEPS - 1) * 2.0 - 1.0


## Math.imul: the low 32 bits of a product, as unsigned 0..2^32-1. Split in 16-bit halves so no
## intermediate leaves 64 bits.
static func _imul(a: int, b: int) -> int:
	a &= 0xFFFFFFFF
	b &= 0xFFFFFFFF
	var low := (a & 0xFFFF) * b
	var high := (((a >> 16) * b) & 0xFFFF) << 16
	return (low + high) & 0xFFFFFFFF


static func _to_signed(value: int) -> int:
	value &= 0xFFFFFFFF
	return value - 0x100000000 if value >= 0x80000000 else value
