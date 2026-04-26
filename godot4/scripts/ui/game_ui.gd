extends Control
## M5 game UI: HUD, synergy panel, bench, shop, sell zone, action buttons.
##
## Builds its entire layout programmatically — no .tscn babysitting. Listens
## to GameState's EventBus signals to refresh in place.
##
## Interaction model
##  - Click a shop card → try_buy_unit (lands on first empty bench slot)
##  - Drag a bench slot → hex on the 3D arena: place
##  - Drag a bench slot → bench slot: swap
##  - Drag a bench slot → sell zone: sell from bench
##  - Click a board hex (no drag) → return that unit to the bench
##  - "Reroll" / "Level Up" / "Start Fight" buttons in the action bar
##
## Drag mechanics use a transparent fullscreen DropCatcher Control underneath
## the panels that catches releases over the 3D arena and routes them to
## arena_view.screen_to_hex_key().

const FACTION_COLORS := {
	"Alley":         Color("#A0AEC1"),
	"Persian":       Color("#F3E5F5"),
	"Siamese":       Color("#60A5FA"),
	"MaineCoon":     Color("#92400E"),
	"Bengal":        Color("#F59E0B"),
	"Sphynx":        Color("#F3A5B6"),
	"ScottishFold":  Color("#D1D5DB"),
	"Ragdoll":       Color("#93C5FD"),
}

const COST_COLORS := {
	1: Color("#9CA3AF"),
	2: Color("#34D399"),
	3: Color("#60A5FA"),
	4: Color("#A78BFA"),
	5: Color("#F59E0B"),
}

const BENCH_SIZE := 9
const SHOP_SIZE := 5
const CARD_W := 130.0
const CARD_H := 160.0
const SLOT_W := 92.0
const SLOT_H := 96.0

# Resolved at runtime — set by main.tscn before _ready or fetched lazily.
var arena_view: Node3D

# UI node refs (populated in _build_ui)
var hud_gold_label: Label
var hud_health_label: Label
var hud_level_label: Label
var hud_round_label: Label
var hud_income_label: Label
var hud_streak_label: Label
var hud_streak_chip: Control    # parent of hud_streak_label, hidden when no streak
var levelup_button: Button
var reroll_button: Button
var fight_button: Button
var bench_slots: Array = []     # Array[Control], one per bench index
var shop_cards: Array = []      # Array[Button], one per shop index
var sell_zone: Panel
var synergy_list: VBoxContainer
var status_label: Label
var drop_catcher: Control       # Fullscreen, mouse-pass, accepts drops over 3D
var banner_label: Label         # Big centered overlay — FIGHT / VICTORY / DEFEAT
var game_over_overlay: Control  # Restart screen shown on health <= 0
var game_over_subtitle: Label
var game_ended: bool = false    # Locks input until the player clicks Play Again


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	anchor_right = 1.0
	anchor_bottom = 1.0
	_build_ui()

	EventBus.gold_changed.connect(_refresh_hud)
	EventBus.health_changed.connect(_refresh_hud)
	EventBus.level_changed.connect(_refresh_hud)
	EventBus.round_changed.connect(_refresh_hud)
	EventBus.streak_changed.connect(_on_streak_changed)
	EventBus.shop_refreshed.connect(_refresh_shop)
	EventBus.unit_bought.connect(_on_unit_bought)
	EventBus.unit_sold.connect(_on_unit_sold_signal)
	EventBus.unit_placed.connect(_on_unit_placed)
	EventBus.unit_removed.connect(_on_unit_removed)
	EventBus.unit_merged.connect(_on_unit_merged)
	EventBus.synergies_updated.connect(_refresh_synergies)
	EventBus.combat_started.connect(_on_combat_started)
	EventBus.combat_ended.connect(_on_combat_ended)
	EventBus.banner_requested.connect(_show_banner)
	EventBus.game_over.connect(_on_game_over)
	EventBus.game_started.connect(_on_game_started)

	# Hook up the arena's hex click → return-to-bench.
	if arena_view == null:
		arena_view = get_node_or_null("/root/Main")
	if arena_view and arena_view.has_signal("arena_hex_clicked"):
		arena_view.arena_hex_clicked.connect(_on_arena_hex_clicked)

	GameState.start_game()

	# Visual validation hook (opt-in via env var). FFFA_SHOTS=1 captures a
	# static shop screenshot. FFFA_SHOTS=2 also runs an autotest that buys,
	# places, and starts combat — exercising the full M5 loop end-to-end.
	if OS.has_environment("FFFA_SHOTS"):
		get_tree().create_timer(1.0).timeout.connect(_capture_shop_shot)
		if OS.get_environment("FFFA_SHOTS") == "2":
			get_tree().create_timer(1.5).timeout.connect(_run_autotest)


