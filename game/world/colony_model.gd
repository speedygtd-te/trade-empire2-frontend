class_name ColonyModel
extends Node
## The data of the colony on screen: the structure's layout and inventory, the body's grid and
## the surface around the camera. Loads them, keeps them current from the event channel and
## sends build batches.
##
## The home structure keeps its guests (structures docked on its dock hulls, DockRules) as
## child models of the same class: each has its own layout, store and production, while the
## body, the surface and sending build batches stay with the home structure. A guest's
## layout loads at once; its store and production once it is selected (`activate`). Signals of
## a guest are repeated by the home structure, so listeners connect once.

signal layout_changed
signal inventory_changed
## The rate solution (production) or the usable recipes changed.
signal production_changed
## A surface patch arrived; it covers `request`.
signal surface_loaded(request: SurfaceBlocks.Request, patch: SurfacePatch)
## A patch of an underground level (z < 0) arrived (cutaway view).
signal level_surface_loaded(z: int, request: SurfaceBlocks.Request)
## The deposits of some cells arrived (ground_cell).
signal deposits_loaded
## Loading the colony failed; `error` says why.
signal load_failed(error: ApiError)
## Everything needed to draw the colony is there.
signal ready_to_show
## A guest was founded or removed, or its name arrived.
signal guests_changed
## Research, labs or their progress changed (also when loading research failed).
signal research_changed
## A research of the player is done: the tech key.
signal research_completed(tech: String)

## How many surface blocks around the camera are kept loaded.
const SURFACE_RADIUS := 2
## Deposits are loaded only where the player looks, in small blocks (a cell carries a dozen).
const DEPOSIT_BLOCK := 4

var structure_id := 0
var structure_name := ""
## The structure this one is docked on; null for the home structure.
var host: ColonyModel = null
## Guests docked on this structure: structure id → ColonyModel (home structure only).
var guests: Dictionary = {}
## Whether store and production are kept loaded: always for the home structure, for a guest
## once it was selected.
var active := true
var body_id := ""
## The star system of the body (`Body.systemId`), for the system map.
var system_id := ""
var body_name := ""
var body_type := ""
## Light of this place: the star's surface temperature (Kelvin) and the air's density.
var star_kelvin := 5800.0
## The star's luminosity (in suns) and its distance from this body (AU; a moon's planet's).
var star_luminosity := 1.0
var star_distance_au := 1.0
var atmosphere_density := 1.0
## Gases of the air → share 0..1 (`Environment.atmosphere`); empty without air.
var atmosphere: Dictionary = {}
## Where the sun stands over this body at a game time; null until the server sends orbit and
## rotation (then the sun stays fixed).
var sun: SunPosition = null
## Width of the body in cells; the surface wraps around in x.
var size_x := 0
## Depth of the body's grid in y (0 while unknown).
var size_y := 0
## Whether the body has a grid (gas and ice giants do not), its level range (inclusive) and the
## level from which down the ground is DEEP_UNDERGROUND.
var has_grid := false
var min_z := 0
var max_z := 0
var deep_threshold := 0
## Underground levels loaded for the cutaway view: z → SurfaceBlocks.
var level_surfaces: Dictionary = {}
var layout := StructureLayout.new()
var inventory: Inventory = null
var surface := SurfaceBlocks.new()
## Recipe keys the player may use (basis or researched) → true.
var usable_blueprints: Dictionary = {}
## The player's research and labs; null until loaded.
var research: ResearchState = null
## Why research could not be loaded; null when it could.
var research_error: ApiError = null
## Module id → why an active module produces nothing ("NO_BLUEPRINT", "LOCATION").
var idle_reasons: Dictionary = {}
## The recipe buckets of the last rate solution (what each module type and recipe yields now).
var buckets: Array[ExtractionYield.Bucket] = []
## Cells with their deposits, per level of ground (z ≤ 0): z → SurfaceBlocks (DEPOSIT_BLOCK).
var deposit_levels: Dictionary = {}
## Whether the last load of deposits failed (the card says so until one arrives).
var deposits_failed := false
## Energy and life support of the last rate solution, micro-units per hour: [production, consumption].
var power: Array[int] = [0, 0]
var life_support: Array[int] = [0, 0]
var food_shortage := false
## The share of production that goes to the player's enterprise as tax: [resource, micro-units
## per hour]; empty without taxes.
var taxed: Array[Array] = []
var storage_full := false
## The balance per resource of the last rate solution (draft.28 `totals`), the buckets' effective
## inputs and outputs, inhabitants per tier 1–5 and the share of them the life support carries
## (micro, 1 000 000 = all).
var totals: Array[ProductionBalance.Row] = []
var production_flows: Array[ProductionBalance.Flow] = []
var population: Array[int] = [0, 0, 0, 0, 0]
var life_support_coverage := 1000000
## Why the last load of the production failed; null after a good one.
var production_error: ApiError = null
## Inhabitants per tier and who works where (from production, structure and PUT workforce).
var workforce := Workforce.new()
## The structure rests in orbit or is under way: no ground to show (the screen shows panels).
var detached := false
## When a guest was asked for (load_structure), its id: the screen selects it; 0 otherwise.
var asked_guest := 0
## Other own structures on the same body's surface (load_structure): id → ColonyModel.
var neighbours: Dictionary = {}
## For a neighbour: the structure it was loaded next to; null otherwise.
var neighbour_of: ColonyModel = null
## Own structures under way that concern this body and are not drawn otherwise: driving on it,
## or flying to land on it or to dock on a structure here (sync_with_fleet): id → ColonyModel
## (layout only; ColonyView places them along their trip).
var travellers: Dictionary = {}

