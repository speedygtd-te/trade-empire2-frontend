class_name ColonyScreen
extends Control
## The Base tab of the MainShell: the colony in 3D, seen from outside, and its structures opened
## for inspecting and building.
##
## Outside, the head names the body the player is on; a tap on it lists the player's places
## (PlacePicker) and switches to another one. The surface shows the structures closed
## (StructureLook). A tap on one puts a card over it (WorldCard) with its name and "Enter
## structure" ("Go there" for a neighbour, which this screen only shows); a double tap enters it
## at once; a tap beside it clears the card.
##
## Inside ("structure mode") the shut hulls give way to the modules on their floors, the head
## names the structure (a tap opens StructureDetails: production, workers, log, research — over
## everything) and its "×" leaves it. The structure's own navigation replaces the shell's at the
## bottom: Inspect, Build, Inventory. Inspect: a tap on a field puts a card over it with what is
## there, its ground (terrain, deposits at that level, the air for collectors), what an extracting
## module yields there (ExtractionYield) and what can be done (recipe, staff, extend a shaft,
## upgrade a telescope — level, range, countdown and cost from `/v2/structures/{id}/telescopes` —,
## two-step removal); a tap beside it
## or on the same field again clears it. Build: the palette at the bottom; building is two taps —
## choose the field (an extracting module says what it would yield there), then confirm.
## Inventory: the store.
##
## Guests (vessels docked on the home structure's dock hulls) are structures of their own: a tap
## on one gives its own card, entering opens only it. On the home structure a new hull on a dock
## founds a guest; on an open guest a hull goes next to or on top of it. A guest is built from the
## home structure's store (contract), which the palette shows.
##
## Paths (PathAccess, draft.29): in Build the active level of the home structure shows its
## corridors (reached faintly cyan, cut off amber), the entrances (arrows) and the modules without
## a corridor (red frame); a chosen module marks every free INDOOR hull cyan, red or amber (level
## not connected). Placing, removing a hull or a shaft and hull shapes are refused in the preview
## when they would leave a module without a corridor, cut modules or levels off or close the last
## entrance. The state shown is the server's `access` from the layout header; the what-ifs are
## reckoned here. Inspect names a module without a corridor in red.
##
## Gestures: drag pans, pinch or mouse wheel zooms, a tap selects.
##
## Hull shapes (like V1, without circles): under a chosen hull the palette switches between Single
## (a tap, then Build), Rectangle and Square. With a shape one finger (the left mouse button) drags
## the shape from a start cell on the active level, two fingers (right/middle button, wheel) move
## the camera. The cells show live (HullShapes): own cells are ignored, cells of a structure this
## client only learns about from the server (another player's) block the shape, cells where a hull
## cannot stand or that cannot reach the structure are skipped (red); a badge above-left of the
## finger counts the new hulls. Build sends them in one atomic batch, outward from the structure.
## Only on the home structure: a guest keeps its own stacking on the docks.
##
## Levels: while the home structure is open, a level selector at the right edge (Up / "Level 2" /
## Down, with the environment of the level) chooses the active level: taps, building and the
## inspection work on it, the levels above it are hidden, and below the ground the view cuts the
## surface away (ColonyView.cutaway). Staircases and elevators form shafts between levels: they
## take the hull above as their landing, extend by a floor, are removed as a whole and offer a
## jump to their other end. A guest keeps its own stacking (DockRules.target_cell).
##
## The screen shows one own structure (`start_structure`, else the home colony) with the other own
## structures on the same body drawn next to it. A structure chosen elsewhere (`show_structure`)
## is selected here when it is on screen; otherwise the shell is asked for a new screen
## (`switch_requested`). A structure under way has no ground: it shows as panels only (its trip
## and its inventory) with the shell's navigation; its details open from the head. A structure
## resting in orbit is drawn without ground and built like any other (draft.38: build batches go to
## `POST /v2/structures/{id}/ops`, ColonyModel.send_ops). Enterprise structures (draft.38) build
## from the enterprise inventory with MANAGE_TREASURY while the flagship stands; otherwise the
## palette names the reason.
## Trips are planned in the Fleet tab (`travel_requested`). Standing alone (review scenes) the
## screen keeps its own fleet model and puts its layers over itself.

## The player wants to see another own structure.
signal switch_requested(structure_id: int)
## The screen entered (true) or left (false) a structure: its own navigation replaces the shell's.
signal structure_mode_changed(on: bool)
## The player wants to plan a trip for a structure (the Fleet tab does that).
signal travel_requested(structure_id: int)

enum Mode { VIEW, BUILD, STORE, TRIP }

## Text keys and icons of the structure's navigation (Inspect, Build, Inventory).
const STRUCTURE_NAV_KEYS: Array[String] = ["STRUCTURE_NAV_INSPECT", "STRUCTURE_NAV_BUILD", "STRUCTURE_NAV_INVENTORY"]
const STRUCTURE_NAV_ICONS: Array[String] = [
	"res://game/ui/icons/inspect.svg", "res://game/ui/icons/build.svg", "res://game/ui/icons/inventory.svg",
]
## Pointer travel (canvas px) below which a press counts as a tap, not a drag.
const TAP_SLOP := 18.0
## Two taps on the same structure within this time (ms) enter it.
const DOUBLE_TAP_MS := 400
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
## How long a notice stays (seconds).
const NOTICE_SECONDS := 12.0
## How many recipes the yield line of an extracting module names at most when none is set.
const YIELD_LINE_MAX := 3
## Below this share of the needed staff the staffing shows red (amber up to full).
const STAFF_LOW := 0.7
const LEVEL_UP_ICON := preload("res://game/ui/icons/level_up.svg")
const LEVEL_DOWN_ICON := preload("res://game/ui/icons/level_down.svg")
const SHAFT_UP_ICON := preload("res://game/ui/icons/shaft_up.svg")
const SHAFT_DOWN_ICON := preload("res://game/ui/icons/shaft_down.svg")
## Deposits below this richness (percent) count as traces: the inspect card only counts them.
const DEPOSIT_TRACE := 10

## The structure to show when the screen opens; 0 for the home colony. Set before adding it.
var start_structure := 0
## The player's structures, shared with the other tabs (set before adding); null: the screen
## keeps its own.
var fleet: FleetModel = null

## The structure on screen; its guests and neighbours hang below it.
var _model: ColonyModel
## The structure selected or open: the home structure or one of its guests (or a neighbour,
## selected only).
var _focus: ColonyModel
var _view: ColonyView
var _container: SubViewportContainer
var _viewport: SubViewport

## The head: the body outside, the structure inside (tappable), "×" inside.
var _top: PanelContainer
var _header: LayerHeader
var _close_x: Button
## The card over the selected structure outside, and its parts.
var _card: WorldCard
var _card_name: Label
var _card_line: Label
var _card_button: Button
## The card over the inspected field inside; it holds _info, _status and _actions in Inspect.
var _inspect: WorldCard
## The structure's navigation at the bottom while one is open.
var _structure_nav: BottomNav
var _info: Label
## The ground of the inspected field: terrain, deposits, the air for collectors (muted, below _info).
var _ground: Label
## The staffing of the inspected module: "Staff" and "28 of 28" coloured by how full it is.
var _staff_row: HBoxContainer
var _staff_value: Label
## A telescope in Inspect: its level and range (emerald while it sees, amber otherwise, with the
## running upgrade), and below, muted, the next level with its cost or why it cannot be upgraded.
var _scope: Label
var _scope_next: Label
## Why the telescope cannot be upgraded now (red when the store lacks the cost).
var _scope_block: Label
var _status: Label
var _primary: Button
var _secondary: Button
var _palette: BuildPalette
var _store: StorePanel
var _recipes: RecipePanel
## Opens the staffing of the inspected module's type (in the structure details).
var _staff: Button
var _actions: HFlowContainer
var _loading: SplashScreen
## The bottom panel: notices, the palette, the inventory, the recipes, a detached structure's tabs.
var _bottom: PanelContainer
var _rows: VBoxContainer
## How far the colony is shifted up for the head and the bottom (canvas px): it sits in the
## middle of the room between them.
var _applied_shift := 0.0
## Whether the colony has been placed once; from then on it follows the bars' heights.
var _placed := false
## Whether the shell lets the 3D view draw (Base shown, nothing over it).
var _rendering := true
## Whether a structure is open with its own navigation (sent as structure_mode_changed).
var _structure_mode := false
## The tabs of a structure without ground: Trip and Inventory.
var _tabs: TabStrip
## The player's structures and their trips.
var _fleet: FleetModel
## The trip of a structure without ground.
var _trip_info: TravelInfoPanel
## The details over everything while open; the place picker while open.
var _details: StructureDetails = null
var _places: PlacePicker = null
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
## A short message over the bottom (a trip started, arrived or was stopped).
var _notice: Label
var _notice_left := 0.0

## Whether the structure is open for building and editing; closed it shows from outside.
var _opened := false
## Whether the closed structure is selected (its card shows).
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
## Whether this device may use the top detail tier at all (DetailGovernor.device_allows_ultra).
var _ultra_device := false
## When the last tap on a structure outside came (ms), for the double tap.
var _last_tap_ms := 0

## How the hull tool places hulls (HullShapes.Shape): one per tap, or a dragged shape.
var _shape: HullShapes.Shape = HullShapes.Shape.SINGLE
## Corners of the marked shape (absolute cells on the active level); null while none is marked.
var _shape_start: Variant = null
var _shape_end: Variant = null
## Whether one finger (or the left mouse button) draws the shape right now.
var _shape_dragging := false
## The shape before the drag that runs now: a second finger cancels the drag and brings it back.
var _shape_before: Array = []
## What the marked shape would do; null while none is marked.
var _shape_plan: HullShapes.Plan = null
## Whether shape cells and the badge are on screen.
var _shape_shown := false
## With a staircase or elevator chosen: why fields are red ("" when none is).
var _shaft_hint := ""
## What the paths said about the last placement checked (_verdict); null when they had no say.
var _path_check: PathAccess.Check = null
## What the paths layer shows now (to skip redrawing the same).
var _paths_key := ""
## A module without a corridor in Inspect: says so in red.
var _path_note: Label
## The count at the shape's end cell.
var _shape_badge: ShapeBadge
## Absolute cells the server refused because of a structure this client cannot see (another
## player's: FOREIGN_NEIGHBOR, or taken): they block shapes until the structure is left.
var _foreign: Dictionary = {}

var _touches: Dictionary = {}
var _press_position := Vector2.ZERO
var _press_travel := 0.0
var _mouse_down := false
## The right or middle mouse button is down: dragging pans in every tool.
var _pan_down := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_model = ColonyModel.new()
	_model.name = "ColonyModel"
	add_child(_model)
	_focus = _model
	_fleet = fleet
	if _fleet == null:
		_fleet = FleetModel.new()
		_fleet.name = "Fleet"
		add_child(_fleet)
	_fleet.changed.connect(_on_fleet_changed)
	_fleet.probes.reveal_changed.connect(_on_reveal_changed)
	_fleet.probes.arrived.connect(_on_probe_arrived)
	_fleet.probes.changed.connect(_show_wrecks)
	_build_world()
	# Stop sites the routes hold on this body (RouteStopLayer).
	_stops = RouteStopLayer.new()
	_stops.setup(_view, _fleet.routes)
	_view.add_child(_stops)
	_build_overlay()
	_model.layout_changed.connect(_refresh)
	_view.origin_moved.connect(_refresh)
	_model.guests_changed.connect(_on_guests_changed)
	_model.inventory_changed.connect(_on_inventory_changed)
	_model.production_changed.connect(_on_production_changed)
	_model.deposits_loaded.connect(_refresh)
	_model.telescopes_changed.connect(_refresh)
	_model.ready_to_show.connect(_on_ready_to_show)
	_model.structures_founded.connect(_on_structures_founded)
	_model.load_failed.connect(_on_load_failed)
	Services.events.event_received.connect(_on_travel_event)
	if Services.definitions == null:
		Services.definitions_loaded.connect(_on_definitions_loaded, CONNECT_ONE_SHOT)
	else:
		_model.load_structure(start_structure)
	_set_mode(Mode.VIEW)


