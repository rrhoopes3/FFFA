## ShopPanel — VBoxContainer that displays the 5-slot unit shop sidebar,
## reroll/level-up controls, and gold display for the FFFA auto-battler.
## Ported from the web client's renderShop() in fffa-render.js.
extends VBoxContainer

# ── Theme constants ──────────────────────────────────────────────────
const BG_COLOR          := Color("#0d1117")
const SLOT_BG           := Color("#1a1f2e")
const SLOT_HOVER_BG     := Color("#242d40")
const SLOT_EMPTY_BG     := Color("#111520")
const TEXT_COLOR        := Color("#e6edf3")
const TEXT_DIM          := Color("#8b949e")
const GOLD_COLOR        := Color("#ffd700")
const BUTTON_BG         := Color("#21262d")
const BUTTON_HOVER_BG   := Color("#30363d")
const BUTTON_DISABLED   := Color("#161b22")

const SLOT_COUNT := 5

# Rarity border colours keyed by unit cost tier
const RARITY_COLORS := {
	1: Color("#7dc8ff"),   # cyan
	2: Color("#72df97"),   # green
	3: Color("#f1c35d"),   # gold / yellow
	4: Color("#ff8a65"),   # orange
	5: Color("#d997ff"),   # purple
}

# Faction accent colours (mirrors shared.js factionSynergies)
const FACTION_COLORS := {
	"Alley":        Color("#A0AEC1"),
	"Persian":      Color("#F0E6D3"),
	"Siamese":      Color("#D4B896"),
	"MaineCoon":    Color("#8B7355"),
	"Bengal":       Color("#F59E0B"),
	"Sphynx":       Color("#F3A5B6"),
	"ScottishFold": Color("#D1D5DB"),
	"Ragdoll":      Color("#93C5FD"),
}

# Role display strings
const ROLE_ICONS := {
	"Tank":   "\U0001F6E1",  # shield
	"Ranged": "\U0001F3F9",  # bow
	"Melee":  "\u2694",      # crossed swords
}

# ── Node references (built in _ready) ───────────────────────────────
var _slot_panels: Array[Panel] = []
var _gold_label: Label
var _reroll_button: Button
var _level_button: Button
var _title_label: Label


# =====================================================================
#  LIFECYCLE
# =====================================================================

func _ready() -> void:
	_apply_self_style()
	_build_title()
	_build_shop_slots()
	_build_controls()
	_connect_signals()
	refresh()


func _apply_self_style() -> void:
	var bg := StyleBoxFlat.new()
	bg.bg_color = BG_COLOR
	bg.corner_radius_top_left = 6
	bg.corner_radius_top_right = 6
	bg.corner_radius_bottom_left = 6
	bg.corner_radius_bottom_right = 6
	bg.content_margin_left = 8
	bg.content_margin_right = 8
	bg.content_margin_top = 8
	bg.content_margin_bottom = 8
	add_theme_stylebox_override("panel", bg)
	add_theme_constant_override("separation", 6)
	custom_minimum_size = Vector2(240, 0)
	size_flags_vertical = Control.SIZE_EXPAND_FILL


# ── Title ────────────────────────────────────────────────────────────
func _build_title() -> void:
	_title_label = Label.new()
	_title_label.text = "SHOP"
	_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_label.add_theme_color_override("font_color", GOLD_COLOR)
	_title_label.add_theme_font_size_override("font_size", 18)
	add_child(_title_label)

	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color("#30363d"))
	add_child(sep)


# ── Shop Slots ───────────────────────────────────────────────────────
func _build_shop_slots() -> void:
	for i in SLOT_COUNT:
		var slot := _create_shop_slot(i)
		_slot_panels.append(slot)
		add_child(slot)


