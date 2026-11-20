class_name EnterpriseModel
extends Node
## The player's enterprise and everything around it, kept current: membership (from `/v2/me`),
## the own enterprise, the public list, invitations seen, diplomacy, taxes, the inventory and the
## logos. Actions go to the server; the answers (and the events) update the model. The colony
## screen owns one; the enterprise panel shows it.
##
## Talks through `api` and listens on `events` (the Services ones unless `setup` hands in others,
## as the two-player smoke does).

## Membership or the own enterprise changed.
signal changed
signal list_changed
signal diplomacy_changed
signal taxes_changed
signal stock_changed
## Flagship, research or factory changed (draft.37).
signal flagship_changed
signal research_changed
signal factory_changed
## The player wants to see a structure of the enterprise in Base (the shell switches there).
signal structure_requested(structure_id: int)
## A logo finished downloading (`url` as the server gave it).
signal logo_loaded(url: String)
## Every enterprise or diplomacy event, for whoever wants to follow them (smoke, notices).
signal event_seen(type: String, data: Dictionary)
## A reload finished (after `changed`).
signal reloaded

const LIST_PAGE := 50

var api: ApiClient
var events: EventStream
var account: Account

## The own enterprise (with `me`, roles …); null without one.
var mine: Enterprise = null
## Whether membership has been asked at least once.
var loaded := false
## Why the last load of the own enterprise failed; null when it worked.
var error: ApiError = null

## The public list, page by page.
var summaries: Array[Enterprise.Summary] = []
var next_cursor := ""
var list_loaded := false
var list_error: ApiError = null
## Enterprises looked at in detail (for invited/applied): id → Enterprise.
var details: Dictionary = {}
## Enterprises that invited the player in this session (`enterprise.invited`): id → true.
var invitations: Dictionary = {}

var diplomacy: Diplomacy = null
var diplomacy_error: ApiError = null
var taxes: EnterpriseTaxes = null
var taxes_error: ApiError = null
var stock: EnterpriseTaxes.Stock = null
var stock_error: ApiError = null
## Flagship, research and factory (draft.37); null until loaded. A server without them answers
## 404 (`NOT_FOUND`): then `assets_supported` turns false and the screens hide them.
var flagship: EnterpriseFlagship = null
var flagship_error: ApiError = null
var research: EnterpriseResearch = null
var research_error: ApiError = null
var factory: EnterpriseFactory = null
var factory_error: ApiError = null
var assets_supported := true
## The player's structures (for the bodies a flagship can be delivered to); set by the shell.
var fleet: FleetModel = null

var _loading := false
var _again := false
var _list_loading := false
## Logo textures by url, and the urls being downloaded.
var _logos: Dictionary = {}
var _logo_waiting: Dictionary = {}
var _default_logo: Texture2D = null


## Other connections than the Services ones (call before adding the node).
func setup(api_client: ApiClient, event_stream: EventStream, player: Account) -> void:
	api = api_client
	events = event_stream
	account = player


func _ready() -> void:
	if api == null:
		api = Services.api
	if events == null:
		events = Services.events
	if account == null:
		account = Services.session.account
	events.event_received.connect(_on_event)
	events.resync_requested.connect(_on_resync)


func player_id() -> String:
	return account.player_id if account != null else ""


## Whether the player is in an enterprise (as far as known).
func is_member() -> bool:
	return mine != null


# --- loading --------------------------------------------------------------------------------

## Asks `/v2/me` for the membership and loads the own enterprise. A call while a load runs
## waits for it, and the load is repeated once (something changed in between).
func reload() -> void:
	if _loading:
		_again = true
		await reloaded
		return
	_loading = true
	_again = true
	while _again:
		_again = false
		await _load_once()
	_loading = false
	changed.emit()
	reloaded.emit()


func _load_once() -> void:
	var me := await api.get_json("/v2/me")
	if not me.is_ok():
		error = me.error
		return
	if account != null:
		account.apply_enterprise(me.data)
	var id := Wire.as_string(me.data.get("enterpriseId"))
	if id.is_empty():
		error = null
		_set_mine(null)
	else:
		var view := await api.get_json("/v2/enterprises/" + id.uri_encode())
		if view.is_ok():
			error = null
			_set_mine(Enterprise.from_wire(view.data))
		else:
			error = view.error
			return
	loaded = true


