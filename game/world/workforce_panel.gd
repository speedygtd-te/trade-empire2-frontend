class_name WorkforcePanel
extends VBoxContainer
## Staffing of one module type: how many workers its modules need, and per tier how many people
## and robots work there. A switch chooses whether the steppers count people or robots; "Fill"
## staffs up to the need, Apply sends it. The panel previews what the server would refuse
## (Workforce.check); the server decides.

## The player wants this assignment (five counts each, tiers 1–5).
signal applied(module_type: String, humans: Array[int], robots: Array[int], auto: Array[bool])
signal closed

const STEP_WIDTH := 88.0
const COUNT_WIDTH := 64.0
## Holding + or − (Rudi 2026-11-20): after HOLD_DELAY seconds it steps by HOLD_STEP every
## HOLD_EVERY seconds, until 0 or the tier's most (Workforce.max_for).
const HOLD_DELAY := 1.0
const HOLD_EVERY := 0.1
const HOLD_STEP := 10
## Height of the scrolling list of tiers (about three rows).
const ROWS_HEIGHT := 300

var _group: Workforce.Group
var _workforce: Workforce
var _store: Array[int] = [0, 0, 0, 0, 0]
var _humans: Array[int] = [0, 0, 0, 0, 0]
var _robots: Array[int] = [0, 0, 0, 0, 0]
## Whether the steppers count people (true) or robots.
var _people := true
var _busy := false
## Why the staffing may not be changed here (an enterprise structure without MANAGE_TREASURY,
## draft.38); "" when it may.
var _blocked := ""
## Tier → the label with its count (a step updates it without rebuilding the rows, so a held
## button stays).
var _count_labels: Dictionary = {}
## The stepper being held: its button, tier and direction; time to the next repeat; whether it
## repeated (then the release is no tap).
var _hold_button: ListButton = null
var _hold_tier := 0
var _hold_delta := 0
var _hold_left := 0.0
var _hold_repeated := false

var _title: Label
var _need: Label
var _people_tab: Button
var _robots_tab: Button
var _rows: VBoxContainer
var _verdict: Label
var _apply: Button


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	_title = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	add_child(_title)
	_need = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_need)
	var tabs := HBoxContainer.new()
	add_child(tabs)
	var group := ButtonGroup.new()
	_people_tab = Ui.tab_button("WORKFORCE_PEOPLE", group)
	_people_tab.pressed.connect(_switch.bind(true))
	tabs.add_child(_people_tab)
	_robots_tab = Ui.tab_button("WORKFORCE_ROBOTS", group)
	_robots_tab.pressed.connect(_switch.bind(false))
	tabs.add_child(_robots_tab)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(0, ROWS_HEIGHT)
	add_child(scroll)
	_rows = Ui.column(8)
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_rows)
	var quick := HBoxContainer.new()
	quick.add_theme_constant_override("separation", 12)
	add_child(quick)
	for entry: Array in [["WORKFORCE_FILL_PEOPLE", true, false], ["WORKFORCE_FILL_ROBOTS", false, true],
			["WORKFORCE_CLEAR", false, false]]:
		var key: String = entry[0]
		var people: bool = entry[1]
		var robots: bool = entry[2]
		var button := Ui.secondary_button(key)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(_on_fill.bind(people, robots))
		quick.add_child(button)
	_verdict = Ui.dynamic_label()
	add_child(_verdict)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 16)
	add_child(actions)
	var back := Ui.secondary_button("COMMON_CLOSE")
	back.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	back.pressed.connect(func() -> void: closed.emit())
	actions.add_child(back)
	_apply = Ui.primary_button("WORKFORCE_APPLY")
	_apply.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply.pressed.connect(_on_apply)
	actions.add_child(_apply)


## Shows a module type's staffing; `robots_in_store` are whole robots per tier in the store.
func show_group(group: Workforce.Group, workforce: Workforce, robots_in_store: Array[int], module_name: String) -> void:
	_group = group
	_workforce = workforce
	_store = robots_in_store
	_humans = group.humans.duplicate()
	_robots = group.robots.duplicate()
	_busy = false
	# Start where the workers are: people when the structure has inhabitants, otherwise robots.
	_people = workforce.total_population() > 0
	_title.text = tr("WORKFORCE_TITLE").format({"module": module_name})
	_rebuild()


## Says why the staffing may not be changed ("" lifts it): the line shows it, Apply waits.
func set_blocked(text: String) -> void:
	_blocked = text
	if _group != null:
		_refresh()


## While the assignment is being sent the buttons wait.
func set_busy(busy: bool) -> void:
	_busy = busy
	_refresh()


## The server refused: show why.
func show_error(text: String) -> void:
	_verdict.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	_verdict.text = text


func _switch(people: bool) -> void:
	_people = people
	_rebuild()


func _rebuild() -> void:
	_people_tab.set_pressed_no_signal(_people)
	_robots_tab.set_pressed_no_signal(not _people)
	for child: Node in _rows.get_children():
		child.queue_free()
	_count_labels.clear()
	_hold_button = null
	for tier: int in range(_group.base_tier, Workforce.TIERS + 1):
		# Only tiers that could staff anything (or already do); the base tier always shows.
		var people := _workforce.free_humans(tier, _group.module_type)
		var robots := _store[tier - 1] + _group.robots[tier - 1]
		var working := _humans[tier - 1] + _robots[tier - 1]
		if tier != _group.base_tier and people == 0 and robots == 0 and working == 0:
			continue
		_rows.add_child(_tier_row(tier))
	_refresh()


