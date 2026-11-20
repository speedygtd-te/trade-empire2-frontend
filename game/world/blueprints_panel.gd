class_name BlueprintsPanel
extends VBoxContainer
## The "Blueprints" tab of the structure details: every module type of the structure whose
## modules run on blueprints, as a row that opens to the blueprints in use with their module
## count — modules without one first, in amber. "Change to …" on a group opens the recipe list
## (RecipePanel) and sets the chosen blueprint on every module of the type that runs the group's
## blueprint now, in one bestEffort batch; the line on top says how many were set and why others
## were refused. Back closes the recipe list first. The server decides (BlueprintGroups).

const EXPAND_ICON := preload("res://game/ui/icons/expand.svg")
const COLLAPSE_ICON := preload("res://game/ui/icons/collapse.svg")
## Indent of a type's groups under its row.
const GROUP_INDENT := 24

var _structure: ColonyModel
## The structure whose body gives the ground and the air (the details' home).
var _home: ColonyModel
## Module type → true for the rows that are open.
var _open: Dictionary = {}
var _busy := false
## The group the recipe list is open for (module type and its blueprint now; "" = none).
var _pick_type := ""
var _pick_blueprint := ""
var _picking := false

var _status: Label
var _scroll: ScrollContainer
var _list: VBoxContainer
var _pick_title: Label
var _recipes: RecipePanel


func setup(structure: ColonyModel, home: ColonyModel) -> void:
	_structure = structure
	_home = home


func _ready() -> void:
	add_theme_constant_override("separation", 16)
	_status = Ui.dynamic_label()
	_status.visible = false
	add_child(_status)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(_scroll)
	_list = Ui.column(12)
	_scroll.add_child(_list)
	_pick_title = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
	_pick_title.visible = false
	add_child(_pick_title)
	_recipes = RecipePanel.new()
	_recipes.visible = false
	_recipes.chosen.connect(_on_chosen)
	_recipes.closed.connect(close_picker)
	add_child(_recipes)
	if _home != null:
		_home.deposits_loaded.connect(_on_deposits_loaded)


## Builds the list again (the layout or the rate solution changed); the open recipe list stays.
func reload() -> void:
	if _list == null:
		return
	for child: Node in _list.get_children():
		child.queue_free()
	if Services.definitions == null or _structure == null or _structure.layout.rev < 0:
		_list.add_child(Ui.label("COMMON_LOADING", AppTheme.VARIATION_MUTED))
		return
	var rows := _rows()
	if rows.is_empty():
		_list.add_child(Ui.label("DETAILS_BLUEPRINTS_EMPTY", AppTheme.VARIATION_MUTED))
		return
	_list.add_child(Ui.label("DETAILS_BLUEPRINTS_INTRO", AppTheme.VARIATION_MUTED))
	for row: BlueprintGroups.TypeRow in rows:
		_add_type_row(row)
	if _picking and _current_group() == null:
		# The group is gone (its modules were changed or removed meanwhile).
		close_picker()


## Back closes the recipe list; false when it was not open.
func handle_back() -> bool:
	if _picking:
		close_picker()
		return true
	return false


func is_picking() -> bool:
	return _picking


## Opens or closes the row of a module type.
func set_open(module_type: String, on: bool) -> void:
	if on:
		_open[module_type] = true
	else:
		_open.erase(module_type)
	reload()


## Opens the recipe list for the modules of `module_type` that run `blueprint` ("" = none).
func open_picker(module_type: String, blueprint: String) -> void:
	_pick_type = module_type
	_pick_blueprint = blueprint
	_picking = true
	_scroll.visible = false
	_pick_title.visible = true
	_recipes.visible = true
	_show_picker()


func close_picker() -> void:
	_picking = false
	_pick_title.visible = false
	_recipes.visible = false
	_scroll.visible = true
	reload()


## The status line (for review scenes).
func status_text() -> String:
	return _status.text if _status.visible else ""


func _rows() -> Array[BlueprintGroups.TypeRow]:
	return BlueprintGroups.rows(_structure.layout.modules(), Services.definitions, _structure.idle_reasons)


func _current_group() -> BlueprintGroups.Group:
	for row: BlueprintGroups.TypeRow in _rows():
		if row.module_type == _pick_type:
			return row.group(_pick_blueprint)
	return null


