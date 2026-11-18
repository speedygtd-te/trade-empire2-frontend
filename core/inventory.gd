class_name Inventory
extends RefCounted
## The stock of one structure (`GET /v2/structures/{id}/inventory`, SSE
## `structure.ratesChanged`). Amounts in micro-units; `scale` turns them into whole units.

var structure_id: int = 0
var capacity: int = 0
## Total stock as a flow (micro-units); null when the answer had none.
var used: FlowValue = null
var scale: int = 1000000

## Item key → FlowValue.
var _items: Dictionary = {}


static func from_wire(data: Dictionary, micro_per_unit: int = 1000000) -> Inventory:
	var inventory := Inventory.new()
	inventory.structure_id = Wire.as_int(data.get("structureId"))
	inventory.capacity = Wire.as_int(data.get("capacity"))
	inventory.scale = maxi(micro_per_unit, 1)
	if typeof(data.get("used")) == TYPE_DICTIONARY:
		inventory.used = FlowValue.from_wire(Wire.as_dict(data.get("used")))
	if typeof(data.get("items")) == TYPE_ARRAY:
		var items: Array = data.get("items")
		for entry: Variant in items:
			var item := Wire.as_dict(entry)
			var key := Wire.as_string(item.get("item"))
			if not key.is_empty():
				inventory._items[key] = FlowValue.from_wire(item)
	return inventory


## Whole units of `item` at game time `now_ms` (0 when the structure has none).
func units(item: String, now_ms: int) -> int:
	var flow := _items.get(item) as FlowValue
	if flow == null:
		return 0
	@warning_ignore("integer_division")
	return flow.amount_at(now_ms) / scale


## Applies `structure.ratesChanged`: new values for the resources it names.
func apply_rates(changed: Array) -> void:
	for entry: Variant in changed:
		var data := Wire.as_dict(entry)
		var key := Wire.as_string(data.get("resource"))
		if not key.is_empty():
			_items[key] = FlowValue.from_wire(data)


## The flow of an item, or null when the structure has none.
func flow(item: String) -> FlowValue:
	return _items.get(item) as FlowValue


func item_keys() -> PackedStringArray:
	var keys := PackedStringArray()
	for key: String in _items.keys():
		keys.append(key)
	keys.sort()
	return keys
