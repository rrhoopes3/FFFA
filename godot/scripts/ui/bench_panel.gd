extends HBoxContainer
## 9-slot bench panel displayed at the bottom of the game board.
## Each slot supports drag-and-drop for unit placement and swapping,
## right-click / double-click to sell, and visual feedback (hover glow,
## star badges, faction colour tint).

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
const SLOT_SIZE := Vector2(72, 72)
const SLOT_COUNT: int = 9

const COLOR_SLOT_BG := Color("#1a1f2e")
const COLOR_SLOT_BORDER := Color(1.0, 1.0, 1.0, 0.15)
const COLOR_HOVER_GLOW := Color(0.33, 0.8, 1.0, 0.25)
const COLOR_STAR_1 := Color("#ffd700")  # gold
const COLOR_STAR_2 := Color("#4fc3f7")  # blue
const COLOR_STAR_3 := Color("#f48fb1")  # pink

const STAR_LABELS := {
	1: "★",
	2: "★★",
	3: "★★★",
}

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var _slots: Array[Panel] = []


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
func _ready() -> void:
	# Layout settings
	alignment = BoxContainer.ALIGNMENT_CENTER
	add_theme_constant_override("separation", 6)

	# Build 9 slots
	for i in SLOT_COUNT:
		var slot := _create_slot(i)
		add_child(slot)
		_slots.append(slot)

	# Listen for relevant signals
	EventBus.unit_bought.connect(_on_unit_bought)
	EventBus.unit_sold.connect(_on_unit_sold)
	EventBus.unit_merged.connect(_on_unit_merged)

	# Initial draw
	refresh()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

## Re-read the entire GameState.bench array and update every slot visual.
func refresh() -> void:
	for i in SLOT_COUNT:
		_update_slot(i)


# ---------------------------------------------------------------------------
# Slot creation
# ---------------------------------------------------------------------------

## Build a single bench slot Panel node with all child labels and textures.
func _create_slot(index: int) -> Panel:
	var panel := Panel.new()
	panel.name = "BenchSlot_%d" % index
	panel.custom_minimum_size = SLOT_SIZE
	panel.size = SLOT_SIZE
	panel.mouse_filter = Control.MOUSE_FILTER_STOP
	panel.tooltip_text = ""

	# -- Background StyleBox --
	var style := StyleBoxFlat.new()
	style.bg_color = COLOR_SLOT_BG
	style.border_color = COLOR_SLOT_BORDER
	style.set_border_width_all(1)
	style.set_corner_radius_all(6)
	# Dashed-border approximation: we draw a subtle double-line effect
	style.border_blend = true
	panel.add_theme_stylebox_override("panel", style)

	# -- Unit sprite rect --
	var sprite := TextureRect.new()
	sprite.name = "UnitSprite"
	sprite.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	sprite.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
	sprite.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	sprite.offset_left = 4
	sprite.offset_top = 4
	sprite.offset_right = -4
	sprite.offset_bottom = -14
	sprite.visible = false
	sprite.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(sprite)

	# -- Unit name label --
	var name_label := Label.new()
	name_label.name = "NameLabel"
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	name_label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	name_label.offset_top = -16
	name_label.add_theme_font_size_override("font_size", 9)
	name_label.add_theme_color_override("font_color", Color.WHITE)
	name_label.visible = false
	name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(name_label)

	# -- Star badge label (top-left) --
	var star_label := Label.new()
	star_label.name = "StarLabel"
	star_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	star_label.offset_left = 2
	star_label.offset_top = 1
	star_label.add_theme_font_size_override("font_size", 10)
	star_label.visible = false
	star_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(star_label)

	# -- Cost label (top-right corner) --
	var cost_label := Label.new()
	cost_label.name = "CostLabel"
	cost_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	cost_label.offset_right = -4
	cost_label.offset_top = 1
	cost_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	cost_label.add_theme_font_size_override("font_size", 9)
	cost_label.add_theme_color_override("font_color", Color(1.0, 0.84, 0.0, 0.8))
	cost_label.visible = false
	cost_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(cost_label)

	# -- Hover overlay (transparent highlight drawn on top) --
	var hover_overlay := ColorRect.new()
	hover_overlay.name = "HoverOverlay"
	hover_overlay.color = COLOR_HOVER_GLOW
	hover_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hover_overlay.visible = false
	hover_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(hover_overlay)

	# -- Input signals --
	panel.gui_input.connect(_on_slot_gui_input.bind(index))
	panel.mouse_entered.connect(_on_slot_mouse_entered.bind(index))
	panel.mouse_exited.connect(_on_slot_mouse_exited.bind(index))

	return panel


# ---------------------------------------------------------------------------
# Slot updates
# ---------------------------------------------------------------------------

