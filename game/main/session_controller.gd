class_name SessionController
extends Node
## Signs the player in and out and keeps the session across restarts.
##
## The token is only dropped when the backend says the session is gone (UNAUTHENTICATED) or the
## player signs out — never because the server could not be reached.

signal changed

enum Status {
	## Checking a stored token at start-up.
	RESTORING,
	SIGNED_OUT,
	SIGNED_IN,
	## A token exists but the backend did not answer; `last_error` says why. Call `retry`.
	UNREACHABLE,
}

var status: Status = Status.RESTORING
## The signed-in account; null unless SIGNED_IN.
var account: Account = null
## Why the last attempt to reach the backend failed; null otherwise.
var last_error: ApiError = null

var _server: ServerUrl
var _api: ApiClient
var _events: EventStream
var _store: SessionStore


## The server ended a stored session (it rejected the token: signed out elsewhere, expired, or
## — in the test phase — the world was reset with all accounts). Cleared by the next sign-in and
## by signing out here.
var session_ended := false


func setup(server: ServerUrl, api: ApiClient, events: EventStream, store: SessionStore) -> void:
	_server = server
	_api = api
	_events = events
	_store = store
	_events.event_received.connect(_on_event)
	_events.unauthenticated.connect(_on_stream_unauthenticated)


## Start-up: continue a stored session if there is one.
func restore() -> void:
	_set_status(Status.RESTORING)
	var token := _store.load_token(_server.base)
	if token.is_empty():
		_set_status(Status.SIGNED_OUT)
		return
	_api.token = token
	_log_token(token)
	await _load_account()


## Try again after UNREACHABLE.
func retry() -> void:
	_set_status(Status.RESTORING)
	await _load_account()


## Returns null on success, otherwise the reason.
func login(email: String, password: String) -> ApiError:
	return await _authenticate("/v2/auth/login", {"email": email, "password": password})


## Creates an account (with its starter colony) and signs in. Returns null on success.
func register(email: String, password: String, player_name: String) -> ApiError:
	var body := {"email": email, "password": password, "playerName": player_name}
	return await _authenticate("/v2/auth/register", body)


## Asks the backend to mail a reset code. The answer is the same whether the account exists or
## not. Returns null on success, otherwise the reason.
func request_password_reset(email: String) -> ApiError:
	var result := await _api.post_json("/v2/auth/password-reset", {"email": email}, false)
	return null if result.is_ok() else result.error


## Sets a new password with the mailed code and signs in (every other session of the account
## ends). Returns null on success.
func confirm_password_reset(email: String, code: String, new_password: String) -> ApiError:
	var body := {"email": email, "code": code, "newPassword": new_password}
	return await _authenticate("/v2/auth/password-reset/confirm", body)


func logout() -> void:
	_events.stop()
	if not _api.token.is_empty():
		# Best effort: the local session ends even when the backend cannot be told.
		await _api.post_json("/v2/auth/logout", {})
	_forget_session()
	session_ended = false
	_set_status(Status.SIGNED_OUT)


func _authenticate(path: String, body: Dictionary) -> ApiError:
	var result := await _api.post_json(path, body, false)
	if not result.is_ok():
		return result.error
	var token := Wire.as_string(result.data.get("token"))
	if not SessionStore.is_token(token):
		var malformed := ApiError.new()
		malformed.code = ApiResult.CODE_MALFORMED_RESPONSE
		return malformed
	_api.token = token
	session_ended = false
	_store.save_token(_server.base, token)
	_log_token(token)
	await _load_account()
	return null if status == Status.SIGNED_IN else last_error


func _load_account() -> void:
	var result := await _api.get_json("/v2/me")
	if result.is_ok():
		last_error = null
		account = Account.from_me(result.data)
		_events.start(_server, _api.token, result.rev)
		_set_status(Status.SIGNED_IN)
	elif result.error.is_unauthenticated():
		last_error = result.error
		_forget_session()
		session_ended = true
		_set_status(Status.SIGNED_OUT)
	else:
		last_error = result.error
		_set_status(Status.UNREACHABLE)


func _forget_session() -> void:
	_events.stop()
	_api.token = ""
	account = null
	_store.clear()


func _on_event(event: SseEvent) -> void:
	# `session.ended` goes to every stream of the player and does not name the session, so ask
	# the backend whether ours is the one that ended.
	if event.type == "session.ended" and status == Status.SIGNED_IN:
		_verify_session()


func _verify_session() -> void:
	var result := await _api.get_json("/v2/me")
	if not result.is_ok() and result.error.is_unauthenticated():
		last_error = result.error
		_forget_session()
		session_ended = true
		_set_status(Status.SIGNED_OUT)


func _on_stream_unauthenticated() -> void:
	if status != Status.SIGNED_IN:
		return
	_forget_session()
	session_ended = true
	_set_status(Status.SIGNED_OUT)


func _set_status(new_status: Status) -> void:
	status = new_status
	changed.emit()


## Debug builds print the token once per sign-in and restore (Android: `adb logcat -s godot`),
## so API problems can be reproduced with curl. Release builds never print it.
func _log_token(token: String) -> void:
	if OS.is_debug_build():
		print("[TradeEmpire][AUTH] Bearer token: ", token)
