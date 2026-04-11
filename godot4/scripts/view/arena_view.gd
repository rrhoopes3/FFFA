extends Node3D
## Top-level 3D arena scene controller. Loads arena.glb, hosts the hex grid,
## owns the camera rig and lighting environment, and bridges sim → view by
## listening to EventBus combat signals and spawning/animating UnitView nodes.

const UnitView = preload("res://scripts/view/unit_view.gd")

@onready var hex_grid: Node3D = $HexGrid
@onready var camera: Camera3D = $Camera3D
@onready var hud_label: Label = $UI/DebugLabel

# Camera sits behind the player half (positive Z) and tilts down toward
# the arena center.
const CAMERA_POS := Vector3(0, 4.0, 4.5)
const CAMERA_LOOK_AT := Vector3(0, 0.5, 0)

# uid → UnitView lookup so we can route combat signals to the right node.
var unit_views: Dictionary = {}


func _ready() -> void:
	camera.position = CAMERA_POS
	camera.look_at(CAMERA_LOOK_AT, Vector3.UP)

	hex_grid.hex_hovered.connect(_on_hex_hovered)
	hex_grid.hex_unhovered.connect(_on_hex_unhovered)
	hex_grid.hex_clicked.connect(_on_hex_clicked)

	EventBus.combat_unit_spawned.connect(_on_combat_unit_spawned)
	EventBus.unit_attacked.connect(_on_unit_attacked)
	EventBus.unit_damaged.connect(_on_unit_damaged)
	EventBus.unit_died.connect(_on_unit_died)
	EventBus.unit_moved.connect(_on_unit_moved)
	EventBus.unit_ability_cast.connect(_on_unit_ability_cast)

	_update_label("M3 pilot — running 1v1 fight in 1.0s")
	# Pilot demo: kick off a tiny fight after a beat so the player can see it.
	get_tree().create_timer(1.0).timeout.connect(_run_pilot_demo)
	# M3 self-test screenshot (removed in M5)
	if OS.has_environment("FFFA_SHOTS"):
		get_tree().create_timer(3.0).timeout.connect(_capture_pilot_shot)


func _capture_pilot_shot() -> void:
	var img := get_viewport().get_texture().get_image()
	var path := "B:/FFFA/tmp/m3_pilot.png"
	DirAccess.make_dir_recursive_absolute("B:/FFFA/tmp")
	img.save_png(path)
	print("[arena] saved screenshot ", path)
	get_tree().create_timer(0.3).timeout.connect(get_tree().quit)


# ═══════════════════════════════════════════════════════════════════════════
#  M3 PILOT DEMO
# ═══════════════════════════════════════════════════════════════════════════

func _run_pilot_demo() -> void:
	var player_board := {
		"3,5": {"id": "alley_tabby_thug", "stars": 1},
	}
	var enemy_board := {
		"3,2": {"id": "alley_tabby_thug", "stars": 1},
	}
	_update_label("pilot: Tabby Thug vs Tabby Thug")
	# Run the sim with full signal emission so the view layer animates.
	# Headless drains all ticks synchronously — for visual playback we want
	# the live tick timer instead.
	GameState.player_board = player_board.duplicate(true)
	GameState.enemy_board = enemy_board.duplicate(true)
	CombatSim.start_combat()


# ═══════════════════════════════════════════════════════════════════════════
#  COMBAT EVENT BRIDGE
# ═══════════════════════════════════════════════════════════════════════════

func _on_combat_unit_spawned(uid: int, unit_id: String, hex_key: String,
		is_player: bool, stars: int) -> void:
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
	unit_views[uid] = view


func _on_unit_attacked(attacker_uid: int, target_uid: int, _damage: int, _is_crit: bool) -> void:
	var attacker = unit_views.get(attacker_uid, null)
	var target = unit_views.get(target_uid, null)
	if attacker and target:
		attacker.play_attack(target.hex_key)


func _on_unit_damaged(uid: int, hp: int, _max_hp: int) -> void:
	var view = unit_views.get(uid, null)
	if view:
		view.take_damage(hp)


func _on_unit_died(uid: int) -> void:
	var view = unit_views.get(uid, null)
	if view:
		view.die()
		unit_views.erase(uid)


func _on_unit_moved(uid: int, _from_hex: String, to_hex: String) -> void:
	var view = unit_views.get(uid, null)
	if view:
		view.move_to(to_hex)


func _on_unit_ability_cast(uid: int, _ability_name: String) -> void:
	var view = unit_views.get(uid, null)
	if view:
		view.play_cast()


func _on_hex_hovered(hex_key: String) -> void:
	_update_label("hover: %s" % hex_key)


func _on_hex_unhovered() -> void:
	_update_label("hover: —")


func _on_hex_clicked(hex_key: String) -> void:
	_update_label("clicked: %s" % hex_key)
	print("[arena] click on hex ", hex_key)


func _update_label(text: String) -> void:
	if hud_label:
		hud_label.text = text
