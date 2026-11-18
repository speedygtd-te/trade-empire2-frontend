extends Node
## Autoload "Services": owns the long-lived objects and wires them together.
##
## Server address: `--server=<url>` after `--` on the command line wins, otherwise the project
## setting `trade_empire/server/base_url` (the live server; the export preset "Android Local"
## overrides it with the local development backend).

## Emitted when game data became available or changed.
signal definitions_loaded

const SETTING_SERVER := "trade_empire/server/base_url"
const FALLBACK_SERVER := "https://trade-empire.net"

var server: ServerUrl
var api: ApiClient
var events: EventStream
var clock: GameClock
var session: SessionController
## The static game data; null until the first load finished with a result.
var definitions: GameDefinitions
var _definitions_source: DefinitionsSource


func _ready() -> void:
	server = _resolve_server()
	clock = GameClock.new()

	api = ApiClient.new()
	api.name = "ApiClient"
	api.base_url = server.base
	add_child(api)

	events = EventStream.new()
	events.name = "EventStream"
	add_child(events)

	session = SessionController.new()
	session.name = "SessionController"
	session.setup(server, api, events, SessionStore.new())
	add_child(session)

	_definitions_source = DefinitionsSource.new()
	_definitions_source.name = "DefinitionsSource"
	_definitions_source.setup(api, DefinitionsCache.new(), server.base)
	add_child(_definitions_source)

	api.meta_received.connect(_on_meta_received)
	events.ready_received.connect(_on_stream_ready)
	events.state_changed.connect(_on_stream_state_changed)
	load_definitions.call_deferred()


## Loads the game data (public, no sign-in needed). A failed load keeps what is there.
func load_definitions() -> void:
	var outcome := await _definitions_source.load_definitions()
	if outcome.error != null:
		push_warning("Game data: %s" % outcome.error.code)
	if outcome.definitions != null:
		definitions = outcome.definitions
		definitions_loaded.emit()


func _resolve_server() -> ServerUrl:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--server="):
			var from_argument := ServerUrl.parse(argument.trim_prefix("--server="))
			if from_argument != null:
				return from_argument
			push_warning("Ignoring invalid --server address: " + argument)
	var configured: Variant = ProjectSettings.get_setting_with_override(SETTING_SERVER)
	var from_setting := ServerUrl.parse(Wire.as_string(configured))
	if from_setting != null:
		return from_setting
	return ServerUrl.parse(FALLBACK_SERVER)


func _on_meta_received(_rev: int, game_time_ms: int) -> void:
	clock.sync(game_time_ms)


## The clock only runs while the event channel is up: game time stands still while the backend
## is down, and without the channel we cannot tell. `ready` carries the backend's game time, so
## the clock is set again on every (re)connect.
func _on_stream_ready(_rev: int, game_time_ms: int) -> void:
	if game_time_ms < 0:
		return
	clock.resync(game_time_ms)
	clock.set_running(true)


func _on_stream_state_changed(state: EventStream.State) -> void:
	if state != EventStream.State.OPEN:
		clock.set_running(false)
