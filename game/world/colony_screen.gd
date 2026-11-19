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
##
## Levels: while the home structure is open, a level selector at the right edge (Up / "Level 2" /
## Down, with the environment of the level) chooses the active level: taps, building and the
## inspection work on it, the levels above it are hidden, and below the ground the view cuts the
## surface away (ColonyView.cutaway). Staircases and elevators form shafts between levels: they
## take the hull above as their landing, extend by a floor, are removed as a whole and offer a
## jump to their other end. A guest keeps its own stacking (DockRules.target_cell).
##
## The screen shows one own structure (`start_structure`, else the home colony) with the other own
## structures on the same body drawn next to it (neighbours: a tap offers to go there). The fleet
## (button "Fleet" while there is more than one structure) lists them all; choosing one asks the
## app for a new screen (`switch_requested`). A structure in orbit or under way has no ground: it
## shows as panels only (store and log), its place in the top bar.

## The player wants to see another own structure.
signal switch_requested(structure_id: int)

enum Mode { VIEW, BUILD, STORE, LOG, RESEARCH, TRIP }

## Pointer travel (canvas px) below which a press counts as a tap, not a drag.
const TAP_SLOP := 18.0
## How often the panel text is refreshed (construction countdowns).
const REFRESH_SECONDS := 1.0
## Fixed sun (radians) while the body has no orbit data: high in the south-west, so the shadows
## fall towards the camera's upper right.
const FIXED_SUN_ELEVATION := 0.87
const FIXED_SUN_AZIMUTH := 3.67
## The module every home colony has (draft.22): it cannot be built or removed.
const CORE_MODULE := "CORE_MODULE"
## Where the detail tier of this device is kept between starts.
const DETAIL_PATH := "user://detail.json"
## How often the sun is moved along its path (seconds); it crawls, so this is plenty.
const SUN_SECONDS := 1.0

## The structure to show when the screen opens; 0 for the home colony. Set before adding it.
var start_structure := 0

