class_name AppTheme
extends RefCounted
## The one UI theme of the game, built in code.
##
## Colour carries meaning and is used consistently: cyan = action / selection / active,
## red = danger / error, amber = pending, emerald = fine. The canvas is 720 px wide, so one
## density-independent pixel is two canvas pixels: a touch target is at least 88 px.

## Minimum height (and width for icon-only controls) of anything tappable.
const TOUCH_MIN := 88
## Height of a progress bar.
const BAR_HEIGHT := 16
## Bottom navigation: height of an entry (active bar, icon, label) without the system bar's
## inset, the icon size, the active bar's thickness and the badge dot.
const NAV_HEIGHT := 112
const NAV_ICON := 48
const NAV_BAR := 6
const BADGE_SIZE := 16

const FONT_SIZE := 30
const FONT_SIZE_SMALL := 24
const FONT_SIZE_HEADING := 38
const FONT_SIZE_TITLE := 56

const COLOR_BACKGROUND := Color(0.039, 0.059, 0.110)
const COLOR_PANEL := Color(0.067, 0.094, 0.153)
const COLOR_PANEL_LIGHT := Color(0.122, 0.161, 0.216)
const COLOR_BORDER := Color(0.216, 0.255, 0.318)
const COLOR_INPUT := Color(0.059, 0.090, 0.165)
const COLOR_TEXT := Color(0.898, 0.906, 0.922)
const COLOR_MUTED := Color(0.612, 0.639, 0.686)
const COLOR_DISABLED := Color(0.42, 0.45, 0.50)
const COLOR_ACCENT := Color(0.133, 0.827, 0.933)
const COLOR_ACCENT_FILL := Color(0.055, 0.455, 0.565)
const COLOR_ACCENT_PRESSED := Color(0.082, 0.369, 0.459)
const COLOR_DANGER := Color(0.973, 0.443, 0.443)
const COLOR_OK := Color(0.204, 0.827, 0.600)
const COLOR_PENDING := Color(0.984, 0.749, 0.141)
const COLOR_TRANSPARENT := Color(0, 0, 0, 0)
## The two colours of the drawn icons (game/ui/icons/*.svg): navy fills, medium-yellow strokes
## and accents. New icons use the same two.
const ICON_NAVY := Color(0.141, 0.204, 0.369)
const ICON_YELLOW := Color(0.890, 0.702, 0.255)

const VARIATION_PRIMARY_BUTTON := "PrimaryButton"
const VARIATION_DANGER_BUTTON := "DangerButton"
const VARIATION_TAB_BUTTON := "TabButton"
const VARIATION_NAV_BUTTON := "NavButton"
const VARIATION_TITLE := "TitleLabel"
const VARIATION_HEADING := "HeadingLabel"
const VARIATION_MUTED := "MutedLabel"
const VARIATION_ERROR := "ErrorLabel"


