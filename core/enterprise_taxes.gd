class_name EnterpriseTaxes
extends RefCounted
## An enterprise's tax table (`GET/PUT /v2/enterprises/{id}/taxes`) and its inventory
## (`GET …/inventory`).
##
## One rate in whole percent per raw material or intermediate, the same for every member. A PUT
## replaces the whole table (left out = 0): a lower rate counts at once, a higher one after
## `increase_delay_ms` (announced as pending), the current rate again cancels an announcement.

const MS_PER_HOUR := 3600000
## Most rows a PUT takes.
const ROWS_MAX := 256


class Rate:
	extends RefCounted
	var resource := ""
	## Counts now (0 when only an increase is announced).
	var percent := 0
	## The announced increase; -1 when there is none.
	var pending_percent := -1
	var effective_at := 0

	func has_pending() -> bool:
		return pending_percent >= 0


## The enterprise's goods at `at`, growing linearly with each item's rate until a member's
## production changes (then load again).
class Stock:
	extends RefCounted
	var at := 0
	## [resource, micro-units at `at`, micro-units per hour]
	var items: Array[Array] = []

	static func from_wire(data: Dictionary) -> Stock:
		var stock := Stock.new()
		stock.at = Wire.as_int(data.get("at"))
		var rows: Array = data.get("items") if typeof(data.get("items")) == TYPE_ARRAY else []
		for value: Variant in rows:
			var row := Wire.as_dict(value)
			var key := Wire.as_string(row.get("resource"))
			if not key.is_empty():
				stock.items.append([key, Wire.as_int(row.get("value")), Wire.as_int(row.get("ratePerHour"))])
		return stock

	## Micro-units of `resource` at game time `now_ms`; 0 for goods it does not hold.
	func value_at(resource: String, now_ms: int) -> int:
		for item: Array in items:
			if item[0] == resource:
				var value: int = item[1]
				var rate: int = item[2]
				@warning_ignore("integer_division")
				return maxi(value + rate * maxi(now_ms - at, 0) / MS_PER_HOUR, 0)
		return 0

	func rate_of(resource: String) -> int:
		for item: Array in items:
			if item[0] == resource:
				var rate: int = item[2]
				return rate
		return 0

	## Whether anything would be lost when the enterprise ends now.
	func holds_anything(now_ms: int) -> bool:
		for item: Array in items:
			var key: String = item[0]
			if value_at(key, now_ms) > 0:
				return true
		return false


var enterprise_id := ""
## Resource → Rate; only resources with a rate or an announced increase.
var rates: Dictionary = {}
var max_percent := 50
var increase_delay_ms := 24 * MS_PER_HOUR


static func from_wire(data: Dictionary) -> EnterpriseTaxes:
	var taxes := EnterpriseTaxes.new()
	taxes.enterprise_id = Wire.as_string(data.get("enterpriseId"))
	taxes.max_percent = Wire.as_int(data.get("maxPercent"), 50)
	taxes.increase_delay_ms = Wire.as_int(data.get("increaseDelayMs"), 24 * MS_PER_HOUR)
	var rows: Array = data.get("rates") if typeof(data.get("rates")) == TYPE_ARRAY else []
	for value: Variant in rows:
		var row := Wire.as_dict(value)
		var rate := Rate.new()
		rate.resource = Wire.as_string(row.get("resource"))
		rate.percent = Wire.as_int(row.get("percent"))
		var pending := Wire.as_dict(row.get("pending"))
		if not pending.is_empty():
			rate.pending_percent = Wire.as_int(pending.get("percent"))
			rate.effective_at = Wire.as_int(pending.get("effectiveAt"))
		if not rate.resource.is_empty():
			taxes.rates[rate.resource] = rate
	return taxes


## The rate that counts now for `resource`.
func percent(resource: String) -> int:
	var rate := rates.get(resource) as Rate
	return rate.percent if rate != null else 0


## The announced increase; null when there is none.
func pending(resource: String) -> Rate:
	var rate := rates.get(resource) as Rate
	return rate if rate != null and rate.has_pending() else null


## The rate each resource is headed for (announced, else current): what an editor starts from.
func targets() -> Dictionary:
	var result: Dictionary = {}
	for key: String in rates.keys():
		var rate: Rate = rates[key]
		result[key] = rate.pending_percent if rate.has_pending() else rate.percent
	return result


## Whether setting `resource` to `value` would be an announced increase (not immediate).
func is_increase(resource: String, value: int) -> bool:
	return value > percent(resource)


## Body of the PUT: the whole table from resource → percent, sorted, zeros left out, each
## clamped to 0..max_percent.
func body(draft: Dictionary) -> Dictionary:
	var keys: Array = draft.keys()
	keys.sort()
	var rows: Array[Dictionary] = []
	for key: Variant in keys:
		var value := clampi(Wire.as_int(draft[key]), 0, max_percent)
		if value > 0:
			rows.append({"resource": str(key), "percent": value})
	return {"rates": rows}


## Whether the draft differs from what the table is headed for.
func differs(draft: Dictionary) -> bool:
	var now := targets()
	for key: Variant in draft.keys():
		if Wire.as_int(draft[key]) != Wire.as_int(now.get(key)):
			return true
	for key: Variant in now.keys():
		if Wire.as_int(now[key]) != Wire.as_int(draft.get(key)):
			return true
	return false
