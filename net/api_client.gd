class_name ApiClient
extends Node
## Sends JSON requests to the backend and returns an ApiResult.
##
## Only for ordinary request/response calls; the whole answer is buffered. Streamed answers (the
## event channel, layout and surface streams) are read incrementally elsewhere.

## Emitted for every success response, which always carries `rev` and `gameTime`.
signal meta_received(rev: int, game_time_ms: int)

const TIMEOUT_SECONDS := 15.0

## "scheme://host[:port]" without trailing slash.
var base_url: String = ""
## Session token; sent as bearer token on authorised calls. "" when signed out.
var token: String = ""


func get_json(path: String, authorised: bool = true) -> ApiResult:
	return await _send(HTTPClient.METHOD_GET, path, "", authorised)


## POST with a JSON body. An empty dictionary sends no body at all (e.g. logout).
## Integer fields must be real `int` values: a float would be written as `5.0` and rejected.
func post_json(path: String, body: Dictionary, authorised: bool = true) -> ApiResult:
	var text := "" if body.is_empty() else JSON.stringify(body)
	return await _send(HTTPClient.METHOD_POST, path, text, authorised)


func put_json(path: String, body: Dictionary, authorised: bool = true) -> ApiResult:
	return await _send(HTTPClient.METHOD_PUT, path, JSON.stringify(body), authorised)


func _send(method: HTTPClient.Method, path: String, body: String, authorised: bool) -> ApiResult:
	var headers: PackedStringArray = ["Accept: application/json"]
	if not body.is_empty():
		headers.append("Content-Type: application/json")
	if authorised and not token.is_empty():
		headers.append("Authorization: Bearer " + token)

	var request := HTTPRequest.new()
	request.timeout = TIMEOUT_SECONDS
	add_child(request)
	var started := request.request(base_url + path, headers, method, body)
	if started != OK:
		request.queue_free()
		return ApiResult.failed(ApiError.transport("request could not be started (%d)" % started))

	var response: Array = await request.request_completed
	request.queue_free()
	var outcome: int = response[0]
	var status: int = response[1]
	var payload: PackedByteArray = response[3]
	if outcome != HTTPRequest.RESULT_SUCCESS:
		return ApiResult.failed(ApiError.transport("no answer (request result %d)" % outcome))

	var result := ApiResult.from_http(status, payload.get_string_from_utf8())
	if result.is_ok() and result.rev >= 0 and result.game_time_ms >= 0:
		meta_received.emit(result.rev, result.game_time_ms)
	return result
