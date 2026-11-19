extends GdUnitTestSuite
## BottomNav and TabStrip: entries in order, the active one marked, taps reported, badges; the
## tab strip chooses by tap only.


func _icon() -> Texture2D:
	return load("res://game/ui/icons/base.svg") as Texture2D


func test_entries_are_added_in_order_and_one_is_marked() -> void:
	var nav: BottomNav = auto_free(BottomNav.new())
	add_child(nav)
	for key: String in MainShell.NAV_KEYS:
		nav.add_entry(key, _icon())

	nav.select(MainShell.Tab.FLEET)

	assert_int(nav.entry_count()).is_equal(4)
	assert_int(nav.selected()).is_equal(MainShell.Tab.FLEET)
	assert_bool(nav.is_marked(MainShell.Tab.FLEET)).is_true()
	assert_bool(nav.is_marked(MainShell.Tab.BASE)).is_false()
	# Touch targets: every entry is at least 88 px high and wide.
	assert_float(nav.entry(0).custom_minimum_size.y).is_greater_equal(AppTheme.TOUCH_MIN)
	assert_float(nav.entry(0).custom_minimum_size.x).is_greater_equal(AppTheme.TOUCH_MIN)


func test_a_tap_reports_the_entry_also_the_active_one() -> void:
	var nav: BottomNav = auto_free(BottomNav.new())
	add_child(nav)
	nav.add_entry("NAV_BASE", _icon())
	nav.add_entry("NAV_MAP", _icon())
	nav.select(0)
	var pressed: Array[int] = []
	nav.tab_pressed.connect(func(index: int) -> void: pressed.append(index))

	nav.entry(1).pressed.emit()
	nav.entry(0).pressed.emit()

	assert_array(pressed).is_equal([1, 0])
	# The nav only reports; the owner moves the mark.
	assert_int(nav.selected()).is_equal(0)


func test_badges_show_and_hide() -> void:
	var nav: BottomNav = auto_free(BottomNav.new())
	add_child(nav)
	nav.add_entry("NAV_BASE", _icon())
	nav.add_entry("NAV_FLEET", _icon())

	nav.set_badge(1, true)
	assert_bool(nav.has_badge(1)).is_true()
	assert_bool(nav.has_badge(0)).is_false()
	nav.set_badge(1, false)
	assert_bool(nav.has_badge(1)).is_false()


func test_the_tab_strip_chooses_by_tap_and_marks_one_tab() -> void:
	var strip: TabStrip = auto_free(TabStrip.new())
	add_child(strip)
	strip.add_tab("STRUCTURE_NAV_INSPECT")
	strip.add_tab("STRUCTURE_NAV_BUILD")
	strip.add_tab("STRUCTURE_NAV_INVENTORY")
	var chosen: Array[int] = []
	strip.tab_selected.connect(func(index: int) -> void: chosen.append(index))

	strip.select(0)
	assert_array(chosen).is_empty()
	var button := strip.tab(2) as ListButton
	button.button_down.emit()
	button.toggled.emit(true)

	assert_array(chosen).is_equal([2])
	assert_int(strip.selected()).is_equal(2)
	assert_bool(strip.tab(2).button_pressed).is_true()
	assert_bool(strip.tab(0).button_pressed).is_false()
