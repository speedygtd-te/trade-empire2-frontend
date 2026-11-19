class_name EnterpriseFoundTab
extends EnterpriseTab
## Founding an enterprise: names are generated, never typed — pick one of up to five (or ask for
## new ones), add a description, choose who may join, found. Free of charge.

var _suggestions: Array[Enterprise.Suggestion] = []
var _chosen := -1
var _loading := false
var _error: ApiError = null
var _list: VBoxContainer
var _state: Label
var _description: LineEdit
var _open_button: Button
var _closed_button: Button
var _found: Button


func _build() -> void:
	var column := scroll_column(self, 14)
	column.add_child(Ui.label("ENTERPRISE_FOUND_INTRO", AppTheme.VARIATION_MUTED))
	_state = Ui.dynamic_label(AppTheme.VARIATION_MUTED)
	column.add_child(_state)
	_list = Ui.column(10)
	column.add_child(_list)
	var again := Ui.secondary_button("ENTERPRISE_NEW_NAMES")
	again.pressed.connect(_load_names)
	column.add_child(again)
	column.add_child(Ui.label("ENTERPRISE_DESCRIPTION", AppTheme.VARIATION_MUTED))
	_description = Ui.line_edit("ENTERPRISE_DESCRIPTION_HINT")
	_description.max_length = Enterprise.DESCRIPTION_MAX
	column.add_child(_description)
	column.add_child(Ui.label("ENTERPRISE_WHO_JOINS", AppTheme.VARIATION_MUTED))
	var modes := button_row(column)
	var group := ButtonGroup.new()
	_open_button = Ui.tab_button("ENTERPRISE_JOIN_MODE_OPEN", group)
	_open_button.button_pressed = true
	modes.add_child(_open_button)
	_closed_button = Ui.tab_button("ENTERPRISE_JOIN_MODE_CLOSED", group)
	modes.add_child(_closed_button)
	_found = Ui.primary_button("ENTERPRISE_FOUND")
	_found.pressed.connect(_on_found)
	add_child(_found)


func shown() -> void:
	if _suggestions.is_empty() and not _loading:
		_load_names()


func refresh() -> void:
	if _list == null:
		return
	clear(_list)
	_state.visible = _loading or _error != null or _suggestions.is_empty()
	if _loading:
		_state.text = tr("ENTERPRISE_NAMES_LOADING")
	elif _error != null:
		_state.text = ErrorText.describe(_error, self)
	else:
		_state.text = tr("ENTERPRISE_NAMES_EMPTY")
	for index: int in _suggestions.size():
		var suggestion := _suggestions[index]
		var row := ListButton.new()
		row.text = "%s  [%s]" % [suggestion.name, suggestion.ticker]
		row.alignment = HORIZONTAL_ALIGNMENT_LEFT
		row.set_chosen(index == _chosen)
		row.tapped.connect(_choose.bind(index))
		_list.add_child(row)
	_found.disabled = busy or _chosen < 0


func _choose(index: int) -> void:
	_chosen = index
	refresh()


func _load_names() -> void:
	if _loading:
		return
	_loading = true
	_error = null
	refresh()
	var answer := await model.suggest_names()
	_loading = false
	if not is_inside_tree():
		return
	if answer.is_ok():
		_suggestions = Enterprise.suggestions_from_wire(answer.data)
		_chosen = 0 if not _suggestions.is_empty() else -1
	else:
		_error = answer.error
	refresh()


func _on_found() -> void:
	if _chosen < 0 or _chosen >= _suggestions.size():
		return
	var suggestion := _suggestions[_chosen]
	var text := _description.text.strip_edges()
	var open := _open_button.button_pressed
	var result: ApiResult = null
	busy = true
	say("")
	refresh()
	result = await model.found(suggestion, text, open)
	busy = false
	if not is_inside_tree():
		return
	if not result.is_ok():
		say_error(result.error)
		if result.error.code == "ENTERPRISE_NAME_TAKEN":
			# Taken in the meantime: fresh names.
			_suggestions.clear()
			_chosen = -1
			_load_names()
	refresh()
