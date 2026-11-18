class_name ColonyModel
extends Node
## The data of the colony on screen: the structure's layout and inventory, the body's grid and
## the surface around the camera. Loads them, keeps them current from the event channel and
## sends build batches.

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

## How many surface blocks around the camera are kept loaded.
const SURFACE_RADIUS := 2

var structure_id := 0
var structure_name := ""
var body_id := ""
var body_name := ""
var body_type := ""
## Light of this place: the star's surface temperature (Kelvin) and the air's density.
var star_kelvin := 5800.0
var atmosphere_density := 1.0
## Width of the body in cells; the surface wraps around in x.
var size_x := 0
var layout := StructureLayout.new()
var inventory: Inventory = null
var surface := SurfaceBlocks.new()
## Recipe keys the player may use (basis or researched) → true.
var usable_blueprints: Dictionary = {}
## Module id → why an active module produces nothing ("NO_BLUEPRINT", "LOCATION").
var idle_reasons: Dictionary = {}
## Energy and life support of the last rate solution, micro-units per hour: [production, consumption].
var power: Array[int] = [0, 0]
var life_support: Array[int] = [0, 0]
var food_shortage := false
var storage_full := false

var _layout_loading := false
var _layout_again := false
var _inventory_loading := false
var _production_due := false


func _ready() -> void:
	Services.events.event_received.connect(_on_event)
	Services.events.resync_requested.connect(_on_resync)


## Loads the player's home colony (the structure on the home body; otherwise the first one).
func load_home() -> void:
	var account := Services.session.account
	var list := await Services.api.get_json("/v2/structures")
	if not list.is_ok():
		load_failed.emit(list.error)
		return
	var chosen := {}
	var items: Array = list.data.get("items") if typeof(list.data.get("items")) == TYPE_ARRAY else []
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
	var air: Variant = Wire.as_dict(body.data.get("environment")).get("atmosphereDensity")
	if typeof(air) == TYPE_FLOAT:
		atmosphere_density = air
	var system := await Services.api.get_json("/v2/systems/" + Wire.as_string(body.data.get("systemId")).uri_encode())
	if system.is_ok():
		var kelvin: Variant = Wire.as_dict(system.data.get("star")).get("temperature")
		if typeof(kelvin) == TYPE_FLOAT:
			star_kelvin = kelvin

	var layout_error := await _load_layout(true)
	if layout_error != null:
		load_failed.emit(layout_error)
		return
	await reload_inventory()
	ready_to_show.emit()
	reload_research()
	reload_production()


## Loads which recipes the player may use.
func reload_research() -> void:
	var answer := await Services.api.get_json("/v2/research")
	if not answer.is_ok():
		return
	usable_blueprints.clear()
	var entries: Array = answer.data.get("blueprints") if typeof(answer.data.get("blueprints")) == TYPE_ARRAY else []
	for entry: Variant in entries:
		var key := Wire.as_string(Wire.as_dict(entry).get("blueprint"))
		if not key.is_empty():
			usable_blueprints[key] = true
	production_changed.emit()


## Loads the rate solution soon; several requests within a short time become one.
func reload_production() -> void:
	if _production_due or structure_id == 0:
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
	production_changed.emit()


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


## Sends a build batch (atomic). Returns the result; on success layout and inventory reload.
func send_ops(ops: Array[Dictionary]) -> ApiResult:
	var result := await Services.api.post_json("/v2/bodies/%s/ops" % body_id.uri_encode(), {
		"mode": "atomic",
		"ops": ops,
	})
	if result.is_ok():
		reload_layout()
		reload_inventory()
	return result


## Loads what changed since the last layout (or everything, the first time).
func reload_layout() -> void:
	if _layout_loading:
		_layout_again = true
		return
	await _load_layout(false)


func reload_inventory() -> void:
	if _inventory_loading or structure_id == 0:
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
			layout_changed.emit()
		else:
			failure = ApiError.new()
			failure.code = ApiResult.CODE_MALFORMED_RESPONSE
	if _layout_again:
		_layout_again = false
		reload_layout()
	return failure


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
	if event.type == "research.completed":
		reload_research()
		return
	if Wire.as_int(data.get("structureId")) != structure_id or structure_id == 0:
		return
	match event.type:
		"structure.layoutChanged":
			if Wire.as_int(data.get("rev")) > layout.rev:
				reload_layout()
			reload_production()
		"module.completed":
			layout.complete_module(Wire.as_int(data.get("moduleId")))
			layout_changed.emit()
			reload_production()
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
