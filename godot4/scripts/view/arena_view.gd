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

# Camera placed behind the player half (positive Z), high enough to see the
# whole 7×8 board. Tuned for the M4 roster shot; M5 keeps the same framing.
const CAMERA_POS := Vector3(0, 6.5, 7.0)
const CAMERA_LOOK_AT := Vector3(0, 0.4, 0)

# Two parallel view dictionaries keyed differently. We never have both modes
# populated at the same time — phase transitions clear one and build the other.
var shop_views: Dictionary = {}    # hex_key (String) → UnitView
var combat_views: Dictionary = {}  # uid (int) → UnitView
var phase: String = "shop"

# Signal published for the 2D UI when a hex is clicked while a drag is active
# (the drag layer asks the camera to project the cursor → hex).
signal arena_hex_clicked(hex_key: String)


func _ready() -> void:
	camera.position = CAMERA_POS
	camera.look_at(CAMERA_LOOK_AT, Vector3.UP)

	hex_grid.hex_clicked.connect(_on_hex_clicked)

	# Shop signals
	EventBus.unit_placed.connect(_on_unit_placed)
	EventBus.unit_removed.connect(_on_unit_removed)
	EventBus.units_swapped.connect(_on_units_swapped)

	# Combat signals
	EventBus.combat_started.connect(_on_combat_started)
	EventBus.combat_ended.connect(_on_combat_ended)
	EventBus.combat_unit_spawned.connect(_on_combat_unit_spawned)
	EventBus.unit_attacked.connect(_on_unit_attacked)
	EventBus.unit_damaged.connect(_on_unit_damaged)
	EventBus.unit_died.connect(_on_unit_died)
	EventBus.unit_moved.connect(_on_unit_moved)
	EventBus.unit_ability_cast.connect(_on_unit_ability_cast)


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
	# Drop the shop views — combat will spawn fresh uid-keyed ones.
	for view in shop_views.values():
		if is_instance_valid(view):
			view.queue_free()
	shop_views.clear()


func _on_combat_ended(_player_won: bool) -> void:
	phase = "shop"
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


func _on_unit_attacked(attacker_uid: int, target_uid: int, _damage: int, _is_crit: bool) -> void:
	var attacker = combat_views.get(attacker_uid, null)
	var target = combat_views.get(target_uid, null)
	if attacker and target:
		attacker.play_attack(target.hex_key)


func _on_unit_damaged(uid: int, hp: int, _max_hp: int) -> void:
	var view = combat_views.get(uid, null)
	if view:
		view.take_damage(hp)


func _on_unit_died(uid: int) -> void:
	var view = combat_views.get(uid, null)
	if view:
		view.die()
		combat_views.erase(uid)


func _on_unit_moved(uid: int, _from_hex: String, to_hex: String) -> void:
	var view = combat_views.get(uid, null)
	if view:
		view.move_to(to_hex)


func _on_unit_ability_cast(uid: int, _ability_name: String) -> void:
	var view = combat_views.get(uid, null)
	if view:
		view.play_cast()


# ═══════════════════════════════════════════════════════════════════════════
#  HEX CLICK PASSTHROUGH (for selection / future tooltip)
# ═══════════════════════════════════════════════════════════════════════════

func _on_hex_clicked(hex_key: String) -> void:
	arena_hex_clicked.emit(hex_key)
