class_name PathAccess
extends RefCounted
## Paths inside one structure: corridors, the entrance and how the levels hang together
## (Backend-V2 docs/SPEC-wege.md, decisions W1–W9). The server decides; the client reckons the
## same rules for the build preview (W8) and shows the state.
##
## - Walkable: a free INDOOR hull (a corridor, W3) and every cell of a shaft (staircase or
##   elevator, its floors and its head).
## - Ground level (draft.29): absolute level 0 for a structure on a surface, local level 0 for a
##   ship, vehicle, station or guest (StructureLayout.ground_level).
## - Entrance (W5a): a corridor on the ground level with at least one side (4 neighbours)
##   without a hull of the structure.
## - Reached: a search from the entrances through walkable cells, 8 neighbours within a level
##   (W1), up and down only along a shaft.
## - Required (W2): a module in an INDOOR hull that needs staff or houses inhabitants. It is
##   connected when one of its cells touches a reached cell by a side or a corner (W1).
## - A level is connected when it holds a reached cell (W5: transitive down to the ground level).
## - Building only must not make things worse (W6): the checks compare before and after and
##   refuse only new problems (a required module that would stand unconnected, one cut off, a
##   level cut off, the last entrance gone). Existing problems stay allowed.
## Ships, vehicles and stations follow the same rules (W7, W9). Cells and levels are local to
## the structure.

const UP := Vector3i(0, 0, 1)
## The eight neighbours within a level (W1).
const PLANE: Array[Vector3i] = [
	Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0), Vector3i(0, -1, 0),
	Vector3i(1, 1, 0), Vector3i(1, -1, 0), Vector3i(-1, 1, 0), Vector3i(-1, -1, 0),
]
## The four sides within a level (the entrance's open side).
const SIDES: Array[Vector3i] = [Vector3i(1, 0, 0), Vector3i(-1, 0, 0), Vector3i(0, 1, 0), Vector3i(0, -1, 0)]
## Id of a module a check places (not in the layout yet).
const NEW_MODULE := -1
## How many cells the quick placement check may visit for one spot before it falls back to a
## full search.
const LOCAL_LIMIT := 256


## What the paths need to know about a structure: a compact copy of its layout that the checks
## can change.
class Grid:
	extends RefCounted
	## Local cell → whether the hull there is INDOOR.
	var hulls: Dictionary = {}
	## Local cell → id of the module that covers it (footprints and shaft heads).
	var taken: Dictionary = {}
	## Every floor of a shaft by its cell: the floor and the cell above it are linked.
	var lifts: Dictionary = {}
	## Required modules: id → their cells.
	var required: Dictionary = {}
	## The level that counts as the ground: it needs an entrance (local).
	var ground: int = 0

	func copy() -> Grid:
		var other := Grid.new()
		other.ground = ground
		other.hulls = hulls.duplicate()
		other.taken = taken.duplicate()
		other.lifts = lifts.duplicate()
		other.required = required.duplicate()
		return other

	## A cell of a shaft: a floor or the cell above one.
	func is_shaft(cell: Vector3i) -> bool:
		return hulls.has(cell) and (lifts.has(cell) or lifts.has(cell - UP))

	## A free INDOOR hull.
	func is_corridor(cell: Vector3i) -> bool:
		return hulls.get(cell, false) == true and not taken.has(cell)

	func is_walkable(cell: Vector3i) -> bool:
		return is_corridor(cell) or is_shaft(cell)


## What a build would do to the paths.
class Check:
	extends RefCounted
	## OK, or NO_CORRIDOR, LEVEL_NOT_CONNECTED, NO_ENTRANCE or CUTS_OFF.
	var verdict: BuildRules.Verdict = BuildRules.Verdict.OK
	## Required modules (ids) and levels (local z) that are connected now and would be cut off.
	var modules: Array[int] = []
	var levels: Array[int] = []

	func ok() -> bool:
		return verdict == BuildRules.Verdict.OK


## A quick look at every spot of a level for one module type (placement_spots).
class Spots:
	extends RefCounted
	## Local origins where the module can stand, where it cannot (paths), and where it waits for
	## the level to be connected (W4).
	var good: Array[Vector3i] = []
	var bad: Array[Vector3i] = []
	var waiting: Array[Vector3i] = []
	## Local origin → Check, for every spot of the three lists.
	var checks: Dictionary = {}