func _process(delta: float) -> void:
	if _model.structure_id != 0 and _rendering and not _model.detached:
		# The top tier needs the player's permission (profile) besides the device, and the
		# downloaded package of high-detail models (HdPackageService).
		if _detail.allow_ultra(_ultra_device and AppSettings.high_detail_models()
				and Services.hd_package.is_ready()):
			_view.apply_detail(_detail.tier)
		_detail.add_frame(delta * 1000.0, _frame_work_ms())
		var now_ticks := Time.get_ticks_msec()
		if _detail.evaluate(now_ticks):
			_view.apply_detail(_detail.tier)
			_save_detail()
		# The slowest tier holds 30 fps, lifted now and then for a measuring window.
		_detail.tick(now_ticks)
		if Engine.max_fps != _detail.fps_cap():
			Engine.max_fps = _detail.fps_cap()
			_save_detail()
	_sun_left -= delta
	if _sun_left <= 0.0 and _model.structure_id != 0:
		_sun_left = SUN_SECONDS
		_update_sun()
	if _notice_left > 0.0:
		_notice_left -= delta
		if _notice_left <= 0.0:
			_notice.visible = false
			_update_layout()
	_place_cards()
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


## Back (the layers over the screen belong to the shell's stack): close the recipes, clear the
## marked hull shape, clear the inspected field, leave the open structure, clear the selected
## structure. False when nothing was left to close.
func handle_back() -> bool:
	if _recipes.visible:
		_close_recipes()
	elif _opened and _shape_start != null:
		_clear_shape()
	elif _opened and _cell != null:
		_select(null)
	elif _opened and not _model.detached:
		_close_structure()
	elif _structure_selected:
		_select_structure(false)
	else:
		return false
	return true


## Whether the 3D view may draw (the shell: Base shown and nothing over it).
func set_rendering(on: bool) -> void:
	_rendering = on
	_apply_rendering()


func is_rendering() -> bool:
	return _viewport != null and _viewport.render_target_update_mode != SubViewport.UPDATE_DISABLED


func _apply_rendering() -> void:
	if _viewport == null:
		return
	var draw := _rendering and not _model.detached
	_viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE if draw else SubViewport.UPDATE_DISABLED


## Whether a structure is open with its own navigation.
func in_structure_mode() -> bool:
	return _structure_mode


## Centres the structure in focus again in the room between the head and the bottom.
func recentre() -> void:
	if _model.structure_id == 0 or _model.detached:
		return
	_view.look_at_cell(_focus.centre_cell())
	_applied_shift = 0.0
	_follow_bars()


## The structure selected or open here (the one on screen while none is); 0 before loading.
func current_structure() -> int:
	if _focus != null and _focus.structure_id != 0:
		return _focus.structure_id
	return _model.structure_id if _model != null else start_structure


## The star system of the structure on screen; "" before loading or while under way.
func system_id() -> String:
	return _model.system_id if _model != null else ""


## The body the screen stands on; "" before loading or while under way.
func body_id() -> String:
	return _model.body_id if _model != null else ""


## The measured detail tier of the 3D view (DetailGovernor.Tier).
func detail_tier() -> int:
	return _detail.tier


## Shows a structure chosen elsewhere: one on screen here (a guest, the home structure) is
## selected; anything else asks the shell for a new screen.
func show_structure(structure_id: int) -> void:
	if structure_id == 0 or structure_id == current_structure():
		return
	var here := _model.structure(structure_id)
	if here != null and not here.is_neighbour() and not _model.detached:
		if _opened:
			_close_structure()
		_focus = here
		_select_structure(true)
		return
	switch_requested.emit(structure_id)


## Opens the structure in focus (the selected one): its modules, its navigation.
func enter_structure() -> void:
	if _model.structure_id == 0 or _opened:
		return
	if _focus.is_neighbour():
		switch_requested.emit(_focus.structure_id)
		return
	_open_structure(Mode.VIEW)


## Opens the details of the structure in focus over everything.
func open_details(tab: StructureDetails.Tab = StructureDetails.Tab.PRODUCTION) -> StructureDetails:
	if _model.structure_id == 0:
		return null
	if _layer_open(_details):
		_details.show_tab(tab)
		return _details
	_details = StructureDetails.new()
	var place := _place_line(_focus.structure_id) if _model.detached else _model.body_name
	if _focus.is_guest():
		place = tr("COLONY_DOCKED_AT").format({"host": _focus.host.structure_name})
	_details.setup(_focus, _model, not _focus.is_guest() and not _model.detached, place, tab)
	ScreenStack.push_onto(self, _details)
	return _details


## The details while open; null otherwise.
func details() -> StructureDetails:
	return _details if _layer_open(_details) else null


## Opens the list of the player's places (bodies with own structures).
func open_places() -> PlacePicker:
	if _layer_open(_places):
		return _places
	_places = PlacePicker.new()
	_places.setup(_fleet, _model.body_id)
	_places.chosen.connect(_on_place_chosen)
	ScreenStack.push_onto(self, _places)
	return _places


func _on_place_chosen(chosen_body: String, structure_id: int) -> void:
	ScreenStack.close_layer(_places)
	_places = null
	if chosen_body == _model.body_id:
		recentre()
		return
	switch_requested.emit(structure_id)


func _layer_open(layer: Variant) -> bool:
	return ScreenStack.is_open(layer)


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
	var memory: int = OS.get_memory_info().get("physical", 0)
	_ultra_device = DetailGovernor.device_allows_ultra(OS.has_feature("mobile"), memory,
		OS.get_processor_count(), RenderingServer.get_video_adapter_name())
	RenderingServer.viewport_set_measure_render_time(_viewport.get_viewport_rid(), true)


## The time CPU and GPU spent rendering the 3D view in the last frame (ms); -1 where the renderer
## does not measure the GPU (vsync hides that time in the frame time).
func _frame_work_ms() -> float:
	var rid := _viewport.get_viewport_rid()
	var gpu := RenderingServer.viewport_get_measured_render_time_gpu(rid)
	if gpu <= 0.0:
		return -1.0
	return RenderingServer.viewport_get_measured_render_time_cpu(rid) + gpu


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
	# The cards stand over the colony, under the head and the bottom.
	_card = WorldCard.new()
	add_child(_card)
	_card_name = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	_card_name.autowrap_mode = TextServer.AUTOWRAP_OFF
	_card_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_card.content().add_child(_card_name)
	_card_line = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_card.content().add_child(_card_line)
	_card_button = Ui.primary_button("COLONY_ENTER")
	_card_button.pressed.connect(enter_structure)
	_card.content().add_child(_card_button)
	_inspect = WorldCard.new()
	add_child(_inspect)
	_shape_badge = ShapeBadge.new()
	add_child(_shape_badge)

	var frame := VBoxContainer.new()
	frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	frame.add_theme_constant_override("separation", 0)
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(frame)
	var margin := SafeAreaMargin.new()
	margin.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_child(margin)
	var column := Ui.column(0)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(column)

	# Top: the body outside, the structure inside; a tap on the name opens the places or the
	# structure's details, "×" leaves the structure.
	_top = PanelContainer.new()
	column.add_child(_top)
	_header = LayerHeader.new()
	_header.show_back(false)
	_header.set_title_tappable(true)
	_header.title_pressed.connect(_on_title_pressed)
	_top.add_child(_header)
	_close_x = LayerHeader.close_button()
	_close_x.visible = false
	_close_x.pressed.connect(_close_structure)
	_header.add_action(_close_x)

	# Middle: the colony, and the level selector at the right edge.
	var middle := HBoxContainer.new()
	middle.size_flags_vertical = Control.SIZE_EXPAND_FILL
	middle.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(middle)
	var filler := Control.new()
	filler.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	filler.mouse_filter = Control.MOUSE_FILTER_IGNORE
	middle.add_child(filler)
	var right := Ui.column(0)
	right.size_flags_horizontal = Control.SIZE_SHRINK_END
	right.mouse_filter = Control.MOUSE_FILTER_IGNORE
	middle.add_child(right)
	right.add_child(Ui.spacer(12))
	# The level selector: an arrow up, the level number, an arrow down (narrow, at the right edge).
	_levels = PanelContainer.new()
	_levels.visible = false
	var level_style := StyleBoxFlat.new()
	level_style.bg_color = AppTheme.COLOR_PANEL
	level_style.border_color = AppTheme.COLOR_BORDER
	level_style.set_border_width_all(2)
	level_style.set_corner_radius_all(12)
	level_style.set_content_margin_all(4)
	_levels.add_theme_stylebox_override("panel", level_style)
	right.add_child(_levels)
	var level_box := Ui.column(4)
	_levels.add_child(level_box)
	_level_up = Ui.icon_button(LEVEL_UP_ICON, "LEVEL_UP")
	_level_up.pressed.connect(_step_level.bind(1))
	level_box.add_child(_level_up)
	_level_name = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	_level_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_level_name.autowrap_mode = TextServer.AUTOWRAP_OFF
	level_box.add_child(_level_name)
	# The environment stays known to the code (palette hints) but is not shown here any more.
	_level_env = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_level_env.visible = false
	level_box.add_child(_level_env)
	_level_down = Ui.icon_button(LEVEL_DOWN_ICON, "LEVEL_DOWN")
	_level_down.pressed.connect(_step_level.bind(-1))
	level_box.add_child(_level_down)
	# With a shaft selected: straight to its other end.
	_jump = Ui.icon_button(SHAFT_UP_ICON, "LEVEL_GO_UP")
	_jump.pressed.connect(_on_jump)
	_jump.visible = false
	level_box.add_child(_jump)

	# Bottom: notices, a detached structure's tabs, the inventory, the recipes, the palette.
	_bottom = PanelContainer.new()
	column.add_child(_bottom)
	_rows = Ui.column(16)
	_bottom.add_child(_rows)
	_notice = Ui.dynamic_label()
	_notice.visible = false
	_rows.add_child(_notice)
	_tabs = TabStrip.new()
	_tabs.add_tab("TRAVEL_TAB_TRIP")
	_tabs.add_tab("STRUCTURE_NAV_INVENTORY")
	_tabs.tab_selected.connect(func(index: int) -> void: _set_mode(Mode.TRIP if index == 0 else Mode.STORE))
	_rows.add_child(_tabs)

	_store = StorePanel.new()
	_store.setup(_model)
	_rows.add_child(_store)
	_recipes = RecipePanel.new()
	_recipes.visible = false
	_recipes.chosen.connect(_on_recipe_chosen)
	_recipes.closed.connect(_close_recipes)
	_rows.add_child(_recipes)
	_trip_info = TravelInfoPanel.new()
	_trip_info.visible = false
	_trip_info.travel_requested.connect(func() -> void: travel_requested.emit(_model.structure_id))
	_rows.add_child(_trip_info)

	_palette = BuildPalette.new()
	_palette.chosen.connect(_choose_tool)
	_palette.shape_chosen.connect(_set_shape)
	_rows.add_child(_palette)

	# Info, status and actions: in the bottom while building, on the inspect card in Inspect.
	_info = Ui.dynamic_label()
	_rows.add_child(_info)
	_path_note = Ui.dynamic_label()
	_path_note.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	_path_note.text = tr("COLONY_PATH_NOT_CONNECTED")
	_path_note.visible = false
	_rows.add_child(_path_note)
	_staff_row = HBoxContainer.new()
	_staff_row.add_theme_constant_override("separation", 12)
	_staff_row.visible = false
	_rows.add_child(_staff_row)
	var staff_caption := Ui.label("COLONY_STAFF", AppTheme.VARIATION_MUTED)
	staff_caption.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	staff_caption.autowrap_mode = TextServer.AUTOWRAP_OFF
	_staff_row.add_child(staff_caption)
	_staff_value = Ui.dynamic_label()
	_staff_value.autowrap_mode = TextServer.AUTOWRAP_OFF
	_staff_row.add_child(_staff_value)
	_scope = Ui.dynamic_label()
	_scope.visible = false
	_rows.add_child(_scope)
	_scope_next = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_scope_next.visible = false
	_rows.add_child(_scope_next)
	_scope_block = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_scope_block.visible = false
	_rows.add_child(_scope_block)
	_ground = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_ground.visible = false
	_rows.add_child(_ground)
	_status = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_rows.add_child(_status)
	_actions = HFlowContainer.new()
	_actions.add_theme_constant_override("h_separation", 16)
	_actions.add_theme_constant_override("v_separation", 12)
	_rows.add_child(_actions)
	_staff = Ui.secondary_button("WORKFORCE_OPEN")
	_staff.pressed.connect(_on_staff)
	_staff.visible = false
	_actions.add_child(_staff)
	_secondary = Ui.secondary_button("COLONY_CANCEL")
	_secondary.pressed.connect(_on_secondary)
	_actions.add_child(_secondary)
	_primary = Ui.primary_button("COLONY_BUILD_HERE")
	_primary.pressed.connect(_on_primary)
	_actions.add_child(_primary)

	# The structure's own navigation, over the whole width at the very bottom.
	_structure_nav = BottomNav.new()
	for index: int in STRUCTURE_NAV_KEYS.size():
		_structure_nav.add_entry(STRUCTURE_NAV_KEYS[index], load(STRUCTURE_NAV_ICONS[index]) as Texture2D)
	_structure_nav.tab_pressed.connect(_on_structure_nav)
	_structure_nav.visible = false
	frame.add_child(_structure_nav)

	# The loading view is the boot splash picture, so the start hands over without a jump.
	_loading = SplashScreen.new("COLONY_LOADING")
	add_child(_loading)
	# Deferred: while the bars lay out, their new heights are not final yet.
	for bar: Control in [_top, _bottom, _structure_nav]:
		bar.resized.connect(_follow_bars, CONNECT_DEFERRED)
		bar.visibility_changed.connect(_follow_bars, CONNECT_DEFERRED)
	resized.connect(_follow_bars, CONNECT_DEFERRED)


