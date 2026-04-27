extends Node
## Mutable player / round state. Pure logic, no rendering.
## Autoloaded as `GameState`.

# ─── Player ─────────────────────────────────────────────────────────────────
var gold: int = 50
var health: int = 100
var player_level: int = 1
var current_round: int = 1

# ─── Shop / bench / board ───────────────────────────────────────────────────
var shop_units: Array = []                # Array of unit_id String, "" = sold
var player_board: Dictionary = {}         # hex_key → {id: String, stars: int}
var enemy_board: Dictionary = {}
var bench: Array = []                     # Array[9] of {id, stars} or null
var pre_combat_board: Dictionary = {}

# ─── Combat ─────────────────────────────────────────────────────────────────
var combat_state: String = "idle"         # idle | combat | resolution
var combat_units: Array = []
var active_combat_synergies: Dictionary = {}

# ─── Streak (single-player economy) ─────────────────────────────────────────
var win_streak: int = 0
var loss_streak: int = 0

# ─── Multiplayer ────────────────────────────────────────────────────────────
var mode: String = "single"                # "single" | "multiplayer"
var players: Array = []
var human_index: int = 0
var is_multiplayer_round: bool = false     # set by combat_sim.start_combat_against
var mp_opponent_name: String = ""
var mp_pending_result: Dictionary = {}     # populated by RPC, applied on combat_ended
var mp_roster: Array = []                  # last roster snapshot from server

# ─── Constants ──────────────────────────────────────────────────────────────
const LEVEL_COSTS := [0, 5, 10, 20, 36, 56, 80, 100]
const MAX_UNITS_BY_LEVEL := [0, 3, 4, 5, 6, 7, 8, 9, 10]
const BENCH_SIZE := 9
const SHOP_SIZE := 5


func _ready() -> void:
	reset()
	# Multiplayer banner is delayed until the local cinematic finishes so the
	# HP-loss text doesn't spoil the fight.
	EventBus.combat_ended.connect(_on_combat_ended_for_mp_banner)


func _on_combat_ended_for_mp_banner(_player_won: bool) -> void:
	if mp_pending_result.is_empty():
		return
	var won: bool = mp_pending_result.get("won", false)
	var dmg: int = int(mp_pending_result.get("damage", 0))
	if won:
		EventBus.banner_requested.emit(
			"VICTORY! vs %s" % mp_opponent_name, Color(0.3, 1, 0.5))
	else:
		EventBus.banner_requested.emit(
			"DEFEAT! -%d HP" % dmg, Color(1, 0.3, 0.3))
	mp_pending_result = {}


func reset() -> void:
	gold = 50
	health = 100
	player_level = 1
	current_round = 1
	shop_units = []
	player_board = {}
	enemy_board = {}
	bench.clear()
	bench.resize(BENCH_SIZE)
	for i in BENCH_SIZE:
		bench[i] = null
	pre_combat_board = {}
	combat_state = "idle"
	combat_units = []
	win_streak = 0
	loss_streak = 0
	mode = "single"
	players = []


# ─── Board capacity ─────────────────────────────────────────────────────────
func get_max_board_units() -> int:
	return MAX_UNITS_BY_LEVEL[clampi(player_level, 1, 8)]


func get_board_unit_count() -> int:
	return player_board.size()


func can_place_unit() -> bool:
	return get_board_unit_count() < get_max_board_units()


# ─── Level up ───────────────────────────────────────────────────────────────
func get_level_up_cost() -> int:
	if player_level >= 8:
		return -1
	return LEVEL_COSTS[player_level]


func try_level_up() -> bool:
	var cost := get_level_up_cost()
	if cost < 0 or gold < cost:
		return false
	gold -= cost
	player_level += 1
	EventBus.gold_changed.emit(gold)
	EventBus.level_changed.emit(player_level)
	return true


# ─── Shop ───────────────────────────────────────────────────────────────────
func roll_initial_shop() -> void:
	shop_units.clear()
	for i in SHOP_SIZE:
		shop_units.append(GameData.roll_shop_unit(player_level))