static func build() -> Theme:
	var theme := Theme.new()
	theme.default_font_size = FONT_SIZE

	theme.set_color("font_color", "Label", COLOR_TEXT)
	_label_variation(theme, VARIATION_TITLE, COLOR_ACCENT, FONT_SIZE_TITLE)
	_label_variation(theme, VARIATION_HEADING, COLOR_TEXT, FONT_SIZE_HEADING)
	_label_variation(theme, VARIATION_MUTED, COLOR_MUTED, FONT_SIZE_SMALL)
	_label_variation(theme, VARIATION_ERROR, COLOR_DANGER, FONT_SIZE_SMALL)

	# The plain Button is the secondary role.
	theme.set_stylebox("normal", "Button", _box(COLOR_PANEL_LIGHT, COLOR_BORDER))
	theme.set_stylebox("hover", "Button", _box(COLOR_PANEL_LIGHT, COLOR_BORDER))
	theme.set_stylebox("pressed", "Button", _box(COLOR_PANEL, COLOR_ACCENT))
	theme.set_stylebox("disabled", "Button", _box(COLOR_PANEL, COLOR_PANEL_LIGHT))
	theme.set_stylebox("focus", "Button", _focus_ring())
	_button_font_colors(theme, "Button", COLOR_TEXT, COLOR_ACCENT)

	theme.set_type_variation(VARIATION_PRIMARY_BUTTON, "Button")
	theme.set_stylebox("normal", VARIATION_PRIMARY_BUTTON, _box(COLOR_ACCENT_FILL, COLOR_ACCENT))
	theme.set_stylebox("hover", VARIATION_PRIMARY_BUTTON, _box(COLOR_ACCENT_FILL, COLOR_ACCENT))
	theme.set_stylebox("pressed", VARIATION_PRIMARY_BUTTON, _box(COLOR_ACCENT_PRESSED, COLOR_ACCENT))
	theme.set_stylebox("disabled", VARIATION_PRIMARY_BUTTON, _box(COLOR_PANEL, COLOR_PANEL_LIGHT))
	theme.set_stylebox("focus", VARIATION_PRIMARY_BUTTON, _focus_ring())
	_button_font_colors(theme, VARIATION_PRIMARY_BUTTON, Color.WHITE, Color.WHITE)

	# Destructive actions: red outline and text, so they never look like the main action.
	theme.set_type_variation(VARIATION_DANGER_BUTTON, "Button")
	theme.set_stylebox("normal", VARIATION_DANGER_BUTTON, _box(COLOR_PANEL, COLOR_DANGER))
	theme.set_stylebox("hover", VARIATION_DANGER_BUTTON, _box(COLOR_PANEL, COLOR_DANGER))
	theme.set_stylebox("pressed", VARIATION_DANGER_BUTTON, _box(COLOR_PANEL_LIGHT, COLOR_DANGER))
	theme.set_stylebox("disabled", VARIATION_DANGER_BUTTON, _box(COLOR_PANEL, COLOR_PANEL_LIGHT))
	theme.set_stylebox("focus", VARIATION_DANGER_BUTTON, _focus_ring())
	_button_font_colors(theme, VARIATION_DANGER_BUTTON, COLOR_DANGER, COLOR_DANGER)

	# Tabs: a toggle button with an underline while selected. The unselected tab keeps a
	# transparent underline of the same width so the row does not jump.
	theme.set_type_variation(VARIATION_TAB_BUTTON, "Button")
	theme.set_stylebox("normal", VARIATION_TAB_BUTTON, _underline(COLOR_TRANSPARENT))
	theme.set_stylebox("hover", VARIATION_TAB_BUTTON, _underline(COLOR_TRANSPARENT))
	theme.set_stylebox("pressed", VARIATION_TAB_BUTTON, _underline(COLOR_ACCENT))
	theme.set_stylebox("hover_pressed", VARIATION_TAB_BUTTON, _underline(COLOR_ACCENT))
	theme.set_stylebox("disabled", VARIATION_TAB_BUTTON, _underline(COLOR_TRANSPARENT))
	theme.set_stylebox("focus", VARIATION_TAB_BUTTON, StyleBoxEmpty.new())
	_button_font_colors(theme, VARIATION_TAB_BUTTON, COLOR_MUTED, COLOR_ACCENT)

	# Entries of the bottom navigation: no frame; the entry draws its own active bar and label.
	theme.set_type_variation(VARIATION_NAV_BUTTON, "Button")
	for state: String in ["normal", "hover", "pressed", "hover_pressed", "disabled", "focus"]:
		theme.set_stylebox(state, VARIATION_NAV_BUTTON, StyleBoxEmpty.new())

	theme.set_stylebox("normal", "LineEdit", _box(COLOR_INPUT, COLOR_BORDER))
	theme.set_stylebox("focus", "LineEdit", _box(COLOR_INPUT, COLOR_ACCENT))
	theme.set_stylebox("read_only", "LineEdit", _box(COLOR_PANEL, COLOR_PANEL_LIGHT))
	theme.set_color("font_color", "LineEdit", COLOR_TEXT)
	theme.set_color("font_placeholder_color", "LineEdit", COLOR_MUTED)
	theme.set_color("font_uneditable_color", "LineEdit", COLOR_DISABLED)
	theme.set_color("caret_color", "LineEdit", COLOR_ACCENT)

	theme.set_stylebox("panel", "PanelContainer", _box(COLOR_PANEL, COLOR_PANEL_LIGHT, 28))

	# Progress: a cyan fill on a dark track.
	theme.set_stylebox("background", "ProgressBar", _bar(COLOR_PANEL_LIGHT))
	theme.set_stylebox("fill", "ProgressBar", _bar(COLOR_ACCENT))
	return theme


static func _label_variation(theme: Theme, variation: String, color: Color, font_size: int) -> void:
	theme.set_type_variation(variation, "Label")
	theme.set_color("font_color", variation, color)
	theme.set_font_size("font_size", variation, font_size)


static func _button_font_colors(theme: Theme, type: String, normal: Color, active: Color) -> void:
	theme.set_color("font_color", type, normal)
	theme.set_color("font_hover_color", type, normal)
	theme.set_color("font_focus_color", type, normal)
	theme.set_color("font_pressed_color", type, active)
	theme.set_color("font_hover_pressed_color", type, active)
	theme.set_color("font_disabled_color", type, COLOR_DISABLED)


static func _box(background: Color, border: Color, padding: int = 20) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = background
	box.border_color = border
	box.set_border_width_all(2)
	box.set_corner_radius_all(12)
	box.set_content_margin_all(padding)
	return box


static func _underline(color: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = COLOR_TRANSPARENT
	box.border_color = color
	box.border_width_bottom = 4
	box.set_content_margin_all(16)
	return box


static func _bar(color: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.set_corner_radius_all(8)
	return box


static func _focus_ring() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = COLOR_TRANSPARENT
	box.border_color = COLOR_ACCENT
	box.set_border_width_all(3)
	box.set_corner_radius_all(12)
	return box
