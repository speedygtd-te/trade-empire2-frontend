class_name Enterprise
extends RefCounted
## An enterprise as the server shows it (`EnterpriseView`), plus the pieces around it: list
## entries, name suggestions, roles and the rules that decide which actions to offer.
##
## Every id here (enterprise, role, player) is a string in the contract and stays one. The server
## decides; these rules only keep the screen from offering what it would refuse.

## The rights a role can carry (`EnterpriseFlag`), in the order the screen lists them.
const FLAGS: PackedStringArray = [
	"MANAGE_MEMBERS", "MANAGE_ROLES", "SET_DIPLOMACY", "EDIT_IDENTITY", "DISSOLVE", "SET_TAX",
]
## The founder role: all rights, rights fixed, never without a holder.
const FOUNDER_ROLE := "1"
const JOIN_OPEN := "open"
const JOIN_CLOSED := "closed"
## Longest description and role name the server takes.
const DESCRIPTION_MAX := 500
const ROLE_NAME_MAX := 40
## Most roles per enterprise and per member.
const ROLES_MAX := 50
const ROLES_PER_MEMBER_MAX := 20
## Logo sizes the server renders.
const LOGO_SIZES: Array[int] = [64, 128, 256]


## A generated logo: until `ready` its urls point at the default logo.
class Logo:
	extends RefCounted
	## pending, ready, failed
	var status := ""
	## Full size (256 px): an absolute CDN URL (draft.34), or a server-relative "/assets/…" path
	## from an older server; used unchanged (ServerUrl.resolve).
	var url := ""
	## Size in px → path.
	var urls: Dictionary = {}

	static func from_wire(data: Dictionary) -> Logo:
		var logo := Logo.new()
		logo.status = Wire.as_string(data.get("status"))
		logo.url = Wire.as_string(data.get("url"))
		var sizes := Wire.as_dict(data.get("urls"))
		for size: int in LOGO_SIZES:
			var path := Wire.as_string(sizes.get(str(size)))
			if not path.is_empty():
				logo.urls[size] = path
		return logo

	## The path of the smallest size of at least `pixels`; the full size otherwise.
	func url_for(pixels: int) -> String:
		for size: int in LOGO_SIZES:
			if size >= pixels and urls.has(size):
				return Wire.as_string(urls[size])
		return url

	func is_pending() -> bool:
		return status == "pending"


## One entry of the public list (`EnterpriseSummary`).
class Summary:
	extends RefCounted
	var enterprise_id := ""
	var name := ""
	var ticker := ""
	var join_mode := ""
	var member_count := 0
	var founded_at := 0
	var logo := Logo.new()

	static func from_wire(data: Dictionary) -> Summary:
		var summary := Summary.new()
		summary.enterprise_id = Wire.as_string(data.get("enterpriseId"))
		summary.name = Wire.as_string(data.get("name"))
		summary.ticker = Wire.as_string(data.get("ticker"))
		summary.join_mode = Wire.as_string(data.get("joinMode"))
		summary.member_count = Wire.as_int(data.get("memberCount"))
		summary.founded_at = Wire.as_int(data.get("foundedAt"))
		summary.logo = Logo.from_wire(Wire.as_dict(data.get("logo")))
		return summary

	func is_open() -> bool:
		return join_mode == JOIN_OPEN


## One page of the list.
class Page:
	extends RefCounted
	var items: Array[Summary] = []
	## "" on the last page.
	var next_cursor := ""


class Member:
	extends RefCounted
	var player_id := ""
	var player_name := ""
	var joined_at := 0
	var role_ids: PackedStringArray = []


class Role:
	extends RefCounted
	var role_id := ""
	var name := ""
	var flags: PackedStringArray = []
	## The founder role.
	var system := false
	var member_count := 0

	static func from_wire(data: Dictionary) -> Role:
		var role := Role.new()
		role.role_id = Wire.as_string(data.get("roleId"))
		role.name = Wire.as_string(data.get("name"))
		role.flags = Enterprise.strings(data.get("flags"))
		role.system = data.get("system") == true
		role.member_count = Wire.as_int(data.get("memberCount"))
		return role

	func has_flag(flag: String) -> bool:
		return flags.has(flag)


class PlayerRef:
	extends RefCounted
	var player_id := ""
	var player_name := ""


## A generated name to found with; `components` go back to the server unchanged (as integers).
class Suggestion:
	extends RefCounted
	var components: Dictionary = {}
	var name := ""
	var ticker := ""


