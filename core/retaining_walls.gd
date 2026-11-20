class_name RetainingWalls
extends RefCounted
## Where the pieces of the retaining walls go (models from scripts/3d/models/retaining.py, drawn by
## RetainingLayer): for every retaining or cut wall of TerrainRelief (Wall.retaining) a panel between
## two pilasters, stretched from its top down past its foot and sheared where its top follows the
## slope, with a coping on it; a pilaster with its own coping on every corner along a wall (one per
## corner, the tallest wall there decides); a footing at the foot of a foundation wall, a gutter at
## the foot of a cut wall, weep pipes in walls tall enough and a railing on tall cut walls.
##
## Positions are scene coordinates as ColonyView puts cells (WorldGrid.to_scene, origin), heights
## the relief's scene heights. A piece's model looks towards its +Z (the wall's face, Wall.outward)
## and runs along +X from the wall's corner `a` to `b`.

const PANEL := "panel"
const CAP := "cap"
const COLUMN := "column"
const COLUMN_CAP := "column_cap"
const FOOTING := "footing"
const GUTTER := "gutter"
const DRAIN := "drain"
const RAIL := "rail"
const FILES: Array[String] = [PANEL, CAP, COLUMN, COLUMN_CAP, FOOTING, GUTTER, DRAIN, RAIL]
## Sizes of the models (cells), as retaining.py builds them.
const PILASTER := 0.16
const LENGTH := 1.0 - PILASTER
const CAP_HEIGHT := 0.04
const FOOTING_DEPTH := 0.2
const GUTTER_DEPTH := 0.06
## How far a wall reaches into the ground below its lowest foot (cells).
const SINK := 0.05
## How much of a footing and a gutter stands out of the ground (cells).
const FOOTING_SHOWS := 0.03
const GUTTER_SHOWS := 0.006
## The weep pipes sit this far above the higher foot (the drain model's foot; its pipes are 0.15
## above that), in walls at least DRAIN_FROM tall at both ends (cells).
const DRAIN_LIFT := 0.08
const DRAIN_FROM := 0.4
## Cut walls at least this tall at both ends carry a railing (cells).
const RAIL_FROM := 1.2
## Pilasters lower than this are left out (where a wall falls to the base at its end).
const MIN_COLUMN := 0.06
## Brightness of a piece: 1 ± this, by place; footings and gutters are darker (wet and dirty).
const SHADE_SPREAD := 0.06
const FOOT_SHADE := 0.85


## One placed model: its file (FILES), where it goes and its brightness.
class Piece:
	extends RefCounted
	var file := ""
	var placed := Transform3D.IDENTITY
	var shade := 1.0

	func _init(model: String, transform: Transform3D, brightness: float) -> void:
		file = model
		placed = transform
		shade = brightness