## The room between the head and whatever covers the bottom (panel or navigation), in this
## screen's coordinates.
func _free_rect() -> Rect2:
	var top := _top.get_global_rect().end.y - global_position.y
	var bottom := size.y
	if _bottom.visible:
		bottom = _bottom.get_global_rect().position.y - global_position.y
	elif _structure_nav.visible:
		bottom = _structure_nav.get_global_rect().position.y - global_position.y
	return Rect2(0.0, top, size.x, maxf(bottom - top, 1.0))


## The head or the bottom changed: the colony moves so that it stays in the middle of the room
## between them.
func _follow_bars() -> void:
	# While a finger draws a shape the ground must not slide away under it; afterwards it follows.
	if not _placed or _model.detached or not is_visible_in_tree() or _shape_dragging:
		return
	var room := _free_rect()
	var wanted := (size.y - room.end.y - room.position.y) * 0.5
	if is_equal_approx(wanted, _applied_shift):
		return
	_view.pan(Vector2(0.0, -(wanted - _applied_shift) * _scale()), Vector2(_viewport.size))
	_applied_shift = wanted


## Keeps the cards over their structure or field.
func _place_cards() -> void:
	if _model.structure_id == 0 or _model.detached:
		return
	if _card.visible:
		_card.place(_view.roof_point(_focus) / _scale(), _free_rect())
	if _shape_badge.visible and _shape_end != null:
		# Never under the level selector at the right edge.
		var badge_room := _free_rect()
		if _levels.visible:
			var left_of := _levels.global_position.x - global_position.x
			badge_room.size.x = maxf(left_of - badge_room.position.x, float(AppTheme.TOUCH_MIN) * 2.0)
		_shape_badge.place(_view.cell_point(_shape_end as Vector3i) / _scale(), badge_room)
	if _inspect.visible and _cell != null:
		var anchor := _view.cell_point(_target() as Vector3i, _focus.is_guest()) / _scale()
		var room := _free_rect()
		_inspect.place(anchor, room)
		# The level selector stands over the colony at the right edge: a card that would slide
		# under it keeps to the room left of it.
		if _levels.visible:
			var selector := Rect2(_levels.global_position - global_position, _levels.size)
			if _inspect.get_rect().intersects(selector):
				room.size.x = maxf(selector.position.x - room.position.x, float(AppTheme.TOUCH_MIN) * 4.0)
				_inspect.place(anchor, room)


# --- data -----------------------------------------------------------------------------------

func _on_definitions_loaded() -> void:
	_model.load_structure(start_structure)


func _on_ready_to_show() -> void:
	_loading.visible = false
	_fleet.reload()
	if _model.asked_guest != 0 and _model.structure(_model.asked_guest) != null:
		_focus = _model.structure(_model.asked_guest)
		if not _model.detached:
			_select_structure(true)
	_show_names()
	if _model.detached:
		# No ground: the structure shows as panels only, the 3D view stops drawing.
		_container.visible = false
		_apply_rendering()
		_trip_info.setup(_fleet, _model.structure_id)
		_open_structure(Mode.TRIP)
		return
	_view.set_fleet(_fleet.fleet)
	_view.look_at_cell(_model.centre_cell())
	_update_sun()
	# Foreign structures probes have seen here and the own probes lying here (draft.31); nothing
	# on an older server.
	if not _model.in_orbit:
		_fleet.probes.load_reveal(_model.body_id)
	_show_wrecks()
	# The head and the bottom cover parts of the view: shift the colony into the room between
	# them (and from then on with every change of their heights).
	await get_tree().process_frame
	_applied_shift = 0.0
	_placed = true
	_follow_bars()
	_refresh()


## The explored areas of this body arrived or changed: the ghosts of seen structures follow.
func _on_reveal_changed(changed_body: String) -> void:
	if changed_body == _model.body_id and not _model.detached and not _model.in_orbit:
		_view.set_reveal(_fleet.probes.reveal(changed_body))


## "Wreck of your probe (landed 3h 5m ago)." for the probes that landed on a field (oldest first),
## with a new line in front; "" when none did.
func _wreck_text(impacts: Array) -> String:
	if impacts.is_empty():
		return ""
	var newest := impacts[impacts.size() - 1] as Probes.Impact
	var account := Services.session.account
	var own := account != null and newest.owner_id == account.player_id
	var ago := TimeFormat.duration(maxi(Services.clock.now_ms() - newest.at, 0))
	if impacts.size() > 1:
		return "\n" + tr("PROBE_WRECKS").format({"count": impacts.size(), "ago": ago})
	return "\n" + tr("PROBE_WRECK_OWN" if own else "PROBE_WRECK_FOREIGN").format({"ago": ago})


## The own probes that landed on this body lie there as wrecks (the probe list changed).
func _show_wrecks() -> void:
	if _model.structure_id == 0 or _model.detached or _model.in_orbit or _model.body_id.is_empty():
		return
	_view.set_landed_probes(_fleet.probes.list.landed_on(_model.body_id, Services.clock.now_ms()))


## A probe arrived: say so; on this body the newly explored ground loads.
func _on_probe_arrived(probe: Probes.Probe, sightings: int) -> void:
	var body := _fleet.body_name(probe.body_id)
	if body.is_empty():
		body = _model.body_name if probe.body_id == _model.body_id else tr("FLEET_UNKNOWN_PLACE")
	var key := "PROBE_NOTICE_ARRIVED_SEEN" if sightings > 0 else "PROBE_NOTICE_ARRIVED"
	show_notice(tr(key).format({"body": body, "count": sightings}), AppTheme.COLOR_OK)
	if probe.body_id == _model.body_id and not _model.detached and not _model.in_orbit:
		_model.reset_surface()


## Sets the sun over the cell in the middle of the view from the body's orbit and rotation at
## the current game time; without orbit data it stands still. Its light has the colour of this
## star and this air.
func _update_sun() -> void:
	if _model.detached:
		return
	if _model.sun == null or _model.in_orbit:
		_view.set_sun(FIXED_SUN_ELEVATION, FIXED_SUN_AZIMUTH, _model.star_kelvin, _model.atmosphere_density,
		_model.star_brightness(), _model.star_size())
		return
	var cell := _view.focus_cell()
	var angles := SunPosition.cell_angles(cell.x, cell.y, _model.size_x)
	var sky := _model.sun.sky_at(angles.x, angles.y, Services.clock.now_ms() / 1000.0)
	_view.set_sun(sky.elevation, sky.azimuth, _model.star_kelvin, _model.atmosphere_density,
		_model.star_brightness(), _model.star_size())


func _on_load_failed(error: ApiError) -> void:
	_loading.clear_content()
	_loading.set_text("")
	var column := Ui.column(24)
	column.add_child(Ui.label("COLONY_LOAD_FAILED", AppTheme.VARIATION_HEADING))
	var detail := Ui.dynamic_label(AppTheme.VARIATION_ERROR)
	detail.text = ErrorText.describe(error, self)
	column.add_child(detail)
	var retry := Ui.primary_button("COMMON_RETRY")
	retry.pressed.connect(_on_retry_load)
	column.add_child(retry)
	_loading.show_content(column)
	_loading.visible = true


func _on_retry_load() -> void:
	_loading.clear_content()
	_loading.set_text("COLONY_LOADING")
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
	if _focus != _model and not _model.guests.has(_focus.structure_id) and not _focus.is_neighbour():
		var was_open := _opened
		_focus = _model
		if was_open:
			_opened = false
			_level = 0
			_view.set_level(0, false)
			_stops.visible = true
			_view.open_structure(0)
			_view.show_preview([], false)
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
	_structure_nav.select(_nav_index(mode))
	_tabs.select(0 if mode == Mode.TRIP else 1)
	var panel_mode := _opened and (mode == Mode.STORE or mode == Mode.TRIP)
	_palette.visible = _opened and mode == Mode.BUILD
	_store.visible = _opened and mode == Mode.STORE
	_trip_info.visible = _opened and mode == Mode.TRIP
	if _trip_info.visible:
		_trip_info.tick()
	_info.visible = _opened and not panel_mode
	_status.visible = _opened and not panel_mode
	_actions.visible = _opened and not panel_mode
	if panel_mode:
		_view.show_preview([], false)
	if _opened and mode == Mode.STORE:
		_store.show_inventory(_focus.inventory)
		_store.show_balance(_focus)
	_tool = ""
	_armed = ""
	_forget_shape()
	_status.text = ""
	_update_levels()
	_fill_palette()
	_refresh()
	_show_names()
	_update_layout()


