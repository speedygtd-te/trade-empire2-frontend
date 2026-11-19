class_name SafeAreaMargin
extends MarginContainer
## Screen-edge padding that also keeps content out of notches, rounded corners and system bars.
##
## On phones the operating system reports a safe rectangle in screen pixels; it is converted to
## canvas units and added to the base margin. On desktop only the base margin applies.
##
## Inside the area above the bottom navigation (a node in ABOVE_NAV_GROUP) the bottom edge is
## the navigation, which keeps the system bar's inset itself: there only a small gap is left.

const BASE_MARGIN := 32
## Bottom padding of content that sits right above the bottom navigation.
const NAV_GAP := 16
## Group of the area above the bottom navigation.
const ABOVE_NAV_GROUP := "above_bottom_nav"


func _ready() -> void:
	get_viewport().size_changed.connect(_apply)
	_apply()


## The system's insets in canvas units: x left, y top, z right, w bottom (all 0 on desktop).
static func insets(viewport: Viewport) -> Vector4:
	var window := Vector2(DisplayServer.window_get_size())
	if not OS.has_feature("mobile") or window.x <= 0.0 or window.y <= 0.0:
		return Vector4.ZERO
	var safe := DisplayServer.get_display_safe_area()
	var screen := DisplayServer.screen_get_size()
	var scale_to_canvas := viewport.get_visible_rect().size / window
	return Vector4(maxf(safe.position.x, 0.0) * scale_to_canvas.x, maxf(safe.position.y, 0.0) * scale_to_canvas.y,
		maxf(screen.x - safe.end.x, 0.0) * scale_to_canvas.x, maxf(screen.y - safe.end.y, 0.0) * scale_to_canvas.y)


## Whether this margin lies in the area above the bottom navigation.
func is_above_nav() -> bool:
	var node := get_parent()
	while node != null:
		if node.is_in_group(ABOVE_NAV_GROUP):
			return true
		node = node.get_parent()
	return false


func _apply() -> void:
	var inset := insets(get_viewport())
	add_theme_constant_override("margin_left", BASE_MARGIN + roundi(inset.x))
	add_theme_constant_override("margin_top", BASE_MARGIN + roundi(inset.y))
	add_theme_constant_override("margin_right", BASE_MARGIN + roundi(inset.z))
	add_theme_constant_override("margin_bottom", NAV_GAP if is_above_nav() else BASE_MARGIN + roundi(inset.w))