func _capture_shop_shot() -> void:
	var img := get_viewport().get_texture().get_image()
	var path := "B:/FFFA/tmp/m5_shop.png"
	DirAccess.make_dir_recursive_absolute("B:/FFFA/tmp")
	img.save_png(path)
	print("[ui] saved ", path)
	if OS.get_environment("FFFA_SHOTS") != "2":
		get_tree().create_timer(0.3).timeout.connect(get_tree().quit)


func _run_autotest() -> void:
	# 1. Buy 3 units (whichever the shop rolled)
	for i in 3:
		GameState.try_buy_unit(i)
	# 2. Place them on board hexes
	var placed := 0
	for i in BENCH_SIZE:
		if GameState.bench[i] != null and placed < 3:
			var hex_key := "%d,%d" % [2 + placed, 6]
			GameState.place_unit_from_bench(i, hex_key)
			placed += 1
	# 3. Snapshot the populated shop
	get_tree().create_timer(0.5).timeout.connect(_capture_placed_shot)
	# 4. Start a fight a beat later
	get_tree().create_timer(1.0).timeout.connect(CombatSim.start_combat)
	# 5. Snapshot the FIGHT banner at its peak
	get_tree().create_timer(1.4).timeout.connect(_capture_banner_shot)
	# 6. Snapshot mid-combat (hit sparks, death puffs, camera orbit visible)
	get_tree().create_timer(3.5).timeout.connect(_capture_combat_shot)
	# 7. Quit a few seconds after combat starts (combat self-resolves)
	get_tree().create_timer(20.0).timeout.connect(_capture_postcombat_and_quit)


func _capture_banner_shot() -> void:
	var img := get_viewport().get_texture().get_image()
	img.save_png("B:/FFFA/tmp/m6_banner.png")
	print("[ui] saved m6_banner.png")


func _capture_placed_shot() -> void:
	var img := get_viewport().get_texture().get_image()
	img.save_png("B:/FFFA/tmp/m5_placed.png")
	print("[ui] saved m5_placed.png — bench:%d board:%d" %
		[_count_bench(), GameState.player_board.size()])


func _capture_combat_shot() -> void:
	var img := get_viewport().get_texture().get_image()
	img.save_png("B:/FFFA/tmp/m5_combat.png")
	print("[ui] saved m5_combat.png")


func _capture_postcombat_and_quit() -> void:
	var img := get_viewport().get_texture().get_image()
	img.save_png("B:/FFFA/tmp/m5_postcombat.png")
	print("[ui] saved m5_postcombat.png — round:%d gold:%d health:%d" %
		[GameState.current_round, GameState.gold, GameState.health])
	get_tree().create_timer(0.3).timeout.connect(get_tree().quit)


func _count_bench() -> int:
	var n := 0
	for u in GameState.bench:
		if u != null:
			n += 1
	return n


# ═══════════════════════════════════════════════════════════════════════════
#  LAYOUT
# ═══════════════════════════════════════════════════════════════════════════

func _build_ui() -> void:
	# Drop catcher first so it sits at the back of the z-order — panels
	# added after it draw on top and intercept mouse input normally.
	_build_drop_catcher()
	_build_hud_bar()
	_build_synergy_panel()
	_build_bench_row()
	_build_shop_row()
	_build_sell_zone()
	_build_action_buttons()
	_build_status_line()
	_build_banner()
	_build_game_over_overlay()


func _styled_panel(bg: Color, border: Color = Color(0, 0, 0, 0)) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(2 if border.a > 0.0 else 0)
	sb.set_corner_radius_all(6)
	sb.content_margin_left = 6
	sb.content_margin_right = 6
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	return sb


func _build_hud_bar() -> void:
	var bar := PanelContainer.new()
	bar.add_theme_stylebox_override("panel", _styled_panel(Color(0.06, 0.07, 0.12, 0.85)))
	bar.anchor_left = 0.0
	bar.anchor_right = 1.0
	bar.offset_left = 12
	bar.offset_top = 8
	bar.offset_right = -12
	bar.offset_bottom = 48
	add_child(bar)

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 24)
	bar.add_child(hbox)

	hud_gold_label = _hud_chip("GOLD", "50", Color("#FFD166"))
	hud_income_label = _hud_chip("INCOME", "+0", Color("#FBBF24"))
	hud_health_label = _hud_chip("HP", "100", Color("#EF476F"))
	hud_level_label = _hud_chip("LVL", "1", Color("#06D6A0"))
	hud_round_label = _hud_chip("STAGE", "1-1", Color("#118AB2"))
	hud_streak_label = _hud_chip("STREAK", "—", Color("#94A3B8"))
	hud_streak_chip = hud_streak_label.get_parent()
	hud_streak_chip.visible = false
	for chip in [hud_gold_label, hud_income_label, hud_health_label,
			hud_level_label, hud_round_label, hud_streak_label]:
		hbox.add_child(chip.get_parent())


