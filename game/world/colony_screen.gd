class_name ColonyScreen
extends Control
## The signed-in main screen: the colony in 3D with a bottom panel to inspect fields and to
## build hulls and modules from the structure's store.
##
## The surface shows the structure closed (StructureLook): a tap on it selects it and the panel
## shows its details. Edit or Build opens it in place — the shut hulls give way to the modules
## on their floors — and the tabs Inspect, Build, Store, Log and Research appear. Close or Back shuts it.
##
## Guests (vessels docked on the home structure's dock hulls) are structures of their own: a tap
## on one selects it with its own details, Edit or Build opens only it. On the home structure a
## new hull on a dock founds a guest; on an open guest a hull goes next to or on top of it.
## A guest is built from the home structure's store (contract), which the palette shows.
##
## Gestures: drag pans, pinch or mouse wheel zooms, a tap selects a field. Building is two
## taps — choose the field, then confirm — and removing is two-step as well.

enum Mode { VIEW, BUILD, STORE, LOG, RESEARCH }

## Pointer travel (canvas px) below which a press counts as a tap, not a drag.
const TAP_SLOP := 18.0
## How often the panel text is refreshed (construction countdowns).
const REFRESH_SECONDS := 1.0
## Fixed sun (radians) while the body has no orbit data: high in the south-west, so the shadows
## fall towards the camera's upper right.
const FIXED_SUN_ELEVATION := 0.87
const FIXED_SUN_AZIMUTH := 3.67
## Where the detail tier of this device is kept between starts.
const DETAIL_PATH := "user://detail.json"
## How often the sun is moved along its path (seconds); it crawls, so this is plenty.
const SUN_SECONDS := 1.0

## The home structure; its guests hang below it.
var _model: ColonyModel
## The structure selected or open: the home structure or one of its guests.
var _focus: ColonyModel
var _view: ColonyView
var _container: SubViewportContainer
var _viewport: SubViewport

var _title: Label
var _subtitle: Label
var _info: Label
var _status: Label
var _primary: Button
var _secondary: Button
var _palette_scroll: ScrollContainer
var _palette: HBoxContainer
var _view_tab: Button
var _build_tab: Button
var _store_tab: Button
var _store: StorePanel
var _log: LogPanel
var _log_tab: Button
var _research: ResearchPanel
var _research_tab: Button
var _recipes: RecipePanel
var _actions: HBoxContainer
var _loading: Control
var _bottom: PanelContainer
var _menu: Control
var _menu_button: Button
var _tabs: HBoxContainer

## Whether the structure is open for building and editing; closed it shows from outside.
var _opened := false
## Whether the closed structure is selected (its details show in the panel).
var _structure_selected := false
var _mode: Mode = Mode.VIEW
## Absolute cell the player tapped; null when none. Only its column counts: which level is
## meant follows from the open structure and the tool (_target).
var _cell: Variant = null
## What the build tool places: "hull:STARTER" or "module:PUMP"; "" when nothing is chosen.
var _tool := ""
var _rotation := 0
var _busy := false
## The removal that waits for its second tap: "module" or "hull"; "" when none.
var _armed := ""
var _refresh_left := 0.0
var _sun_left := 0.0
var _detail := DetailGovernor.new()

var _touches: Dictionary = {}
var _press_position := Vector2.ZERO
var _press_travel := 0.0
var _mouse_down := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_model = ColonyModel.new()
	_model.name = "ColonyModel"
	add_child(_model)
	_focus = _model
	_build_world()
	_build_overlay()
	_model.layout_changed.connect(_refresh)
	_model.guests_changed.connect(_on_guests_changed)
	_model.inventory_changed.connect(_on_inventory_changed)
	_model.production_changed.connect(_on_production_changed)
	_model.ready_to_show.connect(_on_ready_to_show)
	_model.load_failed.connect(_on_load_failed)
	if Services.definitions == null:
		Services.definitions_loaded.connect(_on_definitions_loaded, CONNECT_ONE_SHOT)
	else:
		_model.load_home()
	_set_mode(Mode.VIEW)


func _process(delta: float) -> void:
	if _model.structure_id != 0:
		_detail.add_frame(delta * 1000.0)
		if _detail.evaluate(Time.get_ticks_msec()):
			_view.apply_detail(_detail.tier)
			_save_detail()
	_sun_left -= delta
	if _sun_left <= 0.0 and _model.structure_id != 0:
		_sun_left = SUN_SECONDS
		_update_sun()
	_refresh_left -= delta
	if _refresh_left <= 0.0:
		_refresh_left = REFRESH_SECONDS
		if not _opened and _structure_selected:
			_refresh()
		elif _mode == Mode.VIEW and _cell != null:
			_refresh()
		elif _mode == Mode.STORE:
			_store.tick()
		elif _mode == Mode.RESEARCH and _opened:
			_research.tick()