## The pieces of the retaining ones among `walls`; `relief` gives their heights, `origin` and
## `size_x` their place (scene height 0 at `origin.z`, as ColonyView draws).
static func pieces(walls: Array[TerrainRelief.Wall], relief: TerrainRelief, origin: Vector3i, size_x: int) -> Array[Piece]:
	var result: Array[Piece] = []
	# Corner → [scene point, top, foot, along, face] of the tallest wall ending there.
	var columns := {}
	for wall: TerrainRelief.Wall in walls:
		if not wall.retaining:
			continue
		var a := corner_point(wall.a, origin, size_x)
		var b := corner_point(wall.b, origin, size_x)
		var along := b - a
		var face := Vector3(wall.outward.x, 0.0, -wall.outward.y)
		var top_a := relief.scene_height(wall.top_a) - origin.z
		var top_b := relief.scene_height(wall.top_b) - origin.z
		var foot_a := relief.scene_height(wall.bottom_a) - origin.z
		var foot_b := relief.scene_height(wall.bottom_b) - origin.z
		var middle := (a + b) * 0.5
		var rise := top_b - top_a
		var top := (top_a + top_b) * 0.5
		var shade := _shade(wall.a + wall.b)
		var stretch := panel_stretch(top_a, top_b, foot_a, foot_b)
		var sheared := Basis(along + Vector3(0.0, rise, 0.0), Vector3.UP, face)
		result.append(Piece.new(PANEL, Transform3D(Basis(along + Vector3(0.0, rise, 0.0), Vector3(0.0, stretch, 0.0), face),
			Vector3(middle.x, top - stretch, middle.z)), shade))
		result.append(Piece.new(CAP, Transform3D(sheared, Vector3(middle.x, top, middle.z)), shade))
		var low_top := minf(top_a, top_b)
		var high_foot := maxf(foot_a, foot_b)
		if wall.cut:
			result.append(Piece.new(GUTTER, Transform3D(Basis(along, Vector3.UP, face),
				Vector3(middle.x, high_foot + GUTTER_SHOWS - GUTTER_DEPTH, middle.z)), shade * FOOT_SHADE))
			if low_top - high_foot >= RAIL_FROM:
				result.append(Piece.new(RAIL, Transform3D(sheared, Vector3(middle.x, top + CAP_HEIGHT, middle.z)), 1.0))
		else:
			var foot := (foot_a + foot_b) * 0.5
			result.append(Piece.new(FOOTING, Transform3D(Basis(along + Vector3(0.0, foot_b - foot_a, 0.0), Vector3.UP, face),
				Vector3(middle.x, foot + FOOTING_SHOWS - FOOTING_DEPTH, middle.z)), shade * FOOT_SHADE))
		if low_top - high_foot >= DRAIN_FROM:
			result.append(Piece.new(DRAIN, Transform3D(Basis(along, Vector3.UP, face),
				Vector3(middle.x, high_foot + DRAIN_LIFT, middle.z)), shade))
		for end: Array in [[wall.a, a, top_a, foot_a], [wall.b, b, top_b, foot_b]]:
			var key: Vector2i = end[0]
			var end_top: float = end[2]
			var end_foot: float = end[3]
			var known: Array = columns.get(key, [])
			if known.is_empty():
				columns[key] = [end[1], end_top, end_foot, along, face]
				continue
			var known_top: float = known[1]
			var known_foot: float = known[2]
			if end_top - end_foot > known_top - known_foot:
				columns[key] = [end[1], end_top, end_foot, along, face]
	for key: Vector2i in columns.keys():
		var column: Array = columns[key]
		var point: Vector3 = column[0]
		var top: float = column[1]
		var foot: float = column[2]
		if top - foot < MIN_COLUMN:
			continue
		var along: Vector3 = column[3]
		var face: Vector3 = column[4]
		var stretch := top - foot + SINK
		var shade := _shade(key * 3)
		result.append(Piece.new(COLUMN, Transform3D(Basis(along, Vector3(0.0, stretch, 0.0), face),
			Vector3(point.x, top - stretch, point.z)), shade))
		result.append(Piece.new(COLUMN_CAP, Transform3D(Basis(along, Vector3.UP, face), Vector3(point.x, top, point.z)), shade))
	return result


## How tall a panel is stretched (its model is one cell tall): from its top, which runs from
## `top_a` to `top_b`, down to SINK below the lower foot all along it, sheared as it is.
static func panel_stretch(top_a: float, top_b: float, foot_a: float, foot_b: float) -> float:
	return (top_a + top_b) * 0.5 - (minf(foot_a, foot_b) - SINK) + absf(top_b - top_a) * LENGTH * 0.5


## Scene point (at height 0) of a corner (absolute): the south-west corner of its cell.
static func corner_point(corner: Vector2i, origin: Vector3i, size_x: int) -> Vector3:
	var point := WorldGrid.to_scene(Vector3i(corner.x, corner.y, origin.z), origin, size_x) + Vector3(-0.5, 0.0, 0.5)
	point.y = 0.0
	return point


static func _shade(key: Vector2i) -> float:
	var steps := 4096
	var value := float(PropRules.key_hash(key.x * 31 + 7, key.y * 17 + 3, steps)) / steps
	return 1.0 + SHADE_SPREAD * (2.0 * value - 1.0)
