class_name ApiResult
extends RefCounted
## Outcome of one backend call: either the response object or the reason it failed.

const CODE_MALFORMED_RESPONSE := "MALFORMED_RESPONSE"

## The parsed response object; empty when the call failed.
var data: Dictionary = {}
## Null when the call succeeded.
var error: ApiError = null
## Journal sequence of the state the response is valid for; -1 if the response had none.
var rev: int = -1
## Game time in ms at which the command was applied; -1 if the response had none.
var game_time_ms: int = -1
## True for 304 Not Modified (answer to a conditional request): no error and no data.
var not_modified: bool = false
## Entity tag of the response (header `ETag`, quotes kept); "" when there was none.
var etag: String = ""
## The response body as received; only kept when the caller asked for it.
var body: String = ""
## The lines of an NDJSON answer (layout, surface); null for ordinary answers.
var stream: Ndjson = null


func is_ok() -> bool:
	return error == null


## Interprets an HTTP answer. Every success response of the backend is a JSON object that
## carries `rev` and `gameTime`; anything else with a 2xx status is treated as a failure.
## 304 is the answer to a conditional request and counts as success without data.
static func from_http(status: int, body: String) -> ApiResult:
	var result := ApiResult.new()
	if status == 304:
		result.not_modified = true
		return result
	if status < 200 or status >= 300:
		result.error = ApiError.from_response(status, body)
		return result
	var json := JSON.new()
	if json.parse(body) != OK or typeof(json.data) != TYPE_DICTIONARY:
		result.error = ApiError.new()
		result.error.http_status = status
		result.error.code = CODE_MALFORMED_RESPONSE
		return result
	result.data = Wire.as_dict(json.data)
	result.rev = Wire.as_int(result.data.get("rev"), -1)
	result.game_time_ms = Wire.as_int(result.data.get("gameTime"), -1)
	return result


## Interprets an NDJSON answer: on success `stream` holds the lines and `rev`/`game_time_ms`
## come from the first line. A stream without lines counts as malformed.
static func from_ndjson(status: int, body: String) -> ApiResult:
	if status < 200 or status >= 300:
		return from_http(status, body)
	var result := ApiResult.new()
	result.stream = Ndjson.parse(body)
	if result.stream.objects.is_empty():
		result.error = ApiError.new()
		result.error.http_status = status
		result.error.code = CODE_MALFORMED_RESPONSE
		return result
	result.rev = Wire.as_int(result.stream.first().get("rev"), -1)
	result.game_time_ms = Wire.as_int(result.stream.first().get("gameTime"), -1)
	return result


## The value of the `ETag` header among raw "Name: value" header lines; "" when absent.
static func etag_from_headers(headers: PackedStringArray) -> String:
	for line: String in headers:
		var colon := line.find(":")
		if colon > 0 and line.substr(0, colon).strip_edges().to_lower() == "etag":
			return line.substr(colon + 1).strip_edges()
	return ""


static func failed(reason: ApiError) -> ApiResult:
	var result := ApiResult.new()
	result.error = reason
	return result
