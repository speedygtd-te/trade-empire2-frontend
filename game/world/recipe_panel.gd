class_name RecipePanel
extends VBoxContainer
## The recipes (blueprints) a module can run, to choose one. Each entry shows what goes in and
## what comes out per hour; recipes that need research first are shown but cannot be chosen.

## The player chose a recipe; "" clears it.
signal chosen(blueprint: String)
signal closed

const LIST_HEIGHT := 520

var _list: VBoxContainer


func _ready() -> void:
	add_theme_constant_override("separation", 12)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(0, LIST_HEIGHT)
	add_child(scroll)
	_list = Ui.column(10)
	scroll.add_child(_list)
	var back := Ui.secondary_button("COMMON_CLOSE")
	back.pressed.connect(func() -> void: closed.emit())
	add_child(back)


## Fills the list for a module type; `current` is the recipe set now, `usable` the keys the
## player may use (basis or researched).
func show_recipes(module_type: String, current: String, usable: Dictionary) -> void:
	for child: Node in _list.get_children():
		child.queue_free()
	var definitions := Services.definitions
	var none := _entry(tr("RECIPE_NONE"), "", current.is_empty(), true)
	none.pressed.connect(func() -> void: chosen.emit(""))
	_list.add_child(none)
	for recipe: GameDefinitions.BlueprintDef in definitions.blueprints_for(module_type):
		var allowed := usable.has(recipe.key)
		var text := "%s\n%s" % [recipe.display_name, describe(recipe)]
		if not allowed:
			text += "\n" + tr("RECIPE_LOCKED")
		var button := _entry(text, recipe.key, recipe.key == current, allowed)
		button.pressed.connect(func() -> void: chosen.emit(recipe.key))
		_list.add_child(button)


## "2 Iron → 1 Iron Plate per hour" style text of a recipe.
static func describe(recipe: GameDefinitions.BlueprintDef) -> String:
	var definitions := Services.definitions
	var scale := definitions.fixed_point_scale if definitions.fixed_point_scale > 0 else 1000000
	var inputs := _flows(recipe.inputs, scale)
	var outputs := _flows(recipe.outputs, scale)
	if inputs.is_empty():
		return TranslationServer.translate("RECIPE_MAKES").format({"outputs": outputs})
	return TranslationServer.translate("RECIPE_TURNS").format({"inputs": inputs, "outputs": outputs})


static func _flows(flows: Array[Array], scale: int) -> String:
	var parts := PackedStringArray()
	for flow: Array in flows:
		var key: String = flow[0]
		var rate: int = flow[1]
		var name := Services.definitions.resource_name(key)
		var amount := AmountFormat.rate(rate, scale).trim_prefix("+").trim_suffix("/h")
		parts.append("%s %s" % [amount, name if not name.is_empty() else TranslationServer.translate("STORE_UNKNOWN_ITEM")])
	return ", ".join(parts)


func _entry(text: String, _key: String, selected: bool, enabled: bool) -> Button:
	var button := Button.new()
	button.text = text
	button.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button.custom_minimum_size = Vector2(0, AppTheme.TOUCH_MIN)
	button.toggle_mode = true
	button.button_pressed = selected
	button.disabled = not enabled
	return button
