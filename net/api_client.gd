class_name ApiClient
extends Node
## Sends JSON requests to the backend and returns an ApiResult.
##
## Only for ordinary request/response calls; the whole answer is buffered. Streamed answers (the
## event channel, layout and surface streams) are read incrementally elsewhere.

## Emitted for every success response, which always carries `rev` and `gameTime`.
signal meta_received(rev: int, game_time_ms: int)

const TIMEOUT_SECONDS := 15.0
## Read size per poll for raw answers (`get_text`).
const RAW_CHUNK_SIZE := 1 << 20

## "scheme://host[:port]" without trailing slash.
var base_url: String = ""
## Session token; sent as bearer token on authorised calls. "" when signed out.
var token: String = ""


func get_json(path: String, authorised: bool = true) -> ApiResult:
	return await _send(HTTPClient.METHOD_GET, path, "", authorised)


## GET of an NDJSON stream (layout, surface). These streams end, so the whole answer is
## buffered and split into lines; the proxy compresses them, HTTPRequest unpacks that.
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


func _send(method: HTTPClient.Method, path: String, body: String, authorised: bool,
		extra_headers: PackedStringArray = [], keep_body: bool = false, ndjson: bool = false,
		raw: bool = false) -> ApiResult:
	var headers: PackedStringArray = [] if ndjson or raw else ["Accept: application/json"]
	headers.append_array(extra_headers)
	if not body.is_empty():
		headers.append("Content-Type: application/json")
	if authorised and not token.is_empty():
		headers.append("Authorization: Bearer " + token)

	var request := HTTPRequest.new()
	request.timeout = TIMEOUT_SECONDS
	if raw:
		# Large answers (megabytes): read in big chunks on the request's own thread instead of
		# 64 KiB per frame on the main thread.
		request.download_chunk_size = RAW_CHUNK_SIZE
		request.use_threads = true
	add_child(request)
	var started := request.request(base_url + path, headers, method, body)
	if started != OK:
		request.queue_free()
		return ApiResult.failed(ApiError.transport("request could not be started (%d)" % started))

	var response: Array = await request.request_completed
	request.queue_free()
	var outcome: int = response[0]
	var status: int = response[1]
	var response_headers: PackedStringArray = response[2]
	var payload: PackedByteArray = response[3]
	if outcome != HTTPRequest.RESULT_SUCCESS:
		return ApiResult.failed(ApiError.transport("no answer (request result %d)" % outcome))

	var text := payload.get_string_from_utf8()
	var result: ApiResult
	if raw:
		result = ApiResult.from_raw(status, text)
	elif ndjson:
		result = ApiResult.from_ndjson(status, text)
	else:
		result = ApiResult.from_http(status, text)
	result.etag = ApiResult.etag_from_headers(response_headers)
	if keep_body and result.is_ok() and not result.not_modified:
		result.body = text
	if result.is_ok() and result.rev >= 0 and result.game_time_ms >= 0:
		meta_received.emit(result.rev, result.game_time_ms)
	return result
