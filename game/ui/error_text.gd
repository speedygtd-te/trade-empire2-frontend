class_name ErrorText
extends RefCounted
## Player-facing text for a failed backend call.
##
## Raw error codes are never shown. Every code a screen can run into has its own translation
## key `ERROR_<CODE>`; anything else gets a generic sentence.

## Codes with their own text. A test checks that each has a translation.
const HANDLED_CODES: PackedStringArray = [
	"VALIDATION_FAILED",
	"INVALID_CREDENTIALS",
	"EMAIL_TAKEN",
	"PLAYER_NAME_TAKEN",
	"RATE_LIMITED",
	"UNAUTHENTICATED",
	"UNAVAILABLE",
	"INTERNAL",
]

const KEY_TRANSPORT := "ERROR_NO_CONNECTION"
const KEY_UNKNOWN := "ERROR_UNKNOWN"
const KEY_RATE_LIMITED_SECONDS := "ERROR_RATE_LIMITED_SECONDS"


## Translation key for the error.
static func key_for(error: ApiError) -> String:
	if error.is_transport():
		return KEY_TRANSPORT
	if HANDLED_CODES.has(error.code):
		return "ERROR_" + error.code
	return KEY_UNKNOWN


## Translated sentence for the error. `translator` is any node or object in the scene (its
## `tr` is used).
static func describe(error: ApiError, translator: Object) -> String:
	if error.code == ApiError.CODE_RATE_LIMITED and error.retry_after_ms > 0:
		var seconds := ceili(error.retry_after_ms / 1000.0)
		return translator.tr(KEY_RATE_LIMITED_SECONDS).format({"seconds": seconds})
	return translator.tr(key_for(error))
