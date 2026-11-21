class_name Trade
extends RefCounted
## Trading on trade platforms (draft.44, Backend-V2 `docs/SPEC-handel.md`): a structure with a
## working `TRADE_HOST` keeps a trade inventory in escrow; a ship with a working reader
## (`TRADE_MODULE`) docked directly at it places offers (one item against another, whole units,
## at least `tradeMinAmount` a side), accepts offers (first come, first served) and collects what
## is due to its owner. The platform takes ⌈5 %⌉ of each side when an offer is taken.
##
## This holds the server's views and previews refusals; the server decides.

## The modules (game data keys).
const HOST := "TRADE_HOST"
const READER := "TRADE_MODULE"
## Fee per side in percent, rounded up (contract `feeOffer`/`feeDemand`).
const FEE_PERCENT := 5
## Where a platform is (`TradeHostView.location`).
const LOCATION_SURFACE := "surface"
const LOCATION_ORBIT := "orbit"
const LOCATION_SPACE := "space"
## Result of an offer command (`OfferResult.status`).
const STATUS_OPEN := "open"
const STATUS_TAKEN := "taken"
const STATUS_WITHDRAWN := "withdrawn"
## SSE events (`TradeEvent`).
const EVENTS: PackedStringArray = ["trade.offerPlaced", "trade.offerTaken", "trade.offerWithdrawn",
	"trade.offerExpired", "trade.offerVoided", "trade.collected"]


## One side of an offer, or an item amount in the trade inventory (whole units).
class Goods:
	extends RefCounted
	var resource := ""
	var amount := 0

	static func from_wire(value: Variant) -> Goods:
		var data := Wire.as_dict(value)
		var side := Goods.new()
		side.resource = Wire.as_string(data.get("resource"))
		side.amount = Wire.as_int(data.get("amount"))
		return side

	static func list(value: Variant) -> Array[Goods]:
		var result: Array[Goods] = []
		if typeof(value) != TYPE_ARRAY:
			return result
		var rows: Array = value
		for row: Variant in rows:
			var side := from_wire(row)
			if not side.resource.is_empty() and side.amount > 0:
				result.append(side)
		return result

	func to_wire() -> Dictionary:
		return {"resource": resource, "amount": amount}


## An open offer (`OfferView`).
class Offer:
	extends RefCounted
	var offer_id := 0
	var host_id := 0
	var owner_id := ""
	var owner_name := ""
	var offer := Goods.new()
	var demand := Goods.new()
	var fee_offer := 0
	var fee_demand := 0
	## What the taker gets, and what the offerer gets (to collect).
	var net_offer := 0
	var net_demand := 0
	var placed_at := 0
	var expires_at := 0

	static func from_wire(value: Variant) -> Offer:
		var data := Wire.as_dict(value)
		var offer := Offer.new()
		offer.offer_id = Wire.as_int(data.get("offerId"))
		offer.host_id = Wire.as_int(data.get("hostId"))
		offer.owner_id = Wire.as_string(data.get("ownerId"))
		offer.owner_name = Wire.as_string(data.get("ownerName"))
		offer.offer = Goods.from_wire(data.get("offer"))
		offer.demand = Goods.from_wire(data.get("demand"))
		offer.fee_offer = Wire.as_int(data.get("feeOffer"))
		offer.fee_demand = Wire.as_int(data.get("feeDemand"))
		offer.net_offer = Wire.as_int(data.get("netOffer"))
		offer.net_demand = Wire.as_int(data.get("netDemand"))
		offer.placed_at = Wire.as_int(data.get("placedAt"))
		offer.expires_at = Wire.as_int(data.get("expiresAt"))
		return offer

	static func list(value: Variant) -> Array[Offer]:
		var result: Array[Offer] = []
		if typeof(value) != TYPE_ARRAY:
			return result
		var rows: Array = value
		for row: Variant in rows:
			var offer := from_wire(row)
			if offer.offer_id != 0:
				result.append(offer)
		return result

	func is_mine(player_id: String) -> bool:
		return not player_id.is_empty() and owner_id == player_id

	## Whether `resource` is offered or demanded.
	func involves(resource: String) -> bool:
		return offer.resource == resource or demand.resource == resource


## A foreign ship docked at a platform (`TradeGuestView`).
class Guest:
	extends RefCounted
	var structure_id := 0
	var name := ""
	var owner_id := ""
	var owner_name := ""