func _create_shop_slot(index: int) -> Panel:
	var panel := Panel.new()
	panel.custom_minimum_size = Vector2(224, 80)
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	panel.set_meta("slot_index", index)

	# Base style
	var style := _make_slot_style(SLOT_BG)
	panel.add_theme_stylebox_override("panel", style)

	# Hover signals
	panel.mouse_entered.connect(_on_slot_hover.bind(panel, true))
	panel.mouse_exited.connect(_on_slot_hover.bind(panel, false))
	panel.gui_input.connect(_on_slot_input.bind(index))

	# ── Layout: HBox ────────────────────────────────────────────────
	var hbox := HBoxContainer.new()
	hbox.name = "HBox"
	hbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hbox.add_theme_constant_override("separation", 6)
	panel.add_child(hbox)

	# Faction colour stripe (narrow ColorRect on left)
	var stripe := ColorRect.new()
	stripe.name = "FactionStripe"
	stripe.custom_minimum_size = Vector2(4, 0)
	stripe.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stripe.color = Color.TRANSPARENT
	hbox.add_child(stripe)

	# Portrait / icon placeholder
	var icon_container := Panel.new()
	icon_container.name = "IconContainer"
	icon_container.custom_minimum_size = Vector2(56, 56)
	icon_container.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var icon_style := StyleBoxFlat.new()
	icon_style.bg_color = Color("#0d1117")
	icon_style.corner_radius_top_left = 4
	icon_style.corner_radius_top_right = 4
	icon_style.corner_radius_bottom_left = 4
	icon_style.corner_radius_bottom_right = 4
	icon_container.add_theme_stylebox_override("panel", icon_style)
	hbox.add_child(icon_container)

	var icon_label := Label.new()
	icon_label.name = "IconLabel"
	icon_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	icon_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	icon_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	icon_label.add_theme_font_size_override("font_size", 28)
	icon_container.add_child(icon_label)

	var portrait_rect := TextureRect.new()
	portrait_rect.name = "PortraitRect"
	portrait_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	portrait_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait_rect.visible = false
	icon_container.add_child(portrait_rect)

	# ── Right side: VBox with name, cost, stats ─────────────────────
	var vbox := VBoxContainer.new()
	vbox.name = "InfoVBox"
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vbox.add_theme_constant_override("separation", 1)
	hbox.add_child(vbox)

	# Row 1: name + role icon
	var top_hbox := HBoxContainer.new()
	top_hbox.name = "TopRow"
	top_hbox.add_theme_constant_override("separation", 4)
	vbox.add_child(top_hbox)

	var name_label := Label.new()
	name_label.name = "NameLabel"
	name_label.add_theme_color_override("font_color", TEXT_COLOR)
	name_label.add_theme_font_size_override("font_size", 13)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.clip_text = true
	top_hbox.add_child(name_label)

	var role_label := Label.new()
	role_label.name = "RoleLabel"
	role_label.add_theme_color_override("font_color", TEXT_DIM)
	role_label.add_theme_font_size_override("font_size", 12)
	top_hbox.add_child(role_label)

	# Row 2: cost chip + faction
	var mid_hbox := HBoxContainer.new()
	mid_hbox.name = "MidRow"
	mid_hbox.add_theme_constant_override("separation", 6)
	vbox.add_child(mid_hbox)

	var cost_label := Label.new()
	cost_label.name = "CostLabel"
	cost_label.add_theme_color_override("font_color", GOLD_COLOR)
	cost_label.add_theme_font_size_override("font_size", 13)
	mid_hbox.add_child(cost_label)

	var faction_label := Label.new()
	faction_label.name = "FactionLabel"
	faction_label.add_theme_color_override("font_color", TEXT_DIM)
	faction_label.add_theme_font_size_override("font_size", 11)
	faction_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid_hbox.add_child(faction_label)

	# Row 3: stat line
	var stat_label := Label.new()
	stat_label.name = "StatLabel"
	stat_label.add_theme_color_override("font_color", TEXT_DIM)
	stat_label.add_theme_font_size_override("font_size", 11)
	vbox.add_child(stat_label)

	# Row 4: ability name
	var ability_label := Label.new()
	ability_label.name = "AbilityLabel"
	ability_label.add_theme_color_override("font_color", Color("#58a6ff"))
	ability_label.add_theme_font_size_override("font_size", 10)
	ability_label.clip_text = true
	vbox.add_child(ability_label)

	return panel


