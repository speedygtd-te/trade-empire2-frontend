class_name SafeAreaMargin
extends MarginContainer
## Screen-edge padding that also keeps content out of notches, rounded corners and system bars.
##
## On phones the operating system reports a safe rectangle in screen pixels; it is converted to
## canvas units and added to the base margin. On desktop only the base margin applies.

const BASE_MARGIN := 32


func _ready() -> void:
	get_viewport().size_changed.connect(_apply)
	_apply()


func _apply() -> void:
	var left := 0.0
	var top := 0.0
	var right := 0.0
	var bottom := 0.0
	var window := Vector2(DisplayServer.window_get_size())
	if OS.has_feature("mobile") and window.x > 0.0 and window.y > 0.0:
		var safe := DisplayServer.get_display_safe_area()
		var screen := DisplayServer.screen_get_size()
		var scale_to_canvas := get_viewport().get_visible_rect().size / window
		left = maxf(safe.position.x, 0.0) * scale_to_canvas.x
		top = maxf(safe.position.y, 0.0) * scale_to_canvas.y
		right = maxf(screen.x - safe.end.x, 0.0) * scale_to_canvas.x
		bottom = maxf(screen.y - safe.end.y, 0.0) * scale_to_canvas.y
	add_theme_constant_override("margin_left", BASE_MARGIN + roundi(left))
	add_theme_constant_override("margin_top", BASE_MARGIN + roundi(top))
	add_theme_constant_override("margin_right", BASE_MARGIN + roundi(right))
	add_theme_constant_override("margin_bottom", BASE_MARGIN + roundi(bottom))