var enterprise_id := ""
var name := ""
var ticker := ""
var description := ""
var join_mode := ""
var member_count := 0
var founded_at := 0
var founder_id := ""
## `enterprise-{id}`
var faction := ""
var logo := Logo.new()
var members: Array[Member] = []
## Only for members.
var roles: Array[Role] = []
## Only for members with MANAGE_MEMBERS.
var invites: Array[PlayerRef] = []
var applications: Array[PlayerRef] = []
## Whether the asking player is a member (the answer carried `me`).
var is_member := false
var my_role_ids: PackedStringArray = []
var my_flags: PackedStringArray = []
## The asking player is invited / has applied.
var invited := false
var applied := false


static func from_wire(data: Dictionary) -> Enterprise:
	var view := Enterprise.new()
	view.enterprise_id = Wire.as_string(data.get("enterpriseId"))
	view.name = Wire.as_string(data.get("name"))
	view.ticker = Wire.as_string(data.get("ticker"))
	view.description = Wire.as_string(data.get("description"))
	view.join_mode = Wire.as_string(data.get("joinMode"))
	view.member_count = Wire.as_int(data.get("memberCount"))
	view.founded_at = Wire.as_int(data.get("foundedAt"))
	view.founder_id = Wire.as_string(data.get("founderId"))
	view.faction = Wire.as_string(data.get("faction"))
	view.logo = Logo.from_wire(Wire.as_dict(data.get("logo")))
	for value: Variant in _list(data.get("members")):
		var row := Wire.as_dict(value)
		var member := Member.new()
		member.player_id = Wire.as_string(row.get("playerId"))
		member.player_name = Wire.as_string(row.get("playerName"))
		member.joined_at = Wire.as_int(row.get("joinedAt"))
		member.role_ids = strings(row.get("roleIds"))
		view.members.append(member)
	for value: Variant in _list(data.get("roles")):
		view.roles.append(Role.from_wire(Wire.as_dict(value)))
	view.invites = players(data.get("invites"))
	view.applications = players(data.get("applications"))
	var me := Wire.as_dict(data.get("me"))
	view.is_member = data.has("me") and not me.is_empty()
	view.my_role_ids = strings(me.get("roleIds"))
	view.my_flags = strings(me.get("flags"))
	view.invited = data.get("invited") == true
	view.applied = data.get("applied") == true
	return view


## A page of `GET /v2/enterprises`.
static func page_from_wire(data: Dictionary) -> Page:
	var page := Page.new()
	for value: Variant in _list(data.get("items")):
		var summary := Summary.from_wire(Wire.as_dict(value))
		if not summary.enterprise_id.is_empty():
			page.items.append(summary)
	page.next_cursor = Wire.as_string(data.get("nextCursor"))
	return page


## The suggestions of `POST /v2/enterprises/name-suggestions`, components as integers.
static func suggestions_from_wire(data: Dictionary) -> Array[Suggestion]:
	var result: Array[Suggestion] = []
	for value: Variant in _list(data.get("suggestions")):
		var row := Wire.as_dict(value)
		var suggestion := Suggestion.new()
		suggestion.name = Wire.as_string(row.get("name"))
		suggestion.ticker = Wire.as_string(row.get("ticker"))
		var components := Wire.as_dict(row.get("components"))
		for key: Variant in components.keys():
			suggestion.components[str(key)] = Wire.as_int(components[key])
		if not suggestion.name.is_empty():
			result.append(suggestion)
	return result


## Body of `POST /v2/enterprises`.
static func found_body(suggestion: Suggestion, text: String, open: bool) -> Dictionary:
	return {
		"components": suggestion.components.duplicate(),
		"description": text.left(DESCRIPTION_MAX),
		"joinMode": JOIN_OPEN if open else JOIN_CLOSED,
	}


## Body of `POST …/roles` and `PATCH …/roles/{id}`; flags in the order of FLAGS. The founder
## role's flags are fixed, so they are left out for it.
static func role_body(role_name: String, flags: PackedStringArray, founder: bool = false) -> Dictionary:
	var body := {"name": role_name.strip_edges().left(ROLE_NAME_MAX)}
	if not founder:
		var ordered: Array[String] = []
		for flag: String in FLAGS:
			if flags.has(flag):
				ordered.append(flag)
		body["flags"] = ordered
	return body


## The faction of an enterprise.
static func faction_of(id: String) -> String:
	return "enterprise-" + id


