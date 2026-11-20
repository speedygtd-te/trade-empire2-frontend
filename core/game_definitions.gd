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
	## Runs without workers (power plants, storage, habitats …).
	var workforce_exempt := false
	## Workers per module for full staffing, and the lowest tier that can staff it.
	var required_workers := 0
	var base_tier := 1
	## Habitats only: the tier of their inhabitants and how many live in one; 0 otherwise.
	var housing_tier := 0
	var max_inhabitants := 0
	## Mass of one module (micro-units).
	var mass := 0
	## A storage module: it adds `storage_capacity` (micro-units) to self-use or to the cargo
	## area (layout `storageMode`).
	var storage := false
	var storage_capacity := 0
	## Drives: thrust and lift limit (micro-units), fuel per light-year of `fuel_type`, warp level
	## (space drives 1–4; 0 for ground drives and everything else).
	var thrust := 0
	var max_mass := 0
	var fuel_type := ""
	var fuel_rate := 0
	var warp_level := 0
	## Staircase or elevator: it takes two levels (its own and the shaft head above) and forms
	## shafts (`verticalAccess`).
	var vertical_access := false
	## Production change per level (`zLevel`), micro-percent (1 000 000 = 1 %); 0 when the module
	## does not care about its level. `z_prefer_high`: higher is better, otherwise deeper.
	var z_bonus_percent := 0
	var z_prefer_high := false
	## Who may hold it (`owners`, draft.39 in `/v2/definitions`: PLAYER, ENTERPRISE); absent in the
	## data = players only (older servers: derived, see `owners_derived`).
	var owners := PackedStringArray([GameDefinitions.OWNER_PLAYER])
	## The Enterprise Factory may build it.
	var enterprise_buildable := false
	## The host that makes its item (`manufacturedBy`: FACTORY, ENTERPRISE_FACTORY …); "" when none.
	var manufactured_by := ""
	## What it sends to its neighbours: [emission key, base strength in micro-units].
	var emissions: Array[Array] = []
	## How it reacts to emissions: [emission key, effect in micro-percent].
	var sensitivities: Array[Array] = []

	## The base strength of `emission` it sends (micro-units); 0 when it sends none.
	func emission_strength(emission: String) -> int:
		for entry: Array in emissions:
			if entry[0] == emission:
				return entry[1]
		return 0

	## Its effect per received unit of `emission` (micro-percent); 0 when it does not react.
	func sensitivity(emission: String) -> int:
		for entry: Array in sensitivities:
			if entry[0] == emission:
				return entry[1]
		return 0

	## Whether an owner of `kind` ("player"/"enterprise", any case) may build it.
	func allows(kind: String) -> bool:
		return owners.has(kind.to_upper())


## What unlocks a housing tier (2–5): enough inhabitants of the tier below, and enough of
## them living within reach of each emission (`emissionRequirements`).
class HousingTierDef:
	extends RefCounted
	var tier := 0
	var required_tier := 0
	var min_population := 0
	## Each entry: [emission key, share in micro-percent (100 000 000 = 100 %)].
	var emissions: Array[Array] = []


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
	## Who may hold it (`owners`, draft.39 in `/v2/definitions`); absent = players only.
	var owners := PackedStringArray([GameDefinitions.OWNER_PLAYER])
	var enterprise_buildable := false

	func allows(kind: String) -> bool:
		return owners.has(kind.to_upper())


## Owner kinds of `owners` (draft.37); a structure's `ownerKind` is the same in lower case.
const OWNER_PLAYER := "PLAYER"
const OWNER_ENTERPRISE := "ENTERPRISE"

## Players and enterprises may both hold these modules (SPEC-enterprise-flaggschiff 4.2: shared
## player modules and population basics). Only for the fallback below.
const SHARED_MODULES: PackedStringArray = [
	"LIFE_SUPPORT", "SOLAR_PANEL", "FUSION_REACTOR", "STAIRCASE", "ELEVATOR", "HYDROPONIC_BAY",
	"INTERSTELLAR_NAVIGATION", "BASIC_SCHOOL", "SANITATION_STATION", "GUARD_POST", "RECREATION_CORNER",
	"BOTANICAL_GARDEN",
]
## The host whose items are enterprise items (`manufacturedBy`).
const ENTERPRISE_HOST := "ENTERPRISE_FACTORY"
## Prefix of the enterprise's own hulls and modules.
const ENTERPRISE_PREFIX := "ENTERPRISE_"

