extends Node3D
## 3D presentation of one combat unit. Loads its .glb at setup time, then
## animates procedurally in response to EventBus signals.
##
## Procedural animation philosophy:
##   - idle: subtle Y bob via _process
##   - walk: position lerp toward target_world_pos
##   - attack: scale pulse + brief lunge toward target
##   - cast: emission flash + scale pulse
##   - hurt: white material flash
##   - death: shrink + fade + queue_free
## All driven by transform/material changes — no skeletal rig required.

const Hex = preload("res://scripts/sim/hex.gd")
const HexGrid = preload("res://scripts/view/hex_grid_3d.gd")

# ─── Unit state ─────────────────────────────────────────────────────────────
var uid: int = -1
var unit_id: String = ""
var stars: int = 1
var is_player: bool = true
var hex_key: String = ""
var max_hp: int = 1
var current_hp: int = 1
var alive: bool = true

# ─── Visuals ────────────────────────────────────────────────────────────────
var mesh_root: Node3D                 # Container for the loaded .glb
var mesh_instances: Array[MeshInstance3D] = []
var original_materials: Array = []    # Per-instance original material list
var hp_bar_bg: MeshInstance3D
var hp_bar_fill: MeshInstance3D
var team_disc: MeshInstance3D

# ─── Animation state ────────────────────────────────────────────────────────
var target_world_pos: Vector3 = Vector3.ZERO
var move_speed: float = 2.5           # m/s
var bob_phase: float = 0.0
var hurt_timer: float = 0.0
var attack_timer: float = 0.0
var cast_timer: float = 0.0
var lunge_dir: Vector3 = Vector3.ZERO   # Set on attack, multiplied by sin curve each frame
var hurt_dir: Vector3 = Vector3.ZERO    # Set on damage, knockback away from attacker
var pending_hurt_dir: Vector3 = Vector3.ZERO  # Set by arena_view from the attacker's position before damage signal arrives
var mesh_root_base_y: float = 0.0       # Base Y from origin-correction; bob/lunge are added on top
var base_yaw: float = 0.0               # Team-facing yaw (PI for enemies, 0 for player)
var target_yaw: float = 0.0             # Lerp target — used for face-the-attacker rotation
var prev_position: Vector3 = Vector3.ZERO  # For move-lean and walk bounce

# ─── Constants ──────────────────────────────────────────────────────────────
const PLAYER_COLOR := Color(0.30, 0.55, 0.95)
const ENEMY_COLOR  := Color(0.95, 0.35, 0.35)
const HURT_FLASH_DURATION := 0.22
const ATTACK_DURATION := 0.42       # 0.12 windup + 0.18 strike + 0.12 recover
const ATTACK_WINDUP := 0.12
const ATTACK_STRIKE := 0.18
const CAST_DURATION := 0.45
const BOB_AMPLITUDE := 0.04
const BOB_SPEED := 2.5
const SWAY_AMPLITUDE := 0.025
const SWAY_SPEED := 1.7
const KNOCKBACK_DISTANCE := 0.18
const YAW_LERP_SPEED := 8.0


# ═══════════════════════════════════════════════════════════════════════════
#  SETUP
# ═══════════════════════════════════════════════════════════════════════════

func setup(p_uid: int, p_unit_id: String, p_hex: String, p_is_player: bool,
		p_stars: int, p_max_hp: int) -> void:
	uid = p_uid
	unit_id = p_unit_id
	hex_key = p_hex
	is_player = p_is_player
	stars = p_stars
	max_hp = p_max_hp
	current_hp = p_max_hp

	bob_phase = randf() * TAU

	_load_mesh()
	_build_team_disc()
	_build_hp_bar()
	_snap_to_hex()
	# Face the opposing team. Enemies look at -Z; players look at +Z.
	base_yaw = PI if not is_player else 0.0
	target_yaw = base_yaw
	rotation.y = base_yaw


func _load_mesh() -> void:
	mesh_root = Node3D.new()
	mesh_root.name = "MeshRoot"
	add_child(mesh_root)

	var path := "res://art/units/%s.glb" % unit_id
	if not ResourceLoader.exists(path):
		push_warning("UnitView: missing mesh %s" % path)
		var fallback := MeshInstance3D.new()
		fallback.mesh = BoxMesh.new()
		mesh_root.add_child(fallback)
		mesh_instances.append(fallback)
		return

	var packed: PackedScene = load(path)
	var glb_inst := packed.instantiate()
	mesh_root.add_child(glb_inst)
	_collect_mesh_instances(glb_inst)
	# Origin-correct: shift the mesh so its AABB bottom (feet) sits at y=0,
	# since the procedural Blender pipeline leaves origins at body-center.
	if not mesh_instances.is_empty():
		var aabb := mesh_instances[0].get_aabb()
		mesh_root_base_y = -aabb.position.y
		mesh_root.position.y = mesh_root_base_y