## Synchronise one slot's visuals with GameState.bench[index].
func _update_slot(index: int) -> void:
	if index < 0 or index >= _slots.size():
		return
	var panel: Panel = _slots[index]
	var unit = GameState.bench[index]  # null or {id: String, stars: int}

	var sprite: TextureRect = panel.get_node("UnitSprite")
	var name_label: Label = panel.get_node("NameLabel")
	var star_label: Label = panel.get_node("StarLabel")
	var cost_label: Label = panel.get_node("CostLabel")
	var style: StyleBoxFlat = panel.get_theme_stylebox("panel") as StyleBoxFlat

	if unit == null:
		# Empty slot
		sprite.visible = false
		name_label.visible = false
		star_label.visible = false
		cost_label.visible = false
		style.bg_color = COLOR_SLOT_BG
		style.border_color = COLOR_SLOT_BORDER
		panel.tooltip_text = ""
		return

	# --- Occupied slot ---
	var unit_id: String = unit.id
	var stars: int = unit.stars if unit.has("stars") else 1

	# Try to look up unit data from the shared data singleton
	var unit_data: Dictionary = {}
	if GameData.units_data.has(unit_id):
		unit_data = GameData.units_data[unit_id]

	# Name
	var display_name: String = unit_data.get("name", unit_id)
	name_label.text = display_name
	name_label.visible = true

	# Stars
	if STAR_LABELS.has(stars):
		star_label.text = STAR_LABELS[stars]
		match stars:
			1: star_label.add_theme_color_override("font_color", COLOR_STAR_1)
			2: star_label.add_theme_color_override("font_color", COLOR_STAR_2)
			3: star_label.add_theme_color_override("font_color", COLOR_STAR_3)
		star_label.visible = true
	else:
		star_label.visible = false

	# Cost
	var cost: int = unit_data.get("cost", 1)
	cost_label.text = str(cost)
	cost_label.visible = true

	# Faction colour tint on border
	var faction: String = unit_data.get("faction", "")
	var faction_color := _faction_color(faction)
	style.border_color = faction_color
	style.set_border_width_all(2)

	# Sprite — attempt to load from sprite sheet
	_apply_unit_sprite(sprite, unit_id, unit_data)
	sprite.visible = true

	# Tooltip
	panel.tooltip_text = "%s (%d★) — Cost %d\n%s" % [display_name, stars, cost, faction]


# ---------------------------------------------------------------------------
# Sprite helpers
# ---------------------------------------------------------------------------

## Load and display the idle frame for a unit from its sprite sheet.
func _apply_unit_sprite(sprite: TextureRect, unit_id: String, unit_data: Dictionary) -> void:
	# Try to load a portrait or sprite sheet texture
	# Convention: res://assets/portraits/<unit_id>.png  or  res://sheets/<unit_id>.png
	var portrait_path := "res://assets/portraits/%s.png" % unit_id
	var sheet_path := "res://sheets/%s.png" % unit_id

	if ResourceLoader.exists(portrait_path):
		sprite.texture = load(portrait_path)
	elif ResourceLoader.exists(sheet_path):
		var sheet_tex: Texture2D = load(sheet_path)
		# Use first frame of idle animation (top-left tile, assumed 64x64)
		var atlas := AtlasTexture.new()
		atlas.atlas = sheet_tex
		atlas.region = Rect2(0, 0, 64, 64)
		sprite.texture = atlas
	else:
		# Fallback: clear texture
		sprite.texture = null


## Map faction name to a representative colour.
func _faction_color(faction: String) -> Color:
	match faction.to_lower():
		"beast":   return Color("#8BC34A")
		"mystic":  return Color("#9C27B0")
		"tech":    return Color("#03A9F4")
		"shadow":  return Color("#607D8B")
		"flame":   return Color("#FF5722")
		"ocean":   return Color("#00BCD4")
		"holy":    return Color("#FFD600")
		_:         return COLOR_SLOT_BORDER


# ---------------------------------------------------------------------------
# Drag and Drop
# ---------------------------------------------------------------------------

## Called when the user starts dragging from a bench slot.
func _get_drag_data_for_slot(index: int) -> Variant:
	var unit = GameState.bench[index]
	if unit == null:
		return null

	# Build preview
	var preview := _create_drag_preview(index)
	set_drag_preview(preview)

	# Notify drag state
	GameState.dragged_unit = unit
	GameState.drag_source = "bench"
	GameState.drag_source_key = str(index)
	EventBus.drag_started.emit(unit, "bench")

	return {"source": "bench", "index": index, "unit": unit}


## Check whether this slot can accept a drop.
func _can_drop_on_slot(_index: int, data: Variant) -> bool:
	if data == null or not data is Dictionary:
		return false
	if not data.has("unit"):
		return false
	return true


