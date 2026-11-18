class_name ResearchPanel
extends VBoxContainer
## Research in the open structure: its labs with their input slots, status and progress, what a
## lab could research next and what that unlocks, and what is researched already.
##
## A lab picks its research itself from the resources in its slots; the server never names the
## running tech (from 50 % only its field). The player aims a lab by choosing a tech: its inputs
## go into the slots at the minimum rate (or a multiple, which is faster). Which tech the lab
## really takes is the server's decision — the panel only previews it. Progress ticks locally on
## the game clock between the server's updates.

const LIST_HEIGHT := 380
## Multiples of the minimum slot rate on offer: more input researches faster.
const RATE_FACTORS: Array[int] = [1, 2, 4]
## Lab states and research fields with a text each (RESEARCH_STATUS_*, RESEARCH_CATEGORY_*).
const STATUSES: PackedStringArray = ["INACTIVE", "NO_SLOTS", "NO_TECH", "RESEARCHING", "PAUSED_LOW_INPUT", "STARVED"]
const CATEGORIES: PackedStringArray = [
	"ENERGY", "EXTRACTION", "HABITATION", "MANUFACTURING", "PRODUCTION", "SATISFACTION", "SECURITY", "TRANSPORTATION",
]

var _model: ColonyModel
var _summary: Label
var _list: VBoxContainer
var _plan: Label
var _factor_row: HBoxContainer
var _factor_buttons: Array[Button] = []
var _status: Label
var _clear: Button
var _apply: Button

## Module id of the chosen lab; 0 when none.
var _lab_id := 0
## The tech the chosen lab should aim at; "" when none.
var _target := ""
var _factor := 1
## "apply" or "clear" while that action waits for its second tap; "" otherwise.
var _armed := ""
var _busy := false
var _loading := false
## Module id → [progress bar, progress label], updated every second.
var _progress_rows: Dictionary = {}


func setup(model: ColonyModel) -> void:
	_model = model
	_model.research_changed.connect(_on_research_changed)
	_model.research_completed.connect(_on_research_completed)


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	_summary = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_summary)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(0, LIST_HEIGHT)
	add_child(scroll)
	_list = Ui.column(12)
	scroll.add_child(_list)
	_plan = Ui.dynamic_label()
	add_child(_plan)
	_factor_row = HBoxContainer.new()
	_factor_row.add_theme_constant_override("separation", 12)
	add_child(_factor_row)
	var group := ButtonGroup.new()
	for factor: int in RATE_FACTORS:
		var button := Ui.tab_button("", group)
		button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
		button.text = tr("RESEARCH_RATE_FACTOR").format({"factor": factor})
		button.pressed.connect(_choose_factor.bind(factor))
		_factor_row.add_child(button)
		_factor_buttons.append(button)
	_status = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_status)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 16)
	add_child(actions)
	_clear = Ui.secondary_button("")
	_clear.theme_type_variation = AppTheme.VARIATION_DANGER_BUTTON
	_clear.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	_clear.pressed.connect(_on_clear)
	actions.add_child(_clear)
	_apply = Ui.primary_button("")
	_apply.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	_apply.pressed.connect(_on_apply)
	actions.add_child(_apply)
	_rebuild()


## Loads research and the labs of this structure (again); the list shows a loading state the
## first time and an error state when it fails.
func reload() -> void:
	if _loading or _model == null:
		return
	_loading = true
	_rebuild()
	var error: ApiError = null
	if _model.research == null:
		error = await _model.reload_research()
	else:
		error = await _model.reload_labs()
	_loading = false
	if error != null and _model.research != null:
		_show_status(ErrorText.describe(error, self), AppTheme.COLOR_DANGER)
	_rebuild()


## Back: drops an armed action, then the chosen tech. False when there was nothing to drop.
func handle_back() -> bool:
	if not _armed.is_empty():
		_armed = ""
		_show_status("", AppTheme.COLOR_MUTED)
		_update_actions()
		return true
	if not _target.is_empty():
		_target = ""
		_rebuild()
		return true
	return false


## Moves the progress of every lab on to the current game time.
func tick() -> void:
	if _model == null or _model.research == null:
		return
	var now := Services.clock.now_ms()
	for module_id: int in _progress_rows.keys():
		var lab := _model.research.lab(module_id)
		if lab == null:
			continue
		var row: Array = _progress_rows[module_id]
		(row[0] as ProgressBar).value = lab.fraction_at(now)
		(row[1] as Label).text = _progress_text(lab, now)


