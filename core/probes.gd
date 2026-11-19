class_name Probes
extends RefCounted
## The player's exploration probes (draft.31): `GET /v2/probes`, `POST /v2/structures/{id}/probes`
## and the events `probe.launched` / `probe.arrived`. A probe flies from a launcher to a cell of a
## body and explores PROBE radius cells around it on arrival. The client shows them and previews
## whether a launch can work; the server decides.

## The launcher module and the item it fires (contract, game data).
const LAUNCHER := "PROBE_LAUNCHER"
const ITEM := "PROBE"
## Cells a probe explores around its target (contract `ProbeView.radius`, decision R4); the
## preview before a launch uses it.
const RADIUS := 5000
## The same in kilometres (a cell is 10 m).
const RADIUS_KM := 50
## The shortest flight (contract: at least one minute).
const MIN_FLIGHT_MS := 60000
const STATUS_FLYING := "flying"
const STATUS_ARRIVED := "arrived"

## Why a launch cannot be sent now (LAUNCH_OK: it can).
enum Block { LAUNCH_OK, BUILDING, DISABLED, MOVING, NO_POWER, NO_PROBE }


## One probe.
class Probe:
	extends RefCounted
	var probe_id := 0
	var structure_id := 0
	var module_id := 0
	var body_id := ""
	var x := 0
	var y := 0
	var radius := Probes.RADIUS
	var launched_at := 0
	var arrives_at := 0
	var status := Probes.STATUS_FLYING

	## Under way at game time `now` (the server's status, or not yet arrived by the clock).
	func is_flying(now: int) -> bool:
		return status == Probes.STATUS_FLYING and now < arrives_at

	func remaining_ms(now: int) -> int:
		return maxi(arrives_at - now, 0)

	## Share of the flight done at `now`, 0..1.
	func progress(now: int) -> float:
		var total := arrives_at - launched_at
		if total <= 0:
			return 1.0
		return clampf(float(now - launched_at) / float(total), 0.0, 1.0)


## What a launch would do now (`POST /v2/structures/{id}/probes/preview`, draft.32).
class Quote:
	extends RefCounted
	## Whether the launch would work now.
	var ok := false
	## The codes of every condition it violates (empty when ok).
	var errors: PackedStringArray = []
	var flight_ms := 0
	var arrives_at := 0

	static func from_wire(data: Dictionary) -> Quote:
		var quote := Quote.new()
		quote.ok = data.get("ok") == true
		var codes: Array = data.get("errors") if typeof(data.get("errors")) == TYPE_ARRAY else []
		for code: Variant in codes:
			var text := Wire.as_string(code)
			if not text.is_empty():
				quote.errors.append(text)
		quote.flight_ms = maxi(Wire.as_int(data.get("flightMs")), 0)
		quote.arrives_at = Wire.as_int(data.get("arrivesAt"))
		return quote


var probes: Array[Probe] = []


## Whether this server has probes at all (game data with the launcher; draft.31 on).
static func supported(definitions: GameDefinitions) -> bool:
	return definitions != null and definitions.module(LAUNCHER) != null


static func is_launcher(module_type: String) -> bool:
	return module_type == LAUNCHER


## A `ProbeView`; null without an id.
static func probe_from_wire(data: Dictionary) -> Probe:
	var probe := Probe.new()
	probe.probe_id = Wire.as_int(data.get("probeId"))
	if probe.probe_id == 0:
		return null
	probe.structure_id = Wire.as_int(data.get("structureId"))
	probe.module_id = Wire.as_int(data.get("moduleId"))
	probe.body_id = Wire.as_string(data.get("bodyId"))
	probe.x = Wire.as_int(data.get("x"))
	probe.y = Wire.as_int(data.get("y"))
	probe.radius = maxi(Wire.as_int(data.get("radius"), RADIUS), 0)
	probe.launched_at = Wire.as_int(data.get("launchedAt"))
	probe.arrives_at = Wire.as_int(data.get("arrivesAt"))
	probe.status = Wire.as_string(data.get("status"))
	if probe.status.is_empty():
		probe.status = STATUS_FLYING
	return probe


## A `ProbesResponse`.
static func from_wire(data: Dictionary) -> Probes:
	var result := Probes.new()
	var raw: Array = data.get("probes") if typeof(data.get("probes")) == TYPE_ARRAY else []
	for item: Variant in raw:
		var probe := probe_from_wire(Wire.as_dict(item))
		if probe != null:
			result.probes.append(probe)
	result.sort()
	return result


## Takes a probe from an answer or event (`ProbeView`, or `ProbeEvent.probe`): replaces the one
## with its id or adds it. Returns it; null when the data holds none.
func apply(data: Dictionary) -> Probe:
	var probe := probe_from_wire(data)
	if probe == null:
		return null
	for index: int in probes.size():
		if probes[index].probe_id == probe.probe_id:
			probes[index] = probe
			return probe
	probes.append(probe)
	sort()
	return probe


## Newest first (contract order), so a probe added later still sits where the list puts it.
func sort() -> void:
	probes.sort_custom(func(a: Probe, b: Probe) -> bool:
		return a.launched_at > b.launched_at if a.launched_at != b.launched_at else a.probe_id > b.probe_id)


