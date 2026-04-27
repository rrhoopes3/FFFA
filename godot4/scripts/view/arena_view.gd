extends Node3D
## Top-level 3D arena scene controller. Hosts the hex grid, owns the camera
## rig and lighting, and bridges sim → view via EventBus.
##
## Two view modes:
##   - "shop": shows the player's pre-combat board so units can be placed,
##     moved, and sold. Units are spawned in response to unit_placed /
##     unit_removed / units_swapped / unit_merged signals from GameState.
##   - "combat": clears the shop view and listens for combat_* signals from
##     CombatSim, spawning fresh UnitViews keyed by uid for the duration.
## On combat_ended, combat views are torn down and the shop view is rebuilt
## from GameState.player_board (which CombatSim restores from pre_combat_board).

const UnitView = preload("res://scripts/view/unit_view.gd")
const Hex = preload("res://scripts/sim/hex.gd")
const HexGrid = preload("res://scripts/view/hex_grid_3d.gd")

@onready var hex_grid: Node3D = $HexGrid
@onready var camera: Camera3D = $Camera3D

var spectators_container: Node3D

# Base camera framing (measured from the look-at point). During combat we
# rotate this offset around CAMERA_LOOK_AT on the Y axis for a slow orbit,
# and scale it slightly for a "punch in" dolly zoom.
const CAMERA_POS := Vector3(0, 6.5, 7.0)
const CAMERA_LOOK_AT := Vector3(0, 0.4, 0)
const COMBAT_ORBIT_SPEED := 0.10       # rad/sec — slow enough to be felt, not noticed
const COMBAT_DOLLY_ZOOM := 0.82        # multiplier on the base offset during combat

# Three parallel view dictionaries keyed differently. shop_views + preview_views
# coexist during shop phase (player pieces + scouting enemies). combat_views is
# populated only during the fight — phase transitions clear the others.
var shop_views: Dictionary = {}    # hex_key (String) → UnitView (player side)
var preview_views: Dictionary = {} # hex_key (String) → UnitView (enemy scouting)
var combat_views: Dictionary = {}  # uid (int) → UnitView
var phase: String = "shop"

# Camera orbit state
var pivot_yaw: float = 0.0
var dolly: float = 1.0                 # tweened between 1.0 (shop) and 0.82 (combat)
var _dolly_tween: Tween
var shake_strength: float = 0.0        # Trauma — squared into shake offset
const SHAKE_DECAY := 6.0
const SHAKE_MAX_OFFSET := 0.55

# Signal published for the 2D UI when a hex is clicked while a drag is active
# (the drag layer asks the camera to project the cursor → hex).
signal arena_hex_clicked(hex_key: String)


func _ready() -> void:
	_apply_camera_transform()

	# Imported island.glb has vertex colors but Godot's GLB material doesn't
	# enable vertex_color_use_as_albedo by default. Walk the subtree once and
	# duplicate-then-patch each surface material so the grass/sand/rock bands
	# painted in Blender actually show up.
	var island := get_node_or_null("Island")
	if island:
		_enable_vertex_colors(island)

	_build_spectators()

	hex_grid.hex_clicked.connect(_on_hex_clicked)

	# Shop signals
	EventBus.unit_placed.connect(_on_unit_placed)
	EventBus.unit_removed.connect(_on_unit_removed)
	EventBus.units_swapped.connect(_on_units_swapped)
	EventBus.enemy_preview_ready.connect(_on_enemy_preview_ready)
	EventBus.unit_merged.connect(_on_unit_merged_celebrate)

	# GameUI is a descendant and _ready's bottom-up — so GameState.start_game
	# has already fired enemy_preview_ready before we got here. Catch up using
	# whatever the current enemy_board is.
	if not GameState.enemy_board.is_empty():
		_on_enemy_preview_ready(GameState.enemy_board)

	# Combat signals
	EventBus.combat_started.connect(_on_combat_started)
	EventBus.combat_ended.connect(_on_combat_ended)
	EventBus.combat_unit_spawned.connect(_on_combat_unit_spawned)
	EventBus.unit_attacked.connect(_on_unit_attacked)
	EventBus.unit_damaged.connect(_on_unit_damaged)
	EventBus.unit_died.connect(_on_unit_died)
	EventBus.unit_moved.connect(_on_unit_moved)
	EventBus.unit_ability_cast.connect(_on_unit_ability_cast)

	# Game flow — restart wipes the shop view so the cleared board re-renders.
	EventBus.game_started.connect(_on_game_started)