## Android back: close the menu or the recipes, clear the selected field, shut the open
## structure, clear the selected structure — never quit.
func handle_back() -> void:
	if _menu != null and _menu.visible:
		_menu.visible = false
	elif _opened and _mode == Mode.RESEARCH and _research.handle_back():
		pass
	elif _recipes.visible:
		_close_recipes()
	elif _opened and _cell != null:
		_select(null)
	elif _opened:
		_close_structure()
	elif _structure_selected:
		_select_structure(false)


# --- building the screen --------------------------------------------------------------------

func _build_world() -> void:
	_container = SubViewportContainer.new()
	_container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_container.stretch = true
	_container.mouse_filter = Control.MOUSE_FILTER_STOP
	_container.gui_input.connect(_on_world_input)
	add_child(_container)
	_viewport = SubViewport.new()
	_viewport.handle_input_locally = false
	_container.add_child(_viewport)
	_view = ColonyView.new()
	_view.setup(_model)
	_viewport.add_child(_view)
	var stored := Wire.parse_object(FileAccess.get_file_as_string(DETAIL_PATH))
	if Wire.as_string(stored.get("version")) == Wire.as_string(ProjectSettings.get_setting("application/config/version", "")):
		_detail.restore(stored)
	_view.apply_detail(_detail.tier)


## Keeps the measured tier for the next start; stamped with the app version, because another
## build can cost differently.
func _save_detail() -> void:
	var state := _detail.to_dict()
	state["version"] = ProjectSettings.get_setting("application/config/version", "")
	var file := FileAccess.open(DETAIL_PATH, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(state))
		file.close()


func _build_overlay() -> void:
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(margin)
	var column := Ui.column(0)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(column)

	# Top: colony name, body, menu.
	var top := PanelContainer.new()
	column.add_child(top)
	var top_row := HBoxContainer.new()
	top_row.add_theme_constant_override("separation", 16)
	top.add_child(top_row)
	var names := Ui.column(4)
	top_row.add_child(names)
	_title = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	_title.autowrap_mode = TextServer.AUTOWRAP_OFF
	_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	names.add_child(_title)
	_subtitle = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_subtitle.autowrap_mode = TextServer.AUTOWRAP_OFF
	_subtitle.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	names.add_child(_subtitle)
	_menu_button = Ui.secondary_button("COLONY_MENU")
	_menu_button.size_flags_horizontal = Control.SIZE_SHRINK_END
	_menu_button.pressed.connect(_on_menu)
	top_row.add_child(_menu_button)

	var filler := Control.new()
	filler.size_flags_vertical = Control.SIZE_EXPAND_FILL
	filler.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(filler)

	# Bottom: tabs, palette, info, actions.
	_bottom = PanelContainer.new()
	column.add_child(_bottom)
	var rows := Ui.column(16)
	_bottom.add_child(rows)
	_tabs = HBoxContainer.new()
	rows.add_child(_tabs)
	var group := ButtonGroup.new()
	_view_tab = Ui.tab_button("COLONY_TAB_VIEW", group)
	_view_tab.pressed.connect(_set_mode.bind(Mode.VIEW))
	_tabs.add_child(_view_tab)
	_build_tab = Ui.tab_button("COLONY_TAB_BUILD", group)
	_build_tab.pressed.connect(_set_mode.bind(Mode.BUILD))
	_tabs.add_child(_build_tab)
	_store_tab = Ui.tab_button("COLONY_TAB_STORE", group)
	_store_tab.pressed.connect(_set_mode.bind(Mode.STORE))
	_tabs.add_child(_store_tab)
	_log_tab = Ui.tab_button("COLONY_TAB_LOG", group)
	_log_tab.pressed.connect(_set_mode.bind(Mode.LOG))
	_tabs.add_child(_log_tab)
	_research_tab = Ui.tab_button("COLONY_TAB_RESEARCH", group)
	_research_tab.pressed.connect(_set_mode.bind(Mode.RESEARCH))
	_tabs.add_child(_research_tab)

	_store = StorePanel.new()
	_store.setup(_model)
	rows.add_child(_store)
	_log = LogPanel.new()
	_log.setup(_model)
	_log.visible = false
	rows.add_child(_log)
	_research = ResearchPanel.new()
	_research.setup(_model)
	_research.visible = false
	rows.add_child(_research)
	_recipes = RecipePanel.new()
	_recipes.visible = false
	_recipes.chosen.connect(_on_recipe_chosen)
	_recipes.closed.connect(_close_recipes)
	rows.add_child(_recipes)

	_palette_scroll = ScrollContainer.new()
	_palette_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_palette_scroll.custom_minimum_size = Vector2(0, AppTheme.TOUCH_MIN + 8)
	rows.add_child(_palette_scroll)
	_palette = HBoxContainer.new()
	_palette.add_theme_constant_override("separation", 12)
	_palette_scroll.add_child(_palette)

	_info = Ui.dynamic_label()
	rows.add_child(_info)
	_status = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	rows.add_child(_status)

	_actions = HBoxContainer.new()
	_actions.add_theme_constant_override("separation", 16)
	rows.add_child(_actions)
	_secondary = Ui.secondary_button("COLONY_CANCEL")
	_secondary.pressed.connect(_on_secondary)
	_actions.add_child(_secondary)
	_primary = Ui.primary_button("COLONY_BUILD_HERE")
	_primary.pressed.connect(_on_primary)
	_actions.add_child(_primary)

	_loading = CenterContainer.new()
	_loading.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var loading_text := Ui.label("COLONY_LOADING", AppTheme.VARIATION_MUTED)
	loading_text.autowrap_mode = TextServer.AUTOWRAP_OFF
	_loading.add_child(loading_text)
	add_child(_loading)