func _hud_chip(label_text: String, value_text: String, color: Color) -> Label:
	var box := HBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	var lbl := Label.new()
	lbl.text = label_text
	lbl.add_theme_color_override("font_color", color)
	lbl.add_theme_font_size_override("font_size", 14)
	box.add_child(lbl)
	var val := Label.new()
	val.text = value_text
	val.add_theme_color_override("font_color", Color("#F8FAFC"))
	val.add_theme_font_size_override("font_size", 18)
	box.add_child(val)
	return val


func _build_synergy_panel() -> void:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _styled_panel(Color(0.06, 0.07, 0.12, 0.78)))
	panel.anchor_left = 0.0
	panel.anchor_top = 0.0
	panel.anchor_bottom = 1.0
	panel.offset_left = 12
	panel.offset_top = 64
	panel.offset_right = 184
	panel.offset_bottom = -260
	add_child(panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 4)
	panel.add_child(vbox)

	var title := Label.new()
	title.text = "SYNERGIES"
	title.add_theme_font_size_override("font_size", 14)
	title.add_theme_color_override("font_color", Color("#FBBF24"))
	vbox.add_child(title)

	synergy_list = VBoxContainer.new()
	synergy_list.add_theme_constant_override("separation", 2)
	vbox.add_child(synergy_list)


func _build_bench_row() -> void:
	var bar := PanelContainer.new()
	bar.add_theme_stylebox_override("panel", _styled_panel(Color(0.06, 0.07, 0.12, 0.85)))
	bar.anchor_left = 0.5
	bar.anchor_right = 0.5
	bar.anchor_top = 1.0
	bar.anchor_bottom = 1.0
	var bench_w := BENCH_SIZE * (SLOT_W + 6) + 12
	bar.offset_left = -bench_w * 0.5
	bar.offset_right = bench_w * 0.5
	bar.offset_top = -292
	bar.offset_bottom = -188
	add_child(bar)

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 6)
	bar.add_child(hbox)

	for i in BENCH_SIZE:
		var slot := _make_bench_slot(i)
		hbox.add_child(slot)
		bench_slots.append(slot)


func _build_shop_row() -> void:
	var bar := PanelContainer.new()
	bar.add_theme_stylebox_override("panel", _styled_panel(Color(0.06, 0.07, 0.12, 0.92), Color("#FBBF24", 0.6)))
	bar.anchor_left = 0.5
	bar.anchor_right = 0.5
	bar.anchor_top = 1.0
	bar.anchor_bottom = 1.0
	var shop_w := SHOP_SIZE * (CARD_W + 8) + 16
	bar.offset_left = -shop_w * 0.5
	bar.offset_right = shop_w * 0.5
	bar.offset_top = -184
	bar.offset_bottom = -12
	add_child(bar)

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 8)
	bar.add_child(hbox)

	for i in SHOP_SIZE:
		var card := _make_shop_card(i)
		hbox.add_child(card)
		shop_cards.append(card)


func _build_sell_zone() -> void:
	sell_zone = Panel.new()
	sell_zone.add_theme_stylebox_override("panel", _styled_panel(Color(0.55, 0.10, 0.12, 0.55), Color("#EF4444", 0.9)))
	sell_zone.anchor_left = 1.0
	sell_zone.anchor_top = 1.0
	sell_zone.anchor_right = 1.0
	sell_zone.anchor_bottom = 1.0
	sell_zone.offset_left = -200
	sell_zone.offset_top = -292
	sell_zone.offset_right = -16
	sell_zone.offset_bottom = -188
	sell_zone.set_script(_make_sell_zone_script())
	sell_zone.set_meta("ui", self)
	add_child(sell_zone)

	var lbl := Label.new()
	lbl.text = "SELL"
	lbl.add_theme_font_size_override("font_size", 28)
	lbl.add_theme_color_override("font_color", Color("#FECACA"))
	lbl.anchor_right = 1.0
	lbl.anchor_bottom = 1.0
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	sell_zone.add_child(lbl)


