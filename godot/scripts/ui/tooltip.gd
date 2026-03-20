# tooltip.gd — Unit tooltip popup showing detailed stats
extends PanelContainer

var name_label: Label
var faction_label: Label
var role_label: Label
var stats_label: RichTextLabel
var ability_label: RichTextLabel
var cost_label: Label
var stars_label: Label

var _visible_unit: String = ""

func _ready() -> void:
	visible = false
	z_index = 200
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(220, 0)
	
	# Background style
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.08, 0.1, 0.15, 0.95)
	bg.border_color = Color(1, 0.843, 0, 0.4)
	bg.set_border_width_all(2)
	bg.set_corner_radius_all(6)
	bg.set_content_margin_all(10)
	bg.shadow_color = Color(0, 0, 0, 0.5)
	bg.shadow_size = 6
	add_theme_stylebox_override("panel", bg)
	
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 4)
	add_child(vbox)
	
	# Name
	name_label = Label.new()
	name_label.add_theme_font_size_override("font_size", 16)
	name_label.add_theme_color_override("font_color", Color(1, 0.843, 0))
	vbox.add_child(name_label)
	
	# Faction + Role row
	var info_row := HBoxContainer.new()
	vbox.add_child(info_row)
	
	faction_label = Label.new()
	faction_label.add_theme_font_size_override("font_size", 12)
	info_row.add_child(faction_label)
	
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info_row.add_child(spacer)
	
	role_label = Label.new()
	role_label.add_theme_font_size_override("font_size", 12)
	role_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
	info_row.add_child(role_label)
	
	# Cost + Stars row
	var cost_row := HBoxContainer.new()
	vbox.add_child(cost_row)
	
	cost_label = Label.new()
	cost_label.add_theme_font_size_override("font_size", 12)
	cost_label.add_theme_color_override("font_color", Color(1, 0.843, 0))
	cost_row.add_child(cost_label)
	
	var spacer2 := Control.new()
	spacer2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cost_row.add_child(spacer2)
	
	stars_label = Label.new()
	stars_label.add_theme_font_size_override("font_size", 12)
	cost_row.add_child(stars_label)
	
	# Separator
	var sep := HSeparator.new()
	vbox.add_child(sep)
	
	# Stats
	stats_label = RichTextLabel.new()
	stats_label.bbcode_enabled = true
	stats_label.fit_content = true
	stats_label.scroll_active = false
	stats_label.custom_minimum_size = Vector2(200, 0)
	stats_label.add_theme_font_size_override("normal_font_size", 11)
	vbox.add_child(stats_label)
	
	# Ability
	ability_label = RichTextLabel.new()
	ability_label.bbcode_enabled = true
	ability_label.fit_content = true
	ability_label.scroll_active = false
	ability_label.custom_minimum_size = Vector2(200, 0)
	ability_label.add_theme_font_size_override("normal_font_size", 11)
	vbox.add_child(ability_label)
	
	EventBus.tooltip_requested.connect(_show_tooltip)
	EventBus.tooltip_hidden.connect(hide_tooltip)

func _show_tooltip(unit_data: Dictionary, screen_pos: Vector2) -> void:
	var unit_id: String = unit_data.get("id", "")
	var stars: int = unit_data.get("stars", 1)
	var udata = GameData.units_data.get(unit_id, {})
	if udata.is_empty():
		hide_tooltip()
		return
	
	var star_mult: float = GameData.STAR_MULTIPLIERS.get(stars, 1.0)
	var stats: Dictionary = udata.get("stats", {})
	var ability: Dictionary = udata.get("ability", {})
	
	name_label.text = udata.get("name", unit_id)
	faction_label.text = udata.get("faction", "")
	faction_label.add_theme_color_override("font_color", Color.from_string(udata.get("color", "#ffffff"), Color.WHITE))
	role_label.text = udata.get("role", "")
	cost_label.text = "💰 %d gold" % udata.get("cost", 1)
	
	var star_str := ""
	for i in stars:
		star_str += "★"
	var star_colors := {1: Color(1, 0.843, 0), 2: Color(0.4, 0.7, 1), 3: Color(1, 0.4, 0.7)}
	stars_label.text = star_str
	stars_label.add_theme_color_override("font_color", star_colors.get(stars, Color.YELLOW))
	
	var hp := int(stats.get("hp", 0) * star_mult)
	var atk := int(stats.get("attack", 0) * star_mult)
	var spd: float = stats.get("speed", 1.0)
	var rng: int = stats.get("range", 1)
	
	stats_label.text = "[color=#66ff66]HP: %d[/color]  [color=#ff6666]ATK: %d[/color]\n[color=#6699ff]SPD: %.1f[/color]  [color=#ffcc66]RNG: %d[/color]" % [hp, atk, spd, rng]
	
	if not ability.is_empty():
		var trigger: String = ability.get("trigger", "passive")
		ability_label.text = "[color=#ffd700]%s[/color] [color=#888888](%s)[/color]" % [ability.get("name", ""), trigger]
	else:
		ability_label.text = ""
	
	# Position tooltip near cursor but keep on screen
	var vp_size := get_viewport_rect().size
	var tip_pos := screen_pos + Vector2(15, 15)
	if tip_pos.x + size.x > vp_size.x:
		tip_pos.x = screen_pos.x - size.x - 15
	if tip_pos.y + size.y > vp_size.y:
		tip_pos.y = vp_size.y - size.y - 10
	
	global_position = tip_pos
	visible = true
	_visible_unit = unit_id

func hide_tooltip() -> void:
	visible = false
	_visible_unit = ""