## Index in the structure's navigation of a mode.
func _nav_index(mode: Mode) -> int:
	match mode:
		Mode.BUILD:
			return 1
		Mode.STORE:
			return 2
	return 0


func _on_structure_nav(index: int) -> void:
	var modes: Array[Mode] = [Mode.VIEW, Mode.BUILD, Mode.STORE]
	var mode := modes[clampi(index, 0, modes.size() - 1)]
	if mode == _mode:
		# The active entry again: start over (no field, no tool).
		_select(null)
	_set_mode(mode)


## Shows and hides the bars and cards for the current state and tells the shell when the
## structure's navigation takes over.
func _update_layout() -> void:
	if _bottom == null:
		return
	var in_structure := _opened and not _model.detached
	_close_x.visible = in_structure
	_structure_nav.visible = in_structure
	_tabs.visible = _opened and _model.detached
	var in_card := in_structure and _mode == Mode.VIEW
	_move_details(in_card)
	_inspect.visible = in_card and _cell != null and not _recipes.visible
	_card.visible = not _opened and _structure_selected and not _model.detached
	var details_below := _opened and _mode == Mode.BUILD and not _recipes.visible
	_bottom.visible = _notice.visible or _tabs.visible or _palette.visible or _store.visible \
		or _recipes.visible or _trip_info.visible or details_below
	if in_structure != _structure_mode:
		_structure_mode = in_structure
		structure_mode_changed.emit(in_structure)
	_place_cards()


## Puts info, status and actions on the inspect card or into the bottom panel.
func _move_details(on_card: bool) -> void:
	var target: Control = _inspect.content() if on_card else _rows
	if _info.get_parent() == target:
		return
	for node: Control in [_info, _path_note, _staff_row, _scope, _scope_next, _scope_block, _ground, _status, _actions]:
		node.reparent(target, false)


## The palette offers what the store that builds the open structure holds: its own, or the
## host's for a guest. On the home structure hulls that cannot stand on the active level are left
## out (named in a hint), and modules whose production depends on the level show the change here.
func _fill_palette() -> void:
	var definitions := Services.definitions
	# Enterprise structures (draft.38): built by members with MANAGE_TREASURY from the enterprise
	# inventory while the flagship stands; otherwise the palette names the reason.
	var reason := _focus.build_reason() if _focus != null else ""
	if not reason.is_empty():
		_tool = ""
		_palette.show_blocked(_reason_text(reason))
		_palette.show_shapes(false, _shape, "")
		return
	var supply := _focus.build_inventory() if _focus != null else null
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
	var entries := BuildCatalog.entries(definitions, units, _focus.owner_kind if _focus != null else "player")
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
	# Shapes only on the home structure: a guest keeps its own stacking on the docks.
	_palette.show_shapes(_shapes_offered(), _shape, tr("COLONY_SHAPE_HOME_ONLY") if _focus.is_guest() else "")


## The line saying why the player may not build or manage here (EnterpriseStructures reason).
func _reason_text(reason: String) -> String:
	return tr(EnterpriseStructures.reason_key(reason)).format({
		"right": tr("ENTERPRISE_FLAG_MANAGE_TREASURY") if reason == EnterpriseStructures.NEEDS_TREASURY
			else tr("ENTERPRISE_FLAG_COMMAND_ENTERPRISE_FLEET")})


## A hull on a dock founded structures (draft.38: daughters of the enterprise too): Fleet lists them.
func _on_structures_founded(_ids: Array[int]) -> void:
	show_notice(tr("COLONY_STRUCTURE_FOUNDED"), AppTheme.COLOR_OK)
	if _model.owner_kind == EnterpriseStructures.ENTERPRISE:
		_fleet.reload_enterprise()
	else:
		_fleet.reload()


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
	# Nothing on the neutral level; otherwise just the change.
	if change.is_empty():
		return ""
	return tr("LEVEL_BONUS").format({"change": change})


## Shows or hides the level selector and writes its level and environment.
func _update_levels() -> void:
	if _levels == null:
		return
	# While the recipes fill the bottom the selector would push the navigation off the screen.
	_levels.visible = _uses_levels() and (_mode == Mode.VIEW or _mode == Mode.BUILD) and not _recipes.visible
	if not _levels.visible:
		return
	var bounds := _level_range()
	_level_name.text = str(_level)
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
	_forget_shape()
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
	_forget_shape()
	_status.text = ""
	_fill_palette()
	_refresh()


# --- hull shapes ----------------------------------------------------------------------------

## Whether the hull tool may place shapes here: on the home structure (a guest keeps its own
## stacking on the docks).
func _shapes_offered() -> bool:
	return _opened and _focus == _model and not _model.detached


## Whether a drag marks a hull shape now (instead of panning).
func _shape_active() -> bool:
	return _mode == Mode.BUILD and _tool.begins_with("hull:") and _shape != HullShapes.Shape.SINGLE \
		and _shapes_offered()


## The player switched between Single, Rectangle and Square: the marks start over.
func _set_shape(shape: HullShapes.Shape) -> void:
	_shape = shape
	_forget_shape()
	_status.text = ""
	_select(null)
	_fill_palette()


## Clears the marked shape (no refresh).
func _forget_shape() -> void:
	_shape_start = null
	_shape_end = null
	_shape_dragging = false
	_shape_plan = null


func _clear_shape() -> void:
	_forget_shape()
	_refresh()


## The absolute cell of the active level under a point of the screen; null when the ray misses.
func _shape_cell(position_in_container: Vector2) -> Variant:
	return _view.cell_on_level(position_in_container * _scale(), _level)


## A finger (or the left button) went down: a new shape starts at the cell under it.
func _shape_begin(position_in_container: Vector2) -> void:
	var cell: Variant = _shape_cell(position_in_container)
	if cell == null:
		return
	_shape_before = [_shape_start, _shape_end]
	_shape_start = cell
	_shape_end = cell
	_shape_dragging = true
	_status.text = ""
	_refresh()


## The finger moved: the shape follows to the cell under it.
func _shape_move(position_in_container: Vector2) -> void:
	var cell: Variant = _shape_cell(position_in_container)
	if cell == null or (cell as Vector3i) == (_shape_end as Vector3i):
		return
	_shape_end = cell
	_refresh()


## The finger came up: the shape stays marked with its count and Build.
func _shape_finish() -> void:
	_shape_dragging = false
	_refresh()
	_follow_bars.call_deferred()


## A second finger came: the drag was meant for the camera, the shape before it comes back.
func _shape_cancel() -> void:
	_shape_dragging = false
	_shape_start = _shape_before[0] if _shape_before.size() == 2 else null
	_shape_end = _shape_before[1] if _shape_before.size() == 2 else null
	_refresh()
	_follow_bars.call_deferred()


## The hull units in the store that builds here.
func _hull_units() -> int:
	var supply := _focus.supply().inventory
	var hull_def := Services.definitions.hull(_tool.get_slice(":", 1))
	if supply == null or hull_def == null:
		return 0
	return supply.units(hull_def.item, Services.clock.now_ms())


## Works out what the marked shape would do: own cells ignored, foreign ones blocking, the rest
## placed outward from the structure or skipped.
func _plan_shape() -> HullShapes.Plan:
	var cells := HullShapes.cells(_shape, _shape_start as Vector3i, _shape_end as Vector3i, _model.size_x)
	var guests := _model.guest_layouts()
	var neighbours: Array[StructureLayout] = []
	for structure: ColonyModel in _model.drawn_structures():
		if structure != _model and not guests.has(structure.layout):
			neighbours.append(structure.layout)
	return HullShapes.plan(cells, _model.layout, guests, neighbours, _foreign, _tool.get_slice(":", 1),
		Services.definitions, _model.site())


## With a staircase or elevator chosen: every free hull of the active level marked, cyan where it
## can stand, red where it cannot (no own hull above, a module above, a slot that does not fit).
func _show_shaft_spots() -> void:
	var module_def := Services.definitions.module(_tool.get_slice(":", 1)) if _tool.begins_with("module:") else null
	if module_def == null or not module_def.vertical_access or not _uses_levels():
		return
	var layout := _focus.layout
	var good: Array[Vector3i] = []
	var bad: Array[Vector3i] = []
	# Paths: a shaft on the last entrance would close it.
	var spots := PathAccess.of(layout, Services.definitions).placement_spots(Services.definitions, module_def.key,
		_local_level(layout))
	for local: Vector3i in layout.hull_cells():
		var cell := layout.to_absolute(local)
		if cell.z != _level or layout.module_at(local) != null:
			continue
		var verdict := BuildRules.check_place_module(layout, Services.definitions, module_def.key, local, 0)
		var path := spots.checks.get(local) as PathAccess.Check
		if verdict == BuildRules.Verdict.OK and (path == null or path.ok()):
			good.append(cell)
		else:
			bad.append(cell)
	_shape_shown = true
	_view.show_shape(good, bad, true)
	if good.is_empty() and not bad.is_empty():
		_shaft_hint = tr("LEVEL_SHAFT_SPOTS_NONE")
	elif not bad.is_empty():
		_shaft_hint = tr("LEVEL_SHAFT_SPOTS")


## With any other module for INDOOR hulls chosen: every free INDOOR hull of the active level
## marked (PathAccess.placement_spots), cyan where it can stand, red where the paths forbid it (no
## corridor beside it, it would cut others off or close the last entrance), amber where it waits
## for the level to be connected (a module with staff or inhabitants, W4).
func _show_module_spots() -> void:
	var module_def := Services.definitions.module(_tool.get_slice(":", 1)) if _tool.begins_with("module:") else null
	if module_def == null or module_def.vertical_access or not module_def.positioning.has("INDOOR") or not _uses_levels():
		return
	var layout := _focus.layout
	var spots := PathAccess.of(layout, Services.definitions).placement_spots(Services.definitions, module_def.key,
		_local_level(layout), _rotation)
	var good := _absolute(layout, spots.good)
	var bad := _absolute(layout, spots.bad)
	var waiting := _absolute(layout, spots.waiting)
	_shape_shown = true
	_view.show_shape(good, bad, true, waiting)
	if not waiting.is_empty():
		_shaft_hint = tr("COLONY_PATH_SPOTS_WAITING")
	elif not bad.is_empty():
		_shaft_hint = tr("COLONY_PATH_SPOTS")


## The active level as a local level of `layout`.
func _local_level(layout: StructureLayout) -> int:
	return layout.to_local(Vector3i(0, 0, _level)).z


func _absolute(layout: StructureLayout, cells: Array[Vector3i]) -> Array[Vector3i]:
	var result: Array[Vector3i] = []
	for cell: Vector3i in cells:
		result.append(layout.to_absolute(cell))
	return result


## Whether a hull type takes INDOOR modules (its free hulls are corridors).
func _is_indoor(hull_type: String) -> bool:
	var hull_def := Services.definitions.hull(hull_type)
	return hull_def != null and hull_def.module_positioning == "INDOOR"