## Whether it is known who may hold modules and hulls: from `owners` in the bundle, or derived
## (`owners_derived`). From draft.39 `/v2/definitions` sends `owners` and `enterpriseBuildable`
## with every module and hull and they are taken as they are. The draft.37/38 server leaves them
## out; only then the client derives them (fallback for older servers): hulls and modules whose
## key begins with ENTERPRISE_ or that the Enterprise Factory makes (`manufacturedBy`) are the
## enterprise's alone, SHARED_MODULES both, everything else the players'. The server decides
## (MODULE_NOT_ALLOWED).
var owners_known := false
var owners_derived := false
## SHA-256 of the backend's game data file.
var data_hash: String = ""
## Micro-units per unit (1 000 000).
var fixed_point_scale: int = 0
## The whole parsed bundle, for parts that are not modelled yet.
var bundle: Dictionary = {}
## Labs and techs (`research`); empty when the bundle has none.
var research := ResearchCatalog.new()
## Unlock conditions of the housing tiers 2–5, by tier.
var housing_tiers: Dictionary = {}

var _modules: Dictionary = {}
var _hulls: Dictionary = {}
var _resource_names: Dictionary = {}
## Resource key → [kind (NATURAL, PRODUCED, MODULE_ITEM, HULL_ITEM), utility].
var _resource_kinds: Dictionary = {}
var _blueprints: Dictionary = {}
## Emission key → decay per hull (micro-units).
var _emission_decay: Dictionary = {}


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
		var module_row := Wire.as_dict(entry)
		definitions.owners_known = definitions.owners_known or module_row.has("owners")
		var module := _read_module(module_row)
		if not module.key.is_empty():
			definitions._modules[module.key] = module
	for entry: Variant in _list(data.get("hulls")):
		var hull_row := Wire.as_dict(entry)
		definitions.owners_known = definitions.owners_known or hull_row.has("owners")
		var hull := _read_hull(hull_row)
		if not hull.key.is_empty():
			definitions._hulls[hull.key] = hull
	if not definitions.owners_known:
		definitions._derive_owners()
	for entry: Variant in _list(data.get("resources")):
		var resource := Wire.as_dict(entry)
		var key := Wire.as_string(resource.get("key"))
		if not key.is_empty():
			definitions._resource_names[key] = Wire.as_string(resource.get("displayName"))
			definitions._resource_kinds[key] = [Wire.as_string(resource.get("kind")), resource.get("utility") == true]
	for entry: Variant in _list(data.get("blueprints")):
		var blueprint := _read_blueprint(Wire.as_dict(entry))
		if not blueprint.key.is_empty():
			definitions._blueprints[blueprint.key] = blueprint
	definitions.research = ResearchCatalog.from_wire(Wire.as_dict(data.get("research")))
	for entry: Variant in _list(data.get("emissions")):
		var emission := Wire.as_dict(entry)
		var emission_key := Wire.as_string(emission.get("key"))
		if not emission_key.is_empty():
			definitions._emission_decay[emission_key] = Wire.as_int(emission.get("decayPerSegment"))
	for entry: Variant in _list(data.get("housingTiers")):
		var row := Wire.as_dict(entry)
		var tier := HousingTierDef.new()
		tier.tier = Wire.as_int(row.get("tier"))
		tier.required_tier = Wire.as_int(row.get("requiredTier"))
		tier.min_population = Wire.as_int(row.get("minPopulation"))
		for need: Variant in _list(row.get("emissionRequirements")):
			var pair := Wire.as_dict(need)
			tier.emissions.append([Wire.as_string(pair.get("emission")), Wire.as_int(pair.get("minCoveragePercent"))])
		definitions.housing_tiers[tier.tier] = tier
	return definitions


## Parses the bundle from its JSON text; null when it is not a definitions bundle.
static func from_text(text: String) -> GameDefinitions:
	return from_bundle(Wire.parse_object(text))


## The module type `key`, or null when the game data does not know it.
func module(key: String) -> ModuleDef:
	return _modules.get(key) as ModuleDef


## The hull type `key`, or null when the game data does not know it.
## How much an emission loses per hull it travels (micro-units); 0 when unknown.
func emission_decay(key: String) -> int:
	return Wire.as_int(_emission_decay.get(key))


func hull(key: String) -> HullDef:
	return _hulls.get(key) as HullDef


## The display name of resource `key`; "" when the game data does not know it.
func resource_name(key: String) -> String:
	return Wire.as_string(_resource_names.get(key))