var _layout_loading := false
var _layout_again := false
var _inventory_loading := false
var _production_due := false
## From the last rate solution: how much each module type works (ModuleMotion), the power
## scale, and whether one was loaded at all.
var _activity_by_type: Dictionary = {}
var _power_scale := 1.0
var _production_known := false
var _naming := false


func _ready() -> void:
	Services.events.event_received.connect(_on_event)
	Services.events.resync_requested.connect(_on_resync)


## Loads the player's home colony (the structure on the home body; otherwise the first one)
## and the guests docked on it.
func load_home() -> void:
	await load_structure(0)


## Loads one own structure with its guests and, on a surface, the other own structures standing
## on the same body (`neighbours`, drawn closed). A guest is loaded through its host and named in
## `asked_guest`. A structure in orbit or under way has no ground to show: it loads `detached`.
## `preferred` 0, or one that is gone: the home colony.
func load_structure(preferred: int) -> void:
	var account := Services.session.account
	var list := await FleetModel.list_structures()
	if not list.is_ok():
		load_failed.emit(list.error)
		return
	var items: Array = list.data.get("items")
	var by_id: Dictionary = {}
	for entry: Variant in items:
		var summary := Wire.as_dict(entry)
		by_id[Wire.as_int(summary.get("structureId"))] = summary
	var chosen: Dictionary = by_id.get(preferred, {})
	for _step: int in 8:
		var anchor := Wire.as_dict(chosen.get("anchor"))
		if Wire.as_string(anchor.get("type")) != "docked":
			break
		if asked_guest == 0:
			asked_guest = Wire.as_int(chosen.get("structureId"))
		chosen = by_id.get(Wire.as_int(anchor.get("hostId")), {})
	if chosen.is_empty():
		# Home: a base on the home body before a base elsewhere, before a vehicle parked at home,
		# before anything else on a surface; the first of a kind (lowest id) wins.
		asked_guest = 0
		# The home colony: a base before a vehicle parked there, on the home body before elsewhere;
		# among equals the largest one.
		var best_rank := -1
		for entry: Variant in items:
			var summary := Wire.as_dict(entry)
			var anchor := Wire.as_dict(summary.get("anchor"))
			if Wire.as_string(anchor.get("type")) != "surface":
				continue
			var rank := (2 if Wire.as_string(summary.get("kind")) == "base" else 0) \
				+ (1 if Wire.as_string(anchor.get("bodyId")) == account.home_body_id else 0)
			if rank > best_rank or (rank == best_rank and Wire.as_int(summary.get("totalHulls")) > Wire.as_int(chosen.get("totalHulls"))):
				best_rank = rank
				chosen = summary
	if chosen.is_empty():
		var none := ApiError.new()
		none.code = "STRUCTURE_NOT_FOUND"
		load_failed.emit(none)
		return
	structure_id = Wire.as_int(chosen.get("structureId"))
	structure_name = Wire.as_string(chosen.get("name"))
	var where := Wire.as_dict(chosen.get("anchor"))
	detached = Wire.as_string(where.get("type")) == "free"
	body_id = Wire.as_string(where.get("bodyId"))
	if not body_id.is_empty():
		var body_error := await _load_body()
		if body_error != null:
			load_failed.emit(body_error)
			return

	var layout_error := await _load_layout(true)
	if layout_error != null:
		load_failed.emit(layout_error)
		return
	_name_guests(items)
	if not detached:
		_add_neighbours(items)
	await reload_inventory()
	ready_to_show.emit()
	reload_research()
	reload_production()


## The body the structure is at: grid, air, sun and star. Returns why it failed.
func _load_body() -> ApiError:
	var body := await Services.api.get_json("/v2/bodies/" + body_id.uri_encode())
	if not body.is_ok():
		return body.error
	body_name = Wire.as_string(body.data.get("name"))
	system_id = Wire.as_string(body.data.get("systemId"))
	body_type = Wire.as_string(body.data.get("type"))
	var grid := Wire.as_dict(body.data.get("grid"))
	size_x = Wire.as_int(grid.get("sizeX"))
	size_y = Wire.as_int(grid.get("sizeY"))
	has_grid = not grid.is_empty()
	min_z = Wire.as_int(grid.get("minZ"))
	max_z = Wire.as_int(grid.get("maxZ"))
	deep_threshold = Wire.as_int(body.data.get("deepThreshold"))
	surface = SurfaceBlocks.new(size_x)
	level_surfaces.clear()
	deposit_levels.clear()
	var environment := Wire.as_dict(body.data.get("environment"))
	var air: Variant = environment.get("atmosphereDensity")
	if typeof(air) == TYPE_FLOAT:
		atmosphere_density = air
	atmosphere = Wire.as_dict(environment.get("atmosphere"))
	# A moon sees its star along its planet's orbit.
	var parent := {}
	var parent_id := Wire.as_string(body.data.get("parentBodyId"))
	if not parent_id.is_empty():
		var planet := await Services.api.get_json("/v2/bodies/" + parent_id.uri_encode())
		if planet.is_ok():
			parent = planet.data
	sun = SunPosition.from_body(body.data, parent)
	var orbit := Wire.as_dict((parent if not parent.is_empty() else body.data).get("orbit"))
	var distance: Variant = orbit.get("radiusAu")
	if typeof(distance) == TYPE_FLOAT:
		star_distance_au = distance
	var system := await Services.api.get_json("/v2/systems/" + system_id.uri_encode())
	if system.is_ok():
		var star := Wire.as_dict(system.data.get("star"))
		var kelvin: Variant = star.get("temperature")
		if typeof(kelvin) == TYPE_FLOAT:
			star_kelvin = kelvin
		var luminosity: Variant = star.get("luminosity")
		if typeof(luminosity) == TYPE_FLOAT:
			star_luminosity = luminosity
	return null


