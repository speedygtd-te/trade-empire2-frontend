class_name EnterpriseFactoryTab
extends EnterpriseTab
## The Enterprise Factory in the flagship (draft.37): up to four lines, each a blueprint and a
## number of pieces, built from the enterprise inventory at double rate. Each line shows how many
## are done; with MANAGE_TREASURY lines can be added (only researched blueprints are offered),
## their quantity stepped, removed, and the whole set saved at once (unchanged lines keep
## running). Otherwise read-only with the reason. Loaded again every minute while shown.

const RELOAD_SECONDS := 60.0
const STEPS: Array[int] = [-10, -1, 1, 10]

var _state: Label
var _list: VBoxContainer
var _actions: VBoxContainer
## [[blueprint, quantity], …] being edited; starts from the running lines.
var _draft: Array[Array] = []
var _dirty := false
var _picking := false
## The list of every blueprint is open.
var _catalog := false
var _reload := 0.0


func _build() -> void:
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_state)
	_list = scroll_column(self, 12)
	_actions = Ui.column(10)
	add_child(_actions)
	model.factory_changed.connect(_on_factory_changed)
	model.flagship_changed.connect(refresh)
	model.changed.connect(refresh)


func shown() -> void:
	if not _dirty and model.factory != null:
		_draft = model.factory.draft()
	model.reload_factory()
	if model.flagship == null:
		model.reload_flagship()
	if model.research == null:
		model.reload_research()
	_reload = RELOAD_SECONDS


func handle_back() -> bool:
	if super.handle_back():
		return true
	if _picking or _catalog:
		_picking = false
		_catalog = false
		refresh()
		return true
	return false


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	_reload -= delta
	if _reload <= 0.0:
		_reload = RELOAD_SECONDS
		model.reload_factory()


func _on_factory_changed() -> void:
	if not _dirty and model.factory != null:
		_draft = model.factory.draft()
	refresh()


func _can_edit() -> bool:
	return holds(Enterprise.FLAG_TREASURY) and model.flagship != null and model.flagship.status == EnterpriseFlagship.ACTIVE


func refresh() -> void:
	if _list == null:
		return
	clear(_list)
	clear(_actions)
	var factory := model.factory
	if factory == null:
		_state.visible = true
		_state.text = tr("COMMON_LOADING") if model.factory_error == null else \
			tr("ENTERPRISE_FACTORY_LOAD_FAILED") + "\n" + ErrorText.describe(model.factory_error, self)
		return
	var notes := PackedStringArray()
	if model.flagship != null and model.flagship.status != EnterpriseFlagship.ACTIVE:
		notes.append(tr("ENTERPRISE_FACTORY_NO_FLAGSHIP"))
	if not holds(Enterprise.FLAG_TREASURY):
		notes.append(right_needed(Enterprise.FLAG_TREASURY))
	notes.append(tr("ENTERPRISE_FACTORY_INTRO").format({"count": factory.max_lines}))
	_state.visible = true
	_state.text = "\n".join(notes)
	if _picking:
		_show_picker(factory)
		return
	if _draft.is_empty():
		text_label(_list, tr("ENTERPRISE_FACTORY_EMPTY"), AppTheme.VARIATION_MUTED)
	var editable := _can_edit()
	for index: int in _draft.size():
		_line_card(factory, index, editable)
	_show_catalog(factory)
	if not editable:
		return
	var add := action_button(_actions, tr("ENTERPRISE_FACTORY_ADD"))
	add.disabled = busy or _draft.size() >= factory.max_lines or factory.offered(_blueprint_name).is_empty()
	add.pressed.connect(func() -> void:
		_picking = true
		refresh())
	var problem := factory.draft_problem(_draft)
	var row := button_row(_actions)
	var save := action_button(row, tr("ENTERPRISE_FACTORY_SAVE"), false, true)
	save.disabled = busy or not factory.differs(_draft) or not problem.is_empty()
	save.pressed.connect(_on_save)
	if _dirty:
		var undo := action_button(row, tr("ENTERPRISE_FACTORY_UNDO"))
		undo.pressed.connect(_on_undo)
	if not problem.is_empty():
		var why := text_label(_actions, _problem_text(problem))
		why.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)


func _line_card(factory: EnterpriseFactory, index: int, editable: bool) -> void:
	var blueprint := str(_draft[index][0])
	var quantity := Wire.as_int(_draft[index][1])
	var box := card(_list)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 16)
	box.add_child(head)
	var recipe := factory.recipe(blueprint)
	head.add_child(Ui.resource_icon(recipe.item if recipe != null else "", ResourceIcon.ROW_SIZE, true))
	var title := text_label(head, _blueprint_name(blueprint))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	var running: EnterpriseFactory.Line = null
	for line: EnterpriseFactory.Line in factory.lines:
		if line.blueprint == blueprint:
			running = line
	if running != null:
		text_label(box, tr("ENTERPRISE_FACTORY_DONE").format({"done": EnterpriseFactory.pieces_done(running, scale),
			"quantity": running.quantity}))
		bar(box, EnterpriseFactory.progress(running, scale))
	if running == null or running.quantity != quantity:
		var planned := text_label(box, tr("ENTERPRISE_FACTORY_PLANNED").format({"quantity": quantity}))
		planned.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	if recipe != null:
		text_label(box, tr("ENTERPRISE_FACTORY_RATE").format({"rate": AmountFormat.rate(recipe.units_per_hour, scale),
			"cost": costs_text(recipe.inputs, self)}), AppTheme.VARIATION_MUTED)
	if not editable:
		return
	var steps := button_row(box)
	for step: int in STEPS:
		var button := action_button(steps, ("+%d" if step > 0 else "%d") % step)
		var next := quantity + step
		button.disabled = busy or next < EnterpriseFactory.QUANTITY_MIN or next > EnterpriseFactory.QUANTITY_MAX
		button.pressed.connect(_on_step.bind(index, step))
	var remove := action_button(box, tr("ENTERPRISE_FACTORY_REMOVE"), true)
	remove.disabled = busy
	remove.pressed.connect(_on_remove.bind(index))