## In build mode on the home structure: the corridors of the active level (reached faintly cyan,
## cut off amber; left out while a module's spots are marked on them), the entrances on the ground
## level and the modules without a corridor (red frame). The state is the server's `access` where
## the layout brought one.
func _update_paths() -> void:
	var show := _opened and _mode == Mode.BUILD and _uses_levels() and Services.definitions != null
	if not show:
		if not _paths_key.is_empty():
			_paths_key = ""
			var none: Array[Vector3i] = []
			_view.show_paths(none, none, none, none, none)
		return
	var layout := _focus.layout
	var access := PathAccess.of(layout, Services.definitions)
	var z := _local_level(layout)
	var spots_shown := _tool.begins_with("module:") and not _shape_active()
	var key := "%d|%d|%s|%s" % [access.get_instance_id(), z, spots_shown, _view.origin]
	if key == _paths_key:
		return
	_paths_key = key
	var near: Array[Vector3i] = []
	var cut: Array[Vector3i] = []
	if not spots_shown:
		# The server names no corridors: these are reckoned here.
		var corridors := access.corridors(z)
		var reached: Array[Vector3i] = []
		reached.assign(corridors[0])
		var unreached: Array[Vector3i] = []
		unreached.assign(corridors[1])
		near = _absolute(layout, reached)
		cut = _absolute(layout, unreached)
	var entrances: Array[Vector3i] = []
	var sides: Array[Vector3i] = []
	for cell: Vector3i in access.entrance_cells():
		if cell.z == z:
			entrances.append(layout.to_absolute(cell))
			sides.append(access.open_side(cell))
	var unconnected: Array[Vector3i] = []
	for module_id: int in access.unconnected_modules():
		var placed := layout.module(module_id)
		if placed == null:
			continue
		for cell: Vector3i in placed.cells():
			if cell.z == z:
				unconnected.append(layout.to_absolute(cell))
	_view.show_paths(near, cut, entrances, sides, unconnected)


## Why the active level has no way for staff: it is not connected (or the ground level has no
## entrance). "" when it has, or holds no hulls.
func _level_path_line() -> String:
	if not _uses_levels() or Services.definitions == null:
		return ""
	var layout := _focus.layout
	var access := PathAccess.of(layout, Services.definitions)
	var z := _local_level(layout)
	if not access.levels.has(z) or access.level_connected(z):
		return ""
	return tr("COLONY_PATH_NO_ENTRANCE") if z == access.ground() else tr("BUILD_VERDICT_LEVEL_NOT_CONNECTED")


## What the paths say against a build, as a sentence: how many modules or levels it would cut off.
func _path_text(check: PathAccess.Check, layout: StructureLayout) -> String:
	if check.verdict != BuildRules.Verdict.CUTS_OFF:
		var key: String = BuildRules.Verdict.keys()[check.verdict]
		return tr("BUILD_VERDICT_" + key)
	var parts := PackedStringArray()
	if check.modules.size() == 1:
		parts.append(tr("COLONY_PATH_CUTS_MODULE_ONE"))
	elif check.modules.size() > 1:
		parts.append(tr("COLONY_PATH_CUTS_MODULES").format({"count": check.modules.size()}))
	if check.levels.size() == 1:
		var z := layout.to_absolute(Vector3i(0, 0, check.levels[0])).z
		parts.append(tr("COLONY_PATH_CUTS_LEVEL_ONE").format({"level": _level_text(z)}))
	elif check.levels.size() > 1:
		parts.append(tr("COLONY_PATH_CUTS_LEVELS").format({"count": check.levels.size()}))
	return " ".join(parts) if not parts.is_empty() else tr("BUILD_VERDICT_CUTS_OFF")


func _hide_shape() -> void:
	if not _shape_shown:
		return
	_shape_shown = false
	_view.show_shape([], [])
	_shape_badge.visible = false


## Build with Rectangle or Square: the hint before the first drag; then the cells (new cyan,
## skipped and blocked red), the badge with the count, and what Build would do.
func _refresh_shape() -> void:
	_view.show_preview([], false)
	_view.select_cell(null)
	_primary.text = tr("COLONY_BUILD_HERE")
	if _shape_start == null:
		_hide_shape()
		_info.text = tr("COLONY_SHAPE_HINT").format({"name": _tool_name()})
		_primary.disabled = true
		return
	_shape_plan = _plan_shape()
	var plan := _shape_plan
	var units := _hull_units()
	var count := plan.place.size()
	var ok := plan.buildable(units)
	# Paths: the new hulls together must not close the last entrance (platforms before it).
	var path: PathAccess.Check = null
	if count > 0:
		var locals: Array[Vector3i] = []
		for cell: Vector3i in plan.place:
			locals.append(_model.layout.to_local(cell))
		path = PathAccess.of(_model.layout, Services.definitions).check_place_hulls(locals, _is_indoor(_tool.get_slice(":", 1)))
		ok = ok and path.ok()
	_shape_shown = true
	_view.show_shape(plan.place, plan.bad_cells())
	# The badge: the count, the size, what is skipped, and the store when it runs short.
	var parts := PackedStringArray([tr("COLONY_SHAPE_SIZE").format({"width": plan.extent.x, "height": plan.extent.y})])
	var bad := plan.foreign.size() + plan.skipped.size()
	if bad > 0:
		parts.append(tr("COLONY_SHAPE_SKIPPED_SHORT").format({"count": bad}))
	if count > units:
		parts.append(tr("COLONY_SHAPE_STORE_SHORT").format({"count": units}))
	_shape_badge.show_count(count, " · ".join(parts), ok)
	# Below: what happens, cell group by cell group.
	var lines := PackedStringArray()
	lines.append(tr("COLONY_SHAPE_SUMMARY_ONE" if count == 1 else "COLONY_SHAPE_SUMMARY").format({
		"name": _tool_name(), "count": count, "width": plan.extent.x, "height": plan.extent.y}))
	if not plan.own.is_empty():
		lines.append(tr("COLONY_SHAPE_OWN").format({"count": plan.own.size()}))
	if plan.blocked():
		lines.append(tr("COLONY_SHAPE_FOREIGN"))
	if not plan.skipped.is_empty():
		var reasons := plan.reasons()
		lines.append(tr("COLONY_SHAPE_SKIPPED").format({"count": plan.skipped.size(),
			"reason": _shape_reason_text(plan, reasons[0])}))
	if path != null and not path.ok():
		lines.append(_path_text(path, _model.layout))
	if count == 0 and not plan.blocked():
		lines.append(tr("COLONY_SHAPE_NOTHING"))
	elif count > units:
		lines.append(tr("COLONY_SHAPE_NOT_ENOUGH").format({"count": count, "stock": units}))
	elif _shape_dragging:
		lines.append(tr("COLONY_SHAPE_RELEASE"))
	_info.text = "\n".join(lines)
	_primary.text = tr("COLONY_SHAPE_BUILD_ONE" if count == 1 else "COLONY_SHAPE_BUILD").format({"count": count})
	_primary.disabled = _busy or _shape_dragging or not ok


## Why the most cells of a shape are skipped, as a sentence.
func _shape_reason_text(plan: HullShapes.Plan, verdict: BuildRules.Verdict) -> String:
	if verdict == BuildRules.Verdict.INCOMPATIBLE_HULL:
		for cell: Vector3i in plan.skipped.keys():
			if plan.skipped[cell] == verdict:
				var environment := LevelRules.environment_of(_model.site(), cell)
				return tr("BUILD_VERDICT_INCOMPATIBLE_HULL").format({"environment": tr("LEVEL_ENV_" + environment)})
	var key: String = BuildRules.Verdict.keys()[verdict]
	return tr("BUILD_VERDICT_" + key)


## Sends the new hulls of the marked shape in one atomic batch, outward from the structure. A cell
## the server refuses because of a structure this client cannot see is kept as foreign: the shape
## shows it red and blocked until the player makes it smaller.
func _build_shape() -> void:
	var plan := _shape_plan
	if plan == null or not plan.buildable(_hull_units()):
		return
	var cells := plan.place.duplicate()
	_busy = true
	_status.remove_theme_color_override("font_color")
	_status.text = tr("COLONY_SENDING")
	_refresh()
	var result := await _model.send_ops(HullShapes.place_ops(_tool.get_slice(":", 1), cells))
	_busy = false
	if result.is_ok():
		_forget_shape()
		_status.add_theme_color_override("font_color", AppTheme.COLOR_OK)
		_status.text = tr("COLONY_SHAPE_DONE_ONE" if cells.size() == 1 else "COLONY_SHAPE_DONE").format({"count": cells.size()})
	else:
		var index := Wire.as_int(result.error.details.get("opIndex"), -1)
		var code := result.error.code
		if (code == "FOREIGN_NEIGHBOR" or code == "CELL_OCCUPIED") and index >= 0 and index < cells.size():
			_foreign[cells[index]] = true
		_status.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		_status.text = ErrorText.describe(result.error, self)
	_refresh()


func _select(cell: Variant) -> void:
	if _recipes.visible:
		_close_recipes()
	_cell = cell
	_armed = ""
	_status.text = ""
	if cell == null:
		_view.select_cell(null)
	elif _focus.telescopes_error != null:
		# A telescope that failed to load is asked for again with the next tap.
		_focus.reload_telescopes()
	# The field's environment decides which hulls fit (under water on the ground level).
	if _mode == Mode.BUILD and _uses_levels() and _level == 0:
		_fill_palette()
	_refresh()
	_show_names()
	_update_layout()


## Selects the closed structure in focus (its card shows) or clears the selection; then the
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
	_update_layout()


## Opens the structure in focus in place and switches to a mode: its shut hulls give way to the
## modules. The other structures stay shut.
func _open_structure(mode: Mode) -> void:
	_opened = true
	_structure_selected = false
	_focus.activate()
	_view.highlight(0)
	_view.open_structure(_focus.structure_id)
	_foreign = {}
	# A structure opens on the ground level.
	_level = 0
	_view.set_level(0, _uses_levels())
	_store.setup(_focus)
	_set_mode(mode)


## The head: the body outside (with how many own structures stand there), the structure inside
## (with where it is, or the hint of the mode).
func _show_names() -> void:
	if _header == null or _model.structure_id == 0:
		return
	if not _opened:
		_header.set_title(tr("FLEET_IN_ORBIT").format({"body": _model.body_name}) if _model.in_orbit else _model.body_name)
		var count := _model.drawn_structures().size()
		for place: Fleet.Place in _fleet.fleet.places():
			if place.body_id == _model.body_id:
				count = place.structure_ids.size()
		_header.set_subtitle(tr("COLONY_PLACE_COUNT").format({"count": count}))
		return
	_header.set_title(_focus.structure_name)
	if _model.detached:
		_header.set_subtitle(_place_line(_focus.structure_id))
	elif _mode == Mode.VIEW and _cell == null:
		_header.set_subtitle(tr("COLONY_HINT_VIEW"))
	elif _focus.is_guest():
		_header.set_subtitle(tr("COLONY_DOCKED_AT").format({"host": _focus.host.structure_name}))
	else:
		_header.set_subtitle(tr("FLEET_IN_ORBIT").format({"body": _model.body_name}) if _model.in_orbit else _model.body_name)


func _on_title_pressed() -> void:
	if _model.structure_id == 0:
		return
	if _opened:
		open_details()
	else:
		open_places()