func _on_game_started(_mode: String) -> void:
	phase = "shop"
	for view in combat_views.values():
		if is_instance_valid(view):
			view.queue_free()
	combat_views.clear()
	rebuild_shop_view()


# ═══════════════════════════════════════════════════════════════════════════
#  CAMERA RIG — slow orbit + dolly punch during combat
# ═══════════════════════════════════════════════════════════════════════════

func _process(delta: float) -> void:
	if phase == "combat":
		pivot_yaw += delta * COMBAT_ORBIT_SPEED
	if shake_strength > 0.0:
		shake_strength = maxf(0.0, shake_strength - SHAKE_DECAY * delta)
	_apply_camera_transform()
	_tick_spectators()


func _enable_vertex_colors(node: Node) -> void:
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		if mi.mesh:
			for i in mi.mesh.get_surface_count():
				var src := mi.mesh.surface_get_material(i)
				if src is BaseMaterial3D:
					var m := (src as BaseMaterial3D).duplicate() as BaseMaterial3D
					m.vertex_color_use_as_albedo = true
					m.albedo_color = Color.WHITE
					mi.set_surface_override_material(i, m)
	for child in node.get_children():
		_enable_vertex_colors(child)


func _apply_camera_transform() -> void:
	var offset: Vector3 = (CAMERA_POS - CAMERA_LOOK_AT) * dolly
	var rotated: Vector3 = offset.rotated(Vector3.UP, pivot_yaw)
	# Trauma-based camera shake — square the trauma so big shakes stand out
	# and small ones decay quickly. Vector offsets perturb both position and
	# look-at so the camera both translates AND tilts.
	var shake := Vector3.ZERO
	var look_jitter := Vector3.ZERO
	if shake_strength > 0.0:
		var s := shake_strength * shake_strength * SHAKE_MAX_OFFSET
		shake = Vector3(
			randf_range(-1.0, 1.0),
			randf_range(-1.0, 1.0) * 0.6,
			randf_range(-1.0, 1.0),
		) * s
		look_jitter = Vector3(
			randf_range(-1.0, 1.0),
			randf_range(-1.0, 1.0),
			randf_range(-1.0, 1.0),
		) * s * 0.4
	camera.position = CAMERA_LOOK_AT + rotated + shake
	camera.look_at(CAMERA_LOOK_AT + look_jitter, Vector3.UP)


func add_camera_trauma(amount: float) -> void:
	shake_strength = minf(1.0, shake_strength + amount)


func _start_combat_camera() -> void:
	if _dolly_tween and _dolly_tween.is_valid():
		_dolly_tween.kill()
	_dolly_tween = create_tween()
	_dolly_tween.tween_property(self, "dolly", COMBAT_DOLLY_ZOOM, 0.55)\
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func _end_combat_camera() -> void:
	if _dolly_tween and _dolly_tween.is_valid():
		_dolly_tween.kill()
	_dolly_tween = create_tween()
	_dolly_tween.tween_property(self, "dolly", 1.0, 0.7)\
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	# Snap the yaw back to neutral so the next shop phase starts framed.
	_dolly_tween.parallel().tween_property(self, "pivot_yaw", 0.0, 0.7)\
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


# ═══════════════════════════════════════════════════════════════════════════
#  CAMERA RAY HELPER (used by the 2D drag layer to find the hovered hex)
# ═══════════════════════════════════════════════════════════════════════════

func screen_to_hex_key(screen_pos: Vector2) -> String:
	# Cast a ray from the camera through screen_pos onto the y=0 plane and
	# convert the world hit point back to (col, row).
	var origin := camera.project_ray_origin(screen_pos)
	var dir := camera.project_ray_normal(screen_pos)
	if absf(dir.y) < 0.0001:
		return ""
	var t := -origin.y / dir.y
	if t < 0.0:
		return ""
	var hit := origin + dir * t
	return _world_to_hex_key(hit)


func _world_to_hex_key(world_pos: Vector3) -> String:
	# Brute force — only 56 hexes, the closest center wins. Cheaper than
	# inverting the odd-r layout math by hand.
	var best_key := ""
	var best_d2 := INF
	for col in Hex.COLS:
		for row in Hex.ROWS:
			var center := HexGrid.hex_to_world(col, row)
			var d2: float = (world_pos.x - center.x) ** 2 + (world_pos.z - center.z) ** 2
			if d2 < best_d2:
				best_d2 = d2
				best_key = Hex.key(col, row)
	return best_key


