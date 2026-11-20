class_name EnterpriseFlagship
extends RefCounted
## An enterprise's flagship (`GET/POST /v2/enterprises/{id}/flagship`, draft.37) and the list of
## its structures (`GET …/structures`).
##
## One per enterprise. `none`: it can be ordered, the price (about 1.55 M units) is taken from the
## enterprise inventory at once; `ordered`: it is delivered `deliveryMs` later into the orbit of
## the chosen body; `active`: it flies (`structureId`); `destroyed`: it is gone and can be ordered
## again. Amounts are micro-units. The server decides; this only prepares what the screen shows.

const NONE := "none"
const ORDERED := "ordered"
const ACTIVE := "active"
const DESTROYED := "destroyed"


## One resource of the price: needed, in the inventory now (booked plus collected), missing.
class PriceItem:
	extends RefCounted
	var resource := ""
	var amount := 0
	var available := 0
	var missing := 0


## One structure of the enterprise (`EnterpriseStructuresResponse`).
class StructureRef:
	extends RefCounted
	var structure_id := 0
	var name := ""
	var flagship := false


var enterprise_id := ""
var status := NONE
## Where it is delivered (orbit of this body); "" before an order.
var body_id := ""
var ordered_at := 0
var delivers_at := 0
var delivered_at := 0
var destroyed_at := 0
## The flagship structure while `active`; 0 otherwise.
var structure_id := 0
var price: Array[PriceItem] = []
## How long a delivery takes.
var delivery_ms := 0
## The Enterprise Lab works (power, full crew): research time runs.
var lab_running := false
## Active, fully staffed administrations in the flagship (each +5 members).
var administrations := 0
var member_cap := 0
var member_count := 0


static func from_wire(data: Dictionary) -> EnterpriseFlagship:
	var view := EnterpriseFlagship.new()
	view.enterprise_id = Wire.as_string(data.get("enterpriseId"))
	view.status = Wire.as_string(data.get("status"), NONE)
	view.body_id = Wire.as_string(data.get("bodyId"))
	view.ordered_at = Wire.as_int(data.get("orderedAt"))
	view.delivers_at = Wire.as_int(data.get("deliversAt"))
	view.delivered_at = Wire.as_int(data.get("deliveredAt"))
	view.destroyed_at = Wire.as_int(data.get("destroyedAt"))
	view.structure_id = Wire.as_int(data.get("structureId"))
	view.delivery_ms = Wire.as_int(data.get("deliveryMs"))
	view.lab_running = data.get("labRunning") == true
	view.administrations = Wire.as_int(data.get("administrations"))
	view.member_cap = Wire.as_int(data.get("memberCap"))
	view.member_count = Wire.as_int(data.get("memberCount"))
	for value: Variant in _list(data.get("price")):
		var row := Wire.as_dict(value)
		var item := PriceItem.new()
		item.resource = Wire.as_string(row.get("resource"))
		item.amount = Wire.as_int(row.get("amount"))
		item.available = Wire.as_int(row.get("available"))
		item.missing = Wire.as_int(row.get("missing"))
		if not item.resource.is_empty():
			view.price.append(item)
	return view


## The structures of `GET …/structures`, the flagship first.
static func structures_from_wire(data: Dictionary) -> Array[StructureRef]:
	var result: Array[StructureRef] = []
	for value: Variant in _list(data.get("structures")):
		var row := Wire.as_dict(value)
		var ref := StructureRef.new()
		ref.structure_id = Wire.as_int(row.get("structureId"))
		ref.name = Wire.as_string(row.get("name"))
		ref.flagship = row.get("flagship") == true
		if ref.structure_id != 0:
			result.append(ref)
	result.sort_custom(func(a: StructureRef, b: StructureRef) -> bool:
		if a.flagship != b.flagship:
			return a.flagship
		return a.structure_id < b.structure_id)
	return result


## Body of `POST …/flagship`.
static func order_body(body: String) -> Dictionary:
	return {"bodyId": body}


## The missing amounts an `INSUFFICIENT_STOCK` answer names (`details.missing`): resource →
## micro-units.
static func missing_from_details(details: Dictionary) -> Dictionary:
	var result: Dictionary = {}
	for value: Variant in _list(details.get("missing")):
		var row := Wire.as_dict(value)
		var key := Wire.as_string(row.get("resource"))
		if not key.is_empty():
			result[key] = Wire.as_int(row.get("missing"))
	return result


## Takes the missing amounts of a refused order: they count instead of the ones shown before
## (the inventory changed in between). A resource not named is no longer missing.
func apply_missing(missing: Dictionary) -> void:
	for item: PriceItem in price:
		item.missing = maxi(Wire.as_int(missing.get(item.resource)), 0)
		if item.missing > 0:
			item.available = maxi(item.amount - item.missing, 0)


## Whether a new flagship can be ordered (none yet, or the last one was destroyed).
func can_order() -> bool:
	return status == NONE or status == DESTROYED


## Whether the inventory holds the whole price.
func affordable() -> bool:
	for item: PriceItem in price:
		if item.missing > 0:
			return false
	return true


## The resources of the price that are short.
func missing_items() -> Array[PriceItem]:
	var result: Array[PriceItem] = []
	for item: PriceItem in price:
		if item.missing > 0:
			result.append(item)
	return result


## The whole price in micro-units.
func total_price() -> int:
	var sum := 0
	for item: PriceItem in price:
		sum += item.amount
	return sum


## Time until delivery at game time `now`; 0 when it is not ordered or already due.
func remaining_ms(now: int) -> int:
	if status != ORDERED:
		return 0
	return maxi(delivers_at - now, 0)


## How far the delivery is (0..1) at `now`.
func delivery_progress(now: int) -> float:
	if status != ORDERED:
		return 1.0 if status == ACTIVE else 0.0
	var span := delivers_at - ordered_at
	if span <= 0:
		return 1.0
	return clampf(float(now - ordered_at) / float(span), 0.0, 1.0)


## Why an order cannot be sent now: "" when it can, else one of "exists", "right", "body",
## "stock". `has_right`: the player holds MANAGE_TREASURY.
func order_blocker(has_right: bool, chosen_body: String) -> String:
	if not can_order():
		return "exists"
	if not has_right:
		return "right"
	if not affordable():
		return "stock"
	if chosen_body.is_empty():
		return "body"
	return ""


static func _list(value: Variant) -> Array:
	if typeof(value) == TYPE_ARRAY:
		var list: Array = value
		return list
	return []