func _build_action_buttons() -> void:
	var bar := HBoxContainer.new()
	bar.add_theme_constant_override("separation", 8)
	bar.anchor_left = 1.0
	bar.anchor_top = 1.0
	bar.anchor_right = 1.0
	bar.anchor_bottom = 1.0
	bar.offset_left = -460
	bar.offset_top = -148
	bar.offset_right = -16
	bar.offset_bottom = -116
	add_child(bar)

	reroll_button = _make_action_button("↻ REROLL (2g)", _on_reroll_pressed)
	bar.add_child(reroll_button)

	levelup_button = _make_action_button("LEVEL UP (5g)", _on_levelup_pressed)
	bar.add_child(levelup_button)

	fight_button = _make_action_button("⚔ START FIGHT", _on_fight_pressed)
	bar.add_child(fight_button)


func _make_action_button(label: String, callback: Callable) -> Button:
	var btn := Button.new()
	btn.text = label
	btn.custom_minimum_size = Vector2(140, 32)
	btn.pressed.connect(callback)
	return btn


func _build_banner() -> void:
	# Transparent passthrough container so the banner never eats clicks.
	var holder := Control.new()
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.anchor_right = 1.0
	holder.anchor_bottom = 1.0
	add_child(holder)

	banner_label = Label.new()
	banner_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	banner_label.anchor_left = 0.0
	banner_label.anchor_top = 0.22
	banner_label.anchor_right = 1.0
	banner_label.anchor_bottom = 0.22
	banner_label.offset_left = 0
	banner_label.offset_top = -80
	banner_label.offset_right = 0
	banner_label.offset_bottom = 80
	banner_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	banner_label.add_theme_font_size_override("font_size", 88)
	banner_label.add_theme_color_override("font_color", Color.WHITE)
	banner_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	banner_label.add_theme_constant_override("outline_size", 10)
	banner_label.pivot_offset = Vector2(0, 40)
	banner_label.modulate.a = 0.0
	banner_label.text = ""
	holder.add_child(banner_label)


func _show_banner(text: String, color: Color) -> void:
	if banner_label == null:
		return
	banner_label.text = text
	banner_label.add_theme_color_override("font_color", color)
	banner_label.modulate = Color(1, 1, 1, 1)
	banner_label.scale = Vector2(0.7, 0.7)
	var tw := create_tween()
	tw.tween_property(banner_label, "scale", Vector2(1.15, 1.15), 0.28)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(banner_label, "scale", Vector2(1.0, 1.0), 0.18)
	tw.tween_interval(1.0)
	tw.tween_property(banner_label, "modulate:a", 0.0, 0.55)


func _build_game_over_overlay() -> void:
	# Fullscreen modal that eats input until the player restarts. Hidden until
	# EventBus.game_over fires; revealed with a quick scale-in via _on_game_over.
	game_over_overlay = Control.new()
	game_over_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	game_over_overlay.anchor_right = 1.0
	game_over_overlay.anchor_bottom = 1.0
	game_over_overlay.visible = false
	add_child(game_over_overlay)

	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.62)
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	game_over_overlay.add_child(dim)

	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel",
		_styled_panel(Color(0.06, 0.07, 0.12, 0.96), Color("#EF4444", 0.85)))
	panel.anchor_left = 0.5
	panel.anchor_top = 0.5
	panel.anchor_right = 0.5
	panel.anchor_bottom = 0.5
	panel.offset_left = -240
	panel.offset_top = -150
	panel.offset_right = 240
	panel.offset_bottom = 150
	game_over_overlay.add_child(panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 14)
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	panel.add_child(vbox)

	var title := Label.new()
	title.text = "GAME OVER"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 56)
	title.add_theme_color_override("font_color", Color("#FCA5A5"))
	title.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	title.add_theme_constant_override("outline_size", 6)
	vbox.add_child(title)

	game_over_subtitle = Label.new()
	game_over_subtitle.text = ""
	game_over_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	game_over_subtitle.add_theme_font_size_override("font_size", 18)
	game_over_subtitle.add_theme_color_override("font_color", Color("#E5E7EB"))
	vbox.add_child(game_over_subtitle)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 12)
	vbox.add_child(spacer)

	var play_again := Button.new()
	play_again.text = "▶  PLAY AGAIN"
	play_again.custom_minimum_size = Vector2(220, 44)
	play_again.add_theme_font_size_override("font_size", 18)
	play_again.pressed.connect(_on_play_again_pressed)
	# Center the button under the subtitle.
	var btn_row := HBoxContainer.new()
	btn_row.alignment = BoxContainer.ALIGNMENT_CENTER
	btn_row.add_child(play_again)
	vbox.add_child(btn_row)


