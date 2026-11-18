extends SceneTree
## End-to-end check of the session flow against a running backend.
##
## Run through tools\smoke.ps1 (live server by default).
## Registers a fresh throwaway account on every run and makes five sign-in/registration calls;
## the backend allows ten per minute and address, so do not run it more than once a minute.

const DEFAULT_SERVER := "https://trade-empire.net"

## Fresh per run, so a throwaway account on a public server has no guessable password.
var _password := ""
var _failures := 0
var _event_types: Array[String] = []
var _ready_revs: Array[int] = []
var _resync_revs: Array[int] = []
var _ready_game_times: Array[int] = []


func _initialize() -> void:
	_run()


func _check(ok: bool, label: String) -> void:
	if not ok:
		_failures += 1
	print("%s  %s" % ["PASS" if ok else "FAIL", label])


func _wait_until(condition: Callable, timeout_ms: int) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_ms
	while Time.get_ticks_msec() < deadline:
		var met: bool = condition.call()
		if met:
			return true
		await process_frame
	var met_at_end: bool = condition.call()
	return met_at_end


func _code(error: ApiError) -> String:
	if error == null:
		return "(none)"
	return "transport: " + error.message if error.is_transport() else error.code


func _server_text() -> String:
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--server="):
			return argument.trim_prefix("--server=")
	return DEFAULT_SERVER


func _new_api(base: String) -> ApiClient:
	var api := ApiClient.new()
	api.base_url = base
	root.add_child(api)
	return api


func _new_session(server: ServerUrl, api: ApiClient, events: EventStream, path: String) -> SessionController:
	var session := SessionController.new()
	session.setup(server, api, events, SessionStore.new(path))
	root.add_child(session)
	return session


func _on_ready_received(rev: int, game_time_ms: int) -> void:
	_ready_revs.append(rev)
	_ready_game_times.append(game_time_ms)


func _on_resync_requested(rev: int) -> void:
	_resync_revs.append(rev)


func _on_event_received(event: SseEvent) -> void:
	_event_types.append(event.type)


## Game data: downloaded once, then confirmed unchanged (304) and taken from the local copy.
## Needs no account.
func _check_definitions(server: ServerUrl) -> void:
	var cache_path := "user://smoke_definitions_%d.json" % Time.get_ticks_usec()
	var cache := DefinitionsCache.new(cache_path)
	var source := DefinitionsSource.new()
	source.setup(_new_api(server.base), cache, server.base)
	root.add_child(source)

	var first := await source.load_definitions()
	_check(first.error == null and first.definitions != null and not first.from_cache,
		"definitions: downloaded (error: %s)" % (_code(first.error)))
	if first.definitions == null:
		return
	var definitions := first.definitions
	_check(definitions.module_count() > 0 and definitions.hull_count() > 0 and definitions.resource_count() > 0,
		"definitions: %d modules, %d hulls, %d resources" % [
			definitions.module_count(), definitions.hull_count(), definitions.resource_count()])
	var pump := definitions.module("PUMP")
	_check(pump != null and pump.display_name == "Pump" and pump.size == Vector3i.ONE,
		"definitions: PUMP is a 1x1x1 module named Pump")
	var starter := definitions.hull("STARTER")
	_check(starter != null and not starter.display_name.is_empty(), "definitions: STARTER hull has a name")
	_check(not definitions.resource_name("IRON").is_empty(), "definitions: resources have display names")
	_check(cache.load_entry(server.base) != null, "definitions: stored locally with its ETag")

	var second := await source.load_definitions()
	_check(second.error == null and second.from_cache and second.definitions != null
		and second.definitions.data_hash == definitions.data_hash,
		"definitions: second start -> 304, taken from the local copy")
	cache.clear()


