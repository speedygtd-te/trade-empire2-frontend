class_name AmountFormat
extends RefCounted
## Text for amounts of goods. Amounts arrive in micro-units; players see whole units.


## Whole units with thin-space thousands groups: 1234567 → "1 234 567".
static func units(value: int) -> String:
	var negative := value < 0
	var digits := str(absi(value))
	var groups := PackedStringArray()
	while digits.length() > 3:
		groups.insert(0, digits.substr(digits.length() - 3))
		digits = digits.substr(0, digits.length() - 3)
	groups.insert(0, digits)
	return ("-" if negative else "") + " ".join(groups)


## A rate in micro-units per hour as units per hour with sign: "+74/h", "−0.5/h"; "" at rest.
static func rate(micro_per_hour: int, micro_per_unit: int) -> String:
	if micro_per_hour == 0 or micro_per_unit <= 0:
		return ""
	var per_hour := float(absi(micro_per_hour)) / micro_per_unit
	var sign := "+" if micro_per_hour > 0 else "−"
	var text := units(roundi(per_hour)) if per_hour >= 10.0 else String.num(per_hour, 1)
	return "%s%s/h" % [sign, text]
