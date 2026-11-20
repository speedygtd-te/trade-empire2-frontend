class_name StructureDetails
extends Control
## The details of one structure over the whole screen, the navigation included: what it
## produces and uses (ProductionPanel: supply, the balance per resource, what runs), its staff
## per module type, the blueprints its modules run (BlueprintsPanel; a badge when some have
## none), its log and its research — each a tab of its own bar at the bottom. The "×" in the
## head or Back closes it (Back first closes what is open inside a tab).

signal closed

enum Tab { PRODUCTION, WORKERS, BLUEPRINTS, LOG, RESEARCH }

const TAB_KEYS: Array[String] = [
	"DETAILS_TAB_PRODUCTION", "DETAILS_TAB_WORKERS", "DETAILS_TAB_BLUEPRINTS", "DETAILS_TAB_LOG",
	"DETAILS_TAB_RESEARCH",
]
const TAB_ICONS: Array[String] = [
	"res://game/ui/icons/production.svg", "res://game/ui/icons/workers.svg",
	"res://game/ui/icons/blueprints.svg", "res://game/ui/icons/log.svg", "res://game/ui/icons/research.svg",
]
## How often running research and the countdowns are refreshed (seconds).
const REFRESH_SECONDS := 1.0

var _structure: ColonyModel
var _home: ColonyModel
var _research_allowed := false
var _place := ""
var _tab: Tab = Tab.PRODUCTION
var _busy := false
var _left := 0.0

var _header: LayerHeader
var _nav: BottomNav
var _pages: Array[Control] = []
var _production: ProductionPanel
var _workers_page: VBoxContainer
var _workers_scroll: ScrollContainer
var _workers_list: VBoxContainer
var _workers_summary: Label
var _workers_status: Label
var _workforce_panel: WorkforcePanel
var _blueprints: BlueprintsPanel
var _log: LogPanel
var _research: ResearchPanel


## `structure`: the one shown; `home`: the structure whose labs the research tab shows (offered
## only with `research`); `place`: where it is, for the head; `tab`: the tab to open on.
func setup(structure: ColonyModel, home: ColonyModel, research: bool, place: String, tab: Tab = Tab.PRODUCTION) -> void:
	_structure = structure
	_home = home
	_research_allowed = research
	_place = place
	_tab = tab


## Lies over the bottom navigation as well (MainShell hides it).
func covers_nav() -> bool:
	return true


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var column := VBoxContainer.new()
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.add_theme_constant_override("separation", 0)
	add_child(column)
	var margin := SafeAreaMargin.new()
	margin.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(margin)
	var inner := Ui.column(16)
	margin.add_child(inner)
	_header = LayerHeader.new()
	_header.show_back(false)
	_header.set_title(_structure.structure_name)
	_header.set_subtitle(_place)
	var close := LayerHeader.close_button()
	close.pressed.connect(func() -> void: closed.emit())
	_header.add_action(close)
	inner.add_child(_header)

	var pages := Control.new()
	pages.size_flags_vertical = Control.SIZE_EXPAND_FILL
	inner.add_child(pages)
	_production = ProductionPanel.new()
	_production.setup(_structure)
	_production.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pages.add_child(_production)
	_pages.append(_production)

	_workers_page = Ui.column(16)
	_workers_page.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pages.add_child(_workers_page)
	_workers_summary = Ui.dynamic_label()
	_workers_page.add_child(_workers_summary)
	_workers_status = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_workers_status.visible = false
	_workers_page.add_child(_workers_status)
	_workers_scroll = ScrollContainer.new()
	_workers_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_workers_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_workers_page.add_child(_workers_scroll)
	_workers_list = Ui.column(10)
	_workers_scroll.add_child(_workers_list)
	_workforce_panel = WorkforcePanel.new()
	_workforce_panel.visible = false
	_workforce_panel.applied.connect(_on_workforce_applied)
	_workforce_panel.closed.connect(_close_workforce)
	_workers_page.add_child(_workforce_panel)
	_pages.append(_workers_page)

	_blueprints = BlueprintsPanel.new()
	_blueprints.setup(_structure, _home)
	_blueprints.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pages.add_child(_blueprints)
	_pages.append(_blueprints)

	_log = LogPanel.new()
	_log.setup(_structure)
	_log.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pages.add_child(_log)
	_pages.append(_log)
	_research = ResearchPanel.new()
	_research.setup(_home)
	_research.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	pages.add_child(_research)
	_pages.append(_research)

	_nav = BottomNav.new()
	for index: int in TAB_KEYS.size():
		_nav.add_entry(TAB_KEYS[index], load(TAB_ICONS[index]) as Texture2D)
	_nav.set_entry_visible(Tab.RESEARCH, _research_allowed)
	_nav.tab_pressed.connect(func(index: int) -> void: show_tab(index as Tab))
	column.add_child(_nav)

	_structure.production_changed.connect(_on_production_changed)
	_structure.inventory_changed.connect(_on_production_changed)
	_structure.layout_changed.connect(_on_production_changed)
	show_tab(_tab)
	_update_badge()
	_structure.reload_production()


func _process(delta: float) -> void:
	_left -= delta
	if _left > 0.0:
		return
	_left = REFRESH_SECONDS
	if _tab == Tab.RESEARCH:
		_research.tick()
	elif _tab == Tab.PRODUCTION:
		_production.tick()