## The other own structures standing on this body's surface: models with their layout (and
## their guests), drawn closed next to this one.
func _add_neighbours(items: Array) -> void:
	for entry: Variant in items:
		var summary := Wire.as_dict(entry)
		var id := Wire.as_int(summary.get("structureId"))
		var anchor := Wire.as_dict(summary.get("anchor"))
		if id == structure_id or neighbours.has(id) or Wire.as_string(anchor.get("type")) != "surface" \
				or Wire.as_string(anchor.get("bodyId")) != body_id:
			continue
		var neighbour := _make_sibling(id)
		neighbour.name = "Neighbour%d" % id
		neighbour.neighbour_of = self
		neighbour.structure_name = Wire.as_string(summary.get("name"))
		neighbours[id] = neighbour
		add_child(neighbour)
		neighbour.layout_changed.connect(layout_changed.emit)
		neighbour.guests_changed.connect(guests_changed.emit)
		neighbour.reload_layout()
	if not neighbours.is_empty():
		guests_changed.emit()


## A model of another structure at the same place: the body, its light and the surface are
## shared; store and production stay unloaded (not active).
func _make_sibling(id: int) -> ColonyModel:
	var other := ColonyModel.new()
	other.active = false
	other.structure_id = id
	other.body_id = body_id
	other.body_name = body_name
	other.body_type = body_type
	other.system_id = system_id
	other.size_x = size_x
	other.size_y = size_y
	other.has_grid = has_grid
	other.min_z = min_z
	other.max_z = max_z
	other.deep_threshold = deep_threshold
	other.level_surfaces = level_surfaces
	other.deposit_levels = deposit_levels
	other.star_kelvin = star_kelvin
	other.star_luminosity = star_luminosity
	other.star_distance_au = star_distance_au
	other.atmosphere_density = atmosphere_density
	other.atmosphere = atmosphere
	other.sun = sun
	other.surface = surface
	# The same dictionary: a research reload of the home structure reaches the other one too.
	other.usable_blueprints = usable_blueprints
	return other


## Only the body and the own structures standing on its surface (all of them neighbours), for
## choosing a landing site or a drive there; no structure of its own (`structure_id` 0).
func load_body_view(body: String) -> void:
	body_id = body
	var body_error := await _load_body()
	if body_error != null:
		load_failed.emit(body_error)
		return
	var list := await FleetModel.list_structures()
	if not list.is_ok():
		load_failed.emit(list.error)
		return
	var items: Array = list.data.get("items")
	_add_neighbours(items)
	ready_to_show.emit()


