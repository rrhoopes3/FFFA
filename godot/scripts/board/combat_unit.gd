## combat_unit.gd
## Visual representation of a cat unit on the hex board.
## Handles sprite sheet animations, HP/mana bars, star badges,
## smooth movement, damage flashes, and death sequences.
extends Node2D

# ─── Identification ───────────────────────────────────────────────────────────

var unit_id: String = ""
var unit_data: Dictionary = {}  # Reference to GameData.units_data entry
var stars: int = 1
var is_player: bool = true
var hex_pos: Vector2i = Vector2i.ZERO  # Current hex-grid position

# ─── Movement ─────────────────────────────────────────────────────────────────

var target_screen_pos: Vector2 = Vector2.ZERO  # Destination for smooth lerp
var move_speed: float = 200.0

# ─── Combat Stats ─────────────────────────────────────────────────────────────

var current_hp: int = 0
var max_hp: int = 0
var current_mana: int = 0
var max_mana: int = 100
var is_alive: bool = true

# ─── Visual State ─────────────────────────────────────────────────────────────

var bob_offset: float = 0.0       # Phase offset for idle bobbing
var flash_timer: float = 0.0      # Remaining seconds of damage flash
var current_anim: String = "idle"

# ─── Constants ────────────────────────────────────────────────────────────────

const CELL_SIZE := Vector2i(64, 64)
const SHEET_COLS := 6
const SHEET_ROWS := 7

## Row indices in the sprite sheet.
const ANIM_ROWS := {
	"idle":    0,
	"walk":    1,
	"attack":  2,
	"ability": 3,
	"hurt":    4,
	"death":   5,
	"taunt":   6,
}

## Animations that loop continuously.
const LOOPING_ANIMS: PackedStringArray = ["idle", "walk"]

## Team glow colours.
const PLAYER_COLOR := Color("64a8ff")
const ENEMY_COLOR  := Color("ff6c74")

## Star glow colours per star level (index 0 unused).
const STAR_GLOWS: Array[Color] = [
	Color.WHITE,                # placeholder for index 0
	Color(0.4, 0.6, 1.0, 0.25), # 1-star: subtle blue
	Color(0.4, 0.7, 1.0, 0.6),  # 2-star: bright blue
	Color(1.0, 0.5, 0.8, 0.7),  # 3-star: bright pink
]

## Star badge strings.
const STAR_LABELS: Array[String] = ["", "\u2605", "\u2605\u2605", "\u2605\u2605\u2605"]

# ─── Bar Dimensions ──────────────────────────────────────────────────────────

const BAR_WIDTH  := 48.0
const BAR_HEIGHT := 5.0
const BAR_GAP    := 2.0       # Vertical gap between HP and mana bars
const BAR_Y_OFFSET := 34.0    # Distance below unit centre

# ─── Child Nodes ──────────────────────────────────────────────────────────────

var sprite: AnimatedSprite2D
var star_label: Label

# ─── Internal Timers / Tweens ─────────────────────────────────────────────────

var _elapsed: float = 0.0       # Running clock for bobbing
var _attack_scale_tween: Tween  # Scale-pulse tween during attacks
var _death_tween: Tween         # Fade + shrink on death


# ══════════════════════════════════════════════════════════════════════════════
#  LIFECYCLE
# ══════════════════════════════════════════════════════════════════════════════

func _ready() -> void:
	# Randomise bob phase so units don't bob in sync.
	bob_offset = randf() * TAU

	# --- AnimatedSprite2D ---------------------------------------------------
	sprite = AnimatedSprite2D.new()
	sprite.name = "Sprite"
	sprite.centered = true
	add_child(sprite)
	# Connect the animation_finished signal for one-shot anims.
	sprite.animation_finished.connect(_on_animation_finished)

	# --- Star Label ---------------------------------------------------------
	star_label = Label.new()
	star_label.name = "StarLabel"
	star_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	star_label.add_theme_font_size_override("font_size", 14)
	star_label.add_theme_color_override("font_color", Color.GOLD)
	star_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	star_label.add_theme_constant_override("shadow_offset_x", 1)
	star_label.add_theme_constant_override("shadow_offset_y", 1)
	star_label.position = Vector2(-24, 28)
	star_label.size = Vector2(48, 20)
	add_child(star_label)


func _process(delta: float) -> void:
	_elapsed += delta

	# ── Smooth movement toward target ─────────────────────────────────────
	if position.distance_to(target_screen_pos) > 1.0:
		position = position.move_toward(target_screen_pos, move_speed * delta)

	# ── Idle bobbing (only when alive and roughly stationary) ─────────────
	if is_alive and position.distance_to(target_screen_pos) < 2.0:
		sprite.offset.y = sin(_elapsed * 2.0 + bob_offset) * 2.0
	else:
		sprite.offset.y = 0.0

	# ── Damage flash countdown ────────────────────────────────────────────
	if flash_timer > 0.0:
		flash_timer -= delta
		if flash_timer <= 0.0:
			flash_timer = 0.0
			sprite.self_modulate = Color.WHITE

	# ── Continuous redraw for bars / effects ──────────────────────────────
	queue_redraw()


