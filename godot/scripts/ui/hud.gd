# hud.gd — Top HUD bar showing gold, health, level, round
extends HBoxContainer

var gold_label: Label
var health_label: Label
var level_label: Label
var round_label: Label
var unit_count_label: Label

func _ready() -> void:
	_build_ui()
	EventBus.gold_changed.connect(func(v): _update_gold(v))
	EventBus.health_changed.connect(func(v): _update_health(v))
	EventBus.level_changed.connect(func(v): _update_level(v))
	EventBus.round_changed.connect(func(v): _update_round(v))
	EventBus.unit_placed.connect(func(_a, _b): _update_unit_count())
	EventBus.unit_removed.connect(func(_a, _b): _update_unit_count())
	refresh()

func _build_ui() -> void:
	# Style the container
	add_theme_constant_override("separation", 24)
	
	# Background style
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.051, 0.067, 0.09, 0.95)
	bg.border_color = Color(1, 0.843, 0, 0.3)
	bg.border_width_bottom = 2
	bg.set_content_margin_all(12)
	
	# Gold
	gold_label = _create_stat_label("💰 50", Color(1, 0.843, 0))
	add_child(gold_label)
	
	# Health
	health_label = _create_stat_label("❤️ 100", Color(0.4, 0.9, 0.4))
	add_child(health_label)
	
	# Level
	level_label = _create_stat_label("⭐ Lv.1", Color(0.6, 0.8, 1.0))
	add_child(level_label)
	
	# Unit count
	unit_count_label = _create_stat_label("🐱 0/3", Color(0.8, 0.7, 0.9))
	add_child(unit_count_label)
	
	# Spacer
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_child(spacer)
	
	# Round
	round_label = _create_stat_label("Round 1", Color(1, 0.843, 0, 0.7))
	add_child(round_label)

func _create_stat_label(text: String, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override("font_color", color)
	return label

func refresh() -> void:
	_update_gold(GameState.gold)
	_update_health(GameState.health)
	_update_level(GameState.player_level)
	_update_round(GameState.current_round)
	_update_unit_count()

func _update_gold(value: int) -> void:
	gold_label.text = "💰 %d" % value

func _update_health(value: int) -> void:
	health_label.text = "❤️ %d" % value
	if value <= 30:
		health_label.add_theme_color_override("font_color", Color(1, 0.3, 0.3))
	elif value <= 60:
		health_label.add_theme_color_override("font_color", Color(1, 0.8, 0.3))
	else:
		health_label.add_theme_color_override("font_color", Color(0.4, 0.9, 0.4))

func _update_level(value: int) -> void:
	level_label.text = "⭐ Lv.%d" % value

func _update_round(value: int) -> void:
	round_label.text = "Round %d" % value

func _update_unit_count() -> void:
	var count := GameState.get_board_unit_count()
	var max_units := GameState.get_max_board_units()
	unit_count_label.text = "🐱 %d/%d" % [count, max_units]
	if count >= max_units:
		unit_count_label.add_theme_color_override("font_color", Color(1, 0.4, 0.4))
	else:
		unit_count_label.add_theme_color_override("font_color", Color(0.8, 0.7, 0.9))
