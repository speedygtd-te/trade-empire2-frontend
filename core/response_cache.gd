class_name ResponseCache
extends RefCounted
## Answers of GET calls for data that does not change while the client runs: a body
## (`/v2/bodies/{id}`) and a star system (`/v2/systems/{id}`). The colony, the fleet's place
## names, the maps and the logs ask for the same few of them; each is fetched once per account.
## Only successful answers are kept (a system not discovered yet is asked again). Kept in memory
## only, as the answer's text, so every caller parses its own copy.

## Entries kept at most; the oldest goes first.
const MAX_ENTRIES := 256

var _texts: Dictionary = {}
var _order: Array[String] = []
## The session the entries were fetched with: another account starts empty.
var _token := ""


## Whether a GET of `path` may be answered from here.
static func is_cacheable(path: String) -> bool:
	for prefix: String in ["/v2/bodies/", "/v2/systems/"]:
		if path.begins_with(prefix):
			var rest := path.substr(prefix.length())
			return not rest.is_empty() and not rest.contains("/") and not rest.contains("?")
	return false


## The kept answer text for `path` under session `token`; "" when there is none.
func lookup(path: String, token: String) -> String:
	if token != _token:
		return ""
	return Wire.as_string(_texts.get(path))


## Keeps the answer text of a successful GET of `path`.
func store(path: String, token: String, text: String) -> void:
	if not is_cacheable(path) or text.is_empty():
		return
	if token != _token:
		clear()
		_token = token
	if not _texts.has(path):
		_order.append(path)
	_texts[path] = text
	while _order.size() > MAX_ENTRIES:
		_texts.erase(_order.pop_front())


func size() -> int:
	return _texts.size()


func clear() -> void:
	_texts.clear()
	_order.clear()