# --- data -----------------------------------------------------------------------------------

func _on_definitions_loaded() -> void:
	_model.load_home()


func _on_ready_to_show() -> void:
	_loading.visible = false
	_title.text = _model.structure_name
	_subtitle.text = _model.body_name
	_view.look_at_cell(_model.centre_cell())
	_update_sun()
	# The bottom panel covers the lower part of the view: shift the colony into the part above.
	await get_tree().process_frame
	_view.pan(Vector2(0.0, -_bottom.size.y * 0.5 * _scale()), Vector2(_viewport.size))
	_refresh()


## Sets the sun over the cell in the middle of the view from the body's orbit and rotation at
## the current game time; without orbit data it stands still. Its light has the colour of this
## star and this air.
func _update_sun() -> void:
	if _model.sun == null:
		_view.set_sun(FIXED_SUN_ELEVATION, FIXED_SUN_AZIMUTH, _model.star_kelvin, _model.atmosphere_density)
		return
	var cell := _view.focus_cell()
	var angles := SunPosition.cell_angles(cell.x, cell.y, _model.size_x)
	var sky := _model.sun.sky_at(angles.x, angles.y, Services.clock.now_ms() / 1000.0)
	_view.set_sun(sky.elevation, sky.azimuth, _model.star_kelvin, _model.atmosphere_density)


func _on_load_failed(error: ApiError) -> void:
	for child: Node in _loading.get_children():
		child.queue_free()
	var column := Ui.column(24)
	column.custom_minimum_size = Vector2(560, 0)
	column.add_child(Ui.label("COLONY_LOAD_FAILED", AppTheme.VARIATION_HEADING))
	var detail := Ui.dynamic_label(AppTheme.VARIATION_ERROR)
	detail.text = ErrorText.describe(error, self)
	column.add_child(detail)
	var retry := Ui.primary_button("COMMON_RETRY")
	retry.pressed.connect(_on_retry_load)
	column.add_child(retry)
	_loading.add_child(column)
	_loading.visible = true


func _on_retry_load() -> void:
	for child: Node in _loading.get_children():
		child.queue_free()
	var text := Ui.label("COLONY_LOADING", AppTheme.VARIATION_MUTED)
	text.autowrap_mode = TextServer.AUTOWRAP_OFF
	_loading.add_child(text)
	_model.load_home()


func _on_production_changed() -> void:
	if _mode == Mode.STORE:
		_store.show_balance(_focus)
	_refresh()


func _on_inventory_changed() -> void:
	_fill_palette()
	if _mode == Mode.STORE:
		_store.show_inventory(_focus.inventory)
	_refresh()


## A guest was founded, removed or named. When the guest on screen is gone (its last hull was
## removed), the home structure takes its place.
func _on_guests_changed() -> void:
	if _focus != _model and not _model.guests.has(_focus.structure_id):
		var was_open := _opened
		_focus = _model
		if was_open:
			_opened = false
			_view.open_structure(0)
			_view.show_preview([], false)
			_menu_button.text = tr("COLONY_MENU")
			_select(null)
			_set_mode(Mode.VIEW)
		_select_structure(false)
		return
	_show_names()


