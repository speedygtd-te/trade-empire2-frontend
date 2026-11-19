class_name EnterpriseLogo
extends TextureRect
## An enterprise's logo at a fixed size: the default ring until the picture has arrived (and
## when it cannot be loaded). The model downloads and keeps the pictures.

var _model: EnterpriseModel
var _pixels := 64
var _url := ""


func _init(model: EnterpriseModel, pixels: int) -> void:
	_model = model
	_pixels = pixels
	custom_minimum_size = Vector2(pixels, pixels)
	expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	size_flags_vertical = Control.SIZE_SHRINK_CENTER


func _ready() -> void:
	_model.logo_loaded.connect(_on_loaded)


func show_logo(logo: Enterprise.Logo) -> void:
	_url = logo.url_for(_pixels) if logo != null else ""
	texture = _model.logo_texture(_url) if not _url.is_empty() else _model.default_logo()


func _on_loaded(url: String) -> void:
	if url == _url:
		texture = _model.logo_texture(url)