# ═══════════════════════════════════════════════════════════════════════════
#  SHOP PHASE — bridges GameState.player_board to UnitViews
# ═══════════════════════════════════════════════════════════════════════════

func rebuild_shop_view() -> void:
	# Tear down whatever's currently there and re-spawn from player_board.
	for view in shop_views.values():
		if is_instance_valid(view):
			view.queue_free()
	shop_views.clear()
	for hex_key in GameState.player_board:
		var u = GameState.player_board[hex_key]
		_spawn_shop_unit(u.id, u.stars, hex_key)
	# Also refresh the scouting preview from whatever GameState has now.
	if not GameState.enemy_board.is_empty():
		_on_enemy_preview_ready(GameState.enemy_board)


func _spawn_shop_unit(unit_id: String, stars: int, hex_key: String) -> void:
	var view: Node3D = UnitView.new()
	view.name = "Shop_%s_%s" % [unit_id, hex_key]
	add_child(view)
	# Use a synthetic uid (hashed hex_key) so view internals are happy.
	view.setup(hash(hex_key), unit_id, hex_key, true, stars, 1000)
	shop_views[hex_key] = view


func _on_unit_placed(unit_id: String, hex_key: String) -> void:
	if phase != "shop":
		return
	if shop_views.has(hex_key):
		var prev: Node3D = shop_views[hex_key]
		if is_instance_valid(prev):
			prev.queue_free()
		shop_views.erase(hex_key)
	# Look up stars from GameState.
	var u = GameState.player_board.get(hex_key, null)
	var stars := 1
	if u != null and u is Dictionary:
		stars = u.get("stars", 1)
	_spawn_shop_unit(unit_id, stars, hex_key)


func _on_unit_removed(_unit_id: String, hex_key: String) -> void:
	if phase != "shop":
		return
	if shop_views.has(hex_key):
		var view: Node3D = shop_views[hex_key]
		if is_instance_valid(view):
			view.queue_free()
		shop_views.erase(hex_key)


func _on_enemy_preview_ready(enemy_board: Dictionary) -> void:
	# Rebuild the scouting preview whenever the next round's enemy team is rolled.
	_clear_preview_views()
	if phase != "shop":
		return
	for hex_key in enemy_board:
		var u = enemy_board[hex_key]
		var view: Node3D = UnitView.new()
		view.name = "Preview_%s" % hex_key
		add_child(view)
		view.setup(hash(hex_key) ^ 0x7FFF, u.id, hex_key, false, u.get("stars", 1), 100)
		_make_preview_translucent(view)
		preview_views[hex_key] = view


func _clear_preview_views() -> void:
	for view in preview_views.values():
		if is_instance_valid(view):
			view.queue_free()
	preview_views.clear()


func _make_preview_translucent(view: Node3D) -> void:
	# Dim + desaturate the unit so it reads as "not actually here yet". HP bar
	# is hidden since these aren't combat units. Team disc stays but is dimmed.
	if view.has_node("HPBarBG"):
		view.get_node("HPBarBG").visible = false
	if view.has_node("HPBarFill"):
		view.get_node("HPBarFill").visible = false
	# Tint body + team disc
	_tint_preview_subtree(view, 0.55)


func _tint_preview_subtree(node: Node, alpha: float) -> void:
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		var surf_count := 0
		if mi.mesh:
			surf_count = mi.mesh.get_surface_count()
		for i in surf_count:
			var src_mat: Material = mi.get_surface_override_material(i)
			if src_mat == null and mi.mesh:
				src_mat = mi.mesh.surface_get_material(i)
			if src_mat is BaseMaterial3D:
				var m := (src_mat as BaseMaterial3D).duplicate() as BaseMaterial3D
				m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
				var c := m.albedo_color
				c.a = alpha
				c = c.lerp(Color(0.35, 0.38, 0.45, alpha), 0.35)
				m.albedo_color = c
				mi.set_surface_override_material(i, m)
	for child in node.get_children():
		_tint_preview_subtree(child, alpha)