## Loads the first page of the list again, or (`more`) the next one.
func reload_list(more: bool = false) -> void:
	if _list_loading or (more and next_cursor.is_empty()):
		return
	_list_loading = true
	var path := "/v2/enterprises?limit=%d" % LIST_PAGE
	if more:
		path += "&cursor=" + next_cursor.uri_encode()
	var answer := await api.get_json(path)
	_list_loading = false
	if not answer.is_ok():
		list_error = answer.error
		list_changed.emit()
		return
	list_error = null
	var page := Enterprise.page_from_wire(answer.data)
	if not more:
		summaries.clear()
	summaries.append_array(page.items)
	next_cursor = page.next_cursor
	list_loaded = true
	list_changed.emit()


## The list entry of an enterprise; null when the list does not hold it.
func summary(id: String) -> Enterprise.Summary:
	for entry: Enterprise.Summary in summaries:
		if entry.enterprise_id == id:
			return entry
	return null


## The name of a faction as far as known (relations, list, own enterprise); "" otherwise.
func faction_name(faction: String) -> String:
	if mine != null and faction == mine.faction:
		return mine.name
	if diplomacy != null:
		var relation := diplomacy.relation(faction)
		if relation != null and not relation.name.is_empty():
			return relation.name
	var found := summary(Enterprise.id_of_faction(faction))
	return found.name if found != null else ""


## Loads one enterprise (for its description, members, invited/applied) into `details`.
func load_detail(id: String) -> ApiResult:
	var answer := await api.get_json("/v2/enterprises/" + id.uri_encode())
	if answer.is_ok():
		details[id] = Enterprise.from_wire(answer.data)
	elif answer.error.code == "ENTERPRISE_NOT_FOUND":
		_forget(id)
	return answer


func reload_diplomacy() -> void:
	var answer := await api.get_json("/v2/diplomacy")
	if answer.is_ok():
		diplomacy = Diplomacy.from_wire(answer.data)
		diplomacy_error = null
	else:
		diplomacy_error = answer.error
	diplomacy_changed.emit()


func reload_taxes() -> void:
	if mine == null:
		return
	var answer := await api.get_json(_path("/taxes"))
	if answer.is_ok():
		taxes = EnterpriseTaxes.from_wire(answer.data)
		taxes_error = null
	else:
		taxes_error = answer.error
	taxes_changed.emit()


func reload_stock() -> void:
	if mine == null:
		return
	var answer := await api.get_json(_path("/inventory"))
	if answer.is_ok():
		stock = EnterpriseTaxes.Stock.from_wire(answer.data)
		stock_error = null
	else:
		stock_error = answer.error
	stock_changed.emit()


## Whether the own enterprise has flagship, research and factory (the server is draft.37 or newer).
func has_assets() -> bool:
	return assets_supported and mine != null and mine.has_flagship_features()


func reload_flagship() -> void:
	if not has_assets():
		return
	var answer := await api.get_json(_path("/flagship"))
	if answer.is_ok():
		flagship = EnterpriseFlagship.from_wire(answer.data)
		flagship_error = null
		_sync_cap(flagship)
	else:
		_asset_failed(answer.error)
		flagship_error = answer.error
	flagship_changed.emit()


func reload_research() -> void:
	if not has_assets():
		return
	var answer := await api.get_json(_path("/research"))
	if answer.is_ok():
		research = EnterpriseResearch.from_wire(answer.data)
		research_error = null
	else:
		_asset_failed(answer.error)
		research_error = answer.error
	research_changed.emit()


func reload_factory() -> void:
	if not has_assets():
		return
	var answer := await api.get_json(_path("/factory"))
	if answer.is_ok():
		factory = EnterpriseFactory.from_wire(answer.data)
		factory_error = null
	else:
		_asset_failed(answer.error)
		factory_error = answer.error
	factory_changed.emit()


## A 404 without an enterprise code: the route is unknown, the server is older than draft.37.
func _asset_failed(failure: ApiError) -> void:
	if failure.code == "NOT_FOUND" or failure.code == "METHOD_NOT_ALLOWED":
		assets_supported = false
		changed.emit()


## The flagship answer carries cap and count: the overview follows without another load.
func _sync_cap(view: EnterpriseFlagship) -> void:
	if mine == null or (mine.member_cap == view.member_cap and mine.member_count == view.member_count):
		return
	mine.member_cap = view.member_cap
	mine.member_count = view.member_count
	changed.emit()


