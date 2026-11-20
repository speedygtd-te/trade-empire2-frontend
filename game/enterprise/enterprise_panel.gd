class_name EnterprisePanel
extends Control
## The enterprise over the whole screen, a layer of the Profile tab. Without one: browse the
## enterprises (invitations first) or found one. As a member: logo, name, ticker and members (of
## the cap) on top, and the tabs Overview, Flagship, Research, Factory, Members, Roles, Diplomacy,
## Taxes and Log in one row (it scrolls sideways when it is wider than the screen). Flagship,
## Research and Factory (draft.37) are hidden on a server without them. "‹ Back" or Back returns (Back first closes
## whatever is open inside a tab).

signal closed

## Tab keys in the order they are shown.
const OUTSIDE_TABS: Array[String] = ["ENTERPRISE_TAB_BROWSE", "ENTERPRISE_TAB_FOUND"]
const MEMBER_TABS: Array[String] = [
	"ENTERPRISE_TAB_OVERVIEW", "ENTERPRISE_TAB_FLAGSHIP", "ENTERPRISE_TAB_RESEARCH",
	"ENTERPRISE_TAB_FACTORY", "ENTERPRISE_TAB_MEMBERS", "ENTERPRISE_TAB_ROLES",
	"ENTERPRISE_TAB_DIPLOMACY", "ENTERPRISE_TAB_TAXES", "ENTERPRISE_TAB_LOG",
]
## The tabs only a draft.37 server has.
const ASSET_TABS: Array[String] = ["ENTERPRISE_TAB_FLAGSHIP", "ENTERPRISE_TAB_RESEARCH", "ENTERPRISE_TAB_FACTORY"]
const HEADER_LOGO := 128

var _model: EnterpriseModel
var _column: VBoxContainer
var _body: VBoxContainer
var _header: LayerHeader
## The enterprise the body was built for ("" outside one); null before the first build.
var _built_for: Variant = null
var _tabs: Array[EnterpriseTab] = []
## The text key of each tab, in the order of `_tabs`.
var _keys: Array[String] = []
var _strip: TabStrip = null
var _current := 0
var _header_logo: EnterpriseLogo
var _header_name: Label
var _header_line: Label


func setup(model: EnterpriseModel) -> void:
	_model = model


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(margin)
	_column = Ui.column(16)
	margin.add_child(_column)
	_header = LayerHeader.new()
	_header.set_title(tr("ENTERPRISE_TITLE"))
	_header.back_pressed.connect(func() -> void: closed.emit())
	_column.add_child(_header)
	_body = Ui.column(16)
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_column.add_child(_body)
	_model.changed.connect(_on_changed)
	_on_changed()
	_model.reload()


## Back closes something inside the current tab; false when there was nothing to close.
func handle_back() -> bool:
	if _current < _tabs.size() and is_instance_valid(_tabs[_current]):
		return _tabs[_current].handle_back()
	return false


## The tab being shown (for review scenes).
func current_tab() -> EnterpriseTab:
	return _tabs[_current] if _current < _tabs.size() else null


## Shows the tab with text key `key` (ENTERPRISE_TAB_…); false when it is not offered.
func show_tab_key(key: String) -> bool:
	var index := _keys.find(key)
	if index < 0 or not _offered(index):
		return false
	show_tab(index)
	return true


## Shows tab `index` of the current set.
func show_tab(index: int) -> void:
	if index < 0 or index >= _tabs.size():
		return
	_current = index
	for position: int in _tabs.size():
		_tabs[position].visible = position == index
	if _strip != null:
		_strip.select(index)
	_tabs[index].say("")
	_tabs[index].shown()


func _on_changed() -> void:
	var mine := _model.mine
	if not _model.loaded:
		_build_state()
		return
	var id := mine.enterprise_id if mine != null else ""
	if _built_for == null or str(_built_for) != id:
		_build(mine)
	_update_header()
	_update_offered()