func _on_units_swapped(hex_a: String, hex_b: String) -> void:
	if phase != "shop":
		return
	# Easiest correct path: rebuild affected hexes from current player_board.
	for hk in [hex_a, hex_b]:
		if shop_views.has(hk):
			var view: Node3D = shop_views[hk]
			if is_instance_valid(view):
				view.queue_free()
			shop_views.erase(hk)
		var u = GameState.player_board.get(hk, null)
		if u != null:
			_spawn_shop_unit(u.id, u.get("stars", 1), hk)


# ═══════════════════════════════════════════════════════════════════════════
#  COMBAT PHASE
# ═══════════════════════════════════════════════════════════════════════════

func _on_combat_started() -> void:
	phase = "combat"
	_start_combat_camera()
	# Drop the shop views AND the scouting previews — combat will spawn fresh
	# uid-keyed ones for both sides.
	for view in shop_views.values():
		if is_instance_valid(view):
			view.queue_free()
	shop_views.clear()
	_clear_preview_views()


func _on_combat_ended(_player_won: bool) -> void:
	phase = "shop"
	_end_combat_camera()
	# Drop any combat views that survived.
	for view in combat_views.values():
		if is_instance_valid(view):
			view.queue_free()
	combat_views.clear()
	# Re-show the player's pre-combat board so the next shop phase has its
	# pieces back. CombatSim has already restored player_board for us.
	rebuild_shop_view()


func _on_combat_unit_spawned(uid: int, unit_id: String, hex_key: String,
		is_player: bool, stars: int) -> void:
	if phase != "combat":
		return
	var view: Node3D = UnitView.new()
	view.name = "Unit_%d" % uid
	add_child(view)
	var stat_unit: Dictionary = {}
	for u in CombatSim.units:
		if u.uid == uid:
			stat_unit = u
			break
	var max_hp: int = stat_unit.get("max_hp", 1) if not stat_unit.is_empty() else 1
	view.setup(uid, unit_id, hex_key, is_player, stars, max_hp)
	combat_views[uid] = view


func _on_unit_attacked(attacker_uid: int, target_uid: int, damage: int, is_crit: bool) -> void:
	var attacker = combat_views.get(attacker_uid, null)
	var target = combat_views.get(target_uid, null)
	if attacker and target:
		attacker.play_attack(target.hex_key, is_crit)
		# Pre-load the target with the knockback direction so the next
		# unit_damaged signal lands a hit-shake going away from the attacker.
		var away: Vector3 = target.position - attacker.position
		away.y = 0.0
		if away.length() > 0.001:
			target.pending_hurt_dir = away.normalized()
		_spawn_hit_spark(target.global_position + Vector3(0, 0.6, 0), is_crit)
		_spawn_damage_number(target.global_position + Vector3(0, 1.1, 0), damage, is_crit)
		# Crit hits trigger camera trauma + a brief hit-pause for impact feel.
		# Non-crits get a tiny tap of trauma.
		if is_crit:
			add_camera_trauma(0.85)
			_hit_pause(0.10, 0.30)
		else:
			add_camera_trauma(0.18)


func _hit_pause(real_seconds: float, slow_factor: float) -> void:
	# Brief Engine.time_scale dip — feels like the game freezes on impact.
	# The restore timer ignores time_scale so it actually fires on time.
	Engine.time_scale = slow_factor
	var t := get_tree().create_timer(real_seconds, true, false, true)
	t.timeout.connect(_restore_time_scale)


func _restore_time_scale() -> void:
	Engine.time_scale = 1.0


func _on_unit_damaged(uid: int, hp: int, _max_hp: int) -> void:
	var view = combat_views.get(uid, null)
	if view:
		view.take_damage(hp)


func _on_unit_died(uid: int) -> void:
	var view = combat_views.get(uid, null)
	if view:
		_spawn_death_puff(view.global_position + Vector3(0, 0.4, 0))
		view.die()
		combat_views.erase(uid)


# ═══════════════════════════════════════════════════════════════════════════
#  PARTICLE VFX — one-shot CPUParticles3D spawned on signal
#  (CPUParticles3D works on all renderers including Compatibility/WebGL)
# ═══════════════════════════════════════════════════════════════════════════

