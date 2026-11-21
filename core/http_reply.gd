class_name HttpReply
extends RefCounted
## Rules for answers read over a kept-alive HTTP/1.1 connection (HttpPool): header lookup,
## unpacking a gzip body, whether the connection may serve the next call, and when a call that
## got no answer may be sent again.

## A connection idle this long is not trusted with a call that must not run twice (POST,
## PATCH): the server may close idle connections, and a call lost on the way would be unclear.
const FRESH_MS := 4000
## Unpacked answers larger than this count as broken (protects against a runaway stream).
const MAX_UNPACKED := 1 << 28


## The unpacked body: `ok` false when it was packed in a way that could not be read.
class Body:
	extends RefCounted
	var ok := true
	var bytes := PackedByteArray()


## The value of header `name` (any case) among raw "Name: value" lines; "" when absent.
static func header(headers: PackedStringArray, name: String) -> String:
	var wanted := name.to_lower()
	for line: String in headers:
		var colon := line.find(":")
		if colon > 0 and line.substr(0, colon).strip_edges().to_lower() == wanted:
			return line.substr(colon + 1).strip_edges()
	return ""


## The body as sent before packing: gzip (`Content-Encoding: gzip`) is unpacked, an unpacked
## body stays as it is, any other encoding is not readable.
static func unpack(headers: PackedStringArray, payload: PackedByteArray) -> Body:
	var body := Body.new()
	var encoding := header(headers, "Content-Encoding").to_lower()
	if encoding.is_empty() or encoding == "identity":
		body.bytes = payload
		return body
	if encoding != "gzip" or payload.is_empty():
		body.ok = payload.is_empty() and encoding == "gzip"
		return body
	body.bytes = payload.decompress_dynamic(MAX_UNPACKED, FileAccess.COMPRESSION_GZIP)
	# gzip of nothing still has a header; nothing back from a non-empty packet means it failed.
	body.ok = not body.bytes.is_empty() or payload.size() <= 20
	return body


## Whether the server keeps the connection open after this answer.
static func keeps_alive(headers: PackedStringArray) -> bool:
	for token: String in header(headers, "Connection").to_lower().split(",", false):
		if token.strip_edges() == "close":
			return false
	return true


## Whether running a call twice has the same effect as running it once (HTTP's idempotent
## methods).
static func idempotent(method: HTTPClient.Method) -> bool:
	return method == HTTPClient.METHOD_GET or method == HTTPClient.METHOD_HEAD \
		or method == HTTPClient.METHOD_PUT or method == HTTPClient.METHOD_DELETE \
		or method == HTTPClient.METHOD_OPTIONS


## Whether a connection idle for `idle_ms` may carry a call of `method`: any call within
## `idle_limit_ms`, one that must not run twice only while the connection is fresh (FRESH_MS).
static func may_reuse(method: HTTPClient.Method, idle_ms: int, idle_limit_ms: int) -> bool:
	if idle_ms >= idle_limit_ms:
		return false
	return idempotent(method) or idle_ms < FRESH_MS


## Whether a call that failed without an answer may be sent once more on a new connection:
## only when it went over a connection kept from an earlier call (the server may just have
## closed it) and running it twice is harmless; never a second time.
static func may_retry(method: HTTPClient.Method, reused_connection: bool, answered: bool, attempts: int) -> bool:
	return reused_connection and not answered and attempts < 2 and idempotent(method)
