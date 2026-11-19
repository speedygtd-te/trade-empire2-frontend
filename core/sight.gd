class_name Sight
extends RefCounted
## What the player has discovered (draft.25, fog of war): `GET /v2/sight` and
## `GET /v2/structures/{id}/telescopes`.
##
## The server keeps spheres ("observations"): centre and radius in light years; every system
## inside one of them is discovered for good. They come from home and from every system an own
## structure reached (radius 0: exactly that system) and from effective telescopes (radius =
## range). The client only draws them and previews a telescope upgrade; the server decides.

## Module types that are telescopes (contract `TelescopeView.moduleType`).
const TELESCOPE_TYPES: PackedStringArray = ["TELESCOPE_MODULE", "SPACE_TELESCOPE_MODULE"]
const SOURCE_TELESCOPE := "telescope"
## Highest telescope level (contract: 1 … 20).
const MAX_LEVEL := 20

## Why an upgrade cannot be sent now (UPGRADE_OK: it can).
enum Block { UPGRADE_OK, MAX_LEVEL, BUILDING, RUNNING, STOCK }


## One sphere of discovered space.
class Observation:
	extends RefCounted
	## Centre in light years.
	var centre := Vector3.ZERO
	## Radius in light years; 0 = exactly the system at the centre.
	var radius_ly := 0.0
	## Game time (ms) since when it exists.
	var since := 0
	## "home", "structure" or "telescope".
	var source := ""

	func is_telescope() -> bool:
		return source == Sight.SOURCE_TELESCOPE


## One resource of an upgrade's cost (micro-units).
class Cost:
	extends RefCounted
	var resource := ""
	var amount := 0


## One telescope module with its level, range and next level.
class Telescope:
	extends RefCounted
	var structure_id := 0
	var module_id := 0
	var module_type := ""
	## "ground" or "space".
	var kind := ""
	## Cell of the module in its structure (local coordinates, as in the layout).
	var cell := Vector3i.ZERO
	var level := 1
	var range_ly := 0.0
	## Active, its structure at rest and its power fully covered: only then it discovers.
	var effective := false
	## Running upgrade: target level (0 = none) and when it completes (game ms).
	var upgrade_to := 0
	var completes_at := 0
	## The next level (0 at the highest level), its range, duration (ms) and cost.
	var next_level := 0
	var next_range_ly := 0.0
	var next_duration_ms := 0
	var next_cost: Array[Cost] = []

	func is_upgrading() -> bool:
		return upgrade_to > 0

	func has_next() -> bool:
		return next_level > 0

	## The cost resources the store lacks; `stock` maps item keys to micro-units.
	func lacking(stock: Dictionary) -> PackedStringArray:
		var result := PackedStringArray()
		for cost: Cost in next_cost:
			if Wire.as_int(stock.get(cost.resource)) < cost.amount:
				result.append(cost.resource)
		return result

	## Why an upgrade cannot start: highest level, the module still being built, an upgrade
	## running, the store short of the cost (only when `stock_known`). The server checks again.
	func upgrade_block(building: bool, stock: Dictionary, stock_known: bool) -> Sight.Block:
		if not has_next():
			return Sight.Block.MAX_LEVEL
		if building:
			return Sight.Block.BUILDING
		if is_upgrading():
			return Sight.Block.RUNNING
		if stock_known and not lacking(stock).is_empty():
			return Sight.Block.STOCK
		return Sight.Block.UPGRADE_OK


var observations: Array[Observation] = []
var telescopes: Array[Telescope] = []


static func is_telescope(module_type: String) -> bool:
	return TELESCOPE_TYPES.has(module_type)


## Light years as players read them: whole numbers from 10 up ("14", "1 442"), one decimal below
## ("9.8").
static func ly_text(ly: float) -> String:
	return AmountFormat.units(roundi(ly)) if ly >= 10.0 else String.num(ly, 1)


## A `SightResponse`; missing lists stay empty.
static func from_wire(data: Dictionary) -> Sight:
	var sight := Sight.new()
	var raw: Array = data.get("observations") if typeof(data.get("observations")) == TYPE_ARRAY else []
	for item: Variant in raw:
		var observation := observation_from_wire(Wire.as_dict(item))
		if observation != null:
			sight.observations.append(observation)
	sight.telescopes = telescopes_from_wire(data)
	return sight


## An `ObservationView`; null without a centre.
static func observation_from_wire(data: Dictionary) -> Observation:
	if typeof(data.get("center")) != TYPE_DICTIONARY:
		return null
	var observation := Observation.new()
	observation.centre = GalaxySystems.vector(data.get("center"))
	observation.radius_ly = maxf(SystemMap.number(data.get("radiusLy")), 0.0)
	observation.since = Wire.as_int(data.get("since"))
	observation.source = Wire.as_string(data.get("source"))
	return observation


