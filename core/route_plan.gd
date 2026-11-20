class_name RoutePlan
extends RefCounted
## Routes (`/v2/routes`): a transporter shuttles between two own structures, stations A and B.
## At each station it unloads everything meant for it and loads by the rules of the direction it
## leaves in. This reads routes and quotes and builds the request bodies; the server decides
## everything (stop sites, kind, whether a trip can start).

## Rules per direction (contract `LoadRuleDirections.maxItems`).
const MAX_RULES := 32
const MAX_NAME := 64
const A := "A"
const B := "B"
## Where a rule loads into, at the transporter: cargo for the other station, or its own supply.
const INTO_CARGO := "transport"
const INTO_SUPPLY := "selfUse"
const KIND_SHIP := "ship"
const KIND_GROUND := "ground"

## What a route is doing, for its status line (the texts live in the UI).
enum Status { HEADING, WAITING, PAUSED, STOPPING, DELETING }
## Why a direction's rules cannot be sent.
enum Problem { NONE, TOO_MANY, TWICE, NO_RESOURCE, NO_AMOUNT }


## One load instruction: `amount` whole units (0 stands for "max"), into cargo or supply.
class Rule:
	extends RefCounted
	var resource := ""
	var amount := 0
	var into := "transport"

	static func make(item: String, into_area: String, units: int = 0) -> Rule:
		var rule := Rule.new()
		rule.resource = item
		rule.into = into_area
		rule.amount = maxi(units, 0)
		return rule

	static func from_wire(data: Dictionary) -> Rule:
		var rule := Rule.new()
		rule.resource = Wire.as_string(data.get("resource"))
		rule.into = Wire.as_string(data.get("into"), "transport")
		rule.amount = 0 if Wire.as_string(data.get("amount")) == "max" else maxi(Wire.as_int(data.get("amount")), 0)
		return rule

	func is_max() -> bool:
		return amount <= 0

	func is_supply() -> bool:
		return into == "selfUse"

	## The wire `LoadRule`: whole units as a real int, or "max".
	func to_wire() -> Dictionary:
		var value: Variant = amount
		if is_max():
			value = "max"
		return {"resource": resource, "amount": value, "into": into}

	func copy() -> Rule:
		return make(resource, into, amount)


## Where one ship of a route sets down at a station (`RouteMemberStop`, draft.35): the absolute
## cell of its local (0, 0).
class MemberStop:
	extends RefCounted
	var structure_id := 0
	var cell := Vector2i.ZERO

	static func from_wire(value: Variant) -> MemberStop:
		var data := Wire.as_dict(value)
		var stop := MemberStop.new()
		stop.structure_id = Wire.as_int(data.get("structureId"))
		stop.cell = Vector2i(Wire.as_int(data.get("x")), Wire.as_int(data.get("y")))
		return stop


## One end of a route: the structure, its body and the reserved stop site (absolute cell of the
## transporter's local (0, 0); none = orbit). `stops` has one site per ship (draft.35: a fleet
## route one per member, a single route at most one); `stop` is the first.
class Station:
	extends RefCounted
	var structure_id := 0
	var body_id := ""
	var has_stop := false
	var stop := Vector2i.ZERO
	var stops: Array[MemberStop] = []

	static func from_wire(data: Dictionary) -> Station:
		var station := Station.new()
		station.structure_id = Wire.as_int(data.get("structureId"))
		station.body_id = Wire.as_string(data.get("bodyId"))
		if typeof(data.get("stop")) == TYPE_DICTIONARY:
			station.has_stop = true
			station.stop = RoutePlan.grid_xy(data.get("stop"))
		station.stops = RoutePlan.member_stops_from_wire(data.get("stops"))
		if not station.has_stop and not station.stops.is_empty():
			station.has_stop = true
			station.stop = station.stops[0].cell
		return station

	## The site of one ship; null when it has none here (orbit, or not its ship).
	func stop_of(ship_id: int) -> MemberStop:
		for value: MemberStop in stops:
			if value.structure_id == ship_id:
				return value
		return null


## What one ship of a fleet route unloaded and loaded at its last stop (`route.arrived.shares`).
class Share:
	extends RefCounted
	var structure_id := 0
	var unloaded: Array[Array] = []
	var loaded: Array[Array] = []