## One page of the own enterprise's log (`before` 0: the newest).
func load_log(before: int, limit: int = 50) -> ApiResult:
	if mine == null:
		return _not_member()
	return await api.get_json(_path("/logs") + EnterpriseLog.query(before, limit))


# --- actions --------------------------------------------------------------------------------

## Five (or fewer) generated names; parse with Enterprise.suggestions_from_wire.
func suggest_names() -> ApiResult:
	return await api.post_json("/v2/enterprises/name-suggestions", {})


func found(suggestion: Enterprise.Suggestion, description: String, open: bool) -> ApiResult:
	var result := await api.post_json("/v2/enterprises", Enterprise.found_body(suggestion, description, open))
	if result.is_ok():
		_take_view(result.data)
		reload_list()
	return result


func join(id: String) -> ApiResult:
	var result := await api.post_json("/v2/enterprises/%s/members/me" % id.uri_encode(), {})
	if result.is_ok():
		invitations.clear()
		_take_view(result.data)
	return result


func apply_to(id: String) -> ApiResult:
	var result := await api.post_json("/v2/enterprises/%s/applications" % id.uri_encode(), {})
	if result.is_ok():
		details[id] = Enterprise.from_wire(result.data)
		list_changed.emit()
	return result


## Takes back the player's own application.
func withdraw_application(id: String) -> ApiResult:
	var result := await api.delete_json("/v2/enterprises/%s/applications/%s" % [id.uri_encode(), player_id().uri_encode()])
	if result.is_ok():
		details[id] = Enterprise.from_wire(result.data)
		list_changed.emit()
	return result


func leave() -> ApiResult:
	if mine == null:
		return _not_member()
	var result := await api.delete_json(_path("/members/me"))
	if result.is_ok():
		_left()
	return result


func dissolve() -> ApiResult:
	if mine == null:
		return _not_member()
	var result := await api.delete_json(_path(""))
	if result.is_ok():
		_left()
	return result


## New description and join mode (EDIT_IDENTITY).
func update_identity(description: String, open: bool) -> ApiResult:
	var body := {"description": description.left(Enterprise.DESCRIPTION_MAX),
		"joinMode": Enterprise.JOIN_OPEN if open else Enterprise.JOIN_CLOSED}
	if mine == null:
		return _not_member()
	return _apply_view(await api.patch_json(_path(""), body))


func kick(player: String) -> ApiResult:
	if mine == null:
		return _not_member()
	return _apply_view(await api.delete_json(_path("/members/" + player.uri_encode())))


func invite(player: String) -> ApiResult:
	if mine == null:
		return _not_member()
	return _apply_view(await api.post_json(_path("/invites/" + player.uri_encode()), {}))


func revoke_invite(player: String) -> ApiResult:
	if mine == null:
		return _not_member()
	return _apply_view(await api.delete_json(_path("/invites/" + player.uri_encode())))


func admit(player: String) -> ApiResult:
	if mine == null:
		return _not_member()
	return _apply_view(await api.post_json(_path("/applications/" + player.uri_encode()), {}))


func reject(player: String) -> ApiResult:
	if mine == null:
		return _not_member()
	return _apply_view(await api.delete_json(_path("/applications/" + player.uri_encode())))


func assign_role(player: String, role_id: String) -> ApiResult:
	if mine == null:
		return _not_member()
	return _apply_view(await api.put_json(_path("/members/%s/roles/%s" % [player.uri_encode(), role_id.uri_encode()]), {}))


func unassign_role(player: String, role_id: String) -> ApiResult:
	if mine == null:
		return _not_member()
	return _apply_view(await api.delete_json(_path("/members/%s/roles/%s" % [player.uri_encode(), role_id.uri_encode()])))


func create_role(role_name: String, flags: PackedStringArray) -> ApiResult:
	if mine == null:
		return _not_member()
	var result := await api.post_json(_path("/roles"), Enterprise.role_body(role_name, flags))
	if result.is_ok():
		await reload()
	return result