func _collect_mesh_instances(node: Node) -> void:
	if node is MeshInstance3D:
		mesh_instances.append(node)
		var mats: Array = []
		for i in node.get_surface_override_material_count():
			mats.append(node.get_surface_override_material(i))
		original_materials.append(mats)
	for child in node.get_children():
		_collect_mesh_instances(child)


func _build_team_disc() -> void:
	# Glowing disc under the unit, team-colored, marks selection / team.
	team_disc = MeshInstance3D.new()
	team_disc.name = "TeamDisc"
	var torus := TorusMesh.new()
	torus.inner_radius = 0.32
	torus.outer_radius = 0.42
	torus.rings = 24
	torus.ring_segments = 6
	team_disc.mesh = torus
	team_disc.position = Vector3(0, 0.06, 0)
	var mat := StandardMaterial3D.new()
	var color := PLAYER_COLOR if is_player else ENEMY_COLOR
	mat.albedo_color = color
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = 2.0
	mat.flags_unshaded = false
	team_disc.material_override = mat
	add_child(team_disc)


func _build_hp_bar() -> void:
	# Two flat quads above the unit, billboarded toward the camera.
	hp_bar_bg = MeshInstance3D.new()
	hp_bar_bg.name = "HPBarBG"
	var bg_mesh := QuadMesh.new()
	bg_mesh.size = Vector2(0.7, 0.08)
	hp_bar_bg.mesh = bg_mesh
	var bg_mat := StandardMaterial3D.new()
	bg_mat.albedo_color = Color(0, 0, 0, 0.85)
	bg_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	bg_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bg_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	bg_mat.no_depth_test = false
	hp_bar_bg.material_override = bg_mat
	hp_bar_bg.position = Vector3(0, 1.7, 0)
	add_child(hp_bar_bg)

	hp_bar_fill = MeshInstance3D.new()
	hp_bar_fill.name = "HPBarFill"
	var fill_mesh := QuadMesh.new()
	fill_mesh.size = Vector2(0.66, 0.06)
	hp_bar_fill.mesh = fill_mesh
	var fill_mat := StandardMaterial3D.new()
	fill_mat.albedo_color = Color(0.30, 0.95, 0.35)
	fill_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fill_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	hp_bar_fill.material_override = fill_mat
	hp_bar_fill.position = Vector3(0, 1.7, -0.001)
	add_child(hp_bar_fill)


# ═══════════════════════════════════════════════════════════════════════════
#  EVENT RESPONSES
# ═══════════════════════════════════════════════════════════════════════════

func snap_to(hex_key_new: String) -> void:
	hex_key = hex_key_new
	_snap_to_hex()


func move_to(hex_key_new: String) -> void:
	hex_key = hex_key_new
	var pos := Hex.parse(hex_key_new)
	target_world_pos = HexGrid.hex_to_world(pos.x, pos.y)


func play_attack(toward_hex: String) -> void:
	attack_timer = ATTACK_DURATION
	var pos := Hex.parse(toward_hex)
	var tgt := HexGrid.hex_to_world(pos.x, pos.y)
	var to_tgt := tgt - target_world_pos
	to_tgt.y = 0.0
	if to_tgt.length() > 0.001:
		lunge_dir = to_tgt.normalized() * 0.32
		# Face the target — yaw points along -Z in the local frame, so we
		# want to look at the target. atan2(x, z) gives the yaw needed.
		target_yaw = atan2(to_tgt.x, to_tgt.z)
	else:
		lunge_dir = Vector3.ZERO


func play_cast() -> void:
	cast_timer = CAST_DURATION


func take_damage(new_hp: int) -> void:
	current_hp = clampi(new_hp, 0, max_hp)
	hurt_timer = HURT_FLASH_DURATION
	# Use the direction arena_view pre-loaded from the attacker, or fall back
	# to the team-facing direction if it wasn't set (e.g. ability damage).
	if pending_hurt_dir.length() > 0.01:
		hurt_dir = pending_hurt_dir
		pending_hurt_dir = Vector3.ZERO
	else:
		hurt_dir = Vector3(0, 0, 1.0 if not is_player else -1.0)
	_update_hp_bar()