## Shuts the open structure again: back outside with the shell's navigation.
func _close_structure() -> void:
	if _model.detached or not _opened:
		return
	_opened = false
	_level = 0
	_view.set_level(0, false)
	_stops.visible = true
	_view.open_structure(0)
	_view.show_preview([], false)
	_cell = null
	_view.select_cell(null)
	_set_mode(Mode.VIEW)
	_select_structure(false)


## Updates preview, info text, cards and buttons from the current state.
func _refresh() -> void:
	if _view == null or _model.structure_id == 0:
		return
	_staff.visible = false
	_jump.visible = false
	_ground.visible = false
	_scope.visible = false
	_scope_next.visible = false
	_scope_block.visible = false
	_path_note.visible = false
	_path_check = null
	_update_levels()
	_update_paths()
	if not _shape_active():
		_hide_shape()
	if not _opened:
		_refresh_closed()
		return
	if _mode == Mode.STORE or _mode == Mode.TRIP:
		_view.select_cell(null)
		return
	if _cell != null:
		_view.select_cell(_target(), _target_on_guest())
	_primary.disabled = _busy
	_secondary.disabled = _busy
	if _mode == Mode.BUILD:
		_refresh_build()
	else:
		_view.show_preview([], false)
		_refresh_view()


## Outside: the card of the selected structure — its name, its trip, "Enter structure" (or
## "Go there" for a neighbour).
func _refresh_closed() -> void:
	if not _structure_selected:
		return
	_card_name.text = _focus.structure_name
	var lines := PackedStringArray()
	var trip := _trip_line(_focus.structure_id)
	if not trip.is_empty():
		lines.append(trip)
	if _focus.is_neighbour():
		lines.append(tr("COLONY_NEIGHBOUR"))
	elif _focus.is_guest():
		lines.append(tr("COLONY_DOCKED_AT").format({"host": _focus.host.structure_name}))
	_card_line.text = "\n".join(lines)
	_card_line.visible = not lines.is_empty()
	_card_button.text = tr("COLONY_GO_THERE") if _focus.is_neighbour() else tr("COLONY_ENTER")


func _refresh_view() -> void:
	_info.remove_theme_color_override("font_color")
	_staff_row.visible = false
	_secondary.visible = false
	# Everything the inspect card offers on the main button removes something.
	_primary.theme_type_variation = AppTheme.VARIATION_DANGER_BUTTON
	if _cell == null:
		_info.text = ""
		_primary.visible = false
		return
	var target: Vector3i = _target()
	var layout := _focus.layout
	var local := layout.to_local(target)
	var hull_type := layout.hull_at(local)
	var placed := layout.module_at(local)
	var definitions := Services.definitions
	# Every field shows its ground: terrain and deposits at this level; collectors also the air.
	var ground_lines := PackedStringArray([_ground_text(target)])
	if placed != null and _uses_air(placed.module_type):
		ground_lines.append(_air_text())
	_ground.text = "\n".join(ground_lines).strip_edges()
	_ground.visible = not _ground.text.is_empty()
	if hull_type.is_empty():
		_info.text = tr("COLONY_FREE_GROUND") if target.z == 0 else tr("LEVEL_EMPTY")
		if _model.is_unexplored(target):
			_info.text = tr("COLONY_UNEXPLORED")
			_ground.visible = false
		if target.z == 0:
			_info.text += _wreck_text(_view.impacts_at(target.x, target.y))
		_primary.visible = false
		return
	var hull_name := definitions.hull(hull_type).display_name if definitions.hull(hull_type) != null else ""
	if placed == null:
		_info.text = tr("COLONY_CELL_HULL").format({"hull": hull_name})
		_primary.visible = true
		_primary.text = tr("COLONY_CONFIRM_REMOVE") if _armed == "hull" else tr("COLONY_REMOVE_HULL")
		var host_cell := _model.layout.to_local(target)
		var verdict := DockRules.check_remove_hull(_model.layout, _model.guest_layouts(), layout, host_cell)
		if verdict == BuildRules.Verdict.OK:
			# Nothing connected may be cut off, the last entrance stays (paths).
			var path := PathAccess.of(layout, definitions).check_remove_hull(local)
			if not path.ok():
				_info.text += "\n" + _path_text(path, layout)
				_primary.disabled = true
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
		var recipe_line := _recipe_line(placed)
		if not recipe_line.is_empty():
			_info.text += "\n" + recipe_line
		var yield_line := _yield_text(placed.module_type, _absolute_cells(placed),
			layout.to_absolute(placed.origin).z, placed.blueprint, true)
		if not yield_line.is_empty():
			_info.text += "\n" + yield_line
		if placed.is_disabled():
			_info.text += "\n" + tr("COLONY_MODULE_DISABLED")
	# A module that needs staff or houses inhabitants but reaches no corridor (it keeps working).
	var paths := PathAccess.of(layout, definitions)
	_path_note.visible = paths.is_required(placed.module_id) and not paths.module_connected(placed.module_id)
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
	if StructureDetails.staffable(module_def) and not placed.is_building():
		var group := StructureDetails.group_of(_focus, placed.module_type)
		_show_staff(group.assigned(), group.needed())
		_staff.visible = true
	if Sight.is_telescope(placed.module_type):
		_refresh_telescope(placed)
	elif Probes.is_launcher(placed.module_type):
		_refresh_launcher(placed)
	elif _switches_storage(placed):
		_refresh_storage(placed)


## Whether the inspect card offers switching this module between own supply and cargo hold (a
## storage module; one that also takes a recipe keeps Choose recipe on the button).
func _switches_storage(placed: StructureLayout.Module) -> bool:
	if placed == null or Services.definitions == null:
		return false
	var definition := Services.definitions.module(placed.module_type)
	return definition != null and definition.storage and not definition.blueprint_driven


## A storage module: "Storage: own supply · 10 000 units" and a button switching it to the other
## area (`setStorageMode`). The server allows it at any time, also while the module is built; it
## refuses when an area could no longer hold its content (the result line says so).
func _refresh_storage(placed: StructureLayout.Module) -> void:
	# Deposits under a store say nothing; the card keeps room for the mode.
	_ground.visible = false
	_scope.visible = true
	_scope.remove_theme_color_override("font_color")
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	_scope.text = tr("STORE_INSPECT_LINE").format({"mode": StorePanel.mode_text(placed, self),
		"capacity": AmountFormat.units(StorePanel.storage_units(placed, scale))})
	_secondary.visible = true
	_secondary.text = tr("STORE_INSPECT_TO_CARGO") if StorePanel.other_mode(placed) == StorePanel.AREA_CARGO \
		else tr("STORE_INSPECT_TO_SUPPLY")
	_secondary.disabled = _busy


## Switches the inspected storage module to the other area; the card follows the new mode (the
## model updates the layout and the inventory), the status line says what happened.
func _switch_storage(placed: StructureLayout.Module) -> void:
	if _busy:
		return
	var structure := _focus
	var mode := StorePanel.other_mode(placed)
	_busy = true
	_status.remove_theme_color_override("font_color")
	_status.text = tr("COLONY_SENDING")
	_refresh()
	var result := await structure.set_storage_mode(placed.module_id, mode)
	_busy = false
	_status.add_theme_color_override("font_color", AppTheme.COLOR_OK if result.is_ok() else AppTheme.COLOR_DANGER)
	_status.text = StorePanel.switch_result_text(result, mode, self)
	_refresh()


## A probe launcher (draft.31): the probes in this structure's own supply, the probes it sent that
## are still under way (with their countdown), and Launch probe — disabled with the reason while it
## is built, switched off, its structure travels, power is short or no probe is in store. The
## server checks again.
func _refresh_launcher(placed: StructureLayout.Module) -> void:
	# Deposits under a launcher say nothing; the card keeps room for the probes.
	_ground.visible = false
	_scope.visible = true
	var now := Services.clock.now_ms()
	var lines := PackedStringArray()
	var stock := ProbeTargetScreen.probe_stock(_focus)
	if stock >= 0:
		lines.append(tr("PROBE_IN_STORE").format({"stock": ProbeTargetScreen.stock_text(_focus, self)}))
	var color := AppTheme.COLOR_OK if stock > 0 else AppTheme.COLOR_MUTED
	for probe: Probes.Probe in _fleet.probes.list.flying(now):
		if probe.structure_id == _focus.structure_id and probe.module_id == placed.module_id:
			lines.append(tr("PROBE_UNDER_WAY").format({"body": _probe_body(probe.body_id),
				"duration": TimeFormat.duration(probe.remaining_ms(now))}))
			color = AppTheme.COLOR_PENDING
	_scope.text = "\n".join(lines)
	_scope.visible = not lines.is_empty()
	_scope.add_theme_color_override("font_color", color)
	var reason := ProbeTargetScreen.launch_reason(_focus, placed, _fleet, self)
	_scope_block.text = reason
	_scope_block.visible = not reason.is_empty()
	_scope_block.add_theme_color_override("font_color",
		AppTheme.COLOR_DANGER if reason == tr("PROBE_BLOCK_NO_PROBE") else AppTheme.COLOR_MUTED)
	_secondary.visible = true
	_secondary.text = tr("PROBE_LAUNCH_OPEN")
	_secondary.disabled = _busy or not reason.is_empty()


## The name of a body for a probe line; "somewhere" while it is unknown.
func _probe_body(body_id: String) -> String:
	var known := _fleet.body_name(body_id)
	if known.is_empty() and body_id == _model.body_id:
		known = _model.body_name
	return known if not known.is_empty() else tr("FLEET_UNKNOWN_PLACE")


## Launch probe: the system map in pick mode for the target body (other systems through the
## galaxy), then that body's surface map for the target cell (ProbeTargetScreen).
func _open_probe_pick(placed: StructureLayout.Module) -> void:
	var map := MapScreen.new()
	var account := Services.session.account
	map.setup(_model.system_id, account.home_body_id if account != null else "")
	map.pick = MapScreen.PICK_PROBE
	map.fleet = _fleet
	var structure := _focus
	map.body_picked.connect(func(body_id: String) -> void:
		ScreenStack.close_layer(map)
		_open_probe_target(structure, placed, body_id))
	ScreenStack.push_onto(self, map)


func _open_probe_target(structure: ColonyModel, placed: StructureLayout.Module, body_id: String) -> void:
	var target := ProbeTargetScreen.new()
	target.setup_launch(_fleet, structure, placed, body_id)
	target.launched.connect(func(probe: Probes.Probe) -> void:
		ScreenStack.close_layer(target)
		show_notice(tr("PROBE_NOTICE_LAUNCHED").format({"body": _probe_body(probe.body_id),
			"duration": TimeFormat.duration(probe.remaining_ms(Services.clock.now_ms()))}), AppTheme.COLOR_OK)
		_refresh())
	ScreenStack.push_onto(self, target)


