# lobby_screen.gd — Mode selection and lobby screen
extends Control

signal mode_selected(mode: String)

func _ready() -> void:
	_build_ui()

func _build_ui() -> void:
	# Full screen dark background
	var bg := ColorRect.new()
	bg.color = Color(0.051, 0.067, 0.09)
	bg.anchors_preset = Control.PRESET_FULL_RECT
	add_child(bg)
	
	# Center container
	var center := CenterContainer.new()
	center.anchors_preset = Control.PRESET_FULL_RECT
	add_child(center)
	
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 20)
	vbox.custom_minimum_size = Vector2(400, 0)
	center.add_child(vbox)
	
	# Title
	var title := Label.new()
	title.text = "FELINE FREE-FUR-ALL"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 42)
	title.add_theme_color_override("font_color", Color(1, 0.843, 0))
	title.add_theme_color_override("font_outline_color", Color(0, 0, 0))
	title.add_theme_constant_override("outline_size", 3)
	vbox.add_child(title)
	
	# Subtitle
	var subtitle := Label.new()
	subtitle.text = "Auto-Battler  •  v1.0.0 (Godot)"
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.add_theme_font_size_override("font_size", 14)
	subtitle.add_theme_color_override("font_color", Color(0.55, 0.58, 0.62))
	vbox.add_child(subtitle)
	
	# Cat emoji decoration
	var deco := Label.new()
	deco.text = "🐱  🐈  🦁  🐆  👽  🎲  😺  🎭"
	deco.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	deco.add_theme_font_size_override("font_size", 24)
	vbox.add_child(deco)
	
	# Spacer
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 30)
	vbox.add_child(spacer)
	
	# Solo Practice button
	var solo_btn := _create_mode_button(
		"Solo Practice",
		"Battle against AI opponents",
		Color(0.267, 0.431, 0.706)
	)
	solo_btn.pressed.connect(func(): _on_mode_selected("single"))
	vbox.add_child(solo_btn)
	
	# 8-Player Local button
	var multi_btn := _create_mode_button(
		"8-Player (Local AI)",
		"Round-robin vs 7 AI opponents",
		Color(0.388, 0.231, 0.616)
	)
	multi_btn.pressed.connect(func(): _on_mode_selected("multiplayer"))
	vbox.add_child(multi_btn)
	
	# Online button (disabled for now)
	var online_btn := _create_mode_button(
		"Online Multiplayer",
		"Coming soon — requires server",
		Color(0.35, 0.35, 0.35)
	)
	online_btn.disabled = true
	vbox.add_child(online_btn)
	
	# Footer
	var footer := Label.new()
	footer.text = "FFFA • Ported to Godot 4"
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	footer.add_theme_font_size_override("font_size", 11)
	footer.add_theme_color_override("font_color", Color(0.4, 0.4, 0.4))
	vbox.add_child(footer)

func _create_mode_button(title_text: String, desc_text: String, color: Color) -> Button:
	var btn := Button.new()
	btn.text = title_text + "\n" + desc_text
	btn.custom_minimum_size = Vector2(350, 70)
	
	var style_normal := StyleBoxFlat.new()
	style_normal.bg_color = Color(color.r, color.g, color.b, 0.2)
	style_normal.border_color = Color(color.r, color.g, color.b, 0.5)
	style_normal.set_border_width_all(2)
	style_normal.set_corner_radius_all(8)
	style_normal.set_content_margin_all(12)
	btn.add_theme_stylebox_override("normal", style_normal)
	
	var style_hover := StyleBoxFlat.new()
	style_hover.bg_color = Color(color.r, color.g, color.b, 0.35)
	style_hover.border_color = Color(color.r, color.g, color.b, 0.8)
	style_hover.set_border_width_all(2)
	style_hover.set_corner_radius_all(8)
	style_hover.set_content_margin_all(12)
	btn.add_theme_stylebox_override("hover", style_hover)
	
	var style_pressed := StyleBoxFlat.new()
	style_pressed.bg_color = Color(color.r, color.g, color.b, 0.5)
	style_pressed.border_color = color
	style_pressed.set_border_width_all(2)
	style_pressed.set_corner_radius_all(8)
	style_pressed.set_content_margin_all(12)
	btn.add_theme_stylebox_override("pressed", style_pressed)
	
	btn.add_theme_font_size_override("font_size", 16)
	btn.add_theme_color_override("font_color", Color(0.9, 0.9, 0.95))
	btn.add_theme_color_override("font_hover_color", Color(1, 0.95, 0.85))
	
	return btn

func _on_mode_selected(mode: String) -> void:
	mode_selected.emit(mode)
	# Animate out
	var tween := create_tween()
	tween.tween_property(self, "modulate:a", 0.0, 0.3)
	tween.tween_callback(func(): visible = false)
