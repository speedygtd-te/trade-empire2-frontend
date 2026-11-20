class_name MainShell
extends Control
## The signed-in app: the tabs Base, Map, Fleet and Profile with the bottom navigation.
##
## Every tab is a ScreenStack: a root and the layers pushed over it. Switching tabs keeps them
## (only the active one is visible). Base is the colony (ColonyScreen); Map the system map of the
## structure on Base (else of home); Fleet the own structures and their routes; Profile the
## player, the enterprise and the account. Map, Fleet and Profile are built the first time they
## are shown.
##
## Back: the active tab's topmost layer first (it closes something inside or is taken off), then —
## on Map, Fleet and Profile — back to Base, and on Base the colony's own steps; never the app.
## Tapping the active tab again returns to its root (Base also centres the structure again).
##
## The colony's 3D view draws only while Base is shown and nothing lies over it. A switch to
## another structure (fleet, places, take-off, landing, "go there") replaces only the Base root.
## The navigation gives way while Base shows a structure from inside (it has its own) or a screen
## that covers everything (StructureDetails). Trips are planned in Fleet (`show_travel`).

enum Tab { BASE, MAP, FLEET, PROFILE }

## Text keys and icons of the navigation, in tab order.
const NAV_KEYS: Array[String] = ["NAV_BASE", "NAV_MAP", "NAV_FLEET", "NAV_PROFILE"]
const NAV_ICONS: Array[String] = [
	"res://game/ui/icons/base.svg", "res://game/ui/icons/map.svg",
	"res://game/ui/icons/fleet.svg", "res://game/ui/icons/profile.svg",
]

## The structure Base shows first; 0 for the home colony. Set before adding.
var start_structure := 0

var _content: Control
var _nav: BottomNav
var _stacks: Array[ScreenStack] = []
var _active: Tab = Tab.BASE
var _colony: ColonyScreen = null
var _fleet: FleetModel = null
var _enterprise: EnterpriseModel = null
## The enterprise the fleet's enterprise structures were loaded for.
var _fleet_enterprise := ""
## The system the Map root was built for.
var _map_system := ""


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_make_models()
	var column := VBoxContainer.new()
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.add_theme_constant_override("separation", 0)
	add_child(column)
	_content = Control.new()
	_content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_content.clip_contents = true
	_content.add_to_group(SafeAreaMargin.ABOVE_NAV_GROUP)
	column.add_child(_content)
	_nav = BottomNav.new()
	column.add_child(_nav)
	for index: int in NAV_KEYS.size():
		_nav.add_entry(NAV_KEYS[index], load(NAV_ICONS[index]) as Texture2D)
		var stack := ScreenStack.new()
		stack.name = "Stack" + NAV_KEYS[index].trim_prefix("NAV_").capitalize()
		stack.visible = false
		stack.changed.connect(_update_rendering)
		_content.add_child(stack)
		_stacks.append(stack)
	_nav.tab_pressed.connect(_on_nav)
	# The performance display (switched in the profile) lies over everything, the nav too.
	var performance := PerfOverlay.new()
	performance.tier_source = func() -> int: return _colony.detail_tier() if _colony != null else -1
	add_child(performance)
	_show_colony(start_structure)
	show_tab(Tab.BASE)


## The models every tab shares: the fleet (Base, Map, Fleet) and the enterprise (Profile).
func _make_models() -> void:
	_fleet = FleetModel.new()
	_fleet.name = "Fleet"
	add_child(_fleet)
	_fleet.changed.connect(_update_badges)
	_enterprise = EnterpriseModel.new()
	_enterprise.name = "Enterprise"
	add_child(_enterprise)
	_enterprise.changed.connect(_update_badges)
	_enterprise.list_changed.connect(_update_badges)
	_enterprise.fleet = _fleet
	_enterprise.structure_requested.connect(show_structure)
	# Joining, leaving or founding changes the enterprise structures Fleet lists.
	_enterprise.changed.connect(_on_enterprise_changed)
	_enterprise.reload()


func _on_enterprise_changed() -> void:
	var id := _enterprise.mine.enterprise_id if _enterprise.mine != null else ""
	if id != _fleet_enterprise:
		_fleet_enterprise = id
		_fleet.reload_enterprise()


## A new colony screen for Base.
func _make_colony(structure_id: int) -> ColonyScreen:
	var colony := ColonyScreen.new()
	colony.start_structure = structure_id
	colony.fleet = _fleet
	return colony


## The root of Map, Fleet or Profile.
func _make_root(tab: Tab) -> Control:
	match tab:
		Tab.MAP:
			var map := MapScreen.new()
			var account := Services.session.account
			map.setup(_map_system, account.home_body_id if account != null else "")
			map.fleet = _fleet
			map.root = true
			return map
		Tab.FLEET:
			var panel := FleetPanel.new()
			panel.setup(_fleet, current_structure())
			panel.chosen.connect(show_structure)
			return panel
		Tab.PROFILE:
			var profile := ProfileScreen.new()
			profile.enterprise = _enterprise
			profile.fleet = _fleet
			return profile
	return Control.new()


# --- tabs -----------------------------------------------------------------------------------

func active_tab() -> Tab:
	return _active