func _spawn_hit_spark(world_pos: Vector3, is_crit: bool) -> void:
	var p := CPUParticles3D.new()
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 0.05
	p.direction = Vector3(0, 1, 0)
	p.spread = 180.0
	p.initial_velocity_min = 2.2
	p.initial_velocity_max = 4.5 if is_crit else 3.2
	p.gravity = Vector3(0, -7.0, 0)
	p.scale_amount_min = 0.07
	p.scale_amount_max = 0.14 if is_crit else 0.11
	p.color = Color(1.0, 0.75, 0.25) if is_crit else Color(1.0, 0.95, 0.70)
	var sm := SphereMesh.new()
	sm.radius = 0.05
	sm.height = 0.10
	sm.radial_segments = 6
	sm.rings = 3
	p.mesh = sm
	p.amount = 22 if is_crit else 12
	p.lifetime = 0.6
	p.one_shot = true
	p.explosiveness = 1.0
	p.position = world_pos
	add_child(p)
	p.restart()
	get_tree().create_timer(1.0).timeout.connect(p.queue_free)


func _spawn_death_puff(world_pos: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 0.12
	p.direction = Vector3(0, 1, 0)
	p.spread = 45.0
	p.initial_velocity_min = 0.8
	p.initial_velocity_max = 1.6
	p.gravity = Vector3(0, 0.4, 0)  # drifts up
	p.scale_amount_min = 0.25
	p.scale_amount_max = 0.45
	p.color = Color(0.85, 0.85, 0.90, 0.85)
	var sm := SphereMesh.new()
	sm.radius = 0.22
	sm.height = 0.40
	sm.radial_segments = 6
	sm.rings = 4
	p.mesh = sm
	p.amount = 18
	p.lifetime = 1.1
	p.one_shot = true
	p.explosiveness = 0.9
	p.position = world_pos
	add_child(p)
	p.restart()
	get_tree().create_timer(2.0).timeout.connect(p.queue_free)


func _on_unit_moved(uid: int, _from_hex: String, to_hex: String) -> void:
	var view = combat_views.get(uid, null)
	if view:
		view.move_to(to_hex)


func _on_unit_ability_cast(uid: int, _ability_name: String) -> void:
	var view = combat_views.get(uid, null)
	if view:
		view.play_cast()
		_spawn_cast_halo(view.global_position + Vector3(0, 0.05, 0), view.is_player)
		add_camera_trauma(0.25)


func _on_unit_merged_celebrate(unit_id: String, new_stars: int) -> void:
	# Always emit the "★UP!" banner — works for both bench and board merges.
	if phase == "shop":
		EventBus.banner_requested.emit(
			"★%d  %s  ★%d" % [new_stars, _display_name(unit_id), new_stars],
			Color(1.0, 0.85, 0.30),
		)
	# Burst golden particles + pop IF the survivor is on the board. Bench-side
	# merges get the banner only; the bench slot highlight is enough feedback.
	if phase != "shop":
		return
	var target: Node3D = null
	for view in shop_views.values():
		if is_instance_valid(view) and view.unit_id == unit_id and view.stars == new_stars:
			target = view
			break
	if target == null:
		return
	var burst_pos: Vector3 = target.global_position + Vector3(0, 0.7, 0)
	_spawn_merge_burst(burst_pos, new_stars)
	_popup_unit(target)
	EventBus.star_up.emit(unit_id, new_stars, burst_pos)


func _display_name(unit_id: String) -> String:
	var data: Dictionary = GameData.units_data.get(unit_id, {})
	return data.get("name", unit_id)


func _popup_unit(view: Node3D) -> void:
	# Quick squash-and-stretch that tweens the UnitView's scale. The unit view
	# rebuilds scale from stretch each frame, so we tween the outer transform.
	var tw := create_tween()
	tw.tween_property(view, "scale", Vector3(1.3, 1.3, 1.3), 0.15)\
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(view, "scale", Vector3(1.0, 1.0, 1.0), 0.25)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _spawn_merge_burst(world_pos: Vector3, stars: int) -> void:
	var p := CPUParticles3D.new()
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 0.14
	p.direction = Vector3(0, 1, 0)
	p.spread = 180.0
	p.initial_velocity_min = 1.8
	p.initial_velocity_max = 3.6
	p.gravity = Vector3(0, -3.2, 0)
	p.scale_amount_min = 0.10
	p.scale_amount_max = 0.20
	p.color = Color(1.0, 0.86, 0.30) if stars == 2 else Color(1.0, 0.55, 0.85)
	var sm := SphereMesh.new()
	sm.radius = 0.08
	sm.height = 0.16
	sm.radial_segments = 6
	sm.rings = 3
	p.mesh = sm
	p.amount = 30 if stars == 2 else 50
	p.lifetime = 1.1
	p.one_shot = true
	p.explosiveness = 1.0
	p.position = world_pos
	add_child(p)
	p.restart()
	get_tree().create_timer(2.0).timeout.connect(p.queue_free)

	# A brief emissive star-shaped halo ring on the ground.
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.35
	torus.outer_radius = 0.48
	torus.rings = 32
	torus.ring_segments = 8
	ring.mesh = torus
	var mat := StandardMaterial3D.new()
	var ring_col := Color(1.0, 0.88, 0.30) if stars == 2 else Color(1.0, 0.55, 0.85)
	mat.albedo_color = ring_col
	mat.emission_enabled = true
	mat.emission = ring_col
	mat.emission_energy_multiplier = 5.5
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring.material_override = mat
	ring.position = Vector3(world_pos.x, 0.06, world_pos.z)
	add_child(ring)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(ring, "scale", Vector3(4.0, 1.0, 4.0), 0.75)\
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.75)
	tw.chain().tween_callback(ring.queue_free)


