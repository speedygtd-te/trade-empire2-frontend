class_name BaseGrounds
extends RefCounted
## How the land around a base on the surface changes as the base grows (Rudi, 2026-11-19):
##
## | Stage   | from hulls     | change                                                          |
## |---------|----------------|-----------------------------------------------------------------|
## | START   | 0              | masts, radar, beacons (Perimeter); nature reaches the base      |
## | CLEARED | CLEARED_FROM   | no trees, stones or grass in a ring around the base (it widens) |
## | FENCED  | FENCED_FROM    | a fence outside the mast ring, open where the docks need a way  |
## | PAVED   | PAVED_FROM     | concrete from the base out to the fence                          |
## | WALLED  | WALLED_FROM    | a concrete wall with barbed wire instead of the fence           |
##
## Hulls: every hull of the base on and above the ground (stacked floors count once each).
## Purely cosmetic and client-side like the perimeter; the server knows nothing about it.
##
## Everything is a function of the cells (x wrapped to the body's width), so the same base looks
## the same on every device, and growing it changes the grounds only near the change (and wherever
## a threshold or the cleared radius steps up).
##
## The fence line is the closed ring of cells at Chebyshev distance FENCE_DISTANCE from the
## footprint that borders the open land (courtyards enclosed by the base get no fence of their
## own, they are paved instead). Where it passes in front of a dock it opens: a fence cell within
## FENCE_DISTANCE + GATE_REACH steps (Manhattan) of a dock is left out, and so is every cell
## another structure takes. The cells beside a gap carry gate posts.

enum Stage { START, CLEARED, FENCED, PAVED, WALLED }
enum Barrier { NONE, FENCE, WALL }

## Hulls from which a base reaches each stage (Rudi gave 7 500 and 10 000; 150 and 1 500 are a
## proposal).
const CLEARED_FROM := 150
const FENCED_FROM := 1500
const PAVED_FROM := 7500
const WALLED_FROM := 10000
## The fence runs this far from the footprint: two cells outside the mast ring (Perimeter's outer
## ring is at 2).
const FENCE_DISTANCE := 4
## Cleared ring: CLEAR_BASE + CLEAR_PER_ROOT · √hulls cells wide (rounded down), at most
## CLEAR_MAX; around 150 hulls 3, 1 500 hulls 5, 7 500 hulls 10, 10 000 hulls 12. One ring
## further out about half of the cells are cleared too, so the edge of the wild is ragged.
const CLEAR_BASE := 2
const CLEAR_PER_ROOT := 0.1
const CLEAR_MAX := 12
## The fence's gap before a dock reaches this far to each side of it (as the inner ring's
## Perimeter.DOCK_CLEARANCE).
const GATE_REACH := Perimeter.DOCK_CLEARANCE
## Bits of Post.links: the neighbouring fence cell in +y, +x, −y, −x.
const NORTH := 1
const EAST := 2
const SOUTH := 4
const WEST := 8
const _STEPS := {NORTH: Vector2i(0, 1), EAST: Vector2i(1, 0), SOUTH: Vector2i(0, -1), WEST: Vector2i(-1, 0)}


## One cell of the fence line.
class Post:
	extends RefCounted
	## Absolute cell (x wrapped into the body's width).
	var cell := Vector2i.ZERO
	## Which neighbours (NORTH, EAST, SOUTH, WEST) the fence runs on to.
	var links := 0
	## The fence ends here at a gap (a dock's way out, another structure): a gate post.
	var gate := false


## What the grounds of one base look like.
class Plan:
	extends RefCounted
	var stage: Stage = Stage.START
	var barrier: Barrier = Barrier.NONE
	## Width of the cleared ring (0: nature reaches the base).
	var clear_radius := 0
	## Cells without trees, stones and grass (x wrapped), row by row.
	var cleared: Array[Vector2i] = []
	## The fence or wall, cell by cell, row by row (empty below FENCED_FROM).
	var posts: Array[Post] = []
	## Concrete cells between the footprint and the fence, fence included (empty below PAVED_FROM).
	var paved: Array[Vector2i] = []


## The stage of a base with this many hulls on and above the ground.
static func stage(hulls: int) -> Stage:
	if hulls >= WALLED_FROM:
		return Stage.WALLED
	if hulls >= PAVED_FROM:
		return Stage.PAVED
	if hulls >= FENCED_FROM:
		return Stage.FENCED
	if hulls >= CLEARED_FROM:
		return Stage.CLEARED
	return Stage.START


## What encloses a base of this stage.
static func barrier(of_stage: Stage) -> Barrier:
	if of_stage == Stage.WALLED:
		return Barrier.WALL
	if of_stage >= Stage.FENCED:
		return Barrier.FENCE
	return Barrier.NONE


## Width of the ring cleared of nature around a base with this many hulls (0 before CLEARED).
static func clear_radius(hulls: int) -> int:
	if hulls < CLEARED_FROM:
		return 0
	return mini(CLEAR_MAX, CLEAR_BASE + floori(sqrt(float(hulls)) * CLEAR_PER_ROOT))