# --- building the list ------------------------------------------------------------------------

func _on_research_changed() -> void:
	if is_visible_in_tree():
		_rebuild()


func _on_research_completed(tech: String) -> void:
	var entry := Services.definitions.research.tech(tech) if Services.definitions != null else null
	var shown := entry.display_name if entry != null else tr("RESEARCH_SOMETHING")
	_show_status(tr("RESEARCH_COMPLETED").format({"name": shown}), AppTheme.COLOR_OK)


func _rebuild() -> void:
	if _list == null:
		return
	for child: Node in _list.get_children():
		child.queue_free()
	_progress_rows.clear()
	var research := _model.research if _model != null else null
	var definitions := Services.definitions
	if research == null or definitions == null:
		_summary.text = ""
		if _model != null and _model.research_error != null and not _loading:
			_list.add_child(_error_state(_model.research_error))
		else:
			_list.add_child(Ui.label("RESEARCH_LOADING", AppTheme.VARIATION_MUTED))
		_lab_id = 0
		_target = ""
		_update_actions()
		return
	var catalog := definitions.research
	var labs := research.labs_of(_model.structure_id)
	if research.lab(_lab_id) == null or research.lab(_lab_id).structure_id != _model.structure_id:
		_lab_id = labs[0].module_id if not labs.is_empty() else 0
		_target = ""
	_summary.text = tr("RESEARCH_SUMMARY").format({
		"done": catalog.researched_count(research.researched), "total": catalog.selectable_count()})

	_list.add_child(Ui.label("RESEARCH_LABS_HEADING", AppTheme.VARIATION_HEADING))
	if labs.is_empty():
		_list.add_child(Ui.label("RESEARCH_NO_LAB", AppTheme.VARIATION_MUTED))
	var group := ButtonGroup.new()
	for index: int in labs.size():
		_list.add_child(_lab_card(labs[index], index, labs.size(), group))

	var chosen := research.lab(_lab_id)
	var lab_type := chosen.module_type if chosen != null else ResearchCatalog.RESEARCH_LAB
	_list.add_child(Ui.label("RESEARCH_NEXT_HEADING" if chosen != null else "RESEARCH_NEXT_FIRST_LAB", AppTheme.VARIATION_HEADING))
	var open := catalog.open_for_lab(lab_type, research.researched)
	if open.is_empty():
		_list.add_child(Ui.label("RESEARCH_NOTHING_OPEN", AppTheme.VARIATION_MUTED))
	var tech_group := ButtonGroup.new()
	for entry: ResearchCatalog.Tech in open:
		_list.add_child(_tech_entry(entry, chosen != null, tech_group))
	if catalog.tech(_target) == null or not open.has(catalog.tech(_target)):
		_target = ""

	_list.add_child(Ui.label("RESEARCH_DONE_HEADING", AppTheme.VARIATION_HEADING))
	var done := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	done.text = _researched_text(catalog, research)
	_list.add_child(done)
	_update_actions()
	tick()


func _error_state(error: ApiError) -> Control:
	var column := Ui.column(12)
	var text := Ui.dynamic_label(AppTheme.VARIATION_ERROR)
	text.text = ErrorText.describe(error, self)
	column.add_child(text)
	var retry := Ui.secondary_button("COMMON_RETRY")
	retry.pressed.connect(reload)
	column.add_child(retry)
	return column


func _lab_card(lab: ResearchState.Lab, index: int, count: int, group: ButtonGroup) -> Control:
	var card := Ui.column(6)
	var header := Ui.tab_button("", group)
	header.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	header.alignment = HORIZONTAL_ALIGNMENT_LEFT
	var lab_name := _module_name(lab.module_type)
	header.text = tr("RESEARCH_LAB_NUMBERED").format({"name": lab_name, "number": index + 1}) if count > 1 else lab_name
	header.button_pressed = lab.module_id == _lab_id
	header.pressed.connect(_choose_lab.bind(lab.module_id))
	card.add_child(header)
	var status := Ui.dynamic_label()
	status.text = _status_text(lab)
	status.add_theme_color_override("font_color", _status_color(lab.status))
	card.add_child(status)
	if lab.progress != null:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 16)
		var bar := Ui.progress_bar()
		bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(bar)
		var text := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
		text.autowrap_mode = TextServer.AUTOWRAP_OFF
		text.size_flags_horizontal = Control.SIZE_SHRINK_END
		row.add_child(text)
		card.add_child(row)
		_progress_rows[lab.module_id] = [bar, text]
	var guess := _guess_text(lab)
	if not guess.is_empty():
		var guess_label := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
		guess_label.text = guess
		card.add_child(guess_label)
	var slots := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	slots.text = tr("RESEARCH_SLOTS").format({"slots": _slots_text(lab)})
	card.add_child(slots)
	return card