# --- modes, tools, selection ----------------------------------------------------------------

func _set_mode(mode: Mode) -> void:
	_mode = mode
	if _recipes != null and _recipes.visible:
		_close_recipes()
	_view_tab.set_pressed_no_signal(mode == Mode.VIEW)
	_build_tab.set_pressed_no_signal(mode == Mode.BUILD)
	_store_tab.set_pressed_no_signal(mode == Mode.STORE)
	_log_tab.set_pressed_no_signal(mode == Mode.LOG)
	_research_tab.set_pressed_no_signal(mode == Mode.RESEARCH)
	# A closed structure shows only its details: no tabs, no store, no log.
	_tabs.visible = _opened
	# The research tab shows the labs of the home structure; a guest does not offer it (yet).
	_research_tab.visible = not _focus.is_guest()
	var panel_mode := _opened and (mode == Mode.STORE or mode == Mode.LOG or mode == Mode.RESEARCH)
	_palette_scroll.visible = _opened and mode == Mode.BUILD
	_store.visible = _opened and mode == Mode.STORE
	_log.visible = _opened and mode == Mode.LOG
	_research.visible = _opened and mode == Mode.RESEARCH
	_info.visible = not panel_mode
	_status.visible = not panel_mode
	_actions.visible = not panel_mode
	if panel_mode:
		_view.show_preview([], false)
	if _opened and mode == Mode.LOG:
		_log.reload()
	if _opened and mode == Mode.RESEARCH:
		_research.reload()
	if _opened and mode == Mode.STORE:
		_store.show_inventory(_focus.inventory)
		_store.show_balance(_focus)
		_view.show_preview([], false)
	_tool = ""
	_armed = ""
	_status.text = ""
	_fill_palette()
	_refresh()


## The palette offers what the store that builds the open structure holds: its own, or the
## host's for a guest.
func _fill_palette() -> void:
	for child: Node in _palette.get_children():
		child.queue_free()
	var definitions := Services.definitions
	var supply := _focus.supply().inventory
	if supply == null or definitions == null:
		return
	var now := Services.clock.now_ms()
	var group := ButtonGroup.new()
	for key: String in definitions.hull_keys():
		var hull := definitions.hull(key)
		var count := supply.units(hull.item, now)
		if count > 0:
			_palette.add_child(_tool_button("hull:" + key, hull.display_name, count, group))
	for key: String in definitions.module_keys():
		var module_def := definitions.module(key)
		var count := supply.units(module_def.item, now)
		if count > 0:
			_palette.add_child(_tool_button("module:" + key, module_def.display_name, count, group))
	if _palette.get_child_count() == 0:
		var empty := Ui.label("COLONY_NOTHING_TO_BUILD", AppTheme.VARIATION_MUTED)
		empty.autowrap_mode = TextServer.AUTOWRAP_OFF
		_palette.add_child(empty)


func _tool_button(tool: String, display_name: String, count: int, group: ButtonGroup) -> Button:
	var button := Button.new()
	button.toggle_mode = true
	button.button_group = group
	button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	button.text = tr("COLONY_ITEM_COUNT").format({"name": display_name, "count": count})
	button.custom_minimum_size = Vector2(AppTheme.TOUCH_MIN, AppTheme.TOUCH_MIN)
	button.button_pressed = tool == _tool
	button.pressed.connect(_choose_tool.bind(tool))
	return button


func _choose_tool(tool: String) -> void:
	_tool = tool
	_rotation = 0
	_status.text = ""
	_refresh()


func _select(cell: Variant) -> void:
	if _recipes.visible:
		_close_recipes()
	_cell = cell
	_armed = ""
	_status.text = ""
	if cell == null:
		_view.select_cell(null)
	_refresh()


## Selects the closed structure in focus (shows its details) or clears the selection; then the
## home structure is in focus again.
func _select_structure(on: bool) -> void:
	_structure_selected = on
	if on:
		_focus.activate()
	else:
		_focus = _model
	_view.highlight(_focus.structure_id if on else 0)
	_show_names()
	_refresh()