## The grounds of one base. `footprint`: its hull cells on and above the ground (absolute x, y; x
## may run past the seam; a cell stacked on several floors appears once per hull, which counts
## them); `occupied`: cells taken by anything else (other structures, guests): nothing is drawn
## there; `size_x`: width of the body (x wraps; 0 or less: it does not); `docks`: its dock cells.
static func plan(footprint: Array[Vector2i], occupied: Array[Vector2i], size_x: int,
		docks: Array[Vector2i] = []) -> Plan:
	var result := Plan.new()
	if footprint.is_empty():
		return result
	var hulls := footprint.size()
	result.stage = stage(hulls)
	result.barrier = barrier(result.stage)
	result.clear_radius = clear_radius(hulls)
	var paving := result.stage >= Stage.PAVED
	var reach := result.clear_radius + 1 if result.clear_radius > 0 else 0
	if result.barrier != Barrier.NONE:
		reach = maxi(reach, FENCE_DISTANCE + 1)
	if reach == 0:
		return result

	var reference := footprint[0].x
	var own: Dictionary = {}
	for cell: Vector2i in footprint:
		own[Vector2i(WorldGrid.unwrap_x(cell.x, reference, size_x), cell.y)] = true
	var blocked: Dictionary = {}
	for cell: Vector2i in occupied:
		blocked[_key(cell, size_x)] = true

	# Chebyshev distance from the footprint, out to `reach`: a breadth-first walk over the eight
	# neighbours, started from the footprint's edge cells.
	var distance: Dictionary = {}
	var frontier: Array[Vector2i] = []
	for cell: Vector2i in own.keys():
		frontier.append(cell)
	for step: int in range(1, reach + 1):
		var next: Array[Vector2i] = []
		for cell: Vector2i in frontier:
			for dy: int in [-1, 0, 1]:
				for dx: int in [-1, 0, 1]:
					var at := cell + Vector2i(dx, dy)
					if not own.has(at) and not distance.has(at):
						distance[at] = step
						next.append(at)
		frontier = next

	var low := Vector2i(1 << 30, 1 << 30)
	var high := -low
	for cell: Vector2i in own.keys():
		low = low.min(cell)
		high = high.max(cell)
	low -= Vector2i(reach + 1, reach + 1)
	high += Vector2i(reach + 1, reach + 1)

	# Cleared: the ring of clear_radius, and about every second cell of the ring beyond.
	if result.clear_radius > 0:
		for y: int in range(low.y, high.y + 1):
			for x: int in range(low.x, high.x + 1):
				var at := Vector2i(x, y)
				var away: int = distance.get(at, 0)
				if away == 0:
					continue
				var key := _key(at, size_x)
				if blocked.has(key):
					continue
				if away <= result.clear_radius \
						or (away == result.clear_radius + 1 and PropRules.key_hash(key.x * 43 + 7, key.y * 61 + 29, 2) == 0):
					result.cleared.append(key)

	if result.barrier == Barrier.NONE:
		return result

	# The open land: cells farther than the fence that are joined to the land outside (a walk over
	# the four neighbours from the corner of the box around everything).
	var outside: Dictionary = {low: true}
	var open: Array[Vector2i] = [low]
	while not open.is_empty():
		var cell: Vector2i = open.pop_back()
		for step: Vector2i in _STEPS.values():
			var at: Vector2i = cell + step
			if at.x < low.x or at.y < low.y or at.x > high.x or at.y > high.y or outside.has(at) or own.has(at):
				continue
			var away: int = distance.get(at, reach + 1)
			if away <= FENCE_DISTANCE:
				continue
			outside[at] = true
			open.append(at)

	# The fence line: cells at FENCE_DISTANCE touching the open land (diagonally too: an inner
	# corner of the line touches it only there).
	var line: Dictionary = {}
	var docks_near: Array[Vector2i] = []
	for dock: Vector2i in docks:
		docks_near.append(Vector2i(WorldGrid.unwrap_x(dock.x, reference, size_x), dock.y))
	for y: int in range(low.y, high.y + 1):
		for x: int in range(low.x, high.x + 1):
			var at := Vector2i(x, y)
			var away: int = distance.get(at, 0)
			if away != FENCE_DISTANCE or not _touches(outside, at):
				continue
			var gap := blocked.has(_key(at, size_x))
			for dock: Vector2i in docks_near:
				if absi(dock.x - at.x) + absi(dock.y - at.y) <= FENCE_DISTANCE + GATE_REACH:
					gap = true
					break
			line[at] = gap
	for y: int in range(low.y, high.y + 1):
		for x: int in range(low.x, high.x + 1):
			var at := Vector2i(x, y)
			if not line.has(at) or line[at] == true:
				continue
			var post := Post.new()
			post.cell = _key(at, size_x)
			for bit: int in _STEPS.keys():
				var beside: Vector2i = at + (_STEPS[bit] as Vector2i)
				if line.has(beside):
					if line[beside] == true:
						post.gate = true
					else:
						post.links |= bit
			result.posts.append(post)

	if paving:
		for y: int in range(low.y, high.y + 1):
			for x: int in range(low.x, high.x + 1):
				var at := Vector2i(x, y)
				if own.has(at) or outside.has(at):
					continue
				var key := _key(at, size_x)
				if not blocked.has(key):
					result.paved.append(key)
	return result


## Whether a cell has a neighbour (of the eight) in `cells`.
static func _touches(cells: Dictionary, at: Vector2i) -> bool:
	for dy: int in [-1, 0, 1]:
		for dx: int in [-1, 0, 1]:
			if (dx != 0 or dy != 0) and cells.has(at + Vector2i(dx, dy)):
				return true
	return false


static func _key(cell: Vector2i, size_x: int) -> Vector2i:
	return Vector2i(WorldGrid.wrap_x(cell.x, size_x), cell.y)