## Whether an enterprise may tax resource `key`: raw materials and intermediates, no utilities
## (module and hull items are not taxable).
func is_taxable(key: String) -> bool:
	if not _resource_kinds.has(key):
		return false
	var entry: Array = _resource_kinds[key]
	var kind: String = entry[0]
	return (kind == "NATURAL" or kind == "PRODUCED") and entry[1] != true


## Every taxable resource, sorted by display name.
func taxable_resources() -> PackedStringArray:
	var keys: Array[String] = []
	for key: String in _resource_kinds.keys():
		if is_taxable(key):
			keys.append(key)
	keys.sort_custom(func(a: String, b: String) -> bool: return resource_name(a).naturalnocasecmp_to(resource_name(b)) < 0)
	return PackedStringArray(keys)


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


## Module types that form shafts (staircase, elevator) → true, for StructureLayout.
func vertical_types() -> Dictionary:
	var result: Dictionary = {}
	for entry: ModuleDef in _modules.values():
		if entry.vertical_access:
			result[entry.key] = true
	return result


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
	module.workforce_exempt = data.get("workforceExempt") == true
	var staff := Wire.as_dict(data.get("workforce"))
	module.required_workers = Wire.as_int(staff.get("requiredWorkers"))
	module.base_tier = maxi(1, Wire.as_int(staff.get("baseTier"), 1))
	var housing := Wire.as_dict(data.get("housing"))
	module.housing_tier = Wire.as_int(housing.get("housingTier"))
	module.max_inhabitants = Wire.as_int(housing.get("maxInhabitants"))
	module.mass = Wire.as_int(data.get("mass"))
	module.storage = data.get("storage") == true
	module.storage_capacity = Wire.as_int(data.get("storageCapacity"))
	module.thrust = Wire.as_int(data.get("thrust"))
	module.max_mass = Wire.as_int(data.get("maxMass"))
	module.fuel_type = Wire.as_string(data.get("fuelType"))
	module.fuel_rate = Wire.as_int(data.get("fuelRate"))
	module.warp_level = Wire.as_int(data.get("warpLevel"))
	module.vertical_access = data.get("verticalAccess") == true
	var level := Wire.as_dict(data.get("zLevel"))
	module.z_bonus_percent = Wire.as_int(level.get("bonusPerLevelPercent"))
	module.z_prefer_high = level.get("preferHigh") == true
	module.owners = _owners(data.get("owners"))
	module.enterprise_buildable = data.get("enterpriseBuildable") == true
	module.manufactured_by = Wire.as_string(data.get("manufacturedBy"))
	for entry: Variant in _list(data.get("emissions")):
		var row := Wire.as_dict(entry)
		var kind := Wire.as_string(row.get("emission"))
		if not kind.is_empty():
			module.emissions.append([kind, Wire.as_int(row.get("baseStrength"))])
	for entry: Variant in _list(data.get("sensitivities")):
		var row := Wire.as_dict(entry)
		var kind := Wire.as_string(row.get("emission"))
		if not kind.is_empty():
			module.sensitivities.append([kind, Wire.as_int(row.get("effectPercent"))])
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
	hull.owners = _owners(data.get("owners"))
	hull.enterprise_buildable = data.get("enterpriseBuildable") == true
	return hull


## The fallback when the bundle has no `owners` (see `owners_known`).
func _derive_owners() -> void:
	var enterprise_only := PackedStringArray([OWNER_ENTERPRISE])
	var both := PackedStringArray([OWNER_PLAYER, OWNER_ENTERPRISE])
	for hull: HullDef in _hulls.values():
		if hull.key.begins_with(ENTERPRISE_PREFIX):
			hull.owners = enterprise_only
	for module_def: ModuleDef in _modules.values():
		if module_def.key.begins_with(ENTERPRISE_PREFIX) or module_def.manufactured_by == ENTERPRISE_HOST:
			module_def.owners = enterprise_only
			module_def.enterprise_buildable = module_def.manufactured_by == ENTERPRISE_HOST
		elif SHARED_MODULES.has(module_def.key):
			module_def.owners = both
	owners_known = true
	owners_derived = true


## `owners` of a module or hull in upper case; players only when the data leaves it out.
static func _owners(value: Variant) -> PackedStringArray:
	var result := PackedStringArray()
	for entry: String in _strings(value):
		result.append(entry.to_upper())
	return result if not result.is_empty() else PackedStringArray([OWNER_PLAYER])