## A trade platform in sight (`TradeHostView`).
class Host:
	extends RefCounted
	var structure_id := 0
	var name := ""
	var owner_id := ""
	var owner_name := ""
	var system_id := ""
	var position := Vector3.ZERO
	var body_id := ""
	var location := ""
	var x := 0
	var y := 0
	var active_hosts := 0
	var capacity := 0
	var used := 0
	var offers := 0
	var guests: Array[Guest] = []

	static func from_wire(value: Variant) -> Host:
		var data := Wire.as_dict(value)
		var host := Host.new()
		host.structure_id = Wire.as_int(data.get("structureId"))
		host.name = Wire.as_string(data.get("name"))
		host.owner_id = Wire.as_string(data.get("ownerId"))
		host.owner_name = Wire.as_string(data.get("ownerName"))
		host.system_id = Wire.as_string(data.get("systemId"))
		if typeof(data.get("position")) == TYPE_ARRAY:
			var at: Array = data.get("position")
			if at.size() >= 3:
				host.position = Vector3(Trade._number(at[0]), Trade._number(at[1]), Trade._number(at[2]))
		host.body_id = Wire.as_string(data.get("bodyId"))
		host.location = Wire.as_string(data.get("location"))
		host.x = Wire.as_int(data.get("x"))
		host.y = Wire.as_int(data.get("y"))
		host.active_hosts = Wire.as_int(data.get("activeHosts"))
		host.capacity = Wire.as_int(data.get("capacity"))
		host.used = Wire.as_int(data.get("used"))
		host.offers = Wire.as_int(data.get("offers"))
		if typeof(data.get("guests")) == TYPE_ARRAY:
			var rows: Array = data.get("guests")
			for row: Variant in rows:
				var entry := Wire.as_dict(row)
				var guest := Guest.new()
				guest.structure_id = Wire.as_int(entry.get("structureId"))
				guest.name = Wire.as_string(entry.get("name"))
				guest.owner_id = Wire.as_string(entry.get("ownerId"))
				guest.owner_name = Wire.as_string(entry.get("ownerName"))
				host.guests.append(guest)
		return host

	## Room left in the trade inventory (never negative).
	func room() -> int:
		return maxi(capacity - used, 0)


## Goods of one player waiting on a platform (`TradeBalanceView`): proceeds of taken offers and
## withdrawn or expired offers.
class Balance:
	extends RefCounted
	var host_id := 0
	var owner_id := ""
	var items: Array[Goods] = []

	static func list(value: Variant) -> Array[Balance]:
		var result: Array[Balance] = []
		if typeof(value) != TYPE_ARRAY:
			return result
		var rows: Array = value
		for row: Variant in rows:
			var data := Wire.as_dict(row)
			var balance := Balance.new()
			balance.host_id = Wire.as_int(data.get("hostId"))
			balance.owner_id = Wire.as_string(data.get("ownerId"))
			balance.items = Goods.list(data.get("items"))
			if balance.host_id != 0 and not balance.items.is_empty():
				result.append(balance)
		return result

	func total() -> int:
		var sum := 0
		for side: Goods in items:
			sum += side.amount
		return sum


## The trade inventory of an own platform, read only (`HostTradeResponse`).
class HostInventory:
	extends RefCounted
	var structure_id := 0
	var active_hosts := 0
	var capacity := 0
	var used := 0
	var items: Array[Goods] = []
	var offers: Array[Offer] = []
	var balances: Array[Balance] = []
	## Moving is refused (escrow not empty or foreign ships docked).
	var locked := false

	static func from_wire(data: Dictionary) -> HostInventory:
		var inventory := HostInventory.new()
		inventory.structure_id = Wire.as_int(data.get("structureId"))
		inventory.active_hosts = Wire.as_int(data.get("activeHosts"))
		inventory.capacity = Wire.as_int(data.get("capacity"))
		inventory.used = Wire.as_int(data.get("used"))
		inventory.items = Goods.list(data.get("items"))
		inventory.offers = Offer.list(data.get("offers"))
		inventory.balances = Balance.list(data.get("balances"))
		inventory.locked = data.get("locked") == true
		return inventory


## Platforms in sight (`GET /v2/trade/hosts`), by structure id.
var hosts: Dictionary = {}
## Offers in sight (`GET /v2/trade/offers`), in id order.
var offers: Array[Offer] = []
## The player's own open offers and goods to collect (`GET /v2/trade/mine`).
var my_offers: Array[Offer] = []
var my_balances: Array[Balance] = []


