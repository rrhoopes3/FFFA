extends Node2D
## Hex grid board manager for FFFA auto-battler.
## Odd-r offset coordinate system, 7 columns x 8 rows.
## Rows 0-3: enemy territory, Rows 4-7: player territory.

# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------
signal hex_clicked(hex: Vector2i)
signal hex_hovered(hex: Vector2i)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
const COLS: int = 7
const ROWS: int = 8
const SQRT3: float = 1.7320508075688772  # sqrt(3)

const COLOR_PLAYER_HEX := Color("#1e2a38")
const COLOR_ENEMY_HEX := Color("#2e1a1a")
const COLOR_BG_TOP := Color("#07111f")
const COLOR_BG_MID := Color("#0b1a2d")
const COLOR_BG_BOT := Color("#050913")
const COLOR_ARENA_GOLD := Color("#c8a84e")
const COLOR_DIVIDER := Color(1.0, 1.0, 1.0, 0.12)
const COLOR_HIGHLIGHT := Color("#55ccff")

# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------
@export var hex_size: int = 48

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var _highlighted_hex: Vector2i = Vector2i(-1, -1)
var _hovered_hex: Vector2i = Vector2i(-1, -1)
var _time_elapsed: float = 0.0

# Board offset so the grid is centred in the viewport.
var _board_offset: Vector2 = Vector2.ZERO


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
func _ready() -> void:
	_compute_hex_size()
	_compute_board_offset()
	set_process(true)
	set_process_input(true)
	get_viewport().size_changed.connect(_on_viewport_resized)


func _process(delta: float) -> void:
	_time_elapsed += delta
	# Continuous redraw for shimmer / animation.
	queue_redraw()


func _on_viewport_resized() -> void:
	_compute_hex_size()
	_compute_board_offset()
	queue_redraw()


# ---------------------------------------------------------------------------
# Dynamic hex sizing
# ---------------------------------------------------------------------------
func _compute_hex_size() -> void:
	var vp_size := get_viewport_rect().size
	hex_size = clampi(mini(int(vp_size.x / 15.0), int(vp_size.y / 13.0)), 32, 90)


func _compute_board_offset() -> void:
	# Centre the grid in the viewport.
	var vp_size := get_viewport_rect().size
	var grid_w: float = SQRT3 * hex_size * (COLS + 0.5)
	var grid_h: float = 1.5 * hex_size * (ROWS - 1) + 2.0 * hex_size
	_board_offset = Vector2(
		(vp_size.x - grid_w) * 0.5 + SQRT3 * hex_size * 0.5,
		(vp_size.y - grid_h) * 0.5 + hex_size
	)


# ---------------------------------------------------------------------------
# Hex math — public API
# ---------------------------------------------------------------------------

## Convert odd-r offset hex coordinates to pixel (screen) position.
func hex_to_pixel(col: int, row: int) -> Vector2:
	var x: float = hex_size * SQRT3 * (col + 0.5 * (row & 1))
	var y: float = hex_size * 1.5 * row
	return Vector2(x, y) + _board_offset


## Convert pixel (screen) position back to odd-r offset hex coordinates.
## Returns Vector2i(-1, -1) if outside the grid.
func pixel_to_hex(pos: Vector2) -> Vector2i:
	var local := pos - _board_offset
	# Fractional axial coords (pointy-top axial from odd-r pixel formula).
	var q: float = (local.x * SQRT3 / 3.0 - local.y / 3.0) / hex_size
	var r: float = (local.y * 2.0 / 3.0) / hex_size
	# Cube round.
	var cube := _axial_round(q, r)
	# Cube to odd-r offset.
	var col: int = cube.x + int((cube.y - (cube.y & 1)) / 2)
	var row: int = cube.y
	if is_valid_hex(col, row):
		return Vector2i(col, row)
	return Vector2i(-1, -1)


## Hex distance using cube coordinates (odd-r → cube → manhattan / 2).
func hex_distance(a: Vector2i, b: Vector2i) -> int:
	var ac := _oddr_to_cube(a.x, a.y)
	var bc := _oddr_to_cube(b.x, b.y)
	return int((absi(ac.x - bc.x) + absi(ac.y - bc.y) + absi(ac.z - bc.z)) / 2)


## Return the string key "col,row" for dictionary lookups.
func get_hex_key(col: int, row: int) -> String:
	return "%d,%d" % [col, row]


