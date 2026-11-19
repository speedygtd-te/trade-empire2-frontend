class_name ProductionBalance
extends RefCounted
## The production balance of a structure (`GET /v2/structures/{id}/production`, draft.28): per
## resource what is made, used, taxed and what the stock does (`totals`), who makes and uses it
## (the buckets' effective inputs and outputs per module type), the inhabitants per tier and the
## share of them the life support carries. For the Production tab: short resources first, so the
## player sees where to build capacity. Rates are micro-units per hour of the current solution;
## the server decides.

enum State { SHORT, SURPLUS, BALANCED }

const MS_PER_HOUR := 3600000
const TIERS := 5


## One resource of the balance (`ResourceTotal`).
class Row:
	extends RefCounted
	var resource: String = ""
	var produced: int = 0
	var consumed: int = 0
	var taxed: int = 0
	## Change of the stock (= produced − consumed).
	var net: int = 0

	func state() -> State:
		if net < 0:
			return State.SHORT
		if net > 0:
			return State.SURPLUS
		return State.BALANCED


## One effective input or output of a recipe bucket.
class Flow:
	extends RefCounted
	var module_type: String = ""
	var modules: int = 0
	var resource: String = ""
	var rate: int = 0
	## True for an input (used), false for an output (made).
	var input: bool = false


## What the modules of one type make or use of a resource together.
class Use:
	extends RefCounted
	var module_type: String = ""
	var modules: int = 0
	var rate: int = 0


## The rows of `totals`; resources without a key are skipped.
static func totals_from_wire(value: Variant) -> Array[Row]:
	var result: Array[Row] = []
	if typeof(value) != TYPE_ARRAY:
		return result
	var list: Array = value
	for entry: Variant in list:
		var data := Wire.as_dict(entry)
		var row := Row.new()
		row.resource = Wire.as_string(data.get("resource"))
		if row.resource.is_empty():
			continue
		row.produced = Wire.as_int(data.get("producedPerHour"))
		row.consumed = Wire.as_int(data.get("consumedPerHour"))
		row.taxed = Wire.as_int(data.get("taxedPerHour"))
		row.net = Wire.as_int(data.get("netPerHour"))
		result.append(row)
	return result


## Inhabitants per tier 1–5 (`population`); missing tiers are 0.
static func population_from_wire(value: Variant) -> Array[int]:
	var result: Array[int] = [0, 0, 0, 0, 0]
	if typeof(value) != TYPE_ARRAY:
		return result
	var list: Array = value
	for tier: int in mini(list.size(), TIERS):
		result[tier] = maxi(Wire.as_int(list[tier]), 0)
	return result


## The effective inputs and outputs of the buckets (`buckets`), zero rates left out.
static func flows_from_wire(value: Variant) -> Array[Flow]:
	var result: Array[Flow] = []
	if typeof(value) != TYPE_ARRAY:
		return result
	var list: Array = value
	for entry: Variant in list:
		var bucket := Wire.as_dict(entry)
		for side: String in ["inputs", "outputs"]:
			var rates: Variant = bucket.get(side)
			if typeof(rates) != TYPE_ARRAY:
				continue
			var rows: Array = rates
			for rate_entry: Variant in rows:
				var data := Wire.as_dict(rate_entry)
				var flow := Flow.new()
				flow.module_type = Wire.as_string(bucket.get("moduleType"))
				flow.modules = Wire.as_int(bucket.get("modules"))
				flow.resource = Wire.as_string(data.get("resource"))
				flow.rate = Wire.as_int(data.get("effective"))
				flow.input = side == "inputs"
				if flow.rate != 0 and not flow.resource.is_empty():
					result.append(flow)
	return result


## Short resources first (the most negative on top), then the ones that grow, then the balanced
## ones; within the last two by `names` (resource → shown name, the key where missing).
static func sorted(rows: Array[Row], names: Dictionary = {}) -> Array[Row]:
	var result: Array[Row] = []
	result.assign(rows)
	result.sort_custom(func(a: Row, b: Row) -> bool:
		if a.state() != b.state():
			return a.state() < b.state()
		if a.state() == State.SHORT and a.net != b.net:
			return a.net < b.net
		var name_a := Wire.as_string(names.get(a.resource), a.resource)
		var name_b := Wire.as_string(names.get(b.resource), b.resource)
		var order := name_a.naturalnocasecmp_to(name_b)
		return order < 0 if order != 0 else a.resource < b.resource)
	return result


## Only the short resources (net < 0).
static func short(rows: Array[Row]) -> Array[Row]:
	var result: Array[Row] = []
	for row: Row in rows:
		if row.state() == State.SHORT:
			result.append(row)
	return result


## Milliseconds until a stock of `stock` micro-units runs empty at `net` micro-units per hour:
## 0 when it is empty already, -1 when it does not shrink. Whole hours and the rest are divided
## separately, so large stocks do not overflow.
static func ms_to_empty(stock: int, net: int) -> int:
	if net >= 0:
		return -1
	if stock <= 0:
		return 0
	var drain := -net
	@warning_ignore("integer_division")
	var hours := stock / drain
	var rest := stock % drain
	@warning_ignore("integer_division")
	return hours * MS_PER_HOUR + rest * MS_PER_HOUR / drain


## Who makes (`input` false) or uses (`input` true) a resource, summed per module type, largest
## first (equal rates by type).
static func uses(flows: Array[Flow], resource: String, input: bool) -> Array[Use]:
	var by_type: Dictionary = {}
	for flow: Flow in flows:
		if flow.resource != resource or flow.input != input:
			continue
		var use := by_type.get(flow.module_type) as Use
		if use == null:
			use = Use.new()
			use.module_type = flow.module_type
			by_type[flow.module_type] = use
		use.modules += flow.modules
		use.rate += flow.rate
	var result: Array[Use] = []
	for use: Use in by_type.values():
		result.append(use)
	result.sort_custom(func(a: Use, b: Use) -> bool:
		return a.rate > b.rate if a.rate != b.rate else a.module_type < b.module_type)
	return result


## What a resource's `consumed` holds beyond the buckets' inputs (the inhabitants' food); 0 when
## nothing.
static func other_use(row: Row, flows: Array[Flow]) -> int:
	var inputs := 0
	for use: Use in uses(flows, row.resource, true):
		inputs += use.rate
	return maxi(row.consumed - inputs, 0)