## The structure on screen; its guests and neighbours hang below it.
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
var _palette: BuildPalette
var _view_tab: Button
var _build_tab: Button
var _store_tab: Button
var _store: StorePanel
var _log: LogPanel
var _log_tab: Button
var _research: ResearchPanel
var _research_tab: Button
var _recipes: RecipePanel
var _workforce_panel: WorkforcePanel
## Opens the staffing of the inspected module's type.
var _staff: Button
var _actions: HBoxContainer
var _loading: Control
var _bottom: PanelContainer
var _menu: Control
var _menu_button: Button
## Opens the system map; shown while no structure is open.
var _map_button: Button
## The system map over the colony while it is open; null otherwise.
var _map: MapScreen = null
var _tabs: HBoxContainer
## The player's structures and their trips.
var _fleet: FleetModel
## Opens the fleet list; shown while the player has more than one structure.
var _fleet_button: Button
## The fleet list over the colony while it is open; null otherwise.
var _fleet_panel: FleetPanel = null
## Travel: the action in the closed structure's details, the choice of the target in the bottom
## panel, the trip tab of a structure without ground, and the surface picker over the colony.
var _travel: Button
var _travel_panel: TravelPanel
var _trip_tab: Button
var _trip_info: TravelInfoPanel
var _site: TravelSiteScreen = null
## Whether the map is open to pick a body for a trip: to land on it (true) or to orbit it.
var _picking_land := false
## The level selector (home structure open) and its parts; the active level (absolute z).
var _levels: PanelContainer
var _level_up: Button
var _level_down: Button
var _level_name: Label
var _level_env: Label
var _level := 0
## Jumps to the other end of the selected shaft.
var _jump: Button
## Stop sites of the routes on the surface (hidden in the cutaway).
var _stops: RouteStopLayer
## A short message over the bottom panel (a trip started, arrived or was stopped).
var _notice: Label
var _notice_left := 0.0
## How long a notice stays (seconds).
const NOTICE_SECONDS := 12.0

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
	_fleet = FleetModel.new()
	_fleet.name = "Fleet"
	add_child(_fleet)
	_fleet.changed.connect(_on_fleet_changed)
	_build_world()
	# Stop sites the routes hold on this body (RouteStopLayer).
	_stops = RouteStopLayer.new()
	_stops.setup(_view, _fleet.routes)
	_view.add_child(_stops)
	_build_overlay()
	_model.layout_changed.connect(_refresh)
	_model.guests_changed.connect(_on_guests_changed)
	_model.inventory_changed.connect(_on_inventory_changed)
	_model.production_changed.connect(_on_production_changed)
	_model.ready_to_show.connect(_on_ready_to_show)
	_model.load_failed.connect(_on_load_failed)
	Services.events.event_received.connect(_on_travel_event)
	if Services.definitions == null:
		Services.definitions_loaded.connect(_on_definitions_loaded, CONNECT_ONE_SHOT)
	else:
		_model.load_structure(start_structure)
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
	if _notice_left > 0.0:
		_notice_left -= delta
		if _notice_left <= 0.0:
			_notice.visible = false
	_refresh_left -= delta
	if _refresh_left <= 0.0:
		_refresh_left = REFRESH_SECONDS
		if _mode == Mode.TRIP and _trip_info.visible:
			_trip_info.tick()
		if _model.detached:
			_show_names()
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
	if _site != null:
		_site.handle_back()
	elif _fleet_panel != null:
		if not _fleet_panel.handle_back():
			_close_fleet()
	elif _map != null:
		_map.handle_back()
	elif _menu != null and _menu.visible:
		_menu.visible = false
	elif _travel_panel.visible:
		_travel_panel.handle_back()
	elif _opened and _mode == Mode.RESEARCH and _research.handle_back():
		pass
	elif _recipes.visible:
		_close_recipes()
	elif _workforce_panel.visible:
		_close_workforce()
	elif _opened and _cell != null:
		_select(null)
	elif _opened and not _model.detached:
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
	_map_button = Ui.secondary_button("MAP_OPEN")
	_map_button.size_flags_horizontal = Control.SIZE_SHRINK_END
	_map_button.visible = false
	_map_button.pressed.connect(_open_map)
	top_row.add_child(_map_button)
	_fleet_button = Ui.secondary_button("FLEET_OPEN")
	_fleet_button.size_flags_horizontal = Control.SIZE_SHRINK_END
	_fleet_button.visible = false
	_fleet_button.pressed.connect(_open_fleet)
	top_row.add_child(_fleet_button)
	_menu_button = Ui.secondary_button("COLONY_MENU")
	_menu_button.size_flags_horizontal = Control.SIZE_SHRINK_END
	_menu_button.pressed.connect(_on_menu)
	top_row.add_child(_menu_button)

	# Middle: the colony, and the level selector at the right edge.
	var middle := HBoxContainer.new()
	middle.size_flags_vertical = Control.SIZE_EXPAND_FILL
	middle.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(middle)
	var filler := Control.new()
	filler.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	filler.mouse_filter = Control.MOUSE_FILTER_IGNORE
	middle.add_child(filler)
	_levels = PanelContainer.new()
	_levels.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_levels.visible = false
	middle.add_child(_levels)
	var level_box := Ui.column(8)
	level_box.custom_minimum_size = Vector2(176, 0)
	_levels.add_child(level_box)
	_level_up = Ui.secondary_button("LEVEL_UP")
	_level_up.pressed.connect(_step_level.bind(1))
	level_box.add_child(_level_up)
	_level_name = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	_level_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_level_name.autowrap_mode = TextServer.AUTOWRAP_OFF
	level_box.add_child(_level_name)
	_level_env = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_level_env.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	level_box.add_child(_level_env)
	_level_down = Ui.secondary_button("LEVEL_DOWN")
	_level_down.pressed.connect(_step_level.bind(-1))
	level_box.add_child(_level_down)

	# Bottom: tabs, palette, info, actions.
	_bottom = PanelContainer.new()
	column.add_child(_bottom)
	var rows := Ui.column(16)
	_bottom.add_child(rows)
	_notice = Ui.dynamic_label()
	_notice.visible = false
	rows.add_child(_notice)
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
	_trip_tab = Ui.tab_button("TRAVEL_TAB_TRIP", group)
	_trip_tab.pressed.connect(_set_mode.bind(Mode.TRIP))
	_tabs.add_child(_trip_tab)

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
	_workforce_panel = WorkforcePanel.new()
	_workforce_panel.visible = false
	_workforce_panel.applied.connect(_on_workforce_applied)
	_workforce_panel.closed.connect(_close_workforce)
	rows.add_child(_workforce_panel)
	_travel_panel = TravelPanel.new()
	_travel_panel.visible = false
	_travel_panel.closed.connect(_close_travel)
	_travel_panel.pick_body_requested.connect(_open_map_pick)
	_travel_panel.drive_requested.connect(_on_drive_requested)
	_travel_panel.started.connect(_on_travel_started)
	rows.add_child(_travel_panel)
	_trip_info = TravelInfoPanel.new()
	_trip_info.visible = false
	_trip_info.travel_requested.connect(_open_travel)
	rows.add_child(_trip_info)

	_palette = BuildPalette.new()
	_palette.chosen.connect(_choose_tool)
	rows.add_child(_palette)

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
	_staff = Ui.secondary_button("WORKFORCE_OPEN")
	_staff.pressed.connect(_on_staff)
	_staff.visible = false
	_actions.add_child(_staff)
	_actions.move_child(_staff, 0)
	_travel = Ui.secondary_button("TRAVEL_OPEN")
	_travel.pressed.connect(_open_travel)
	_travel.visible = false
	_actions.add_child(_travel)
	_actions.move_child(_travel, 0)
	_jump = Ui.secondary_button("LEVEL_GO_UP")
	_jump.pressed.connect(_on_jump)
	_jump.visible = false
	_actions.add_child(_jump)
	_actions.move_child(_jump, 0)

	_loading = CenterContainer.new()
	_loading.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var loading_text := Ui.label("COLONY_LOADING", AppTheme.VARIATION_MUTED)
	loading_text.autowrap_mode = TextServer.AUTOWRAP_OFF
	_loading.add_child(loading_text)
	add_child(_loading)


# --- data -----------------------------------------------------------------------------------

func _on_definitions_loaded() -> void:
	_model.load_structure(start_structure)


