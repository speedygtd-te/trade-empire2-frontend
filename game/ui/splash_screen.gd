class_name SplashScreen
extends Control
## The loading picture: the same image as the boot splash (project setting
## application/boot_splash), so the hand-over from the engine's splash to the app's own loading
## view is not visible. A line at the bottom says what happens ("Loading…"); `set_text` changes
## it, `show_content` adds anything else there (an error with a Retry button). `set_progress`
## adds the step under way and a bar that keeps moving while it runs (LoadProgress).

const IMAGE := preload("res://game/branding/splash.png")
## Darkening at the bottom behind the text, so it stays readable on the bright planet.
const SHADE := Color(0.0, 0.0, 0.0, 0.55)

var _text: Label
var _bottom: VBoxContainer
var _step: Label
var _bar: ProgressBar
var _step_number := 0
var _steps := 0
var _step_seconds := 0.0


func _init(text_key: String = "COMMON_LOADING") -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var background := ColorRect.new()
	background.color = AppTheme.COLOR_BACKGROUND
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	var picture := TextureRect.new()
	picture.texture = IMAGE
	picture.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	picture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	picture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	picture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(picture)
	# A soft fade to dark at the bottom (no hard edge over the picture).
	var fade := Gradient.new()
	fade.set_color(0, Color(SHADE, 0.0))
	fade.set_color(1, SHADE)
	var fade_texture := GradientTexture2D.new()
	fade_texture.gradient = fade
	fade_texture.fill_from = Vector2(0.0, 0.0)
	fade_texture.fill_to = Vector2(0.0, 1.0)
	var shade := TextureRect.new()
	shade.texture = fade_texture
	shade.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	shade.stretch_mode = TextureRect.STRETCH_SCALE
	shade.anchor_left = 0.0
	shade.anchor_right = 1.0
	shade.anchor_top = 0.6
	shade.anchor_bottom = 1.0
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	var margin := SafeAreaMargin.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(margin)
	_bottom = Ui.column(16)
	_bottom.alignment = BoxContainer.ALIGNMENT_END
	_bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(_bottom)
	_text = Ui.label(text_key)
	_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_bottom.add_child(_text)
	_step = Ui.label("", AppTheme.VARIATION_MUTED)
	_step.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_step.visible = false
	_bottom.add_child(_step)
	_bar = Ui.progress_bar()
	_bar.visible = false
	_bottom.add_child(_bar)


func _process(delta: float) -> void:
	if _steps == 0 or not is_visible_in_tree():
		return
	_step_seconds += delta
	_bar.value = LoadProgress.fill(_step_number, _steps, _step_seconds)


## Shows step `step` of `steps` (1-based) with its text key under the line, and the bar;
## `steps` 0 hides both.
func set_progress(text_key: String, step: int, steps: int) -> void:
	_step.text = text_key
	_step.visible = not text_key.is_empty()
	_step_number = step
	_steps = steps
	_step_seconds = 0.0
	_bar.value = LoadProgress.fill(step, steps, 0.0)
	_bar.visible = steps > 0


## The line at the bottom (a text key).
func set_text(text_key: String) -> void:
	_text.text = text_key
	_text.visible = not text_key.is_empty()
	set_progress("", 0, 0)


## Adds something under the line (e.g. an error and a Retry button); `clear_content` removes it.
func show_content(node: Control) -> void:
	_bottom.add_child(node)


func clear_content() -> void:
	for child: Node in _bottom.get_children():
		if child != _text and child != _step and child != _bar:
			child.queue_free()
