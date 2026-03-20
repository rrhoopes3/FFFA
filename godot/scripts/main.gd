# main.gd — Root scene controller, game flow manager
# Orchestrates lobby → game → combat loop
extends Node2D

# UI references (created in _ready)
var lobby_screen: Control
var hex_board: Node2D
var shop_panel: Control
var bench_panel: Control
var synergy_panel: Control
var hud: Control
var tooltip: Control
var banner: Control
var particles_vfx: Node2D
var input_handler: Node
var combat_system: Node
var merge_system: Node

# UI layer for controls on top
var ui_layer: CanvasLayer
var game_container: Control

func _ready() -> void:
	# Copy sprite assets if not already in Godot project
	_setup_assets()
	
	# Build the scene tree programmatically
	_build_scene()
	
	# Start with lobby
	_show_lobby()

func _setup_assets() -> void:
	# Sprite sheets are referenced from the parent project's sheets/ directory
	# In Godot, we'll reference them via res://assets/sprites/
	pass

func _build_scene() -> void:
	# ── Arena Background (full-screen shader quad) ──
	var bg_rect := ColorRect.new()
	bg_rect.anchors_preset = Control.PRESET_FULL_RECT
	bg_rect.color = Color(0.051, 0.067, 0.09)
	bg_rect.z_index = -10
	# Apply arena shader if available
	var shader_path := "res://shaders/arena_background.gdshader"
	if ResourceLoader.exists(shader_path):
		var shader_mat := ShaderMaterial.new()
		shader_mat.shader = load(shader_path)
		bg_rect.material = shader_mat
	add_child(bg_rect)
	
	# ── Hex Board (center) ──
	hex_board = Node2D.new()
	hex_board.set_script(load("res://scripts/board/hex_board.gd"))
	hex_board.name = "HexBoard"
	add_child(hex_board)
	
	# ── Particles VFX layer ──
	particles_vfx = Node2D.new()
	particles_vfx.set_script(load("res://scripts/ui/particles_vfx.gd"))
	particles_vfx.name = "ParticlesVFX"
	add_child(particles_vfx)
	
	# ── UI Layer (on top of game world) ──
	ui_layer = CanvasLayer.new()
	ui_layer.layer = 10
	add_child(ui_layer)
	
	# Main UI container
	game_container = Control.new()
	game_container.anchors_preset = Control.PRESET_FULL_RECT
	game_container.name = "GameUI"
	game_container.visible = false  # Hidden until game starts
	ui_layer.add_child(game_container)
	
	# ── HUD (top bar) ──
	hud = HBoxContainer.new()
	hud.set_script(load("res://scripts/ui/hud.gd"))
	hud.name = "HUD"
	hud.anchors_preset = Control.PRESET_TOP_WIDE
	hud.offset_bottom = 50
	var hud_bg := StyleBoxFlat.new()
	hud_bg.bg_color = Color(0.051, 0.067, 0.09, 0.95)
	hud_bg.border_color = Color(1, 0.843, 0, 0.3)
	hud_bg.border_width_bottom = 2
	hud_bg.set_content_margin_all(8)
	var hud_panel := PanelContainer.new()
	hud_panel.add_theme_stylebox_override("panel", hud_bg)
	hud_panel.anchors_preset = Control.PRESET_TOP_WIDE
	hud_panel.offset_bottom = 50
	hud_panel.add_child(hud)
	game_container.add_child(hud_panel)
	
	# ── Synergy Panel (left side) ──
	var synergy_scroll := ScrollContainer.new()
	synergy_scroll.anchors_preset = Control.PRESET_LEFT_WIDE
	synergy_scroll.offset_top = 55
	synergy_scroll.offset_right = 190
	synergy_scroll.offset_bottom = -90
	game_container.add_child(synergy_scroll)
	
	synergy_panel = VBoxContainer.new()
	synergy_panel.set_script(load("res://scripts/ui/synergy_panel.gd"))
	synergy_panel.name = "SynergyPanel"
	synergy_scroll.add_child(synergy_panel)
	
	# ── Shop Panel (right side) ──
	var shop_scroll := ScrollContainer.new()
	shop_scroll.anchors_preset = Control.PRESET_RIGHT_WIDE
	shop_scroll.offset_top = 55
	shop_scroll.offset_left = -180
	shop_scroll.offset_bottom = -10
	game_container.add_child(shop_scroll)
	
	shop_panel = VBoxContainer.new()
	shop_panel.set_script(load("res://scripts/ui/shop_panel.gd"))
	shop_panel.name = "ShopPanel"
	shop_scroll.add_child(shop_panel)
	
	# ── Bench Panel (bottom center) ──
	var bench_container := CenterContainer.new()
	bench_container.anchors_preset = Control.PRESET_BOTTOM_WIDE
	bench_container.offset_top = -85
	game_container.add_child(bench_container)
	
	bench_panel = HBoxContainer.new()
	bench_panel.set_script(load("res://scripts/ui/bench_panel.gd"))
	bench_panel.name = "BenchPanel"
	bench_container.add_child(bench_panel)
	
	# ── Fight Button (bottom right) ──
	var fight_btn := Button.new()
	fight_btn.name = "FightButton"
	fight_btn.text = "⚔️ FIGHT!"
	fight_btn.custom_minimum_size = Vector2(120, 45)
	fight_btn.anchors_preset = Control.PRESET_BOTTOM_RIGHT
	fight_btn.offset_left = -140
	fight_btn.offset_top = -55
	fight_btn.offset_right = -10
	fight_btn.offset_bottom = -5
	var fight_style := StyleBoxFlat.new()
	fight_style.bg_color = Color(0.6, 0.15, 0.15, 0.9)
	fight_style.border_color = Color(1, 0.3, 0.3, 0.8)
	fight_style.set_border_width_all(2)
	fight_style.set_corner_radius_all(6)
	fight_btn.add_theme_stylebox_override("normal", fight_style)
	var fight_hover := StyleBoxFlat.new()
	fight_hover.bg_color = Color(0.8, 0.2, 0.2, 0.9)
	fight_hover.border_color = Color(1, 0.4, 0.4)
	fight_hover.set_border_width_all(2)
	fight_hover.set_corner_radius_all(6)
	fight_btn.add_theme_stylebox_override("hover", fight_hover)
	fight_btn.add_theme_font_size_override("font_size", 18)
	fight_btn.add_theme_color_override("font_color", Color(1, 0.9, 0.7))
	fight_btn.pressed.connect(_on_fight_pressed)
	game_container.add_child(fight_btn)
	
	# ── Tooltip (floating, on top) ──
	tooltip = PanelContainer.new()
	tooltip.set_script(load("res://scripts/ui/tooltip.gd"))
	tooltip.name = "Tooltip"
	ui_layer.add_child(tooltip)
	
	# ── Banner (center overlay) ──
	banner = CenterContainer.new()
	banner.set_script(load("res://scripts/ui/banner.gd"))
	banner.name = "Banner"
	ui_layer.add_child(banner)
	
	# ── Non-visual systems ──
	input_handler = Node.new()
	input_handler.set_script(load("res://scripts/board/input_handler.gd"))
	input_handler.name = "InputHandler"
	add_child(input_handler)
	
	combat_system = Node.new()
	combat_system.set_script(load("res://scripts/combat/combat_system.gd"))
	combat_system.name = "CombatSystem"
	add_child(combat_system)
	
	merge_system = Node.new()
	merge_system.set_script(load("res://scripts/ui/merge_system.gd"))
	merge_system.name = "MergeSystem"
	add_child(merge_system)
	
	# ── Lobby Screen (on top of everything) ──
	lobby_screen = Control.new()
	lobby_screen.set_script(load("res://scripts/ui/lobby_screen.gd"))
	lobby_screen.name = "LobbyScreen"
	lobby_screen.anchors_preset = Control.PRESET_FULL_RECT
	ui_layer.add_child(lobby_screen)
	lobby_screen.mode_selected.connect(_on_mode_selected)

func _show_lobby() -> void:
	game_container.visible = false
	lobby_screen.visible = true

func _on_mode_selected(mode: String) -> void:
	GameState.reset()
	GameState.mode = mode
	
	# Roll initial shop
	GameState.roll_initial_shop()
	
	# Setup input handler
	input_handler.setup(hex_board, bench_panel, particles_vfx)
	
	# Show game UI
	game_container.visible = true
	
	# Refresh all UI
	_refresh_all_ui()
	
	EventBus.game_started.emit(mode)
	EventBus.banner_requested.emit("Round 1 — Prepare for Battle!", Color(1, 0.843, 0))

func _on_fight_pressed() -> void:
	if GameState.combat_state != "idle":
		return
	combat_system.start_combat()

func _refresh_all_ui() -> void:
	if shop_panel.has_method("refresh"):
		shop_panel.refresh()
	if bench_panel.has_method("refresh"):
		bench_panel.refresh()
	if synergy_panel.has_method("refresh"):
		synergy_panel.refresh()
	if hud.has_method("refresh"):
		hud.refresh()
	hex_board.queue_redraw()

func _process(_delta: float) -> void:
	# Continuously redraw hex board during combat for unit movement
	if GameState.combat_state == "combat":
		hex_board.queue_redraw()