func _on_game_over(_placement: int) -> void:
	game_ended = true
	if game_over_overlay == null:
		return
	game_over_subtitle.text = "Reached Stage %s · Level %d" % [
		GameState.get_stage_label(), GameState.player_level]
	game_over_overlay.visible = true
	game_over_overlay.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_interval(0.35)  # let the DEFEAT banner read first
	tw.tween_property(game_over_overlay, "modulate:a", 1.0, 0.45)
	# Lock interactive controls behind the modal as a safety net even though
	# the overlay's STOP filter already eats clicks.
	if fight_button: fight_button.disabled = true
	if reroll_button: reroll_button.disabled = true
	if levelup_button: levelup_button.disabled = true
	for c in shop_cards: c.disabled = true


func _on_play_again_pressed() -> void:
	if game_over_overlay:
		game_over_overlay.visible = false
	game_ended = false
	GameState.start_game()


func _on_game_started(_mode: String) -> void:
	# Reset transient banner / status text so a fresh run starts clean.
	if banner_label:
		banner_label.modulate.a = 0.0
	if status_label:
		status_label.text = ""
	if hud_streak_chip:
		hud_streak_chip.visible = false
	if fight_button: fight_button.disabled = false
	if reroll_button: reroll_button.disabled = false
	_refresh_hud()
	_refresh_shop()
	_refresh_bench()
	_refresh_synergies()


func _build_status_line() -> void:
	status_label = Label.new()
	status_label.anchor_left = 0.0
	status_label.anchor_top = 1.0
	status_label.anchor_right = 1.0
	status_label.anchor_bottom = 1.0
	status_label.offset_left = 12
	status_label.offset_top = -22
	status_label.offset_right = -12
	status_label.offset_bottom = -2
	status_label.text = ""
	status_label.add_theme_color_override("font_color", Color("#FBBF24"))
	status_label.add_theme_font_size_override("font_size", 13)
	add_child(status_label)


func _build_drop_catcher() -> void:
	# Fullscreen Control that catches drag-drop releases over the 3D arena
	# (anywhere not eaten by a smaller Control). Mouse_filter = PASS so
	# regular hover/click events still reach the 3D viewport.
	drop_catcher = Control.new()
	drop_catcher.mouse_filter = Control.MOUSE_FILTER_PASS
	drop_catcher.anchor_right = 1.0
	drop_catcher.anchor_bottom = 1.0
	drop_catcher.set_script(_make_drop_catcher_script())
	drop_catcher.set_meta("ui", self)
	add_child(drop_catcher)


# ─── Bench slot factory ─────────────────────────────────────────────────────

func _make_bench_slot(index: int) -> Control:
	var slot := Panel.new()
	slot.custom_minimum_size = Vector2(SLOT_W, SLOT_H)
	slot.add_theme_stylebox_override("panel", _styled_panel(Color(0.12, 0.14, 0.20, 0.95), Color("#475569")))
	slot.set_script(_make_bench_slot_script())
	slot.set_meta("ui", self)
	slot.set_meta("index", index)

	# Portrait image — fills top portion of the slot
	var portrait := TextureRect.new()
	portrait.name = "Portrait"
	portrait.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.position = Vector2(6, 4)
	portrait.size = Vector2(SLOT_W - 12, 50)
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	slot.add_child(portrait)

	var name_label := Label.new()
	name_label.name = "NameLabel"
	name_label.text = ""
	name_label.add_theme_font_size_override("font_size", 10)
	name_label.add_theme_color_override("font_color", Color("#F8FAFC"))
	name_label.position = Vector2(4, 56)
	name_label.size = Vector2(SLOT_W - 8, 36)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	name_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	slot.add_child(name_label)

	var star_label := Label.new()
	star_label.name = "StarLabel"
	star_label.text = ""
	star_label.add_theme_font_size_override("font_size", 14)
	star_label.add_theme_color_override("font_color", Color("#FBBF24"))
	star_label.position = Vector2(SLOT_W - 22, 2)
	star_label.size = Vector2(20, 16)
	star_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	slot.add_child(star_label)

	return slot


# ─── Shop card factory ──────────────────────────────────────────────────────

