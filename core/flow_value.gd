class_name FlowValue
extends RefCounted
## A quantity that changes at a constant rate (inventory, inhabitants): `value` at game time
## `at`, changing by `rate_per_hour` per hour. Micro-units.
##
## For display only; the server computes the real amounts.

const MS_PER_HOUR := 3600000

var value: int = 0
var rate_per_hour: int = 0
## Game time (ms) at which `value` holds.
var at: int = 0
## Game time of the next change of rate; -1 in equilibrium.
var next_change: int = -1


static func from_wire(data: Dictionary) -> FlowValue:
	var flow := FlowValue.new()
	flow.value = Wire.as_int(data.get("value"))
	flow.rate_per_hour = Wire.as_int(data.get("ratePerHour"))
	flow.at = Wire.as_int(data.get("at"))
	flow.next_change = Wire.as_int(data.get("nextChange"), -1)
	return flow


## The amount at game time `now_ms`, rounded down, never below zero. Hours and the rest of an
## hour are multiplied separately, so long times at high rates do not overflow.
func amount_at(now_ms: int) -> int:
	var elapsed := maxi(now_ms - at, 0)
	@warning_ignore("integer_division")
	var hours := elapsed / MS_PER_HOUR
	var rest := elapsed % MS_PER_HOUR
	@warning_ignore("integer_division")
	var change := rate_per_hour * hours + rate_per_hour * rest / MS_PER_HOUR
	return maxi(value + change, 0)