## Opens the structure in focus in place and switches to a tab: its shut hulls give way to the
## modules. The other structures stay shut.
func _open_structure(mode: Mode) -> void:
	_opened = true
	_structure_selected = false
	_focus.activate()
	_view.highlight(0)
	_view.open_structure(_focus.structure_id)
	_store.setup(_focus)
	_log.setup(_focus)
	_menu_button.text = tr("COLONY_CLOSE_STRUCTURE")
	_show_names()
	_set_mode(mode)


## Name and place in the top bar: the guest in focus with its host, otherwise the home structure
## with its body.
func _show_names() -> void:
	if _focus.is_guest():
		_title.text = _focus.structure_name
		_subtitle.text = tr("COLONY_DOCKED_AT").format({"host": _model.structure_name})
	else:
		_title.text = _model.structure_name
		_subtitle.text = _model.body_name


## Shuts the open structure again; it stays selected, so its details show.
func _close_structure() -> void:
	_opened = false
	_view.open_structure(0)
	_view.show_preview([], false)
	_menu_button.text = tr("COLONY_MENU")
	_select(null)
	_set_mode(Mode.VIEW)
	_select_structure(true)


## Updates preview, info text and buttons from the current state.
func _refresh() -> void:
	if _view == null or _model.structure_id == 0:
		return
	if not _opened:
		_refresh_closed()
		return
	if _cell != null:
		_view.select_cell(_target(), _target_on_guest())
	if _mode == Mode.STORE or _mode == Mode.LOG or _mode == Mode.RESEARCH:
		return
	_primary.disabled = _busy
	_secondary.disabled = _busy
	if _mode == Mode.BUILD:
		_refresh_build()
	else:
		_view.show_preview([], false)
		_refresh_view()


## The closed structure: a hint, or the details of the selected structure with Edit and Build.
func _refresh_closed() -> void:
	_primary.disabled = _busy
	_secondary.disabled = _busy
	if not _structure_selected:
		_info.text = tr("COLONY_HINT_OUTSIDE")
		_info.remove_theme_color_override("font_color")
		_actions.visible = false
		return
	_actions.visible = true
	var layout := _focus.layout
	var lines := PackedStringArray([tr("COLONY_STRUCTURE_SUMMARY").format({
		"hulls": layout.hull_count(), "modules": layout.module_count()})])
	var building := StructureLook.modules_building(layout)
	if building > 0:
		lines.append(tr("COLONY_STRUCTURE_BUILDING").format({"count": building}))
	lines.append(StorePanel.balance_text(_focus))
	_info.text = "\n".join(lines)
	if StorePanel.is_short(_focus):
		_info.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	else:
		_info.remove_theme_color_override("font_color")
	_secondary.visible = true
	_secondary.text = tr("COLONY_OPEN_EDIT")
	_primary.visible = true
	_primary.theme_type_variation = AppTheme.VARIATION_PRIMARY_BUTTON
	_primary.text = tr("COLONY_OPEN_BUILD")


func _refresh_view() -> void:
	_info.remove_theme_color_override("font_color")
	_secondary.visible = false
	# Everything the inspect view offers on the main button removes something.
	_primary.theme_type_variation = AppTheme.VARIATION_DANGER_BUTTON
	if _cell == null:
		_info.text = tr("COLONY_HINT_VIEW")
		_primary.visible = false
		return
	var target: Vector3i = _target()
	var layout := _focus.layout
	var local := layout.to_local(target)
	var hull_type := layout.hull_at(local)
	var placed := layout.module_at(local)
	var definitions := Services.definitions
	if hull_type.is_empty():
		_info.text = tr("COLONY_FREE_GROUND")
		_primary.visible = false
		return
	var hull_name := definitions.hull(hull_type).display_name if definitions.hull(hull_type) != null else ""
	if placed == null:
		_info.text = tr("COLONY_CELL_HULL").format({"hull": hull_name})
		_primary.visible = true
		_primary.text = tr("COLONY_CONFIRM_REMOVE") if _armed == "hull" else tr("COLONY_REMOVE_HULL")
		var host_cell := _model.layout.to_local(target)
		var verdict := DockRules.check_remove_hull(_model.layout, _model.guest_layouts(), layout, host_cell)
		if verdict != BuildRules.Verdict.OK:
			_info.text += "\n" + _verdict_text(verdict)
			_primary.disabled = true
		elif DockRules.removes_guest(layout, host_cell):
			_info.text += "\n" + tr("COLONY_REMOVES_GUEST")
		return
	var module_name := definitions.module(placed.module_type).display_name \
		if definitions.module(placed.module_type) != null else ""
	if placed.is_building():
		var remaining := placed.completes_at - Services.clock.now_ms()
		_info.text = tr("COLONY_CELL_MODULE_BUILDING").format({
			"module": module_name, "hull": hull_name, "duration": TimeFormat.duration(maxi(remaining, 0))})
	else:
		_info.text = tr("COLONY_CELL_MODULE").format({"module": module_name, "hull": hull_name})
		_info.text += "\n" + _recipe_line(placed)
	_primary.visible = true
	_primary.text = tr("COLONY_CONFIRM_REMOVE") if _armed == "module" else tr("COLONY_REMOVE_MODULE")
	var module_def := definitions.module(placed.module_type)
	if module_def != null and module_def.blueprint_driven and not placed.is_building():
		_secondary.visible = true
		_secondary.text = tr("COLONY_CHOOSE_RECIPE")