## A route as the server sends it (`Route`).
class Route:
	extends RefCounted
	var route_id := 0
	var name := ""
	## ship or ground.
	var kind := ""
	## A single route's transporter; a fleet route's first member.
	var transporter_id := 0
	## The fleet that runs it (draft.35); 0 for a single route.
	var fleet_id := 0
	var station_a := Station.new()
	var station_b := Station.new()
	var rules_ab: Array[Rule] = []
	var rules_ba: Array[Rule] = []
	var waypoints_ab: Array[Vector2i] = []
	var waypoints_ba: Array[Vector2i] = []
	## travelling, stalled or paused.
	var state := ""
	## The station it heads to or stands at: A or B.
	var station := "A"
	var stopping := false
	var deleting := false
	## Waiting: why (an error code) and when it tries again (game time); 0 when not waiting.
	var stall_reason := ""
	var retry_at := 0
	## Paused by itself: STATION_MOVED or STATION_MOVING; "" when paused by the player.
	var pause_reason := ""
	## Travelling: when the running trip arrives (game time); 0 when unknown.
	var next_arrival_at := 0
	## Cargo on board per destination station: [resource, micro-units] pairs.
	var cargo_for_a: Array[Array] = []
	var cargo_for_b: Array[Array] = []
	var cycles := 0
	var trips := 0
	## Delivered so far: [resource, micro-units] pairs.
	var delivered: Array[Array] = []
	var created_at := 0
	## A fleet route: what each ship moved at the last stop and where (from `route.arrived`; empty
	## until one arrived while the app ran).
	var last_shares: Array[Share] = []
	var last_shares_station := 0

	static func from_wire(data: Dictionary) -> Route:
		var route := Route.new()
		route.route_id = Wire.as_int(data.get("routeId"))
		route.name = Wire.as_string(data.get("name"))
		route.kind = Wire.as_string(data.get("kind"))
		route.transporter_id = Wire.as_int(data.get("transporterId"))
		route.fleet_id = Wire.as_int(data.get("fleetId"))
		route.station_a = Station.from_wire(Wire.as_dict(data.get("stationA")))
		route.station_b = Station.from_wire(Wire.as_dict(data.get("stationB")))
		var rules := Wire.as_dict(data.get("rules"))
		route.rules_ab = RoutePlan.rules_from_wire(rules.get("aToB"))
		route.rules_ba = RoutePlan.rules_from_wire(rules.get("bToA"))
		var waypoints := Wire.as_dict(data.get("waypoints"))
		route.waypoints_ab = RoutePlan.points_from_wire(waypoints.get("aToB"))
		route.waypoints_ba = RoutePlan.points_from_wire(waypoints.get("bToA"))
		route.state = Wire.as_string(data.get("state"))
		route.station = Wire.as_string(data.get("station"), "A")
		route.stopping = data.get("stopping") == true
		route.deleting = data.get("deleting") == true
		route.stall_reason = Wire.as_string(data.get("stallReason"))
		route.retry_at = Wire.as_int(data.get("retryAt"))
		route.pause_reason = Wire.as_string(data.get("pauseReason"))
		route.next_arrival_at = Wire.as_int(data.get("nextArrivalAt"))
		var cargo := Wire.as_dict(data.get("cargo"))
		route.cargo_for_a = RoutePlan.amounts_from_wire(cargo.get("forA"))
		route.cargo_for_b = RoutePlan.amounts_from_wire(cargo.get("forB"))
		var stats := Wire.as_dict(data.get("stats"))
		route.cycles = Wire.as_int(stats.get("cycles"))
		route.trips = Wire.as_int(stats.get("trips"))
		route.delivered = RoutePlan.amounts_from_wire(stats.get("delivered"))
		route.created_at = Wire.as_int(data.get("createdAt"))
		return route

	## What the route does now; a requested delete or pause wins over the running trip.
	func status() -> RoutePlan.Status:
		if deleting:
			return RoutePlan.Status.DELETING
		if stopping:
			return RoutePlan.Status.STOPPING
		match state:
			"paused":
				return RoutePlan.Status.PAUSED
			"stalled":
				return RoutePlan.Status.WAITING
		return RoutePlan.Status.HEADING

	func is_paused() -> bool:
		return state == "paused"

	## Whether a fleet runs it (draft.35).
	func is_fleet() -> bool:
		return fleet_id != 0

	## Takes the per-ship shares of a `route.arrived`.
	func take_shares(station_id: int, value: Variant) -> void:
		last_shares.clear()
		last_shares_station = station_id
		if typeof(value) != TYPE_ARRAY:
			return
		var rows: Array = value
		for row: Variant in rows:
			var data := Wire.as_dict(row)
			var share := Share.new()
			share.structure_id = Wire.as_int(data.get("structureId"))
			share.unloaded = RoutePlan.amounts_from_wire(data.get("unloaded"))
			share.loaded = RoutePlan.amounts_from_wire(data.get("loaded"))
			if share.structure_id != 0:
				last_shares.append(share)

	## The structure of station A or B.
	func station_id(letter: String) -> int:
		return station_b.structure_id if letter == "B" else station_a.structure_id

	## The structure it heads to or stands at.
	func current_station_id() -> int:
		return station_id(station)

	## A or B for a structure of this route; "" when it is no station of it.
	func letter_of(structure_id: int) -> String:
		if structure_id != 0 and structure_id == station_a.structure_id:
			return "A"
		if structure_id != 0 and structure_id == station_b.structure_id:
			return "B"
		return ""

	## Whether a structure drives this route or is one of its stations.
	func involves(structure_id: int) -> bool:
		return structure_id == transporter_id or not letter_of(structure_id).is_empty()

	func cargo_for(letter: String) -> Array[Array]:
		return cargo_for_b if letter == "B" else cargo_for_a

	func rules_from(letter: String) -> Array[Rule]:
		return rules_ba if letter == "B" else rules_ab

	## Milliseconds until the running trip arrives (travelling) or the next try (waiting); 0 when
	## there is nothing to wait for or it is due.
	func time_left(now: int) -> int:
		match status():
			RoutePlan.Status.WAITING:
				return maxi(retry_at - now, 0) if retry_at > 0 else 0
			RoutePlan.Status.PAUSED:
				return 0
		return maxi(next_arrival_at - now, 0) if next_arrival_at > 0 else 0


