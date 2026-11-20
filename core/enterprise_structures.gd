class_name EnterpriseStructures
extends RefCounted
## What a member may do with the structures of the enterprise (draft.38, package 2 of
## SPEC-enterprise-flaggschiff), and how build batches address a structure.
##
## Building and managing (workforce, caps, discard, transfers, storage mode, recipes) at an
## enterprise structure needs MANAGE_TREASURY; building also a standing flagship (its store is the
## enterprise inventory that hulls and modules come from). Travel, landing, docking and fleets of
## enterprise structures need COMMAND_ENTERPRISE_FLEET. A player's own structures need nothing.
##
## Build batches go to the body (`POST /v2/bodies/{id}/ops`, absolute cells) for an own structure
## on a surface, otherwise to the structure (`POST /v2/structures/{id}/ops`, draft.38, local cells
## of the home structure; a guest is built in its host's grid): enterprise structures and
## structures resting in orbit. Only a preview of the rules: the server decides.

## Why something is not allowed (empty: it is).
const OK := ""
## The member lacks MANAGE_TREASURY (building, managing) or COMMAND_ENTERPRISE_FLEET (travel).
const NEEDS_TREASURY := "NEEDS_TREASURY"
const NEEDS_FLEET := "NEEDS_FLEET"
## The enterprise has no flagship standing: nothing to build from (FLAGSHIP_NOT_FOUND).
const NO_FLAGSHIP := "NO_FLAGSHIP"

const ENTERPRISE := "enterprise"


static func is_enterprise(owner_kind: String) -> bool:
	return owner_kind == ENTERPRISE


## Why a member may not build at a structure of `owner_kind`; OK for own structures.
static func build_reason(owner_kind: String, flags: PackedStringArray, flagship_standing: bool) -> String:
	if not is_enterprise(owner_kind):
		return OK
	if not flags.has(Enterprise.FLAG_TREASURY):
		return NEEDS_TREASURY
	if not flagship_standing:
		return NO_FLAGSHIP
	return OK


## Why a member may not manage (workforce, caps, discard, transfer, storage, recipes) a structure.
static func manage_reason(owner_kind: String, flags: PackedStringArray) -> String:
	if is_enterprise(owner_kind) and not flags.has(Enterprise.FLAG_TREASURY):
		return NEEDS_TREASURY
	return OK


## Why a member may not send a structure travelling, land it or put it into a fleet.
static func command_reason(owner_kind: String, flags: PackedStringArray) -> String:
	if is_enterprise(owner_kind) and not flags.has(Enterprise.FLAG_FLEET):
		return NEEDS_FLEET
	return OK


## Whether build batches for a home structure go to `/v2/structures/{id}/ops` (local cells):
## enterprise structures and anything not standing on a surface.
static func uses_structure_ops(owner_kind: String, anchor_type: String) -> bool:
	return is_enterprise(owner_kind) or anchor_type != "surface"


## The ops with their absolute cells turned into local cells of a structure at `offset`.
static func local_ops(ops: Array[Dictionary], offset: Vector3i) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for op: Dictionary in ops:
		var local := op.duplicate()
		local["x"] = Wire.as_int(op.get("x")) - offset.x
		local["y"] = Wire.as_int(op.get("y")) - offset.y
		local["z"] = Wire.as_int(op.get("z")) - offset.z
		result.append(local)
	return result


## The structures a build batch founded (`results[].created`, a hull on a dock): their ids.
static func created_structures(data: Dictionary) -> Array[int]:
	var result: Array[int] = []
	var rows: Variant = data.get("results")
	if typeof(rows) != TYPE_ARRAY:
		return result
	for row: Variant in rows:
		var entry := Wire.as_dict(row)
		if entry.get("created") == true and entry.get("ok") != false:
			var id := Wire.as_int(entry.get("structureId"))
			if id != 0 and not result.has(id):
				result.append(id)
	return result


## Whether a ship of `guest_kind` may dock at a host of `host_kind` (the dock picker): own ships
## at own docks and, for members, at the enterprise's docks (E7); the enterprise's structures only
## at the enterprise's docks.
static func may_dock(guest_kind: String, host_kind: String, member: bool) -> bool:
	if is_enterprise(guest_kind):
		return is_enterprise(host_kind)
	return not is_enterprise(host_kind) or member


## Which note the store of a structure carries: "" for an own structure, the enterprise
## inventory for the flagship, the topped-up store for a daughter.
static func store_note(owner_kind: String, flagship: bool) -> String:
	if not is_enterprise(owner_kind):
		return ""
	return "STORE_ENTERPRISE_INVENTORY" if flagship else "STORE_ENTERPRISE_TOPPED_UP"


## Whether a fleet (its members' owner kinds) mixes the enterprise's structures with own ones
## (NOT_STRUCTURE_OWNER).
static func is_mixed(owner_kinds: Array[String]) -> bool:
	var enterprise := 0
	for kind: String in owner_kinds:
		if is_enterprise(kind):
			enterprise += 1
	return enterprise > 0 and enterprise < owner_kinds.size()