func try_reroll() -> bool:
	if gold < 2:
		return false
	gold -= 2
	shop_units.clear()
	for i in SHOP_SIZE:
		shop_units.append(GameData.roll_shop_unit(player_level))
	EventBus.gold_changed.emit(gold)
	EventBus.shop_refreshed.emit()
	return true


func try_buy_unit(shop_index: int) -> bool:
	if shop_index < 0 or shop_index >= shop_units.size():
		return false
	var unit_id: String = shop_units[shop_index]
	if unit_id.is_empty():
		return false
	var unit_data: Dictionary = GameData.units_data.get(unit_id, {})
	if unit_data.is_empty():
		return false
	if gold < unit_data.cost:
		return false
	var bench_slot := -1
	for i in bench.size():
		if bench[i] == null:
			bench_slot = i
			break
	if bench_slot == -1:
		return false
	gold -= unit_data.cost
	bench[bench_slot] = {"id": unit_id, "stars": 1}
	shop_units[shop_index] = ""
	EventBus.gold_changed.emit(gold)
	EventBus.unit_bought.emit(unit_id, shop_index)
	try_merge_all()
	return true


# ─── Selling ────────────────────────────────────────────────────────────────
func sell_unit_from_bench(bench_index: int) -> bool:
	if bench_index < 0 or bench_index >= bench.size():
		return false
	var unit = bench[bench_index]
	if unit == null:
		return false
	var unit_data: Dictionary = GameData.units_data.get(unit.id, {})
	if unit_data.is_empty():
		return false
	gold += GameData.get_sell_value(unit_data.cost, unit.stars)
	bench[bench_index] = null
	EventBus.gold_changed.emit(gold)
	EventBus.unit_sold.emit(unit.id, "bench")
	return true


func sell_unit_from_board(hex_key: String) -> bool:
	if not player_board.has(hex_key):
		return false
	var unit = player_board[hex_key]
	var unit_id: String = unit.id if unit is Dictionary else unit
	var stars: int = unit.stars if unit is Dictionary else 1
	var unit_data: Dictionary = GameData.units_data.get(unit_id, {})
	if unit_data.is_empty():
		return false
	gold += GameData.get_sell_value(unit_data.cost, stars)
	player_board.erase(hex_key)
	EventBus.gold_changed.emit(gold)
	EventBus.unit_removed.emit(unit_id, hex_key)
	EventBus.unit_sold.emit(unit_id, "board")
	_emit_synergies()
	return true


# ─── Placement (bench ↔ board, board ↔ board) ───────────────────────────────

## Move a bench unit onto the player board. If the target hex is occupied,
## swap (the board occupant goes to the same bench slot). Fails if the move
## would exceed the level cap.
func place_unit_from_bench(bench_index: int, hex_key: String) -> bool:
	if bench_index < 0 or bench_index >= bench.size():
		return false
	if bench[bench_index] == null:
		return false
	# Reject moves into the enemy half — only player rows are placeable.
	var parts := hex_key.split(",")
	if parts.size() != 2:
		return false
	var row := int(parts[1])
	if row not in [4, 5, 6, 7]:
		return false

	var bench_unit = bench[bench_index]
	var board_occupant = player_board.get(hex_key, null)

	if board_occupant == null and not can_place_unit():
		# Empty target hex would push us over capacity.
		return false

	bench[bench_index] = board_occupant
	player_board[hex_key] = bench_unit
	EventBus.unit_placed.emit(bench_unit.id, hex_key)
	if board_occupant != null:
		EventBus.unit_removed.emit(board_occupant.id, hex_key)
	try_merge_all()
	_emit_synergies()
	return true


## Move a board unit back to the bench (first empty slot).
func return_unit_to_bench(hex_key: String) -> bool:
	if not player_board.has(hex_key):
		return false
	var unit = player_board[hex_key]
	var slot := -1
	for i in bench.size():
		if bench[i] == null:
			slot = i
			break
	if slot == -1:
		return false
	bench[slot] = unit
	player_board.erase(hex_key)
	EventBus.unit_removed.emit(unit.id, hex_key)
	try_merge_all()
	_emit_synergies()
	return true


