class_name DefinitionsSource
extends Node
## Provides the game data: from the local copy when the backend confirms it is current (304),
## freshly downloaded when it changed, and from the local copy alone when the backend cannot
## be reached.

## The outcome of one load.
class Outcome:
	extends RefCounted
	## Null when no game data is available at all.
	var definitions: GameDefinitions = null
	## Why the backend could not deliver; null when it did (200 or 304).
	var error: ApiError = null
	## True when the game data came from the local copy.
	var from_cache: bool = false


const PATH := "/v2/definitions"

var _api: ApiClient
var _cache: DefinitionsCache
var _server_base: String = ""


func setup(api: ApiClient, cache: DefinitionsCache, server_base: String) -> void:
	_api = api
	_cache = cache
	_server_base = server_base


func load_definitions() -> Outcome:
	var outcome := Outcome.new()
	var cached := _cache.load_entry(_server_base)
	var result := await _api.get_cached(PATH, cached.etag if cached != null else "")

	if result.is_ok() and result.not_modified and cached != null:
		outcome.definitions = GameDefinitions.from_text(cached.text)
		outcome.from_cache = true
	elif result.is_ok() and not result.not_modified:
		outcome.definitions = GameDefinitions.from_bundle(result.data)
		if outcome.definitions != null and not result.etag.is_empty():
			_cache.save_entry(_server_base, result.etag, result.body)
	else:
		outcome.error = result.error
		if cached != null:
			outcome.definitions = GameDefinitions.from_text(cached.text)
			outcome.from_cache = true

	if outcome.definitions == null and outcome.error == null:
		outcome.error = ApiError.new()
		outcome.error.code = ApiResult.CODE_MALFORMED_RESPONSE
		_cache.clear()
	return outcome