func _on_ready_to_show() -> void:
	_loading.visible = false
	_map_button.visible = not _opened and not _model.system_id.is_empty()
	_title.text = _model.structure_name
	_subtitle.text = _model.body_name
	_fleet.reload()
	if _model.asked_guest != 0 and _model.structure(_model.asked_guest) != null:
		_focus = _model.structure(_model.asked_guest)
		if not _model.detached:
			_select_structure(true)
	if _model.detached:
		# No ground: the structure shows as panels only, the 3D view stops drawing.
		_container.visible = false
		_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
		_trip_info.setup(_fleet, _model.structure_id)
		_open_structure(Mode.TRIP)
		return
	_view.set_fleet(_fleet.fleet)
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
	if _model.detached:
		return
	if _model.sun == null:
		_view.set_sun(FIXED_SUN_ELEVATION, FIXED_SUN_AZIMUTH, _model.star_kelvin, _model.atmosphere_density,
		_model.star_brightness(), _model.star_size())
		return
	var cell := _view.focus_cell()
	var angles := SunPosition.cell_angles(cell.x, cell.y, _model.size_x)
	var sky := _model.sun.sky_at(angles.x, angles.y, Services.clock.now_ms() / 1000.0)
	_view.set_sun(sky.elevation, sky.azimuth, _model.star_kelvin, _model.atmosphere_density,
		_model.star_brightness(), _model.star_size())


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
	_model.load_structure(start_structure)


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
	# A guest founded or gone is a structure more or less in the fleet.
	_fleet.reload()
	if _focus != _model and not _model.guests.has(_focus.structure_id):
		var was_open := _opened
		_focus = _model
		if was_open:
			_opened = false
			_level = 0
			_view.set_level(0, false)
			_stops.visible = true
			_view.open_structure(0)
			_view.show_preview([], false)
			_menu_button.text = tr("COLONY_MENU")
			_map_button.visible = true
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
	if _workforce_panel != null and _workforce_panel.visible:
		_close_workforce()
	_view_tab.set_pressed_no_signal(mode == Mode.VIEW)
	_build_tab.set_pressed_no_signal(mode == Mode.BUILD)
	_store_tab.set_pressed_no_signal(mode == Mode.STORE)
	_log_tab.set_pressed_no_signal(mode == Mode.LOG)
	_research_tab.set_pressed_no_signal(mode == Mode.RESEARCH)
	_trip_tab.set_pressed_no_signal(mode == Mode.TRIP)
	if _travel_panel.visible:
		_travel_panel.visible = false
	# A closed structure shows only its details: no tabs, no store, no log.
	_tabs.visible = _opened
	# The research tab shows the labs of the home structure; a guest does not offer it (yet).
	# A structure without ground (orbit, under way) has nothing to inspect or build in 3D, but
	# its trip.
	_research_tab.visible = not _focus.is_guest() and not _model.detached
	_view_tab.visible = not _model.detached
	_build_tab.visible = not _model.detached
	_trip_tab.visible = _model.detached
	var panel_mode := _opened and (mode == Mode.STORE or mode == Mode.LOG or mode == Mode.RESEARCH or mode == Mode.TRIP)
	_palette.visible = _opened and mode == Mode.BUILD
	_store.visible = _opened and mode == Mode.STORE
	_log.visible = _opened and mode == Mode.LOG
	_research.visible = _opened and mode == Mode.RESEARCH
	_trip_info.visible = _opened and mode == Mode.TRIP
	if _trip_info.visible:
		_trip_info.tick()
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
	_update_levels()
	_fill_palette()
	_refresh()


## The palette offers what the store that builds the open structure holds: its own, or the
## host's for a guest. On the home structure hulls that cannot stand on the active level are left
## out (named in a hint), and modules whose production depends on the level show the change here.
func _fill_palette() -> void:
	var definitions := Services.definitions
	var supply := _focus.supply().inventory if _focus != null else null
	if supply == null or definitions == null:
		var none: Array[BuildCatalog.Entry] = []
		_palette.show_entries(none, _tool)
		return
	# Whole units of every hull and module item in the store that builds here.
	var now := Services.clock.now_ms()
	var units := {}
	for key: String in definitions.hull_keys():
		var item := definitions.hull(key).item
		units[item] = supply.units(item, now)
	for key: String in definitions.module_keys():
		var item := definitions.module(key).item
		units[item] = supply.units(item, now)
	var entries := BuildCatalog.entries(definitions, units)
	var hidden := PackedStringArray()
	if _uses_levels():
		var environment := _level_environment()
		var kept: Array[BuildCatalog.Entry] = []
		for entry: BuildCatalog.Entry in entries:
			if entry.tool.begins_with("hull:") and not _hull_offered(entry.tool.get_slice(":", 1), environment):
				hidden.append(entry.display_name)
				if entry.tool == _tool:
					_tool = ""
				continue
			if entry.tool.begins_with("module:"):
				entry.note = _change_text(LevelRules.z_percent(definitions.module(entry.tool.get_slice(":", 1)), _level))
			kept.append(entry)
		entries = kept
	var hint := tr("LEVEL_HULLS_HIDDEN").format({"names": ", ".join(hidden)}) if not hidden.is_empty() else ""
	_palette.show_entries(entries, _tool, hint)


# --- levels ---------------------------------------------------------------------------------

