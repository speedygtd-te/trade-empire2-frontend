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


func is_ok() -> bool:
	return error == null


## Interprets an HTTP answer. Every success response of the backend is a JSON object that
## carries `rev` and `gameTime`; anything else with a 2xx status is treated as a failure.
static func from_http(status: int, body: String) -> ApiResult:
	var result := ApiResult.new()
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


static func failed(reason: ApiError) -> ApiResult:
	var result := ApiResult.new()
	result.error = reason
	return result