func _make_shop_card(index: int) -> Button:
	var card := Button.new()
	card.custom_minimum_size = Vector2(CARD_W, CARD_H)
	card.text = ""
	card.clip_contents = true
	card.set_meta("index", index)
	card.pressed.connect(_on_shop_card_pressed.bind(index))

	# Portrait image — fills top portion of the card
	var portrait := TextureRect.new()
	portrait.name = "Portrait"
	portrait.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.custom_minimum_size = Vector2(CARD_W - 12, 90)
	portrait.position = Vector2(6, 4)
	portrait.size = Vector2(CARD_W - 12, 90)
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(portrait)

	# Label for name/faction/cost — sits below the portrait
	var info := Label.new()
	info.name = "Info"
	info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	info.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	info.position = Vector2(0, 96)
	info.size = Vector2(CARD_W, CARD_H - 96)
	info.add_theme_font_size_override("font_size", 11)
	info.add_theme_color_override("font_color", Color("#F8FAFC"))
	info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(info)

	return card


# ═══════════════════════════════════════════════════════════════════════════
#  STATE → UI REFRESH
# ═══════════════════════════════════════════════════════════════════════════

func _refresh_hud(_v = null) -> void:
	if hud_gold_label: hud_gold_label.text = str(GameState.gold)
	if hud_income_label: hud_income_label.text = "+%d" % GameState.get_round_income_preview()
	if hud_health_label: hud_health_label.text = str(GameState.health)
	if hud_level_label: hud_level_label.text = str(GameState.player_level)
	if hud_round_label: hud_round_label.text = GameState.get_stage_label()
	if levelup_button:
		var cost := GameState.get_level_up_cost()
		if cost < 0:
			levelup_button.text = "MAX LEVEL"
			levelup_button.disabled = true
		else:
			levelup_button.text = "LEVEL UP (%dg)" % cost
			levelup_button.disabled = GameState.gold < cost


func _on_streak_changed(win_streak: int, loss_streak: int) -> void:
	if hud_streak_label == null or hud_streak_chip == null:
		return
	if win_streak >= 2:
		hud_streak_label.text = "W%d" % win_streak
		hud_streak_label.add_theme_color_override("font_color", Color("#34D399"))
		hud_streak_chip.visible = true
	elif loss_streak >= 2:
		hud_streak_label.text = "L%d" % loss_streak
		hud_streak_label.add_theme_color_override("font_color", Color("#F87171"))
		hud_streak_chip.visible = true
	else:
		hud_streak_chip.visible = false
	# Streak changes the income preview, so reflect that in the gold chip too.
	_refresh_hud()


func _refresh_shop() -> void:
	for i in SHOP_SIZE:
		var card: Button = shop_cards[i]
		if i >= GameState.shop_units.size():
			_paint_card(card, "")
			continue
		var uid: String = GameState.shop_units[i]
		_paint_card(card, uid)


func _paint_card(card: Button, unit_id: String) -> void:
	var portrait: TextureRect = card.get_node_or_null("Portrait")
	var info: Label = card.get_node_or_null("Info")
	if unit_id.is_empty():
		card.text = ""
		if info: info.text = ""
		if portrait: portrait.texture = null
		card.disabled = true
		card.modulate = Color(0.4, 0.4, 0.4, 0.5)
		card.add_theme_stylebox_override("normal", _styled_panel(Color(0.10, 0.12, 0.18, 0.6)))
		return
	var data: Dictionary = GameData.units_data.get(unit_id, {})
	if data.is_empty():
		return
	var faction: String = data.get("faction", "")
	var cost: int = int(data.get("cost", 1))
	var name_str: String = data.get("name", unit_id)
	card.text = ""  # text lives in the Info label now
	if info:
		info.text = "%s\n[%s] %dg" % [name_str, faction, cost]
	# Load portrait texture
	if portrait:
		var path := "res://art/portraits/%s.png" % unit_id
		if ResourceLoader.exists(path):
			portrait.texture = load(path)
		else:
			portrait.texture = null
	card.modulate = Color(1, 1, 1, 1)
	card.disabled = GameState.gold < cost
	var bg := COST_COLORS.get(cost, Color("#475569")) as Color
	bg.a = 0.85
	var border := FACTION_COLORS.get(faction, Color("#94A3B8")) as Color
	card.add_theme_stylebox_override("normal", _styled_panel(bg, border))
	card.add_theme_stylebox_override("hover", _styled_panel(bg.lightened(0.15), border))
	card.add_theme_stylebox_override("pressed", _styled_panel(bg.darkened(0.15), border))
	card.add_theme_stylebox_override("disabled", _styled_panel(Color(0.18, 0.18, 0.20, 0.7), border))
	card.add_theme_color_override("font_color", Color("#F8FAFC"))
	card.add_theme_color_override("font_disabled_color", Color("#94A3B8"))
	card.add_theme_font_size_override("font_size", 12)