func update_role(role_id: String, role_name: String, flags: PackedStringArray) -> ApiResult:
	if mine == null:
		return _not_member()
	var body := Enterprise.role_body(role_name, flags, role_id == Enterprise.FOUNDER_ROLE)
	var result := await api.patch_json(_path("/roles/" + role_id.uri_encode()), body)
	if result.is_ok():
		await reload()
	return result


func delete_role(role_id: String) -> ApiResult:
	if mine == null:
		return _not_member()
	var result := await api.delete_json(_path("/roles/" + role_id.uri_encode()))
	if result.is_ok():
		await reload()
	return result


## A diplomacy step towards `faction` (SET_DIPLOMACY).
func diplomacy_step(faction: String, step: String) -> ApiResult:
	var result := await api.post_json("/v2/diplomacy/%s/%s" % [faction.uri_encode(), step.uri_encode()], {})
	if result.is_ok():
		await reload_diplomacy()
	return result


## The whole tax table from resource → percent (SET_TAX).
func set_taxes(draft: Dictionary) -> ApiResult:
	if mine == null:
		return _not_member()
	var base := taxes if taxes != null else EnterpriseTaxes.new()
	var result := await api.put_json(_path("/taxes"), base.body(draft))
	if result.is_ok():
		taxes = EnterpriseTaxes.from_wire(result.data)
		taxes_error = null
		taxes_changed.emit()
	return result


## Orders the flagship into the orbit of `body_id` (MANAGE_TREASURY). A refusal for missing
## goods marks them in the price shown.
func order_flagship(body_id: String) -> ApiResult:
	if mine == null:
		return _not_member()
	var result := await api.post_json(_path("/flagship"), EnterpriseFlagship.order_body(body_id))
	if result.is_ok():
		flagship = EnterpriseFlagship.from_wire(result.data)
		flagship_error = null
		reload_stock()
	elif result.error.code == "INSUFFICIENT_STOCK" and flagship != null:
		flagship.apply_missing(EnterpriseFlagship.missing_from_details(result.error.details))
	flagship_changed.emit()
	return result


## Starts researching `tech` (MANAGE_TREASURY); its cost is taken at once.
func start_research(tech: String) -> ApiResult:
	if mine == null:
		return _not_member()
	var result := await api.post_json(_path("/research"), EnterpriseResearch.start_body(tech))
	if result.is_ok():
		research = EnterpriseResearch.from_wire(result.data)
		research_error = null
		research_changed.emit()
		reload_stock()
	return result


## Cancels the running research; nothing is refunded.
func cancel_research() -> ApiResult:
	if mine == null:
		return _not_member()
	var result := await api.delete_json(_path("/research"))
	if result.is_ok():
		research = EnterpriseResearch.from_wire(result.data)
		research_error = null
		research_changed.emit()
	return result


## Replaces the factory lines (MANAGE_TREASURY): [[blueprint, quantity], …].
func set_factory(lines: Array[Array]) -> ApiResult:
	if mine == null:
		return _not_member()
	var result := await api.put_json(_path("/factory"), EnterpriseFactory.body(lines))
	if result.is_ok():
		factory = EnterpriseFactory.from_wire(result.data)
		factory_error = null
		factory_changed.emit()
	return result


## Asks the shell to show a structure of the enterprise in Base.
func show_structure(structure_id: int) -> void:
	if structure_id != 0:
		structure_requested.emit(structure_id)


# --- logos ----------------------------------------------------------------------------------

## The texture of a logo path; the default ring while it downloads (`logo_loaded` follows) or
## when it cannot be read.
func logo_texture(url: String) -> Texture2D:
	if _logos.has(url):
		return _logos[url] as Texture2D
	if not url.is_empty() and not _logo_waiting.has(url):
		_logo_waiting[url] = true
		_download_logo(url)
	return default_logo()


func _download_logo(url: String) -> void:
	var bytes := await api.get_bytes(url)
	_logo_waiting.erase(url)
	var image := Image.new()
	if bytes.is_empty() or image.load_webp_from_buffer(bytes) != OK:
		return
	_logos[url] = ImageTexture.create_from_image(image)
	logo_loaded.emit(url)


