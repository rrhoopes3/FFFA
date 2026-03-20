# banner.gd — Round/combat banner overlay
extends CenterContainer

var banner_label: Label
var _tween: Tween

func _ready() -> void:
	visible = false
	z_index = 150
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	anchors_preset = Control.PRESET_FULL_RECT
	
	banner_label = Label.new()
	banner_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	banner_label.add_theme_font_size_override("font_size", 36)
	banner_label.add_theme_color_override("font_color", Color(1, 0.843, 0))
	banner_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	banner_label.add_theme_constant_override("outline_size", 4)
	add_child(banner_label)
	
	EventBus.banner_requested.connect(show_banner)

func show_banner(text: String, color := Color(1, 0.843, 0)) -> void:
	if _tween and _tween.is_valid():
		_tween.kill()
	
	banner_label.text = text
	banner_label.add_theme_color_override("font_color", color)
	banner_label.modulate.a = 0.0
	banner_label.scale = Vector2(0.5, 0.5)
	visible = true
	
	_tween = create_tween()
	_tween.set_ease(Tween.EASE_OUT)
	_tween.set_trans(Tween.TRANS_BACK)
	_tween.tween_property(banner_label, "modulate:a", 1.0, 0.3)
	_tween.parallel().tween_property(banner_label, "scale", Vector2(1.0, 1.0), 0.3)
	_tween.tween_interval(1.5)
	_tween.set_ease(Tween.EASE_IN)
	_tween.set_trans(Tween.TRANS_QUAD)
	_tween.tween_property(banner_label, "modulate:a", 0.0, 0.5)
	_tween.tween_callback(func(): visible = false)
