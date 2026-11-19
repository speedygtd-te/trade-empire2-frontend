class_name TabStrip
extends ScrollContainer
## One row of tabs. When they are wider than the screen the row scrolls sideways (a swipe that
## starts on a tab scrolls and does not choose it — ListButton); otherwise the tabs share the
## width. The chosen tab is underlined in cyan and kept in sight.

## The player chose a tab (not sent by `select`).
signal tab_selected(index: int)

var _row: HBoxContainer
var _buttons: Array[ListButton] = []
var _current := -1


func _init() -> void:
	horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_row = HBoxContainer.new()
	_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_row.add_theme_constant_override("separation", 0)
	add_child(_row)


## Adds a tab with a translation key as its text; returns its button (to hide or show it).
func add_tab(text_key: String) -> Button:
	var button := ListButton.new()
	button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_INHERIT
	button.text = text_key
	button.theme_type_variation = AppTheme.VARIATION_TAB_BUTTON
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.focus_mode = Control.FOCUS_NONE
	var index := _buttons.size()
	button.tapped.connect(_on_tapped.bind(index))
	_row.add_child(button)
	_buttons.append(button)
	return button


## Removes every tab.
func clear() -> void:
	for button: ListButton in _buttons:
		button.queue_free()
	_buttons.clear()
	_current = -1


func tab_count() -> int:
	return _buttons.size()


func tab(index: int) -> Button:
	return _buttons[index] if index >= 0 and index < _buttons.size() else null


func selected() -> int:
	return _current


## Marks tab `index` as chosen without sending `tab_selected`.
func select(index: int) -> void:
	_current = index
	for position: int in _buttons.size():
		_buttons[position].set_chosen(position == index)
	if index >= 0 and index < _buttons.size() and is_inside_tree():
		_keep_in_sight.call_deferred(_buttons[index])


func _on_tapped(index: int) -> void:
	select(index)
	tab_selected.emit(index)


func _keep_in_sight(button: ListButton) -> void:
	if is_instance_valid(button) and button.is_inside_tree():
		ensure_control_visible(button)
