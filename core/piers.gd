class_name Piers
extends RefCounted
## Where a structure stands over water, and where a mast, lamp or fence post stands in it (Rudi
## 2026-11-20: "Betonsäulen und Fundamente im Wasser"). Display only, like the relief.
##
## A foundation wall (TerrainRelief.foundation) whose two ends both lie on corners touching water
## (TerrainRelief.corner_wet: they lie at the sea level) is no wall but a pier edge: a beam under
## the floor's edge from corner to corner, a head on every corner and a round pillar from there
## down to PILLAR_SINK below the water, with a tide band (collar) at the waterline. Pillars stand
## at every corner along a wet edge (one cell apart, 10 m); between pillars taller than BRACE_FROM
## run braces (the edge beam again), one per BRACE_FROM of height. A wall with only one wet end stays a
## wall (its foot reaches the water at that end): that is the shore, where the pier begins — the
## pillar at its wet end stands in the wall's end.
##
## A prop standing on a water cell (TerrainRelief.is_water) stands on a caisson: a short round
## concrete foundation from below the waterline up to CAISSON_SHOWS above it; the prop stands on
## its top (standing_height).
##
## Lava and swamp (LevelRules.PierGround, Rudi 2026-11-20: "für Vulkan-Biome und Sumpf ebenfalls")
## carry piers and caissons the same way, but their ground keeps its relief: an edge stands on
## piers where both its ends lie on corners touching water, lava or swamp (TerrainRelief.corner_pier),
## and every pillar reaches from the floor to PILLAR_SINK below the ground at its own corner (the
## wall's foot there). Caissons stand at the ground's height. The band where a pillar or caisson
## meets the ground shows what it stands in: wet and overgrown in water, scorched with soot on
## lava, mud-stained in a swamp (TINTS: instance colours of the same pieces).
##
## Pieces are RetainingWalls.Piece (drawn by RetainingLayer, models from retaining.py); positions
## and heights as there: scene coordinates as ColonyView puts cells, the relief's scene heights.

const PILLAR := "pier_pillar"
const HEAD := "pier_head"
const BEAM := "pier_beam"
const COLLAR := "pier_collar"
const CAISSON := "caisson"
const FILES: Array[String] = [PILLAR, HEAD, BEAM, COLLAR, CAISSON]
## Sizes of the models (cells), as retaining.py builds them; every model's origin is its foot.
const HEAD_HEIGHT := 0.076
const BEAM_HEIGHT := 0.055
const COLLAR_WATERLINE := 0.03
const CAISSON_SINK := 0.3
const CAISSON_SHOWS := 0.06
## How far a pillar reaches below the water (hidden there; the water is opaque).
const PILLAR_SINK := 0.3
## Pillars at least this tall (from the water up under the head) get braces, one per this much.
const BRACE_FROM := 0.8
## At most this many braces between two pillars (a pier on very tall stilts would turn into a
## scaffold, and every brace is drawn).
const MAX_BRACES := 3
## Pier edges whose floor lies less than this above the water carry no pillars (cells).
const MIN_PIER := 0.05
## How large a caisson is drawn under each kind of prop (1: the model's 0.3 cells across): wide
## enough for its own footing (perimeter.py), the radar's square pad and the antenna's guy anchors.
const CAISSON_SIZES := {
	Perimeter.Kind.LAMP: 1.1,
	Perimeter.Kind.RADAR: 2.4,
	Perimeter.Kind.ANTENNA: 2.9,
	Perimeter.Kind.BEACON: 0.6,
}
const CAISSON_POST := 0.6
const CAISSON_WALL := 0.85
## Colour of the pieces per ground (multiplied with the model's): [pillar, collar, caisson].
const TINTS := {
	LevelRules.PierGround.WATER: [Color(1.0, 1.0, 1.0), Color(1.0, 1.0, 1.0), Color(1.0, 1.0, 1.0)],
	LevelRules.PierGround.LAVA: [Color(0.86, 0.82, 0.8), Color(0.34, 0.3, 0.29), Color(0.62, 0.57, 0.54)],
	LevelRules.PierGround.SWAMP: [Color(0.95, 0.93, 0.86), Color(0.64, 0.56, 0.38), Color(0.82, 0.76, 0.62)],
}


## Whether a foundation wall stands on piers: both its ends on corners touching water, lava or
## swamp (TerrainRelief.corner_pier).
static func is_wet(wall: TerrainRelief.Wall, relief: TerrainRelief) -> bool:
	if wall.cut:
		return false
	return relief.corner_pier(wall.a.x, wall.a.y) != LevelRules.PierGround.NONE 		and relief.corner_pier(wall.b.x, wall.b.y) != LevelRules.PierGround.NONE


## The colour of a piece (PILLAR, COLLAR or CAISSON) on a ground (TINTS); white elsewhere.
static func tint(file: String, ground: LevelRules.PierGround) -> Color:
	var found: Array = TINTS.get(ground, [])
	if found.is_empty():
		return Color.WHITE
	match file:
		PILLAR:
			return found[0]
		COLLAR:
			return found[1]
		CAISSON:
			return found[2]
	return Color.WHITE