## Whether the open structure is built level by level (the home structure on a body with a grid;
## a guest keeps its own stacking).
func _uses_levels() -> bool:
	return _opened and _focus == _model and not _model.detached and _model.has_grid


## The levels the selector offers (absolute z, inclusive).
func _level_range() -> Vector2i:
	return LevelRules.level_range(_model.layout.absolute_levels(), _model.site())


## Environment of the active level: of the selected field, or of the level as such.
func _level_environment() -> String:
	if _cell != null:
		var at: Vector3i = _cell
		return LevelRules.environment_of(_model.site(), Vector3i(at.x, at.y, _level))
	return LevelRules.environment_at(_level, "", _model.deep_threshold, _model.body_type)


## Whether a hull type can stand on the active level in `environment` (type, height limit, environment).
func _hull_offered(hull_type: String, environment: String) -> bool:
	var hull_def := Services.definitions.hull(hull_type)
	return hull_def != null and LevelRules.SURFACE_HULLS.has(hull_type) \
		and LevelRules.hull_z_allowed(hull_type, _level) and hull_def.environments.has(environment)


## "Ground", "Level 2", "Level -1".
func _level_text(z: int) -> String:
	return tr("LEVEL_GROUND") if z == 0 else tr("LEVEL_NAME").format({"level": z})


## "+6 %", "-4 %"; "" for no change.
func _change_text(percent: int) -> String:
	if percent > 0:
		return tr("LEVEL_CHANGE_UP").format({"percent": percent})
	if percent < 0:
		return tr("LEVEL_CHANGE_DOWN").format({"percent": -percent})
	return ""


## The production change of a module type at level `z` as a sentence; "" when it does not care.
func _z_line(module_def: GameDefinitions.ModuleDef, z: int) -> String:
	if module_def == null or module_def.z_bonus_percent == 0:
		return ""
	var change := _change_text(LevelRules.z_percent(module_def, z))
	if change.is_empty():
		change = tr("LEVEL_CHANGE_UP").format({"percent": 0})
	return tr("LEVEL_Z_BETTER_HIGH" if module_def.z_prefer_high else "LEVEL_Z_BETTER_DEEP").format({"change": change})


## Shows or hides the level selector and writes its level and environment.
func _update_levels() -> void:
	if _levels == null:
		return
	_levels.visible = _uses_levels() and (_mode == Mode.VIEW or _mode == Mode.BUILD) and not _travel_panel.visible
	if not _levels.visible:
		return
	var bounds := _level_range()
	_level_name.text = _level_text(_level)
	_level_env.text = tr("LEVEL_ENV_" + LevelRules.environment_at(_level, "", _model.deep_threshold, _model.body_type))
	_level_up.disabled = _level >= bounds.y
	_level_down.disabled = _level <= bounds.x


func _step_level(step: int) -> void:
	var bounds := _level_range()
	_set_level(clampi(_level + step, bounds.x, bounds.y))


## Makes `z` the active level: the selected field keeps its column, the view hides the levels
## above (and cuts the surface away below the ground), the palette follows.
func _set_level(z: int) -> void:
	_level = z
	_view.set_level(z, _uses_levels())
	_stops.visible = not _view.cutaway()
	if _cell != null:
		var at: Vector3i = _cell
		_cell = Vector3i(at.x, at.y, z)
	_armed = ""
	_status.text = ""
	_update_levels()
	_fill_palette()
	_refresh()


## Jumps to the other end of the selected shaft: to its head from below, to its lowest floor from
## the head.
func _on_jump() -> void:
	var placed := _selected_shaft()
	if placed == null:
		return
	var ends := _shaft_ends(placed)
	_set_level(ends.y if _level < ends.y else ends.x)


## The shaft (any of its floors) at the selected field of the open structure; null when none.
func _selected_shaft() -> StructureLayout.Module:
	if _cell == null:
		return null
	var layout := _focus.layout
	var placed := layout.module_at(layout.to_local(_target() as Vector3i))
	return placed if layout.is_shaft(placed) else null


## Absolute levels of a shaft's lowest floor (x) and its head (y).
func _shaft_ends(placed: StructureLayout.Module) -> Vector2i:
	var layout := _focus.layout
	var floors := layout.shaft_of(placed)
	return Vector2i(layout.to_absolute(floors[0].origin).z, layout.to_absolute(layout.shaft_head(placed)).z)


## Adds a floor on top of the selected shaft (`extendShaft`).
func _extend_shaft() -> void:
	var placed := _selected_shaft()
	if placed == null or _busy:
		return
	var at := _focus.layout.to_absolute(placed.origin)
	_send([{"op": "extendShaft", "x": at.x, "y": at.y, "z": at.z}])


## Why the selected shaft cannot get another floor; OK when it can.
func _extend_verdict(placed: StructureLayout.Module) -> BuildRules.Verdict:
	var layout := _focus.layout
	var verdict := BuildRules.check_extend_shaft(layout, Services.definitions, placed.origin)
	if verdict != BuildRules.Verdict.OK:
		return verdict
	var supply := _focus.supply().inventory
	var module_def := Services.definitions.module(placed.module_type)
	if supply == null or module_def == null or supply.units(module_def.item, Services.clock.now_ms()) <= 0:
		return BuildRules.Verdict.NO_ITEM
	return BuildRules.Verdict.OK


