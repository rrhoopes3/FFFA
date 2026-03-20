# synergy_panel.gd — Faction synergy display panel
# Shows active faction bonuses based on board composition
extends VBoxContainer

const FACTION_COLORS := {
	"Alley": Color(0.627, 0.682, 0.757),
	"Persian": Color(0.941, 0.878, 0.827),
	"Siamese": Color(0.831, 0.722, 0.588),
	"MaineCoon": Color(0.545, 0.451, 0.333),
	"Bengal": Color(0.835, 0.616, 0.267),
	"Sphynx": Color(0.910, 0.647, 0.714),
	"ScottishFold": Color(0.769, 0.741, 0.627),
	"Ragdoll": Color(0.961, 0.902, 0.827),
}

const FACTION_ICONS := {
	"Alley": "🐈‍⬛", "Persian": "🐱", "Siamese": "😺", "MaineCoon": "🦁",
	"Bengal": "🐆", "Sphynx": "👽", "ScottishFold": "🎲", "Ragdoll": "🎭",
}

var synergy_labels: Dictionary = {}

func _ready() -> void:
	custom_minimum_size = Vector2(180, 0)
	_build_ui()
	EventBus.synergies_updated.connect(_on_synergies_updated)
	EventBus.unit_placed.connect(func(_a, _b): refresh())
	EventBus.unit_removed.connect(func(_a, _b): refresh())
	EventBus.combat_ended.connect(func(_a): refresh())

func _build_ui() -> void:
	# Title
	var title := Label.new()
	title.text = "SYNERGIES"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(1, 0.843, 0, 0.8))
	add_child(title)
	
	# Separator
	var sep := HSeparator.new()
	sep.add_theme_constant_override("separation", 8)
	add_child(sep)

func refresh() -> void:
	# Clear old synergy entries
	for key in synergy_labels:
		if is_instance_valid(synergy_labels[key]):
			synergy_labels[key].queue_free()
	synergy_labels.clear()
	
	# Count factions on board
	var faction_counts: Dictionary = {}
	for hex_key in GameState.player_board:
		var unit = GameState.player_board[hex_key]
		var unit_id: String = unit.id if unit is Dictionary else unit
		var udata = GameData.units_data.get(unit_id, {})
		var faction: String = udata.get("faction", "")
		if faction != "":
			faction_counts[faction] = faction_counts.get(faction, 0) + 1
	
	# Build synergy entries
	var synergies := GameData.get_synergy_bonuses(GameState.player_board)
	
	for faction in faction_counts:
		var count: int = faction_counts[faction]
		var syn_data = GameData.faction_synergies.get(faction, {})
		if syn_data.is_empty():
			continue
		
		var entry := _create_synergy_entry(faction, count, syn_data, synergies.has(faction))
		add_child(entry)
		synergy_labels[faction] = entry
	
	EventBus.synergies_updated.emit(synergies)

func _create_synergy_entry(faction: String, count: int, syn_data: Dictionary, is_active: bool) -> PanelContainer:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.1, 0.12, 0.18, 0.8) if is_active else Color(0.08, 0.09, 0.12, 0.5)
	style.border_color = FACTION_COLORS.get(faction, Color.WHITE) if is_active else Color(0.3, 0.3, 0.3, 0.3)
	style.set_border_width_all(2 if is_active else 1)
	style.set_corner_radius_all(4)
	style.set_content_margin_all(6)
	panel.add_theme_stylebox_override("panel", style)
	
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 2)
	panel.add_child(vbox)
	
	# Faction name + count
	var header := HBoxContainer.new()
	vbox.add_child(header)
	
	var icon_label := Label.new()
	icon_label.text = FACTION_ICONS.get(faction, "?")
	icon_label.add_theme_font_size_override("font_size", 14)
	header.add_child(icon_label)
	
	var name_label := Label.new()
	name_label.text = " %s" % syn_data.get("name", faction)
	name_label.add_theme_font_size_override("font_size", 12)
	name_label.add_theme_color_override("font_color", FACTION_COLORS.get(faction, Color.WHITE))
	header.add_child(name_label)
	
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)
	
	var count_label := Label.new()
	count_label.text = str(count)
	count_label.add_theme_font_size_override("font_size", 12)
	count_label.add_theme_color_override("font_color", Color(1, 0.843, 0) if is_active else Color(0.5, 0.5, 0.5))
	header.add_child(count_label)
	
	# Threshold pips
	var thresholds: Array = syn_data.get("thresholds", [2, 4, 6])
	var pip_row := HBoxContainer.new()
	pip_row.add_theme_constant_override("separation", 4)
	vbox.add_child(pip_row)
	
	for t in thresholds:
		var pip := Label.new()
		pip.text = str(t)
		pip.add_theme_font_size_override("font_size", 10)
		if count >= t:
			pip.add_theme_color_override("font_color", Color(1, 0.843, 0))
		else:
			pip.add_theme_color_override("font_color", Color(0.4, 0.4, 0.4))
		pip_row.add_child(pip)
	
	# Active bonus description
	if is_active:
		var bonuses = syn_data.get("bonuses", {})
		var active_threshold := 0
		for t in thresholds:
			if count >= t:
				active_threshold = t
		if active_threshold > 0 and bonuses.has(active_threshold):
			var desc_label := Label.new()
			desc_label.text = bonuses[active_threshold].get("description", "")
			desc_label.add_theme_font_size_override("font_size", 9)
			desc_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.7))
			desc_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			vbox.add_child(desc_label)
	
	return panel

func _on_synergies_updated(_data: Dictionary) -> void:
	pass  # Already handled by refresh
