extends RefCounted
## Sign-in data for review and measuring scenes, from the command line after `--`:
##
## - `--dev-account=<playerName>` (e.g. DevLarge1): one of the backend's accounts for frontend
##   tests on the dev instance (small 150 hulls, medium 5 000, large 100 000), read from the
##   backend's file (`TE_DEV_CREDENTIALS`, default F:\Trade Empire\Backend-V2\dev-credentials\
##   accounts.json; read only, never copied). The scene must run against that server too:
##   `-- --server=https://dev.trade-empire.net` (Services decides the server before any scene).
## - `--account=<name>`: .local/<name>-account.json of this checkout (live accounts).
## - neither: `fallback` (a .local file).
##
## Returns {"email", "password", "label"}; empty with "error" set when nothing could be read.

const DEV_FILE := "F:/Trade Empire/Backend-V2/dev-credentials/accounts.json"


static func load(fallback: String = "res://.local/dev-account.json") -> Dictionary:
	var path := fallback
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--dev-account="):
			return _dev(argument.trim_prefix("--dev-account="))
		if argument.begins_with("--account="):
			path = "res://.local/%s-account.json" % argument.trim_prefix("--account=")
	var account := Wire.parse_object(FileAccess.get_file_as_string(ProjectSettings.globalize_path(path)))
	if account.is_empty():
		return {"error": "no %s" % path}
	return {"email": Wire.as_string(account.get("email")), "password": Wire.as_string(account.get("password")),
		"label": path.get_file().trim_suffix("-account.json")}


static func _dev(player_name: String) -> Dictionary:
	var file := OS.get_environment("TE_DEV_CREDENTIALS")
	if file.is_empty():
		file = DEV_FILE
	var data := Wire.parse_object(FileAccess.get_file_as_string(file))
	if data.is_empty():
		return {"error": "no dev credentials at %s" % file}
	var base := Wire.as_string(data.get("baseUrl")).trim_suffix("/")
	if Services.server != null and Services.server.base.trim_suffix("/") != base:
		return {"error": "dev accounts live on %s, this run talks to %s (add -- --server=%s)" % [
			base, Services.server.base, base]}
	var accounts: Array = data.get("accounts") if typeof(data.get("accounts")) == TYPE_ARRAY else []
	for entry: Variant in accounts:
		var account := Wire.as_dict(entry)
		if Wire.as_string(account.get("playerName")) == player_name:
			return {"email": Wire.as_string(account.get("email")), "password": Wire.as_string(account.get("password")),
				"label": "%s (%s, %d hulls)" % [player_name, Wire.as_string(account.get("size")),
					Wire.as_int(account.get("homeHulls"))]}
	return {"error": "no dev account %s in %s" % [player_name, file]}