## A telescope: "Level 2 · sees 14 ly" (emerald while it sees, amber when it does not, and why),
## a running upgrade with its countdown, the next level with range, duration and cost, and
## Upgrade — disabled with the reason at the highest level, while it is built, while an upgrade
## runs or when its structure's store lacks the cost. The server checks again.
func _refresh_telescope(placed: StructureLayout.Module) -> void:
	var scope := _focus.telescope(placed.module_id)
	# Deposits under a telescope say nothing; the card keeps room for the upgrade.
	_ground.visible = false
	_scope.visible = true
	_secondary.visible = false
	if scope == null:
		if _focus.telescopes_error != null:
			_scope.text = tr("SIGHT_TELESCOPE_FAILED").format({"reason": ErrorText.describe(_focus.telescopes_error, self)})
			_scope.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		else:
			_scope.text = tr("SIGHT_LOADING")
			_scope.add_theme_color_override("font_color", AppTheme.COLOR_MUTED)
			if not _focus.telescopes_loaded:
				_focus.reload_telescopes()
		return
	var now := Services.clock.now_ms()
	var lines := PackedStringArray([tr("SIGHT_LEVEL").format({"level": scope.level, "ly": Sight.ly_text(scope.range_ly)})])
	var color := AppTheme.COLOR_OK if scope.effective else AppTheme.COLOR_PENDING
	if placed.is_building():
		color = AppTheme.COLOR_MUTED
	elif not scope.effective:
		lines.append(tr("SIGHT_NOT_EFFECTIVE"))
	if scope.is_upgrading():
		var left := scope.completes_at - now
		lines.append(tr("SIGHT_UPGRADING").format({"level": scope.upgrade_to, "duration": TimeFormat.duration(left)})
			if left > 0 else tr("SIGHT_UPGRADING_DUE").format({"level": scope.upgrade_to}))
		color = AppTheme.COLOR_PENDING
	_scope.text = "\n".join(lines)
	_scope.add_theme_color_override("font_color", color)

	# The cost is paid from the store of the telescope's own structure (its self use).
	var stock := {}
	var store := _focus.inventory
	for cost: Sight.Cost in scope.next_cost:
		var flow: FlowValue = store.flow(cost.resource) if store != null else null
		stock[cost.resource] = flow.amount_at(now) if flow != null else 0
	var block := scope.upgrade_block(placed.is_building(), stock, store != null)
	var next := ""
	if scope.has_next() and not scope.is_upgrading():
		next = tr("SIGHT_NEXT").format({"level": scope.next_level, "ly": Sight.ly_text(scope.next_range_ly),
			"duration": TimeFormat.duration(scope.next_duration_ms), "cost": _cost_text(scope.next_cost)})
	var reason := ""
	match block:
		Sight.Block.MAX_LEVEL:
			next = tr("SIGHT_MAX_LEVEL")
		Sight.Block.BUILDING:
			reason = tr("SIGHT_UPGRADE_WHILE_BUILDING")
		Sight.Block.STOCK:
			var names := PackedStringArray()
			for key: String in scope.lacking(stock):
				names.append(_resource_name(key))
			reason = tr("SIGHT_UPGRADE_LACKS").format({"items": ", ".join(names)})
	_scope_next.text = next
	_scope_next.visible = not next.is_empty()
	_scope_block.text = reason
	_scope_block.visible = not reason.is_empty()
	# Building has its own countdown on the card already: that reason stays muted.
	_scope_block.add_theme_color_override("font_color",
		AppTheme.COLOR_DANGER if block == Sight.Block.STOCK else AppTheme.COLOR_MUTED)
	_secondary.visible = scope.has_next() and not scope.is_upgrading()
	_secondary.text = tr("SIGHT_UPGRADE")
	_secondary.disabled = _busy or block != Sight.Block.UPGRADE_OK


## "1 600 Electronics, 960 Glass" — whole units (rounded up) of an upgrade's cost.
func _cost_text(costs: Array[Sight.Cost]) -> String:
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	var parts := PackedStringArray()
	for cost: Sight.Cost in costs:
		parts.append("%s %s" % [AmountFormat.units(ceili(float(cost.amount) / scale)), _resource_name(cost.resource)])
	return ", ".join(parts)


## Starts the next level of the inspected telescope (`upgradeTelescope`); says when it is done.
func _upgrade_telescope(placed: StructureLayout.Module) -> void:
	if _busy:
		return
	var structure := _focus
	_busy = true
	_status.remove_theme_color_override("font_color")
	_status.text = tr("COLONY_SENDING")
	_refresh()
	var result := await structure.upgrade_telescope(structure.layout.to_absolute(placed.origin))
	_busy = false
	if result.is_ok():
		var results: Array = result.data.get("results") if typeof(result.data.get("results")) == TYPE_ARRAY else []
		var outcome: Dictionary = Wire.as_dict(results[0]) if not results.is_empty() else {}
		var left := Wire.as_int(outcome.get("completesAt")) - Services.clock.now_ms()
		_status.add_theme_color_override("font_color", AppTheme.COLOR_OK)
		_status.text = tr("SIGHT_UPGRADE_STARTED").format({"level": Wire.as_int(outcome.get("level")),
			"duration": TimeFormat.duration(maxi(left, 0))})
	else:
		_status.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		_status.text = ErrorText.describe(result.error, self)
	_refresh()


## "Staff 28 of 28": red below STAFF_LOW of the need, amber below full, emerald when full.
func _show_staff(assigned: int, needed: int) -> void:
	_staff_row.visible = needed > 0
	_staff_value.text = tr("COLONY_STAFF_VALUE").format({"assigned": assigned, "needed": needed})
	var color := AppTheme.COLOR_OK
	if assigned < needed:
		color = AppTheme.COLOR_DANGER if float(assigned) < float(needed) * STAFF_LOW else AppTheme.COLOR_PENDING
	_staff_value.add_theme_color_override("font_color", color)