## Return all valid neighbour hex keys for the given hex (odd-r offset).
func get_hex_neighbors(hex_key: String) -> Array[String]:
	var parts := hex_key.split(",")
	var col: int = parts[0].to_int()
	var row: int = parts[1].to_int()

	var neighbors: Array[String] = []
	# Odd-r direction offsets differ based on row parity.
	var directions_even: Array[Vector2i] = [
		Vector2i(1, 0), Vector2i(0, -1), Vector2i(-1, -1),
		Vector2i(-1, 0), Vector2i(-1, 1), Vector2i(0, 1)
	]
	var directions_odd: Array[Vector2i] = [
		Vector2i(1, 0), Vector2i(1, -1), Vector2i(0, -1),
		Vector2i(-1, 0), Vector2i(0, 1), Vector2i(1, 1)
	]
	var dirs: Array[Vector2i] = directions_odd if (row & 1) else directions_even

	for d in dirs:
		var nc: int = col + d.x
		var nr: int = row + d.y
		if is_valid_hex(nc, nr):
			neighbors.append(get_hex_key(nc, nr))
	return neighbors


## True when the row belongs to the player's territory (rows 4-7).
func is_player_hex(row: int) -> bool:
	return row >= 4


## True when col/row are inside the board bounds.
func is_valid_hex(col: int, row: int) -> bool:
	return col >= 0 and col < COLS and row >= 0 and row < ROWS


# ---------------------------------------------------------------------------
# Interaction helpers
# ---------------------------------------------------------------------------

## Convenience wrapper used by input systems.
func get_hex_at_position(screen_pos: Vector2) -> Vector2i:
	return pixel_to_hex(screen_pos)


## Set a hex to be drawn with a bright highlight (drag target etc.).
func highlight_hex(hex: Vector2i) -> void:
	if _highlighted_hex != hex:
		_highlighted_hex = hex
		queue_redraw()


## Remove the current highlight.
func clear_highlight() -> void:
	if _highlighted_hex != Vector2i(-1, -1):
		_highlighted_hex = Vector2i(-1, -1)
		queue_redraw()


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		var hex := pixel_to_hex(event.position)
		if hex != _hovered_hex:
			_hovered_hex = hex
			if hex != Vector2i(-1, -1):
				hex_hovered.emit(hex)
	elif event is InputEventMouseButton:
		if event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			var hex := pixel_to_hex(event.position)
			if hex != Vector2i(-1, -1):
				hex_clicked.emit(hex)


# ---------------------------------------------------------------------------
# Drawing
# ---------------------------------------------------------------------------
func _draw() -> void:
	_draw_arena_background()
	_draw_hex_grid()
	_draw_divider_line()
	_draw_territory_labels()
	_draw_vignette()


# -- Arena background -------------------------------------------------------
func _draw_arena_background() -> void:
	var vp := get_viewport_rect().size

	# Vertical gradient background.
	var third := vp.y / 3.0
	draw_rect(Rect2(0, 0, vp.x, third), COLOR_BG_TOP)
	draw_rect(Rect2(0, third, vp.x, third), COLOR_BG_MID)
	draw_rect(Rect2(0, third * 2.0, vp.x, third), COLOR_BG_BOT)

	# Subtle grid pattern overlay.
	var grid_spacing: float = hex_size * 0.6
	var line_color := Color(1.0, 1.0, 1.0, 0.02)
	var gx: float = 0.0
	while gx < vp.x:
		draw_line(Vector2(gx, 0), Vector2(gx, vp.y), line_color, 1.0)
		gx += grid_spacing
	var gy: float = 0.0
	while gy < vp.y:
		draw_line(Vector2(0, gy), Vector2(vp.x, gy), line_color, 1.0)
		gy += grid_spacing

	# Arena ring ellipse with gold border.
	var centre := vp * 0.5
	var rx: float = SQRT3 * hex_size * (COLS + 1) * 0.5
	var ry: float = 1.5 * hex_size * (ROWS + 1) * 0.5
	_draw_ellipse_outline(centre, rx, ry, COLOR_ARENA_GOLD.darkened(0.3), 2.0, 64)
	_draw_ellipse_outline(centre, rx + 4, ry + 4, Color(COLOR_ARENA_GOLD, 0.15), 6.0, 64)

	# Animated shimmer along the arena ring.
	var shimmer_angle: float = fmod(_time_elapsed * 0.5, TAU)
	var shimmer_pos := Vector2(
		centre.x + cos(shimmer_angle) * rx,
		centre.y + sin(shimmer_angle) * ry
	)
	_draw_glow_circle(shimmer_pos, hex_size * 0.8, Color(1.0, 0.95, 0.7, 0.25))

	# Side light columns.
	_draw_light_column(Vector2(vp.x * 0.08, vp.y * 0.5), vp.y * 0.7, hex_size * 1.5, Color(1.0, 0.85, 0.5, 0.04))  # warm left
	_draw_light_column(Vector2(vp.x * 0.92, vp.y * 0.5), vp.y * 0.7, hex_size * 1.5, Color(0.5, 0.7, 1.0, 0.04))  # cool right

	# Centre spotlight glow.
	_draw_glow_circle(centre, hex_size * 5.0, Color(0.6, 0.75, 1.0, 0.06))


