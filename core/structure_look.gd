class_name StructureLook
extends RefCounted
## What a structure shows from outside. A closed structure (the normal view of the surface)
## shows its indoor hulls as shut containers and hides the modules in them; only open platforms,
## docks and the modules standing on them stay visible. Opening the structure (to build or
## edit) shows every module on its floor plate. Visual only.


## Whether a hull is shut from outside: it hosts indoor modules.
static func hull_closed(definitions: GameDefinitions, hull_type: String) -> bool:
	if definitions == null:
		return false
	var hull := definitions.hull(hull_type)
	return hull != null and hull.module_positioning == "INDOOR"


## The model of a hull type (game/world/models/<key>.glb): its floor plate ("hull_starter"), or
## shut (*shut*) the container seen from outside ("hull_starter_closed"). A type without its own
## model borrows hull_fallback.
static func hull_model(hull_type: String, shut: bool) -> String:
	return "hull_" + hull_type.to_lower() + ("_closed" if shut else "")


## The model a hull type without its own borrows: the standard container shut, the starter's
## floor plate open.
static func hull_fallback(shut: bool) -> String:
	return "hull_standard_closed" if shut else "hull_starter"


## Whether a module works in the open (it may stand on an outdoor slot): solar panels, pumps …
static func module_outdoor(definitions: GameDefinitions, module_type: String) -> bool:
	if definitions == null:
		return false
	var module_def := definitions.module(module_type)
	return module_def != null and module_def.positioning.has("OUTDOOR")


## Whether a cell (local) shows a shut container on a closed structure: its hull is an indoor
## hull and no outdoor module stands on it (an outdoor module keeps its cell open, also on an
## indoor hull, as on the starter colony).
static func cell_closed(layout: StructureLayout, definitions: GameDefinitions, cell: Vector3i) -> bool:
	if not hull_closed(definitions, layout.hull_at(cell)):
		return false
	var placed := layout.module_at(cell)
	return placed == null or not module_outdoor(definitions, placed.module_type)


## Whether a module shows on a closed structure: it does not stand in a shut hull.
static func module_visible_closed(layout: StructureLayout, definitions: GameDefinitions,
		placed: StructureLayout.Module) -> bool:
	return not cell_closed(layout, definitions, placed.origin)


## Number of modules still under construction.
static func modules_building(layout: StructureLayout) -> int:
	var count := 0
	for placed: StructureLayout.Module in layout.modules():
		if placed.is_building():
			count += 1
	return count