func _refresh_bench() -> void:
	for i in BENCH_SIZE:
		var slot: Control = bench_slots[i]
		var u = GameState.bench[i]
		var portrait: TextureRect = slot.get_node("Portrait")
		var name_label: Label = slot.get_node("NameLabel")
		var star_label: Label = slot.get_node("StarLabel")
		if u == null:
			portrait.texture = null
			name_label.text = ""
			star_label.text = ""
			slot.add_theme_stylebox_override("panel", _styled_panel(Color(0.12, 0.14, 0.20, 0.95), Color("#475569")))
		else:
			var data: Dictionary = GameData.units_data.get(u.id, {})
			var path := "res://art/portraits/%s.png" % u.id
			if ResourceLoader.exists(path):
				portrait.texture = load(path)
			else:
				portrait.texture = null
			name_label.text = data.get("name", u.id)
			star_label.text = "★".repeat(int(u.stars))
			var faction: String = data.get("faction", "")
			var border: Color = FACTION_COLORS.get(faction, Color("#94A3B8"))
			var cost: int = int(data.get("cost", 1))
			var bg: Color = COST_COLORS.get(cost, Color("#475569"))
			bg.a = 0.7
			slot.add_theme_stylebox_override("panel", _styled_panel(bg, border))


func _refresh_synergies(synergies: Dictionary = {}) -> void:
	if synergy_list == null:
		return
	for child in synergy_list.get_children():
		child.queue_free()
	if synergies.is_empty():
		synergies = GameState.get_active_synergies()
	# Build a count map so we show "Bengal 4/6" style progression too.
	var counts: Dictionary = {}
	for hk in GameState.player_board:
		var u = GameState.player_board[hk]
		var data: Dictionary = GameData.units_data.get(u.id, {})
		var faction: String = data.get("faction", "")
		if faction != "":
			counts[faction] = counts.get(faction, 0) + 1
	for faction_name in counts:
		var entry := HBoxContainer.new()
		var pip := ColorRect.new()
		pip.color = FACTION_COLORS.get(faction_name, Color("#94A3B8"))
		pip.custom_minimum_size = Vector2(10, 14)
		entry.add_child(pip)
		var lbl := Label.new()
		var count: int = counts[faction_name]
		var thresh: int = _next_threshold(faction_name, count)
		lbl.text = "  %s %d/%d" % [faction_name, count, thresh]
		lbl.add_theme_font_size_override("font_size", 12)
		var col: Color = Color("#E5E7EB")
		if synergies.has(faction_name):
			col = Color("#FBBF24")
		lbl.add_theme_color_override("font_color", col)
		entry.add_child(lbl)
		synergy_list.add_child(entry)


func _next_threshold(faction: String, count: int) -> int:
	var syn: Dictionary = GameData.faction_synergies.get(faction, {})
	if syn.is_empty():
		return count
	var thresholds: Array = syn.get("thresholds", [2, 4, 6])
	for t in thresholds:
		if count < int(t):
			return int(t)
	return int(thresholds[-1])


# ═══════════════════════════════════════════════════════════════════════════
#  EVENT HANDLERS — game state → UI refresh
# ═══════════════════════════════════════════════════════════════════════════

func _on_unit_bought(_unit_id: String, _slot: int) -> void:
	_refresh_bench()
	_refresh_shop()
	_refresh_hud()


func _on_unit_sold_signal(_unit_id: String, _source: String) -> void:
	_refresh_bench()
	_refresh_hud()


func _on_unit_placed(_unit_id: String, _hex_key: String) -> void:
	_refresh_bench()
	_refresh_synergies()


func _on_unit_removed(_unit_id: String, _hex_key: String) -> void:
	_refresh_bench()
	_refresh_synergies()


func _on_unit_merged(unit_id: String, new_stars: int) -> void:
	_refresh_bench()
	_refresh_synergies()
	_set_status("MERGED → %s ★%d" % [unit_id, new_stars])


func _on_combat_started() -> void:
	_set_status("FIGHT!")
	fight_button.disabled = true
	reroll_button.disabled = true
	levelup_button.disabled = true
	for c in shop_cards: c.disabled = true


func _on_combat_ended(player_won: bool) -> void:
	_set_status("VICTORY!" if player_won else "DEFEAT")
	fight_button.disabled = false
	reroll_button.disabled = false
	_refresh_hud()
	_refresh_shop()
	_refresh_bench()
	_refresh_synergies()


# ═══════════════════════════════════════════════════════════════════════════
#  USER ACTIONS
# ═══════════════════════════════════════════════════════════════════════════

func _on_shop_card_pressed(index: int) -> void:
	if not GameState.try_buy_unit(index):
		_set_status("can't buy: not enough gold or bench full")