## What the module makes, or why it stands still.
func _recipe_line(placed: StructureLayout.Module) -> String:
	var reason := Wire.as_string(_focus.idle_reasons.get(placed.module_id))
	if reason == "LOCATION":
		return tr("RECIPE_IDLE_LOCATION")
	var module_def := Services.definitions.module(placed.module_type)
	if module_def == null or not module_def.blueprint_driven:
		return ""
	var recipe := Services.definitions.blueprint(placed.blueprint)
	if placed.blueprint.is_empty() or recipe == null or reason == "NO_BLUEPRINT":
		return tr("RECIPE_IDLE_NONE")
	return tr("RECIPE_CURRENT").format({"name": recipe.display_name, "flows": RecipePanel.describe(recipe)})


func _refresh_build() -> void:
	_info.remove_theme_color_override("font_color")
	_primary.theme_type_variation = AppTheme.VARIATION_PRIMARY_BUTTON
	_secondary.visible = true
	_secondary.text = tr("COLONY_CANCEL")
	_primary.visible = true
	_primary.text = tr("COLONY_BUILD_HERE")
	# A guest is built from its host's store: say so under every build hint.
	var supply_line := ""
	if _focus.is_guest():
		supply_line = "\n" + tr("COLONY_SUPPLY_FROM_HOST").format({"host": _model.structure_name})
	if _tool.is_empty():
		_info.text = tr("COLONY_HINT_BUILD") + supply_line
		_primary.disabled = true
		_view.show_preview([], false)
		return
	var tool_name := _tool_name()
	if _cell == null:
		_info.text = tr("COLONY_HINT_PLACE").format({"name": tool_name}) + supply_line
		_primary.disabled = true
		_view.show_preview([], false)
		return
	var verdict := _verdict()
	var cells := _tool_cells()
	var scene_key := _tool.get_slice(":", 1).to_lower()
	if _tool.begins_with("hull:"):
		scene_key = "hull_" + scene_key
	_view.show_preview(cells, verdict == BuildRules.Verdict.OK, scene_key, _rotation, _target_on_guest())
	_info.text = tool_name if verdict == BuildRules.Verdict.OK else _verdict_text(verdict)
	if verdict == BuildRules.Verdict.OK and _tool.begins_with("hull:") and DockRules.placement(
			_model.layout, _model.guest_layouts(), _model.layout.to_local(_target() as Vector3i)) == DockRules.Placement.FOUND:
		_info.text = tr("COLONY_FOUNDS_GUEST").format({"name": tool_name})
	_info.text += supply_line
	_primary.disabled = _busy or verdict != BuildRules.Verdict.OK
	if _is_multi_cell():
		_secondary.text = tr("COLONY_ROTATE")


func _tool_name() -> String:
	var definitions := Services.definitions
	var key := _tool.get_slice(":", 1)
	if _tool.begins_with("hull:"):
		return definitions.hull(key).display_name
	return definitions.module(key).display_name


func _is_multi_cell() -> bool:
	if not _tool.begins_with("module:"):
		return false
	var module_def := Services.definitions.module(_tool.get_slice(":", 1))
	return module_def != null and module_def.size.x != module_def.size.y


## The absolute cell the selected column aims at: the topmost hull of the open structure there,
## or — for a new hull — the cell on top (on a dock, on a guest) or next to it (DockRules).
func _target() -> Variant:
	if _cell == null:
		return null
	var host := _model.layout
	var tapped := host.to_local(_cell as Vector3i)
	var new_hull := _mode == Mode.BUILD and _tool.begins_with("hull:")
	return host.to_absolute(DockRules.target_cell(host, _focus.layout, Vector2i(tapped.x, tapped.y), new_hull))