## The fee a platform takes from one side of `amount` units: ⌈amount × 5 %⌉.
static func fee(amount: int) -> int:
	@warning_ignore("integer_division")
	return (maxi(amount, 0) * FEE_PERCENT + 99) / 100


## What is left of `amount` after the fee.
static func net(amount: int) -> int:
	return maxi(amount, 0) - fee(amount)


## Preview of the server's checks for a new offer: "" when it looks fine, otherwise the code the
## server would answer. `cargo_units`: whole units of the offered item in the ship's cargo hold.
static func check_offer(definitions: GameDefinitions, offer_item: String, offer_amount: int,
		demand_item: String, demand_amount: int, cargo_units: int) -> String:
	if offer_item.is_empty() or demand_item.is_empty() or offer_item == demand_item:
		return "VALIDATION_FAILED"
	if definitions != null and (not definitions.is_tradable(offer_item) or not definitions.is_tradable(demand_item)):
		return "NOT_TRADEABLE"
	var least := definitions.trade_min_amount if definitions != null else 20
	if offer_amount < least or demand_amount < least:
		return "AMOUNT_TOO_SMALL"
	if offer_amount > cargo_units:
		return "INSUFFICIENT_STOCK"
	return ""


## Preview of the checks for taking `offer` with a ship that holds `cargo_units` whole units of
## the demanded item: "" when it looks fine.
static func check_accept(offer: Offer, player_id: String, cargo_units: int) -> String:
	if offer.is_mine(player_id):
		return "OWN_OFFER"
	if cargo_units < offer.demand.amount:
		return "INSUFFICIENT_STOCK"
	return ""


## Body of `POST /v2/structures/{shipId}/trade/offers`.
static func offer_request(offer_item: String, offer_amount: int, demand_item: String, demand_amount: int) -> Dictionary:
	return {"offer": {"resource": offer_item, "amount": offer_amount},
		"demand": {"resource": demand_item, "amount": demand_amount}}


## Takes `GET /v2/trade/hosts`.
func apply_hosts(data: Dictionary) -> void:
	hosts.clear()
	if typeof(data.get("hosts")) != TYPE_ARRAY:
		return
	var rows: Array = data.get("hosts")
	for row: Variant in rows:
		var host := Host.from_wire(row)
		if host.structure_id != 0:
			hosts[host.structure_id] = host


## Takes `GET /v2/trade/offers`.
func apply_offers(data: Dictionary) -> void:
	offers = Offer.list(data.get("offers"))


## Takes `GET /v2/trade/mine`.
func apply_mine(data: Dictionary) -> void:
	my_offers = Offer.list(data.get("offers"))
	my_balances = Balance.list(data.get("balances"))


func host(structure_id: int) -> Host:
	return hosts.get(structure_id) as Host


## Platforms sorted by name.
func host_list() -> Array[Host]:
	var result: Array[Host] = []
	for value: Host in hosts.values():
		result.append(value)
	result.sort_custom(func(a: Host, b: Host) -> bool:
		var order := a.name.naturalnocasecmp_to(b.name)
		return order < 0 if order != 0 else a.structure_id < b.structure_id)
	return result


## Offers in sight on one platform (all of them when `host_id` is 0), optionally only those that
## offer or demand `resource`.
func offers_at(host_id: int, resource: String = "") -> Array[Offer]:
	var result: Array[Offer] = []
	for offer: Offer in offers:
		if host_id != 0 and offer.host_id != host_id:
			continue
		if not resource.is_empty() and not offer.involves(resource):
			continue
		result.append(offer)
	return result


## What the player may collect on a platform (empty when nothing).
func balance_at(host_id: int) -> Array[Goods]:
	for balance: Balance in my_balances:
		if balance.host_id == host_id:
			return balance.items
	return []


## Drops an offer that is gone (taken, withdrawn, expired, voided) from the lists.
func forget_offer(offer_id: int) -> void:
	offers = _without(offers, offer_id)
	my_offers = _without(my_offers, offer_id)


static func _without(list: Array[Offer], offer_id: int) -> Array[Offer]:
	var result: Array[Offer] = []
	for offer: Offer in list:
		if offer.offer_id != offer_id:
			result.append(offer)
	return result


static func _number(value: Variant) -> float:
	match typeof(value):
		TYPE_FLOAT:
			var number: float = value
			return number
		TYPE_INT:
			var whole: int = value
			return float(whole)
	return 0.0