func _run() -> void:
	# `_initialize` runs before the root node is inside the tree; nodes added now could not
	# send requests yet.
	await process_frame
	var server := ServerUrl.parse(_server_text())
	if server == null:
		print("FAIL  invalid --server address: ", _server_text())
		quit(2)
		return
	print("server: ", server.base)

	await _check_definitions(server)
	if OS.get_cmdline_user_args().has("--definitions-only"):
		print("%d check(s) failed" % _failures if _failures > 0 else "all checks passed")
		quit(1 if _failures > 0 else 0)
		return

	var stamp := int(Time.get_unix_time_from_system())
	var store_path := "user://smoke_session_%d.json" % stamp
	var email := "smoke%d@example.test" % stamp
	var player_name := "Smoke%d" % (stamp % 100000000)
	_password = "Smoke-%d-%d" % [randi() % 1000000, randi() % 1000000]
	print("account: %s / %s / %s" % [email, player_name, _password])

	var clock := GameClock.new()
	var api := _new_api(server.base)
	api.meta_received.connect(func(_rev: int, game_time: int) -> void: clock.sync(game_time))
	var events := EventStream.new()
	root.add_child(events)
	events.ready_received.connect(_on_ready_received)
	events.resync_requested.connect(_on_resync_requested)
	events.event_received.connect(_on_event_received)
	var session := _new_session(server, api, events, store_path)

	# --- start without a stored token ---
	await session.restore()
	_check(session.status == SessionController.Status.SIGNED_OUT, "start without token -> signed out")

	# --- registration ---
	var invalid := await session.register(email, "short", player_name)
	_check(_code(invalid) == "VALIDATION_FAILED", "too short password -> VALIDATION_FAILED (got %s)" % _code(invalid))
	_check(session.status == SessionController.Status.SIGNED_OUT, "failed registration leaves us signed out")

	var registered := await session.register(email, _password, player_name)
	_check(registered == null, "register -> ok (error: %s)" % _code(registered))
	if session.status != SessionController.Status.SIGNED_IN:
		print("FAIL  not signed in after registration, cannot continue")
		quit(1)
		return
	_check(session.account.player_name == player_name, "account carries the player name")
	_check(not session.account.player_id.is_empty(), "account carries a player id")
	_check(not session.account.home_body_id.is_empty(), "starter colony exists (homeBodyId %s)" % session.account.home_body_id)
	_check(SessionStore.new(store_path).load_token(server.base) == api.token, "token is stored for this server")

	# --- event channel ---
	var got_ready := await _wait_until(func() -> bool: return not _ready_revs.is_empty(), 5000)
	_check(got_ready, "event channel: ready received")
	_check(events.state() == EventStream.State.OPEN, "event channel is open")
	_check(
		not _ready_game_times.is_empty() and _ready_game_times[0] >= 0,
		"ready carries the game time"
	)

	# --- game clock ---
	clock.set_running(true)
	var before := clock.now_ms()
	await create_timer(1.0).timeout
	var advanced := clock.now_ms() - before
	_check(advanced >= 900 and advanced <= 1300, "clock advances with real time (%d ms in 1 s)" % advanced)
	var estimate := clock.now_ms()
	var health := await api.get_json("/v2/health", false)
	var offset := health.game_time_ms - estimate
	_check(health.is_ok() and absi(offset) <= 500, "clock estimate is close to the server (%d ms behind)" % offset)

	# --- a domain event: a second sign-in of the same player ---
	var other := _new_api(server.base)
	var second := await other.post_json("/v2/auth/login", {"email": email, "password": _password}, false)
	_check(second.is_ok(), "second sign-in -> ok")
	var got_created := await _wait_until(func() -> bool: return _event_types.has("session.created"), 5000)
	_check(got_created, "event: session.created received")
	_check(
		events.position().contains("-") and StreamPosition.is_valid(events.position()),
		"stream position is the id of the last event (%s)" % events.position()
	)

	# --- rejected calls ---
	var wrong := await other.post_json("/v2/auth/login", {"email": email, "password": "wrong-password-1"}, false)
	_check(_code(wrong.error) == "INVALID_CREDENTIALS", "wrong password -> INVALID_CREDENTIALS (got %s)" % _code(wrong.error))
	var duplicate := await other.post_json(
		"/v2/auth/register", {"email": email, "password": _password, "playerName": player_name + "x"}, false
	)
	_check(_code(duplicate.error) == "EMAIL_TAKEN", "same e-mail again -> EMAIL_TAKEN (got %s)" % _code(duplicate.error))

	# --- restart: a new controller with the same store signs in without credentials ---
	var api_restart := _new_api(server.base)
	var events_restart := EventStream.new()
	root.add_child(events_restart)
	var session_restart := _new_session(server, api_restart, events_restart, store_path)
	await session_restart.restore()
	_check(session_restart.status == SessionController.Status.SIGNED_IN, "restart with stored token -> signed in")
	_check(
		session_restart.account != null and session_restart.account.player_name == player_name,
		"restart restores the same account"
	)
	events_restart.stop()

	# --- another session of the player ends: ours must survive ---
	other.token = Wire.as_string(second.data.get("token"))
	await other.post_json("/v2/auth/logout", {})
	var got_ended := await _wait_until(func() -> bool: return _event_types.has("session.ended"), 5000)
	_check(got_ended, "event: session.ended received")
	await create_timer(0.5).timeout
	_check(session.status == SessionController.Status.SIGNED_IN, "another session ending does not sign us out")

	# --- resync: a position the backend cannot replay from ---
	_ready_revs.clear()
	events.start(server, api.token, 999999999)
	var got_resync := await _wait_until(func() -> bool: return not _resync_revs.is_empty(), 5000)
	_check(got_resync, "stale position -> resync received")
	var got_ready_again := await _wait_until(func() -> bool: return not _ready_revs.is_empty(), 8000)
	_check(got_ready_again, "stream reconnects on its own after resync")
	if got_resync:
		_check(
			events.position() == str(_resync_revs[0]) or events.position().begins_with("%d-" % _resync_revs[0]),
			"stream continues from the rev the backend named (%s)" % events.position()
		)

	# --- sign out ---
	var old_token := api.token
	await session.logout()
	_check(session.status == SessionController.Status.SIGNED_OUT, "logout -> signed out")
	_check(not session.session_ended, "own logout is not an ended session")
	_check(events.state() == EventStream.State.STOPPED, "logout stops the event channel")
	_check(SessionStore.new(store_path).load_token(server.base).is_empty(), "logout removes the stored token")
	other.token = old_token
	var after_logout := await other.get_json("/v2/me")
	_check(
		not after_logout.is_ok() and after_logout.error.is_unauthenticated(),
		"old token is rejected with UNAUTHENTICATED (got %s)" % _code(after_logout.error)
	)

	# --- stored token that the backend rejects ---
	SessionStore.new(store_path).save_token(server.base, old_token)
	await session.restore()
	_check(session.status == SessionController.Status.SIGNED_OUT, "rejected stored token -> signed out")
	_check(SessionStore.new(store_path).load_token(server.base).is_empty(), "rejected stored token is removed")
	_check(session.session_ended, "rejected stored token -> the login screen says the session ended")

	# --- server not reachable: the token must survive ---
	var dead := ServerUrl.parse("http://127.0.0.1:9")
	var dead_path := "user://smoke_dead_%d.json" % stamp
	var kept_token := "a".repeat(64)
	SessionStore.new(dead_path).save_token(dead.base, kept_token)
	var dead_events := EventStream.new()
	root.add_child(dead_events)
	var dead_session := _new_session(dead, _new_api(dead.base), dead_events, dead_path)
	await dead_session.restore()
	_check(dead_session.status == SessionController.Status.UNREACHABLE, "server not reachable -> unreachable, not signed out")
	_check(
		dead_session.last_error != null and dead_session.last_error.is_transport(),
		"unreachable is reported as a transport failure"
	)
	_check(SessionStore.new(dead_path).load_token(dead.base) == kept_token, "token survives an unreachable server")

	SessionStore.new(store_path).clear()
	SessionStore.new(dead_path).clear()
	print("%s  (%d failed)" % ["SMOKE GREEN" if _failures == 0 else "SMOKE RED", _failures])
	quit(0 if _failures == 0 else 1)