## The cache of `of`: layout instance id → [signature, PathAccess].
static var _cache: Dictionary = {}
const _CACHE_SIZE := 8

var grid: Grid
## The structure's access as the server reported it with the layout; null without one.
var server: StructureLayout.Access = null
## Reckoned here: entrances, sorted.
var entrances: Array[Vector3i] = []
## Reached walkable cells → the cell they were reached from (an entrance: itself).
var reached: Dictionary = {}
## Required modules that touch no reached cell, by id.
var unconnected: Dictionary = {}
## Every level with a hull (local z) → whether it is connected.
var levels: Dictionary = {}
## Required connected module id → the reached cells it touches.
var _touching: Dictionary = {}
## Reached cell → the required modules that touch it.
var _touched_by: Dictionary = {}
## Level → how many reached cells it holds.
var _per_level: Dictionary = {}
var _entrance_set: Dictionary = {}
## Search tree in preorder (placement_spots): cell → [first index, one past its last descendant].
var _span: Dictionary = {}
## Answers already worked out for this state.
var _memo: Dictionary = {}


## The paths of a layout, worked out once per state of it (revision, hull and module count).
static func of(layout: StructureLayout, definitions: GameDefinitions) -> PathAccess:
	var key := layout.get_instance_id()
	var signature := "%d|%d|%d|%d" % [layout.rev, layout.hull_count(), layout.module_count(), definitions.get_instance_id()]
	var entry: Array = _cache.get(key, [])
	if entry.size() == 2 and entry[0] == signature:
		return entry[1] as PathAccess
	if _cache.size() >= _CACHE_SIZE:
		_cache.clear()
	var access := PathAccess.reckon(grid_of(layout, definitions))
	access.server = layout.access
	_cache[key] = [signature, access]
	return access


## The paths of a grid.
static func reckon(source: Grid) -> PathAccess:
	var access := PathAccess.new()
	access.grid = source
	access._search()
	return access


## Whether a module of `module_type` on a hull of `hull_type` has to reach a corridor (W2): it
## needs staff or houses inhabitants, and the hull is INDOOR. Shafts never.
static func requires_access(definitions: GameDefinitions, module_type: String, hull_type: String) -> bool:
	var module_def := definitions.module(module_type)
	var hull_def := definitions.hull(hull_type)
	if module_def == null or hull_def == null or module_def.vertical_access:
		return false
	if hull_def.module_positioning != "INDOOR":
		return false
	return module_def.required_workers > 0 or module_def.housing_tier > 0 or module_def.max_inhabitants > 0


## The grid of a layout.
static func grid_of(layout: StructureLayout, definitions: GameDefinitions) -> Grid:
	var result := Grid.new()
	result.ground = layout.ground_level()
	for cell: Vector3i in layout.hull_cells():
		var hull_def := definitions.hull(layout.hull_at(cell))
		result.hulls[cell] = hull_def != null and hull_def.module_positioning == "INDOOR"
	for placed: StructureLayout.Module in layout.modules():
		var cells := placed.cells()
		for cell: Vector3i in cells:
			result.taken[cell] = placed.module_id
		var module_def := definitions.module(placed.module_type)
		if module_def != null and module_def.vertical_access:
			result.lifts[placed.origin] = true
			if not result.taken.has(placed.origin + UP):
				result.taken[placed.origin + UP] = placed.module_id
		elif requires_access(definitions, placed.module_type, layout.hull_at(placed.origin)):
			result.required[placed.module_id] = cells
	return result


# --- the state --------------------------------------------------------------------------------
# What the player sees: the server's `access` when the layout brought one (it decides), otherwise
# what this client reckoned. The checks below always reckon on the grid.

## Whether a module reaches a corridor; true for modules that need not.
func module_connected(module_id: int) -> bool:
	if server != null:
		return not server.unreachable_modules.has(module_id)
	return not unconnected.has(module_id)


func is_required(module_id: int) -> bool:
	return grid.required.has(module_id)


## Whether a level (local z) is connected; false for a level without hulls.
func level_connected(z: int) -> bool:
	if server != null:
		return server.levels.get(z, false) == true
	return levels.get(z, false) == true


