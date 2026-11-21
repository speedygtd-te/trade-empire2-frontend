class_name TradeModel
extends Node
## Trade on platforms (draft.44), kept current: the platforms and offers in sight (`GET
## /v2/trade/hosts`, `/v2/trade/offers` — only with a working reader somewhere), the player's own
## offers and goods to collect (`GET /v2/trade/mine`), and the commands at a platform. Follows the
## `trade.*` events. The fleet model owns it.
##
## A server without trade (game data without `TRADE_HOST`) is left alone: `supported()` is false.

## Something was loaded or changed.
signal changed

var book := Trade.new()
## Whether the lists have been loaded at least once; why the last load failed (null when it
## worked). Without a reader the platforms and offers stay empty (`reader_missing`), the own
## offers still load.
var loaded := false
var error: ApiError = null
var reader_missing := false
## Body id → name, shared with the fleet model (platforms' bodies are added).
var body_names: Dictionary = {}
## Review scenes fill the lists themselves: then nothing is loaded.
var frozen := false

var _loading := false
var _again := false


func _ready() -> void:
	Services.events.event_received.connect(_on_event)
	Services.events.resync_requested.connect(func(_rev: int) -> void: reload())


## Whether this server has trade (its game data knows the platform module).
func supported() -> bool:
	return Services.definitions != null and Services.definitions.module(Trade.HOST) != null


## Loads everything again (once at a time; a request while loading loads once more after).
func reload() -> void:
	if not supported() or frozen:
		return
	if _loading:
		_again = true
		return
	_loading = true
	var mine := await Services.api.get_json("/v2/trade/mine")
	var hosts := await Services.api.get_json("/v2/trade/hosts")
	var offers: ApiResult = null
	if hosts.is_ok():
		offers = await Services.api.get_json("/v2/trade/offers")
	_loading = false
	error = null
	if mine.is_ok():
		book.apply_mine(mine.data)
	else:
		error = mine.error
	reader_missing = not hosts.is_ok() and hosts.error.code == "READER_REQUIRED"
	if hosts.is_ok():
		book.apply_hosts(hosts.data)
	else:
		book.apply_hosts({})
		if not reader_missing:
			error = hosts.error
	await _name_bodies()
	if offers != null and offers.is_ok():
		book.apply_offers(offers.data)
	else:
		book.apply_offers({})
		if offers != null:
			error = offers.error
	loaded = loaded or error == null
	changed.emit()
	if _again:
		_again = false
		reload()


## Places an offer with ship `ship_id` at the platform it is docked at (whole units).
func place(ship_id: int, offer_item: String, offer_amount: int, demand_item: String, demand_amount: int) -> ApiResult:
	var result := await Services.api.post_json("/v2/structures/%d/trade/offers" % ship_id,
		Trade.offer_request(offer_item, offer_amount, demand_item, demand_amount))
	if result.is_ok():
		reload()
	return result


## Takes an offer with ship `ship_id` (docked at the offer's platform).
func accept(ship_id: int, offer_id: int) -> ApiResult:
	var result := await Services.api.post_json("/v2/structures/%d/trade/offers/%d/accept" % [ship_id, offer_id], {})
	if result.is_ok() or result.error.code == "OFFER_NOT_AVAILABLE":
		book.forget_offer(offer_id)
		reload()
	return result


## Loads what is due to the player at the platform ship `ship_id` is docked at into its hold.
func collect(ship_id: int) -> ApiResult:
	var result := await Services.api.post_json("/v2/structures/%d/trade/collect" % ship_id, {})
	if result.is_ok():
		reload()
	return result


## Withdraws an own offer (from anywhere): its goods wait on the platform to be collected.
func withdraw(offer_id: int) -> ApiResult:
	var result := await Services.api.delete_json("/v2/trade/offers/%d" % offer_id)
	if result.is_ok() or result.error.code == "OFFER_NOT_AVAILABLE":
		book.forget_offer(offer_id)
		reload()
	return result


## Where a platform is, as a line ("In orbit of Kepler b").
func place_text(host: Trade.Host, translator: Object) -> String:
	var body := Wire.as_string(body_names.get(host.body_id))
	if body.is_empty():
		body = translator.tr("FLEET_UNKNOWN_PLACE")
	match host.location:
		Trade.LOCATION_ORBIT:
			return translator.tr("FLEET_IN_ORBIT").format({"body": body})
		Trade.LOCATION_SURFACE:
			return translator.tr("FLEET_ON_BODY").format({"body": body})
	return translator.tr("FLEET_IN_TRANSIT")


func _name_bodies() -> void:
	for value: Trade.Host in book.hosts.values():
		if value.body_id.is_empty() or body_names.has(value.body_id):
			continue
		var body := await Services.api.get_json("/v2/bodies/" + value.body_id.uri_encode())
		if body.is_ok():
			body_names[value.body_id] = Wire.as_string(body.data.get("name"))


## The trade inventory of an own platform (`GET /v2/structures/{id}/trade`).
static func load_inventory(structure_id: int) -> ApiResult:
	return await Services.api.get_json("/v2/structures/%d/trade" % structure_id)


func _on_event(event: SseEvent) -> void:
	if not Trade.EVENTS.has(event.type):
		return
	var data := Wire.parse_object(event.data)
	var offer_id := Wire.as_int(data.get("offerId"))
	if offer_id != 0 and event.type != "trade.offerPlaced":
		book.forget_offer(offer_id)
	reload()