func _choose_tool(tool: String) -> void:
	_tool = tool
	_rotation = 0
	_status.text = ""
	_fill_palette()
	_refresh()


func _select(cell: Variant) -> void:
	if _recipes.visible:
		_close_recipes()
	if _workforce_panel.visible:
		_close_workforce()
	_cell = cell
	_armed = ""
	_status.text = ""
	if cell == null:
		_view.select_cell(null)
	# The field's environment decides which hulls fit (under water on the ground level).
	if _mode == Mode.BUILD and _uses_levels() and _level == 0:
		_fill_palette()
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
	# A structure opens on the ground level.
	_level = 0
	_view.set_level(0, _uses_levels())
	_store.setup(_focus)
	_log.setup(_focus)
	_menu_button.text = tr("COLONY_MENU") if _model.detached else tr("COLONY_CLOSE_STRUCTURE")
	_map_button.visible = _model.detached and not _model.system_id.is_empty()
	_fleet_button.visible = _model.detached and _fleet.fleet.size() > 1
	_show_names()
	_set_mode(mode)


## Name and place in the top bar: the guest in focus with its host, otherwise the home structure
## with its body.
func _show_names() -> void:
	_title.text = _focus.structure_name
	if _focus.is_guest():
		_subtitle.text = tr("COLONY_DOCKED_AT").format({"host": _focus.host.structure_name})
	elif _model.detached:
		_subtitle.text = _place_line(_focus.structure_id)
	else:
		_subtitle.text = _model.body_name


## Shuts the open structure again; it stays selected, so its details show.
func _close_structure() -> void:
	if _model.detached:
		return
	_opened = false
	_level = 0
	_view.set_level(0, false)
	_stops.visible = true
	_view.open_structure(0)
	_view.show_preview([], false)
	_menu_button.text = tr("COLONY_MENU")
	_map_button.visible = _model.structure_id != 0
	_fleet_button.visible = _fleet.fleet.size() > 1
	_select(null)
	_set_mode(Mode.VIEW)
	_select_structure(true)


## Updates preview, info text and buttons from the current state.
func _refresh() -> void:
	if _view == null or _model.structure_id == 0:
		return
	_staff.visible = false
	_travel.visible = false
	_jump.visible = false
	_update_levels()
	if _travel_panel.visible:
		return
	if not _opened:
		_refresh_closed()
		return
	if _cell != null:
		_view.select_cell(_target(), _target_on_guest())
	if _mode == Mode.STORE or _mode == Mode.LOG or _mode == Mode.RESEARCH or _mode == Mode.TRIP:
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
	var trip := _trip_line(_focus.structure_id)
	if not trip.is_empty():
		lines.append(trip)
	if _focus.is_neighbour():
		lines.append(tr("COLONY_NEIGHBOUR"))
		_info.text = "\n".join(lines)
		_info.remove_theme_color_override("font_color")
		_secondary.visible = false
		_primary.visible = true
		_primary.theme_type_variation = AppTheme.VARIATION_PRIMARY_BUTTON
		_primary.text = tr("COLONY_GO_THERE")
		return
	var building := StructureLook.modules_building(layout)
	if building > 0:
		lines.append(tr("COLONY_STRUCTURE_BUILDING").format({"count": building}))
	var workforce := _focus.workforce
	lines.append(tr("WORKFORCE_SUMMARY").format({"people": workforce.total_population(),
		"assigned": workforce.assigned_total(), "needed": workforce.needed_total()}))
	lines.append(StorePanel.balance_text(_focus))
	_info.text = "\n".join(lines)
	if StorePanel.is_short(_focus):
		_info.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	else:
		_info.remove_theme_color_override("font_color")
	_travel.visible = _can_travel(_focus)
	_secondary.visible = true
	_secondary.text = tr("COLONY_OPEN_EDIT")
	_primary.visible = true
	_primary.theme_type_variation = AppTheme.VARIATION_PRIMARY_BUTTON
	_primary.text = tr("COLONY_OPEN_BUILD")
	if not trip.is_empty():
		# Nothing is built while it travels (STRUCTURE_MOVING).
		_primary.visible = false


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
		_info.text = tr("COLONY_FREE_GROUND") if target.z == 0 else tr("LEVEL_EMPTY")
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
		if placed.is_disabled():
			_info.text += "\n" + tr("COLONY_MODULE_DISABLED")
	_primary.visible = true
	_primary.text = tr("COLONY_CONFIRM_REMOVE") if _armed == "module" else tr("COLONY_REMOVE_MODULE")
	if layout.is_shaft(placed):
		_refresh_shaft(placed, local)
		return
	var z_line := _z_line(definitions.module(placed.module_type), target.z)
	if not z_line.is_empty():
		_info.text += "\n" + z_line
	# The core module shields the home colony; neither it nor its hull can be removed.
	if placed.module_type == CORE_MODULE:
		_info.text += "\n" + tr("COLONY_CORE_MODULE")
		_primary.disabled = true
	var module_def := definitions.module(placed.module_type)
	if module_def != null and module_def.blueprint_driven and not placed.is_building():
		_secondary.visible = true
		_secondary.text = tr("COLONY_CHOOSE_RECIPE")
	if _staffable(module_def) and not placed.is_building():
		var group := _group_of(placed.module_type)
		_info.text += "