## Follows the player's fleet (the loaded structure only, not a guest or neighbour): neighbours
## that left this body's surface go, new ones come; structures driving here or flying to land or
## dock here become travellers until they arrive; a layout whose structure stands somewhere else
## now loads again. Emits guests_changed when the set of drawn structures changed.
func sync_with_fleet(fleet: Fleet, now: int) -> void:
	if body_id.is_empty() or detached or host != null or neighbour_of != null:
		return
	var changed := false
	for entry: Fleet.Entry in fleet.entries():
		var id := entry.structure_id
		if id == structure_id or neighbours.has(id) or entry.where() != Fleet.Where.SURFACE or entry.body_id != body_id:
			continue
		var neighbour := _make_sibling(id)
		neighbour.name = "Neighbour%d" % id
		neighbour.neighbour_of = self
		neighbour.structure_name = entry.name
		neighbours[id] = neighbour
		add_child(neighbour)
		neighbour.layout_changed.connect(layout_changed.emit)
		neighbour.guests_changed.connect(guests_changed.emit)
		neighbour.reload_layout()
		changed = true
	for id: int in neighbours.keys():
		var entry := fleet.find(id)
		if entry == null or entry.where() != Fleet.Where.SURFACE or entry.body_id != body_id:
			var gone := neighbours[id] as ColonyModel
			neighbours.erase(id)
			gone.queue_free()
			changed = true
	var wanted: Dictionary = {}
	for entry: Fleet.Entry in fleet.entries():
		if not concerns_body(entry, now):
			continue
		var id := entry.structure_id
		if _drawn_structure(id) != null:
			continue
		wanted[id] = true
		if travellers.has(id):
			continue
		var traveller := _make_sibling(id)
		traveller.name = "Traveller%d" % id
		traveller.neighbour_of = self
		traveller.structure_name = entry.name
		travellers[id] = traveller
		add_child(traveller)
		traveller.layout_changed.connect(layout_changed.emit)
		traveller.reload_layout()
		changed = true
	for id: int in travellers.keys():
		if not wanted.has(id):
			var gone := travellers[id] as ColonyModel
			travellers.erase(id)
			gone.queue_free()
			changed = true
	# A structure that arrived on the surface (or drove) stands elsewhere than its layout says.
	var standing: Array[ColonyModel] = [self]
	for neighbour: ColonyModel in neighbours.values():
		standing.append(neighbour)
	# A guest that docked here or left: the host's layout header lists its guests.
	for model: ColonyModel in standing:
		var stale := false
		for entry: Fleet.Entry in fleet.entries():
			var docked_here := entry.where() == Fleet.Where.DOCKED and entry.host_id == model.structure_id
			if docked_here != model.guests.has(entry.structure_id):
				stale = true
		if stale and model.layout.rev >= 0:
			model.reload_layout()
	for model: ColonyModel in standing:
		var entry := fleet.find(model.structure_id)
		if entry != null and entry.where() == Fleet.Where.SURFACE and model.layout.rev >= 0 \
				and (model.layout.anchor_type != "surface" or model.layout.offset != entry.offset or model.layout.base != Vector3i.ZERO):
			model.layout.base = Vector3i.ZERO
			model.reload_layout()
	if changed:
		guests_changed.emit()


## Whether a structure's trip concerns this body: it drives on it, or flies to land on it or to
## dock on a structure drawn here, and has not arrived yet.
func concerns_body(entry: Fleet.Entry, now: int) -> bool:
	var motion := entry.motion
	if motion == null or now >= motion.arrival_at:
		return false
	if motion.mode == TravelPlan.MODE_GROUND:
		return motion.body_id == body_id
	if motion.target_type() == "surface":
		return motion.target_body_id() == body_id
	if motion.target_type() == "dock":
		return _drawn_structure(motion.target_host_id()) != null
	return false


## Traveller models in id order.
func traveller_list() -> Array[ColonyModel]:
	var ids: Array = travellers.keys()
	ids.sort()
	var result: Array[ColonyModel] = []
	for id: int in ids:
		result.append(travellers[id] as ColonyModel)
	return result


## Every structure the view draws: this one, its guests, the neighbours and their guests.
func drawn_structures() -> Array[ColonyModel]:
	var result: Array[ColonyModel] = [self]
	result.append_array(guest_list())
	var ids: Array = neighbours.keys()
	ids.sort()
	for id: int in ids:
		var neighbour := neighbours[id] as ColonyModel
		result.append(neighbour)
		result.append_array(neighbour.guest_list())
	return result


## Whether this is a neighbour (another own structure next to the loaded one) or one of its
## guests: shown, but not edited from here.
func is_neighbour() -> bool:
	return neighbour_of != null or (host != null and host.neighbour_of != null)


## Brightness of the starlight here (SkyLight.brightness): dim around a red dwarf, bright close
## to a hot star.
func star_brightness() -> float:
	return SkyLight.brightness(SkyLight.irradiance(star_luminosity, star_distance_au))


## How large the star looks here compared with the Sun from Earth (soft shadows when large).
func star_size() -> float:
	return SkyLight.apparent_size(SkyLight.star_radius(star_luminosity, star_kelvin), star_distance_au)


func is_guest() -> bool:
	return host != null


## The structure whose store builds this one: the host for a guest (contract: hulls and modules
## of a guest come from the host's inventory), otherwise itself.
func supply() -> ColonyModel:
	return host if host != null else self


## The home structure (itself, or the host of a guest).
func home() -> ColonyModel:
	return host if host != null else self


## Guest models in id order.
func guest_list() -> Array[ColonyModel]:
	var ids: Array = guests.keys()
	ids.sort()
	var result: Array[ColonyModel] = []
	for id: int in ids:
		result.append(guests[id] as ColonyModel)
	return result


## Layouts of the guests, for DockRules.
func guest_layouts() -> Array[StructureLayout]:
	var result: Array[StructureLayout] = []
	for guest: ColonyModel in guest_list():
		result.append(guest.layout)
	return result


## The home structure, one of its guests, a neighbour or a neighbour's guest by id; null when
## unknown.
func structure(id: int) -> ColonyModel:
	var found := _drawn_structure(id)
	if found == null and travellers.has(id):
		return travellers.get(id) as ColonyModel
	return found


## Like structure(), without the travellers.
func _drawn_structure(id: int) -> ColonyModel:
	if id == 0:
		return null
	if id == structure_id:
		return self
	if guests.has(id):
		return guests.get(id) as ColonyModel
	for neighbour: ColonyModel in neighbours.values():
		var found := neighbour.structure(id)
		if found != null:
			return found
	return null


