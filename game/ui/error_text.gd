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
	# Building (POST /v2/bodies/{id}/ops).
	"CELL_OCCUPIED",
	"FOREIGN_NEIGHBOR",
	"INSUFFICIENT_HULLS",
	"MISSING_MODULE_ITEM",
	"HULL_NOT_FOUND",
	"HULL_OCCUPIED",
	"HULL_HAS_MODULE",
	"HULL_IS_BRIDGE",
	"POSITIONING_MISMATCH",
	"OUT_OF_BOUNDS",
	"HULL_Z_RESTRICTED",
	"INCOMPATIBLE_HULL",
	"OVERHANG_EXCEEDED",
	"NOT_BUILDABLE",
	"FOUND_ONLY_ON_DOCK",
	"STRUCTURE_NOT_EMPTY",
	"LAST_STRUCTURE",
	"TIER_NOT_UNLOCKED",
	"INVALID_HULL_TYPE",
	"NOT_ADJACENT",
	# Shafts: staircases and elevators.
	"NO_HULL_ABOVE",
	"HULL_ABOVE_OCCUPIED",
	"NOT_UPPER_HULL_OWNER",
	"NOT_VERTICAL_ACCESS",
	"BASE_BUILDING",
	"SHAFT_TOO_TALL",
	# Paths in a structure (Backend-V2 docs/SPEC-wege.md; announced, not in the contract yet).
	"NOT_CONNECTED",
	"LEVEL_NOT_CONNECTED",
	"NO_ENTRANCE",
	# Combat and the core module (draft.22).
	"CORE_MODULE_LOCKED",
	"HULL_DESTROYED",
	"HULL_NOT_DESTROYED",
	"PROTECTED_ZONE",
	"NO_CARGO_SPACE",
	# Movement (draft.19): building is refused while a structure or its host travels; travel
	# and its quote.
	"STRUCTURE_MOVING",
	"HOST_MOVING",
	"TARGET_MOVING",
	"NO_SPACE_DRIVE",
	"NO_GROUND_DRIVE",
	"NO_SPEED",
	"TOO_HEAVY",
	"INSUFFICIENT_FUEL",
	"NO_INTERSTELLAR_NAV",
	"INSUFFICIENT_CREW",
	"NO_WARP_DRIVE",
	"DRIVE_UNPOWERED",
	"NOT_SAME_BODY",
	"TOUCHES_OWN_STRUCTURE",
	"HAS_GUESTS",
	"NOT_A_HOST",
	"TOO_MANY_WAYPOINTS",
	"INVALID_TARGET",
	"NO_SURFACE",
	"PLANET_NOT_FOUND",
	# Routes and storage modes (draft.20).
	"ROUTE_NOT_FOUND",
	"ROUTE_STATIONS_INVALID",
	"ROUTE_KIND_MISMATCH",
	"TRANSPORTER_BUSY",
	"STATION_MOVING",
	"NO_STOP_SITE",
	"PARKING_BLOCKED",
	"TOO_MANY_RULES",
	"STORAGE_MODE_WOULD_OVERFLOW",
	"NOT_A_STORAGE_MODULE",
	# Sight and telescopes (draft.25).
	"SYSTEM_NOT_DISCOVERED",
	"NOT_A_TELESCOPE",
	"MODULE_BUILDING",
	"TELESCOPE_UPGRADE_RUNNING",
	"TELESCOPE_MAX_LEVEL",
	"FORBIDDEN",
	# Probes and surface fog (draft.31).
	"SURFACE_NOT_REVEALED",
	"NOT_A_PROBE_LAUNCHER",
	"LAUNCHER_NOT_READY",
	"NO_PROBE",
	# Fleets (draft.33).
	"FLEET_NOT_FOUND",
	"ALREADY_IN_FLEET",
	"NOT_IN_FLEET",
	"FLEET_HAS_COMMAND",
	"FLEET_NOT_CO_LOCATED",
	"FLEET_NOT_READY",
	"FLEET_MEMBER_LOCKED",
	# Trade (draft.44).
	"READER_REQUIRED",
	"NOT_DOCKED_AT_HOST",
	"HOST_INACTIVE",
	"TRADE_HOST_FULL",
	"OFFER_NOT_AVAILABLE",
	"OWN_OFFER",
	"NOT_TRADEABLE",
	"AMOUNT_TOO_SMALL",
	"TRADE_INVENTORY_NOT_EMPTY",
	"TRADE_HOST_LOCKED",
	# Workforce (PUT /v2/structures/{id}/workforce).
	"TIER_TOO_LOW",
	"INSUFFICIENT_WORKERS",
	"INSUFFICIENT_ROBOTS",
	"CARGO_WOULD_OVERFLOW",
	"STRUCTURE_NOT_FOUND",
	"MODULE_NOT_FOUND",
	"NOT_HULL_OWNER",
	# Docks and guests.
	"NOT_ON_DOCK",
	"DOCK_AREA_TOO_SMALL",
	"DOCK_SPACE_BLOCKED",
	"HULL_HAS_GUEST",
	"NOT_DOCKED_HERE",
	# Recipes (setBlueprint).
	"NOT_BLUEPRINT_MODULE",
	"INVALID_BLUEPRINT",
	"INCOMPATIBLE_BLUEPRINT",
	"BLUEPRINT_LOCKED",
	# Enterprises and diplomacy (draft.26), taxes (draft.27).
	"ENTERPRISE_NOT_FOUND",
	"ALREADY_IN_ENTERPRISE",
	"NOT_IN_ENTERPRISE",
	"ENTERPRISE_NAME_TAKEN",
	"MISSING_FLAG",
	"LAST_FOUNDER",
	"JOIN_CLOSED",
	"NOT_INVITED",
	"APPLICATION_NOT_FOUND",
	"MEMBER_NOT_FOUND",
	"PLAYER_NOT_FOUND",
	"ROLE_LIMIT",
	"ROLE_NOT_FOUND",
	"SYSTEM_ROLE_LOCKED",
	"INVALID_DIPLOMACY",
	"PROPOSAL_NOT_FOUND",
	"NOT_FOUND",
	"NOT_TAXABLE",
	# Flagship, enterprise research and factory, enterprise items (draft.37).
	"ENTERPRISE_FULL",
	"FLAGSHIP_EXISTS",
	"FLAGSHIP_NOT_FOUND",
	"MODULE_NOT_ALLOWED",
	"UNIQUE_MODULE_LOCKED",
	"NOT_ENTERPRISE_BUILDABLE",
	"ENTERPRISE_TECH_LOCKED",
	"ENTERPRISE_RESEARCH_RUNNING",
	"UNKNOWN_ENTERPRISE_TECH",
	# Password reset.
	"RESET_CODE_INVALID",
	"RESET_CODE_EXPIRED",
	# Discarding.
	"INSUFFICIENT_STOCK",
	"INVALID_RESOURCE",
	# Research (lab slots).
	"NOT_A_LAB",
	"SLOT_COUNT_MISMATCH",
	"RESEARCH_IN_PROGRESS",
	"INVALID_SLOT_RATE",
	"UNKNOWN_TECH",
	"NOT_STRUCTURE_OWNER",
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