func die() -> void:
	alive = false
	# Random tumble axis biased toward horizontal so the cat falls over rather
	# than spinning in place. Also kicks slightly upward + backward.
	var tumble_axis := Vector3(
		randf_range(-1.0, 1.0),
		randf_range(-0.2, 0.2),
		randf_range(-1.0, 1.0)
	).normalized()
	var tumble_angle := randf_range(1.4, 2.4) * (1.0 if randf() > 0.5 else -1.0)
	var death_offset := Vector3(
		randf_range(-0.15, 0.15),
		0.4,
		randf_range(-0.15, 0.15)
	)

	var tween := create_tween().set_parallel(true)
	tween.tween_property(self, "scale", Vector3(0.05, 0.05, 0.05), 0.65)
	tween.tween_property(self, "position", position + death_offset, 0.55)\
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	# Tumble via rotation around the chosen axis. Callable.bind() APPENDS
	# the bound args, so the tween calls _apply_tumble(value, axis).
	tween.tween_method(
		Callable(self, "_apply_tumble").bind(tumble_axis), 0.0, tumble_angle, 0.65
	).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)

	# Fade alpha via duplicated materials (Node3D has no modulate)
	for inst in mesh_instances:
		var current_mat: Material = inst.get_surface_override_material(0)
		if current_mat == null and inst.mesh:
			current_mat = inst.mesh.surface_get_material(0)
		if current_mat is StandardMaterial3D:
			var sm: StandardMaterial3D = current_mat.duplicate()
			sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			inst.set_surface_override_material(0, sm)
			tween.tween_property(sm, "albedo_color:a", 0.0, 0.55)
	if team_disc:
		var disc_mat: StandardMaterial3D = team_disc.material_override
		disc_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		tween.tween_property(disc_mat, "albedo_color:a", 0.0, 0.55)
	tween.chain().tween_callback(queue_free)


func _apply_tumble(angle: float, axis: Vector3) -> void:
	# Apply tumble as an extra rotation on top of the base yaw. We rebuild
	# the transform basis from scratch each tick — never accumulate.
	var basis := Basis(Vector3.UP, base_yaw)
	basis = basis.rotated(axis, angle)
	transform.basis = basis


# ═══════════════════════════════════════════════════════════════════════════
#  ANIMATION TICK
# ═══════════════════════════════════════════════════════════════════════════