func is_entrance(cell: Vector3i) -> bool:
	if server != null:
		return server.entrances.has(cell)
	return _entrance_set.has(cell)


## Entrance hulls, sorted.
func entrance_cells() -> Array[Vector3i]:
	return server.entrances.duplicate() if server != null else entrances.duplicate()


## The level that counts as the ground (local).
func ground() -> int:
	return grid.ground


## The first side of an entrance without a hull (a step of SIDES); zero for no entrance.
func open_side(cell: Vector3i) -> Vector3i:
	if not is_entrance(cell):
		return Vector3i.ZERO
	for side: Vector3i in SIDES:
		if not grid.hulls.has(cell + side):
			return side
	return Vector3i.ZERO


## Corridors of a level (local z): [reached, not reached], each sorted.
func corridors(z: int) -> Array[Array]:
	var near: Array[Vector3i] = []
	var cut: Array[Vector3i] = []
	for cell: Vector3i in grid.hulls.keys():
		if cell.z == z and grid.is_corridor(cell):
			if reached.has(cell):
				near.append(cell)
			else:
				cut.append(cell)
	near.sort()
	cut.sort()
	return [near, cut]


## Ids of the required modules that reach no corridor, sorted.
func unconnected_modules() -> Array[int]:
	if server != null:
		return server.unreachable_modules.duplicate()
	var result: Array[int] = []
	for module_id: int in unconnected.keys():
		result.append(module_id)
	result.sort()
	return result


## Whether this client's own reckoning says the same as the server's `access`: ground level,
## entrances, connected levels and unreachable modules.
func agrees_with(reported: StructureLayout.Access) -> bool:
	if reported == null or reported.ground != grid.ground or reported.entrances != entrances:
		return false
	if reported.levels.size() != levels.size():
		return false
	for z: int in levels.keys():
		if not reported.levels.has(z) or (reported.levels[z] == true) != (levels[z] == true):
			return false
	var own: Array[int] = []
	for module_id: int in unconnected.keys():
		own.append(module_id)
	own.sort()
	return own == reported.unreachable_modules


# --- checks -----------------------------------------------------------------------------------

## A module of `module_type` with its smallest corner at `origin` (BuildRules checks hull and
## slot first). A required module needs its level connected (W4) and a reached cell beside it;
## no module may cut others off or close the last entrance (W6).
func check_place_module(definitions: GameDefinitions, module_type: String, origin: Vector3i, rotation: int = 0) -> Check:
	var key := "m|%s|%s|%d" % [module_type, origin, rotation]
	if _memo.has(key):
		return _memo[key] as Check
	var check := _check_place_module(definitions, module_type, origin, rotation)
	_memo[key] = check
	return check


## Removing the hull at `cell` (without a module): nothing connected may be cut off, the last
## entrance must stay.
func check_remove_hull(cell: Vector3i) -> Check:
	var key := "h|%s" % cell
	if _memo.has(key):
		return _memo[key] as Check
	var after := grid.copy()
	after.hulls.erase(cell)
	var check := _compare(PathAccess.reckon(after), false)
	_memo[key] = check
	return check


## Removing modules (a shaft goes as a whole: pass every floor). Freed cells only help, but a
## shaft that goes takes its links between the levels with it.
func check_remove_modules(module_ids: Array[int]) -> Check:
	var key := "r|%s" % [module_ids]
	if _memo.has(key):
		return _memo[key] as Check
	var after := grid.copy()
	var gone: Dictionary = {}
	for module_id: int in module_ids:
		gone[module_id] = true
		after.required.erase(module_id)
	for cell: Vector3i in grid.taken.keys():
		if gone.has(grid.taken[cell]):
			after.taken.erase(cell)
			after.lifts.erase(cell)
	var check := _compare(PathAccess.reckon(after), false)
	_memo[key] = check
	return check


## New hulls at `cells` (free; `indoor`: they are corridors). They can cover the open side of an
## entrance (W5a).
func check_place_hulls(cells: Array[Vector3i], indoor: bool) -> Check:
	var key := "p|%s|%s" % [cells, indoor]
	if _memo.has(key):
		return _memo[key] as Check
	var after := grid.copy()
	for cell: Vector3i in cells:
		if not after.hulls.has(cell):
			after.hulls[cell] = indoor
	var check := _compare(PathAccess.reckon(after), false)
	_memo[key] = check
	return check