# -- Hex grid ---------------------------------------------------------------
func _draw_hex_grid() -> void:
	for row in range(ROWS):
		for col in range(COLS):
			var centre := hex_to_pixel(col, row)
			var fill_color: Color
			var is_player := is_player_hex(row)

			# Base fill colour.
			if is_player:
				fill_color = COLOR_PLAYER_HEX
			else:
				fill_color = COLOR_ENEMY_HEX

			# Check occupation via GameState (if autoload exists).
			var faction_color := Color.TRANSPARENT
			var hex_key := get_hex_key(col, row)

			if Engine.has_singleton("GameState"):
				# Placeholder: real integration will query GameState boards.
				pass
			else:
				# Try accessing GameState as a node at /root/GameState.
				var gs := _get_game_state()
				if gs:
					faction_color = _get_occupation_color(gs, hex_key, is_player)

			# Tint fill if occupied.
			if faction_color != Color.TRANSPARENT:
				fill_color = fill_color.lerp(faction_color, 0.35)

			# Gradient fill — slightly lighter toward the top of the hex.
			var lighter := fill_color.lightened(0.08)
			_draw_hex_filled_gradient(centre, fill_color, lighter)

			# Border glow.
			var border_color := Color(fill_color.lightened(0.3), 0.5)
			_draw_hex_outline(centre, border_color, 1.0)

			# Highlight (drag target).
			if Vector2i(col, row) == _highlighted_hex:
				var pulse: float = 0.6 + 0.4 * sin(_time_elapsed * 4.0)
				var hl_color := Color(COLOR_HIGHLIGHT, pulse)
				_draw_hex_outline(centre, hl_color, 3.0)
				_draw_hex_filled(centre, Color(COLOR_HIGHLIGHT, 0.12))


# -- Divider line ------------------------------------------------------------
func _draw_divider_line() -> void:
	# Horizontal line between row 3 and row 4.
	var left := hex_to_pixel(0, 3)
	var right := hex_to_pixel(COLS - 1, 3)
	var y_mid: float = (hex_to_pixel(0, 3).y + hex_to_pixel(0, 4).y) * 0.5
	var margin: float = hex_size * SQRT3 * 0.6
	draw_line(
		Vector2(left.x - margin, y_mid),
		Vector2(right.x + margin, y_mid),
		COLOR_DIVIDER, 2.0
	)


# -- Territory labels --------------------------------------------------------
func _draw_territory_labels() -> void:
	var font := ThemeDB.fallback_font
	if font == null:
		return
	var font_size: int = clampi(hex_size / 3, 10, 20)

	# Enemy territory label (above row 1).
	var enemy_pos := hex_to_pixel(COLS / 2, 0)
	enemy_pos.y -= hex_size * 1.2
	var enemy_label := "RIVAL TERRITORY"
	var enemy_text_size := font.get_string_size(enemy_label, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size)
	draw_string(
		font, Vector2(enemy_pos.x - enemy_text_size.x * 0.5, enemy_pos.y),
		enemy_label, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size,
		Color(1.0, 0.4, 0.4, 0.35)
	)

	# Player territory label (below row 7).
	var player_pos := hex_to_pixel(COLS / 2, ROWS - 1)
	player_pos.y += hex_size * 1.4
	var player_label := "YOUR TERRITORY"
	var player_text_size := font.get_string_size(player_label, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size)
	draw_string(
		font, Vector2(player_pos.x - player_text_size.x * 0.5, player_pos.y),
		player_label, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size,
		Color(0.4, 0.6, 1.0, 0.35)
	)


# -- Vignette ----------------------------------------------------------------
func _draw_vignette() -> void:
	var vp := get_viewport_rect().size
	var edge := hex_size * 3.0
	# Top
	draw_rect(Rect2(0, 0, vp.x, edge), Color(0, 0, 0, 0.4))
	# Bottom
	draw_rect(Rect2(0, vp.y - edge, vp.x, edge), Color(0, 0, 0, 0.4))
	# Left
	draw_rect(Rect2(0, 0, edge, vp.y), Color(0, 0, 0, 0.3))
	# Right
	draw_rect(Rect2(vp.x - edge, 0, edge, vp.y), Color(0, 0, 0, 0.3))


