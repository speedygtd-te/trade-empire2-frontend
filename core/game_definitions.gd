class_name GameDefinitions
extends RefCounted
## The static game data of the backend (`GET /v2/definitions`): modules, hulls, resources …
##
## Only the parts the client uses so far are modelled; everything else stays reachable in
## `bundle`. Lookups take the keys of the game data (`PUMP`, `STARTER`, `IRON_PLATE`).


class ModuleDef:
	extends RefCounted
	var key: String = ""
	var display_name: String = ""
	## PRODUCTION, COLONY, LOGISTICS, TRANSPORT or MILITARY.
	var category: String = ""
	## Unrotated size in cells.
	var size: Vector3i = Vector3i.ONE
	## Slot types the module accepts: INDOOR, OUTDOOR, UNDER_WATER.
	var positioning: PackedStringArray = []
	## Inventory item the module is built from (`PUMP_MODULE`).
	var item: String = ""
	## Production comes from the blueprint set on the module.
	var blueprint_driven := false


class BlueprintDef:
	extends RefCounted
	var key: String = ""
	var display_name: String = ""
	## Module type that runs it.
	var host: String = ""
	## EXTRACTION, PROCESSING, PRODUCTION or MANUFACTURING.
	var category: String = ""
	## Each entry: [resource key, micro-units per hour].
	var inputs: Array[Array] = []
	var outputs: Array[Array] = []
	## Extraction only: the deposit the tile needs; "" otherwise.
	var required_tile_resource: String = ""
	## Gas collectors only: the gas the body's air must hold (at least 1 %); "" otherwise.
	var required_atmosphere_gas: String = ""
	## Works only in orbit (ORBITAL_*).
	var orbit_only := false
	## Usable from the start; otherwise it needs research.
	var basis := false


class HullDef:
	extends RefCounted
	var key: String = ""
	var display_name: String = ""
	## Slot type of a module on this hull; "" when the hull carries no module (DOCK).
	var module_positioning: String = ""
	## SURFACE, UNDERGROUND, ORBIT …
	var environments: PackedStringArray = []
	## Inventory item the hull is built from (`HULL_STARTER`).
	var item: String = ""


## SHA-256 of the backend's game data file.
var data_hash: String = ""
## Micro-units per unit (1 000 000).
var fixed_point_scale: int = 0
## The whole parsed bundle, for parts that are not modelled yet.
var bundle: Dictionary = {}

var _modules: Dictionary = {}
var _hulls: Dictionary = {}
var _resource_names: Dictionary = {}
var _blueprints: Dictionary = {}


## Reads a parsed bundle; null when it is not a definitions bundle.
static func from_bundle(data: Dictionary) -> GameDefinitions:
	var hash_text := Wire.as_string(data.get("dataHash"))
	if hash_text.is_empty() or typeof(data.get("modules")) != TYPE_ARRAY:
		return null
	var definitions := GameDefinitions.new()
	definitions.data_hash = hash_text
	definitions.fixed_point_scale = Wire.as_int(data.get("fixedPointScale"))
	definitions.bundle = data
	for entry: Variant in _list(data.get("modules")):
		var module := _read_module(Wire.as_dict(entry))
		if not module.key.is_empty():
			definitions._modules[module.key] = module
	for entry: Variant in _list(data.get("hulls")):
		var hull := _read_hull(Wire.as_dict(entry))
		if not hull.key.is_empty():
			definitions._hulls[hull.key] = hull
	for entry: Variant in _list(data.get("resources")):
		var resource := Wire.as_dict(entry)
		var key := Wire.as_string(resource.get("key"))
		if not key.is_empty():
			definitions._resource_names[key] = Wire.as_string(resource.get("displayName"))
	for entry: Variant in _list(data.get("blueprints")):
		var blueprint := _read_blueprint(Wire.as_dict(entry))
		if not blueprint.key.is_empty():
			definitions._blueprints[blueprint.key] = blueprint
	return definitions


## Parses the bundle from its JSON text; null when it is not a definitions bundle.
static func from_text(text: String) -> GameDefinitions:
	return from_bundle(Wire.parse_object(text))


