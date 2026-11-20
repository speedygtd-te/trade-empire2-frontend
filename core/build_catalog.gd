class_name BuildCatalog
extends RefCounted
## What the build palette offers: every hull and module the store holds, sorted into categories
## (hulls first, then the module categories of the game data), each sorted by name.

## Category of the hulls; the module categories are those of the definitions (`DefModule.category`).
const HULLS := "HULLS"
const OTHER := "OTHER"
## Order of the categories in the palette; unknown ones come last as OTHER.
const ORDER: PackedStringArray = [HULLS, "PRODUCTION", "COLONY", "LOGISTICS", "TRANSPORT", "MILITARY"]


class Entry:
	extends RefCounted
	## "hull:STARTER" or "module:PUMP" (the build tool).
	var tool := ""
	## The store item it is built from (`HULL_STARTER`, `PUMP_MODULE`), for its icon.
	var item := ""
	var display_name := ""
	var count := 0
	var category := ""
	## A short note the palette adds to the row (the production change on this level); "" for none.
	var note := ""


## The entries for a store: `units` maps an item (`HULL_STARTER`, `PUMP_MODULE` …) to the whole
## units on hand; items without units are left out, and so are items the structure's owner kind
## (`ownerKind`: "player" or "enterprise", draft.37 `owners`) may not build — as far as the game
## data says (`GameDefinitions.owners_known`).
static func entries(definitions: GameDefinitions, units: Dictionary, owner_kind: String = "player") -> Array[Entry]:
	var result: Array[Entry] = []
	if definitions == null:
		return result
	var kind := owner_kind if not owner_kind.is_empty() else "player"
	var by_owner := definitions.owners_known
	for key: String in definitions.hull_keys():
		var hull := definitions.hull(key)
		if by_owner and not hull.allows(kind):
			continue
		_add(result, "hull:" + key, hull.item, hull.display_name, Wire.as_int(units.get(hull.item)), HULLS)
	for key: String in definitions.module_keys():
		var module_def := definitions.module(key)
		if by_owner and not module_def.allows(kind):
			continue
		var category := module_def.category if ORDER.has(module_def.category) else OTHER
		_add(result, "module:" + key, module_def.item, module_def.display_name, Wire.as_int(units.get(module_def.item)), category)
	return result


## The categories that have entries, in palette order.
static func categories(list: Array[Entry]) -> PackedStringArray:
	var present := {}
	for entry: Entry in list:
		present[entry.category] = true
	var result := PackedStringArray()
	for category: String in ORDER:
		if present.has(category):
			result.append(category)
	if present.has(OTHER):
		result.append(OTHER)
	return result


## The entries of one category, by name.
static func in_category(list: Array[Entry], category: String) -> Array[Entry]:
	var result: Array[Entry] = []
	for entry: Entry in list:
		if entry.category == category:
			result.append(entry)
	result.sort_custom(func(a: Entry, b: Entry) -> bool: return a.display_name.naturalnocasecmp_to(b.display_name) < 0)
	return result


## The category of a tool among the entries; "" when it is not there.
static func category_of(list: Array[Entry], tool: String) -> String:
	for entry: Entry in list:
		if entry.tool == tool:
			return entry.category
	return ""


static func _add(result: Array[Entry], tool: String, item: String, display_name: String, count: int, category: String) -> void:
	if count <= 0:
		return
	var entry := Entry.new()
	entry.tool = tool
	entry.item = item
	entry.display_name = display_name
	entry.count = count
	entry.category = category
	result.append(entry)