## The enterprise id of a faction; "" when it is a player (or anything else).
static func id_of_faction(of_faction: String) -> String:
	return of_faction.trim_prefix("enterprise-") if of_faction.begins_with("enterprise-") else ""


func is_open() -> bool:
	return join_mode == JOIN_OPEN


func has_flag(flag: String) -> bool:
	return my_flags.has(flag)


## Whether the asking player holds the founder role.
func is_founder() -> bool:
	return my_role_ids.has(FOUNDER_ROLE)


func role(role_id: String) -> Role:
	for entry: Role in roles:
		if entry.role_id == role_id:
			return entry
	return null


func member(player_id: String) -> Member:
	for entry: Member in members:
		if entry.player_id == player_id:
			return entry
	return null


## The name of a member, invitee or applicant; "" when the enterprise does not know the player.
func player_name(player_id: String) -> String:
	var found := member(player_id)
	if found != null:
		return found.player_name
	for entry: PlayerRef in invites + applications:
		if entry.player_id == player_id:
			return entry.player_name
	return ""


## The roles of a member, in the order of the role list.
func roles_of(player_id: String) -> Array[Role]:
	var result: Array[Role] = []
	var found := member(player_id)
	if found == null:
		return result
	for entry: Role in roles:
		if found.role_ids.has(entry.role_id):
			result.append(entry)
	return result


## How many members hold the founder role.
func founder_count() -> int:
	var count := 0
	for entry: Member in members:
		if entry.role_ids.has(FOUNDER_ROLE):
			count += 1
	return count


## Whether the asking player may give a role to someone (or take it away): MANAGE_ROLES and every
## right of the role; the founder role only by its holders.
func can_grant(target: Role) -> bool:
	if target == null or not has_flag("MANAGE_ROLES"):
		return false
	if target.role_id == FOUNDER_ROLE or target.system:
		return is_founder()
	for flag: String in target.flags:
		if not has_flag(flag):
			return false
	return true


## Whether the asking player may take `target` away from `player_id`: as granting, and the
## founder role keeps at least one holder.
func can_revoke(target: Role, player_id: String) -> bool:
	if not can_grant(target):
		return false
	var holder := member(player_id)
	if holder == null or not holder.role_ids.has(target.role_id):
		return false
	return target.role_id != FOUNDER_ROLE or founder_count() > 1


## Whether the asking player (`me`) may remove `player_id`: MANAGE_MEMBERS, not oneself (that is
## leaving), and a founder only by a founder.
func can_kick(player_id: String, me: String) -> bool:
	var target := member(player_id)
	if target == null or player_id == me or not has_flag("MANAGE_MEMBERS"):
		return false
	return not target.role_ids.has(FOUNDER_ROLE) or is_founder()


## Whether leaving is refused because the asking player is the last founder while others stay.
func leave_blocked() -> bool:
	return is_founder() and founder_count() <= 1 and members.size() > 1


## The rights the asking player may put on a role (only the ones held).
func grantable_flags() -> PackedStringArray:
	var result := PackedStringArray()
	for flag: String in FLAGS:
		if has_flag(flag):
			result.append(flag)
	return result


## Whether the asking player may edit a role: MANAGE_ROLES, and no role with rights beyond the
## own ones. The founder role can only be renamed (its rights stay fixed).
func can_edit_role(target: Role) -> bool:
	if target == null or not has_flag("MANAGE_ROLES"):
		return false
	if target.system:
		return true
	for flag: String in target.flags:
		if not has_flag(flag):
			return false
	return true


## Strings of a JSON array; empty when it is no array.
static func strings(value: Variant) -> PackedStringArray:
	var result := PackedStringArray()
	for entry: Variant in _list(value):
		var text := Wire.as_string(entry)
		if not text.is_empty():
			result.append(text)
	return result


## `PlayerRef` rows of a JSON array.
static func players(value: Variant) -> Array[PlayerRef]:
	var result: Array[PlayerRef] = []
	for entry: Variant in _list(value):
		var row := Wire.as_dict(entry)
		var ref := PlayerRef.new()
		ref.player_id = Wire.as_string(row.get("playerId"))
		ref.player_name = Wire.as_string(row.get("playerName"))
		if not ref.player_id.is_empty():
			result.append(ref)
	return result


static func _list(value: Variant) -> Array:
	if typeof(value) == TYPE_ARRAY:
		var list: Array = value
		return list
	return []