## Keeps store and production of a guest loaded from now on (it was selected).
func activate() -> void:
	if active:
		return
	active = true
	reload_inventory()
	reload_production()


## Loads the player's research: researched techs, usable recipes, labs. Returns why it failed.
## Research belongs to the player: the home structure keeps it, a guest shares its recipes.
func reload_research() -> ApiError:
	if is_guest():
		return null
	var answer := await Services.api.get_json("/v2/research")
	if not answer.is_ok():
		research_error = answer.error
		research_changed.emit()
		return answer.error
	research_error = null
	research = ResearchState.from_wire(answer.data)
	usable_blueprints.clear()
	for key: String in research.blueprints.keys():
		usable_blueprints[key] = true
	production_changed.emit()
	research_changed.emit()
	return null


## Loads the labs of this structure again (status, slots, progress). Returns why it failed.
func reload_labs() -> ApiError:
	if structure_id == 0 or research == null:
		return null
	var answer := await Services.api.get_json("/v2/structures/%d/labs" % structure_id)
	if not answer.is_ok():
		return answer.error
	research.replace_labs(structure_id, ResearchState.labs_from_wire(answer.data.get("labs")))
	research_changed.emit()
	return null


## Sets the input slots of a lab of this structure: one entry per slot, {resource,
## ratePerHour} with integer rate or null. confirm_loss lets running progress go.
func set_lab_slots(module_id: int, slots: Array, confirm_loss: bool) -> ApiResult:
	var body := {"slots": slots}
	if confirm_loss:
		body["confirmProgressLoss"] = true
	var result := await Services.api.put_json("/v2/structures/%d/labs/%d/slots" % [structure_id, module_id], body)
	if result.is_ok():
		if research != null:
			research.apply_lab(ResearchState.Lab.from_wire(Wire.as_dict(result.data.get("lab"))))
			research_changed.emit()
		reload_production()
	return result


## Loads the rate solution soon; several requests within a short time become one.
func reload_production() -> void:
	if _production_due or structure_id == 0 or not active:
		return
	_production_due = true
	await get_tree().create_timer(0.5).timeout
	_production_due = false
	var answer := await Services.api.get_json("/v2/structures/%d/production" % structure_id)
	if not answer.is_ok():
		production_error = answer.error
		production_changed.emit()
		return
	production_error = null
	var power_data := Wire.as_dict(answer.data.get("power"))
	power = [Wire.as_int(power_data.get("production")), Wire.as_int(power_data.get("consumption"))]
	var life_data := Wire.as_dict(answer.data.get("lifeSupport"))
	life_support = [Wire.as_int(life_data.get("production")), Wire.as_int(life_data.get("consumption"))]
	food_shortage = answer.data.get("foodShortage") == true
	storage_full = answer.data.get("storageFull") == true
	taxed.clear()
	var taxed_rows: Array = answer.data.get("taxed") if typeof(answer.data.get("taxed")) == TYPE_ARRAY else []
	for entry: Variant in taxed_rows:
		var row := Wire.as_dict(entry)
		var rate := Wire.as_int(row.get("ratePerHour"))
		if rate > 0:
			taxed.append([Wire.as_string(row.get("resource")), rate])
	idle_reasons.clear()
	var idle: Array = answer.data.get("idle") if typeof(answer.data.get("idle")) == TYPE_ARRAY else []
	for entry: Variant in idle:
		var row := Wire.as_dict(entry)
		idle_reasons[Wire.as_int(row.get("moduleId"))] = Wire.as_string(row.get("reason"))
	var micro := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	var bucket_rows: Array = answer.data.get("buckets") if typeof(answer.data.get("buckets")) == TYPE_ARRAY else []
	buckets = ExtractionYield.buckets_from_wire(bucket_rows)
	production_flows = ProductionBalance.flows_from_wire(bucket_rows)
	totals = ProductionBalance.totals_from_wire(answer.data.get("totals"))
	population = ProductionBalance.population_from_wire(answer.data.get("population"))
	life_support_coverage = Wire.as_int(answer.data.get("lifeSupportCoverage"), micro)
	_activity_by_type = ModuleMotion.activity_by_type(bucket_rows, micro)
	_power_scale = clampf(Wire.as_int(power_data.get("scale"), micro) / float(maxi(micro, 1)), 0.0, 1.0)
	_production_known = true
	workforce.apply_groups(answer.data.get("workforce"))
	# Inhabitants are a flow per habitat; the structure counts them at the time of its answer.
	var details := await Services.api.get_json("/v2/structures/%d" % structure_id)
	if details.is_ok():
		workforce.apply_population_by_tier(Wire.as_dict(details.data.get("aggregates")).get("populationByTier"))
	production_changed.emit()


## Assigns people and robots (five counts each, tiers 1–5) to a module type; `auto` marks the
## tiers that fill up when a module of the type is finished. Robots come from and go back to the
## store. On success the workforce is the one the server sends back.
func set_workforce(module_type: String, humans: Array[int], robots: Array[int], auto: Array[bool]) -> ApiResult:
	var result := await Services.api.put_json("/v2/structures/%d/workforce" % structure_id, {
		"assignments": [{"moduleType": module_type, "humans": humans, "robots": robots, "auto": auto}],
	})
	if result.is_ok():
		workforce.apply_response(result.data)
		production_changed.emit()
		reload_inventory()
		reload_production()
		reload_labs()
	return result