## Move or swap units between two board hexes (both player-side).
func swap_or_move_on_board(from_hex: String, to_hex: String) -> bool:
	if from_hex == to_hex:
		return false
	if not player_board.has(from_hex):
		return false
	var src = player_board[from_hex]
	var dst = player_board.get(to_hex, null)
	# Reject moves into enemy rows.
	var parts := to_hex.split(",")
	if parts.size() != 2:
		return false
	var row := int(parts[1])
	if row not in [4, 5, 6, 7]:
		return false
	if dst == null:
		player_board.erase(from_hex)
		player_board[to_hex] = src
		EventBus.unit_removed.emit(src.id, from_hex)
		EventBus.unit_placed.emit(src.id, to_hex)
	else:
		player_board[from_hex] = dst
		player_board[to_hex] = src
		EventBus.units_swapped.emit(from_hex, to_hex)
	return true


# ─── Merge ──────────────────────────────────────────────────────────────────

## Iteratively merge any 3-of-a-kind (same id, same star) into a star+1 unit.
## Searches both bench and board until no more merges happen. Returns the
## list of (unit_id, new_star) tuples that were produced.
func try_merge_all() -> Array:
	var merged: Array = []
	while true:
		var step := _try_one_merge()
		if step.is_empty():
			break
		merged.append(step)
	if not merged.is_empty():
		_emit_synergies()
	return merged


func _try_one_merge() -> Dictionary:
	# Bucket all unit instances by (id, star), recording where each lives.
	# Buckets with ≥3 entries collapse: keep one (board > bench preference),
	# clear the rest, bump its star.
	var buckets: Dictionary = {}
	for i in bench.size():
		var u = bench[i]
		if u == null:
			continue
		var bk: String = "%s|%d" % [u.id, u.stars]
		if not buckets.has(bk):
			buckets[bk] = []
		buckets[bk].append({"loc": "bench", "idx": i})
	for board_hex in player_board:
		var u2 = player_board[board_hex]
		var bk2: String = "%s|%d" % [u2.id, u2.stars]
		if not buckets.has(bk2):
			buckets[bk2] = []
		buckets[bk2].append({"loc": "board", "hex": board_hex})

	for bucket_key in buckets:
		var locs: Array = buckets[bucket_key]
		if locs.size() < 3:
			continue
		var parts: PackedStringArray = (bucket_key as String).split("|")
		var unit_id: String = parts[0]
		var star: int = int(parts[1])
		if star >= 3:
			continue
		# Prefer keeping a board instance so the player's positioning sticks.
		var keep_idx := -1
		for i in locs.size():
			if locs[i]["loc"] == "board":
				keep_idx = i
				break
		if keep_idx == -1:
			keep_idx = 0
		var keep: Dictionary = locs[keep_idx]
		var losers: Array = locs.duplicate()
		losers.remove_at(keep_idx)
		# Pop the two losers.
		for entry in losers.slice(0, 2):
			if entry["loc"] == "bench":
				bench[entry["idx"]] = null
			else:
				var hk: String = entry["hex"]
				EventBus.unit_removed.emit(unit_id, hk)
				player_board.erase(hk)
		# Bump the survivor.
		var new_star: int = star + 1
		if keep["loc"] == "bench":
			bench[keep["idx"]] = {"id": unit_id, "stars": new_star}
		else:
			var hk: String = keep["hex"]
			player_board[hk] = {"id": unit_id, "stars": new_star}
			EventBus.unit_removed.emit(unit_id, hk)  # despawn old view
			EventBus.unit_placed.emit(unit_id, hk)   # respawn at new star
		EventBus.unit_merged.emit(unit_id, new_star)
		return {"id": unit_id, "stars": new_star, "location": keep["loc"]}
	return {}


# ─── Synergy + round flow ───────────────────────────────────────────────────

func get_active_synergies() -> Dictionary:
	return GameData.get_synergy_bonuses(player_board)


func _emit_synergies() -> void:
	EventBus.synergies_updated.emit(get_active_synergies())