## The pier pieces of the wet walls among `walls` (is_wet): beams, heads, pillars, collars and
## braces. `relief` gives the heights, `origin` and `size_x` the place, as RetainingWalls.pieces.
static func pieces(walls: Array[TerrainRelief.Wall], relief: TerrainRelief, origin: Vector3i, size_x: int) -> Array[RetainingWalls.Piece]:
	var result: Array[RetainingWalls.Piece] = []
	# Corner → [scene point, top, ground, along, face] of the first wet wall ending there.
	var corners := {}
	for wall: TerrainRelief.Wall in walls:
		if not is_wet(wall, relief):
			continue
		var top := relief.scene_height(wall.top) - origin.z
		# The ground under either end (the water, or lava and swamp at their own height).
		var ground_a := relief.scene_height(wall.bottom_a) - origin.z
		var ground_b := relief.scene_height(wall.bottom_b) - origin.z
		var water := minf(ground_a, ground_b)
		if top - water < MIN_PIER:
			continue
		var a := RetainingWalls.corner_point(wall.a, origin, size_x)
		var b := RetainingWalls.corner_point(wall.b, origin, size_x)
		var along := b - a
		var face := Vector3(wall.outward.x, 0.0, -wall.outward.y)
		var middle := (a + b) * 0.5
		var shade := _shade(wall.a + wall.b)
		var turn := Basis(along, Vector3.UP, face)
		result.append(RetainingWalls.Piece.new(BEAM, Transform3D(turn, Vector3(middle.x, top - BEAM_HEIGHT, middle.z)), shade))
		for height: float in brace_heights(top - HEAD_HEIGHT, water):
			result.append(RetainingWalls.Piece.new(BEAM, Transform3D(turn, Vector3(middle.x, height, middle.z)),
				shade * RetainingWalls.FOOT_SHADE))
		for end: Array in [[wall.a, a, ground_a], [wall.b, b, ground_b]]:
			var key: Vector2i = end[0]
			if not corners.has(key):
				corners[key] = [end[1], top, end[2], along, face]
	for key: Vector2i in corners.keys():
		var corner: Array = corners[key]
		var point: Vector3 = corner[0]
		var top: float = corner[1]
		var water: float = corner[2]
		var along: Vector3 = corner[3]
		var face: Vector3 = corner[4]
		var turn := Basis(along, Vector3.UP, face)
		var shade := _shade(key * 3)
		var foot := water - PILLAR_SINK
		var stretch := pillar_stretch(top, water)
		var ground := relief.corner_pier(key.x, key.y)
		var pillar := RetainingWalls.Piece.new(PILLAR, Transform3D(Basis(along, Vector3(0.0, stretch, 0.0), face),
			Vector3(point.x, foot, point.z)), shade)
		pillar.tint = tint(PILLAR, ground)
		result.append(pillar)
		result.append(RetainingWalls.Piece.new(HEAD, Transform3D(turn, Vector3(point.x, top - HEAD_HEIGHT, point.z)), shade))
		var collar := RetainingWalls.Piece.new(COLLAR, Transform3D(turn, Vector3(point.x, water - COLLAR_WATERLINE, point.z)), 1.0)
		collar.tint = tint(COLLAR, ground)
		result.append(collar)
	return result


## How tall a pillar is stretched (its model is one cell tall): from PILLAR_SINK below the water
## up under the head below a floor at `top`.
static func pillar_stretch(top: float, water: float) -> float:
	return top - HEAD_HEIGHT - (water - PILLAR_SINK)


## The heights of the braces' feet between pillars reaching from the water up to `under` (under
## the heads): none below BRACE_FROM, else one per BRACE_FROM of height (at most MAX_BRACES),
## evenly spaced.
static func brace_heights(under: float, water: float) -> PackedFloat32Array:
	var result := PackedFloat32Array()
	var count := mini(floori((under - water) / BRACE_FROM), MAX_BRACES)
	for index: int in count:
		result.append(water + (under - water) * (index + 1) / (count + 1) - BEAM_HEIGHT * 0.5)
	return result


## The caisson under a prop standing in water, lava or swamp (`ground`) at scene point `at` (x,
## z); `water` is the scene height of the water or the ground there, `size` the caisson's size
## (caisson_size, CAISSON_POST …).
static func caisson(at: Vector3, water: float, size: float,
		ground: LevelRules.PierGround = LevelRules.PierGround.WATER) -> RetainingWalls.Piece:
	var cell := Vector2i(floori(at.x * 4.0), floori(at.z * 4.0))
	var piece := RetainingWalls.Piece.new(CAISSON, Transform3D(Basis.from_scale(Vector3(size, 1.0, size)),
		Vector3(at.x, water - CAISSON_SINK, at.z)), _shade(cell))
	piece.tint = tint(CAISSON, ground)
	return piece


## The caisson's size under a perimeter item (CAISSON_SIZES).
static func caisson_size(kind: Perimeter.Kind) -> float:
	return CAISSON_SIZES.get(kind, 1.0)


## The height a prop stands at: on a caisson's top in the water, else on the ground.
static func standing_height(ground: float, water: float, wet: bool) -> float:
	return water + CAISSON_SHOWS if wet else ground


static func _shade(key: Vector2i) -> float:
	var steps := 4096
	var value := float(PropRules.key_hash(key.x * 43 + 5, key.y * 11 + 9, steps)) / steps
	return 1.0 + RetainingWalls.SHADE_SPREAD * (2.0 * value - 1.0)
