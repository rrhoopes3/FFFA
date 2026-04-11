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
var mesh_root_base_y: float = 0.0       # Base Y from origin-correction; bob/lunge are added on top

# ─── Constants ──────────────────────────────────────────────────────────────
const PLAYER_COLOR := Color(0.30, 0.55, 0.95)
const ENEMY_COLOR  := Color(0.95, 0.35, 0.35)
const HURT_FLASH_DURATION := 0.18
const ATTACK_DURATION := 0.30
const CAST_DURATION := 0.45
const BOB_AMPLITUDE := 0.04
const BOB_SPEED := 2.5


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
	if not is_player:
		# Face the player side (positive Z is player). Enemies look at -Z.
		rotation.y = PI


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
	lunge_dir = (tgt - target_world_pos).normalized() * 0.25


func play_cast() -> void:
	cast_timer = CAST_DURATION


func take_damage(new_hp: int) -> void:
	current_hp = clampi(new_hp, 0, max_hp)
	hurt_timer = HURT_FLASH_DURATION
	_update_hp_bar()


func die() -> void:
	alive = false
	var tween := create_tween().set_parallel(true)
	tween.tween_property(self, "scale", Vector3(0.1, 0.1, 0.1), 0.6)
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


# ═══════════════════════════════════════════════════════════════════════════
#  ANIMATION TICK
# ═══════════════════════════════════════════════════════════════════════════

func _process(delta: float) -> void:
	if not alive:
		return

	# Smooth move toward target
	var to_target := target_world_pos - position
	if to_target.length() > 0.01:
		var step := move_speed * delta
		if to_target.length() <= step:
			position = target_world_pos
		else:
			position += to_target.normalized() * step

	# Compute mesh_root position from scratch each frame: base + bob + lunge.
	# Never accumulate — that was a bug that drifted units off-screen.
	var bob_y := sin((Time.get_ticks_msec() / 1000.0) * BOB_SPEED + bob_phase) * BOB_AMPLITUDE
	var lunge_xz := Vector3.ZERO
	if attack_timer > 0.0:
		attack_timer = maxf(attack_timer - delta, 0.0)
		var t := 1.0 - (attack_timer / ATTACK_DURATION)
		var f := sin(t * PI)
		lunge_xz = lunge_dir * f
		var s := 1.0 + 0.15 * f
		if mesh_root:
			mesh_root.scale = Vector3(s, s, s)
	else:
		if mesh_root:
			mesh_root.scale = mesh_root.scale.lerp(Vector3.ONE, delta * 8.0)

	if mesh_root:
		mesh_root.position = Vector3(lunge_xz.x, mesh_root_base_y + bob_y, lunge_xz.z)

	# Cast flash: emission boost on team disc + mesh
	if cast_timer > 0.0:
		cast_timer = maxf(cast_timer - delta, 0.0)
		var t := 1.0 - (cast_timer / CAST_DURATION)
		var glow := sin(t * PI) * 4.0
		if team_disc and team_disc.material_override:
			team_disc.material_override.emission_energy_multiplier = 2.0 + glow

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