## Whether the target cell is drawn as part of a guest (on a guest, or a hull that would found
## or extend one).
func _target_on_guest() -> bool:
	if _focus.is_guest():
		return true
	if _cell == null or not (_mode == Mode.BUILD and _tool.begins_with("hull:")):
		return false
	var host_cell := _model.layout.to_local(_target() as Vector3i)
	return DockRules.placement(_model.layout, _model.guest_layouts(), host_cell) != DockRules.Placement.HOST


## Absolute cells the current tool would cover at the selected cell.
func _tool_cells() -> Array[Vector3i]:
	var at: Vector3i = _target()
	if _tool.begins_with("hull:"):
		return [at]
	var module_def := Services.definitions.module(_tool.get_slice(":", 1))
	if module_def == null:
		return [at]
	return BuildRules.footprint(module_def.size, at, _rotation)


func _verdict() -> BuildRules.Verdict:
	var target: Vector3i = _target()
	var key := _tool.get_slice(":", 1)
	var now := Services.clock.now_ms()
	var supply := _focus.supply().inventory
	if _tool.begins_with("hull:"):
		if supply == null or supply.units(Services.definitions.hull(key).item, now) <= 0:
			return BuildRules.Verdict.NO_ITEM
		return DockRules.check_place_hull(_model.layout, _model.guest_layouts(), _model.layout.to_local(target))
	if supply == null or supply.units(Services.definitions.module(key).item, now) <= 0:
		return BuildRules.Verdict.NO_ITEM
	return BuildRules.check_place_module(_focus.layout, Services.definitions, key, _focus.layout.to_local(target), _rotation)


func _verdict_text(verdict: BuildRules.Verdict) -> String:
	var key: String = BuildRules.Verdict.keys()[verdict]
	if verdict == BuildRules.Verdict.POSITIONING:
		var module_def := Services.definitions.module(_tool.get_slice(":", 1))
		var slots := PackedStringArray()
		for slot: String in module_def.positioning:
			slots.append(tr("SLOT_" + slot))
		return tr("BUILD_VERDICT_POSITIONING").format({"slots": ", ".join(slots)})
	return tr("BUILD_VERDICT_" + key)


# --- actions --------------------------------------------------------------------------------

func _on_primary() -> void:
	if not _opened:
		if _structure_selected:
			_open_structure(Mode.BUILD)
		return
	if _busy or _cell == null:
		return
	if _mode == Mode.BUILD:
		_build()
		return
	var at: Vector3i = _target()
	var placed := _focus.layout.module_at(_focus.layout.to_local(at))
	var target := "module" if placed != null else "hull"
	if _armed != target:
		_armed = target
		_refresh()
		return
	_armed = ""
	if placed != null:
		at = _focus.layout.to_absolute(placed.origin)
	_send([{"op": "removeModule" if target == "module" else "removeHull", "x": at.x, "y": at.y, "z": at.z}])


func _on_secondary() -> void:
	if not _opened:
		if _structure_selected:
			_open_structure(Mode.VIEW)
		return
	if _mode == Mode.BUILD and _is_multi_cell() and _cell != null:
		_rotation = (_rotation + 90) % 360
		_refresh()
		return
	if _mode == Mode.VIEW and _cell != null:
		var placed := _focus.layout.module_at(_focus.layout.to_local(_target() as Vector3i))
		if placed != null:
			_open_recipes(placed)
		return
	_set_mode(Mode.VIEW)


func _open_recipes(placed: StructureLayout.Module) -> void:
	_recipes.visible = true
	_info.visible = false
	_status.visible = false
	_actions.visible = false
	_recipes.show_recipes(placed.module_type, placed.blueprint, _focus.usable_blueprints, _focus.atmosphere)


func _close_recipes() -> void:
	_recipes.visible = false
	_info.visible = true
	_status.visible = true
	_actions.visible = true
	_refresh()


func _on_recipe_chosen(blueprint: String) -> void:
	if _busy or _cell == null:
		return
	var structure := _focus
	var placed := structure.layout.module_at(structure.layout.to_local(_target() as Vector3i))
	if placed == null:
		_close_recipes()
		return
	_close_recipes()
	_busy = true
	_status.remove_theme_color_override("font_color")
	_status.text = tr("COLONY_SENDING")
	_refresh()
	var result := await structure.set_blueprint(structure.layout.to_absolute(placed.origin), blueprint)
	_busy = false
	if result.is_ok():
		_status.add_theme_color_override("font_color", AppTheme.COLOR_OK)
		_status.text = tr("COLONY_DONE")
	else:
		_status.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		_status.text = ErrorText.describe(result.error, self)
	_refresh()