func _tech_entry(entry: ResearchCatalog.Tech, enabled: bool, group: ButtonGroup) -> Button:
	var lines := PackedStringArray([tr("RESEARCH_TECH_TITLE").format({
		"name": entry.display_name, "tier": entry.tier,
		"duration": TimeFormat.duration(entry.base_time_seconds * 1000)})])
	var needs := PackedStringArray()
	for input: Array in entry.required_inputs:
		var resource: String = input[0]
		needs.append(_rate_and_name(resource, ResearchCatalog.min_rate_per_hour(entry, resource)))
	lines.append(tr("RESEARCH_TECH_NEEDS").format({"inputs": ", ".join(needs)}))
	var unlocks := _unlocks_text(entry)
	if not unlocks.is_empty():
		lines.append(tr("RESEARCH_TECH_UNLOCKS").format({"things": unlocks}))
	if entry.min_worker_tier > 1:
		lines.append(tr("RESEARCH_TECH_WORKERS").format({"tier": entry.min_worker_tier}))
	var button := Button.new()
	button.text = "\n".join(lines)
	button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button.custom_minimum_size = Vector2(0, AppTheme.TOUCH_MIN)
	button.toggle_mode = true
	button.button_group = group
	button.button_pressed = entry.key == _target
	button.disabled = not enabled
	button.pressed.connect(_choose_target.bind(entry.key))
	return button


# --- choosing and sending ---------------------------------------------------------------------

func _choose_lab(module_id: int) -> void:
	if module_id == _lab_id:
		return
	_lab_id = module_id
	_target = ""
	_armed = ""
	_show_status("", AppTheme.COLOR_MUTED)
	_rebuild()


func _choose_target(key: String) -> void:
	_target = key
	_armed = ""
	_show_status("", AppTheme.COLOR_MUTED)
	_update_actions()


func _choose_factor(factor: int) -> void:
	_factor = factor
	_armed = ""
	_update_actions()


func _on_apply() -> void:
	var lab := _chosen_lab()
	var entry := Services.definitions.research.tech(_target)
	if _busy or lab == null or entry == null:
		return
	var slots := ResearchCatalog.slots_for(entry, lab.slot_count, _factor)
	if slots.is_empty():
		return
	var losing := lab.has_progress(Services.clock.now_ms())
	if losing and _armed != "apply":
		_arm("apply")
		return
	await _send(lab, slots, losing, tr("RESEARCH_APPLIED").format({"name": entry.display_name}), "apply")


func _on_clear() -> void:
	var lab := _chosen_lab()
	if _busy or lab == null:
		return
	# Emptying the slots stops the lab: always two taps.
	if _armed != "clear":
		_arm("clear")
		return
	await _send(lab, ResearchCatalog.empty_slots(lab.slot_count), lab.has_progress(Services.clock.now_ms()), tr("RESEARCH_CLEARED"), "clear")


func _arm(action: String) -> void:
	_armed = action
	var lab := _chosen_lab()
	var losing := lab != null and lab.has_progress(Services.clock.now_ms())
	_show_status(tr("RESEARCH_LOSS_WARNING") if losing else tr("RESEARCH_CLEAR_WARNING"), AppTheme.COLOR_PENDING)
	_update_actions()