func _draw() -> void:
	# ── Shadow ellipse ────────────────────────────────────────────────────
	var shadow_color := Color(0, 0, 0, 0.3)
	var shadow_center := Vector2(0, 30)
	_draw_ellipse(shadow_center, 22.0, 8.0, shadow_color)

	# ── Team colour glow ──────────────────────────────────────────────────
	var team_color: Color = PLAYER_COLOR if is_player else ENEMY_COLOR
	team_color.a = 0.15
	draw_circle(Vector2.ZERO, 36.0, team_color)

	# ── Star-level glow ───────────────────────────────────────────────────
	var glow_idx := clampi(stars, 1, 3)
	var glow_color: Color = STAR_GLOWS[glow_idx]
	# Pulse the glow subtly.
	glow_color.a *= (0.8 + 0.2 * sin(_elapsed * 3.0))
	draw_circle(Vector2.ZERO, 30.0, glow_color)

	# ── HP bar ────────────────────────────────────────────────────────────
	if max_hp > 0:
		var bar_origin := Vector2(-BAR_WIDTH * 0.5, BAR_Y_OFFSET)
		_draw_bar(bar_origin, _hp_color(), float(current_hp) / float(max_hp))

	# ── Mana bar ──────────────────────────────────────────────────────────
	if max_mana > 0 and max_hp > 0:
		var mana_origin := Vector2(-BAR_WIDTH * 0.5, BAR_Y_OFFSET + BAR_HEIGHT + BAR_GAP)
		_draw_bar(mana_origin, Color(0.3, 0.5, 1.0, 0.9), float(current_mana) / float(max_mana))

	# ── Damage flash overlay ──────────────────────────────────────────────
	if flash_timer > 0.0:
		var alpha := clampf(flash_timer / 0.15, 0.0, 0.7)
		draw_rect(Rect2(-32, -32, 64, 64), Color(1, 1, 1, alpha))

	# ── Faction label ─────────────────────────────────────────────────────
	if unit_data.has("faction"):
		var font := ThemeDB.fallback_font
		var font_size := 9
		var faction_text: String = unit_data["faction"]
		var text_size := font.get_string_size(faction_text, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size)
		var text_pos := Vector2(-text_size.x * 0.5, -36)
		draw_string(font, text_pos, faction_text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size,
			Color(1, 1, 1, 0.7))


# ══════════════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

## Initialise the unit's visuals from game data.
func setup(p_unit_id: String, p_stars: int, p_is_player: bool) -> void:
	unit_id = p_unit_id
	stars = clampi(p_stars, 1, 3)
	is_player = p_is_player

	# Flip enemy sprites so they face the opposite direction.
	if not is_player:
		sprite.flip_h = true

	# Update the star badge.
	star_label.text = STAR_LABELS[stars]

	# Build SpriteFrames from the unit's sheet.
	_build_sprite_frames()

	# Start idle.
	play_animation("idle")


## Update the combat stat bars.
func set_combat_stats(hp: int, p_max_hp: int, mana: int) -> void:
	current_hp = hp
	max_hp = p_max_hp
	current_mana = mana
	queue_redraw()


## Trigger an animation by name (must match ANIM_ROWS keys).
func play_animation(anim_name: String) -> void:
	if not ANIM_ROWS.has(anim_name):
		push_warning("CombatUnit: unknown animation '%s'" % anim_name)
		return

	current_anim = anim_name
	if sprite.sprite_frames and sprite.sprite_frames.has_animation(anim_name):
		sprite.play(anim_name)

	# Attack scale pulse.
	if anim_name == "attack":
		_play_attack_pulse()


## Apply damage: flash white, reduce HP.
func take_damage(amount: int) -> void:
	current_hp = maxi(current_hp - amount, 0)
	flash_timer = 0.15
	sprite.self_modulate = Color(3.0, 3.0, 3.0, 1.0)  # Bright white flash

	# Brief screen-shake-like jitter.
	var jitter_tween := create_tween()
	jitter_tween.tween_property(self, "position",
		position + Vector2(randf_range(-3, 3), randf_range(-3, 3)), 0.03)
	jitter_tween.tween_property(self, "position",
		target_screen_pos, 0.05)

	if current_hp <= 0:
		die()

	queue_redraw()


## Play death animation, then remove the node.
func die() -> void:
	is_alive = false
	play_animation("death")

	# Fade out and shrink over 0.6 seconds, then free.
	if _death_tween and _death_tween.is_valid():
		_death_tween.kill()
	_death_tween = create_tween().set_parallel(true)
	_death_tween.tween_property(self, "modulate:a", 0.0, 0.6).set_delay(0.2)
	_death_tween.tween_property(self, "scale", Vector2(0.3, 0.3), 0.6).set_delay(0.2)
	_death_tween.chain().tween_callback(queue_free)