## What a new route needs: a transporter or a fleet (draft.35), two stations, start, rules. The
## kind and the stop sites are left to the server (it picks the nearest fitting site; for a fleet
## one per ship).
class Draft:
	extends RefCounted
	var name := ""
	var transporter_id := 0
	## A fleet route: the fleet and its members (no member can be a station).
	var fleet_id := 0
	var fleet_members := PackedInt64Array()
	var station_a := 0
	var station_b := 0
	## "" (the nearer station), "A" or "B".
	var start_at := ""
	var rules_ab: Array[Rule] = []
	var rules_ba: Array[Rule] = []

	## A transporter or a fleet (not both) and two different stations, none of them the
	## transporter or a member.
	func is_complete() -> bool:
		if (transporter_id != 0) == (fleet_id != 0):
			return false
		return station_a != 0 and station_b != 0 and station_a != station_b \
			and not runs(station_a) and not runs(station_b)

	## Whether a structure would drive the route (the transporter or a fleet member).
	func runs(structure_id: int) -> bool:
		if structure_id == 0:
			return false
		return structure_id == transporter_id or (fleet_id != 0 and fleet_members.has(structure_id))

	## Drive with one structure (a fleet is dropped).
	func use_transporter(structure_id: int) -> void:
		transporter_id = structure_id
		fleet_id = 0
		fleet_members = PackedInt64Array()

	## Drive with a fleet (a transporter is dropped).
	func use_fleet(id: int, members: PackedInt64Array) -> void:
		fleet_id = id
		fleet_members = members
		transporter_id = 0

	func is_fleet() -> bool:
		return fleet_id != 0

	func rules_from(letter: String) -> Array[Rule]:
		return rules_ba if letter == "B" else rules_ab

	## The station a direction loads at.
	func station_id(letter: String) -> int:
		return station_b if letter == "B" else station_a

	## The body of `POST /v2/routes` and `/v2/routes/quote`.
	func create_body() -> Dictionary:
		var body := {
			"stationA": {"structureId": station_a},
			"stationB": {"structureId": station_b},
			"rules": RoutePlan.rules_body(rules_ab, rules_ba),
		}
		if fleet_id != 0:
			body["fleetId"] = fleet_id
		else:
			body["transporterId"] = transporter_id
		var shown := RoutePlan.clean_name(name)
		if not shown.is_empty():
			body["name"] = shown
		if start_at == "A" or start_at == "B":
			body["startAt"] = start_at
		return body