func _add_type_row(row: BlueprintGroups.TypeRow) -> void:
	var open := _open.has(row.module_type)
	var head := ListButton.new()
	head.alignment = HORIZONTAL_ALIGNMENT_LEFT
	head.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	head.icon = COLLAPSE_ICON if open else EXPAND_ICON
	head.icon_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var line := tr("DETAILS_BLUEPRINTS_IN_USE").format({"count": row.groups.size()})
	if row.groups.size() == 1:
		line = tr("DETAILS_BLUEPRINTS_ALL_ON").format({"name": _blueprint_name(row.groups[0].blueprint)})
	var missing := row.without_blueprint()
	if missing > 0:
		line = tr("DETAILS_BLUEPRINTS_MISSING").format({"count": missing})
		head.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		head.add_theme_color_override("font_hover_color", AppTheme.COLOR_PENDING)
	head.text = "%s\n%s" % [tr("DETAILS_TYPE_COUNT").format({"name": row.display_name, "count": row.count()}), line]
	head.tapped.connect(set_open.bind(row.module_type, not open))
	_list.add_child(head)
	if not open:
		return
	var indent := MarginContainer.new()
	indent.add_theme_constant_override("margin_left", GROUP_INDENT)
	_list.add_child(indent)
	var groups := Ui.column(10)
	indent.add_child(groups)
	for group: BlueprintGroups.Group in row.groups:
		groups.add_child(_group_panel(group))


func _group_panel(group: BlueprintGroups.Group) -> Control:
	var panel := PanelContainer.new()
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 12)
	panel.add_child(line)
	if not group.is_none():
		line.add_child(Ui.resource_icon(RecipePanel.main_output(Services.definitions.blueprint(group.blueprint))))
	var texts := Ui.column(4)
	texts.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.add_child(texts)
	var name_label := Ui.dynamic_label()
	name_label.text = tr("DETAILS_TYPE_COUNT").format({"name": _blueprint_name(group.blueprint), "count": group.count()})
	if group.is_none():
		name_label.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	texts.add_child(name_label)
	var notes := PackedStringArray()
	if group.building > 0:
		notes.append(tr("DETAILS_BLUEPRINTS_BUILDING").format({"count": group.building}))
	if group.location > 0:
		notes.append(tr("DETAILS_BLUEPRINTS_LOCATION").format({"count": group.location}))
	if group.no_enterprise > 0:
		notes.append(tr("DETAILS_BLUEPRINTS_NO_ENTERPRISE").format({"count": group.no_enterprise}))
	if not group.is_none():
		var recipe := Services.definitions.blueprint(group.blueprint)
		if recipe != null:
			notes.insert(0, RecipePanel.describe(recipe))
	if not notes.is_empty():
		var note := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
		note.text = "\n".join(notes)
		if group.location > 0 or group.no_enterprise > 0:
			note.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
		texts.add_child(note)
	var change := Ui.secondary_button("DETAILS_BLUEPRINTS_CHANGE")
	change.size_flags_horizontal = Control.SIZE_SHRINK_END
	change.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	change.disabled = _busy
	change.pressed.connect(open_picker.bind(group.module_type, group.blueprint))
	line.add_child(change)
	return panel


func _blueprint_name(blueprint: String) -> String:
	if blueprint.is_empty():
		return tr("DETAILS_BLUEPRINTS_NONE")
	var recipe := Services.definitions.blueprint(blueprint)
	return recipe.display_name if recipe != null else tr("DETAILS_BLUEPRINTS_UNKNOWN")


func _show_picker() -> void:
	var group := _current_group()
	if group == null:
		close_picker()
		return
	var module_def := Services.definitions.module(group.module_type)
	var type_name := module_def.display_name if module_def != null else tr("STORE_UNKNOWN_ITEM")
	if group.is_none():
		_pick_title.text = tr("DETAILS_BLUEPRINTS_PICK_NONE").format({"count": group.count(), "type": type_name})
	else:
		_pick_title.text = tr("DETAILS_BLUEPRINTS_PICK").format({"count": group.count(), "type": type_name,
			"blueprint": _blueprint_name(group.blueprint)})
	_recipes.show_recipes(group.module_type, group.blueprint, _home.usable_blueprints, _home.atmosphere, {},
		_yield_notes(group))


## What each extracting recipe would yield over the group's spots: at how many it works and the
## range per module there (ExtractionYield, the server decides). One module gets the usual line.
## Without a grid no line (the recipe's condition stays); while the ground loads, a line says so.
func _yield_notes(group: BlueprintGroups.Group) -> Dictionary:
	var notes: Dictionary = {}
	var definitions := Services.definitions
	if not ExtractionYield.extracts(definitions, group.module_type) or not _home.has_grid:
		return notes
	var module_def := definitions.module(group.module_type)
	# The ground under every module (absolute cells) and its level; empty while one loads.
	var places: Array[Array] = []
	var loading := false
	for placed: StructureLayout.Module in group.modules:
		var deposits: Array[Dictionary] = []
		for cell: Vector3i in placed.cells():
			var ground := _home.ground_cell(_structure.layout.to_absolute(cell))
			if ground == null:
				loading = true
				break
			deposits.append(ground.deposits)
		places.append([_structure.layout.to_absolute(placed.origin).z, deposits])
	for recipe: GameDefinitions.BlueprintDef in definitions.blueprints_for(group.module_type):
		if not ExtractionYield.is_extraction(recipe):
			continue
		if loading and recipe.required_atmosphere_gas.is_empty():
			if not _home.deposits_failed:
				notes[recipe.key] = tr("DETAILS_BLUEPRINTS_YIELD_LOADING")
			continue
		var estimates: Array[ExtractionYield.Estimate] = []
		for place: Array in places:
			var z: int = place[0]
			var raw: Array = place[1]
			var deposits: Array[Dictionary] = []
			deposits.assign(raw)
			estimates.append(ExtractionYield.estimate(recipe, module_def, z, deposits, _home.atmosphere,
				_home.atmosphere_density))
		notes[recipe.key] = _span_text(BlueprintGroups.yield_span(estimates))
	return notes