" + tr("WORKFORCE_LINE").format({"assigned": group.assigned(),
			"needed": group.needed(), "modules": group.modules})
		_staff.visible = true


## A staircase or elevator: its floors and ends, a further floor on top, the jump to its other
## end, and the removal of the whole shaft (two-step, with the number of floors).
func _refresh_shaft(placed: StructureLayout.Module, local: Vector3i) -> void:
	var layout := _focus.layout
	var floors := layout.shaft_of(placed)
	var ends := _shaft_ends(placed)
	var lines := PackedStringArray([_info.text, tr("LEVEL_SHAFT_LINE").format({
		"floors": floors.size(), "low": _level_text(ends.x), "high": _level_text(ends.y)})])
	if layout.is_shaft_head(local):
		lines.append(tr("LEVEL_SHAFT_HEAD"))
	_primary.text = tr("COLONY_CONFIRM_REMOVE") if _armed == "module" else tr("LEVEL_REMOVE_SHAFT")
	if _armed == "module":
		lines.append(tr("LEVEL_SHAFT_REMOVES").format({"floors": floors.size()}))
	_secondary.visible = true
	_secondary.text = tr("LEVEL_EXTEND_SHAFT")
	var verdict := _extend_verdict(placed)
	_secondary.disabled = _busy or verdict != BuildRules.Verdict.OK
	if verdict != BuildRules.Verdict.OK:
		lines.append(_verdict_text(verdict))
	if _uses_levels():
		_jump.visible = true
		_jump.text = tr("LEVEL_GO_UP") if _level < ends.y else tr("LEVEL_GO_DOWN")
	_info.text = "\n".join(lines)


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
	var module_def := Services.definitions.module(_tool.get_slice(":", 1)) if _tool.begins_with("module:") else null
	# A staircase or elevator also takes the hull above as its landing: mark it.
	var extra: Array[Vector3i] = []
	if module_def != null and module_def.vertical_access:
		extra.append((_target() as Vector3i) + Vector3i(0, 0, 1))
	_view.show_preview(cells, verdict == BuildRules.Verdict.OK, scene_key, _rotation, _target_on_guest(), extra)
	_info.text = tool_name if verdict == BuildRules.Verdict.OK else _verdict_text(verdict)
	if verdict == BuildRules.Verdict.OK and module_def != null and module_def.vertical_access:
		_info.text = tr("LEVEL_SHAFT_PLACE").format({"name": tool_name})
	if verdict == BuildRules.Verdict.OK and _tool.begins_with("hull:") and DockRules.placement(
			_model.layout, _model.guest_layouts(), _model.layout.to_local(_target() as Vector3i)) == DockRules.Placement.FOUND:
		_info.text = tr("COLONY_FOUNDS_GUEST").format({"name": tool_name})
	var z_line := _z_line(module_def, (_target() as Vector3i).z)
	if not z_line.is_empty():
		_info.text += "\n" + z_line
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


## The absolute cell the selected column aims at: on the home structure the cell on the active
## level (a new hull on a dock goes on top of it); on a guest its topmost hull there, or for a new
## hull the cell on top (DockRules.target_cell).
func _target() -> Variant:
	if _cell == null:
		return null
	var host := _model.layout
	var tapped := host.to_local(_cell as Vector3i)
	var new_hull := _mode == Mode.BUILD and _tool.begins_with("hull:")
	return host.to_absolute(DockRules.target_cell(host, _focus.layout, Vector2i(tapped.x, tapped.y), new_hull, _level))


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
		return DockRules.check_place_hull(_model.layout, _model.guest_layouts(), _model.layout.to_local(target),
			key, Services.definitions, _model.site())
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
	if verdict == BuildRules.Verdict.INCOMPATIBLE_HULL and _cell != null:
		var environment := LevelRules.environment_of(_model.site(), _target() as Vector3i)
		return tr("BUILD_VERDICT_INCOMPATIBLE_HULL").format({"environment": tr("LEVEL_ENV_" + environment)})
	return tr("BUILD_VERDICT_" + key)


# --- actions --------------------------------------------------------------------------------

func _on_primary() -> void:
	if not _opened:
		if _structure_selected and _focus.is_neighbour():
			switch_requested.emit(_focus.structure_id)
		elif _structure_selected:
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
		if _structure_selected and not _focus.is_neighbour():
			_open_structure(Mode.VIEW)
		return
	if _mode == Mode.BUILD and _is_multi_cell() and _cell != null:
		_rotation = (_rotation + 90) % 360
		_refresh()
		return
	if _mode == Mode.VIEW and _cell != null:
		var placed := _focus.layout.module_at(_focus.layout.to_local(_target() as Vector3i))
		if _focus.layout.is_shaft(placed):
			_extend_shaft()
		elif placed != null:
			_open_recipes(placed)
		return
	_set_mode(Mode.VIEW)


## Whether a module needs workers (and so can be staffed).
func _staffable(module_def: GameDefinitions.ModuleDef) -> bool:
	return module_def != null and not module_def.workforce_exempt and module_def.required_workers > 0