## The module type `key`, or null when the game data does not know it.
func module(key: String) -> ModuleDef:
	return _modules.get(key) as ModuleDef


## The hull type `key`, or null when the game data does not know it.
func hull(key: String) -> HullDef:
	return _hulls.get(key) as HullDef


## The display name of resource `key`; "" when the game data does not know it.
func resource_name(key: String) -> String:
	return Wire.as_string(_resource_names.get(key))


## The blueprint `key`, or null when the game data does not know it.
func blueprint(key: String) -> BlueprintDef:
	return _blueprints.get(key) as BlueprintDef


## Every blueprint a module type can run, in the order of the game data.
func blueprints_for(module_type: String) -> Array[BlueprintDef]:
	var result: Array[BlueprintDef] = []
	for entry: BlueprintDef in _blueprints.values():
		if entry.host == module_type:
			result.append(entry)
	return result


## Every module and hull type, in the order of the game data.
func module_keys() -> PackedStringArray:
	return PackedStringArray(_modules.keys())


func hull_keys() -> PackedStringArray:
	return PackedStringArray(_hulls.keys())


func module_count() -> int:
	return _modules.size()


func hull_count() -> int:
	return _hulls.size()


func resource_count() -> int:
	return _resource_names.size()


static func _list(value: Variant) -> Array:
	if typeof(value) == TYPE_ARRAY:
		var list: Array = value
		return list
	return []


static func _strings(value: Variant) -> PackedStringArray:
	var result := PackedStringArray()
	for item: Variant in _list(value):
		if typeof(item) == TYPE_STRING:
			result.append(Wire.as_string(item))
	return result


static func _read_module(data: Dictionary) -> ModuleDef:
	var module := ModuleDef.new()
	module.key = Wire.as_string(data.get("key"))
	module.display_name = Wire.as_string(data.get("displayName"))
	module.category = Wire.as_string(data.get("category"))
	var size := Wire.as_dict(data.get("size"))
	module.size = Vector3i(
		maxi(1, Wire.as_int(size.get("x"), 1)),
		maxi(1, Wire.as_int(size.get("y"), 1)),
		maxi(1, Wire.as_int(size.get("z"), 1))
	)
	module.positioning = _strings(data.get("positioning"))
	module.item = Wire.as_string(data.get("item"), module.key + "_MODULE")
	module.blueprint_driven = data.get("blueprintDriven") == true
	return module


static func _read_blueprint(data: Dictionary) -> BlueprintDef:
	var blueprint := BlueprintDef.new()
	blueprint.key = Wire.as_string(data.get("key"))
	blueprint.display_name = Wire.as_string(data.get("displayName"))
	blueprint.host = Wire.as_string(data.get("host"))
	blueprint.category = Wire.as_string(data.get("category"))
	blueprint.inputs = _flows(data.get("inputs"))
	blueprint.outputs = _flows(data.get("outputs"))
	blueprint.required_tile_resource = Wire.as_string(data.get("requiredTileResource"))
	blueprint.required_atmosphere_gas = Wire.as_string(data.get("requiredAtmosphereGas"))
	blueprint.orbit_only = data.get("orbitOnly") == true
	blueprint.basis = data.get("basis") == true
	return blueprint


static func _flows(value: Variant) -> Array[Array]:
	var result: Array[Array] = []
	for entry: Variant in _list(value):
		var flow := Wire.as_dict(entry)
		var resource := Wire.as_string(flow.get("resource"))
		if not resource.is_empty():
			result.append([resource, Wire.as_int(flow.get("ratePerHour"))])
	return result


static func _read_hull(data: Dictionary) -> HullDef:
	var hull := HullDef.new()
	hull.key = Wire.as_string(data.get("key"))
	hull.display_name = Wire.as_string(data.get("displayName"))
	hull.module_positioning = Wire.as_string(data.get("modulePositioning"))
	hull.environments = _strings(data.get("environments"))
	hull.item = Wire.as_string(data.get("item"), "HULL_" + hull.key)
	return hull
