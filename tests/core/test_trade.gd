extends GdUnitTestSuite

## Answers in the shape of the contract (numbers as Godot's JSON parser delivers them).
const OFFER := {"offerId": 7.0, "hostId": 40.0, "ownerId": "p-2", "ownerName": "Mira",
	"offer": {"resource": "FUSION_DRIVE_MODULE", "amount": 20.0},
	"demand": {"resource": "TITANIUM_PLATE", "amount": 400000.0},
	"feeOffer": 1.0, "feeDemand": 20000.0, "netOffer": 19.0, "netDemand": 380000.0,
	"placedAt": 1000.0, "expiresAt": 1209601000.0}
const HOSTS := {"hosts": [
	{"structureId": 41.0, "name": "Zeta Exchange", "ownerId": "p-3", "ownerName": "Ola",
		"systemId": "S-1", "position": [1.5, -2.0, 0.25], "bodyId": "B-1", "location": "surface",
		"x": 12.0, "y": -4.0, "activeHosts": 1.0, "capacity": 50000.0, "used": 60000.0, "offers": 0.0,
		"guests": []},
	{"structureId": 40.0, "name": "Alpha Market", "ownerId": "p-2", "ownerName": "Mira",
		"systemId": "S-1", "position": [1.5, -2.0, 0.25], "location": "orbit", "bodyId": "B-2",
		"activeHosts": 2.0, "capacity": 100000.0, "used": 400020.0, "offers": 1.0,
		"guests": [{"structureId": 9.0, "name": "Kestrel", "ownerId": "p-1", "ownerName": "Me"}]},
]}

var _definitions: GameDefinitions


func before_test() -> void:
	_definitions = GameDefinitions.from_bundle({"dataHash": "x", "modules": [], "tradeMinAmount": 20.0,
		"resources": [
			{"key": "IRON", "displayName": "Iron", "kind": "NATURAL", "utility": false, "tradable": true},
			{"key": "WATER", "displayName": "Water", "kind": "NATURAL", "utility": false, "tradable": true},
			{"key": "ENERGY", "displayName": "Energy", "kind": "NATURAL", "utility": true, "tradable": false},
		]})


func test_fee_is_five_percent_rounded_up_per_side() -> void:
	assert_int(Trade.fee(20)).is_equal(1)
	assert_int(Trade.fee(21)).is_equal(2)
	assert_int(Trade.fee(40)).is_equal(2)
	assert_int(Trade.fee(1000)).is_equal(50)
	assert_int(Trade.fee(400000)).is_equal(20000)
	assert_int(Trade.net(20)).is_equal(19)
	assert_int(Trade.net(0)).is_equal(0)


func test_reads_an_offer() -> void:
	var offer := Trade.Offer.from_wire(OFFER)
	assert_int(offer.offer_id).is_equal(7)
	assert_int(offer.host_id).is_equal(40)
	assert_str(offer.offer.resource).is_equal("FUSION_DRIVE_MODULE")
	assert_int(offer.demand.amount).is_equal(400000)
	assert_int(offer.net_offer).is_equal(19)
	assert_int(offer.net_demand).is_equal(380000)
	assert_int(offer.expires_at).is_equal(1209601000)
	assert_bool(offer.is_mine("p-2")).is_true()
	assert_bool(offer.is_mine("")).is_false()
	assert_bool(offer.involves("TITANIUM_PLATE")).is_true()
	assert_bool(offer.involves("IRON")).is_false()


func test_reads_hosts_sorted_by_name_with_guests() -> void:
	var trade := Trade.new()
	trade.apply_hosts(HOSTS)
	var list := trade.host_list()
	assert_int(list.size()).is_equal(2)
	assert_str(list[0].name).is_equal("Alpha Market")
	assert_str(list[0].location).is_equal(Trade.LOCATION_ORBIT)
	assert_int(list[0].guests.size()).is_equal(1)
	assert_str(list[0].guests[0].owner_name).is_equal("Me")
	assert_vector(list[1].position).is_equal(Vector3(1.5, -2.0, 0.25))
	assert_int(list[1].x).is_equal(12)
	# Proceeds may push the inventory beyond its room: never negative.
	assert_int(list[1].room()).is_equal(0)
	assert_object(trade.host(41)).is_same(list[1])