func _make_slot_style(bg: Color, border_color: Color = Color.TRANSPARENT, border_width: int = 0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.corner_radius_top_left = 6
	s.corner_radius_top_right = 6
	s.corner_radius_bottom_left = 6
	s.corner_radius_bottom_right = 6
	s.content_margin_left = 4
	s.content_margin_right = 4
	s.content_margin_top = 4
	s.content_margin_bottom = 4
	if border_width > 0:
		s.border_color = border_color
		s.border_width_left = border_width
		s.border_width_right = border_width
		s.border_width_top = border_width
		s.border_width_bottom = border_width
	return s


# ── Bottom Controls ──────────────────────────────────────────────────
func _build_controls() -> void:
	var sep := HSeparator.new()
	sep.add_theme_color_override("separator", Color("#30363d"))
	add_child(sep)

	# Gold display
	var gold_hbox := HBoxContainer.new()
	gold_hbox.name = "GoldRow"
	gold_hbox.alignment = BoxContainer.ALIGNMENT_CENTER
	gold_hbox.add_theme_constant_override("separation", 6)
	add_child(gold_hbox)

	var gold_icon := Label.new()
	gold_icon.text = "\U0001FA99"  # coin
	gold_icon.add_theme_font_size_override("font_size", 18)
	gold_hbox.add_child(gold_icon)

	_gold_label = Label.new()
	_gold_label.name = "GoldLabel"
	_gold_label.text = "0"
	_gold_label.add_theme_color_override("font_color", GOLD_COLOR)
	_gold_label.add_theme_font_size_override("font_size", 18)
	gold_hbox.add_child(_gold_label)

	# Reroll button
	_reroll_button = Button.new()
	_reroll_button.name = "RerollButton"
	_reroll_button.text = "Reroll (2g)"
	_reroll_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_reroll_button.custom_minimum_size.y = 32
	_apply_button_style(_reroll_button)
	_reroll_button.pressed.connect(_on_reroll_pressed)
	add_child(_reroll_button)

	# Level-up button
	_level_button = Button.new()
	_level_button.name = "LevelButton"
	_level_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_level_button.custom_minimum_size.y = 32
	_apply_button_style(_level_button)
	_level_button.pressed.connect(_on_level_pressed)
	add_child(_level_button)

	_update_level_button()


func _apply_button_style(btn: Button) -> void:
	var normal := StyleBoxFlat.new()
	normal.bg_color = BUTTON_BG
	normal.corner_radius_top_left = 4
	normal.corner_radius_top_right = 4
	normal.corner_radius_bottom_left = 4
	normal.corner_radius_bottom_right = 4
	normal.content_margin_left = 8
	normal.content_margin_right = 8
	normal.content_margin_top = 4
	normal.content_margin_bottom = 4
	btn.add_theme_stylebox_override("normal", normal)

	var hover: StyleBoxFlat = normal.duplicate()
	hover.bg_color = BUTTON_HOVER_BG
	btn.add_theme_stylebox_override("hover", hover)

	var pressed: StyleBoxFlat = normal.duplicate()
	pressed.bg_color = BUTTON_HOVER_BG.lightened(0.1)
	btn.add_theme_stylebox_override("pressed", pressed)

	var disabled: StyleBoxFlat = normal.duplicate()
	disabled.bg_color = BUTTON_DISABLED
	btn.add_theme_stylebox_override("disabled", disabled)

	btn.add_theme_color_override("font_color", TEXT_COLOR)
	btn.add_theme_color_override("font_hover_color", GOLD_COLOR)
	btn.add_theme_color_override("font_disabled_color", TEXT_DIM)
	btn.add_theme_font_size_override("font_size", 13)


# ── Signal wiring ────────────────────────────────────────────────────
func _connect_signals() -> void:
	EventBus.shop_refreshed.connect(refresh)
	EventBus.gold_changed.connect(_on_gold_changed)
	EventBus.level_changed.connect(_on_level_changed)


# =====================================================================
#  PUBLIC API
# =====================================================================

## Reads GameState.shop_units and updates all 5 slot visuals.
func refresh() -> void:
	var shop: Array = GameState.shop_units
	for i in SLOT_COUNT:
		var panel: Panel = _slot_panels[i]
		var unit_id: String = ""
		if i < shop.size():
			unit_id = shop[i] if shop[i] is String else ""

		if unit_id.is_empty():
			_set_slot_empty(panel)
		else:
			_set_slot_unit(panel, unit_id)

	_update_gold_display()
	_update_reroll_button()
	_update_level_button()


# =====================================================================
#  SLOT POPULATION
# =====================================================================

func _set_slot_empty(panel: Panel) -> void:
	var style := _make_slot_style(SLOT_EMPTY_BG)
	panel.add_theme_stylebox_override("panel", style)
	panel.mouse_default_cursor_shape = Control.CURSOR_ARROW

	var hbox: HBoxContainer = panel.get_node("HBox")
	var stripe: ColorRect = hbox.get_node("FactionStripe")
	stripe.color = Color.TRANSPARENT

	var icon_label: Label = hbox.get_node("IconContainer/IconLabel")
	icon_label.text = ""
	var portrait: TextureRect = hbox.get_node("IconContainer/PortraitRect")
	portrait.visible = false

	var info: VBoxContainer = hbox.get_node("InfoVBox")
	var name_lbl: Label = info.get_node("TopRow/NameLabel")
	name_lbl.text = "-- SOLD --"
	name_lbl.add_theme_color_override("font_color", TEXT_DIM)

	var role_lbl: Label = info.get_node("TopRow/RoleLabel")
	role_lbl.text = ""

	var cost_lbl: Label = info.get_node("MidRow/CostLabel")
	cost_lbl.text = ""

	var faction_lbl: Label = info.get_node("MidRow/FactionLabel")
	faction_lbl.text = ""

	var stat_lbl: Label = info.get_node("StatLabel")
	stat_lbl.text = ""

	var ability_lbl: Label = info.get_node("AbilityLabel")
	ability_lbl.text = ""


func _set_slot_unit(panel: Panel, unit_id: String) -> void:
	var unit_data: Dictionary = GameData.units_data.get(unit_id, {})
	if unit_data.is_empty():
		_set_slot_empty(panel)
		return

	var cost: int = unit_data.get("cost", 1)
	var rarity_col: Color = _get_rarity_color(cost)
	var faction: String = unit_data.get("faction", "")
	var faction_col: Color = FACTION_COLORS.get(faction, TEXT_DIM)

	# Style with rarity border
	var style := _make_slot_style(SLOT_BG, rarity_col, 2)
	panel.add_theme_stylebox_override("panel", style)
	panel.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

	var hbox: HBoxContainer = panel.get_node("HBox")

	# Faction stripe
	var stripe: ColorRect = hbox.get_node("FactionStripe")
	stripe.color = faction_col

	# Icon / portrait
	var icon_label: Label = hbox.get_node("IconContainer/IconLabel")
	var portrait: TextureRect = hbox.get_node("IconContainer/PortraitRect")

	# Try loading a portrait texture from res://portraits/<unit_id>.png
	var portrait_path := "res://portraits/%s.png" % unit_id
	if ResourceLoader.exists(portrait_path):
		portrait.texture = load(portrait_path)
		portrait.visible = true
		icon_label.text = ""
	else:
		portrait.visible = false
		icon_label.text = unit_data.get("icon", "?")

	# Rarity tint on icon background
	var icon_container: Panel = hbox.get_node("IconContainer")
	var icon_bg := StyleBoxFlat.new()
	icon_bg.bg_color = rarity_col.darkened(0.75)
	icon_bg.corner_radius_top_left = 4
	icon_bg.corner_radius_top_right = 4
	icon_bg.corner_radius_bottom_left = 4
	icon_bg.corner_radius_bottom_right = 4
	icon_bg.border_color = rarity_col.darkened(0.3)
	icon_bg.border_width_bottom = 2
	icon_container.add_theme_stylebox_override("panel", icon_bg)

	# Info labels
	var info: VBoxContainer = hbox.get_node("InfoVBox")

	var name_lbl: Label = info.get_node("TopRow/NameLabel")
	name_lbl.text = unit_data.get("name", unit_id)
	name_lbl.add_theme_color_override("font_color", TEXT_COLOR)

	var role: String = unit_data.get("role", "Melee")
	var role_lbl: Label = info.get_node("TopRow/RoleLabel")
	role_lbl.text = ROLE_ICONS.get(role, "") + " " + role

	var cost_lbl: Label = info.get_node("MidRow/CostLabel")
	cost_lbl.text = "%dg" % cost
	cost_lbl.add_theme_color_override("font_color", rarity_col)

	var faction_lbl: Label = info.get_node("MidRow/FactionLabel")
	faction_lbl.text = faction
	faction_lbl.add_theme_color_override("font_color", faction_col)

	# Stats
	var stats: Dictionary = unit_data.get("stats", {})
	var hp: int = stats.get("hp", 0)
	var atk: int = stats.get("attack", 0)
	var stat_lbl: Label = info.get_node("StatLabel")
	stat_lbl.text = "HP %d  ATK %d" % [hp, atk]

	# Ability
	var ability: Dictionary = unit_data.get("ability", {})
	var ability_lbl: Label = info.get_node("AbilityLabel")
	ability_lbl.text = ability.get("name", "Basic Attack")


# =====================================================================
#  HELPERS
# =====================================================================

## Returns the rarity border colour for a given unit cost tier.
func _get_rarity_color(cost: int) -> Color:
	return RARITY_COLORS.get(cost, RARITY_COLORS[1])


func _update_gold_display() -> void:
	_gold_label.text = str(GameState.gold)


func _update_reroll_button() -> void:
	_reroll_button.disabled = GameState.gold < 2
	_reroll_button.text = "Reroll (2g)"


func _update_level_button() -> void:
	var lvl: int = GameState.player_level
	var cost: int = GameState.get_level_up_cost()
	var max_units: int = GameState.get_max_board_units()
	if cost < 0:
		_level_button.text = "Lv %d (MAX)  [%d units]" % [lvl, max_units]
		_level_button.disabled = true
	else:
		_level_button.text = "Lv %d -> %d  (%dg)  [%d units]" % [lvl, lvl + 1, cost, max_units]
		_level_button.disabled = GameState.gold < cost


# =====================================================================
#  INPUT HANDLERS
# =====================================================================

func _on_slot_hover(panel: Panel, entered: bool) -> void:
	var idx: int = panel.get_meta("slot_index")
	var shop: Array = GameState.shop_units
	var unit_id: String = ""
	if idx < shop.size():
		unit_id = shop[idx] if shop[idx] is String else ""

	if unit_id.is_empty():
		return  # No hover effect on empty slots

	var cost: int = 1
	var unit_data: Dictionary = GameData.units_data.get(unit_id, {})
	if not unit_data.is_empty():
		cost = unit_data.get("cost", 1)

	var rarity_col: Color = _get_rarity_color(cost)
	if entered:
		var style := _make_slot_style(SLOT_HOVER_BG, rarity_col.lightened(0.2), 2)
		# Add subtle glow via shadow
		style.shadow_color = rarity_col * Color(1, 1, 1, 0.3)
		style.shadow_size = 4
		panel.add_theme_stylebox_override("panel", style)
	else:
		var style := _make_slot_style(SLOT_BG, rarity_col, 2)
		panel.add_theme_stylebox_override("panel", style)


func _on_slot_input(event: InputEvent, index: int) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if GameState.combat_state != "idle":
			return
		GameState.try_buy_unit(index)
		refresh()


func _on_reroll_pressed() -> void:
	if GameState.combat_state != "idle":
		return
	GameState.try_reroll()
	refresh()


func _on_level_pressed() -> void:
	if GameState.combat_state != "idle":
		return
	GameState.try_level_up()
	refresh()


# ── Signal callbacks ─────────────────────────────────────────────────

func _on_gold_changed(new_gold: int) -> void:
	_gold_label.text = str(new_gold)
	_update_reroll_button()
	_update_level_button()


func _on_level_changed(_new_level: int) -> void:
	_update_level_button()