## The workforce group of a module type in the structure on screen; a type the rate solution
## does not list yet (just finished) starts empty with its active modules.
func _group_of(module_type: String) -> Workforce.Group:
	var known: Variant = _focus.workforce.groups.get(module_type)
	if known != null:
		return known as Workforce.Group
	var group := Workforce.Group.new()
	group.module_type = module_type
	var module_def := Services.definitions.module(module_type)
	if module_def != null:
		group.required_workers = module_def.required_workers
		group.base_tier = module_def.base_tier
	for placed: StructureLayout.Module in _focus.layout.modules():
		if placed.module_type == module_type and not placed.is_building():
			group.modules += 1
	return group


func _on_staff() -> void:
	if _cell == null:
		return
	var placed := _focus.layout.module_at(_focus.layout.to_local(_target() as Vector3i))
	if placed == null:
		return
	var module_def := Services.definitions.module(placed.module_type)
	_workforce_panel.visible = true
	_info.visible = false
	_status.visible = false
	_actions.visible = false
	_workforce_panel.show_group(_group_of(placed.module_type), _focus.workforce, _focus.robots_in_store(),
		module_def.display_name if module_def != null else "")


func _close_workforce() -> void:
	_workforce_panel.visible = false
	_info.visible = true
	_status.visible = true
	_actions.visible = true
	_refresh()


func _on_workforce_applied(module_type: String, humans: Array[int], robots: Array[int], auto: Array[bool]) -> void:
	if _busy:
		return
	_busy = true
	_workforce_panel.set_busy(true)
	var result := await _focus.set_workforce(module_type, humans, robots, auto)
	_busy = false
	_workforce_panel.set_busy(false)
	if result.is_ok():
		_close_workforce()
		_status.add_theme_color_override("font_color", AppTheme.COLOR_OK)
		_status.text = tr("COLONY_DONE")
	else:
		_workforce_panel.show_error(ErrorText.describe(result.error, self))


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
	# While the structure is open, the button closes it (one without ground stays open).
	if _opened and not _model.detached:
		_close_structure()
		return
	if _menu == null:
		_menu = _build_menu()
		add_child(_menu)
	_menu.visible = true


## Opens the list of own structures over the colony.
func _open_fleet() -> void:
	if _fleet_panel != null:
		return
	_fleet_panel = FleetPanel.new()
	_fleet_panel.setup(_fleet, _focus.structure_id)
	_fleet_panel.chosen.connect(_on_fleet_chosen)
	_fleet_panel.closed.connect(_close_fleet)
	add_child(_fleet_panel)
	_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED


func _close_fleet() -> void:
	if _fleet_panel == null:
		return
	_fleet_panel.queue_free()
	_fleet_panel = null
	if not _model.detached:
		_viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE


func _on_fleet_chosen(structure_id: int) -> void:
	_close_fleet()
	if structure_id == _focus.structure_id:
		return
	# Already on screen (a guest or a neighbour): select it there; anything else: switch.
	var here := _model.structure(structure_id)
	if here != null and not here.is_neighbour() and not _model.detached:
		if _opened:
			_close_structure()
		_focus = here
		_select_structure(true)
		return
	switch_requested.emit(structure_id)


## The fleet changed: the button shows with more than one structure, trips update the texts.
func _on_fleet_changed() -> void:
	if _model.structure_id != 0 and _switch_if_moved():
		return
	_fleet_button.visible = _fleet.fleet.size() > 1 and (not _opened or _model.detached)
	if _model.structure_id != 0 and not _model.detached:
		_model.sync_with_fleet(_fleet.fleet, Services.clock.now_ms())
		_view.set_fleet(_fleet.fleet)
	_show_names()
	if _trip_info.visible:
		_trip_info.tick()
	_refresh()


## The structure on screen took off or landed: the screen is built again for where it is now
## (panels only in orbit or in flight, the ground once it stands somewhere). A drive keeps the
## ground: the structure is drawn moving over it. Returns whether a new screen was asked for.
func _switch_if_moved() -> bool:
	var entry := _fleet.fleet.find(_model.structure_id)
	if entry == null or _site != null:
		return false
	var away := entry.where() == Fleet.Where.ORBIT or entry.where() == Fleet.Where.TRANSIT
	var driving := entry.motion != null and entry.motion.mode == TravelPlan.MODE_GROUND
	if (_model.detached and not away) or (not _model.detached and away and not driving):
		switch_requested.emit(_model.structure_id)
		return true
	return false


# --- travel ---------------------------------------------------------------------------------

## Whether a structure on screen can be sent on a trip from here: an own one with a drive (not a
## neighbour, which is seen only), resting.
func _can_travel(structure: ColonyModel) -> bool:
	if structure.is_neighbour() or structure.structure_id == 0:
		return false
	var entry := _fleet.fleet.find(structure.structure_id)
	if entry == null or entry.is_moving(Services.clock.now_ms()):
		return false
	var can := TravelPanel.allowed(_fleet.fleet, entry)
	return can.get("fly") == true or can.get("drive") == true


## Opens the choice of a trip for the structure in focus in the bottom panel.
func _open_travel() -> void:
	if _busy or not _can_travel(_focus):
		return
	for node: Control in [_info, _status, _actions, _tabs, _store, _log, _research, _palette, _trip_info,
			_recipes, _workforce_panel, _levels]:
		node.visible = false
	_travel_panel.visible = true
	_travel_panel.open(_fleet, _focus)
	_view.show_preview([], false)