func _process(delta: float) -> void:
	if not alive:
		return

	# Smooth move toward target
	prev_position = position
	var to_target := target_world_pos - position
	if to_target.length() > 0.01:
		var step := move_speed * delta
		if to_target.length() <= step:
			position = target_world_pos
		else:
			position += to_target.normalized() * step

	# Yaw lerp — face the attack target during a strike, snap back to base
	# yaw afterward. transform.basis isn't touched here; rotation.y is the
	# canonical source so the death tumble can override it cleanly.
	var desired_yaw := target_yaw if attack_timer > 0.0 else base_yaw
	var yaw_delta := wrapf(desired_yaw - rotation.y, -PI, PI)
	rotation.y += yaw_delta * minf(1.0, delta * YAW_LERP_SPEED)

	# Compute mesh_root position + scale from scratch each frame: base + bob
	# + sway + lunge + knockback. Never accumulate — that bug ate 30 minutes
	# in M3 (see CLAUDE.md gotchas).
	var t_now := Time.get_ticks_msec() / 1000.0
	var bob_y := sin(t_now * BOB_SPEED + bob_phase) * BOB_AMPLITUDE
	var sway_x := sin(t_now * SWAY_SPEED + bob_phase * 0.7) * SWAY_AMPLITUDE
	var sway_z := cos(t_now * SWAY_SPEED * 0.83 + bob_phase) * SWAY_AMPLITUDE * 0.6

	# Walk bounce — slightly amplified bob when moving
	var move_dist := (position - prev_position).length()
	if move_dist > 0.001:
		var walk_freq := t_now * 7.0 + bob_phase
		bob_y += abs(sin(walk_freq)) * 0.05

	var lunge_xz := Vector3.ZERO
	var stretch := Vector3.ONE
	if attack_timer > 0.0:
		attack_timer = maxf(attack_timer - delta, 0.0)
		var elapsed := ATTACK_DURATION - attack_timer
		# Three-phase attack: windup → strike → recover
		if elapsed < ATTACK_WINDUP:
			# Windup: pull back, squash down vertically
			var pull := elapsed / ATTACK_WINDUP
			lunge_xz = -lunge_dir * 0.45 * pull
			stretch = Vector3(1.0 + 0.10 * pull, 1.0 - 0.12 * pull, 1.0 + 0.10 * pull)
		elif elapsed < ATTACK_WINDUP + ATTACK_STRIKE:
			# Strike: lunge forward, stretch into the lunge direction
			var strike_t := (elapsed - ATTACK_WINDUP) / ATTACK_STRIKE
			var f := sin(strike_t * PI)
			lunge_xz = lunge_dir * f
			# Stretch along the lunge axis (approximated as Z since we face target)
			stretch = Vector3(1.0 - 0.06 * f, 1.0 - 0.06 * f, 1.0 + 0.20 * f)
		else:
			# Recovery: ease back to neutral
			var recover_t := (elapsed - ATTACK_WINDUP - ATTACK_STRIKE) / (ATTACK_DURATION - ATTACK_WINDUP - ATTACK_STRIKE)
			var k := 1.0 - recover_t
			lunge_xz = lunge_dir * 0.20 * k
			stretch = Vector3(1.0 - 0.03 * k, 1.0 - 0.03 * k, 1.0 + 0.10 * k)

	# Knockback offset on hurt — overrides the stretch with a hit shake
	var knock_xz := Vector3.ZERO
	if hurt_timer > 0.0:
		var hurt_pct := hurt_timer / HURT_FLASH_DURATION
		var shake := sin(hurt_pct * PI * 4.0) * 0.04
		knock_xz = hurt_dir * KNOCKBACK_DISTANCE * hurt_pct + Vector3(shake, 0, shake)

	if mesh_root:
		mesh_root.position = Vector3(
			lunge_xz.x + knock_xz.x + sway_x,
			mesh_root_base_y + bob_y,
			lunge_xz.z + knock_xz.z + sway_z,
		)
		mesh_root.scale = mesh_root.scale.lerp(stretch, delta * 14.0)

	# Cast — spin + float + stretch + glow halo
	if cast_timer > 0.0:
		cast_timer = maxf(cast_timer - delta, 0.0)
		var t := 1.0 - (cast_timer / CAST_DURATION)
		var arc := sin(t * PI)         # 0 → 1 → 0 over the cast
		var glow := arc * 5.0
		if team_disc and team_disc.material_override:
			team_disc.material_override.emission_energy_multiplier = 2.0 + glow
		if mesh_root:
			# Spin around Y at increasing speed, float up, stretch up, then settle
			var spin := (1.0 - cast_timer / CAST_DURATION) * TAU * 1.2
			mesh_root.rotation.y = spin
			mesh_root.position.y = mesh_root_base_y + bob_y + arc * 0.32
			var stretch_cast := Vector3(
				1.0 - 0.10 * arc,
				1.0 + 0.22 * arc,
				1.0 - 0.10 * arc,
			)
			mesh_root.scale = mesh_root.scale.lerp(stretch_cast, delta * 12.0)
	elif mesh_root and mesh_root.rotation.y != 0.0:
		# Decay rotation back to 0 once the cast finishes
		mesh_root.rotation.y = lerpf(mesh_root.rotation.y, 0.0, delta * 6.0)

	# Hurt flash: white tint via duplicated material
	if hurt_timer > 0.0:
		hurt_timer = maxf(hurt_timer - delta, 0.0)
		var pct := hurt_timer / HURT_FLASH_DURATION
		_apply_hurt_flash(pct)
	elif _has_hurt_override:
		_clear_hurt_flash()


# ─── Hurt flash plumbing ────────────────────────────────────────────────────
var _has_hurt_override := false

func _apply_hurt_flash(strength: float) -> void:
	_has_hurt_override = true
	for inst in mesh_instances:
		var override := StandardMaterial3D.new()
		override.albedo_color = Color(1, 1, 1, 1).lerp(Color(0.3, 0.3, 0.3), 1.0 - strength)
		override.emission_enabled = true
		override.emission = Color(1, 0.6, 0.6)
		override.emission_energy_multiplier = strength * 4.0
		inst.set_surface_override_material(0, override)


func _clear_hurt_flash() -> void:
	_has_hurt_override = false
	for i in mesh_instances.size():
		var inst := mesh_instances[i]
		var orig_list: Array = original_materials[i] if i < original_materials.size() else []
		var orig: Material = orig_list[0] if orig_list.size() > 0 else null
		inst.set_surface_override_material(0, orig)


# ─── Hex placement ──────────────────────────────────────────────────────────
func _snap_to_hex() -> void:
	var pos := Hex.parse(hex_key)
	target_world_pos = HexGrid.hex_to_world(pos.x, pos.y)
	position = target_world_pos


func _update_hp_bar() -> void:
	if hp_bar_fill == null or max_hp <= 0:
		return
	var pct := clampf(float(current_hp) / float(max_hp), 0.0, 1.0)
	hp_bar_fill.scale.x = pct
	hp_bar_fill.position.x = -(0.66 * (1.0 - pct)) * 0.5
	var fill_mat: StandardMaterial3D = hp_bar_fill.material_override
	if pct > 0.6:
		fill_mat.albedo_color = Color(0.30, 0.95, 0.35)
	elif pct > 0.3:
		fill_mat.albedo_color = Color(0.95, 0.85, 0.20)
	else:
		fill_mat.albedo_color = Color(0.95, 0.25, 0.20)