func _spawn_cast_halo(world_pos: Vector3, is_player: bool) -> void:
	# Expanding torus ring under the casting unit. Tweens scale up + alpha
	# down, then queue_frees. Cheap and reads at game distance.
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.45
	torus.outer_radius = 0.55
	torus.rings = 32
	torus.ring_segments = 8
	ring.mesh = torus
	var mat := StandardMaterial3D.new()
	var col := Color(0.40, 0.70, 1.0) if is_player else Color(1.0, 0.45, 0.40)
	mat.albedo_color = col
	mat.emission_enabled = true
	mat.emission = col
	mat.emission_energy_multiplier = 4.5
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring.material_override = mat
	ring.position = world_pos
	add_child(ring)
	var tween := create_tween().set_parallel(true)
	tween.tween_property(ring, "scale", Vector3(3.5, 1.0, 3.5), 0.55)\
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(mat, "albedo_color:a", 0.0, 0.55)
	tween.chain().tween_callback(ring.queue_free)


# ═══════════════════════════════════════════════════════════════════════════
#  HEX CLICK PASSTHROUGH (for selection / future tooltip)
# ═══════════════════════════════════════════════════════════════════════════

func _on_hex_clicked(hex_key: String) -> void:
	arena_hex_clicked.emit(hex_key)


# ═══════════════════════════════════════════════════════════════════════════
#  FLOATING DAMAGE NUMBERS
# ═══════════════════════════════════════════════════════════════════════════

func _spawn_damage_number(world_pos: Vector3, amount: int, is_crit: bool) -> void:
	var lbl := Label3D.new()
	lbl.text = ("%d!" % amount) if is_crit else str(amount)
	lbl.font_size = 96 if is_crit else 72
	lbl.outline_size = 14
	var tint: Color = Color(1.0, 0.85, 0.20) if is_crit else Color(1.0, 0.98, 0.95)
	lbl.modulate = tint
	lbl.outline_modulate = Color(0, 0, 0, 0.92)
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.fixed_size = true
	lbl.pixel_size = 0.0045 if is_crit else 0.0033
	lbl.no_depth_test = true
	# Jitter the start position so sequential hits don't stack on one pixel.
	var jitter := Vector3(randf_range(-0.22, 0.22), 0.0, randf_range(-0.22, 0.22))
	lbl.position = world_pos + jitter
	add_child(lbl)
	var end_pos := lbl.position + Vector3(randf_range(-0.3, 0.3), 1.45, randf_range(-0.3, 0.3))
	var tween := create_tween().set_parallel(true)
	tween.tween_property(lbl, "position", end_pos, 0.85)\
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(lbl, "modulate:a", 0.0, 0.55).set_delay(0.35)
	# Pop-in scale pulse — separate non-parallel chain so it sequences cleanly.
	var pop := create_tween()
	pop.tween_property(lbl, "scale", Vector3(1.35, 1.35, 1.35), 0.10)\
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	pop.tween_property(lbl, "scale", Vector3.ONE, 0.12)
	get_tree().create_timer(1.1).timeout.connect(lbl.queue_free)


# ═══════════════════════════════════════════════════════════════════════════
#  SPECTATOR CROWD — small cat silhouettes ringing the arena
# ═══════════════════════════════════════════════════════════════════════════