func _span_text(span: BlueprintGroups.YieldSpan) -> String:
	if span == null:
		return ""
	if span.working == 0:
		return tr("RECIPE_YIELD_NONE") if span.spots == 1 else tr("DETAILS_BLUEPRINTS_YIELD_NONE").format({"spots": span.spots})
	var name := Services.definitions.resource_name(span.resource)
	if name.is_empty():
		name = tr("STORE_UNKNOWN_ITEM")
	var richness := str(span.low_richness)
	if span.high_richness != span.low_richness:
		richness = tr("DETAILS_BLUEPRINTS_RANGE").format({"low": span.low_richness, "high": span.high_richness})
	var rate := RecipePanel.rate_text(span.low_rate)
	if span.high_rate != span.low_rate:
		rate = tr("DETAILS_BLUEPRINTS_RANGE").format({"low": RecipePanel.rate_text(span.low_rate).trim_suffix("/h"),
			"high": RecipePanel.rate_text(span.high_rate)})
	var values := {"resource": name, "richness": richness, "rate": rate}
	var text: String
	if span.gas_share >= 0.0:
		values["share"] = roundi(span.gas_share * 100.0)
		text = tr("COLONY_YIELD_GAS").format(values)
	else:
		text = tr("COLONY_YIELD_TILE").format(values)
	if span.spots == 1:
		return tr("RECIPE_YIELD_HERE").format({"yield": text})
	if span.working == span.spots:
		return tr("DETAILS_BLUEPRINTS_YIELD_ALL").format({"spots": span.spots, "yield": text})
	return tr("DETAILS_BLUEPRINTS_YIELD_SOME").format({"working": span.working, "spots": span.spots,
		"idle": span.spots - span.working, "yield": text})


func _on_deposits_loaded() -> void:
	if _picking and is_visible_in_tree():
		_show_picker()


func _on_chosen(blueprint: String) -> void:
	if _busy:
		return
	# The modules of the type that run the group's blueprint now (the layout may have moved on).
	var group := _current_group()
	close_picker()
	if group == null:
		return
	var ops := BlueprintGroups.ops(group, blueprint, _structure.layout)
	if ops.is_empty():
		_show_status(tr("DETAILS_BLUEPRINTS_UNCHANGED"), AppTheme.COLOR_MUTED)
		return
	_busy = true
	_show_status(tr("COLONY_SENDING"), AppTheme.COLOR_TEXT)
	reload()
	var result := await _structure.set_blueprints(ops)
	_busy = false
	if not result.is_ok():
		_show_status(ErrorText.describe(result.error, self), AppTheme.COLOR_DANGER)
		reload()
		return
	var outcome := BlueprintGroups.outcome(result.data.get("results"))
	var target := _blueprint_name(blueprint) if not blueprint.is_empty() else tr("DETAILS_BLUEPRINTS_NO_BLUEPRINT")
	if outcome.refused == 0:
		_show_status(tr("DETAILS_BLUEPRINTS_RESULT_SET").format({"count": outcome.applied, "name": target}),
			AppTheme.COLOR_OK)
	else:
		var reasons := PackedStringArray()
		for code: String in outcome.codes():
			var error := ApiError.new()
			error.code = code
			reasons.append(ErrorText.describe(error, self))
		var key := "DETAILS_BLUEPRINTS_RESULT_PARTLY" if outcome.applied > 0 else "DETAILS_BLUEPRINTS_RESULT_REFUSED"
		_show_status(tr(key).format({"count": outcome.applied, "name": target, "refused": outcome.refused,
			"reasons": " ".join(reasons)}),
			AppTheme.COLOR_PENDING if outcome.applied > 0 else AppTheme.COLOR_DANGER)
	reload()


func _show_status(text: String, color: Color) -> void:
	_status.visible = true
	_status.text = text
	_status.add_theme_color_override("font_color", color)
