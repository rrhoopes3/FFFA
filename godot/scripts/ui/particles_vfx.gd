# particles_vfx.gd — Visual effects manager (damage numbers, death explosions, etc.)
# Replaces the canvas-based particle system from the web version with Godot nodes
extends Node2D

class FloatingText:
	var position: Vector2
	var velocity: Vector2
	var text: String
	var color: Color
	var font_size: int
	var lifetime: float
	var max_lifetime: float
	var scale_factor: float = 1.0

class Particle:
	var position: Vector2
	var velocity: Vector2
	var color: Color
	var size: float
	var lifetime: float
	var max_lifetime: float
	var gravity: float = 80.0
	var drag: float = 0.985

var floating_texts: Array[FloatingText] = []
var particles: Array[Particle] = []
var attack_lines: Array = []  # {from, to, color, lifetime}

func _ready() -> void:
	z_index = 100  # Draw on top of everything

func _process(delta: float) -> void:
	var needs_redraw := false
	
	# Update floating texts
	var i := floating_texts.size() - 1
	while i >= 0:
		var ft := floating_texts[i]
		ft.position += ft.velocity * delta
		ft.velocity.y -= 120.0 * delta  # Float upward
		ft.lifetime -= delta
		ft.scale_factor = clampf(ft.lifetime / ft.max_lifetime, 0.0, 1.0)
		if ft.lifetime <= 0:
			floating_texts.remove_at(i)
		needs_redraw = true
		i -= 1
	
	# Update particles
	i = particles.size() - 1
	while i >= 0:
		var p := particles[i]
		p.velocity.y += p.gravity * delta
		p.velocity *= pow(p.drag, delta * 60.0)
		p.position += p.velocity * delta
		p.lifetime -= delta
		if p.lifetime <= 0:
			particles.remove_at(i)
		needs_redraw = true
		i -= 1
	
	# Update attack lines
	i = attack_lines.size() - 1
	while i >= 0:
		attack_lines[i].lifetime -= delta
		if attack_lines[i].lifetime <= 0:
			attack_lines.remove_at(i)
		needs_redraw = true
		i -= 1
	
	if needs_redraw:
		queue_redraw()

func _draw() -> void:
	# Draw attack lines
	for line in attack_lines:
		var alpha := clampf(line.lifetime / 0.3, 0.0, 1.0)
		var col: Color = line.color
		col.a = alpha * 0.6
		draw_line(line.from, line.to, col, 2.0, true)
	
	# Draw particles
	for p in particles:
		var alpha := clampf(p.lifetime / p.max_lifetime, 0.0, 1.0)
		var col := p.color
		col.a = alpha
		draw_circle(p.position, p.size * alpha, col)
	
	# Draw floating texts
	for ft in floating_texts:
		var alpha := clampf(ft.lifetime / ft.max_lifetime, 0.0, 1.0)
		var col := ft.color
		col.a = alpha
		var font := ThemeDB.fallback_font
		var size := int(ft.font_size * (0.8 + ft.scale_factor * 0.4))
		# Outline for readability
		draw_string_outline(font, ft.position, ft.text, HORIZONTAL_ALIGNMENT_CENTER, -1, size, 3, Color.BLACK)
		draw_string(font, ft.position, ft.text, HORIZONTAL_ALIGNMENT_CENTER, -1, size, col)

# Public API

func add_damage_number(pos: Vector2, damage: int, is_crit := false) -> void:
	var ft := FloatingText.new()
	ft.position = pos + Vector2(randf_range(-10, 10), -20)
	ft.velocity = Vector2(randf_range(-30, 30), -80)
	ft.text = str(damage) + ("!" if is_crit else "")
	ft.color = Color(1, 0.2, 0.2) if not is_crit else Color(1, 0.8, 0)
	ft.font_size = 16 if not is_crit else 22
	ft.lifetime = 0.8
	ft.max_lifetime = 0.8
	floating_texts.append(ft)

func add_heal_number(pos: Vector2, amount: int) -> void:
	var ft := FloatingText.new()
	ft.position = pos + Vector2(randf_range(-10, 10), -20)
	ft.velocity = Vector2(randf_range(-20, 20), -60)
	ft.text = "+" + str(amount)
	ft.color = Color(0.2, 1, 0.4)
	ft.font_size = 14
	ft.lifetime = 0.7
	ft.max_lifetime = 0.7
	floating_texts.append(ft)

func add_status_text(pos: Vector2, text: String, color: Color) -> void:
	var ft := FloatingText.new()
	ft.position = pos + Vector2(0, -30)
	ft.velocity = Vector2(0, -40)
	ft.text = text
	ft.color = color
	ft.font_size = 12
	ft.lifetime = 0.6
	ft.max_lifetime = 0.6
	floating_texts.append(ft)

func add_attack_line(from_pos: Vector2, to_pos: Vector2, color := Color(1, 0.9, 0.3)) -> void:
	attack_lines.append({"from": from_pos, "to": to_pos, "color": color, "lifetime": 0.2})

func add_death_explosion(pos: Vector2, color := Color(1, 0.5, 0.3)) -> void:
	for j in 12:
		var p := Particle.new()
		p.position = pos
		var angle := randf() * TAU
		var speed := randf_range(60, 150)
		p.velocity = Vector2(cos(angle), sin(angle)) * speed
		p.color = color.lerp(Color.WHITE, randf() * 0.3)
		p.size = randf_range(2.0, 5.0)
		p.lifetime = randf_range(0.3, 0.7)
		p.max_lifetime = p.lifetime
		p.gravity = 100.0
		particles.append(p)

func add_ability_particles(pos: Vector2, color: Color, count := 8) -> void:
	for j in count:
		var p := Particle.new()
		p.position = pos + Vector2(randf_range(-15, 15), randf_range(-15, 15))
		var angle := randf() * TAU
		p.velocity = Vector2(cos(angle), sin(angle)) * randf_range(30, 80)
		p.color = color
		p.size = randf_range(1.5, 4.0)
		p.lifetime = randf_range(0.4, 0.8)
		p.max_lifetime = p.lifetime
		p.gravity = -30.0  # Float upward for abilities
		particles.append(p)

func add_heal_particles(pos: Vector2, count := 6) -> void:
	add_ability_particles(pos, Color(0.3, 1, 0.5, 0.8), count)

func add_attack_pulse(pos: Vector2, color := Color(1, 0.8, 0.3)) -> void:
	for j in 4:
		var p := Particle.new()
		p.position = pos
		var angle := randf() * TAU
		p.velocity = Vector2(cos(angle), sin(angle)) * randf_range(40, 100)
		p.color = color
		p.size = randf_range(2.0, 4.0)
		p.lifetime = 0.3
		p.max_lifetime = 0.3
		p.gravity = 0.0
		particles.append(p)

func clear_all() -> void:
	floating_texts.clear()
	particles.clear()
	attack_lines.clear()
	queue_redraw()
