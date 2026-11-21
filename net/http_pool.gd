class_name HttpPool
extends RefCounted
## A few HTTP/1.1 connections to one server, kept open between calls (keep-alive): a call
## costs one round trip instead of a new TCP and TLS handshake each time. Every connection
## carries one call at a time; calls wait in order for a free one. The owner polls the pool
## every frame (`poll`); nothing here blocks.
##
## A call that failed on a kept connection before any answer came (the server closed it while
## idle) is sent once more on a new one, but only when running it twice is harmless
## (HttpReply.may_retry). Calls that must not run twice only go over fresh connections.

## Connections open at most at the same time.
const MAX_CONNECTIONS := 4
## An idle connection is closed after this long (Caddy keeps them for minutes).
const IDLE_LIMIT_MS := 60000
## How often idle connections are polled to notice that the server closed them.
const IDLE_POLL_MS := 250
## Body reads per connection and poll at most (each up to `read_chunk_size`).
const READS_PER_POLL := 64


## One call: what to send, and the answer once `done`.
class Call:
	extends RefCounted
	signal finished
	var method: HTTPClient.Method = HTTPClient.METHOD_GET
	var path := ""
	var headers: PackedStringArray = []
	var body := ""
	var timeout_ms := 15000
	var attempts := 0
	var done := false
	## The answer: HTTP status, headers and the raw body (still packed); `failure` says why
	## there is none (then `status` is 0).
	var status := 0
	var response_headers: PackedStringArray = []
	var payload := PackedByteArray()
	var failure := ""
	## When the call got a connection, and when it finished (ms since start).
	var started_ms := 0
	var finished_ms := 0


## One connection and the call it carries.
class Link:
	extends RefCounted
	var client := HTTPClient.new()
	var call: Call = null
	var sent := false
	var answered := false
	## Whether this connection already carried a call before the current one.
	var reused := false
	var idle_since_ms := 0
	var deadline_ms := 0


var host := ""
var port := 0
var tls := false
## Counters for measuring: calls sent (each attempt) and connections opened.
var calls_sent := 0
var connections_opened := 0

var _links: Array[Link] = []
var _queue: Array[Call] = []
var _last_idle_poll_ms := 0


func _init(server_host: String, server_port: int, use_tls: bool) -> void:
	host = server_host
	port = server_port
	tls = use_tls


## Queues a call; await `call.finished` (or check `call.done`) for the answer.
func send(call: Call) -> void:
	_queue.append(call)


## Calls queued or on the way.
func busy() -> int:
	var count := _queue.size()
	for link: Link in _links:
		if link.call != null:
			count += 1
	return count


## Connections open now (idle or carrying a call).
func open_connections() -> int:
	return _links.size()


## Closes every connection; calls on the way and waiting fail.
func close_all(reason: String) -> void:
	for link: Link in _links:
		if link.call != null:
			_finish(link.call, reason)
		link.client.close()
	_links.clear()
	var waiting := _queue.duplicate()
	_queue.clear()
	for call: Call in waiting:
		_finish(call, reason)


## Moves every connection on; hands waiting calls to free connections.
func poll(now_ms: int) -> void:
	_assign(now_ms)
	var poll_idle := now_ms - _last_idle_poll_ms >= IDLE_POLL_MS
	if poll_idle:
		_last_idle_poll_ms = now_ms
	for link: Link in _links.duplicate():
		if link.call != null:
			_step(link, now_ms)
		elif poll_idle:
			_check_idle(link, now_ms)
	_assign(now_ms)


func _assign(now_ms: int) -> void:
	while not _queue.is_empty():
		var call: Call = _queue[0]
		var link := _free_link(call, now_ms)
		if link == null:
			return
		_queue.pop_front()
		_start(link, call, now_ms)


## An idle open connection that may carry `call`, else a new one while there is room; idle
## connections too old for it are closed to make room.
func _free_link(call: Call, now_ms: int) -> Link:
	for link: Link in _links:
		if link.call == null and link.client.get_status() == HTTPClient.STATUS_CONNECTED \
				and HttpReply.may_reuse(call.method, now_ms - link.idle_since_ms, IDLE_LIMIT_MS):
			return link
	# A closed one connects again.
	for link: Link in _links:
		if link.call == null and link.client.get_status() != HTTPClient.STATUS_CONNECTED:
			return link
	if _links.size() >= MAX_CONNECTIONS:
		for link: Link in _links:
			if link.call == null:
				_drop(link)
				break
	if _links.size() >= MAX_CONNECTIONS:
		return null
	var fresh := Link.new()
	_links.append(fresh)
	return fresh