## The `telescopes` list of a `SightResponse` or `StructureTelescopesResponse`.
static func telescopes_from_wire(data: Dictionary) -> Array[Telescope]:
	var result: Array[Telescope] = []
	var raw: Array = data.get("telescopes") if typeof(data.get("telescopes")) == TYPE_ARRAY else []
	for item: Variant in raw:
		var telescope := telescope_from_wire(Wire.as_dict(item))
		if telescope != null:
			result.append(telescope)
	return result


## A `TelescopeView`; null without a module id.
static func telescope_from_wire(data: Dictionary) -> Telescope:
	var telescope := Telescope.new()
	telescope.module_id = Wire.as_int(data.get("moduleId"))
	if telescope.module_id == 0:
		return null
	telescope.structure_id = Wire.as_int(data.get("structureId"))
	telescope.module_type = Wire.as_string(data.get("moduleType"))
	telescope.kind = Wire.as_string(data.get("kind"))
	telescope.cell = Vector3i(Wire.as_int(data.get("x")), Wire.as_int(data.get("y")), Wire.as_int(data.get("z")))
	telescope.level = clampi(Wire.as_int(data.get("level"), 1), 1, MAX_LEVEL)
	telescope.range_ly = maxf(SystemMap.number(data.get("rangeLy")), 0.0)
	telescope.effective = data.get("effective") == true
	var upgrade := Wire.as_dict(data.get("upgrade"))
	telescope.upgrade_to = Wire.as_int(upgrade.get("to"))
	telescope.completes_at = Wire.as_int(upgrade.get("completesAt"))
	var next := Wire.as_dict(data.get("next"))
	telescope.next_level = Wire.as_int(next.get("level"))
	telescope.next_range_ly = maxf(SystemMap.number(next.get("rangeLy")), 0.0)
	telescope.next_duration_ms = maxi(Wire.as_int(next.get("durationMs")), 0)
	var costs: Array = next.get("cost") if typeof(next.get("cost")) == TYPE_ARRAY else []
	for item: Variant in costs:
		var raw := Wire.as_dict(item)
		var cost := Cost.new()
		cost.resource = Wire.as_string(raw.get("resource"))
		cost.amount = Wire.as_int(raw.get("amount"))
		if not cost.resource.is_empty() and cost.amount > 0:
			telescope.next_cost.append(cost)
	return telescope


## The telescopes by module id.
static func by_module(list: Array[Telescope]) -> Dictionary:
	var result := {}
	for telescope: Telescope in list:
		result[telescope.module_id] = telescope
	return result


## The farthest range of an effective telescope (light years); 0 when none sees now.
func best_range_ly() -> float:
	var best := 0.0
	for telescope: Telescope in telescopes:
		if telescope.effective:
			best = maxf(best, telescope.range_ly)
	return best


## How many telescopes do not discover anything right now (power, motion, being built).
func idle_count() -> int:
	var count := 0
	for telescope: Telescope in telescopes:
		if not telescope.effective:
			count += 1
	return count


## Whether a point (light years) lies in discovered space.
func covers(point_ly: Vector3) -> bool:
	for observation: Observation in observations:
		if point_ly.distance_to(observation.centre) <= observation.radius_ly:
			return true
	return false


# --- drawing on the galaxy map (seen from above, z left out) ---------------------------------

## Radius on screen (px) of a sphere of `radius_ly` at a zoom of `units_per_px`.
static func radius_px(radius_ly: float, ly_per_unit: float, units_per_px: float) -> float:
	if ly_per_unit <= 0.0 or units_per_px <= 0.0:
		return 0.0
	return radius_ly / ly_per_unit / units_per_px


## The circles worth drawing, as Vector4(x px, y px, radius px, kind): those that reach into
## `view` (with `margin` px around), the largest first, at most `limit`. A circle smaller than
## `min_px` grows to it, so far out a sphere stays a findable mark.
static func pick_circles(circles: Array[Vector4], view: Rect2, margin: float, limit: int, min_px: float) -> Array[Vector4]:
	var room := view.grow(margin)
	var kept: Array[Vector4] = []
	for circle: Vector4 in circles:
		var grown := Vector4(circle.x, circle.y, maxf(circle.z, min_px), circle.w)
		var nearest := Vector2(clampf(grown.x, room.position.x, room.end.x), clampf(grown.y, room.position.y, room.end.y))
		if nearest.distance_to(Vector2(grown.x, grown.y)) <= grown.z:
			kept.append(grown)
	kept.sort_custom(func(a: Vector4, b: Vector4) -> bool: return a.z > b.z)
	if kept.size() > limit:
		kept.resize(maxi(limit, 0))
	return kept


## How strongly the fog veils undiscovered space at a visible radius (units): `near` once real
## systems show, fading to `far` at `whole` (the whole galaxy), so the galaxy's art stays.
static func veil_share(visible: float, systems_from: float, whole: float, near: float, far: float) -> float:
	if visible <= systems_from or whole <= systems_from:
		return near
	var t := clampf(log(visible / systems_from) / log(whole / systems_from), 0.0, 1.0)
	return lerpf(near, far, t)