## Called by main scene on first launch — primes the shop and seeds the round.
## Also called when the player restarts after game-over.
func start_game() -> void:
	reset()
	roll_initial_shop()
	EventBus.game_started.emit(mode)
	EventBus.gold_changed.emit(gold)
	EventBus.health_changed.emit(health)
	EventBus.level_changed.emit(player_level)
	EventBus.round_changed.emit(current_round)
	EventBus.streak_changed.emit(win_streak, loss_streak)
	EventBus.shop_refreshed.emit()
	_emit_synergies()


# ─── Economy helpers ────────────────────────────────────────────────────────

## Interest income — 1g per 10g held, capped at 5. Mirrors TFT.
func get_interest_gold() -> int:
	return mini(gold / 10, 5)


## Bonus gold from win/loss streak. Either streak counts; the longer it runs,
## the bigger the kicker. Caps at +3 so loss-streaking is risky-but-survivable.
func get_streak_bonus_gold() -> int:
	var s: int = maxi(win_streak, loss_streak)
	if s >= 5: return 3
	if s >= 3: return 2
	if s >= 2: return 1
	return 0


## Projected gold income on the next round-end (assuming the player neither
## wins nor loses; the actual reward layers a base on top in combat_sim).
func get_round_income_preview() -> int:
	# Base shows the smaller of the two (loss=3+round, win=5+round). Use the
	# loss case as a conservative floor so the HUD doesn't over-promise.
	return 3 + current_round + get_interest_gold() + get_streak_bonus_gold()


# ─── Stage label ────────────────────────────────────────────────────────────

## TFT-style "1-3" round notation. Stage 1 is 3 rounds; subsequent stages 4
## rounds each. Purely cosmetic — `current_round` is still the source of truth.
func get_stage_label() -> String:
	if current_round <= 3:
		return "1-%d" % current_round
	var rem := current_round - 3
	var stage := 2 + (rem - 1) / 4
	var sub := ((rem - 1) % 4) + 1
	return "%d-%d" % [stage, sub]


# ─── Multiplayer client handlers ────────────────────────────────────────────
# Called by NetworkManager RPC stubs. The server is authoritative, so these
# largely just mutate local mirrors and emit signals for the UI to react.

func on_remote_placement_phase(round_num: int, server_gold: int) -> void:
	# Round 1 is the "game has started" signal in multiplayer — initialize
	# locally same as `start_game()` would for single-player, but keep mode.
	if round_num == 1 and mode != "multiplayer":
		reset()
	mode = "multiplayer"
	current_round = round_num
	gold = server_gold
	roll_initial_shop()
	EventBus.gold_changed.emit(gold)
	EventBus.health_changed.emit(health)
	EventBus.level_changed.emit(player_level)
	EventBus.round_changed.emit(current_round)
	EventBus.streak_changed.emit(win_streak, loss_streak)
	EventBus.shop_refreshed.emit()
	if round_num == 1:
		EventBus.game_started.emit(mode)


func on_remote_round_start(round_num: int, opponent_name: String,
		opponent_board: Dictionary, _combat_seed: int) -> void:
	current_round = round_num
	mp_opponent_name = opponent_name
	# Trigger the local cinematic. server-authoritative result lands separately.
	CombatSim.start_combat_against(opponent_board, opponent_name)


func on_remote_round_result(player_won: bool, damage_taken: int, new_hp: int) -> void:
	health = new_hp
	if player_won:
		win_streak += 1
		loss_streak = 0
	else:
		loss_streak += 1
		win_streak = 0
	EventBus.health_changed.emit(health)
	EventBus.streak_changed.emit(win_streak, loss_streak)
	# Stash for the banner; the local cinematic will trigger it on its
	# own combat_ended via _on_combat_ended_for_mp_banner.
	mp_pending_result = {
		"won": player_won,
		"damage": damage_taken,
		"hp": new_hp,
	}


func on_remote_game_over(placement: int, _winner_name: String) -> void:
	EventBus.game_over.emit(placement)


func on_remote_roster(roster: Array) -> void:
	mp_roster = roster
	EventBus.mp_roster_updated.emit(roster)