func find(probe_id: int) -> Probe:
	for probe: Probe in probes:
		if probe.probe_id == probe_id:
			return probe
	return null


## The probes still under way at `now`.
func flying(now: int) -> Array[Probe]:
	var result: Array[Probe] = []
	for probe: Probe in probes:
		if probe.is_flying(now):
			result.append(probe)
	return result


## The probes sent to a body.
func to_body(body_id: String) -> Array[Probe]:
	var result: Array[Probe] = []
	for probe: Probe in probes:
		if probe.body_id == body_id:
			result.append(probe)
	return result


## The probes lying on a body at `now`: a probe stays on the cell it was sent to once it landed
## (arrived by the server, or by the clock before the event).
func landed_on(body_id: String, now: int) -> Array[Probe]:
	var result: Array[Probe] = []
	for probe: Probe in probes:
		if probe.body_id == body_id and not probe.is_flying(now):
			result.append(probe)
	return result


## The impact sites on a body by cell (Vector2i, x wrapped onto `size_x`): those the surface stream
## names (draft.32 `SurfaceCell.p`, every player's; `surface` maps cells to Array of Impact) and the
## player's own landed probes (`own`, owned by `player_id`; before draft.32 the only source). Each
## cell lists its probes oldest first, every probe once.
static func impacts_by_cell(own: Array[Probe], player_id: String, surface: Dictionary, size_x: int) -> Dictionary:
	var result := {}
	var seen := {}
	for key: Variant in surface.keys():
		var cell: Vector2i = key
		var wrapped := Vector2i(WorldGrid.wrap_x(cell.x, size_x), cell.y)
		var list: Array = surface[key]
		for item: Variant in list:
			var impact := item as Impact
			if impact != null and not seen.has(impact.probe_id):
				seen[impact.probe_id] = true
				_add_impact(result, wrapped, impact)
	for probe: Probe in own:
		if seen.has(probe.probe_id):
			continue
		var impact := Impact.new()
		impact.probe_id = probe.probe_id
		impact.owner_id = player_id
		impact.at = probe.arrives_at
		impact.x = WorldGrid.wrap_x(probe.x, size_x)
		impact.y = probe.y
		seen[probe.probe_id] = true
		_add_impact(result, Vector2i(impact.x, impact.y), impact)
	for key: Variant in result.keys():
		var list: Array = result[key]
		list.sort_custom(func(a: Impact, b: Impact) -> bool:
			return a.at < b.at if a.at != b.at else a.probe_id < b.probe_id)
	return result


static func _add_impact(into: Dictionary, cell: Vector2i, impact: Impact) -> void:
	if not into.has(cell):
		into[cell] = []
	var list: Array = into[cell]
	list.append(impact)


## The cells with a wreck to show: impact sites (from impacts_by_cell) no hull covers on the
## ground level. `covered` holds the covered cells as Vector2i with x wrapped like the keys.
static func visible_wrecks(impacts: Dictionary, covered: Dictionary) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	for key: Variant in impacts.keys():
		var cell: Vector2i = key
		if not covered.has(cell):
			result.append(cell)
	return result


## One probe's landing on a cell: an impact site (draft.32), for good.
class Impact:
	extends RefCounted
	var probe_id := 0
	## The player whose probe it was (a string, like every player id).
	var owner_id := ""
	## When it landed (game ms).
	var at := 0
	var x := 0
	var y := 0

	static func from_wire(data: Dictionary, cell_x: int, cell_y: int) -> Impact:
		var impact := Impact.new()
		impact.probe_id = Wire.as_int(data.get("probeId"))
		var owner: Variant = data.get("ownerId")
		impact.owner_id = Wire.as_string(owner) if typeof(owner) == TYPE_STRING else (str(Wire.as_int(owner)) if owner != null else "")
		impact.at = Wire.as_int(data.get("at"))
		impact.x = cell_x
		impact.y = cell_y
		return impact


## Why a launcher cannot fire now, in the order the player can fix it: still being built,
## switched off, its structure travelling, short of power (when known), no probe in the own supply
## (`stock` in micro-units, `scale` micro-units per probe; only when `stock_known`).
static func launch_block(building: bool, disabled: bool, moving: bool, power_short: bool,
		stock: int, scale: int, stock_known: bool) -> Block:
	if building:
		return Block.BUILDING
	if disabled:
		return Block.DISABLED
	if moving:
		return Block.MOVING
	if power_short:
		return Block.NO_POWER
	if stock_known and stock < maxi(scale, 1):
		return Block.NO_PROBE
	return Block.LAUNCH_OK


## The body for a launch request: the target cell with y kept in the band the server accepts
## (`|y| ≤ size_y / 2`) and x wrapped onto the body.
static func launch_body(module_id: int, body_id: String, x: int, y: int, size_x: int, size_y: int) -> Dictionary:
	@warning_ignore("integer_division")
	var half := size_y / 2
	var target_y := clampi(y, -half, half) if size_y > 0 else y
	return {"moduleId": module_id, "bodyId": body_id, "x": WorldGrid.wrap_x(x, size_x), "y": target_y}
