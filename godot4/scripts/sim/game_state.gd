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

# ─── Multiplayer (future) ───────────────────────────────────────────────────
var mode: String = "single"
var players: Array = []
var human_index: int = 0

# ─── Constants ──────────────────────────────────────────────────────────────
const LEVEL_COSTS := [0, 5, 10, 20, 36, 56, 80, 100]
const MAX_UNITS_BY_LEVEL := [0, 3, 4, 5, 6, 7, 8, 9, 10]
const BENCH_SIZE := 9
const SHOP_SIZE := 5


func _ready() -> void:
	reset()


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
	EventBus.unit_sold.emit(unit_id, "board")
	return true
