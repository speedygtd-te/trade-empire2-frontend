class_name TravelInfoPanel
extends VBoxContainer
## The trip of a structure without ground (in orbit or under way), for the colony screen's
## "Trip" tab: where it is or where it is heading, the phase, how far it is, when it arrives and
## the fuel burned so far. Resting in orbit with a space drive it offers to travel on.

## The player wants to travel on from here.
signal travel_requested

## Whether the panel offers "Travel" itself (off where the screen has its own button).
var offer_travel := true

var _fleet: FleetModel
var _structure_id := 0
var _place: Label
var _phase: Label
var _bar: ProgressBar
var _times: Label
var _fuel: Label
var _travel: Button


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	_place = Ui.dynamic_label()
	add_child(_place)
	_phase = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_phase)
	_bar = Ui.progress_bar()
	add_child(_bar)
	_times = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_times)
	_fuel = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_fuel)
	_travel = Ui.primary_button("TRAVEL_OPEN")
	_travel.pressed.connect(func() -> void: travel_requested.emit())
	add_child(_travel)


func setup(fleet: FleetModel, structure_id: int) -> void:
	_fleet = fleet
	_structure_id = structure_id
	tick()


## Updates the texts (once a second while shown).
func tick() -> void:
	if _place == null or _fleet == null:
		return
	var entry := _fleet.fleet.find(_structure_id)
	if entry == null:
		_place.text = tr("FLEET_LOADING")
		for node: Control in [_phase, _bar, _times, _fuel, _travel]:
			node.visible = false
		return
	var now := Services.clock.now_ms()
	_place.text = FleetPanel.status_text(_fleet, entry, now, self)
	var motion := entry.motion
	var moving := motion != null and entry.is_moving(now)
	_phase.visible = moving
	_bar.visible = moving
	_times.visible = moving
	_fuel.visible = moving and not motion.fuel.is_empty()
	_travel.visible = offer_travel and not moving and entry.can_fly() and entry.where() == Fleet.Where.ORBIT 		and _fleet.group_of(_structure_id) == null
	if not moving:
		return
	_phase.text = phase_text(motion, now, self)
	_bar.value = motion.progress_at(now)
	_times.text = tr("TRAVEL_INFO_ARRIVAL").format({"duration": TimeFormat.duration(motion.remaining_ms(now)),
		"percent": roundi(motion.progress_at(now) * 100.0)})
	var parts := PackedStringArray()
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	for burn: TravelMotion.Fuel in motion.fuel:
		var shown := Services.definitions.resource_name(burn.resource) if Services.definitions != null else ""
		parts.append(tr("TRAVEL_INFO_FUEL_ROW").format({"resource": shown if not shown.is_empty() else tr("STORE_UNKNOWN_ITEM"),
			"burned": _whole(motion.fuel_burned_at(burn, now), scale), "total": _whole(burn.total, scale)}))
	_fuel.text = tr("TRAVEL_INFO_FUEL").format({"rows": ", ".join(parts)})


## The phase of a trip at `now` in words.
static func phase_text(motion: TravelMotion, now: int, translator: Object) -> String:
	match motion.phase_at(now):
		TravelMotion.Phase.LAUNCHING:
			return translator.tr("TRAVEL_PHASE_NOW_LAUNCHING")
		TravelMotion.Phase.CRUISE:
			return translator.tr("TRAVEL_PHASE_NOW_CRUISE")
		TravelMotion.Phase.LANDING:
			return translator.tr("TRAVEL_PHASE_NOW_DOCKING") if motion.target_type() == "dock" \
				else translator.tr("TRAVEL_PHASE_NOW_LANDING")
		TravelMotion.Phase.DRIVING:
			return translator.tr("TRAVEL_PHASE_NOW_DRIVING")
	return translator.tr("TRAVEL_PHASE_NOW_ARRIVING")


static func _whole(value: int, scale: int) -> String:
	@warning_ignore("integer_division")
	return AmountFormat.units(value / maxi(scale, 1))