## A neutral ring, drawn once: shown until a logo arrives.
func default_logo() -> Texture2D:
	if _default_logo != null:
		return _default_logo
	var size := 128
	var image := Image.create_empty(size, size, false, Image.FORMAT_RGBA8)
	var center := Vector2(size, size) / 2.0
	for y: int in size:
		for x: int in size:
			var distance := Vector2(x + 0.5, y + 0.5).distance_to(center)
			var alpha := clampf(1.0 - absf(distance - 44.0) / 8.0, 0.0, 1.0)
			image.set_pixel(x, y, Color(AppTheme.COLOR_BORDER, alpha))
	_default_logo = ImageTexture.create_from_image(image)
	return _default_logo


# --- inside ---------------------------------------------------------------------------------

func _path(rest: String) -> String:
	return "/v2/enterprises/" + (mine.enterprise_id if mine != null else "").uri_encode() + rest


func _not_member() -> ApiResult:
	var result := ApiResult.new()
	result.error = ApiError.new()
	result.error.code = "NOT_IN_ENTERPRISE"
	return result


## Answers that carry the own enterprise.
func _apply_view(result: ApiResult) -> ApiResult:
	if result.is_ok():
		_take_view(result.data)
	return result


## An EnterpriseView of the own enterprise arrived (founded, joined, changed).
func _take_view(data: Dictionary) -> void:
	var view := Enterprise.from_wire(data)
	if not view.is_member:
		return
	if account != null:
		account.enterprise_id = view.enterprise_id
		account.enterprise_flags = view.my_flags
	_set_mine(view)
	loaded = true
	changed.emit()


func _set_mine(view: Enterprise) -> void:
	var before := mine.enterprise_id if mine != null else ""
	mine = view
	var now := mine.enterprise_id if mine != null else ""
	if before != now:
		taxes = null
		stock = null
		diplomacy = null
		flagship = null
		research = null
		factory = null


## The player is out (left, dissolved, removed).
func _left() -> void:
	var id := mine.enterprise_id if mine != null else ""
	if account != null:
		account.enterprise_id = ""
		account.enterprise_flags = PackedStringArray()
	_set_mine(null)
	details.erase(id)
	changed.emit()
	reload_list()


## An enterprise is gone: out of the list, the details and the invitations.
func _forget(id: String) -> void:
	invitations.erase(id)
	details.erase(id)
	for index: int in range(summaries.size() - 1, -1, -1):
		if summaries[index].enterprise_id == id:
			summaries.remove_at(index)
	list_changed.emit()


func _on_event(event: SseEvent) -> void:
	if not event.type.begins_with("enterprise.") and not event.type.begins_with("diplomacy."):
		return
	var data := Wire.parse_object(event.data)
	event_seen.emit(event.type, data)
	var id := Wire.as_string(data.get("enterpriseId"))
	var own := mine != null and id == mine.enterprise_id
	match event.type:
		"enterprise.invited":
			invitations[id] = true
			details.erase(id)
			list_changed.emit()
		"enterprise.logo":
			var logo := Enterprise.Logo.from_wire(Wire.as_dict(data.get("logo")))
			if own:
				mine.logo = logo
				changed.emit()
			var listed := summary(id)
			if listed != null:
				listed.logo = logo
				list_changed.emit()
			if details.has(id):
				(details[id] as Enterprise).logo = logo
		"enterprise.taxes":
			if own:
				reload_taxes()
		"enterprise.flagship":
			if own:
				reload_flagship()
				reload_stock()
				# A delivered or lost flagship changes the member cap (its administrations).
				reload()
		"enterprise.research":
			if own:
				reload_research()
				if Wire.as_string(data.get("kind")) == "started":
					reload_stock()
		"enterprise.factory":
			if own:
				reload_factory()
				reload_stock()
		"enterprise.dissolved":
			_forget(id)
			if own:
				reload()
		"diplomacy.changed", "diplomacy.proposal":
			if diplomacy != null or mine != null:
				reload_diplomacy()
		_:
			# updated, memberJoined, memberLeft: the own enterprise changed, or the player was
			# admitted or removed.
			details.erase(id)
			if own or mine == null or Wire.as_string(data.get("playerId")) == player_id():
				reload()
			else:
				list_changed.emit()


func _on_resync(_rev: int) -> void:
	if not loaded:
		return
	reload()
	if list_loaded:
		reload_list()
	if diplomacy != null:
		reload_diplomacy()
	if taxes != null:
		reload_taxes()
	if stock != null:
		reload_stock()
	if flagship != null:
		reload_flagship()
	if research != null:
		reload_research()
	if factory != null:
		reload_factory()