## Every free INDOOR hull of level `z` as origin of a module of `module_type`: good where it can
## stand, bad where the paths forbid it (or the footprint does not fit on free INDOOR hulls),
## waiting where the level is not connected yet (a required module, W4). The same answers as
## check_place_module, found without a full search per spot where a local one settles it.
func placement_spots(definitions: GameDefinitions, module_type: String, z: int, rotation: int = 0) -> Spots:
	var key := "s|%s|%d|%d" % [module_type, z, rotation]
	if _memo.has(key):
		return _memo[key] as Spots
	var spots := Spots.new()
	var module_def := definitions.module(module_type)
	if module_def == null:
		_memo[key] = spots
		return spots
	_ensure_spans()
	var origins: Array[Vector3i] = []
	for cell: Vector3i in grid.hulls.keys():
		if cell.z == z and grid.is_corridor(cell):
			origins.append(cell)
	origins.sort()
	for origin: Vector3i in origins:
		var cells := BuildRules.footprint(module_def.size, origin, rotation)
		var fits := true
		for cell: Vector3i in cells:
			if not grid.is_corridor(cell):
				fits = false
				break
		var check: Check
		if not fits:
			check = Check.new()
			check.verdict = BuildRules.Verdict.HULL_OCCUPIED
		else:
			check = _quick_place(definitions, module_def, origin, cells, rotation)
		spots.checks[origin] = check
		if check.verdict == BuildRules.Verdict.LEVEL_NOT_CONNECTED or (check.verdict == BuildRules.Verdict.NO_ENTRANCE
				and entrances.is_empty()):
			spots.waiting.append(origin)
		elif check.ok():
			spots.good.append(origin)
		else:
			spots.bad.append(origin)
	_memo[key] = spots
	return spots


func _check_place_module(definitions: GameDefinitions, module_type: String, origin: Vector3i, rotation: int) -> Check:
	var module_def := definitions.module(module_type)
	if module_def == null:
		return Check.new()
	var cells := BuildRules.footprint(module_def.size, origin, rotation)
	var required := _requires(module_def, origin)
	var early := _level_check(required, origin.z)
	if early != null:
		return early
	var after := grid.copy()
	for cell: Vector3i in cells:
		after.taken[cell] = NEW_MODULE
	if module_def.vertical_access:
		after.lifts[origin] = true
		after.taken[origin + UP] = NEW_MODULE
	if required:
		after.required[NEW_MODULE] = cells
	return _compare(PathAccess.reckon(after), required)


## A required module on a level that is not connected (W4): LEVEL_NOT_CONNECTED, or NO_ENTRANCE
## on the ground level. Null when the level is fine or the module need not reach a corridor.
func _level_check(required: bool, z: int) -> Check:
	if not required or levels.get(z, false) == true:
		return null
	var check := Check.new()
	check.verdict = BuildRules.Verdict.NO_ENTRANCE if z == grid.ground else BuildRules.Verdict.LEVEL_NOT_CONNECTED
	return check


func _requires(module_def: GameDefinitions.ModuleDef, origin: Vector3i) -> bool:
	if module_def.vertical_access or grid.hulls.get(origin, false) != true:
		return false
	return module_def.required_workers > 0 or module_def.housing_tier > 0 or module_def.max_inhabitants > 0


## What changed from this state to `after`: only new problems count (W6).
func _compare(after: PathAccess, placed_required: bool) -> Check:
	var check := Check.new()
	if not entrances.is_empty() and after.entrances.is_empty():
		check.verdict = BuildRules.Verdict.NO_ENTRANCE
		return check
	if placed_required and after.unconnected.has(NEW_MODULE):
		check.verdict = BuildRules.Verdict.NO_CORRIDOR
		return check
	for module_id: int in grid.required.keys():
		if not unconnected.has(module_id) and after.grid.required.has(module_id) and after.unconnected.has(module_id):
			check.modules.append(module_id)
	for z: int in levels.keys():
		if levels[z] == true and after.levels.has(z) and after.levels[z] != true:
			check.levels.append(z)
	check.modules.sort()
	check.levels.sort()
	if not check.modules.is_empty() or not check.levels.is_empty():
		check.verdict = BuildRules.Verdict.CUTS_OFF
	return check


