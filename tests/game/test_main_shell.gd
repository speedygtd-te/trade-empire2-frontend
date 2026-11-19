extends GdUnitTestSuite
## MainShell: tabs with their own stacks, Back (layers, then Base, then the colony), a second
## tap on the active tab, the colony drawing only while it is seen, the navigation giving way to
## a structure's own, and a structure switch that replaces only Base.


## A colony screen without world or server: records what the shell asks of it.
class FakeColony:
	extends ColonyScreen
	var rendering := true
	var recentred := 0
	var backs_left := 0
	var mode := false
	var shown: Array[int] = []

	func _ready() -> void:
		pass

	func _process(_delta: float) -> void:
		pass

	func set_rendering(on: bool) -> void:
		rendering = on

	func recentre() -> void:
		recentred += 1

	func handle_back() -> bool:
		if backs_left > 0:
			backs_left -= 1
			return true
		return false

	func in_structure_mode() -> bool:
		return mode

	func set_mode(on: bool) -> void:
		mode = on
		structure_mode_changed.emit(on)

	func current_structure() -> int:
		return start_structure

	func system_id() -> String:
		return "sys-a"

	func detail_tier() -> int:
		return -1

	func show_structure(structure_id: int) -> void:
		shown.append(structure_id)


class Layer:
	extends Control
	signal closed
	var cover := false

	func handle_back() -> bool:
		return false

	func covers_nav() -> bool:
		return cover


class TestShell:
	extends MainShell
	var colonies: Array[FakeColony] = []

	func _make_models() -> void:
		pass

	func _make_colony(structure_id: int) -> ColonyScreen:
		var colony := FakeColony.new()
		colony.start_structure = structure_id
		colonies.append(colony)
		return colony

	func _make_root(_tab: MainShell.Tab) -> Control:
		return Layer.new()

	func _wanted_system() -> String:
		return "sys-a"


func _shell() -> TestShell:
	var shell: TestShell = auto_free(TestShell.new())
	add_child(shell)
	return shell


func _colony(shell: TestShell) -> FakeColony:
	return shell.colony() as FakeColony


func test_it_starts_on_base_with_the_colony_drawing() -> void:
	var shell := _shell()

	assert_int(shell.active_tab()).is_equal(MainShell.Tab.BASE)
	assert_int(shell.nav().selected()).is_equal(MainShell.Tab.BASE)
	assert_object(shell.stack(MainShell.Tab.BASE).root()).is_same(shell.colony())
	assert_bool(_colony(shell).rendering).is_true()
	assert_bool(shell.nav_visible()).is_true()


func test_another_tab_pauses_the_colony_and_back_returns_to_base() -> void:
	var shell := _shell()

	shell.show_tab(MainShell.Tab.MAP)
	assert_bool(shell.stack(MainShell.Tab.BASE).visible).is_false()
	assert_bool(shell.stack(MainShell.Tab.MAP).visible).is_true()
	assert_object(shell.stack(MainShell.Tab.MAP).root()).is_not_null()
	assert_bool(_colony(shell).rendering).is_false()

	assert_bool(shell.handle_back()).is_true()
	assert_int(shell.active_tab()).is_equal(MainShell.Tab.BASE)
	assert_bool(_colony(shell).rendering).is_true()


func test_back_closes_layers_first_then_asks_the_colony_and_never_leaves() -> void:
	var shell := _shell()
	var base := shell.stack(MainShell.Tab.BASE)
	base.push(Layer.new())
	assert_bool(_colony(shell).rendering).is_false()
	_colony(shell).backs_left = 1

	assert_bool(shell.handle_back()).is_true()
	assert_int(base.depth()).is_equal(0)
	assert_bool(_colony(shell).rendering).is_true()
	assert_bool(shell.handle_back()).is_true()
	assert_int(_colony(shell).backs_left).is_equal(0)
	# Nothing left: Back reports it, the shell stays on Base.
	assert_bool(shell.handle_back()).is_false()
	assert_int(shell.active_tab()).is_equal(MainShell.Tab.BASE)


func test_a_second_tap_on_the_active_tab_returns_to_its_root() -> void:
	var shell := _shell()
	shell.show_tab(MainShell.Tab.FLEET)
	var fleet := shell.stack(MainShell.Tab.FLEET)
	fleet.push(Layer.new())
	fleet.push(Layer.new())

	shell.nav().entry(MainShell.Tab.FLEET).pressed.emit()
	assert_int(fleet.depth()).is_equal(0)
	assert_int(shell.active_tab()).is_equal(MainShell.Tab.FLEET)

	shell.nav().entry(MainShell.Tab.BASE).pressed.emit()
	assert_int(shell.active_tab()).is_equal(MainShell.Tab.BASE)
	assert_int(_colony(shell).recentred).is_equal(0)
	shell.nav().entry(MainShell.Tab.BASE).pressed.emit()
	assert_int(_colony(shell).recentred).is_equal(1)


func test_tabs_keep_their_layers_while_another_tab_is_shown() -> void:
	var shell := _shell()
	shell.show_tab(MainShell.Tab.PROFILE)
	var layer := Layer.new()
	shell.stack(MainShell.Tab.PROFILE).push(layer)

	shell.show_tab(MainShell.Tab.MAP)
	shell.show_tab(MainShell.Tab.PROFILE)

	assert_object(shell.stack(MainShell.Tab.PROFILE).top()).is_same(layer)


func test_the_navigation_gives_way_inside_a_structure_and_under_full_screens() -> void:
	var shell := _shell()

	_colony(shell).set_mode(true)
	assert_bool(shell.nav_visible()).is_false()
	_colony(shell).set_mode(false)
	assert_bool(shell.nav_visible()).is_true()

	var details := Layer.new()
	details.cover = true
	shell.stack(MainShell.Tab.BASE).push(details)
	assert_bool(shell.nav_visible()).is_false()
	shell.handle_back()
	assert_bool(shell.nav_visible()).is_true()


func test_a_switch_replaces_only_base_and_ignores_old_screens() -> void:
	var shell := _shell()
	shell.show_tab(MainShell.Tab.MAP)
	var map_root := shell.stack(MainShell.Tab.MAP).root()
	var old := _colony(shell)

	old.switch_requested.emit(42)

	var fresh := _colony(shell)
	assert_object(fresh).is_not_same(old)
	assert_int(fresh.start_structure).is_equal(42)
	assert_bool(old.is_queued_for_deletion()).is_true()
	assert_object(shell.stack(MainShell.Tab.MAP).root()).is_same(map_root)
	# A late request of the old screen changes nothing.
	old.switch_requested.emit(7)
	assert_object(_colony(shell)).is_same(fresh)


func test_a_structure_chosen_in_the_fleet_shows_base() -> void:
	var shell := _shell()
	shell.show_tab(MainShell.Tab.FLEET)

	shell.show_structure(9)

	assert_int(shell.active_tab()).is_equal(MainShell.Tab.BASE)
	assert_array(_colony(shell).shown).is_equal([9])
