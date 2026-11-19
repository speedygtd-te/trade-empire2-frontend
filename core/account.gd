class_name Account
extends RefCounted
## The signed-in player's account, as returned by `GET /v2/me`.

## Opaque id; a string in the contract, never a number.
var player_id: String = ""
var player_name: String = ""
var email: String = ""
## Game time (ms) at which the session expires; it slides forward while the session is used.
var session_expires_at_ms: int = 0
## Body of the home colony; "" when the account has no colony.
var home_body_id: String = ""
## The player's enterprise; "" without one. A string id like every id of the contract.
var enterprise_id: String = ""
## The player's effective rights in it (union of the roles); empty without one.
var enterprise_flags: PackedStringArray = []


static func from_me(data: Dictionary) -> Account:
	var account := Account.new()
	account.player_id = Wire.as_string(data.get("playerId"))
	account.player_name = Wire.as_string(data.get("playerName"))
	account.email = Wire.as_string(data.get("email"))
	account.session_expires_at_ms = Wire.as_int(data.get("sessionExpiresAt"))
	account.home_body_id = Wire.as_string(data.get("homeBodyId"))
	account.apply_enterprise(data)
	return account


## Takes over the enterprise fields of a `/v2/me` answer (absent: no enterprise).
func apply_enterprise(data: Dictionary) -> void:
	enterprise_id = Wire.as_string(data.get("enterpriseId"))
	enterprise_flags = Enterprise.strings(data.get("enterpriseFlags"))