func _on_reroll_pressed() -> void:
	if not GameState.try_reroll():
		_set_status("can't reroll: need 2g")


func _on_levelup_pressed() -> void:
	if not GameState.try_level_up():
		_set_status("can't level up")


func _on_fight_pressed() -> void:
	if GameState.combat_state != "idle":
		return
	if GameState.player_board.is_empty():
		EventBus.banner_requested.emit("PLACE UNITS FIRST!", Color(1, 0.8, 0.2))
		_set_status("drag units from bench onto the arena hexes, then fight")
		return
	CombatSim.start_combat()


func _on_arena_hex_clicked(hex_key: String) -> void:
	# In shop phase, clicking a board hex returns its unit to the bench.
	if GameState.combat_state != "idle":
		return
	if GameState.player_board.has(hex_key):
		GameState.return_unit_to_bench(hex_key)


# ═══════════════════════════════════════════════════════════════════════════
#  DRAG-DROP HELPERS (called by bench-slot / drop-catcher inner scripts)
# ═══════════════════════════════════════════════════════════════════════════

func make_bench_drag_preview(bench_index: int) -> Control:
	var u = GameState.bench[bench_index]
	if u == null:
		return null
	var preview := Panel.new()
	preview.custom_minimum_size = Vector2(SLOT_W, SLOT_H)
	preview.size = Vector2(SLOT_W, SLOT_H)
	var data: Dictionary = GameData.units_data.get(u.id, {})
	var border := FACTION_COLORS.get(data.get("faction", ""), Color("#94A3B8")) as Color
	var cost := int(data.get("cost", 1))
	var bg := COST_COLORS.get(cost, Color("#475569")) as Color
	bg.a = 0.85
	preview.add_theme_stylebox_override("panel", _styled_panel(bg, border))
	var portrait := TextureRect.new()
	portrait.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.position = Vector2(6, 4)
	portrait.size = Vector2(SLOT_W - 12, 50)
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var path := "res://art/portraits/%s.png" % u.id
	if ResourceLoader.exists(path):
		portrait.texture = load(path)
	preview.add_child(portrait)
	var lbl := Label.new()
	lbl.text = data.get("name", u.id)
	lbl.add_theme_font_size_override("font_size", 10)
	lbl.add_theme_color_override("font_color", Color("#F8FAFC"))
	lbl.position = Vector2(4, 56)
	lbl.size = Vector2(SLOT_W - 8, 36)
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lbl.autowrap_mode = TextServer.AUTOWRAP_WORD
	preview.add_child(lbl)
	return preview


func handle_drop_on_arena(screen_pos: Vector2, drag_data: Variant) -> void:
	if arena_view == null:
		return
	if not (drag_data is Dictionary) or drag_data.get("source", "") != "bench":
		return
	var bench_idx: int = drag_data.get("index", -1)
	if bench_idx < 0:
		return
	var hex_key: String = arena_view.screen_to_hex_key(screen_pos)
	if hex_key.is_empty():
		return
	if not GameState.place_unit_from_bench(bench_idx, hex_key):
		_set_status("can't place there")


func handle_drop_on_bench(target_index: int, drag_data: Variant) -> void:
	if not (drag_data is Dictionary) or drag_data.get("source", "") != "bench":
		return
	var src_idx: int = drag_data.get("index", -1)
	if src_idx < 0 or src_idx == target_index:
		return
	var src_unit = GameState.bench[src_idx]
	var dst_unit = GameState.bench[target_index]
	GameState.bench[target_index] = src_unit
	GameState.bench[src_idx] = dst_unit
	GameState.try_merge_all()
	_refresh_bench()


func handle_drop_on_sell(drag_data: Variant) -> void:
	if not (drag_data is Dictionary):
		return
	if drag_data.get("source", "") != "bench":
		return
	GameState.sell_unit_from_bench(drag_data.get("index", -1))


func _set_status(text: String) -> void:
	if status_label:
		status_label.text = text


# ═══════════════════════════════════════════════════════════════════════════
#  INNER SCRIPTS for drag-drop targets
# ═══════════════════════════════════════════════════════════════════════════
# Each drop target needs its own _can_drop_data / _drop_data overrides.
# Godot 4 attaches these via GDScript subclassing — easiest path is to load
# small inline scripts from disk. We create them lazily here.

func _make_bench_slot_script() -> GDScript:
	return preload("res://scripts/ui/bench_slot.gd")


func _make_sell_zone_script() -> GDScript:
	return preload("res://scripts/ui/sell_zone.gd")


func _make_drop_catcher_script() -> GDScript:
	return preload("res://scripts/ui/drop_catcher.gd")
