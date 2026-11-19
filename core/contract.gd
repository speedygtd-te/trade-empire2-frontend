class_name Contract
extends RefCounted
## The backend contract this client is built against (`info.version` of
## Backend-V2/openapi.yaml). The server reports its own in `GET /v2/health` (`apiVersion`).

const VERSION := "2.0.0-draft.27"


## How the server's contract relates to ours: 0 = the same, 1 = the server is newer, -1 = older,
## and 2 when the server sent no version.
static func compare(server_version: String) -> int:
	if server_version.is_empty():
		return 2
	if server_version == VERSION:
		return 0
	return 1 if _draft(server_version) > _draft(VERSION) else -1


## Draft number of "2.0.0-draft.16" (16); 0 when there is none.
static func _draft(version: String) -> int:
	var at := version.rfind("draft.")
	return version.substr(at + 6).to_int() if at >= 0 else 0
