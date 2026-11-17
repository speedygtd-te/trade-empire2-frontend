extends Node
## Autoload "Services": owns the long-lived objects and wires them together.
##
## Server address: `--server=<url>` after `--` on the command line wins, otherwise the project
## setting `trade_empire/server/base_url` (its `.editor` override points at the local
## development backend, exported builds use the real server).

const SETTING_SERVER := "trade_empire/server/base_url"
const FALLBACK_SERVER := "https://trade-empire.net"

var server: ServerUrl
var api: ApiClient
var events: EventStream
var clock: GameClock
var session: SessionController


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

	api.meta_received.connect(_on_meta_received)
	events.ready_received.connect(_on_stream_ready)
	events.state_changed.connect(_on_stream_state_changed)


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
## is down, and without the channel we cannot tell. `ready` carries no game time, so fetch it.
func _on_stream_ready(_rev: int) -> void:
	var health := await api.get_json("/v2/health", false)
	if not health.is_ok() or health.game_time_ms < 0:
		return
	if events.state() != EventStream.State.OPEN:
		return
	clock.resync(health.game_time_ms)
	clock.set_running(true)


func _on_stream_state_changed(state: EventStream.State) -> void:
	if state != EventStream.State.OPEN:
		clock.set_running(false)
