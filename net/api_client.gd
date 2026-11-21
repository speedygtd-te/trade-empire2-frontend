class_name ApiClient
extends Node
## Sends JSON requests to the backend and returns an ApiResult.
##
## Only for ordinary request/response calls; the whole answer is buffered. Streamed answers (the
## event channel) are read incrementally elsewhere.
##
## Calls to the backend go over a few kept-alive connections (HttpPool, polled here every frame):
## one round trip per call instead of a TCP and TLS handshake each. The same GET asked for again
## while it is on the way is sent once and shared; bodies and systems, which do not change, are
## kept for the session (ResponseCache). Large raw answers (`get_text`) and files (`get_bytes`)
## still use an HTTPRequest of their own: they read on a thread.

## Emitted for every success response, which always carries `rev` and `gameTime`.
signal meta_received(rev: int, game_time_ms: int)
## Debug: every call that went to the server, when it finished (for measuring:
## smoke/startup_measure). `status` 0 when no answer came.
signal request_done(method_name: String, path: String, status: int, ms: int)

const TIMEOUT_SECONDS := 15.0
## Read size per poll for raw answers (`get_text`).
const RAW_CHUNK_SIZE := 1 << 20

## "scheme://host[:port]" without trailing slash.
var base_url: String = ""
## Session token; sent as bearer token on authorised calls. "" when signed out.
var token: String = ""
## Debug counters: calls sent to the server and connections opened since start.
var requests_sent := 0
var connections_opened := 0
## Calls on the way (sent or waiting for a connection).
var in_flight := 0

var _pool: HttpPool = null
## The base_url the pool was made for.
var _pool_base := ""
## GETs on the way: key → HttpPool.Call (shared by callers asking for the same).
var _sharing: Dictionary = {}
var _cache := ResponseCache.new()
## Connections opened outside the pool (threaded calls, files, earlier pools).
var _other_connections := 0


func _process(_delta: float) -> void:
	if _pool != null:
		_pool.poll(Time.get_ticks_msec())
	connections_opened = _other_connections + (_pool.connections_opened if _pool != null else 0)


func get_json(path: String, authorised: bool = true) -> ApiResult:
	return await _send(HTTPClient.METHOD_GET, path, "", authorised)


## GET of an NDJSON stream (layout, surface). These streams end, so the whole answer is
## buffered and split into lines; the proxy compresses them, the client unpacks that.
func get_ndjson(path: String) -> ApiResult:
	return await _send(HTTPClient.METHOD_GET, path, "", true, ["Accept: application/x-ndjson"], false, true)


## GET whose answer is kept as text, unparsed, in `body` (ApiResult.from_raw): for large answers
## the caller parses away from the main thread, such as the galaxy's systems (NDJSON).
func get_text(path: String, accept: String) -> ApiResult:
	return await _send(HTTPClient.METHOD_GET, path, "", true, ["Accept: " + accept], true, false, true)


## Conditional GET for unchanging documents (definitions): sends `If-None-Match` when
## `etag` is set. The result keeps the raw body and the response's ETag, so the caller can
## store both; a 304 comes back as `not_modified`.
func get_cached(path: String, etag: String, authorised: bool = false) -> ApiResult:
	var extra: PackedStringArray = []
	if not etag.is_empty():
		extra.append("If-None-Match: " + etag)
	return await _send(HTTPClient.METHOD_GET, path, "", authorised, extra, true)


## POST with a JSON body. An empty dictionary sends no body at all (e.g. logout).
## Integer fields must be real `int` values: a float would be written as `5.0` and rejected.
func post_json(path: String, body: Dictionary, authorised: bool = true) -> ApiResult:
	var text := "" if body.is_empty() else JSON.stringify(body)
	return await _send(HTTPClient.METHOD_POST, path, text, authorised)


func put_json(path: String, body: Dictionary, authorised: bool = true) -> ApiResult:
	return await _send(HTTPClient.METHOD_PUT, path, JSON.stringify(body), authorised)


## PATCH with a JSON body: fields left out stay as they are (routes, storage modes).
func patch_json(path: String, body: Dictionary, authorised: bool = true) -> ApiResult:
	return await _send(HTTPClient.METHOD_PATCH, path, JSON.stringify(body), authorised)


## DELETE without a body (routes).
func delete_json(path: String, authorised: bool = true) -> ApiResult:
	return await _send(HTTPClient.METHOD_DELETE, path, "", authorised)


## GET of a public file as bytes: an absolute URL as it is (enterprise logos in the CDN since
## draft.34), a server-relative path (`/assets/…`) on this server. Empty when the call failed.
func get_bytes(path: String) -> PackedByteArray:
	var request := HTTPRequest.new()
	request.timeout = TIMEOUT_SECONDS
	add_child(request)
	_other_connections += 1
	if request.request(ServerUrl.resolve(base_url, path)) != OK:
		request.queue_free()
		return PackedByteArray()
	var response: Array = await request.request_completed
	request.queue_free()
	var outcome: int = response[0]
	var status: int = response[1]
	var payload: PackedByteArray = response[3]
	if outcome != HTTPRequest.RESULT_SUCCESS or status != 200:
		return PackedByteArray()
	return payload


## Calls on the way or waiting, and connections kept open (for measuring).
func pool_stats() -> Dictionary:
	if _pool == null:
		return {"busy": 0, "open": 0}
	return {"busy": _pool.busy(), "open": _pool.open_connections()}


