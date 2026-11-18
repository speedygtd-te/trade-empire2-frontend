class_name DefinitionsCache
extends RefCounted
## Keeps the last definitions bundle and its ETag across restarts, so a start only has to ask
## the backend whether it changed (304) instead of downloading it again.
##
## Bound to the server it came from, like the session token: another server's game data is
## never used.

const DEFAULT_PATH := "user://definitions.json"


class Entry:
	extends RefCounted
	var etag: String = ""
	## The bundle exactly as the server sent it.
	var text: String = ""


var _path: String


func _init(path: String = DEFAULT_PATH) -> void:
	_path = path


## The stored bundle for `server_base`, or null when there is none, it belongs to another
## server, or the file is damaged.
func load_entry(server_base: String) -> Entry:
	if not FileAccess.file_exists(_path):
		return null
	var file := FileAccess.open(_path, FileAccess.READ)
	if file == null:
		return null
	var stored := Wire.parse_object(file.get_as_text())
	file.close()
	if Wire.as_string(stored.get("server")) != server_base:
		return null
	var entry := Entry.new()
	entry.etag = Wire.as_string(stored.get("etag"))
	entry.text = Wire.as_string(stored.get("bundle"))
	if entry.etag.is_empty() or entry.text.is_empty():
		return null
	return entry


## Stores the bundle; returns false when it could not be written.
func save_entry(server_base: String, etag: String, text: String) -> bool:
	var file := FileAccess.open(_path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify({"server": server_base, "etag": etag, "bundle": text}))
	file.close()
	return true


func clear() -> void:
	if FileAccess.file_exists(_path):
		DirAccess.remove_absolute(_path)