## Robots of each tier (1–5) in the store, whole units.
func robots_in_store() -> Array[int]:
	var counts: Array[int] = [0, 0, 0, 0, 0]
	if inventory == null:
		return counts
	var now := Services.clock.now_ms()
	for tier: int in range(1, Workforce.TIERS + 1):
		counts[tier - 1] = inventory.units("ROBOT_T%d" % tier, now)
	return counts


## The structures this one can move items to: its docked guests (host), or its host (guest).
func counterparts() -> Array[ColonyModel]:
	if host != null:
		return [host]
	return guest_list()


## Moves `amount` micro-units of an item between this structure and `other` (its host or one of
## its guests). The call always goes to the host; on success both stores are the ones the
## server sends back.
func transfer_to(other: ColonyModel, item: String, amount: int) -> ApiResult:
	var to_guest := other.host == self
	var host_model: ColonyModel = self if to_guest else other
	var guest_model: ColonyModel = other if to_guest else self
	var result := await Services.api.post_json("/v2/structures/%d/transfers" % host_model.structure_id,
		TransferPlan.request(guest_model.structure_id, to_guest, item, amount))
	if result.is_ok():
		var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
		host_model.inventory = Inventory.from_wire(Wire.as_dict(result.data.get("host")), scale)
		guest_model.inventory = Inventory.from_wire(Wire.as_dict(result.data.get("guest")), scale)
		host_model.inventory_changed.emit()
		guest_model.inventory_changed.emit()
		host_model.reload_production()
		guest_model.reload_production()
	return result


## Destroys `amount` micro-units of an item for good (way out of a full store). On success the
## inventory is the one the server sends back.
func discard(item: String, amount: int) -> ApiResult:
	var result := await Services.api.post_json("/v2/structures/%d/discard" % structure_id, {
		"items": [{"resource": item, "amount": amount}],
	})
	if result.is_ok():
		var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
		inventory = Inventory.from_wire(result.data, scale)
		inventory_changed.emit()
		reload_production()
	return result


## Sets (or with "" clears) the recipe of the module covering an absolute cell.
func set_blueprint(cell: Vector3i, blueprint: String) -> ApiResult:
	var op := {"op": "setBlueprint", "x": cell.x, "y": cell.y, "z": cell.z}
	if not blueprint.is_empty():
		op["blueprint"] = blueprint
	var result := await send_ops([op])
	if result.is_ok():
		reload_production()
	return result


## Sends many `setBlueprint` ops (BlueprintGroups.ops) as one bestEffort batch: a refused module
## does not hold back the others; `data.results` says per op what happened (BlueprintGroups.outcome).
func set_blueprints(ops: Array[Dictionary]) -> ApiResult:
	var result := await send_ops(ops, "bestEffort")
	if result.is_ok():
		reload_production()
	return result


## Whether a rate solution was loaded at all.
func production_known() -> bool:
	return _production_known


## How much a module works now (0..1), for its moving parts (ModuleMotion). Before the first
## rate solution (and for a guest never selected) every finished, switched-on module counts as
## working.
func module_activity(module: StructureLayout.Module) -> float:
	if not _production_known:
		return 0.0 if module.is_building() or module.is_disabled() else 1.0
	return ModuleMotion.activity(module.module_type, module.is_building(), module.is_disabled(),
		idle_reasons.has(module.module_id), _activity_by_type, _power_scale)


## Absolute cell the camera should start on: the middle of the structure.
func centre_cell() -> Vector3i:
	var cells := layout.hull_cells()
	if cells.is_empty():
		return layout.offset
	var low := cells[0]
	var high := cells[0]
	for cell: Vector3i in cells:
		low = low.min(cell)
		high = high.max(cell)
	@warning_ignore("integer_division")
	return layout.to_absolute(Vector3i((low.x + high.x) / 2, (low.y + high.y) / 2, 0))


## Makes sure the surface around an absolute cell is loaded (in the background).
func ensure_surface(cell: Vector3i) -> void:
	for request: SurfaceBlocks.Request in surface.missing_around(cell.x, cell.y, SURFACE_RADIUS):
		_load_surface(request)


## Makes sure the ground of an underground level around an absolute column is loaded (cutaway).
func ensure_level_surface(cell: Vector3i, z: int) -> void:
	if z >= 0:
		ensure_surface(cell)
		return
	for request: SurfaceBlocks.Request in level_surface(z).missing_around(cell.x, cell.y, SURFACE_RADIUS):
		_load_surface(request, z)


## The loaded blocks of an underground level (created empty on first use); the surface for z ≥ 0.
func level_surface(z: int) -> SurfaceBlocks:
	if z >= 0:
		return surface
	if not level_surfaces.has(z):
		level_surfaces[z] = SurfaceBlocks.new(size_x)
	return level_surfaces[z] as SurfaceBlocks