func _send(method: HTTPClient.Method, path: String, body: String, authorised: bool,
		extra_headers: PackedStringArray = [], keep_body: bool = false, ndjson: bool = false,
		raw: bool = false) -> ApiResult:
	var headers: PackedStringArray = [] if ndjson or raw else ["Accept: application/json"]
	headers.append_array(extra_headers)
	if not body.is_empty():
		headers.append("Content-Type: application/json")
	var bearer := token if authorised else ""
	if not bearer.is_empty():
		headers.append("Authorization: Bearer " + bearer)

	var plain := method == HTTPClient.METHOD_GET and not ndjson and not raw and not keep_body
	if plain and ResponseCache.is_cacheable(path):
		var kept := _cache.lookup(path, bearer)
		if not kept.is_empty():
			return ApiResult.from_http(200, kept)

	var answer: Answer
	if raw:
		answer = await _send_threaded(method, path, headers, body)
	else:
		answer = await _send_pooled(method, path, headers, body)
	if not answer.failure.is_empty():
		return ApiResult.failed(ApiError.transport(answer.failure))

	var text := answer.payload.get_string_from_utf8()
	var result: ApiResult
	if raw:
		result = ApiResult.from_raw(answer.status, text)
	elif ndjson:
		result = ApiResult.from_ndjson(answer.status, text)
	else:
		result = ApiResult.from_http(answer.status, text)
	result.etag = ApiResult.etag_from_headers(answer.headers)
	if keep_body and result.is_ok() and not result.not_modified:
		result.body = text
	if plain and result.is_ok() and answer.status == 200:
		_cache.store(path, bearer, text)
	if result.is_ok() and result.rev >= 0 and result.game_time_ms >= 0:
		meta_received.emit(result.rev, result.game_time_ms)
	return result


## What came back: status, headers and the unpacked body, or why nothing came.
class Answer:
	extends RefCounted
	var status := 0
	var headers: PackedStringArray = []
	var payload := PackedByteArray()
	var failure := ""


## Over the kept connections. The same GET on the way already (same headers) is not sent again:
## this caller waits for that answer.
func _send_pooled(method: HTTPClient.Method, path: String, headers: PackedStringArray, body: String) -> Answer:
	var pool := _ensure_pool()
	var answer := Answer.new()
	if pool == null:
		answer.failure = "invalid server address"
		return answer
	var key := ""
	if method == HTTPClient.METHOD_GET:
		key = path + "\n" + "\n".join(headers)
	var call := _sharing.get(key) as HttpPool.Call if not key.is_empty() else null
	if call == null:
		call = HttpPool.Call.new()
		call.method = method
		call.path = path
		call.headers = headers.duplicate()
		call.headers.append("Accept-Encoding: gzip")
		call.body = body
		call.timeout_ms = int(TIMEOUT_SECONDS * 1000.0)
		if not key.is_empty():
			_sharing[key] = call
		in_flight += 1
		requests_sent += 1
		pool.send(call)
		await call.finished
		in_flight -= 1
		if not key.is_empty() and _sharing.get(key) == call:
			_sharing.erase(key)
		request_done.emit(str(method), path, call.status, call.finished_ms - call.started_ms)
	elif not call.done:
		await call.finished
	if not call.failure.is_empty():
		answer.failure = call.failure
		return answer
	var unpacked := HttpReply.unpack(call.response_headers, call.payload)
	if not unpacked.ok:
		answer.failure = "answer could not be unpacked"
		return answer
	answer.status = call.status
	answer.headers = call.response_headers
	answer.payload = unpacked.bytes
	return answer


## Over an HTTPRequest of its own that reads on a thread, in big chunks: for answers of
## megabytes, which would otherwise be read 64 KiB per frame on the main thread.
func _send_threaded(method: HTTPClient.Method, path: String, headers: PackedStringArray, body: String) -> Answer:
	var answer := Answer.new()
	var request := HTTPRequest.new()
	request.timeout = TIMEOUT_SECONDS
	request.download_chunk_size = RAW_CHUNK_SIZE
	request.use_threads = true
	add_child(request)
	in_flight += 1
	requests_sent += 1
	_other_connections += 1
	var started_ms := Time.get_ticks_msec()
	var started := request.request(base_url + path, headers, method, body)
	if started != OK:
		in_flight -= 1
		request.queue_free()
		answer.failure = "request could not be started (%d)" % started
		return answer
	var response: Array = await request.request_completed
	in_flight -= 1
	request.queue_free()
	var outcome: int = response[0]
	answer.status = response[1]
	answer.headers = response[2]
	answer.payload = response[3]
	request_done.emit(str(method), path, answer.status, Time.get_ticks_msec() - started_ms)
	if outcome != HTTPRequest.RESULT_SUCCESS:
		answer.failure = "no answer (request result %d)" % outcome
	return answer


## The pool for the current base_url; a new one (old connections closed) when it changed.
func _ensure_pool() -> HttpPool:
	if _pool != null and _pool_base == base_url:
		return _pool
	if _pool != null:
		_pool.close_all("server address changed")
		_other_connections += _pool.connections_opened
		_pool = null
	_pool_base = base_url
	_cache.clear()
	var server := ServerUrl.parse(base_url)
	if server == null:
		return null
	_pool = HttpPool.new(server.host, server.port, server.tls)
	return _pool