func _close_travel() -> void:
	_travel_panel.visible = false
	_set_mode(_mode)


## Opens the system map to pick the body of a trip.
func _open_map_pick(land: bool) -> void:
	if _map != null:
		return
	_picking_land = land
	_map = MapScreen.new()
	var account := Services.session.account
	_map.setup(_model.system_id, account.home_body_id if account != null else "")
	_map.pick = MapScreen.PICK_LAND if land else MapScreen.PICK_ORBIT
	_map.fleet = _fleet
	_map.closed.connect(_close_map)
	_map.body_picked.connect(_on_body_picked)
	add_child(_map)
	_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED


func _on_body_picked(body_id: String) -> void:
	_close_map()
	if _picking_land:
		_open_site(TravelSiteScreen.MODE_LAND, body_id)
		return
	var body_name := _fleet.body_name(body_id)
	if body_name.is_empty():
		var body := await Services.api.get_json("/v2/bodies/" + body_id.uri_encode())
		body_name = Wire.as_string(body.data.get("name")) if body.is_ok() else tr("FLEET_UNKNOWN_PLACE")
	_travel_panel.show_orbit(body_id, body_name)


func _on_drive_requested() -> void:
	_open_site(TravelSiteScreen.MODE_DRIVE, _model.body_id)


## The surface of a body over the colony, to choose where the structure in focus lands or stops.
func _open_site(mode: String, body_id: String) -> void:
	if _site != null:
		return
	_site = TravelSiteScreen.new()
	_site.setup(_focus, mode, body_id, _fleet)
	_site.closed.connect(_close_site)
	_site.started.connect(_on_travel_started)
	add_child(_site)
	_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED


func _close_site() -> void:
	if _site == null:
		return
	_site.queue_free()
	_site = null
	if not _model.detached:
		_viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE


## A trip started: the fleet learns its motion at once (the event follows), the choice closes.
func _on_travel_started(details: Dictionary) -> void:
	_close_site()
	_close_travel()
	_fleet.fleet.apply_details(details)
	var entry := _fleet.fleet.find(Wire.as_int(details.get("structureId")))
	if entry != null and entry.motion != null:
		_show_notice(tr("TRAVEL_NOTICE_STARTED").format({"name": entry.name,
			"duration": TimeFormat.duration(entry.motion.remaining_ms(Services.clock.now_ms()))}), AppTheme.COLOR_OK)
	_fleet.changed.emit()


## Arrivals and stopped trips of own structures as a notice.
func _on_travel_event(event: SseEvent) -> void:
	if event.type != "travel.arrived" and event.type != "travel.blocked":
		return
	var data := Wire.parse_object(event.data)
	var entry := _fleet.fleet.find(Wire.as_int(data.get("structureId")))
	var who := entry.name if entry != null else tr("FLEET_UNKNOWN_PLACE")
	if event.type == "travel.arrived":
		_show_notice(tr("TRAVEL_NOTICE_ARRIVED").format({"name": who}), AppTheme.COLOR_OK)
		return
	var reason := ApiError.new()
	reason.code = Wire.as_string(data.get("reason"))
	var anchor := Wire.as_dict(data.get("anchor"))
	var body := _fleet.body_name(Wire.as_string(anchor.get("bodyId")))
	_show_notice(tr("TRAVEL_NOTICE_BLOCKED").format({"name": who, "reason": ErrorText.describe(reason, self),
		"body": body if not body.is_empty() else tr("FLEET_UNKNOWN_PLACE")}), AppTheme.COLOR_DANGER)


func _show_notice(text: String, color: Color) -> void:
	_notice.text = text
	_notice.add_theme_color_override("font_color", color)
	_notice.visible = true
	_notice_left = NOTICE_SECONDS


## Where a structure is, for the top bar of one without ground.
func _place_line(structure_id: int) -> String:
	var entry := _fleet.fleet.find(structure_id)
	if entry == null:
		return _model.body_name
	return FleetPanel.status_text(_fleet, entry, Services.clock.now_ms(), self)


## The trip of a structure for its details; "" when it rests.
func _trip_line(structure_id: int) -> String:
	var entry := _fleet.fleet.find(structure_id)
	if entry == null or entry.motion == null or not entry.is_moving(Services.clock.now_ms()):
		return ""
	return FleetPanel.status_text(_fleet, entry, Services.clock.now_ms(), self)


## Opens the system map over the colony; the colony stops drawing while it is covered.
func _open_map() -> void:
	if _map != null:
		return
	_map = MapScreen.new()
	var account := Services.session.account
	_map.setup(_model.system_id, account.home_body_id if account != null else "")
	_map.fleet = _fleet
	_map.closed.connect(_close_map)
	add_child(_map)
	_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED


func _close_map() -> void:
	if _map == null:
		return
	_map.queue_free()
	_map = null
	if not _model.detached:
		_viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE


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
	# The home structure is tapped on its active level, a guest on its lowest one.
	var cell: Variant = _view.cell_on_level(position_in_container * _scale(), _level) if _uses_levels() \
		else _view.cell_at(position_in_container * _scale(), _view.floor_height(_focus))
	if cell != null and _cell != null and (cell as Vector3i) == (_cell as Vector3i) and _mode == Mode.VIEW:
		_select(null)
		return
	_select(cell)
