extends RefCounted
## Per-bot board synthesizer. Each lobby bot owns one of these, keeping a
## fixed faction theme so the AI's roster reads consistently across rounds
## ("the Bengal bot keeps adding more cats" rather than chaotic shuffles).
##
## The board it produces is intentionally similar to single-player's
## `combat_sim.generate_enemy_board`, but with a stable theme and a slot
## offset so two bots don't pick identical hexes.

const Hex = preload("res://scripts/sim/hex.gd")

var faction_theme: String
var slot_index: int
var _rng: RandomNumberGenerator


func _init(faction: String, idx: int) -> void:
	faction_theme = faction
	slot_index = idx
	_rng = RandomNumberGenerator.new()
	_rng.seed = idx * 7919 + 31337   # stable per slot, varies per bot


func generate_board(round_num: int) -> Dictionary:
	var board: Dictionary = {}
	var num_units := clampi(round_num + 1, 2, 8)
	var level := clampi(round_num, 1, 8)

	for i in num_units:
		# 80% on-theme to keep the bot's identity consistent; the rest is
		# random so the board occasionally splashes a counter unit.
		var unit_id: String
		if _rng.randf() < 0.8:
			unit_id = GameData.roll_unit_in_faction(faction_theme, level)
		else:
			unit_id = GameData.roll_shop_unit(level)

		var stars := 1
		if round_num >= 4 and _rng.randf() < 0.30:
			stars = 2
		if round_num >= 8 and _rng.randf() < 0.15:
			stars = 3

		# Place on the enemy half (relative to a player fighting this board).
		# CombatSim treats `enemy_board` as is_player=false in spawn, so any
		# row from ENEMY_ROWS works. Keeping bots on rows 4+ matches the
		# single-player layout.
		for _attempt in 20:
			var col := _rng.randi_range(0, Hex.COLS - 1)
			var row: int = Hex.ENEMY_ROWS[_rng.randi_range(0, Hex.ENEMY_ROWS.size() - 1)]
			var key := Hex.key(col, row)
			if not board.has(key):
				board[key] = {"id": unit_id, "stars": stars}
				break
	return board