func _send(lab: ResearchState.Lab, slots: Array, confirm_loss: bool, done_text: String, action: String) -> void:
	_armed = ""
	_busy = true
	_show_status(tr("COLONY_SENDING"), AppTheme.COLOR_MUTED)
	_update_actions()
	var result := await _model.set_lab_slots(lab.module_id, slots, confirm_loss)
	_busy = false
	if result.is_ok():
		_target = ""
		_show_status(done_text, AppTheme.COLOR_OK)
		_rebuild()
		return
	if result.error.code == "RESEARCH_IN_PROGRESS":
		# Progress came in meanwhile: the next tap confirms losing it.
		_armed = action

		_show_status(tr("RESEARCH_LOSS_WARNING"), AppTheme.COLOR_PENDING)
	else:
		_show_status(ErrorText.describe(result.error, self), AppTheme.COLOR_DANGER)
	_update_actions()


func _update_actions() -> void:
	if _apply == null:
		return
	var lab := _chosen_lab()
	var entry := Services.definitions.research.tech(_target) if Services.definitions != null and not _target.is_empty() else null
	_clear.visible = lab != null and not lab.slots_empty()
	_clear.disabled = _busy
	_clear.text = tr("RESEARCH_CONFIRM_CLEAR") if _armed == "clear" else tr("RESEARCH_CLEAR")
	_apply.visible = lab != null and entry != null
	_apply.disabled = _busy
	_apply.text = tr("RESEARCH_CONFIRM_LOSS") if _armed == "apply" else tr("RESEARCH_APPLY")
	_factor_row.visible = _apply.visible
	for index: int in RATE_FACTORS.size():
		_factor_buttons[index].set_pressed_no_signal(RATE_FACTORS[index] == _factor)
	_plan.visible = true
	_plan.remove_theme_color_override("font_color")
	if lab == null:
		_plan.visible = false
	elif entry == null:
		_plan.text = tr("RESEARCH_HINT_CHOOSE")
	else:
		_plan.text = _plan_text(lab, entry)
		if not _missing_in_store(entry).is_empty():
			_plan.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)


func _show_status(text: String, color: Color) -> void:
	if _status == null:
		return
	_status.text = text
	_status.add_theme_color_override("font_color", color)


func _chosen_lab() -> ResearchState.Lab:
	if _model == null or _model.research == null or _lab_id == 0:
		return null
	return _model.research.lab(_lab_id)


# --- texts ------------------------------------------------------------------------------------

func _status_text(lab: ResearchState.Lab) -> String:
	if not STATUSES.has(lab.status):
		return tr("RESEARCH_STATUS_UNKNOWN")
	var scale := _scale()
	var text := tr("RESEARCH_STATUS_" + lab.status).format({
		"resource": _resource_name(lab.shortfall_resource),
		"rate": _rate(lab.shortfall_rate, scale),
		"required": _rate(lab.shortfall_required, scale),
		"percent": roundi(lab.supply() * 100.0),
	})
	if not lab.hint_category.is_empty():
		text += "\n" + tr("RESEARCH_HINT_FIELD").format({"field": _category_name(lab.hint_category)})
	return text


static func _status_color(status: String) -> Color:
	match status:
		"RESEARCHING":
			return AppTheme.COLOR_OK
		"PAUSED_LOW_INPUT", "STARVED", "NO_TECH", "INACTIVE":
			return AppTheme.COLOR_PENDING
	return AppTheme.COLOR_MUTED


func _progress_text(lab: ResearchState.Lab, now: int) -> String:
	var percent := floori(lab.fraction_at(now) * 100.0)
	var remaining := lab.remaining_ms(now)
	if remaining < 0:
		return tr("RESEARCH_PROGRESS_STILL").format({"percent": percent})
	return tr("RESEARCH_PROGRESS").format({"percent": percent, "duration": TimeFormat.duration(remaining)})


## The preview of what the lab's current slots point at; "" when they point at nothing.
func _guess_text(lab: ResearchState.Lab) -> String:
	if lab.slots_empty() or lab.status == "NO_TECH":
		return ""
	var catalog := Services.definitions.research
	var choice := catalog.preview_choice(lab.module_type, lab.slot_resources(), _model.research.researched)
	if choice.is_empty():
		return ""
	var names := PackedStringArray()
	for entry: ResearchCatalog.Tech in choice:
		names.append(entry.display_name)
	if names.size() == 1:
		return tr("RESEARCH_GUESS_ONE").format({"name": names[0]})
	return tr("RESEARCH_GUESS_SEVERAL").format({"names": ", ".join(names)})


