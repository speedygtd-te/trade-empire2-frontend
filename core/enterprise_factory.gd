class_name EnterpriseFactory
extends RefCounted
## The Enterprise Factory in the flagship (`GET/PUT /v2/enterprises/{id}/factory`, draft.37).
##
## Up to `max_lines` (4) lines, one per blueprint, each building `quantity` pieces from the
## enterprise inventory at double rate; a line ends when they are done. A PUT replaces every
## line; an unchanged line (same blueprint and quantity) keeps running. Amounts are micro-units.

const QUANTITY_MIN := 1
const QUANTITY_MAX := 1000000
const MAX_LINES_DEFAULT := 4


class Line:
	extends RefCounted
	var blueprint := ""
	var item := ""
	## Pieces ordered (whole units).
	var quantity := 0
	## Built so far (micro-units).
	var produced := 0
	var started_at := 0


class Recipe:
	extends RefCounted
	var blueprint := ""
	var item := ""
	## Cost per piece: [resource, micro-units].
	var inputs: Array[Array] = []
	## Pieces per hour of one line (micro-units, double rate included).
	var units_per_hour := 0
	## Researched (or needs no research).
	var unlocked := false
	## The tech that unlocks it; "" for the basics.
	var tech := ""


var enterprise_id := ""
var at := 0
var max_lines := MAX_LINES_DEFAULT
var lines: Array[Line] = []
var recipes: Array[Recipe] = []


static func from_wire(data: Dictionary) -> EnterpriseFactory:
	var view := EnterpriseFactory.new()
	view.enterprise_id = Wire.as_string(data.get("enterpriseId"))
	view.at = Wire.as_int(data.get("at"))
	view.max_lines = maxi(Wire.as_int(data.get("maxLines"), MAX_LINES_DEFAULT), 0)
	for value: Variant in _list(data.get("lines")):
		var row := Wire.as_dict(value)
		var line := Line.new()
		line.blueprint = Wire.as_string(row.get("blueprint"))
		line.item = Wire.as_string(row.get("item"))
		line.quantity = Wire.as_int(row.get("quantity"))
		line.produced = Wire.as_int(row.get("produced"))
		line.started_at = Wire.as_int(row.get("startedAt"))
		if not line.blueprint.is_empty():
			view.lines.append(line)
	for value: Variant in _list(data.get("recipes")):
		var row := Wire.as_dict(value)
		var recipe := Recipe.new()
		recipe.blueprint = Wire.as_string(row.get("blueprint"))
		recipe.item = Wire.as_string(row.get("item"))
		recipe.inputs = EnterpriseResearch.costs_from_wire(row.get("inputs"))
		recipe.units_per_hour = Wire.as_int(row.get("unitsPerHour"))
		recipe.unlocked = row.get("unlocked") == true
		recipe.tech = Wire.as_string(row.get("tech"))
		if not recipe.blueprint.is_empty():
			view.recipes.append(recipe)
	return view


func recipe(blueprint: String) -> Recipe:
	for entry: Recipe in recipes:
		if entry.blueprint == blueprint:
			return entry
	return null


## The recipes a line may use (unlocked), sorted by `name_of` (blueprint → shown name).
func offered(name_of: Callable) -> Array[Recipe]:
	var result: Array[Recipe] = []
	for entry: Recipe in recipes:
		if entry.unlocked:
			result.append(entry)
	result.sort_custom(func(a: Recipe, b: Recipe) -> bool:
		return str(name_of.call(a.blueprint)).naturalnocasecmp_to(str(name_of.call(b.blueprint))) < 0)
	return result


## How far a line is (0..1).
static func progress(line: Line, scale: int) -> float:
	if line.quantity <= 0:
		return 1.0
	return clampf(float(line.produced) / float(line.quantity * maxi(scale, 1)), 0.0, 1.0)


## Whole pieces a line has built.
static func pieces_done(line: Line, scale: int) -> int:
	@warning_ignore("integer_division")
	return mini(line.produced / maxi(scale, 1), line.quantity)


## The lines as an editable draft: [[blueprint, quantity], …].
func draft() -> Array[Array]:
	var result: Array[Array] = []
	for line: Line in lines:
		result.append([line.blueprint, line.quantity])
	return result


## Whether the draft differs from the lines that run.
func differs(edited: Array[Array]) -> bool:
	var now := draft()
	if now.size() != edited.size():
		return true
	for index: int in now.size():
		if str(now[index][0]) != str(edited[index][0]) or Wire.as_int(now[index][1]) != Wire.as_int(edited[index][1]):
			return true
	return false


## Why the draft cannot be saved: "" when it can, else "lines" (too many), "twice" (a blueprint
## in two lines), "quantity" (out of 1..1 000 000) or "locked" (not researched / unknown).
func draft_problem(edited: Array[Array]) -> String:
	if edited.size() > max_lines:
		return "lines"
	var seen: Dictionary = {}
	for entry: Array in edited:
		var key := str(entry[0])
		var amount := Wire.as_int(entry[1])
		if seen.has(key):
			return "twice"
		seen[key] = true
		if amount < QUANTITY_MIN or amount > QUANTITY_MAX:
			return "quantity"
		var found := recipe(key)
		if found == null or not found.unlocked:
			# A line that already runs may stay even if the server listed it otherwise.
			var running := false
			for line: Line in lines:
				running = running or line.blueprint == key
			if not running:
				return "locked"
	return ""


## Body of the PUT: every line with an integer quantity.
static func body(edited: Array[Array]) -> Dictionary:
	var rows: Array[Dictionary] = []
	for entry: Array in edited:
		rows.append({"blueprint": str(entry[0]), "quantity": clampi(Wire.as_int(entry[1]), QUANTITY_MIN, QUANTITY_MAX)})
	return {"lines": rows}


static func _list(value: Variant) -> Array:
	if typeof(value) == TYPE_ARRAY:
		var list: Array = value
		return list
	return []