## The answer of `POST /v2/routes/quote`.
class Quote:
	extends RefCounted
	var ok := false
	## Codes of every broken rule.
	var errors := PackedStringArray()
	var kind := ""
	var has_stop_a := false
	var stop_a := Vector2i.ZERO
	var has_stop_b := false
	var stop_b := Vector2i.ZERO
	var start_at := ""
	## The first trip (to the start station): whether there is one, how long it takes (ms).
	var has_trip := false
	var trip_ms := 0
	## Fuel of the first trip: [resource, needed µ, in the transporter's supply µ, in its cargo µ]
	## (a fleet: Σ need, Σ own supply of the members, 0).
	var fuel: Array[Array] = []
	## A fleet route (draft.35): the site of each ship per station, each ship's broken rules
	## (structure id → codes; only ships with some), and the first trip as a fleet quote.
	var crew_stops_a: Array[MemberStop] = []
	var crew_stops_b: Array[MemberStop] = []
	var member_errors: Dictionary = {}
	var fleet_trip: FleetGroups.Quote = null

	static func from_wire(data: Dictionary) -> Quote:
		var quote := Quote.new()
		quote.ok = data.get("ok") == true
		if typeof(data.get("errors")) == TYPE_ARRAY:
			var codes: Array = data.get("errors")
			for code: Variant in codes:
				quote.errors.append(Wire.as_string(code))
		quote.kind = Wire.as_string(data.get("kind"))
		var stops := Wire.as_dict(data.get("stops"))
		if typeof(stops.get("a")) == TYPE_DICTIONARY:
			quote.has_stop_a = true
			quote.stop_a = RoutePlan.grid_xy(stops.get("a"))
		if typeof(stops.get("b")) == TYPE_DICTIONARY:
			quote.has_stop_b = true
			quote.stop_b = RoutePlan.grid_xy(stops.get("b"))
		quote.start_at = Wire.as_string(data.get("startAt"))
		if typeof(data.get("firstTrip")) == TYPE_DICTIONARY:
			var trip := Wire.as_dict(data.get("firstTrip"))
			quote.has_trip = true
			quote.trip_ms = maxi(Wire.as_int(trip.get("arrivalAt")) - Wire.as_int(trip.get("departAt")), 0)
			if typeof(trip.get("fuel")) == TYPE_ARRAY:
				var rows: Array = trip.get("fuel")
				for value: Variant in rows:
					var row := Wire.as_dict(value)
					quote.fuel.append([Wire.as_string(row.get("resource")), Wire.as_int(row.get("amount")),
						Wire.as_int(row.get("selfUse")), Wire.as_int(row.get("inTransport"))])
		var crew := Wire.as_dict(data.get("crewStops"))
		quote.crew_stops_a = RoutePlan.member_stops_from_wire(crew.get("a"))
		quote.crew_stops_b = RoutePlan.member_stops_from_wire(crew.get("b"))
		if typeof(data.get("members")) == TYPE_ARRAY:
			var members: Array = data.get("members")
			for value: Variant in members:
				var member := Wire.as_dict(value)
				var codes := PackedStringArray()
				if typeof(member.get("errors")) == TYPE_ARRAY:
					var listed: Array = member.get("errors")
					for code: Variant in listed:
						codes.append(Wire.as_string(code))
				if not codes.is_empty():
					quote.member_errors[Wire.as_int(member.get("structureId"))] = codes
		if typeof(data.get("fleetTrip")) == TYPE_DICTIONARY:
			quote.fleet_trip = FleetGroups.Quote.from_wire(data.get("fleetTrip"))
			if quote.fleet_trip != null:
				quote.has_trip = true
				quote.trip_ms = quote.fleet_trip.trip.total_ms()
				for row: TravelPlan.FuelRow in quote.fleet_trip.trip.fuel:
					quote.fuel.append([row.resource, row.amount, row.self_use, 0])
		return quote

	## The sites of a fleet's ships at a station (empty for a single route or the orbit).
	func crew_stops(letter: String) -> Array[MemberStop]:
		return crew_stops_b if letter == "B" else crew_stops_a

	## The fuel kinds of the first trip, in order.
	func fuel_types() -> PackedStringArray:
		var result := PackedStringArray()
		for row: Array in fuel:
			var key: String = row[0]
			if not key.is_empty() and not result.has(key):
				result.append(key)
		return result


## `RouteMemberStop` rows; rows without a structure are left out.
static func member_stops_from_wire(value: Variant) -> Array[MemberStop]:
	var result: Array[MemberStop] = []
	if typeof(value) != TYPE_ARRAY:
		return result
	var rows: Array = value
	for row: Variant in rows:
		var stop := MemberStop.from_wire(row)
		if stop.structure_id != 0:
			result.append(stop)
	return result


## Rules from a wire list; rows without a resource are left out.
static func rules_from_wire(value: Variant) -> Array[Rule]:
	var result: Array[Rule] = []
	if typeof(value) != TYPE_ARRAY:
		return result
	var rows: Array = value
	for row: Variant in rows:
		var rule := Rule.from_wire(Wire.as_dict(row))
		if not rule.resource.is_empty():
			result.append(rule)
	return result