# ---------------------------------------------------------------------------
# Drawing primitives
# ---------------------------------------------------------------------------

## Points for a flat-topped hex would use angle offset; here we do pointy-top
## to match the odd-r offset layout used by the web version.
func _hex_corners(centre: Vector2) -> PackedVector2Array:
	var corners := PackedVector2Array()
	for i in range(6):
		var angle: float = PI / 6.0 + PI / 3.0 * i  # pointy-top
		corners.append(Vector2(
			centre.x + hex_size * cos(angle),
			centre.y + hex_size * sin(angle)
		))
	return corners


func _draw_hex_filled(centre: Vector2, color: Color) -> void:
	var pts := _hex_corners(centre)
	draw_colored_polygon(pts, color)


func _draw_hex_filled_gradient(centre: Vector2, bottom_color: Color, top_color: Color) -> void:
	var pts := _hex_corners(centre)
	var colors := PackedColorArray()
	for p in pts:
		var t: float = clampf(inverse_lerp(centre.y + hex_size, centre.y - hex_size, p.y), 0.0, 1.0)
		colors.append(bottom_color.lerp(top_color, t))
	draw_polygon(pts, colors)


func _draw_hex_outline(centre: Vector2, color: Color, width: float = 1.0) -> void:
	var pts := _hex_corners(centre)
	for i in range(6):
		draw_line(pts[i], pts[(i + 1) % 6], color, width, true)


func _draw_ellipse_outline(centre: Vector2, rx: float, ry: float, color: Color, width: float, segments: int) -> void:
	var prev := Vector2(centre.x + rx, centre.y)
	for i in range(1, segments + 1):
		var angle: float = TAU * i / segments
		var next := Vector2(centre.x + cos(angle) * rx, centre.y + sin(angle) * ry)
		draw_line(prev, next, color, width, true)
		prev = next


func _draw_glow_circle(centre: Vector2, radius: float, color: Color) -> void:
	# Approximate radial glow with concentric circles of decreasing alpha.
	var steps: int = 8
	for i in range(steps):
		var t: float = float(i) / float(steps)
		var r: float = radius * (1.0 - t * 0.8)
		var c := Color(color, color.a * (1.0 - t))
		draw_circle(centre, r, c)


func _draw_light_column(centre: Vector2, height: float, width: float, color: Color) -> void:
	var rect := Rect2(centre.x - width * 0.5, centre.y - height * 0.5, width, height)
	draw_rect(rect, color)


# ---------------------------------------------------------------------------
# Cube coordinate helpers (private)
# ---------------------------------------------------------------------------
func _oddr_to_cube(col: int, row: int) -> Vector3i:
	var x: int = col - int((row - (row & 1)) / 2)
	var z: int = row
	var y: int = -x - z
	return Vector3i(x, y, z)


func _axial_round(q: float, r: float) -> Vector3i:
	var s: float = -q - r
	var rq: int = roundi(q)
	var rr: int = roundi(r)
	var rs: int = roundi(s)

	var q_diff: float = absf(rq - q)
	var r_diff: float = absf(rr - r)
	var s_diff: float = absf(rs - s)

	if q_diff > r_diff and q_diff > s_diff:
		rq = -rr - rs
	elif r_diff > s_diff:
		rr = -rq - rs
	else:
		rs = -rq - rr

	# Return as cube coords mapped: x=rq, y=rs, z=rr
	# (axial q,r maps to cube x,z with y = -x-z)
	return Vector3i(rq, rr, rs)


# ---------------------------------------------------------------------------
# GameState integration helper
# ---------------------------------------------------------------------------
func _get_game_state() -> Node:
	if has_node("/root/GameState"):
		return get_node("/root/GameState")
	return null


func _get_occupation_color(gs: Node, hex_key: String, is_player: bool) -> Color:
	# Attempt to read faction color from board dictionaries on GameState.
	# Expected: gs.player_board / gs.enemy_board are Dictionaries of hex_key → unit data.
	# Unit data should have a "faction_color" Color property or "faction" string.
	var board: Variant = null

	if is_player and "player_board" in gs:
		board = gs.player_board
	elif not is_player and "enemy_board" in gs:
		board = gs.enemy_board

	if board is Dictionary and board.has(hex_key):
		var unit: Variant = board[hex_key]
		if unit is Dictionary and unit.has("faction_color"):
			return unit["faction_color"]
		elif unit is Object and "faction_color" in unit:
			return unit.faction_color
	return Color.TRANSPARENT