## The blueprints a new line may use: researched ones not on a line yet.
func _show_picker(factory: EnterpriseFactory) -> void:
	text_label(_list, tr("ENTERPRISE_FACTORY_PICK"), AppTheme.VARIATION_MUTED)
	var used: Dictionary = {}
	for entry: Array in _draft:
		used[str(entry[0])] = true
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	var offered := 0
	for recipe: EnterpriseFactory.Recipe in factory.offered(_blueprint_name):
		if used.has(recipe.blueprint):
			continue
		offered += 1
		var row := ListButton.new()
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.text = "%s\n%s" % [_blueprint_name(recipe.blueprint), tr("ENTERPRISE_FACTORY_RATE").format({
			"rate": AmountFormat.rate(recipe.units_per_hour, scale), "cost": costs_text(recipe.inputs, self)})]
		Ui.add_resource_icon(row, recipe.item, true)
		var key := recipe.blueprint
		row.tapped.connect(func() -> void:
			_draft.append([key, 1])
			_dirty = model.factory.differs(_draft)
			_picking = false
			refresh())
		_list.add_child(row)
	if offered == 0:
		text_label(_list, tr("ENTERPRISE_FACTORY_NOTHING_OFFERED"), AppTheme.VARIATION_MUTED)
	var locked := 0
	for recipe: EnterpriseFactory.Recipe in factory.recipes:
		if not recipe.unlocked:
			locked += 1
	if locked > 0:
		text_label(_list, tr("ENTERPRISE_FACTORY_LOCKED_COUNT").format({"count": locked}), AppTheme.VARIATION_MUTED)
	var cancel := action_button(_actions, tr("ENTERPRISE_CANCEL"))
	cancel.pressed.connect(func() -> void:
		_picking = false
		refresh())


## Every blueprint of the factory with its rate and the research it needs, behind a button.
func _show_catalog(factory: EnterpriseFactory) -> void:
	var toggle := action_button(_list, tr("ENTERPRISE_FACTORY_CATALOG_CLOSE") if _catalog
		else tr("ENTERPRISE_FACTORY_CATALOG").format({"count": factory.recipes.size()}))
	toggle.pressed.connect(func() -> void:
		_catalog = not _catalog
		refresh())
	if not _catalog:
		return
	var scale := Services.definitions.fixed_point_scale if Services.definitions != null else 1000000
	var names: Dictionary = {}
	for recipe: EnterpriseFactory.Recipe in factory.recipes:
		names[recipe.blueprint] = _blueprint_name(recipe.blueprint)
	var sorted := factory.recipes.duplicate()
	sorted.sort_custom(func(a: EnterpriseFactory.Recipe, b: EnterpriseFactory.Recipe) -> bool:
		return str(names[a.blueprint]).naturalnocasecmp_to(str(names[b.blueprint])) < 0)
	for recipe: EnterpriseFactory.Recipe in sorted:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 16)
		_list.add_child(row)
		row.add_child(Ui.resource_icon(recipe.item, ResourceIcon.ROW_SIZE, true))
		var texts := Ui.column(2)
		texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(texts)
		text_label(texts, str(names[recipe.blueprint]), "" if recipe.unlocked else AppTheme.VARIATION_MUTED)
		var state := tr("ENTERPRISE_FACTORY_READY") if recipe.unlocked else (
			tr("ENTERPRISE_FACTORY_NEEDS_TECH").format({"tech": _tech_name(recipe.tech)}) if not recipe.tech.is_empty()
			else tr("ENTERPRISE_FACTORY_NEEDS_FLAGSHIP"))
		text_label(texts, "%s · %s" % [AmountFormat.rate(recipe.units_per_hour, scale), state], AppTheme.VARIATION_MUTED)


func _tech_name(key: String) -> String:
	var known := model.research.name_of(key) if model.research != null else ""
	return known if not known.is_empty() else tr("ENTERPRISE_RESEARCH_UNKNOWN_TECH")


func _blueprint_name(blueprint: String) -> String:
	return blueprint_text(blueprint, self)


func _problem_text(problem: String) -> String:
	match problem:
		"lines":
			return tr("ENTERPRISE_FACTORY_TOO_MANY")
		"twice":
			return tr("ENTERPRISE_FACTORY_TWICE")
		"quantity":
			return tr("ENTERPRISE_FACTORY_QUANTITY")
	return tr("ENTERPRISE_FACTORY_LOCKED")


func _on_step(index: int, step: int) -> void:
	if index >= _draft.size() or model.factory == null:
		return
	_draft[index][1] = clampi(Wire.as_int(_draft[index][1]) + step, EnterpriseFactory.QUANTITY_MIN, EnterpriseFactory.QUANTITY_MAX)
	_dirty = model.factory.differs(_draft)
	say("")
	refresh()


func _on_remove(index: int) -> void:
	if index >= _draft.size() or model.factory == null:
		return
	_draft.remove_at(index)
	_dirty = model.factory.differs(_draft)
	refresh()


func _on_undo() -> void:
	if model.factory != null:
		_draft = model.factory.draft()
	_dirty = false
	refresh()


func _on_save() -> void:
	var lines: Array[Array] = []
	for entry: Array in _draft:
		lines.append([str(entry[0]), Wire.as_int(entry[1])])
	if await run(func() -> ApiResult: return await model.set_factory(lines), "ENTERPRISE_FACTORY_SAVED"):
		_dirty = false
		_draft = model.factory.draft()
		refresh()
