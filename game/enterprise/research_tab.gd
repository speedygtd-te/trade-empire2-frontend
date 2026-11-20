class_name EnterpriseResearchTab
extends EnterpriseTab
## The enterprise tech tree (draft.37): the running research on top (progress, time left, or why
## it is paused — the Enterprise Lab in the flagship does not work), cancelling it in two steps
## (nothing is refunded); below, the techs by tier E1–E4, each with its state: researched,
## running, available with cost and time, or locked with the missing prerequisites. A tap opens
## a tech under the list: cost (what the inventory lacks in red), time, what it unlocks, and
## "Start research" in two steps — only with MANAGE_TREASURY and a flagship, otherwise the
## reason. Loaded again every minute while shown.

const RELOAD_SECONDS := 60.0
const TICK_SECONDS := 1.0

var _state: Label
var _running_box: VBoxContainer
var _running_line: Label = null
var _running_bar: ProgressBar = null
var _list: VBoxContainer
var _detail: VBoxContainer
var _chosen := ""
var _tick := 0.0
var _reload := 0.0


func _build() -> void:
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	add_child(_state)
	_running_box = Ui.column(10)
	add_child(_running_box)
	_list = scroll_column(self, 8)
	_detail = Ui.column(10)
	add_child(_detail)
	model.research_changed.connect(refresh)
	model.flagship_changed.connect(refresh)
	model.stock_changed.connect(refresh)
	model.changed.connect(refresh)


func shown() -> void:
	model.reload_research()
	if model.flagship == null:
		model.reload_flagship()
	if model.stock == null:
		model.reload_stock()
	_reload = RELOAD_SECONDS


func handle_back() -> bool:
	if super.handle_back():
		return true
	if not _chosen.is_empty():
		_chosen = ""
		refresh()
		return true
	return false


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	_tick -= delta
	if _tick <= 0.0:
		_tick = TICK_SECONDS
		_update_running()
	_reload -= delta
	if _reload <= 0.0:
		_reload = RELOAD_SECONDS
		model.reload_research()


func _has_flagship() -> bool:
	return model.flagship != null and model.flagship.status == EnterpriseFlagship.ACTIVE


func refresh() -> void:
	if _list == null:
		return
	clear(_running_box)
	clear(_list)
	clear(_detail)
	_running_line = null
	_running_bar = null
	var research := model.research
	_state.visible = research == null or not _has_flagship() or not holds(Enterprise.FLAG_TREASURY)
	if research == null:
		_state.text = tr("COMMON_LOADING") if model.research_error == null else \
			tr("ENTERPRISE_RESEARCH_LOAD_FAILED") + "\n" + ErrorText.describe(model.research_error, self)
		return
	var notes := PackedStringArray()
	if not _has_flagship():
		notes.append(tr("ENTERPRISE_RESEARCH_NO_FLAGSHIP"))
	if not holds(Enterprise.FLAG_TREASURY):
		notes.append(right_needed(Enterprise.FLAG_TREASURY))
	_state.text = "\n".join(notes)
	_show_running(research)
	for tier: int in EnterpriseResearch.TIERS:
		var techs := research.in_tier(tier)
		if techs.is_empty():
			continue
		techs.sort_custom(func(a: EnterpriseResearch.Tech, b: EnterpriseResearch.Tech) -> bool:
			return a.name.naturalnocasecmp_to(b.name) < 0)
		_list.add_child(Ui.spacer(4))
		text_label(_list, tr("ENTERPRISE_RESEARCH_TIER").format({"tier": tier}), AppTheme.VARIATION_MUTED)
		for tech: EnterpriseResearch.Tech in techs:
			_tech_row(research, tech)
	if not _chosen.is_empty() and research.tech(_chosen) != null:
		_show_detail(research, research.tech(_chosen))


func _show_running(research: EnterpriseResearch) -> void:
	var running := research.running
	if running == null:
		text_label(_running_box, tr("ENTERPRISE_RESEARCH_IDLE"), AppTheme.VARIATION_MUTED)
		return
	var box := card(_running_box)
	text_label(box, tr("ENTERPRISE_RESEARCH_RUNNING").format({"tech": _tech_name(research, running.tech)}), AppTheme.VARIATION_HEADING)
	_running_bar = bar(box, 0.0)
	_running_line = text_label(box, "")
	if not running.running:
		var paused := text_label(box, tr("ENTERPRISE_RESEARCH_PAUSED"))
		paused.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)
	if holds(Enterprise.FLAG_TREASURY):
		var cancel := action_button(box, tr("ENTERPRISE_RESEARCH_CANCEL_CONFIRM") if armed == "cancel" else tr("ENTERPRISE_RESEARCH_CANCEL"), true)
		cancel.disabled = busy
		cancel.pressed.connect(_on_cancel)
		if armed == "cancel":
			var warning := text_label(box, tr("ENTERPRISE_RESEARCH_CANCEL_WARNING"))
			warning.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
	_update_running()


func _update_running() -> void:
	var research := model.research
	if research == null or research.running == null or _running_line == null or not is_instance_valid(_running_line):
		return
	var now := Services.clock.now_ms()
	var left := TimeFormat.duration(research.remaining_at(now))
	_running_line.text = tr("ENTERPRISE_RESEARCH_LEFT").format({"duration": left}) if research.running.running \
		else tr("ENTERPRISE_RESEARCH_LEFT_PAUSED").format({"duration": left})
	if _running_bar != null and is_instance_valid(_running_bar):
		_running_bar.value = research.progress_at(now)