func test_offers_filter_by_platform_and_item_and_drop_gone_ones() -> void:
	var trade := Trade.new()
	var other := OFFER.duplicate(true)
	other["offerId"] = 8.0
	other["hostId"] = 41.0
	other["offer"] = {"resource": "IRON", "amount": 100.0}
	trade.apply_offers({"offers": [OFFER, other]})
	trade.apply_mine({"offers": [OFFER], "balances": [
		{"hostId": 40.0, "ownerId": "p-2", "items": [{"resource": "IRON", "amount": 95.0}]},
		{"hostId": 41.0, "ownerId": "p-2", "items": []}]})
	assert_int(trade.offers_at(0).size()).is_equal(2)
	assert_int(trade.offers_at(41).size()).is_equal(1)
	assert_int(trade.offers_at(0, "IRON").size()).is_equal(1)
	assert_int(trade.offers_at(40, "IRON").size()).is_equal(0)
	# Empty balances are left out.
	assert_int(trade.my_balances.size()).is_equal(1)
	assert_int(trade.my_balances[0].total()).is_equal(95)
	assert_int(trade.balance_at(40).size()).is_equal(1)
	assert_int(trade.balance_at(41).size()).is_equal(0)
	trade.forget_offer(7)
	assert_int(trade.offers.size()).is_equal(1)
	assert_int(trade.my_offers.size()).is_equal(0)


func test_check_offer_previews_the_servers_refusals() -> void:
	assert_str(Trade.check_offer(_definitions, "IRON", 20, "WATER", 20, 20)).is_empty()
	assert_str(Trade.check_offer(_definitions, "IRON", 20, "IRON", 20, 20)).is_equal("VALIDATION_FAILED")
	assert_str(Trade.check_offer(_definitions, "", 20, "WATER", 20, 20)).is_equal("VALIDATION_FAILED")
	assert_str(Trade.check_offer(_definitions, "ENERGY", 20, "WATER", 20, 20)).is_equal("NOT_TRADEABLE")
	assert_str(Trade.check_offer(_definitions, "IRON", 19, "WATER", 20, 20)).is_equal("AMOUNT_TOO_SMALL")
	assert_str(Trade.check_offer(_definitions, "IRON", 20, "WATER", 19, 20)).is_equal("AMOUNT_TOO_SMALL")
	assert_str(Trade.check_offer(_definitions, "IRON", 30, "WATER", 20, 29)).is_equal("INSUFFICIENT_STOCK")


func test_check_accept() -> void:
	var offer := Trade.Offer.from_wire(OFFER)
	assert_str(Trade.check_accept(offer, "p-1", 400000)).is_empty()
	assert_str(Trade.check_accept(offer, "p-2", 400000)).is_equal("OWN_OFFER")
	assert_str(Trade.check_accept(offer, "p-1", 399999)).is_equal("INSUFFICIENT_STOCK")


func test_offer_request_and_definitions() -> void:
	assert_dict(Trade.offer_request("IRON", 25, "WATER", 30)).is_equal(
		{"offer": {"resource": "IRON", "amount": 25}, "demand": {"resource": "WATER", "amount": 30}})
	assert_int(_definitions.trade_min_amount).is_equal(20)
	assert_bool(_definitions.is_tradable("IRON")).is_true()
	assert_bool(_definitions.is_tradable("ENERGY")).is_false()
	assert_array(Array(_definitions.tradable_items())).is_equal(["IRON", "WATER"])


func test_reads_the_inventory_of_an_own_platform() -> void:
	var inventory := Trade.HostInventory.from_wire({"structureId": 40.0, "activeHosts": 2.0,
		"capacity": 100000.0, "used": 400020.0, "items": [{"resource": "FUSION_DRIVE_MODULE", "amount": 20.0}],
		"offers": [OFFER], "balances": [], "locked": true})
	assert_int(inventory.active_hosts).is_equal(2)
	assert_int(inventory.items[0].amount).is_equal(20)
	assert_int(inventory.offers.size()).is_equal(1)
	assert_bool(inventory.locked).is_true()
	assert_bool(Trade.HostInventory.from_wire({}).locked).is_false()