func _start(link: Link, call: Call, now_ms: int) -> void:
	call.attempts += 1
	if call.started_ms == 0:
		call.started_ms = now_ms
	link.call = call
	link.sent = false
	link.answered = false
	link.deadline_ms = now_ms + call.timeout_ms
	call.status = 0
	call.response_headers = PackedStringArray()
	call.payload = PackedByteArray()
	if link.client.get_status() == HTTPClient.STATUS_CONNECTED:
		link.reused = true
		return
	link.reused = false
	link.client.close()
	var options: TLSOptions = TLSOptions.client() if tls else null
	var error := link.client.connect_to_host(host, port, options)
	connections_opened += 1
	if error != OK:
		_fail(link, "could not connect (%d)" % error)


## One call's way: connect, send, wait, read the body; several steps in one poll when the
## answer is there already.
func _step(link: Link, now_ms: int) -> void:
	if now_ms > link.deadline_ms:
		_fail(link, "timeout")
		return
	var call := link.call
	for _round: int in READS_PER_POLL:
		var error := link.client.poll()
		var status := link.client.get_status()
		match status:
			HTTPClient.STATUS_RESOLVING, HTTPClient.STATUS_CONNECTING, HTTPClient.STATUS_REQUESTING:
				if error != OK:
					_fail(link, "connection failed (%d)" % error)
				return
			HTTPClient.STATUS_CONNECTED:
				if not link.sent:
					var sent := link.client.request(call.method, call.path, call.headers, call.body)
					if sent != OK:
						_fail(link, "request could not be sent (%d)" % sent)
						return
					link.sent = true
					calls_sent += 1
					continue
				# An answer without a body (204, 304, HEAD).
				_take_answer(link)
				_complete(link, now_ms)
				return
			HTTPClient.STATUS_BODY:
				_take_answer(link)
				var chunk := link.client.read_response_body_chunk()
				if chunk.is_empty():
					if link.client.get_status() != HTTPClient.STATUS_BODY:
						continue
					return
				call.payload.append_array(chunk)
			HTTPClient.STATUS_DISCONNECTED:
				# A body that runs until the server closes ends here.
				if link.answered and link.sent:
					_complete(link, now_ms)
				else:
					_fail(link, "connection closed")
				return
			_:
				_fail(link, "connection failed (status %d)" % status)
				return


## Notes status and headers the first time they are there.
func _take_answer(link: Link) -> void:
	if link.answered or not link.client.has_response():
		return
	link.answered = true
	link.call.status = link.client.get_response_code()
	link.call.response_headers = link.client.get_response_headers()


func _complete(link: Link, now_ms: int) -> void:
	var call := link.call
	link.call = null
	link.idle_since_ms = now_ms
	if not link.answered:
		_drop(link)
		_finish(call, "no answer")
		return
	if not HttpReply.keeps_alive(call.response_headers) \
			or link.client.get_status() != HTTPClient.STATUS_CONNECTED:
		_drop(link)
	call.finished_ms = now_ms
	call.done = true
	call.finished.emit()


func _fail(link: Link, reason: String) -> void:
	var call := link.call
	link.call = null
	var retry := HttpReply.may_retry(call.method, link.reused, link.answered, call.attempts)
	_drop(link)
	if retry:
		_queue.push_front(call)
		return
	_finish(call, reason)


func _finish(call: Call, reason: String) -> void:
	call.status = 0
	call.failure = reason
	call.finished_ms = Time.get_ticks_msec()
	call.done = true
	call.finished.emit()


## An idle connection: closed when the server closed it or it waited too long.
func _check_idle(link: Link, now_ms: int) -> void:
	if now_ms - link.idle_since_ms >= IDLE_LIMIT_MS:
		_drop(link)
		return
	link.client.poll()
	if link.client.get_status() != HTTPClient.STATUS_CONNECTED:
		_drop(link)


func _drop(link: Link) -> void:
	link.client.close()
	_links.erase(link)