func _plan_text(lab: ResearchState.Lab, entry: ResearchCatalog.Tech) -> String:
	var slots := ResearchCatalog.slots_for(entry, lab.slot_count, _factor)
	var parts := PackedStringArray()
	for slot: Variant in slots:
		var data := Wire.as_dict(slot)
		if data.is_empty():
			parts.append(tr("RESEARCH_SLOT_EMPTY"))
		else:
			parts.append(_rate_and_name(Wire.as_string(data.get("resource")), Wire.as_int(data.get("ratePerHour"))))
	var lines := PackedStringArray([tr("RESEARCH_PLAN").format({
		"slots": ", ".join(parts), "fastest": TimeFormat.duration(entry.min_time_seconds * 1000)})])
	var choice := Services.definitions.research.preview_choice(lab.module_type, entry.input_resources(), _model.research.researched)
	if choice.size() == 1 and choice[0] != entry:
		lines.append(tr("RESEARCH_PLAN_OTHER").format({"name": choice[0].display_name}))
	elif choice.size() > 1:
		lines.append(tr("RESEARCH_PLAN_TIE"))

	var missing := _missing_in_store(entry)
	if not missing.is_empty():
		lines.append(tr("RESEARCH_PLAN_MISSING").format({"items": ", ".join(missing)}))
	return "\n".join(lines)


## Names of the tech's inputs the store has none of: the lab would stand still.
func _missing_in_store(entry: ResearchCatalog.Tech) -> PackedStringArray:
	var missing := PackedStringArray()
	var inventory := _model.inventory
	var now := Services.clock.now_ms()
	for resource: String in entry.input_resources():
		if inventory == null or inventory.units(resource, now) <= 0:
			missing.append(_resource_name(resource))
	return missing


func _slots_text(lab: ResearchState.Lab) -> String:
	var parts := PackedStringArray()
	for slot: Array in lab.slots:
		if slot.is_empty():
			parts.append(tr("RESEARCH_SLOT_EMPTY"))
		else:
			var resource: String = slot[0]
			var rate: int = slot[1]
			parts.append(_rate_and_name(resource, rate))
	return ", ".join(parts)


## What a tech makes usable: the modules or goods its recipes make, else the recipes' names.
func _unlocks_text(entry: ResearchCatalog.Tech) -> String:
	var definitions := Services.definitions
	var parts := PackedStringArray()
	for key: String in entry.unlocks_blueprints:
		var recipe := definitions.blueprint(key)
		if recipe == null:
			continue
		if recipe.category == "MANUFACTURING" and not recipe.outputs.is_empty():
			for output: Array in recipe.outputs:
				var item: String = output[0]
				var shown := _resource_name(item)
				if not parts.has(shown):
					parts.append(shown)
		elif not parts.has(recipe.display_name):
			parts.append(recipe.display_name)
	return ", ".join(parts)


func _researched_text(catalog: ResearchCatalog, research: ResearchState) -> String:
	var names := PackedStringArray()
	for key: String in research.researched.keys():
		var entry := catalog.tech(key)
		names.append(entry.display_name if entry != null else tr("RESEARCH_SOMETHING"))
	if names.is_empty():
		return tr("RESEARCH_NOTHING_DONE")
	names.sort()
	return ", ".join(names)


func _category_name(category: String) -> String:
	return tr("RESEARCH_CATEGORY_" + category) if CATEGORIES.has(category) else tr("RESEARCH_CATEGORY_UNKNOWN")


func _module_name(key: String) -> String:
	var module_def := Services.definitions.module(key) if Services.definitions != null else null
	return module_def.display_name if module_def != null else tr("RESEARCH_SOMETHING")


func _resource_name(key: String) -> String:
	var shown := Services.definitions.resource_name(key) if Services.definitions != null else ""
	return shown if not shown.is_empty() else tr("STORE_UNKNOWN_ITEM")


func _rate_and_name(resource: String, rate: int) -> String:
	return tr("RESEARCH_RATE_ITEM").format({"rate": _rate(rate, _scale()), "name": _resource_name(resource)})


static func _rate(micro_per_hour: int, scale: int) -> String:
	var text := AmountFormat.rate(micro_per_hour, scale).trim_prefix("+")
	return text if not text.is_empty() else "0/h"


static func _scale() -> int:
	var definitions := Services.definitions
	return definitions.fixed_point_scale if definitions != null and definitions.fixed_point_scale > 0 else 1000000