const SPECTATOR_COUNT := 28
const SPECTATOR_RADIUS_MIN := 7.3
const SPECTATOR_RADIUS_MAX := 10.2
const SPECTATOR_BOB_AMP := 0.09
const SPECTATOR_BOB_SPEED := 2.1

func _build_spectators() -> void:
	spectators_container = Node3D.new()
	spectators_container.name = "Spectators"
	add_child(spectators_container)

	# Deterministic so the crowd is stable across reloads — debugging is
	# miserable when a cosmetic ring shifts every run.
	var rng := RandomNumberGenerator.new()
	rng.seed = 0xCA75_BEEF

	var fur_palette := [
		Color(0.95, 0.93, 0.87),  # cream
		Color(0.82, 0.68, 0.48),  # tan
		Color(0.25, 0.22, 0.20),  # black
		Color(0.60, 0.45, 0.35),  # brown
		Color(0.90, 0.88, 0.85),  # white
		Color(0.38, 0.32, 0.28),  # dark brown
		Color(0.72, 0.56, 0.40),  # ginger
		Color(0.52, 0.50, 0.48),  # grey
	]

	for i in SPECTATOR_COUNT:
		var angle := (float(i) / SPECTATOR_COUNT) * TAU + rng.randf_range(-0.05, 0.05)
		var radius := rng.randf_range(SPECTATOR_RADIUS_MIN, SPECTATOR_RADIUS_MAX)
		var x := cos(angle) * radius
		var z := sin(angle) * radius
		# Keep out of the pillar footprints at (±5, ±3).
		if absf(absf(x) - 5.0) < 0.55 and absf(absf(z) - 3.0) < 0.55:
			continue
		var spec := _make_spectator(fur_palette[rng.randi() % fur_palette.size()])
		spec.position = Vector3(x, 0.0, z)
		# Face the arena center so they're "watching".
		spec.rotation.y = atan2(-x, -z)
		spec.set_meta("bob_phase", rng.randf_range(0.0, TAU))
		spec.set_meta("base_y", 0.0)
		spectators_container.add_child(spec)


func _make_spectator(fur: Color) -> Node3D:
	var root := Node3D.new()
	var mat := StandardMaterial3D.new()
	mat.albedo_color = fur
	mat.roughness = 0.85
	mat.metallic = 0.0

	var body := MeshInstance3D.new()
	var body_mesh := CapsuleMesh.new()
	body_mesh.radius = 0.20
	body_mesh.height = 0.48
	body.mesh = body_mesh
	body.material_override = mat
	body.position = Vector3(0, 0.24, 0)
	root.add_child(body)

	var head := MeshInstance3D.new()
	var head_mesh := SphereMesh.new()
	head_mesh.radius = 0.16
	head_mesh.height = 0.32
	head.mesh = head_mesh
	head.material_override = mat
	head.position = Vector3(0, 0.62, 0)
	root.add_child(head)

	for side in [-1.0, 1.0]:
		var ear := MeshInstance3D.new()
		var ear_mesh := CylinderMesh.new()
		ear_mesh.top_radius = 0.001
		ear_mesh.bottom_radius = 0.055
		ear_mesh.height = 0.11
		ear_mesh.radial_segments = 6
		ear.mesh = ear_mesh
		ear.material_override = mat
		ear.position = Vector3(side * 0.095, 0.77, 0.01)
		root.add_child(ear)

	# Tiny tail curl behind the body so silhouettes read as cats from any angle.
	var tail := MeshInstance3D.new()
	var tail_mesh := CapsuleMesh.new()
	tail_mesh.radius = 0.04
	tail_mesh.height = 0.28
	tail.mesh = tail_mesh
	tail.material_override = mat
	tail.position = Vector3(0, 0.22, -0.18)
	tail.rotation = Vector3(deg_to_rad(-30.0), 0, 0)
	root.add_child(tail)

	return root


func _tick_spectators() -> void:
	if spectators_container == null:
		return
	var t_now := Time.get_ticks_msec() / 1000.0
	var excitement := 1.6 if phase == "combat" else 1.0
	for spec in spectators_container.get_children():
		var phase_off: float = spec.get_meta("bob_phase", 0.0)
		var y := maxf(0.0, sin(t_now * SPECTATOR_BOB_SPEED * excitement + phase_off)) * SPECTATOR_BOB_AMP * excitement
		spec.position.y = y
