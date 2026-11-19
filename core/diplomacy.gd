class_name Diplomacy
extends RefCounted
## The own faction's relations (`GET /v2/diplomacy`) and which steps the screen offers for them.
##
## A faction is `enterprise-{id}` or `player-{id}`. Only enterprises act; players without one are
## targets. War is one-sided; peace and alliance are proposed and accepted; an alliance only
## between enterprises and never straight out of war; `hostile` changes no combat rule. The
## server decides — these rules only pick the buttons.

const HOSTILE := "hostile"
const NEUTRAL := "neutral"
const ALLIED := "allied"

## Steps of `POST /v2/diplomacy/{faction}/{step}`.
const STEP_WAR := "war"
const STEP_PEACE := "peace"
const STEP_ALLIANCE := "alliance"
const STEP_ACCEPT := "accept"
const STEP_WITHDRAW := "withdraw"
const STEP_BREAK := "break"


class Relation:
	extends RefCounted
	var faction := ""
	var name := ""
	## hostile, neutral, allied
	var stance := NEUTRAL
	## The open proposal: peace or alliance; "" when there is none.
	var proposal_kind := ""
	## The faction that proposed.
	var proposal_by := ""
	var proposal_at := 0
	var since := 0


## The own faction: the enterprise, or the player alone.
var faction := ""
var relations: Array[Relation] = []
## Faction → game time (ms) until which an ended alliance or membership still counts as friend
## in combat.
var ending_pacts: Dictionary = {}


static func from_wire(data: Dictionary) -> Diplomacy:
	var result := Diplomacy.new()
	result.faction = Wire.as_string(data.get("faction"))
	for value: Variant in _list(data.get("relations")):
		var row := Wire.as_dict(value)
		var relation := Relation.new()
		relation.faction = Wire.as_string(row.get("faction"))
		relation.name = Wire.as_string(row.get("name"))
		relation.stance = Wire.as_string(row.get("stance"), NEUTRAL)
		relation.since = Wire.as_int(row.get("since"))
		var proposal := Wire.as_dict(row.get("proposal"))
		relation.proposal_kind = Wire.as_string(proposal.get("kind"))
		relation.proposal_by = Wire.as_string(proposal.get("by"))
		relation.proposal_at = Wire.as_int(proposal.get("at"))
		if not relation.faction.is_empty():
			result.relations.append(relation)
	for value: Variant in _list(data.get("endingPacts")):
		var row := Wire.as_dict(value)
		var other := Wire.as_string(row.get("faction"))
		if not other.is_empty():
			result.ending_pacts[other] = Wire.as_int(row.get("until"))
	return result


static func is_enterprise(of_faction: String) -> bool:
	return of_faction.begins_with("enterprise-")


## The relation to `other`; null when it is neutral without a proposal.
func relation(other: String) -> Relation:
	for entry: Relation in relations:
		if entry.faction == other:
			return entry
	return null


func stance_with(other: String) -> String:
	var found := relation(other)
	return found.stance if found != null else NEUTRAL


## Whether the open proposal with `other` is the own one.
func proposed_by_us(other: String) -> bool:
	var found := relation(other)
	return found != null and not found.proposal_kind.is_empty() and found.proposal_by == faction


## Whether `other` has proposed something the own faction can accept.
func proposed_to_us(other: String) -> bool:
	var found := relation(other)
	return found != null and not found.proposal_kind.is_empty() and found.proposal_by != faction


## The steps the own faction can take towards `other`, in the order the screen offers them.
## Nothing when the own faction is no enterprise, or `other` is the own faction.
func steps(other: String) -> PackedStringArray:
	var result := PackedStringArray()
	if not is_enterprise(faction) or other.is_empty() or other == faction:
		return result
	var found := relation(other)
	var stance := found.stance if found != null else NEUTRAL
	var proposal := found.proposal_kind if found != null else ""
	if not proposal.is_empty():
		result.append(STEP_WITHDRAW if found.proposal_by == faction else STEP_ACCEPT)
	match stance:
		HOSTILE:
			if proposal.is_empty():
				result.append(STEP_PEACE)
		NEUTRAL:
			if proposal.is_empty() and is_enterprise(other):
				result.append(STEP_ALLIANCE)
			result.append(STEP_WAR)
		ALLIED:
			result.append(STEP_BREAK)
			result.append(STEP_WAR)
	return result


## How long an ended pact with `other` still holds (ms); 0 when there is none or it is over.
func pact_remaining_ms(other: String, now_ms: int) -> int:
	return maxi(Wire.as_int(ending_pacts.get(other)) - now_ms, 0)


static func _list(value: Variant) -> Array:
	if typeof(value) == TYPE_ARRAY:
		var list: Array = value
		return list
	return []