## Handle a drop on a bench slot.
func _handle_drop_on_slot(index: int, data: Variant) -> void:
	if data == null or not data is Dictionary:
		return
	var source: String = data.get("source", "")
	var unit = data.get("unit")

	if source == "bench":
		# Swap bench slots
		var from_index: int = data.get("index", -1)
		if from_index >= 0 and from_index < SLOT_COUNT and from_index != index:
			var temp = GameState.bench[index]
			GameState.bench[index] = GameState.bench[from_index]
			GameState.bench[from_index] = temp
			_update_slot(index)
			_update_slot(from_index)

	elif source == "board":
		# Move from board to bench
		var hex_key: String = data.get("hex_key", "")
		if hex_key != "" and GameState.player_board.has(hex_key):
			if GameState.bench[index] == null:
				GameState.bench[index] = GameState.player_board[hex_key]
				GameState.player_board.erase(hex_key)
				_update_slot(index)
				EventBus.unit_removed.emit(unit.id if unit is Dictionary else str(unit), Vector2i.ZERO)
			else:
				# Slot occupied — cannot drop board unit here unless we swap
				pass

	elif source == "shop":
		# Buying a unit drops it on bench (handled by GameState.try_buy_unit usually)
		pass

	# Clear drag state
	GameState.dragged_unit = null
	GameState.drag_source = ""
	GameState.drag_source_key = ""
	EventBus.drag_ended.emit(unit if unit else {}, "bench")
	refresh()


## Create a small visual preview for the dragged unit.
func _create_drag_preview(index: int) -> Control:
	var unit = GameState.bench[index]
	var preview := Panel.new()
	preview.custom_minimum_size = SLOT_SIZE * 0.8
	preview.size = SLOT_SIZE * 0.8
	preview.modulate = Color(1, 1, 1, 0.75)

	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.15, 0.2, 0.35, 0.9)
	style.set_corner_radius_all(6)
	preview.add_theme_stylebox_override("panel", style)

	if unit != null:
		var lbl := Label.new()
		var unit_data: Dictionary = {}
		if GameData.units_data.has(unit.id):
			unit_data = GameData.units_data[unit.id]
		lbl.text = unit_data.get("name", unit.id)
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		lbl.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		lbl.add_theme_font_size_override("font_size", 10)
		lbl.add_theme_color_override("font_color", Color.WHITE)
		preview.add_child(lbl)

	return preview


# ---------------------------------------------------------------------------
# Input handling
# ---------------------------------------------------------------------------

func _on_slot_gui_input(event: InputEvent, index: int) -> void:
	if event is InputEventMouseButton and event.pressed:
		# Right-click → sell
		if event.button_index == MOUSE_BUTTON_RIGHT:
			_sell_unit(index)
			get_viewport().set_input_as_handled()
			return
		# Double-click → sell
		if event.button_index == MOUSE_BUTTON_LEFT and event.double_click:
			_sell_unit(index)
			get_viewport().set_input_as_handled()
			return
		# Left-click (single) → begin drag
		if event.button_index == MOUSE_BUTTON_LEFT:
			var data = _get_drag_data_for_slot(index)
			if data != null:
				# Godot's drag system is normally triggered by _get_drag_data override,
				# but since we connect via gui_input we call force_drag.
				_slots[index].force_drag(data, _create_drag_preview(index))
				get_viewport().set_input_as_handled()


func _on_slot_mouse_entered(index: int) -> void:
	if index >= 0 and index < _slots.size():
		var overlay: ColorRect = _slots[index].get_node("HoverOverlay")
		overlay.visible = true

		# Request tooltip for occupied slot
		var unit = GameState.bench[index]
		if unit != null:
			var unit_data: Dictionary = {}
			if GameData.units_data.has(unit.id):
				unit_data = GameData.units_data[unit.id]
			var pos := _slots[index].global_position
			EventBus.tooltip_requested.emit(unit_data, pos)


func _on_slot_mouse_exited(index: int) -> void:
	if index >= 0 and index < _slots.size():
		var overlay: ColorRect = _slots[index].get_node("HoverOverlay")
		overlay.visible = false
		EventBus.tooltip_hidden.emit()


## Sell the unit in the given bench slot.
func _sell_unit(index: int) -> void:
	if GameState.sell_unit_from_bench(index):
		_update_slot(index)
		SoundManager.play_sfx("sell") if SoundManager.has_method("play_sfx") else null


# ---------------------------------------------------------------------------
# Godot drag-and-drop virtual overrides (applied to self as a fallback)
# ---------------------------------------------------------------------------

func _can_drop_data(_at_position: Vector2, data: Variant) -> bool:
	return data is Dictionary and data.has("unit")


func _drop_data(at_position: Vector2, data: Variant) -> void:
	# Determine which slot the drop landed on by x-position
	var slot_index := _slot_index_at(at_position)
	if slot_index >= 0:
		_handle_drop_on_slot(slot_index, data)


func _notification(what: int) -> void:
	if what == NOTIFICATION_DRAG_END:
		# Reset drag state on drag cancel
		GameState.dragged_unit = null
		GameState.drag_source = ""
		GameState.drag_source_key = ""


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

## Find which slot index a local position falls into.
func _slot_index_at(local_pos: Vector2) -> int:
	for i in _slots.size():
		var rect := _slots[i].get_rect()
		if rect.has_point(local_pos):
			return i
	return -1


# ---------------------------------------------------------------------------
# Signal callbacks
# ---------------------------------------------------------------------------

func _on_unit_bought(_unit_id: String, _slot: int) -> void:
	refresh()


func _on_unit_sold(_unit_id: String, _source: String) -> void:
	refresh()


func _on_unit_merged(_unit_id: String, _new_stars: int) -> void:
	refresh()
