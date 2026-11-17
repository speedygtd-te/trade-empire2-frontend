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


static func from_me(data: Dictionary) -> Account:
	var account := Account.new()
	account.player_id = Wire.as_string(data.get("playerId"))
	account.player_name = Wire.as_string(data.get("playerName"))
	account.email = Wire.as_string(data.get("email"))
	account.session_expires_at_ms = Wire.as_int(data.get("sessionExpiresAt"))
	account.home_body_id = Wire.as_string(data.get("homeBodyId"))
	return account