func _tech_row(research: EnterpriseResearch, tech: EnterpriseResearch.Tech) -> void:
	var row := ListButton.new()
	row.alignment = HORIZONTAL_ALIGNMENT_LEFT
	row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.set_chosen(tech.key == _chosen)
	var line := ""
	var color := AppTheme.COLOR_TEXT
	match research.state_of(tech.key):
		EnterpriseResearch.State.RESEARCHED:
			line = tr("ENTERPRISE_RESEARCH_STATE_DONE")
			color = AppTheme.COLOR_OK
		EnterpriseResearch.State.RUNNING:
			line = tr("ENTERPRISE_RESEARCH_STATE_RUNNING")
			color = AppTheme.COLOR_ACCENT
		EnterpriseResearch.State.AVAILABLE:
			line = tr("ENTERPRISE_RESEARCH_STATE_AVAILABLE").format({"duration": TimeFormat.duration(tech.duration_ms)})
		_:
			line = tr("ENTERPRISE_RESEARCH_STATE_LOCKED").format({"techs": _names(research, research.missing_prerequisites(tech.key))})
			color = AppTheme.COLOR_MUTED
	row.text = "%s\n%s" % [tech.name, line]
	row.add_theme_color_override("font_color", color)
	var key := tech.key
	row.tapped.connect(func() -> void:
		_chosen = "" if _chosen == key else key
		armed = ""
		refresh())
	_list.add_child(row)


func _show_detail(research: EnterpriseResearch, tech: EnterpriseResearch.Tech) -> void:
	var box := card(_detail)
	text_label(box, tech.name, AppTheme.VARIATION_HEADING)
	var short := EnterpriseResearch.shortfall(tech.cost, model.stock, Services.clock.now_ms()) if model.stock != null else {}
	var cost := text_label(box, tr("ENTERPRISE_RESEARCH_COST").format({"cost": costs_text(tech.cost, self),
		"duration": TimeFormat.duration(tech.duration_ms)}))
	if research.state_of(tech.key) == EnterpriseResearch.State.AVAILABLE and not short.is_empty():
		cost.add_theme_color_override("font_color", AppTheme.COLOR_DANGER)
		var lacks: Array[Array] = []
		for resource: String in short.keys():
			lacks.append([resource, Wire.as_int(short[resource])])
		text_label(box, tr("ENTERPRISE_RESEARCH_LACKS").format({"cost": costs_text(lacks, self)}), AppTheme.VARIATION_MUTED)
	if not tech.unlocks.is_empty():
		var names := PackedStringArray()
		for unlock: String in tech.unlocks:
			names.append(blueprint_text(unlock, self))
		text_label(box, tr("ENTERPRISE_RESEARCH_UNLOCKS").format({"items": ", ".join(names)}), AppTheme.VARIATION_MUTED)
	if not tech.prerequisites.is_empty():
		text_label(box, tr("ENTERPRISE_RESEARCH_NEEDS").format({"techs": _names(research, tech.prerequisites)}), AppTheme.VARIATION_MUTED)
	var reason := research.start_blocker(tech.key, holds(Enterprise.FLAG_TREASURY), _has_flagship())
	if reason == "done" or reason == "locked":
		return
	var start := action_button(box, tr("ENTERPRISE_RESEARCH_START_CONFIRM").format({"cost": costs_text(tech.cost, self)})
		if armed == "start" else tr("ENTERPRISE_RESEARCH_START"), false, true)
	start.disabled = busy or not reason.is_empty()
	start.pressed.connect(_on_start.bind(tech.key))
	if not reason.is_empty():
		text_label(box, _reason_text(reason), AppTheme.VARIATION_MUTED)
	elif armed == "start":
		var warning := text_label(box, tr("ENTERPRISE_RESEARCH_START_WARNING"))
		warning.add_theme_color_override("font_color", AppTheme.COLOR_PENDING)


func _reason_text(reason: String) -> String:
	match reason:
		"busy":
			return tr("ENTERPRISE_RESEARCH_WHY_BUSY")
		"flagship":
			return tr("ENTERPRISE_RESEARCH_NO_FLAGSHIP")
		"right":
			return right_needed(Enterprise.FLAG_TREASURY)
	return ""


func _tech_name(research: EnterpriseResearch, key: String) -> String:
	var shown := research.name_of(key)
	return shown if not shown.is_empty() else tr("ENTERPRISE_RESEARCH_UNKNOWN_TECH")


func _names(research: EnterpriseResearch, keys: PackedStringArray) -> String:
	var parts := PackedStringArray()
	for key: String in keys:
		parts.append(_tech_name(research, key))
	return ", ".join(parts)


func _on_start(key: String) -> void:
	if not confirm("start"):
		return
	if await run(func() -> ApiResult: return await model.start_research(key), "ENTERPRISE_RESEARCH_STARTED"):
		_chosen = ""
		refresh()


func _on_cancel() -> void:
	if not confirm("cancel"):
		return
	await run(func() -> ApiResult: return await model.cancel_research(), "ENTERPRISE_RESEARCH_CANCELLED")