func stack(tab: Tab) -> ScreenStack:
	return _stacks[tab]


func nav() -> BottomNav:
	return _nav


## The colony screen on Base.
func colony() -> ColonyScreen:
	return _colony


## The structure Base shows (the selected or open one); 0 before it has loaded.
func current_structure() -> int:
	return _colony.current_structure() if _colony != null else start_structure


## Shows a tab (its root is built the first time).
func show_tab(tab: Tab) -> void:
	_active = tab
	_ensure_root(tab)
	for index: int in _stacks.size():
		_stacks[index].visible = index == tab
	_nav.select(tab)
	match tab:
		Tab.FLEET:
			var panel := _stacks[tab].root() as FleetPanel
			if panel != null:
				panel.set_current(current_structure())
		Tab.PROFILE:
			var profile := _stacks[tab].root() as ProfileScreen
			if profile != null:
				profile.set_detail_tier(_colony.detail_tier() if _colony != null else -1)
				profile.refresh()
	_update_rendering()


## Android back; true when something was closed or the tab changed, false when there was
## nothing left (the app stays open either way).
func handle_back() -> bool:
	if _stacks[_active].handle_back():
		return true
	if _active != Tab.BASE:
		show_tab(Tab.BASE)
		return true
	return false


## A structure chosen in the fleet: Base shows it (selected there, or a new colony screen).
func show_structure(structure_id: int) -> void:
	show_tab(Tab.BASE)
	if _colony != null:
		_colony.show_structure(structure_id)


func _on_nav(index: int) -> void:
	var tab := index as Tab
	if tab != _active:
		show_tab(tab)
		return
	# The active tab again: back to its root; Base centres the structure as well.
	_stacks[tab].pop_to_root()
	if tab == Tab.BASE and _colony != null:
		_colony.recentre()


## Builds a tab's root when it has none; the Map is rebuilt when Base shows another system now.
func _ensure_root(tab: Tab) -> void:
	if tab == Tab.BASE:
		return
	var tab_stack := _stacks[tab]
	if tab == Tab.MAP:
		var system := _wanted_system()
		if tab_stack.root() != null and system == _map_system:
			return
		_map_system = system
	elif tab_stack.root() != null:
		return
	tab_stack.set_root(_make_root(tab))


## The system of the structure on Base; before it has loaded (or under way) the home system.
func _wanted_system() -> String:
	var system := _colony.system_id() if _colony != null else ""
	if system.is_empty():
		var account := Services.session.account
		system = GalaxySystems.system_of_body(account.home_body_id) if account != null else ""
	return system


# --- Base -----------------------------------------------------------------------------------

func _show_colony(structure_id: int) -> void:
	_colony = _make_colony(structure_id)
	_colony.switch_requested.connect(_on_switch_requested.bind(_colony))
	_colony.structure_mode_changed.connect(func(_on: bool) -> void: _update_nav())
	_colony.travel_requested.connect(show_travel)
	_stacks[Tab.BASE].set_root(_colony)


## The Fleet tab with a structure's details and its trip choice open.
func show_travel(structure_id: int) -> void:
	show_tab(Tab.FLEET)
	var panel := _stacks[Tab.FLEET].root() as FleetPanel
	if panel != null:
		_stacks[Tab.FLEET].pop_to_root()
		panel.open_detail(structure_id, true)


## The navigation gives way while Base shows a structure from inside (its own navigation) or a
## screen that lies over everything (StructureDetails).
func _update_nav() -> void:
	if _nav == null or _stacks.is_empty():
		return
	var covered := false
	if _active == Tab.BASE:
		covered = _colony != null and _colony.in_structure_mode()
		var top := _stacks[Tab.BASE].top()
		if top != null and top.has_method("covers_nav"):
			var answer: Variant = top.call("covers_nav")
			covered = covered or (answer is bool and answer)
	_nav.visible = not covered


## Whether the shell's navigation is shown.
func nav_visible() -> bool:
	return _nav != null and _nav.visible


## The colony asked for another structure: only Base is replaced (Map follows when it is shown
## next). A choice in the fleet has already brought Base to the front.
func _on_switch_requested(structure_id: int, from: ColonyScreen) -> void:
	if from != _colony:
		return
	_show_colony(structure_id)
	var panel := _stacks[Tab.FLEET].root() as FleetPanel
	if panel != null:
		panel.set_current(structure_id)
	_update_rendering()


## The colony draws only while Base is shown and no layer lies over it.
func _update_rendering() -> void:
	_update_nav()
	if _colony == null or _stacks.is_empty():
		return
	_colony.set_rendering(_active == Tab.BASE and _stacks[Tab.BASE].depth() == 0)


## Badges: Fleet while a structure is under way, Profile while an invitation waits.
func _update_badges() -> void:
	if _nav == null:
		return
	var moving := false
	if _fleet != null:
		var now := Services.clock.now_ms()
		for entry: Fleet.Entry in _fleet.fleet.entries():
			if entry.is_moving(now):
				moving = true
				break
	_nav.set_badge(Tab.FLEET, moving)
	_nav.set_badge(Tab.PROFILE, _enterprise != null and _enterprise.mine == null and not _enterprise.invitations.is_empty())
