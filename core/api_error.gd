class_name ApiError
extends RefCounted
## Why a backend call failed.
##
## The backend answers every rejected request with `{ "error": CODE, "message", "details"? }`;
## the HTTP status follows from the code. Two more cases exist outside that format: the request
## never got an answer (TRANSPORT), or the answer was not the error format (a bare 431 from the
## HTTP parser, a 502/504 from the proxy) — then `code` is "HTTP_<status>".

enum Kind {
	## The backend rejected the request with an error code.
	SERVER,
	## No answer: DNS, connection refused, timeout, connection lost.
	TRANSPORT,
}

const CODE_UNAUTHENTICATED := "UNAUTHENTICATED"
const CODE_RATE_LIMITED := "RATE_LIMITED"

var kind: Kind = Kind.SERVER
## Error code from the backend register, "HTTP_<status>" for a non-JSON answer,
## "" for a transport failure.
var code: String = ""
## Developer-facing text from the backend. Never shown to the player.
var message: String = ""
var http_status: int = 0
var details: Dictionary = {}
## How long to wait before retrying, from `details.retryAfterMs` (RATE_LIMITED); 0 if unknown.
var retry_after_ms: int = 0


## Builds the error for an HTTP answer with a non-success status.
static func from_response(status: int, body: String) -> ApiError:
	var error := ApiError.new()
	error.kind = Kind.SERVER
	error.http_status = status
	var parsed := Wire.parse_object(body)
	var server_code := Wire.as_string(parsed.get("error"))
	if server_code.is_empty():
		error.code = "HTTP_%d" % status
		return error
	error.code = server_code
	error.message = Wire.as_string(parsed.get("message"))
	error.details = Wire.as_dict(parsed.get("details"))
	error.retry_after_ms = maxi(Wire.as_int(error.details.get("retryAfterMs")), 0)
	return error


## Builds the error for a request that got no answer.
static func transport(reason: String) -> ApiError:
	var error := ApiError.new()
	error.kind = Kind.TRANSPORT
	error.message = reason
	return error


## True only when the backend says the session is gone. A transport failure never is: the token
## may still be valid, the server is just not reachable.
func is_unauthenticated() -> bool:
	return kind == Kind.SERVER and code == CODE_UNAUTHENTICATED


func is_transport() -> bool:
	return kind == Kind.TRANSPORT