# --- the search -------------------------------------------------------------------------------

func _search() -> void:
	var walk: Dictionary = {}
	var found_levels: Dictionary = {}
	for cell: Vector3i in grid.hulls.keys():
		found_levels[cell.z] = true
		if grid.is_walkable(cell):
			walk[cell] = true
	for cell: Vector3i in walk.keys():
		if cell.z != grid.ground or not grid.is_corridor(cell):
			continue
		for side: Vector3i in SIDES:
			if not grid.hulls.has(cell + side):
				entrances.append(cell)
				_entrance_set[cell] = true
				break
	entrances.sort()

	var queue: Array[Vector3i] = []
	for cell: Vector3i in entrances:
		reached[cell] = cell
		queue.append(cell)
	var head := 0
	var none: Dictionary = {}
	while head < queue.size():
		var cell := queue[head]
		head += 1
		_per_level[cell.z] = _per_level.get(cell.z, 0) + 1
		for next: Vector3i in _links(cell, walk, none):
			if not reached.has(next):
				reached[next] = cell
				queue.append(next)

	for z: int in found_levels.keys():
		levels[z] = _per_level.get(z, 0) > 0
	for module_id: int in grid.required.keys():
		var cells: Array = grid.required[module_id]
		var touching: Array[Vector3i] = []
		for cell: Vector3i in cells:
			for step: Vector3i in PLANE:
				var next := cell + step
				if reached.has(next) and not touching.has(next):
					touching.append(next)
		if touching.is_empty():
			unconnected[module_id] = true
			continue
		_touching[module_id] = touching
		for next: Vector3i in touching:
			if not _touched_by.has(next):
				_touched_by[next] = []
			(_touched_by[next] as Array).append(module_id)


## Walkable cells linked to `cell`: 8 neighbours in its level, and along a shaft up and down.
## `blocked` cells count as gone.
func _links(cell: Vector3i, walk: Dictionary, blocked: Dictionary) -> Array[Vector3i]:
	var result: Array[Vector3i] = []
	for step: Vector3i in PLANE:
		var next := cell + step
		if walk.has(next) and not blocked.has(next):
			result.append(next)
	if grid.lifts.has(cell) and walk.has(cell + UP) and not blocked.has(cell + UP):
		result.append(cell + UP)
	if grid.lifts.has(cell - UP) and walk.has(cell - UP) and not blocked.has(cell - UP):
		result.append(cell - UP)
	return result


## Preorder spans of the search tree (each reached cell below the cell it was reached from).
func _ensure_spans() -> void:
	if not _span.is_empty() or reached.is_empty():
		return
	var children: Dictionary = {}
	for cell: Vector3i in reached.keys():
		var parent: Vector3i = reached[cell]
		if parent != cell:
			if not children.has(parent):
				children[parent] = []
			(children[parent] as Array).append(cell)
	var counter := 0
	for root: Vector3i in entrances:
		# Iterative preorder: [cell, whether its children are done].
		var stack: Array[Array] = [[root, false]]
		while not stack.is_empty():
			var top: Array = stack.pop_back()
			var cell: Vector3i = top[0]
			if top[1] == true:
				(_span[cell] as Array)[1] = counter
				continue
			_span[cell] = [counter, counter + 1]
			counter += 1
			stack.append([cell, true])
			for child: Variant in children.get(cell, []):
				stack.append([child, false])


## Whether the tree path from an entrance to `cell` (a reached cell) avoids every cell of `gone`:
## then `cell` stays reached without them.
func _clear_of(cell: Vector3i, gone: Array[Vector3i]) -> bool:
	var at: int = (_span[cell] as Array)[0]
	for blocked: Vector3i in gone:
		var span: Array = _span[blocked]
		var first: int = span[0]
		var after: int = span[1]
		if at >= first and at < after:
			return false
	return true


