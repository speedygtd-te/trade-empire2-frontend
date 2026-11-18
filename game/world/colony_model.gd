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
## Page size when listing the player's structures.
const LIST_PAGE := 200

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
var body_name := ""
var body_type := ""
## Light of this place: the star's surface temperature (Kelvin) and the air's density.
var star_kelvin := 5800.0
var atmosphere_density := 1.0
## Gases of the air → share 0..1 (`Environment.atmosphere`); empty without air.
var atmosphere: Dictionary = {}
## Where the sun stands over this body at a game time; null until the server sends orbit and
## rotation (then the sun stays fixed).
var sun: SunPosition = null
## Width of the body in cells; the surface wraps around in x.
var size_x := 0
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
## Energy and life support of the last rate solution, micro-units per hour: [production, consumption].
var power: Array[int] = [0, 0]
var life_support: Array[int] = [0, 0]
var food_shortage := false
var storage_full := false
## Inhabitants per tier and who works where (from production, structure and PUT workforce).
var workforce := Workforce.new()

var _layout_loading := false
var _layout_again := false
var _inventory_loading := false
var _production_due := false
var _naming := false


func _ready() -> void:
	Services.events.event_received.connect(_on_event)
	Services.events.resync_requested.connect(_on_resync)


## Loads the player's home colony (the structure on the home body; otherwise the first one)
## and the guests docked on it.
func load_home() -> void:
	var account := Services.session.account
	var list := await _list_structures()
	if not list.is_ok():
		load_failed.emit(list.error)
		return
	var chosen := {}
	var items: Array = list.data.get("items")
	for entry: Variant in items:
		var summary := Wire.as_dict(entry)
		var anchor := Wire.as_dict(summary.get("anchor"))
		if Wire.as_string(anchor.get("type")) != "surface":
			continue
		if chosen.is_empty() or Wire.as_string(anchor.get("bodyId")) == account.home_body_id:
			chosen = summary
	if chosen.is_empty():
		var none := ApiError.new()
		none.code = "STRUCTURE_NOT_FOUND"
		load_failed.emit(none)
		return
	structure_id = Wire.as_int(chosen.get("structureId"))
	structure_name = Wire.as_string(chosen.get("name"))
	body_id = Wire.as_string(Wire.as_dict(chosen.get("anchor")).get("bodyId"))

	var body := await Services.api.get_json("/v2/bodies/" + body_id.uri_encode())
	if not body.is_ok():
		load_failed.emit(body.error)
		return
	body_name = Wire.as_string(body.data.get("name"))
	body_type = Wire.as_string(body.data.get("type"))
	size_x = Wire.as_int(Wire.as_dict(body.data.get("grid")).get("sizeX"))
	surface = SurfaceBlocks.new(size_x)
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
	var system := await Services.api.get_json("/v2/systems/" + Wire.as_string(body.data.get("systemId")).uri_encode())
	if system.is_ok():
		var kelvin: Variant = Wire.as_dict(system.data.get("star")).get("temperature")
		if typeof(kelvin) == TYPE_FLOAT:
			star_kelvin = kelvin

	var layout_error := await _load_layout(true)
	if layout_error != null:
		load_failed.emit(layout_error)
		return
	_name_guests(items)
	await reload_inventory()
	ready_to_show.emit()
	reload_research()
	reload_production()


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


## The home structure or one of its guests by id; null when unknown.
func structure(id: int) -> ColonyModel:
	if id == structure_id:
		return self
	return guests.get(id) as ColonyModel


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
		return
	var power_data := Wire.as_dict(answer.data.get("power"))
	power = [Wire.as_int(power_data.get("production")), Wire.as_int(power_data.get("consumption"))]
	var life_data := Wire.as_dict(answer.data.get("lifeSupport"))
	life_support = [Wire.as_int(life_data.get("production")), Wire.as_int(life_data.get("consumption"))]
	food_shortage = answer.data.get("foodShortage") == true
	storage_full = answer.data.get("storageFull") == true
	idle_reasons.clear()
	var idle: Array = answer.data.get("idle") if typeof(answer.data.get("idle")) == TYPE_ARRAY else []
	for entry: Variant in idle:
		var row := Wire.as_dict(entry)
		idle_reasons[Wire.as_int(row.get("moduleId"))] = Wire.as_string(row.get("reason"))
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


## Sends a build batch (atomic) to the body; ops on a guest go the same way. Returns the result;
## on success the home structure (store, guest list) and every changed guest reload.
func send_ops(ops: Array[Dictionary]) -> ApiResult:
	if is_guest():
		return await host.send_ops(ops)
	var result := await Services.api.post_json("/v2/bodies/%s/ops" % body_id.uri_encode(), {
		"mode": "atomic",
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
		var list := await _list_structures()
		_naming = false
		if list.is_ok():
			var found: Array = list.data.get("items")
			_name_guests(found)


func _add_guest(id: int) -> ColonyModel:
	var guest := ColonyModel.new()
	guest.name = "Guest%d" % id
	guest.host = self
	guest.active = false
	guest.structure_id = id
	guest.body_id = body_id
	guest.body_name = body_name
	guest.body_type = body_type
	guest.size_x = size_x
	guest.star_kelvin = star_kelvin
	guest.atmosphere_density = atmosphere_density
	guest.atmosphere = atmosphere
	guest.sun = sun
	guest.surface = surface
	# The same dictionary: a research reload of the home structure reaches the guest too.
	guest.usable_blueprints = usable_blueprints
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


## Every structure of the player, all pages in one answer (`data.items`).
func _list_structures() -> ApiResult:
	var items: Array = []
	var cursor := ""
	while true:
		var path := "/v2/structures?limit=%d" % LIST_PAGE
		if not cursor.is_empty():
			path += "&cursor=" + cursor.uri_encode()
		var page := await Services.api.get_json(path)
		if not page.is_ok():
			return page
		if typeof(page.data.get("items")) == TYPE_ARRAY:
			var some: Array = page.data.get("items")
			items.append_array(some)
		cursor = Wire.as_string(page.data.get("nextCursor"))
		if cursor.is_empty():
			break
	var all := ApiResult.new()
	all.data = {"items": items}
	return all


func _load_surface(request: SurfaceBlocks.Request) -> void:
	var path := "/v2/bodies/%s/surface?x0=%d&y0=%d&x1=%d&y1=%d" % [
		body_id.uri_encode(), request.x0, request.y0, request.x1, request.y1]
	var answer := await Services.api.get_ndjson(path)
	var patch := SurfacePatch.from_stream(answer.stream) if answer.is_ok() else null
	if patch == null or not patch.complete:
		surface.forget(request)
		return
	surface.store(request, patch)
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
