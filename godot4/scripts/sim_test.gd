extends Node
## Headless sim validation. Runs a hardcoded fight, prints what happens.
## Run with: godot --path godot4 res://scenes/sim_test.tscn

var attack_count := 0
var death_count := 0
var move_count := 0
var cast_count := 0


func _ready() -> void:
	print("─────────────────────────────────────────────")
	print("  FFFA — Headless Sim Test")
	print("─────────────────────────────────────────────")

	# Subscribe to combat signals so we can print what's happening
	EventBus.combat_unit_spawned.connect(_on_spawn)
	EventBus.unit_attacked.connect(_on_attack)
	EventBus.unit_died.connect(_on_death)
	EventBus.unit_moved.connect(_on_move)
	EventBus.unit_ability_cast.connect(_on_cast)

	# Player: 4 Bengals (2-piece synergy: +20% crit, +25% crit dmg)
	var player_board := {
		"2,5": {"id": "bengal_kitten", "stars": 1},
		"3,5": {"id": "bengal_stalker", "stars": 1},
		"4,5": {"id": "bengal_apex", "stars": 1},
		"3,6": {"id": "bengal_pack_leader", "stars": 1},
	}

	# Enemy: 4 Persians (2-piece synergy: +25 armor, 10 reflect)
	var enemy_board := {
		"2,2": {"id": "persian_pampered", "stars": 1},
		"3,2": {"id": "persian_emperor", "stars": 1},
		"4,2": {"id": "persian_himalayan", "stars": 1},
		"3,1": {"id": "persian_snob", "stars": 1},
	}

	print("\n[setup] 4 Bengals (player) vs 4 Persians (enemy)")
	print("[setup] Bengal synergy: ", GameData.get_synergy_bonuses(player_board))
	print("[setup] Persian synergy: ", GameData.get_synergy_bonuses(enemy_board))
	print("")

	# Run the fight
	var result := CombatSim.run_headless(player_board, enemy_board, true)

	print("")
	print("─────────────────────────────────────────────")
	print("  RESULT: %s in %d ticks (%.2fs)" % [
		result["winner"], result["ticks"], result["ticks"] * CombatSim.TICK_SEC
	])
	print("  Attacks: %d   Casts: %d   Deaths: %d   Moves: %d" % [
		attack_count, cast_count, death_count, move_count
	])
	print("─────────────────────────────────────────────")

	# Quit so it doesn't sit forever
	get_tree().quit()


func _on_spawn(uid: int, unit_id: String, hex_key: String, is_player: bool, stars: int) -> void:
	var side := "P" if is_player else "E"
	print("[spawn] %s uid=%d %s★%d @ %s" % [side, uid, unit_id, stars, hex_key])


func _on_attack(attacker_uid: int, target_uid: int, damage: int, is_crit: bool) -> void:
	attack_count += 1
	if attack_count <= 20 or is_crit:  # Don't spam every attack
		var marker := " CRIT" if is_crit else ""
		print("[atk] %d → %d  %d dmg%s" % [attacker_uid, target_uid, damage, marker])


func _on_death(uid: int) -> void:
	death_count += 1
	print("[die] uid=%d" % uid)


func _on_move(uid: int, from_hex: String, to_hex: String) -> void:
	move_count += 1
	if move_count <= 10:
		print("[mov] uid=%d %s → %s" % [uid, from_hex, to_hex])


func _on_cast(uid: int, ability_name: String) -> void:
	cast_count += 1
	print("[cast] uid=%d casts '%s'" % [uid, ability_name])