## The ground under an absolute cell with its deposits and biome, at the cell's level (a cell
## above the ground stands on the surface: ExtractionYield.ground_level). Null while it loads
## (asked for here; deposits_loaded follows) or on a body without a grid.
func ground_cell(cell: Vector3i) -> SurfacePatch.Cell:
	if not has_grid or body_id.is_empty():
		return null
	var z := ExtractionYield.ground_level(cell.z)
	if not deposit_levels.has(z):
		deposit_levels[z] = SurfaceBlocks.new(size_x, DEPOSIT_BLOCK)
	var blocks := deposit_levels[z] as SurfaceBlocks
	var found := blocks.cell(cell.x, cell.y)
	if found == null:
		for request: SurfaceBlocks.Request in blocks.missing_around(cell.x, cell.y, 0):
			_load_deposits(request, z, blocks)
	return found


## Loads the cells of a small rectangle of one level with their deposits.
func _load_deposits(request: SurfaceBlocks.Request, z: int, blocks: SurfaceBlocks) -> void:
	var path := "/v2/bodies/%s/surface?x0=%d&y0=%d&x1=%d&y1=%d&includeDeposits=true" % [
		body_id.uri_encode(), request.x0, request.y0, request.x1, request.y1]
	if z != 0:
		path += "&z=%d" % z
	var answer := await Services.api.get_ndjson(path)
	var patch := SurfacePatch.from_stream(answer.stream) if answer.is_ok() else null
	if patch == null or not patch.complete:
		# Asked for again with the next look at the cell (the inspect card refreshes every second).
		blocks.forget(request)
		deposits_failed = true
		return
	deposits_failed = false
	blocks.store(request, patch)
	deposits_loaded.emit()


## What the level rules need to know about this body (LevelRules.Site); the biome of the ground
## level comes from the loaded surface.
func site() -> LevelRules.Site:
	var result := LevelRules.Site.new()
	result.has_grid = has_grid
	result.min_z = min_z
	result.max_z = max_z
	result.deep_threshold = deep_threshold
	result.body_type = body_type
	var blocks := surface
	result.biome_at = func(x: int, y: int) -> String:
		var cell := blocks.cell(x, y)
		return cell.biome if cell != null else ""
	return result


## Sends a build batch to the body; ops on a guest go the same way. `mode` "atomic" (all or
## nothing) or "bestEffort" (each op on its own; per-op results in `data.results`). Returns the
## result; on success the home structure (store, guest list) and every changed guest reload.
func send_ops(ops: Array[Dictionary], mode: String = "atomic") -> ApiResult:
	if is_guest():
		return await host.send_ops(ops, mode)
	var result := await Services.api.post_json("/v2/bodies/%s/ops" % body_id.uri_encode(), {
		"mode": mode,
		"ops": ops,
	})
	if result.is_ok():
		reload_layout()
		reload_inventory()
		var changed: Array = result.data.get("structures") if typeof(result.data.get("structures")) == TYPE_ARRAY else []
		for entry: Variant in changed:
			var guest := guests.get(Wire.as_int(entry)) as ColonyModel
			if guest != null:
				guest.reload_layout()
				guest.reload_inventory()
	return result


## Loads what changed since the last layout (or everything, the first time).
func reload_layout() -> void:
	if _layout_loading:
		_layout_again = true
		return
	await _load_layout(false)


func reload_inventory() -> void:
	if _inventory_loading or structure_id == 0 or not active:
		return
	_inventory_loading = true
	var answer := await Services.api.get_json("/v2/structures/%d/inventory" % structure_id)
	_inventory_loading = false
	if answer.is_ok():
		var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
		inventory = Inventory.from_wire(answer.data, scale)
		inventory_changed.emit()


func _load_layout(full: bool) -> ApiError:
	_layout_loading = true
	var path := "/v2/structures/%d/layout" % structure_id
	if not full and layout.rev >= 0:
		path += "?since=%d" % layout.rev
	var answer := await Services.api.get_ndjson(path)
	_layout_loading = false
	var failure: ApiError = answer.error
	if Services.definitions != null:
		layout.vertical_types = Services.definitions.vertical_types()
	if answer.is_ok():
		if layout.apply(answer.stream):
			if not is_guest():
				_sync_guests()
			layout_changed.emit()
		else:
			failure = ApiError.new()
			failure.code = ApiResult.CODE_MALFORMED_RESPONSE
	if _layout_again:
		_layout_again = false
		reload_layout()
	return failure


## Follows the guest list of the last layout header: new guests get a model (their layout
## loads), vanished ones go. Names come from the structure list.
func _sync_guests() -> void:
	var listed: Dictionary = {}
	var unnamed := false
	for entry: StructureLayout.Guest in layout.guests:
		listed[entry.structure_id] = true
		var guest := guests.get(entry.structure_id) as ColonyModel
		if guest == null:
			guest = _add_guest(entry.structure_id)
			unnamed = true
		guest.layout.base = layout.offset
	var changed := unnamed
	for id: int in guests.keys():
		if not listed.has(id):
			var gone := guests[id] as ColonyModel
			guests.erase(id)
			gone.queue_free()
			changed = true
	if changed:
		guests_changed.emit()
	if unnamed and structure_id != 0 and not _naming:
		_naming = true
		var list := await FleetModel.list_structures()
		_naming = false
		if list.is_ok():
			var found: Array = list.data.get("items")
			_name_guests(found)


