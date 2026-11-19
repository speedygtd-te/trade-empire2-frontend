class_name ProbeModel
extends Node
## The player's exploration probes and what they explored (draft.31), kept current: loads
## `GET /v2/probes`, follows `probe.launched` / `probe.arrived`, sends launches, and keeps the
## explored areas of the bodies looked at (`GET /v2/bodies/{id}/reveal`). The fleet model owns it.
##
## A server without probes (game data without the launcher, draft.30 and older) is left alone:
## nothing is loaded, `supported()` is false, and every body counts as explored (no reveal).

## The list changed (loaded, a probe launched or arrived).
signal changed
## A probe arrived; `sightings` foreign structures were seen. The body's reveal is reloaded.
signal arrived(probe: Probes.Probe, sightings: int)
## The explored areas of a body arrived or changed.
signal reveal_changed(body_id: String)

var list := Probes.new()
## Whether the list has been loaded at least once; why the last load failed (null when it worked).
var loaded := false
var error: ApiError = null

var _loading := false
var _again := false
## Body id → RevealMap (or null when the server has none for it).
var _reveals: Dictionary = {}
## Body ids whose reveal is loading.
var _reveal_loading: Dictionary = {}


func _ready() -> void:
	Services.events.event_received.connect(_on_event)
	Services.events.resync_requested.connect(_on_resync)
	# Whether probes exist is only known with the game data.
	Services.definitions_loaded.connect(func() -> void:
		if not loaded:
			reload())


## Whether this server has probes (its game data knows the launcher).
func supported() -> bool:
	return Probes.supported(Services.definitions)


## Loads the list again (only on a server with probes).
func reload() -> void:
	if not supported():
		return
	if _loading:
		_again = true
		return
	_loading = true
	var answer := await Services.api.get_json("/v2/probes")
	_loading = false
	if answer.is_ok():
		list = Probes.from_wire(answer.data)
		error = null
		loaded = true
	else:
		error = answer.error
	changed.emit()
	if _again:
		_again = false
		reload()


## Fires a probe from a launcher of a structure at a cell of a body. On success the probe is in
## the list (the event follows).
func launch(structure_id: int, module_id: int, body_id: String, cell: Vector2i, size_x: int, size_y: int) -> ApiResult:
	var result := await Services.api.post_json("/v2/structures/%d/probes" % structure_id,
		Probes.launch_body(module_id, body_id, cell.x, cell.y, size_x, size_y))
	if result.is_ok():
		list.apply(result.data)
		loaded = true
		changed.emit()
	return result


## The explored areas of a body as loaded; null while unknown, or when the server has none (then
## everything is explored). `has_reveal` tells the two apart.
func reveal(body_id: String) -> RevealMap:
	return _reveals.get(body_id) as RevealMap


func has_reveal(body_id: String) -> bool:
	return _reveals.has(body_id)


## Loads (again) the explored areas of a body; emits reveal_changed. A server without probes, or
## one that does not know the endpoint, has no fog: the body counts as explored (null).
func load_reveal(body_id: String) -> RevealMap:
	if body_id.is_empty():
		return null
	if not supported():
		_reveals[body_id] = null
		return null
	if _reveal_loading.has(body_id):
		while _reveal_loading.has(body_id):
			await reveal_changed
		return reveal(body_id)
	_reveal_loading[body_id] = true
	var answer := await Services.api.get_json("/v2/bodies/%s/reveal" % body_id.uri_encode())
	_reveal_loading.erase(body_id)
	if answer.is_ok():
		_reveals[body_id] = RevealMap.from_wire(answer.data)
	elif answer.error.http_status == 404 and answer.error.code != "SYSTEM_NOT_DISCOVERED":
		# The endpoint is missing (an older server): no fog.
		_reveals[body_id] = null
	else:
		# Not reachable now: keep what was there (or nothing) and try again next time.
		if not _reveals.has(body_id):
			reveal_changed.emit(body_id)
			return null
	reveal_changed.emit(body_id)
	return reveal(body_id)


## The reveal of a body, loaded when it is not known yet.
func ensure_reveal(body_id: String) -> RevealMap:
	if has_reveal(body_id):
		return reveal(body_id)
	return await load_reveal(body_id)


func _on_event(event: SseEvent) -> void:
	if not event.type.begins_with("probe."):
		return
	var data := Wire.parse_object(event.data)
	var probe := list.apply(Wire.as_dict(data.get("probe")))
	if probe == null:
		return
	loaded = true
	changed.emit()
	if event.type == "probe.arrived":
		if has_reveal(probe.body_id):
			load_reveal(probe.body_id)
		arrived.emit(probe, Wire.as_int(data.get("sightings")))


func _on_resync(_rev: int) -> void:
	reload()
	for body_id: String in _reveals.keys():
		load_reveal(body_id)