## `LoadRuleDirections` with both directions — PATCH replaces both, so both always go.
static func rules_body(a_to_b: Array[Rule], b_to_a: Array[Rule]) -> Dictionary:
	return {"aToB": _rules_to_wire(a_to_b), "bToA": _rules_to_wire(b_to_a)}


## `PATCH /v2/routes/{id}` for new rules (and a new name when one is given).
static func patch_rules(a_to_b: Array[Rule], b_to_a: Array[Rule], new_name: String = "") -> Dictionary:
	var body := {"rules": rules_body(a_to_b, b_to_a)}
	var shown := clean_name(new_name)
	if not shown.is_empty():
		body["name"] = shown
	return body


## `PATCH /v2/routes/{id}` to pause or resume.
static func patch_paused(paused: bool) -> Dictionary:
	return {"paused": paused}


## A name the server accepts (trimmed, at most 64 characters); "" for none.
static func clean_name(value: String) -> String:
	return value.strip_edges().left(MAX_NAME)


## Why a direction's rules cannot be sent: too many, an item twice for the same area, a row
## without resource or with a negative amount; NONE when they can.
static func problem(rules: Array[Rule]) -> Problem:
	if rules.size() > MAX_RULES:
		return Problem.TOO_MANY
	var seen: Dictionary = {}
	for rule: Rule in rules:
		if rule.resource.is_empty():
			return Problem.NO_RESOURCE
		if rule.amount < 0:
			return Problem.NO_AMOUNT
		var key := rule.resource + "|" + rule.into
		if seen.has(key):
			return Problem.TWICE
		seen[key] = true
	return Problem.NONE


## Whether one more rule for `resource` into `into` may join a direction.
static func can_add(rules: Array[Rule], resource: String, into: String) -> bool:
	if resource.is_empty() or rules.size() >= MAX_RULES:
		return false
	return find_rule(rules, resource, into) < 0


## Index of the rule for `resource` into `into`; -1 when there is none.
static func find_rule(rules: Array[Rule], resource: String, into: String) -> int:
	for index: int in rules.size():
		if rules[index].resource == resource and rules[index].into == into:
			return index
	return -1


## "Keep fuel topped up": a supply rule filling each fuel kind to the maximum; an existing
## supply rule of that kind becomes "max". Returns whether the rules changed.
static func top_up_fuel(rules: Array[Rule], fuel_types: PackedStringArray) -> bool:
	var changed := false
	for fuel: String in fuel_types:
		var at := find_rule(rules, fuel, INTO_SUPPLY)
		if at >= 0:
			if not rules[at].is_max():
				rules[at].amount = 0
				changed = true
		elif rules.size() < MAX_RULES:
			rules.append(Rule.make(fuel, INTO_SUPPLY, 0))
			changed = true
	return changed


## Copies of rules, for editing without touching the originals.
static func copy_rules(rules: Array[Rule]) -> Array[Rule]:
	var result: Array[Rule] = []
	for rule: Rule in rules:
		result.append(rule.copy())
	return result


## Whether two rule lists say the same (order matters: rules run in order).
static func same_rules(left: Array[Rule], right: Array[Rule]) -> bool:
	if left.size() != right.size():
		return false
	for index: int in left.size():
		var one := left[index]
		var other := right[index]
		if one.resource != other.resource or one.into != other.into or one.amount != other.amount:
			return false
	return true


## [resource, micro-units] pairs from `ItemAmount` rows; empty rows are left out.
static func amounts_from_wire(value: Variant) -> Array[Array]:
	var result: Array[Array] = []
	if typeof(value) != TYPE_ARRAY:
		return result
	var rows: Array = value
	for row: Variant in rows:
		var item := Wire.as_dict(row)
		var key := Wire.as_string(item.get("resource"))
		var amount := Wire.as_int(item.get("amount"))
		if not key.is_empty() and amount != 0:
			result.append([key, amount])
	return result


## Grid points from a `GridXY` list.
static func points_from_wire(value: Variant) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	if typeof(value) != TYPE_ARRAY:
		return result
	var rows: Array = value
	for row: Variant in rows:
		result.append(grid_xy(row))
	return result


static func grid_xy(value: Variant) -> Vector2i:
	var point := Wire.as_dict(value)
	return Vector2i(Wire.as_int(point.get("x")), Wire.as_int(point.get("y")))


static func _rules_to_wire(rules: Array[Rule]) -> Array:
	var result: Array = []
	for rule: Rule in rules:
		result.append(rule.to_wire())
	return result