## check_place_module for a footprint of free INDOOR hulls, settled locally where it can be: the
## cells next to the footprint either find their way round it (to a cell whose tree path avoids
## it) or turn out cut off as a whole; a search that grows too large falls back to the full check.
func _quick_place(definitions: GameDefinitions, module_def: GameDefinitions.ModuleDef, origin: Vector3i,
		cells: Array[Vector3i], rotation: int) -> Check:
	var required := _requires(module_def, origin)
	var early := _level_check(required, origin.z)
	if early != null:
		return early
	var check := Check.new()
	# A shaft keeps its cells walkable and only adds links; it can take an entrance (its floor and
	# its head are no corridors any more).
	if module_def.vertical_access:
		var taken := 0
		for cell: Vector3i in [origin, origin + UP]:
			if _entrance_set.has(cell):
				taken += 1
		if not entrances.is_empty() and taken == entrances.size():
			check.verdict = BuildRules.Verdict.NO_ENTRANCE
		return check
	var footprint: Dictionary = {}
	var gone: Array[Vector3i] = []
	var lost_entrances := 0
	for cell: Vector3i in cells:
		footprint[cell] = true
		if reached.has(cell):
			gone.append(cell)
		if _entrance_set.has(cell):
			lost_entrances += 1
	if not entrances.is_empty() and lost_entrances == entrances.size():
		check.verdict = BuildRules.Verdict.NO_ENTRANCE
		return check
	# Reached cells around the footprint, and which of them are cut off without it.
	var ring: Array[Vector3i] = []
	for cell: Vector3i in cells:
		for step: Vector3i in PLANE:
			var next := cell + step
			if reached.has(next) and not footprint.has(next) and not ring.has(next):
				ring.append(next)
	var lost: Dictionary = {}
	if not gone.is_empty():
		var safe: Dictionary = {}
		for start: Vector3i in ring:
			if safe.has(start) or lost.has(start):
				continue
			var outcome := _settle(start, gone, footprint, safe, lost)
			if outcome < 0:
				return check_place_module(definitions, module_def.key, origin, rotation)
	if required:
		var touches := false
		for next: Vector3i in ring:
			if not lost.has(next):
				touches = true
				break
		if not touches:
			check.verdict = BuildRules.Verdict.NO_CORRIDOR
			return check
	# Modules that touch only cells the footprint takes or cuts off; levels left without a reached cell.
	var away: Dictionary = lost.duplicate()
	for cell: Vector3i in gone:
		away[cell] = true
	var seen: Dictionary = {}
	var per_level: Dictionary = {}
	for cell: Vector3i in away.keys():
		per_level[cell.z] = per_level.get(cell.z, 0) + 1
		for module_id: Variant in _touched_by.get(cell, []):
			if seen.has(module_id):
				continue
			seen[module_id] = true
			var still := false
			var touching: Array = _touching[module_id]
			for next: Vector3i in touching:
				if not away.has(next):
					still = true
					break
			if not still:
				var found_id: int = module_id
				check.modules.append(found_id)
	for z: int in per_level.keys():
		var away_here: int = per_level[z]
		var before: int = _per_level.get(z, 0)
		if before - away_here <= 0:
			check.levels.append(z)
	check.modules.sort()
	check.levels.sort()
	if not check.modules.is_empty() or not check.levels.is_empty():
		check.verdict = BuildRules.Verdict.CUTS_OFF
	return check


## From a reached cell next to a footprint: searches the cells it still reaches without the
## footprint until one of them keeps its tree path (all found are safe: 1), or none is left (all
## found are cut off: 0), or the search grows past LOCAL_LIMIT (-1).
func _settle(start: Vector3i, gone: Array[Vector3i], footprint: Dictionary, safe: Dictionary, lost: Dictionary) -> int:
	var walk := reached
	var found: Dictionary = {start: true}
	var queue: Array[Vector3i] = [start]
	var head := 0
	var outcome := 0
	while head < queue.size():
		var cell := queue[head]
		head += 1
		if safe.has(cell) or _clear_of(cell, gone):
			outcome = 1
			break
		if queue.size() > LOCAL_LIMIT:
			return -1
		for next: Vector3i in _links(cell, walk, footprint):
			if not found.has(next):
				found[next] = true
				queue.append(next)
	var into := safe if outcome == 1 else lost
	for cell: Vector3i in found.keys():
		into[cell] = true
	return outcome
