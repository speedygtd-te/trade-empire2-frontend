class_name Ui
extends RefCounted
## Factory for the standard controls, so every screen gets the same roles and sizes.
##
## Texts passed here are translation keys; Godot translates them automatically. Controls whose
## text is set from code with an already translated string come from `dynamic_label`.


static func label(text_key: String, variation: String = "") -> Label:
	var node := Label.new()
	node.text = text_key
	node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if not variation.is_empty():
		node.theme_type_variation = variation
	return node


## A label whose text is assigned later with a finished (translated, formatted) string.
static func dynamic_label(variation: String = "") -> Label:
	var node := label("", variation)
	node.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	return node


## Primary action: one per screen area, full width.
static func primary_button(text_key: String) -> Button:
	var node := _button(text_key)
	node.theme_type_variation = AppTheme.VARIATION_PRIMARY_BUTTON
	return node


static func secondary_button(text_key: String) -> Button:
	return _button(text_key)


## A square button showing only an icon (TOUCH_MIN × TOUCH_MIN); `tooltip_key` names it for the
## mouse and for screen readers.
static func icon_button(icon: Texture2D, tooltip_key: String) -> Button:
	var node := Button.new()
	node.icon = icon
	node.tooltip_text = tooltip_key
	node.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	node.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
	node.custom_minimum_size = Vector2(AppTheme.TOUCH_MIN, AppTheme.TOUCH_MIN)
	return node


static func tab_button(text_key: String, group: ButtonGroup) -> Button:
	var node := _button(text_key)
	node.theme_type_variation = AppTheme.VARIATION_TAB_BUTTON
	node.toggle_mode = true
	node.button_group = group
	return node


static func line_edit(placeholder_key: String) -> LineEdit:
	var node := LineEdit.new()
	node.placeholder_text = placeholder_key
	node.custom_minimum_size = Vector2(0, AppTheme.TOUCH_MIN)
	node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return node


## A bar for a share 0..1 (research progress). It shows no number itself; the text goes next to it.
static func progress_bar() -> ProgressBar:
	var node := ProgressBar.new()
	node.min_value = 0.0
	node.max_value = 1.0
	node.step = 0.0
	node.show_percentage = false
	node.custom_minimum_size = Vector2(0, AppTheme.BAR_HEIGHT)
	node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return node


static func spacer(height: float) -> Control:
	var node := Control.new()
	node.custom_minimum_size = Vector2(0, height)
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return node


static func column(separation: int) -> VBoxContainer:
	var node := VBoxContainer.new()
	node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	node.add_theme_constant_override("separation", separation)
	return node


static func _button(text_key: String) -> Button:
	var node := Button.new()
	node.text = text_key
	node.custom_minimum_size = Vector2(AppTheme.TOUCH_MIN, AppTheme.TOUCH_MIN)
	node.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return node