## Back closes what is open inside a tab; false when nothing was (the stack closes the screen).
func handle_back() -> bool:
	if _tab == Tab.RESEARCH and _research.handle_back():
		return true
	if _tab == Tab.BLUEPRINTS and _blueprints.handle_back():
		return true
	if _workforce_panel.visible:
		_close_workforce()
		return true
	return false


func current_tab() -> Tab:
	return _tab


func show_tab(tab: Tab) -> void:
	if tab == Tab.RESEARCH and not _research_allowed:
		tab = Tab.PRODUCTION
	_tab = tab
	_nav.select(tab)
	for index: int in _pages.size():
		_pages[index].visible = index == tab
	match tab:
		Tab.PRODUCTION:
			_production.reload()
		Tab.WORKERS:
			_close_workforce()
		Tab.BLUEPRINTS:
			_blueprints.reload()
		Tab.LOG:
			_log.reload()
		Tab.RESEARCH:
			_research.reload()


## The research panel (for review scenes).
func research_panel() -> ResearchPanel:
	return _research


func workforce_panel() -> WorkforcePanel:
	return _workforce_panel


func production_panel() -> ProductionPanel:
	return _production


func blueprints_panel() -> BlueprintsPanel:
	return _blueprints


func nav() -> BottomNav:
	return _nav


func _on_production_changed() -> void:
	_update_badge()
	if _tab == Tab.PRODUCTION:
		_production.reload()
	elif _tab == Tab.WORKERS and not _workforce_panel.visible:
		_show_workers()
	elif _tab == Tab.BLUEPRINTS:
		_blueprints.reload()


## The Blueprints tab carries a badge while some module that runs on blueprints has none.
func _update_badge() -> void:
	if Services.definitions == null:
		return
	_nav.set_badge(Tab.BLUEPRINTS, BlueprintGroups.any_without(BlueprintGroups.rows(_structure.layout.modules(),
		Services.definitions, _structure.idle_reasons)))


# --- workers --------------------------------------------------------------------------------

## Whether a module type needs workers (and so can be staffed).
static func staffable(module_def: GameDefinitions.ModuleDef) -> bool:
	return module_def != null and not module_def.workforce_exempt and module_def.required_workers > 0


## The workforce group of a module type in a structure; a type the rate solution does not list
## yet (just finished) starts empty with its active modules.
static func group_of(structure: ColonyModel, module_type: String) -> Workforce.Group:
	var known: Variant = structure.workforce.groups.get(module_type)
	if known != null:
		return known as Workforce.Group
	var group := Workforce.Group.new()
	group.module_type = module_type
	var module_def := Services.definitions.module(module_type)
	if module_def != null:
		group.required_workers = module_def.required_workers
		group.base_tier = module_def.base_tier
	for placed: StructureLayout.Module in structure.layout.modules():
		if placed.module_type == module_type and not placed.is_building():
			group.modules += 1
	return group


func _show_workers() -> void:
	for child: Node in _workers_list.get_children():
		child.queue_free()
	var workforce := _structure.workforce
	_workers_summary.text = tr("WORKFORCE_SUMMARY").format({"people": workforce.total_population(),
		"assigned": workforce.assigned_total(), "needed": workforce.needed_total()})
	var types: Array[String] = []
	for placed: StructureLayout.Module in _structure.layout.modules():
		if not types.has(placed.module_type) and staffable(Services.definitions.module(placed.module_type)):
			types.append(placed.module_type)
	if types.is_empty():
		_workers_list.add_child(Ui.label("DETAILS_NO_STAFF", AppTheme.VARIATION_MUTED))
		return
	for module_type: String in types:
		var group := group_of(_structure, module_type)
		var module_def := Services.definitions.module(module_type)
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.text = "%s\n%s" % [module_def.display_name, tr("DETAILS_STAFF_LINE").format({"assigned": group.assigned(),
			"needed": group.needed(), "modules": group.modules})]
		if group.assigned() < group.needed():
			row.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		row.tapped.connect(open_workforce.bind(module_type))
		_workers_list.add_child(row)


## Opens the staffing of a module type.
func open_workforce(module_type: String) -> void:
	var module_def := Services.definitions.module(module_type)
	_workers_scroll.visible = false
	_workers_summary.visible = false
	_workers_status.visible = false
	_workforce_panel.visible = true
	_workforce_panel.show_group(group_of(_structure, module_type), _structure.workforce, _structure.robots_in_store(),
		module_def.display_name if module_def != null else "")
	# Enterprise structures: staffing needs MANAGE_TREASURY (draft.38).
	var reason := _structure.manage_reason()
	_workforce_panel.set_blocked(tr("ENTERPRISE_NEEDS_TREASURY").format({"right": tr("ENTERPRISE_FLAG_MANAGE_TREASURY")})
		if not reason.is_empty() else "")


func _close_workforce() -> void:
	_workforce_panel.visible = false
	_workers_scroll.visible = true
	_workers_summary.visible = true
	_show_workers()


func _on_workforce_applied(module_type: String, humans: Array[int], robots: Array[int], auto: Array[bool]) -> void:
	if _busy:
		return
	_busy = true
	_workforce_panel.set_busy(true)
	var result := await _structure.set_workforce(module_type, humans, robots, auto)
	_busy = false
	_workforce_panel.set_busy(false)
	if result.is_ok():
		_close_workforce()
		_workers_status.visible = true
		_workers_status.add_theme_color_override("font_color", AppTheme.COLOR_OK)
		_workers_status.text = tr("COLONY_DONE")
	else:
		_workforce_panel.show_error(ErrorText.describe(result.error, self))