## Whether tab `index` is offered (the draft.37 ones only where the server has them).
func _offered(index: int) -> bool:
	return not ASSET_TABS.has(_keys[index]) or _model.has_assets()


func _update_offered() -> void:
	if _strip == null:
		return
	for index: int in _keys.size():
		var button := _strip.tab(index)
		if button != null:
			button.visible = _offered(index)
	if _current < _keys.size() and not _offered(_current):
		show_tab(0)


## Before membership is known: loading, or why it failed with a retry.
func _build_state() -> void:
	if _built_for != null:
		return
	EnterpriseTab.clear(_body)
	_tabs.clear()
	_keys.clear()
	_strip = null
	var state := Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	_body.add_child(state)
	if _model.error != null:
		state.text = tr("ENTERPRISE_LOAD_FAILED") + "\n" + ErrorText.describe(_model.error, self)
		var retry := Ui.secondary_button("COMMON_RETRY")
		retry.pressed.connect(func() -> void: _model.reload())
		_body.add_child(retry)
	else:
		state.text = tr("COMMON_LOADING")


func _build(mine: Enterprise) -> void:
	_built_for = mine.enterprise_id if mine != null else ""
	EnterpriseTab.clear(_body)
	_tabs.clear()
	_keys.clear()
	_strip = null
	_header_logo = null
	if mine != null:
		var header := HBoxContainer.new()
		header.add_theme_constant_override("separation", 20)
		_body.add_child(header)
		_header_logo = EnterpriseLogo.new(_model, HEADER_LOGO)
		header.add_child(_header_logo)
		var names := Ui.column(4)
		names.alignment = BoxContainer.ALIGNMENT_CENTER
		header.add_child(names)
		_header_name = Ui.dynamic_label(AppTheme.VARIATION_HEADING)
		names.add_child(_header_name)
		_header_line = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
		names.add_child(_header_line)
	var keys := MEMBER_TABS if mine != null else OUTSIDE_TABS
	_strip = TabStrip.new()
	for key: String in keys:
		_strip.add_tab(key)
	_strip.tab_selected.connect(show_tab)
	_body.add_child(_strip)
	for key: String in keys:
		var tab := _make_tab(key)
		tab.setup(_model)
		tab.visible = false
		_body.add_child(tab)
		_tabs.append(tab)
		_keys.append(key)
	show_tab(0)


func _make_tab(key: String) -> EnterpriseTab:
	match key:
		"ENTERPRISE_TAB_BROWSE":
			return EnterpriseBrowseTab.new()
		"ENTERPRISE_TAB_FOUND":
			return EnterpriseFoundTab.new()
		"ENTERPRISE_TAB_MEMBERS":
			return EnterpriseMembersTab.new()
		"ENTERPRISE_TAB_ROLES":
			return EnterpriseRolesTab.new()
		"ENTERPRISE_TAB_DIPLOMACY":
			return EnterpriseDiplomacyTab.new()
		"ENTERPRISE_TAB_TAXES":
			return EnterpriseTaxesTab.new()
		"ENTERPRISE_TAB_LOG":
			return EnterpriseLogTab.new()
		"ENTERPRISE_TAB_FLAGSHIP":
			return EnterpriseFlagshipTab.new()
		"ENTERPRISE_TAB_RESEARCH":
			return EnterpriseResearchTab.new()
		"ENTERPRISE_TAB_FACTORY":
			return EnterpriseFactoryTab.new()
	return EnterpriseOverviewTab.new()


func _update_header() -> void:
	var mine := _model.mine
	if mine == null or _header_logo == null:
		return
	_header_logo.show_logo(mine.logo)
	_header_name.text = mine.name
	var line := "%s · %s" % [mine.ticker, EnterpriseTab.cap_text(mine, self)]
	if mine.logo.is_pending():
		line += " · " + tr("ENTERPRISE_LOGO_PENDING")
	_header_line.text = line
