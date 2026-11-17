class_name EventStream
extends Node
## Keeps the backend's event channel (`GET /v2/events`, Server-Sent Events) open.
##
## The stream is read incrementally with the low-level HTTPClient, polled once per frame. It
## reconnects on its own with growing delays and resumes with `since=<position>`, where the
## position is the id of the last event seen ("<rev>-<seq>"). The backend then continues right
## after that event, so nothing is lost or repeated, even when the connection dropped between
## two events of the same rev. A heartbeat comment arrives every 15 s; when nothing arrives for
## SILENCE_TIMEOUT_MS the connection counts as dead.
##
## Event handlers must tolerate seeing an event twice: after a `resync` the app reloads its
## state and the stream continues from the rev the backend named.

## A domain event (everything except `ready` and `resync`).
signal event_received(event: SseEvent)
## The stream is established; `rev` is the backend's state at that moment and `game_time_ms`
## its game time (-1 if the backend sent none).
signal ready_received(rev: int, game_time_ms: int)
## The backend cannot replay from our position. Reload state; the stream reconnects from `rev`.
signal resync_requested(rev: int)
## The backend rejected the token. The stream stops.
signal unauthenticated
signal state_changed(state: State)

enum State {
	## Not running: never started, stopped, or the app is in the background.
	STOPPED,
	## Opening the connection and waiting for the response head.
	CONNECTING,
	## Receiving events.
	OPEN,
	## Waiting before the next connection attempt.
	WAITING,
}

const PATH := "/v2/events"
const CONNECT_TIMEOUT_MS := 10000
const SILENCE_TIMEOUT_MS := 40000

var _server: ServerUrl = null
var _token := ""
## Where to resume: a StreamPosition, "" to start at the backend's current state.
var _since := ""
var _state: State = State.STOPPED
var _client: HTTPClient = null
var _request_sent := false
var _deadline_ms := 0
var _last_bytes_ms := 0
var _resume_on_foreground := false
var _buffer := LineBuffer.new()
var _parser := SseParser.new()
var _backoff := Backoff.new()


## Opens the channel. `since_rev` is the rev of the state the app has loaded (e.g. the `rev` of
## the login or `/v2/me` response), so nothing between loading and connecting is missed; -1
## starts at the backend's current state.
func start(server: ServerUrl, token: String, since_rev: int) -> void:
	stop()
	_server = server
	_token = token
	_since = StreamPosition.from_rev(since_rev)
	_backoff.reset()
	_open_connection()


func stop() -> void:
	_resume_on_foreground = false
	_close()
	_set_state(State.STOPPED)


func state() -> State:
	return _state


## Where the stream would resume: the id of the last event seen, otherwise the rev it was
## started or resynchronised with. "" before anything is known.
func position() -> String:
	return _since


func _process(_delta: float) -> void:
	match _state:
		State.CONNECTING:
			_poll_connecting()
		State.OPEN:
			_poll_open()
		State.WAITING:
			if Time.get_ticks_msec() >= _deadline_ms:
				_open_connection()


func _notification(what: int) -> void:
	# A mobile OS may cut the socket while the app is in the background without telling us.
	# Close it ourselves and reconnect with `since` when the app comes back.
	if what == NOTIFICATION_APPLICATION_PAUSED:
		if _state != State.STOPPED:
			_close()
			_set_state(State.STOPPED)
			_resume_on_foreground = true
	elif what == NOTIFICATION_APPLICATION_RESUMED:
		if _resume_on_foreground:
			_resume_on_foreground = false
			_backoff.reset()
			_open_connection()


func _open_connection() -> void:
	_close()
	_buffer.clear()
	_parser.reset()
	_request_sent = false
	_client = HTTPClient.new()
	var tls: TLSOptions = TLSOptions.client() if _server.tls else null
	if _client.connect_to_host(_server.host, _server.port, tls) != OK:
		_retry_later()
		return
	_deadline_ms = Time.get_ticks_msec() + CONNECT_TIMEOUT_MS
	_set_state(State.CONNECTING)


func _poll_connecting() -> void:
	if Time.get_ticks_msec() > _deadline_ms:
		_retry_later()
		return
	_client.poll()
	match _client.get_status():
		HTTPClient.STATUS_RESOLVING, HTTPClient.STATUS_CONNECTING, HTTPClient.STATUS_REQUESTING:
			pass
		HTTPClient.STATUS_CONNECTED:
			if _request_sent:
				# An answer without body: nothing to stream.
				_on_response_head()
			else:
				_send_request()
		HTTPClient.STATUS_BODY:
			_on_response_head()
		_:
			_retry_later()


func _send_request() -> void:
	var path := PATH
	if not _since.is_empty():
		path += "?since=" + _since
	var headers: PackedStringArray = ["Authorization: Bearer " + _token, "Accept: text/event-stream"]
	if _client.request(HTTPClient.METHOD_GET, path, headers) != OK:
		_retry_later()
		return
	_request_sent = true


func _on_response_head() -> void:
	var code := _client.get_response_code()
	if code == HTTPClient.RESPONSE_OK and _client.get_status() == HTTPClient.STATUS_BODY:
		_last_bytes_ms = Time.get_ticks_msec()
		_set_state(State.OPEN)
	elif code == HTTPClient.RESPONSE_UNAUTHORIZED:
		_close()
		_set_state(State.STOPPED)
		unauthenticated.emit()
	else:
		_retry_later()


func _poll_open() -> void:
	_client.poll()
	while _client.get_status() == HTTPClient.STATUS_BODY:
		var chunk := _client.read_response_body_chunk()
		if chunk.is_empty():
			break
		_last_bytes_ms = Time.get_ticks_msec()
		for line: String in _buffer.push(chunk):
			var event := _parser.push_line(line)
			if event != null:
				_handle_event(event)
			if _state != State.OPEN:
				# A handler stopped or restarted the stream.
				return
		_client.poll()

	if _client.get_status() != HTTPClient.STATUS_BODY:
		_retry_later()
	elif Time.get_ticks_msec() - _last_bytes_ms > SILENCE_TIMEOUT_MS:
		_retry_later()


func _handle_event(event: SseEvent) -> void:
	if StreamPosition.is_valid(event.id):
		_since = event.id
	match event.type:
		"ready":
			_backoff.reset()
			var data := Wire.parse_object(event.data)
			var rev := Wire.as_int(data.get("rev"), -1)
			if _since.is_empty():
				_since = StreamPosition.from_rev(rev)
			ready_received.emit(rev, Wire.as_int(data.get("gameTime"), -1))
		"resync":
			# The backend ends the stream after this event; reconnect from the rev it named.
			var rev := Wire.as_int(Wire.parse_object(event.data).get("rev"), -1)
			_since = StreamPosition.from_rev(rev)
			resync_requested.emit(rev)
		_:
			event_received.emit(event)


func _retry_later() -> void:
	_close()
	_deadline_ms = Time.get_ticks_msec() + _backoff.next_delay_ms()
	_set_state(State.WAITING)


func _close() -> void:
	if _client != null:
		_client.close()
		_client = null


func _set_state(new_state: State) -> void:
	if new_state == _state:
		return
	_state = new_state
	state_changed.emit(new_state)