## One tier: its name with what is at hand and what the other kind already counts, then a
## stepper for the kind being edited.
func _tier_row(tier: int) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	var names := Ui.column(0)
	names.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	names.alignment = BoxContainer.ALIGNMENT_CENTER
	var title := Ui.dynamic_label()
	title.text = tr("WORKFORCE_TIER").format({"tier": tier})
	names.add_child(title)
	var at_hand := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	if _people:
		at_hand.text = tr("WORKFORCE_PEOPLE_AT_HAND").format({
			"free": _workforce.free_humans(tier, _group.module_type), "robots": _robots[tier - 1]})
	else:
		at_hand.text = tr("WORKFORCE_ROBOTS_AT_HAND").format({
			"store": _store[tier - 1] + _group.robots[tier - 1], "people": _humans[tier - 1]})
	names.add_child(at_hand)
	row.add_child(names)
	# A swipe that starts on a stepper scrolls the list (ListButton).
	row.add_child(_stepper("−", tier, -1))
	var count := Ui.dynamic_label()
	count.custom_minimum_size = Vector2(COUNT_WIDTH, 0)
	count.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	count.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	count.text = str(_count(tier))
	_count_labels[tier] = count
	row.add_child(count)
	row.add_child(_stepper("+", tier, 1))
	return row


## A − or + button: a tap steps by one, holding it steps by HOLD_STEP (see _process).
func _stepper(text: String, tier: int, delta: int) -> ListButton:
	var button := ListButton.new()
	button.text = text
	button.custom_minimum_size = Vector2(STEP_WIDTH, AppTheme.TOUCH_MIN)
	button.button_down.connect(_on_hold_start.bind(button, tier, delta))
	button.button_up.connect(_on_hold_end)
	button.tapped.connect(_on_tap.bind(tier, delta))
	return button


func _count(tier: int) -> int:
	return _humans[tier - 1] if _people else _robots[tier - 1]


## Sets the edited kind's count of a tier (never below 0) and shows it without a rebuild.
func _set_count(tier: int, value: int) -> void:
	if _people:
		_humans[tier - 1] = maxi(0, value)
	else:
		_robots[tier - 1] = maxi(0, value)
	var label: Label = _count_labels.get(tier)
	if label != null and is_instance_valid(label):
		label.text = str(_count(tier))
	_refresh()


func _max_for(tier: int) -> int:
	return _workforce.max_for(_group, tier, _people, _humans, _robots, _store)


func _on_tap(tier: int, delta: int) -> void:
	# A release after holding is no tap: the repeats did the work.
	if _hold_repeated:
		return
	_set_count(tier, _count(tier) + delta)


func _on_hold_start(button: ListButton, tier: int, delta: int) -> void:
	_hold_button = button
	_hold_tier = tier
	_hold_delta = delta
	_hold_left = HOLD_DELAY
	_hold_repeated = false


func _on_hold_end() -> void:
	_hold_button = null


func _process(delta: float) -> void:
	if _hold_button == null:
		return
	# A swipe that started on the button scrolls the list: no repeating then.
	if not is_instance_valid(_hold_button) or _hold_button.moved_since_press():
		_hold_button = null
		return
	_hold_left -= delta
	if _hold_left > 0.0:
		return
	_hold_left += HOLD_EVERY
	_hold_repeated = true
	var current := _count(_hold_tier)
	var target := current + _hold_delta * HOLD_STEP
	if _hold_delta > 0:
		# Up to the tier's most, but never below what is already set.
		target = mini(target, maxi(_max_for(_hold_tier), current))
	_set_count(_hold_tier, target)
	if _count(_hold_tier) == current:
		_hold_button = null


func _on_fill(people: bool, robots: bool) -> void:
	if not people and not robots:
		_humans = [0, 0, 0, 0, 0]
		_robots = [0, 0, 0, 0, 0]
	else:
		var plan := _workforce.fill_plan(_group, _store, people, robots)
		_humans = plan[0]
		_robots = plan[1]
		_people = people
	_rebuild()


func _refresh() -> void:
	var assigned := 0
	for index: int in Workforce.TIERS:
		assigned += _humans[index] + _robots[index]
	_need.text = tr("WORKFORCE_NEED").format({"needed": _group.needed(), "tier": _group.base_tier,
		"assigned": assigned, "modules": _group.modules})
	var problem := _workforce.check(_group, _humans, _robots, _store)
	var changed := _humans != _group.humans or _robots != _group.robots
	if not _blocked.is_empty():
		_verdict.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		_verdict.text = _blocked
	elif not problem.is_empty():
		_verdict.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		_verdict.text = tr("ERROR_" + problem)
	elif assigned < _group.needed():
		_verdict.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		_verdict.text = tr("WORKFORCE_UNDERSTAFFED").format({"missing": _group.needed() - assigned})
	else:
		_verdict.add_theme_color_override("font_color", AppTheme.COLOR_OK)
		_verdict.text = tr("WORKFORCE_FULL")
	_apply.disabled = _busy or not problem.is_empty() or not changed or not _blocked.is_empty()


func _on_apply() -> void:
	if _busy:
		return
	applied.emit(_group.module_type, _humans.duplicate(), _robots.duplicate(), _group.auto.duplicate())