## A staircase or elevator: its floors and ends, a further floor on top, the jump to its other
## end, and the removal of the whole shaft (two-step, with the number of floors).
func _refresh_shaft(placed: StructureLayout.Module, local: Vector3i) -> void:
	var layout := _focus.layout
	var floors := layout.shaft_of(placed)
	var ends := _shaft_ends(placed)
	var lines := PackedStringArray([_info.text.strip_edges(), tr("LEVEL_SHAFT_LINE").format({
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
	# The whole shaft goes: it must not cut levels or modules off.
	var ids: Array[int] = []
	for floor_module: StructureLayout.Module in floors:
		ids.append(floor_module.module_id)
	var path := PathAccess.of(layout, Services.definitions).check_remove_modules(ids)
	if not path.ok():
		lines.append(_path_text(path, layout))
		_primary.disabled = true
	if _uses_levels():
		_jump.visible = true
		_jump.icon = SHAFT_UP_ICON if _level < ends.y else SHAFT_DOWN_ICON
		_jump.tooltip_text = "LEVEL_GO_UP" if _level < ends.y else "LEVEL_GO_DOWN"
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


## Terrain and deposits (richness at the field's level, best first) of an absolute cell; while
## they load or after a failure a line that says so. "" on a body without a grid.
func _ground_text(cell: Vector3i) -> String:
	if not _model.has_grid:
		return ""
	var ground := _model.ground_cell(cell)
	if ground == null:
		if _model.is_unexplored(cell):
			return tr("COLONY_GROUND_UNEXPLORED")
		return tr("COLONY_GROUND_FAILED") if _model.deposits_failed else tr("COLONY_GROUND_LOADING")
	var lines := PackedStringArray()
	var biome_key := "COLONY_BIOME_" + ground.biome
	var biome := tr(biome_key)
	if not ground.biome.is_empty() and biome != biome_key:
		lines.append(tr("COLONY_GROUND_TERRAIN").format({"biome": biome}))
	var found: Array[Array] = []
	for resource: String in ground.deposits.keys():
		var richness := ExtractionYield.tile_richness(ground.deposits, resource, cell.z)
		if richness > 0:
			found.append([_resource_name(resource), richness])
	if found.is_empty():
		lines.append(tr("COLONY_GROUND_NO_DEPOSITS"))
	else:
		found.sort_custom(func(a: Array, b: Array) -> bool:
			var name_a: String = a[0]
			var name_b: String = b[0]
			return a[1] > b[1] if a[1] != b[1] else name_a < name_b)
		# Traces (below DEPOSIT_TRACE) only as a count, so the card stays short.
		var parts := PackedStringArray()
		var traces := 0
		for entry: Array in found:
			var richness: int = entry[1]
			if richness < DEPOSIT_TRACE and not parts.is_empty():
				traces += 1
			else:
				parts.append(tr("COLONY_DEPOSIT").format({"resource": entry[0], "richness": richness}))
		if traces > 0:
			parts.append(tr("COLONY_GROUND_TRACES").format({"count": traces, "limit": DEPOSIT_TRACE}))
		lines.append(tr("COLONY_GROUND_DEPOSITS").format({"deposits": " · ".join(parts)}))
	return "\n".join(lines)


## The gases of this body's air with their shares, largest first.
func _air_text() -> String:
	var gases: Array[Array] = []
	for gas: Variant in _model.atmosphere.keys():
		var share: Variant = _model.atmosphere.get(gas)
		if typeof(share) == TYPE_FLOAT:
			var fraction: float = share
			if fraction > 0.0:
				gases.append([_resource_name(str(gas)), fraction])
	if gases.is_empty():
		return tr("COLONY_AIR_NONE")
	gases.sort_custom(func(a: Array, b: Array) -> bool: return a[1] > b[1])
	var parts := PackedStringArray()
	for entry: Array in gases:
		var fraction: float = entry[1]
		parts.append(tr("COLONY_GAS").format({"gas": entry[0], "share": _share_text(fraction)}))
	return tr("COLONY_AIR").format({"gases": " · ".join(parts)})


## A share 0..1 as whole percent; below 1 % with one decimal.
func _share_text(fraction: float) -> String:
	var percent := fraction * 100.0
	return String.num(percent, 1) if percent < 1.0 else str(roundi(percent))


## Whether some recipe of a module type collects a gas from the air.
func _uses_air(module_type: String) -> bool:
	for recipe: GameDefinitions.BlueprintDef in Services.definitions.blueprints_for(module_type):
		if not recipe.required_atmosphere_gas.is_empty():
			return true
	return false


func _resource_name(key: String) -> String:
	var name := Services.definitions.resource_name(key)
	return name if not name.is_empty() else tr("STORE_UNKNOWN_ITEM")


## Absolute cells of a module's footprint in the structure in focus.
func _absolute_cells(placed: StructureLayout.Module) -> Array[Vector3i]:
	var result: Array[Vector3i] = []
	for cell: Vector3i in placed.cells():
		result.append(_focus.layout.to_absolute(cell))
	return result


## The deposits under absolute cells, one dictionary per cell; empty while one of them loads.
func _deposits_under(cells: Array[Vector3i]) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for cell: Vector3i in cells:
		var ground := _model.ground_cell(cell)
		if ground == null:
			var none: Array[Dictionary] = []
			return none
		result.append(ground.deposits)
	return result


## What an extracting module type yields over `cells` (absolute footprint) with its lowest floor at
## level `z`: for the recipe `blueprint`, or without one the best recipes the player may run. A
## standing module (`built`) also gets what the rate solution says it yields now. "" for a module
## that extracts nothing, or while the ground loads (the ground line says so).
func _yield_text(module_type: String, cells: Array[Vector3i], z: int, blueprint: String, built: bool) -> String:
	var definitions := Services.definitions
	if not ExtractionYield.extracts(definitions, module_type):
		return ""
	var deposits := _deposits_under(cells)
	if deposits.is_empty():
		return ""
	var module_def := definitions.module(module_type)
	var chosen: Array[ExtractionYield.Estimate] = []
	var recipe: GameDefinitions.BlueprintDef = definitions.blueprint(blueprint) if not blueprint.is_empty() else null
	if ExtractionYield.is_extraction(recipe):
		chosen.append(ExtractionYield.estimate(recipe, module_def, z, deposits, _model.atmosphere, _model.atmosphere_density))
	else:
		for found: ExtractionYield.Estimate in ExtractionYield.estimates(definitions, module_type, z, deposits,
				_model.atmosphere, _model.atmosphere_density, _focus.usable_blueprints):
			if found.works() and chosen.size() < YIELD_LINE_MAX:
				chosen.append(found)
	var parts := PackedStringArray()
	for found: ExtractionYield.Estimate in chosen:
		if found.works():
			parts.append(tr("COLONY_YIELD_SHORT").format({"resource": _resource_name(found.resource),
				"rate": RecipePanel.rate_text(found.rate)}))
	if parts.is_empty():
		return tr("COLONY_YIELD_NOTHING")
	return "\n".join(parts)


## What each extracting recipe of a standing module would yield at its place (recipe key →
## ExtractionYield.Estimate); empty while the ground loads.
func _recipe_yields(placed: StructureLayout.Module) -> Dictionary:
	var result: Dictionary = {}
	var deposits := _deposits_under(_absolute_cells(placed))
	if deposits.is_empty():
		return result
	var definitions := Services.definitions
	var z := _focus.layout.to_absolute(placed.origin).z
	for found: ExtractionYield.Estimate in ExtractionYield.estimates(definitions, placed.module_type, z, deposits,
			_model.atmosphere, _model.atmosphere_density):
		result[found.blueprint] = found
	return result


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
		var level_line := _level_path_line()
		if not level_line.is_empty():
			_info.text += "\n" + level_line
		if _uses_levels():
			_info.text += "\n" + tr("COLONY_PATH_LEGEND")
		_primary.disabled = true
		_view.show_preview([], false)
		return
	if _shape_active():
		_refresh_shape()
		return
	_shaft_hint = ""
	_show_shaft_spots()
	_show_module_spots()
	var tool_name := _tool_name()
	if _cell == null:
		_info.text = tr("COLONY_HINT_PLACE").format({"name": tool_name}) + supply_line
		if not _shaft_hint.is_empty():
			_info.text += "
" + _shaft_hint
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
	# An extracting module: what it would yield right here (the best recipes the player may run).
	if module_def != null:
		var yield_line := _yield_text(module_def.key, cells, (_target() as Vector3i).z, "", false)
		if not yield_line.is_empty():
			_info.text += "\n" + yield_line
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
		var host_cell := _model.layout.to_local(target)
		var hull_verdict := DockRules.check_place_hull(_model.layout, _model.guest_layouts(), host_cell,
			key, Services.definitions, _model.site())
		if hull_verdict != BuildRules.Verdict.OK or DockRules.placement(_model.layout, _model.guest_layouts(), host_cell) \
				!= DockRules.Placement.HOST:
			return hull_verdict
		# Paths: a platform may close the last entrance's open side.
		_path_check = PathAccess.of(_model.layout, Services.definitions).check_place_hulls([host_cell], _is_indoor(key))
		return _path_check.verdict
	if supply == null or supply.units(Services.definitions.module(key).item, now) <= 0:
		return BuildRules.Verdict.NO_ITEM
	var local := _focus.layout.to_local(target)
	var verdict := BuildRules.check_place_module(_focus.layout, Services.definitions, key, local, _rotation)
	if verdict != BuildRules.Verdict.OK:
		return verdict
	# Paths: a corridor beside it, its level connected, nothing cut off, an entrance kept.
	_path_check = PathAccess.of(_focus.layout, Services.definitions).check_place_module(Services.definitions, key, local, _rotation)
	return _path_check.verdict


func _verdict_text(verdict: BuildRules.Verdict) -> String:
	if verdict == BuildRules.Verdict.CUTS_OFF and _path_check != null:
		return _path_text(_path_check, _focus.layout)
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
	if not _opened or _busy:
		return
	if _shape_active():
		_build_shape()
		return
	if _cell == null:
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
		return
	# A marked shape goes first; Cancel again gives up the tool.
	if _shape_active() and _shape_start != null:
		_status.text = ""
		_clear_shape()
		return
	if _mode == Mode.BUILD and _is_multi_cell() and _cell != null:
		_rotation = (_rotation + 90) % 360
		_refresh()
		return
	if _mode == Mode.VIEW and _cell != null:
		var placed := _focus.layout.module_at(_focus.layout.to_local(_target() as Vector3i))
		if placed != null and Sight.is_telescope(placed.module_type):
			_upgrade_telescope(placed)
		elif placed != null and Probes.is_launcher(placed.module_type):
			_open_probe_pick(placed)
		elif _focus.layout.is_shaft(placed):
			_extend_shaft()
		elif _switches_storage(placed):
			_switch_storage(placed)
		elif placed != null:
			_open_recipes(placed)
		return
	# Build without a tool or field: start over.
	_tool = ""
	_select(null)
	_fill_palette()


## The staffing of the inspected module's type, in the structure details.
func _on_staff() -> void:
	if _cell == null:
		return
	var placed := _focus.layout.module_at(_focus.layout.to_local(_target() as Vector3i))
	if placed == null:
		return
	var details_screen := open_details(StructureDetails.Tab.WORKERS)
	if details_screen != null:
		details_screen.open_workforce(placed.module_type)


func _open_recipes(placed: StructureLayout.Module) -> void:
	_recipes.visible = true
	_recipes.show_recipes(placed.module_type, placed.blueprint, _focus.usable_blueprints, _focus.atmosphere,
		_recipe_yields(placed))
	_update_levels()
	_update_layout()


func _close_recipes() -> void:
	_recipes.visible = false
	_refresh()
	_update_layout()


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


## The fleet changed: trips update the texts; a structure that took off or landed gets a new
## screen.
func _on_fleet_changed() -> void:
	if _model.structure_id != 0 and _switch_if_moved():
		return
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
	if entry == null:
		return false
	var away := entry.where() == Fleet.Where.ORBIT or entry.where() == Fleet.Where.TRANSIT
	var driving := entry.motion != null and entry.motion.mode == TravelPlan.MODE_GROUND
	if (_model.detached and not away) or (not _model.detached and away and not driving):
		switch_requested.emit(_model.structure_id)
		return true
	return false


# --- trips ----------------------------------------------------------------------------------

## Arrivals and stopped trips of own structures as a notice.
func _on_travel_event(event: SseEvent) -> void:
	if event.type != "travel.arrived" and event.type != "travel.blocked":
		return
	var data := Wire.parse_object(event.data)
	var entry := _fleet.fleet.find(Wire.as_int(data.get("structureId")))
	var who := entry.name if entry != null else tr("FLEET_UNKNOWN_PLACE")
	if event.type == "travel.arrived":
		show_notice(tr("TRAVEL_NOTICE_ARRIVED").format({"name": who}), AppTheme.COLOR_OK)
		return
	var reason := ApiError.new()
	reason.code = Wire.as_string(data.get("reason"))
	var anchor := Wire.as_dict(data.get("anchor"))
	var body := _fleet.body_name(Wire.as_string(anchor.get("bodyId")))
	show_notice(tr("TRAVEL_NOTICE_BLOCKED").format({"name": who, "reason": ErrorText.describe(reason, self),
		"body": body if not body.is_empty() else tr("FLEET_UNKNOWN_PLACE")}), AppTheme.COLOR_DANGER)


## A short message at the bottom for a while.
func show_notice(text: String, color: Color) -> void:
	_notice.text = text
	_notice.add_theme_color_override("font_color", color)
	_notice.visible = true
	_notice_left = NOTICE_SECONDS
	_update_layout()


## Where a structure is, for the head of one without ground.
func _place_line(structure_id: int) -> String:
	var entry := _fleet.fleet.find(structure_id)
	if entry == null:
		return _model.body_name
	return FleetPanel.status_text(_fleet, entry, Services.clock.now_ms(), self)


## The trip of a structure for its card; "" when it rests.
func _trip_line(structure_id: int) -> String:
	var entry := _fleet.fleet.find(structure_id)
	if entry == null or entry.motion == null or not entry.is_moving(Services.clock.now_ms()):
		return ""
	return FleetPanel.status_text(_fleet, entry, Services.clock.now_ms(), self)


# --- input on the world ---------------------------------------------------------------------

## Gestures: one finger drags the view (or, with a hull shape tool, the shape), two fingers pan
## (their middle) and pinch-zoom; with the mouse the left button drags like one finger, the right
## or middle button pans and the wheel zooms.
func _on_world_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			_touches[touch.index] = touch.position
			if _touches.size() == 1:
				_press_position = touch.position
				_press_travel = 0.0
				if _shape_active() and not _busy:
					_shape_begin(touch.position)
			elif _shape_dragging:
				# A second finger: the camera was meant.
				_shape_cancel()
		else:
			var was_single := _touches.size() == 1
			_touches.erase(touch.index)
			if was_single and _shape_dragging:
				_shape_finish()
			elif was_single and _press_travel < TAP_SLOP and not _shape_active():
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
			# The middle between the fingers moves by half of one finger's move.
			_view.pan(drag.relative * 0.5 * _scale(), Vector2(_viewport.size))
			_touches[drag.index] = drag.position
			_press_travel = TAP_SLOP
		else:
			_touches[drag.index] = drag.position
			_press_travel += drag.relative.length()
			if _shape_dragging:
				_shape_move(drag.position)
			else:
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
			MOUSE_BUTTON_RIGHT, MOUSE_BUTTON_MIDDLE:
				_pan_down = button.pressed
			MOUSE_BUTTON_LEFT:
				if button.pressed:
					_mouse_down = true
					_press_position = button.position
					_press_travel = 0.0
					if _shape_active() and not _busy:
						_shape_begin(button.position)
				else:
					_mouse_down = false
					if _shape_dragging:
						_shape_finish()
					elif _press_travel < TAP_SLOP and not _shape_active():
						_on_tap(button.position)
	elif event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		if motion.device == InputEvent.DEVICE_ID_EMULATION or not (_mouse_down or _pan_down):
			return
		_press_travel += motion.relative.length()
		if _shape_dragging and _mouse_down:
			_shape_move(motion.position)
		else:
			_view.pan(motion.relative * _scale(), Vector2(_viewport.size))
	elif event is InputEventMagnifyGesture:
		_view.zoom_by(1.0 / (event as InputEventMagnifyGesture).factor)


## Canvas pixels → viewport pixels (the viewport follows the container's size).
func _scale() -> float:
	return float(_viewport.size.y) / maxf(_container.size.y, 1.0)


## Outside: a tap on a structure gives its card, a second one soon after enters it, a tap beside
## the structures clears the card. Inside: a tap chooses a column of the open structure; the same
## field again (in Inspect) clears it.
func _on_tap(position_in_container: Vector2) -> void:
	if _model.structure_id == 0:
		return
	if not _opened:
		var picked := _model.structure(_view.pick_structure(position_in_container * _scale()))
		if picked == null:
			_select_structure(false)
			return
		var now := Time.get_ticks_msec()
		var again := _structure_selected and picked == _focus and now - _last_tap_ms <= DOUBLE_TAP_MS
		_last_tap_ms = now
		_focus = picked
		if again:
			enter_structure()
			return
		_select_structure(true)
		return
	# The home structure is tapped on its active level, a guest on its lowest one.
	var cell: Variant = _view.cell_on_level(position_in_container * _scale(), _level) if _uses_levels() \
		else _view.cell_at(position_in_container * _scale(), _view.floor_height(_focus))
	if cell != null and _cell != null and (cell as Vector3i) == (_cell as Vector3i) and _mode == Mode.VIEW:
		_select(null)
		return
	_select(cell)