func _add_guest(id: int) -> ColonyModel:
	var guest := _make_sibling(id)
	guest.name = "Guest%d" % id
	guest.host = self
	guest.layout.base = layout.offset
	guests[id] = guest
	add_child(guest)
	guest.layout_changed.connect(layout_changed.emit)
	guest.inventory_changed.connect(inventory_changed.emit)
	guest.production_changed.connect(production_changed.emit)
	guest.reload_layout()
	return guest


## Gives the guests their names from a structure list (`StructureSummary` entries).
func _name_guests(items: Array) -> void:
	var named := false
	for entry: Variant in items:
		var summary := Wire.as_dict(entry)
		var guest := guests.get(Wire.as_int(summary.get("structureId"))) as ColonyModel
		if guest != null:
			guest.structure_name = Wire.as_string(summary.get("name"))
			named = true
	if named:
		guests_changed.emit()


## Loads a rectangle of the ground level, or with `z` < 0 of an underground level (its rock biomes).
func _load_surface(request: SurfaceBlocks.Request, z: int = 0) -> void:
	var path := "/v2/bodies/%s/surface?x0=%d&y0=%d&x1=%d&y1=%d" % [
		body_id.uri_encode(), request.x0, request.y0, request.x1, request.y1]
	if z != 0:
		path += "&z=%d" % z
	var blocks := level_surface(z)
	var answer := await Services.api.get_ndjson(path)
	var patch := SurfacePatch.from_stream(answer.stream) if answer.is_ok() else null
	if patch == null or not patch.complete:
		blocks.forget(request)
		return
	blocks.store(request, patch)
	if z < 0:
		level_surface_loaded.emit(z, request)
	else:
		surface_loaded.emit(request, patch)


func _on_event(event: SseEvent) -> void:
	var data := Wire.parse_object(event.data)
	match event.type:
		"research.completed":
			if research != null:
				research.apply_completed(data)
			research_completed.emit(Wire.as_string(data.get("tech")))
			reload_research()
			return
		"research.interrupted":
			reload_research()
			return
		"lab.changed":
			if research != null:
				research.apply_lab(ResearchState.Lab.from_wire(Wire.as_dict(data.get("lab"))))
				research_changed.emit()
			return
		"research.hint":
			var lab := research.lab(Wire.as_int(data.get("moduleId"))) if research != null else null
			if lab != null:
				lab.hint_category = Wire.as_string(data.get("category"))
				lab.hint_at = Wire.as_int(data.get("gameTime"), -1)
				research_changed.emit()
			return
	if is_queued_for_deletion():
		return
	if Wire.as_int(data.get("structureId")) != structure_id or structure_id == 0:
		return
	match event.type:
		"structure.layoutChanged":
			if Wire.as_int(data.get("rev")) > layout.rev:
				reload_layout()
			reload_production()
			reload_labs()
		"module.completed":
			layout.complete_module(Wire.as_int(data.get("moduleId")))
			layout_changed.emit()
			reload_production()
			reload_labs()
		"structure.ratesChanged":
			if inventory != null and typeof(data.get("changed")) == TYPE_ARRAY:
				var changed: Array = data.get("changed")
				inventory.apply_rates(changed)
				inventory_changed.emit()
			reload_production()


func _on_resync(_rev: int) -> void:
	if structure_id != 0:
		reload_layout()
		reload_inventory()
		reload_research()


# --- storage modes and the cargo area (routes, draft.20) -----------------------------------------

## The storage modules of this structure (also those under construction), in id order.
func storage_modules() -> Array[StructureLayout.Module]:
	var result: Array[StructureLayout.Module] = []
	if Services.definitions == null:
		return result
	for module: StructureLayout.Module in layout.modules():
		var definition := Services.definitions.module(module.module_type)
		if definition != null and definition.storage:
			result.append(module)
	result.sort_custom(func(a: StructureLayout.Module, b: StructureLayout.Module) -> bool:
		return a.module_id < b.module_id)
	return result


## Switches a storage module between the own supply ("selfUse") and the cargo area
## ("transport"). On success the inventory is the one the server sends back.
func set_storage_mode(module_id: int, mode: String) -> ApiResult:
	var result := await Services.api.patch_json("/v2/structures/%d/modules/%d/storage" % [structure_id, module_id],
		{"mode": mode})
	if result.is_ok():
		var module := layout.module(module_id)
		if module != null:
			module.storage_mode = mode
		_take_inventory(result.data)
	return result


## Moves `amount` micro-units of an item from the own supply ("selfUse") to the cargo area
## ("transport") or back. On success the inventory is the one the server sends back.
func move_storage(from: String, item: String, amount: int) -> ApiResult:
	var result := await Services.api.post_json("/v2/structures/%d/storage/move" % structure_id, {
		"from": from,
		"items": [{"resource": item, "amount": amount}],
	})
	if result.is_ok():
		_take_inventory(result.data)
	return result


func _take_inventory(data: Dictionary) -> void:
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	inventory = Inventory.from_wire(data, scale)
	inventory_changed.emit()
	reload_production()