## Smoothly move to a new hex position.  Caller must supply hex-to-screen
## conversion externally by setting `target_screen_pos` or passing the screen
## coordinate.  This helper stores the hex and triggers walk animation.
func move_to_hex(new_hex: Vector2i) -> void:
	hex_pos = new_hex
	# The actual target_screen_pos should be set by the board/manager that
	# knows the hex layout.  If it hasn't changed yet, the _process lerp
	# will pick it up once target_screen_pos is updated.
	if position.distance_to(target_screen_pos) > 2.0:
		play_animation("walk")


# ══════════════════════════════════════════════════════════════════════════════
#  INTERNAL HELPERS
# ══════════════════════════════════════════════════════════════════════════════

## Build a SpriteFrames resource from the unit's sprite sheet.
## Each row becomes a named animation with SHEET_COLS frames.
func _build_sprite_frames() -> void:
	var sheet_path := "res://assets/sprites/%s_sheet.png" % unit_id
	var sheet_texture: Texture2D = null

	if ResourceLoader.exists(sheet_path):
		sheet_texture = load(sheet_path) as Texture2D
	else:
		push_warning("CombatUnit: sprite sheet not found at '%s'" % sheet_path)
		return

	var frames := SpriteFrames.new()
	# Remove the default animation that SpriteFrames creates.
	if frames.has_animation("default"):
		frames.remove_animation("default")

	var sheet_image: Image = sheet_texture.get_image()

	for anim_name: String in ANIM_ROWS:
		var row: int = ANIM_ROWS[anim_name]
		frames.add_animation(anim_name)

		# Looping only for idle and walk.
		frames.set_animation_loop(anim_name, anim_name in LOOPING_ANIMS)
		frames.set_animation_speed(anim_name, 8.0)  # 8 FPS

		for col in range(SHEET_COLS):
			# Extract each cell as an AtlasTexture.
			var atlas := AtlasTexture.new()
			atlas.atlas = sheet_texture
			atlas.region = Rect2(
				col * CELL_SIZE.x,
				row * CELL_SIZE.y,
				CELL_SIZE.x,
				CELL_SIZE.y
			)
			frames.add_frame(anim_name, atlas)

	sprite.sprite_frames = frames


## Called when a non-looping animation finishes — return to idle.
func _on_animation_finished() -> void:
	if current_anim in LOOPING_ANIMS:
		return
	# After one-shot animations, go back to idle (if still alive).
	if is_alive:
		play_animation("idle")


## Attack scale pulse: 1.0 -> 1.3 -> 1.0 over 0.25s.
func _play_attack_pulse() -> void:
	if _attack_scale_tween and _attack_scale_tween.is_valid():
		_attack_scale_tween.kill()
	_attack_scale_tween = create_tween()
	_attack_scale_tween.tween_property(sprite, "scale",
		Vector2(1.3, 1.3), 0.1).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_attack_scale_tween.tween_property(sprite, "scale",
		Vector2(1.0, 1.0), 0.15).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)


## Draw a horizontal status bar (HP or mana).
func _draw_bar(origin: Vector2, fill_color: Color, ratio: float) -> void:
	ratio = clampf(ratio, 0.0, 1.0)
	# Background (dark).
	var bg_rect := Rect2(origin.x, origin.y, BAR_WIDTH, BAR_HEIGHT)
	draw_rect(bg_rect, Color(0, 0, 0, 0.6))
	# Fill.
	if ratio > 0.0:
		var fill_rect := Rect2(origin.x, origin.y, BAR_WIDTH * ratio, BAR_HEIGHT)
		draw_rect(fill_rect, fill_color)
	# Border.
	draw_rect(bg_rect, Color(0, 0, 0, 0.8), false, 1.0)


## Return the HP bar colour based on current percentage.
func _hp_color() -> Color:
	if max_hp <= 0:
		return Color.GREEN
	var pct := float(current_hp) / float(max_hp)
	if pct > 0.6:
		return Color(0.3, 0.9, 0.3, 0.9)   # Green
	elif pct > 0.3:
		return Color(0.95, 0.85, 0.2, 0.9)  # Yellow
	else:
		return Color(0.95, 0.25, 0.2, 0.9)  # Red


## Draw a filled ellipse (used for shadow).
func _draw_ellipse(center: Vector2, rx: float, ry: float, color: Color) -> void:
	var points := PackedVector2Array()
	var segments := 24
	for i in range(segments + 1):
		var angle := TAU * float(i) / float(segments)
		points.append(center + Vector2(cos(angle) * rx, sin(angle) * ry))
	# Draw as a triangle fan using draw_colored_polygon.
	if points.size() >= 3:
		draw_colored_polygon(points, color)
