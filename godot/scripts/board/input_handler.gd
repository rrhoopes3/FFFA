# input_handler.gd — Mouse/touch drag-drop and board interaction
extends Node

var hex_board: Node2D  # Reference to HexBoard node
var bench_panel: Control  # Reference to BenchPanel
var particles_vfx: Node2D  # Reference to ParticlesVFX

var dragging := false
var drag_unit_data: Dictionary = {}  # {id, stars}
var drag_source: String = ""  # "board", "bench"
var drag_source_key = null  # hex key string or bench index int
var drag_preview: Node2D = null  # Visual preview node during drag

func setup(p_hex_board: Node2D, p_bench: Control, p_vfx: Node2D) -> void:
	hex_board = p_hex_board
	bench_panel = p_bench
	particles_vfx = p_vfx

func _unhandled_input(event: InputEvent) -> void:
	if GameState.combat_state != "idle":
		return  # No interaction during combat
	
	if event is InputEventMouseButton:
		_handle_mouse_button(event)
	elif event is InputEventMouseMotion:
		_handle_mouse_motion(event)

func _handle_mouse_button(event: InputEventMouseButton) -> void:
	if event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_start_drag(event.position)
		else:
			if dragging:
				_end_drag(event.position)
	elif event.button_index == MOUSE_BUTTON_RIGHT:
		if event.pressed:
			_handle_right_click(event.position)

func _handle_mouse_motion(event: InputEventMouseMotion) -> void:
	if dragging and drag_preview:
		drag_preview.global_position = event.position
		# Highlight hex under cursor
		var hex: Vector2i = hex_board.get_hex_at_position(event.position)
		if hex != Vector2i(-1, -1):
			hex_board.highlight_hex(hex)
		else:
			hex_board.clear_highlight()
	else:
		# Hover tooltip
		_handle_hover(event.position)

func _start_drag(pos: Vector2) -> void:
	# Check if clicking on a board unit
	var hex: Vector2i = hex_board.get_hex_at_position(pos)
	if hex != Vector2i(-1, -1):
		var hex_key := "%d,%d" % [hex.x, hex.y]
		if hex.y >= 4 and GameState.player_board.has(hex_key):
			# Start dragging from board
			drag_unit_data = GameState.player_board[hex_key].duplicate()
			drag_source = "board"
			drag_source_key = hex_key
			dragging = true
			_create_drag_preview()
			return
	
	# Check bench slots (handled by bench_panel directly via Godot drag system)

func _end_drag(pos: Vector2) -> void:
	if not dragging:
		return
	
	var hex: Vector2i = hex_board.get_hex_at_position(pos)
	hex_board.clear_highlight()
	
	if hex != Vector2i(-1, -1) and hex.y >= 4:
		var target_key := "%d,%d" % [hex.x, hex.y]
		
		if drag_source == "board":
			if target_key == drag_source_key:
				# Dropped back on same hex — no-op
				pass
			elif GameState.player_board.has(target_key):
				# Swap units
				var temp = GameState.player_board[target_key]
				GameState.player_board[target_key] = GameState.player_board[drag_source_key]
				GameState.player_board[drag_source_key] = temp
				EventBus.units_swapped.emit(
					Vector2i(int(drag_source_key.split(",")[0]), int(drag_source_key.split(",")[1])),
					hex
				)
			else:
				# Move to empty hex
				GameState.player_board[target_key] = GameState.player_board[drag_source_key]
				GameState.player_board.erase(drag_source_key)
				EventBus.unit_placed.emit(drag_unit_data.get("id", ""), hex)
		
		elif drag_source == "bench":
			if not GameState.player_board.has(target_key) and GameState.can_place_unit():
				# Place from bench to board
				GameState.player_board[target_key] = drag_unit_data
				GameState.bench[drag_source_key] = null
				EventBus.unit_placed.emit(drag_unit_data.get("id", ""), hex)
				SoundManager.play_buy()
			elif GameState.player_board.has(target_key):
				# Swap bench unit with board unit
				var board_unit = GameState.player_board[target_key]
				GameState.player_board[target_key] = drag_unit_data
				GameState.bench[drag_source_key] = board_unit
				EventBus.units_swapped.emit(Vector2i(-1, drag_source_key), hex)
	else:
		# Dropped outside board — return to source
		if drag_source == "board":
			pass  # Already in place
		elif drag_source == "bench":
			pass  # Already in bench
	
	_cleanup_drag()

func _handle_right_click(pos: Vector2) -> void:
	# Right-click to sell unit
	var hex: Vector2i = hex_board.get_hex_at_position(pos)
	if hex != Vector2i(-1, -1) and hex.y >= 4:
		var hex_key := "%d,%d" % [hex.x, hex.y]
		if GameState.player_board.has(hex_key):
			GameState.sell_unit_from_board(hex_key)
			SoundManager.play_sell()
			hex_board.queue_redraw()

func _handle_hover(pos: Vector2) -> void:
	var hex: Vector2i = hex_board.get_hex_at_position(pos)
	if hex != Vector2i(-1, -1):
		var hex_key := "%d,%d" % [hex.x, hex.y]
		var board := GameState.player_board if hex.y >= 4 else GameState.enemy_board
		if board.has(hex_key):
			var unit = board[hex_key]
			EventBus.tooltip_requested.emit(unit, pos)
			return
	EventBus.tooltip_hidden.emit()

func _create_drag_preview() -> void:
	drag_preview = Node2D.new()
	# Simple colored circle as preview
	get_tree().root.add_child(drag_preview)
	drag_preview.z_index = 300

func _cleanup_drag() -> void:
	dragging = false
	drag_unit_data = {}
	drag_source = ""
	drag_source_key = null
	if drag_preview:
		drag_preview.queue_free()
		drag_preview = null

func start_bench_drag(bench_index: int, unit_data: Dictionary) -> void:
	drag_unit_data = unit_data.duplicate()
	drag_source = "bench"
	drag_source_key = bench_index
	dragging = true
	_create_drag_preview()
