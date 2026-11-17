class_name SessionStore
extends RefCounted
## Keeps the session token across restarts.
##
## Only the opaque bearer token is stored, never e-mail or password. The token is bound to the
## server it came from, so a token of the local development backend is never sent to another
## server. `user://` is private to the app on Android and iOS.

const DEFAULT_PATH := "user://session.json"
const _TOKEN_LENGTH := 64

var _path: String


func _init(path: String = DEFAULT_PATH) -> void:
	_path = path


## The stored token for `server_base`, or "" when there is none, it belongs to another server,
## or the file is damaged.
func load_token(server_base: String) -> String:
	if not FileAccess.file_exists(_path):
		return ""
	var file := FileAccess.open(_path, FileAccess.READ)
	if file == null:
		return ""
	var stored := Wire.parse_object(file.get_as_text())
	file.close()
	if Wire.as_string(stored.get("server")) != server_base:
		return ""
	var token := Wire.as_string(stored.get("token"))
	return token if is_token(token) else ""


## Stores the token; returns false when it could not be written.
func save_token(server_base: String, token: String) -> bool:
	var file := FileAccess.open(_path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify({"server": server_base, "token": token}))
	file.close()
	return true


func clear() -> void:
	if FileAccess.file_exists(_path):
		DirAccess.remove_absolute(_path)


## A session token is 64 lowercase hex characters.
static func is_token(text: String) -> bool:
	if text.length() != _TOKEN_LENGTH:
		return false
	for index: int in text.length():
		var code := text.unicode_at(index)
		var is_digit := code >= 0x30 and code <= 0x39
		var is_hex_letter := code >= 0x61 and code <= 0x66
		if not is_digit and not is_hex_letter:
			return false
	return true
