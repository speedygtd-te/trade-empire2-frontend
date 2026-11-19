class_name EnterpriseLog
extends RefCounted
## One page of an enterprise's log (`GET /v2/enterprises/{id}/logs`), newest first. Kinds the
## client does not know yet are left out (new kinds are not breaking).

const KINDS: PackedStringArray = [
	"founded", "joined", "left", "kicked", "invited", "inviteRevoked", "applied",
	"applicationWithdrawn", "admitted", "rejected", "roleCreated", "roleUpdated", "roleDeleted",
	"roleAssigned", "roleUnassigned", "identityUpdated", "diplomacy", "logo", "taxRate",
	"taxRateEffective",
]
## Values of a `diplomacy` entry.
const DIPLOMACY_VALUES: PackedStringArray = [
	"war", "peace", "peaceProposed", "alliance", "allianceProposed", "proposalWithdrawn",
	"allianceBroken",
]


class Entry:
	extends RefCounted
	var seq := 0
	var game_time_ms := 0
	var kind := ""
	## Who acted, who it concerned ("" when not given).
	var actor_id := ""
	var player_id := ""
	var role_id := ""
	var faction := ""
	var value := ""
	var resource := ""
	var percent := 0
	var effective_at := 0


var entries: Array[Entry] = []
## The server holds older entries than the last one of this page.
var more := false
## The `seq` of the oldest entry the answer carried, known or not (for the next page).
var oldest := 0


static func from_wire(data: Dictionary) -> EnterpriseLog:
	var page := EnterpriseLog.new()
	var rows: Array = data.get("entries") if typeof(data.get("entries")) == TYPE_ARRAY else []
	for value: Variant in rows:
		var row := Wire.as_dict(value)
		var seq := Wire.as_int(row.get("seq"))
		if seq > 0 and (page.oldest == 0 or seq < page.oldest):
			page.oldest = seq
		var entry := Entry.new()
		entry.seq = seq
		entry.game_time_ms = Wire.as_int(row.get("gameTime"))
		entry.kind = Wire.as_string(row.get("kind"))
		entry.actor_id = Wire.as_string(row.get("actorId"))
		entry.player_id = Wire.as_string(row.get("playerId"))
		entry.role_id = Wire.as_string(row.get("roleId"))
		entry.faction = Wire.as_string(row.get("faction"))
		entry.value = Wire.as_string(row.get("value"))
		entry.resource = Wire.as_string(row.get("resource"))
		entry.percent = Wire.as_int(row.get("percent"))
		entry.effective_at = Wire.as_int(row.get("effectiveAt"))
		if KINDS.has(entry.kind):
			page.entries.append(entry)
	page.more = data.get("more") == true
	return page


## The query of a page: the newest when `before` is 0, otherwise the entries older than it.
static func query(before: int, limit: int) -> String:
	var text := "?limit=%d" % clampi(limit, 1, 200)
	if before > 0:
		text += "&before=%d" % before
	return text