func _build() -> void:
	var at: Vector3i = _target()
	var key := _tool.get_slice(":", 1)
	var op: Dictionary
	if _tool.begins_with("hull:"):
		op = {"op": "placeHull", "hullType": key, "x": at.x, "y": at.y, "z": at.z}
	else:
		op = {"op": "placeModule", "moduleType": key, "x": at.x, "y": at.y, "z": at.z, "rotation": _rotation}
	_send([op])


func _send(ops: Array[Dictionary]) -> void:
	_busy = true
	_status.remove_theme_color_override("font_color")
	_status.text = tr("COLONY_SENDING")
	_refresh()
	var result := await _model.send_ops(ops)
	_busy = false
	if result.is_ok():
		_status.add_theme_color_override("font_color", AppTheme.COLOR_OK)
		_status.text = tr("COLONY_DONE")
	else:
		_status.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		_status.text = ErrorText.describe(result.error, self)
	_refresh()


func _on_menu() -> void:
	# While the structure is open, the button closes it.
	if _opened:
		_close_structure()
		return
	if _menu == null:
		_menu = _build_menu()
		add_child(_menu)
	_menu.visible = true


func _build_menu() -> Control:
	var overlay := Control.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(background)
	var account_page := HomeScreen.new()
	account_page.home_name = _model.body_name
	overlay.add_child(account_page)
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	margin.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	overlay.add_child(margin)
	var close := Ui.secondary_button("COMMON_CLOSE")
	close.size_flags_horizontal = Control.SIZE_SHRINK_END
	close.pressed.connect(func() -> void: overlay.visible = false)
	margin.add_child(close)
	return overlay


# --- input on the world ---------------------------------------------------------------------

func _on_world_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			_touches[touch.index] = touch.position
			if _touches.size() == 1:
				_press_position = touch.position
				_press_travel = 0.0
		else:
			var was_single := _touches.size() == 1
			_touches.erase(touch.index)
			if was_single and _press_travel < TAP_SLOP:
				_on_tap(touch.position)
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if _touches.size() >= 2 and _touches.has(drag.index):
			var other := Vector2.ZERO
			for index: int in _touches.keys():
				if index != drag.index:
					other = _touches[index]
					break
			var before: Vector2 = _touches[drag.index]
			var old_distance := before.distance_to(other)
			var new_distance := drag.position.distance_to(other)
			if old_distance > 1.0 and new_distance > 1.0:
				_view.zoom_by(old_distance / new_distance)
			_touches[drag.index] = drag.position
			_press_travel = TAP_SLOP
		else:
			_touches[drag.index] = drag.position
			_press_travel += drag.relative.length()
			_view.pan(drag.relative * _scale(), Vector2(_viewport.size))
	elif event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if button.device == InputEvent.DEVICE_ID_EMULATION:
			return
		match button.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				_view.zoom_by(0.9)
			MOUSE_BUTTON_WHEEL_DOWN:
				_view.zoom_by(1.1)
			MOUSE_BUTTON_LEFT:
				if button.pressed:
					_mouse_down = true
					_press_position = button.position
					_press_travel = 0.0
				else:
					_mouse_down = false
					if _press_travel < TAP_SLOP:
						_on_tap(button.position)
	elif event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		if motion.device == InputEvent.DEVICE_ID_EMULATION or not _mouse_down:
			return
		_press_travel += motion.relative.length()
		_view.pan(motion.relative * _scale(), Vector2(_viewport.size))
	elif event is InputEventMagnifyGesture:
		_view.zoom_by(1.0 / (event as InputEventMagnifyGesture).factor)


## Canvas pixels → viewport pixels (the viewport follows the container's size).
func _scale() -> float:
	return float(_viewport.size.y) / maxf(_container.size.y, 1.0)


## Closed: a tap on a guest selects the guest, on the rest the home structure, beside them
## nothing. Open: a tap chooses a column of the open structure.
func _on_tap(position_in_container: Vector2) -> void:
	if _model.structure_id == 0:
		return
	if not _opened:
		var picked := _model.structure(_view.pick_structure(position_in_container * _scale()))
		if picked == null:
			_select_structure(false)
			return
		_focus = picked
		_select_structure(true)
		return
	var cell: Variant = _view.cell_at(position_in_container * _scale(), _view.floor_height(_focus))
	if cell != null and _cell != null and (cell as Vector3i) == (_cell as Vector3i) and _mode == Mode.VIEW:
		_select(null)
		return
	_select(cell)
