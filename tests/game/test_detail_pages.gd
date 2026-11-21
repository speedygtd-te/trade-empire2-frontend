extends GdUnitTestSuite
## Pages of the structure details on a touch screen: a swipe on the Production page reaches its
## ScrollContainer, and the Research and Log lists fill the height the page has.


func test_a_swipe_on_a_production_section_reaches_the_page() -> void:
	var panel: ProductionPanel = auto_free(ProductionPanel.new())
	add_child(panel)
	var rows := panel._section("DETAILS_RESOURCES")
	var button := ListButton.new()
	rows.add_child(button)

	# The row finds the page as its list, and nothing between them stops the drag.
	assert_object(button._scroll).is_same(panel)
	var node := button.get_parent() as Control
	while node != panel:
		assert_int(node.mouse_filter).is_not_equal(Control.MOUSE_FILTER_STOP)
		node = node.get_parent() as Control


func test_the_log_list_fills_a_tall_page() -> void:
	var host: Control = auto_free(Control.new())
	host.size = Vector2(720, 1400)
	add_child(host)
	var panel := LogPanel.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	host.add_child(panel)
	await await_idle_frame()
	await await_idle_frame()

	var scroll := panel.get_child(0) as ScrollContainer
	assert_int(scroll.size_flags_vertical).is_equal(Control.SIZE_EXPAND_FILL)
	# All but the hidden "older" button and empty line: the whole height.
	assert_float(scroll.size.y).is_greater(1300.0)


func test_the_research_list_fills_a_tall_page_and_keeps_its_controls_below() -> void:
	var host: Control = auto_free(Control.new())
	host.size = Vector2(720, 1400)
	add_child(host)
	var panel := ResearchPanel.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	host.add_child(panel)
	await await_idle_frame()
	await await_idle_frame()

	var scroll: ScrollContainer = null
	for child: Node in panel.get_children():
		if child is ScrollContainer:
			scroll = child
	assert_object(scroll).is_not_null()
	assert_float(scroll.size.y).is_greater(float(ResearchPanel.MIN_LIST_HEIGHT) * 3.0)
	# What is shown under the list (plan, rate, status, actions) stays on the page.
	panel._plan.text = "plan"
	panel._plan.visible = true
	panel._factor_row.visible = true
	await await_idle_frame()
	await await_idle_frame()
	for child: Node in panel.get_children():
		var control := child as Control
		if control.visible:
			assert_float(control.get_global_rect().end.y).is_less_equal(1400.0 + 0.5)
	assert_float(panel._factor_row.get_global_rect().position.y).is_greater_equal(scroll.get_global_rect().end.y)
