extends Node
## Tick-based combat simulation. Pure logic — emits EventBus signals only.
## View and audio layers subscribe; sim never reaches into them.
## Autoloaded as `CombatSim`.

const Hex = preload("res://scripts/sim/hex.gd")

const TICK_SEC := 0.05            # 50 ms per tick
const MAX_TICKS := 600            # 30 second timeout
const TAUNT_RANGE := 1            # tanks taunt enemies within this hex distance

var combat_timer: Timer
var units: Array = []
var tick_count: int = 0
var _next_uid: int = 0


func _ready() -> void:
	combat_timer = Timer.new()
	combat_timer.wait_time = TICK_SEC
	combat_timer.one_shot = false
	combat_timer.timeout.connect(_tick)
	add_child(combat_timer)


# ═══════════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═══════════════════════════════════════════════════════════════════════════

## Start combat from the current GameState boards.
## Builds an enemy board if none exists yet.
func start_combat() -> void:
	if GameState.combat_state != "idle":
		return

	GameState.pre_combat_board = GameState.player_board.duplicate(true)

	if GameState.enemy_board.is_empty():
		GameState.enemy_board = generate_enemy_board(GameState.current_round)

	# Announce phase change BEFORE spawning so the view layer flips into
	# combat mode and accepts the combat_unit_spawned signals that follow.
	GameState.combat_state = "combat"
	tick_count = 0
	EventBus.combat_started.emit()
	EventBus.banner_requested.emit("FIGHT!", Color(1, 0.3, 0.3))

	_spawn_units(GameState.player_board, GameState.enemy_board)
	_pounce_melee_units(true)

	combat_timer.start()


## Run a hardcoded fight headlessly (used by sim_test scene).
## Returns the result dict: {winner: "player"|"enemy"|"draw", ticks: int, log: Array}
func run_headless(player_board: Dictionary, enemy_board: Dictionary,
		emit_signals: bool = false) -> Dictionary:
	combat_timer.stop()
	GameState.combat_state = "combat"
	GameState.player_board = player_board.duplicate(true)
	GameState.enemy_board = enemy_board.duplicate(true)
	_spawn_units(player_board, enemy_board, emit_signals)
	_pounce_melee_units(emit_signals)

	tick_count = 0
	var log: Array = []
	while tick_count < MAX_TICKS:
		var result := _step(emit_signals)
		if result != "":
			GameState.combat_state = "idle"
			return {"winner": result, "ticks": tick_count, "log": log}
	GameState.combat_state = "idle"
	return {"winner": "timeout", "ticks": tick_count, "log": log}


# ═══════════════════════════════════════════════════════════════════════════
#  ENEMY BOARD GENERATION
# ═══════════════════════════════════════════════════════════════════════════

const ENEMY_FACTIONS := [
	"Alley", "Persian", "Siamese", "MaineCoon",
	"Bengal", "Sphynx", "ScottishFold", "Ragdoll",
]

func generate_enemy_board(round_num: int) -> Dictionary:
	var board: Dictionary = {}
	var num_units := clampi(round_num + 1, 2, 8)
	var level := clampi(round_num, 1, 8)

	# Pick a faction theme so the AI board has at least one synergy active.
	# Round-2+ commits to a primary faction; deeper rounds also splash a
	# secondary so boards look like real player builds.
	var primary: String = ENEMY_FACTIONS[randi() % ENEMY_FACTIONS.size()]
	var secondary: String = ENEMY_FACTIONS[randi() % ENEMY_FACTIONS.size()]
	var theme_chance: float = 0.0 if round_num <= 1 else 0.7
	var splash_chance: float = 0.25 if round_num >= 4 else 0.0

	for i in num_units:
		var unit_id: String
		var roll := randf()
		if roll < theme_chance - splash_chance:
			unit_id = GameData.roll_unit_in_faction(primary, level)
		elif roll < theme_chance:
			unit_id = GameData.roll_unit_in_faction(secondary, level)
		else:
			unit_id = GameData.roll_shop_unit(level)

		var stars := 1
		if round_num >= 4 and randf() < 0.3:
			stars = 2
		if round_num >= 8 and randf() < 0.15:
			stars = 3

		for _attempt in 20:
			var col := randi_range(0, Hex.COLS - 1)
			var row: int = Hex.ENEMY_ROWS[randi_range(0, Hex.ENEMY_ROWS.size() - 1)]
			var key := Hex.key(col, row)
			if not board.has(key):
				board[key] = {"id": unit_id, "stars": stars}
				break
	return board


# ═══════════════════════════════════════════════════════════════════════════
#  SETUP
# ═══════════════════════════════════════════════════════════════════════════

func _spawn_units(player_board: Dictionary, enemy_board: Dictionary,
		emit_signals: bool = true) -> void:
	units.clear()
	_next_uid = 0
	var player_synergies := GameData.get_synergy_bonuses(player_board)
	var enemy_synergies := GameData.get_synergy_bonuses(enemy_board)
	GameState.active_combat_synergies = player_synergies

	for hex_key in player_board:
		var u = player_board[hex_key]
		_spawn_one(u, hex_key, true, player_synergies, emit_signals)
	for hex_key in enemy_board:
		var u = enemy_board[hex_key]
		_spawn_one(u, hex_key, false, enemy_synergies, emit_signals)

	GameState.combat_units = units


func _spawn_one(unit_entry, hex_key: String, is_player: bool,
		synergies: Dictionary, emit_signals: bool) -> void:
	var unit_id: String = unit_entry.id if unit_entry is Dictionary else unit_entry
	var stars: int = unit_entry.stars if unit_entry is Dictionary else 1
	var cu := GameData.create_combat_unit(unit_id, hex_key, is_player, synergies, stars)
	if cu.is_empty():
		return
	cu["uid"] = _next_uid
	_next_uid += 1
	units.append(cu)
	if emit_signals:
		EventBus.combat_unit_spawned.emit(
			cu["uid"], unit_id, hex_key, is_player, stars)


# ═══════════════════════════════════════════════════════════════════════════
#  TICK LOOP
# ═══════════════════════════════════════════════════════════════════════════

func _tick() -> void:
	var result := _step(true)
	if result != "":
		_end_combat(result == "player")


## One simulation step. Returns "" while combat continues, otherwise
## "player" / "enemy" / "draw".
func _step(emit_signals: bool) -> String:
	tick_count += 1
	var current_time := tick_count * TICK_SEC

	for unit in units:
		if unit.hp <= 0:
			continue

		_process_status_effects(unit)
		if _has_status(unit, "stun"):
			continue

		var target = _find_target(unit)
		if target == null:
			continue

		var dist := Hex.distance(unit.hex_key, target.hex_key)
		if dist <= unit.range:
			if current_time - unit.last_action_time >= unit.action_cooldown:
				_process_attack(unit, target, current_time, emit_signals)
			# Ranged kite: step back when something is closer than preferred distance.
			# Independent of action_cooldown so the unit can shoot AND retreat.
			if unit.role == GameData.RANGED and unit.range >= 2:
				if _min_enemy_dist(unit, unit.hex_key) < unit.range:
					if current_time - unit.last_move_time >= unit.move_cooldown:
						var kite_hex := _find_kite_hex(unit)
						if kite_hex != "":
							var old_hex: String = unit.hex_key
							unit.hex_key = kite_hex
							unit.last_move_time = current_time
							if emit_signals:
								EventBus.unit_moved.emit(unit.uid, old_hex, kite_hex)
		else:
			if current_time - unit.last_move_time >= unit.move_cooldown:
				var new_hex := _find_move_toward(unit, target)
				if new_hex != "":
					var old_hex: String = unit.hex_key
					unit.hex_key = new_hex
					unit.last_move_time = current_time
					if emit_signals:
						EventBus.unit_moved.emit(unit.uid, old_hex, new_hex)

	# Win/loss
	var player_alive := units.filter(func(u): return u.is_player and u.hp > 0)
	var enemy_alive := units.filter(func(u): return not u.is_player and u.hp > 0)
	if player_alive.is_empty() and enemy_alive.is_empty():
		return "draw"
	if player_alive.is_empty():
		return "enemy"
	if enemy_alive.is_empty():
		return "player"
	if tick_count >= MAX_TICKS:
		return "enemy" if player_alive.size() < enemy_alive.size() else "player"
	return ""


# ═══════════════════════════════════════════════════════════════════════════
#  ATTACKS
# ═══════════════════════════════════════════════════════════════════════════

func _process_attack(attacker: Dictionary, target: Dictionary,
		current_time: float, emit_signals: bool) -> void:
	attacker.last_action_time = current_time
	var damage: int = attacker.attack
	var is_crit := false

	if attacker.crit_chance > 0 and randf() * 100.0 < attacker.crit_chance:
		var mult: float = max(150.0, attacker.crit_damage) / 100.0
		damage = int(damage * mult)
		is_crit = true

	if attacker.execute_threshold > 0:
		var pct := float(target.hp) / float(target.max_hp) * 100.0
		if pct < attacker.execute_threshold:
			damage = target.hp + 1

	# Armor
	var effective_armor: int = target.armor
	for fx in target.status_effects:
		if fx.type == "armor_shred":
			effective_armor -= int(fx.value)
	effective_armor = maxi(effective_armor, 0)
	damage -= effective_armor

	# Damage reduction
	var dr: int = target.get("damage_reduction", 0)
	if dr > 0:
		damage = int(damage * (100 - dr) / 100.0)
	damage = maxi(damage, 1)

	target.hp -= damage

	# Lifesteal
	if attacker.lifesteal > 0:
		var heal := int(damage * attacker.lifesteal / 100.0)
		attacker.hp = mini(attacker.hp + heal, attacker.max_hp)
		if emit_signals:
			EventBus.unit_healed.emit(attacker.uid, heal)

	# Poison on hit
	if attacker.poison_on_hit > 0:
		_add_status(target, "poison", float(attacker.poison_on_hit), 3.0, emit_signals)

	# Mana gain
	attacker.mana = mini(attacker.mana + 10, attacker.max_mana)
	target.mana = mini(target.mana + 5, target.max_mana)

	if emit_signals:
		EventBus.unit_attacked.emit(attacker.uid, target.uid, damage, is_crit)
		EventBus.unit_damaged.emit(target.uid, target.hp, target.max_hp)

	# Cast check
	if attacker.mana >= attacker.max_mana and not attacker.has_cast:
		_cast_ability(attacker, current_time, emit_signals)

	# Death
	if target.hp <= 0:
		target.hp = 0
		if emit_signals:
			EventBus.unit_died.emit(target.uid)


# ═══════════════════════════════════════════════════════════════════════════
#  ABILITIES
# ═══════════════════════════════════════════════════════════════════════════

func _cast_ability(unit: Dictionary, _current_time: float, emit_signals: bool) -> void:
	var ability: Dictionary = unit.get("ability", {})
	if ability.is_empty():
		return
	var trigger: String = ability.get("trigger", "")
	if trigger == "passive":
		return  # Passives applied at spawn (or on-hit elsewhere)

	var effect: Dictionary = ability.get("effect", {})
	unit.mana = 0
	unit.has_cast = true

	if emit_signals:
		EventBus.unit_ability_cast.emit(unit.uid, ability.get("name", ""))

	# AOE damage
	if effect.has("aoe_damage_mult"):
		var mult: float = effect.aoe_damage_mult
		var radius: int = effect.get("radius", 1)
		var targets := _units_in_range(unit.hex_key, radius, not unit.is_player)
		for t in targets:
			var dmg := maxi(int(unit.attack * mult) - int(t.armor), 1)
			t.hp -= dmg
			if emit_signals:
				EventBus.unit_damaged.emit(t.uid, t.hp, t.max_hp)
			if t.hp <= 0:
				t.hp = 0
				if emit_signals:
					EventBus.unit_died.emit(t.uid)

	# Single-target damage mult
	if effect.has("damage_mult") and not effect.has("aoe_damage_mult"):
		var target = _find_target(unit)
		if target:
			var dmg := maxi(int(unit.attack * effect.damage_mult) - int(target.armor), 1)
			target.hp -= dmg
			if emit_signals:
				EventBus.unit_damaged.emit(target.uid, target.hp, target.max_hp)
			if target.hp <= 0:
				target.hp = 0
				if emit_signals:
					EventBus.unit_died.emit(target.uid)

	# Ally heal
	if effect.has("ally_heal"):
		var heal_pct: float = effect.ally_heal
		for ally in _allies(unit):
			var heal := int(ally.max_hp * heal_pct / 100.0)
			ally.hp = mini(ally.hp + heal, ally.max_hp)
			if emit_signals:
				EventBus.unit_healed.emit(ally.uid, heal)

	# Ally shield (overheal)
	if effect.has("ally_shield"):
		var shield_val: int = effect.ally_shield
		for ally in _allies(unit):
			ally.hp = mini(ally.hp + shield_val, ally.max_hp + shield_val)

	# Single-target stun
	if effect.has("stun"):
		var target = _find_target(unit)
		if target:
			_add_status(target, "stun", 0.0, float(effect.stun), emit_signals)

	# AOE stun
	if effect.has("aoe_stun"):
		var stun_data = effect.aoe_stun
		var radius := 1
		var duration := 1.0
		if stun_data is Dictionary:
			radius = stun_data.get("radius", 1)
			duration = stun_data.get("duration", 1.0)
		else:
			duration = float(stun_data)
		for t in _units_in_range(unit.hex_key, radius, not unit.is_player):
			_add_status(t, "stun", 0.0, duration, emit_signals)


# ═══════════════════════════════════════════════════════════════════════════
#  STATUS EFFECTS
# ═══════════════════════════════════════════════════════════════════════════

func _process_status_effects(unit: Dictionary) -> void:
	var to_remove: Array[int] = []
	for i in unit.status_effects.size():
		var fx: Dictionary = unit.status_effects[i]
		if fx.type == "poison":
			unit.hp -= int(fx.value * TICK_SEC)
			if unit.hp <= 0:
				unit.hp = 0
		elif fx.type == "slow":
			unit.speed = unit.base_speed * (1.0 - fx.value / 100.0)
		fx.duration -= TICK_SEC
		if fx.duration <= 0:
			to_remove.append(i)
			if fx.type == "slow":
				unit.speed = unit.base_speed
	to_remove.reverse()
	for idx in to_remove:
		unit.status_effects.remove_at(idx)


func _has_status(unit: Dictionary, status_type: String) -> bool:
	for fx in unit.status_effects:
		if fx.type == status_type:
			return true
	return false


func _add_status(unit: Dictionary, fx_type: String, value: float,
		duration: float, emit_signals: bool) -> void:
	for fx in unit.status_effects:
		if fx.type == fx_type:
			fx.duration = maxf(fx.duration, duration)
			fx.value = maxf(fx.value, value)
			return
	unit.status_effects.append({"type": fx_type, "value": value, "duration": duration})
	if emit_signals:
		EventBus.status_applied.emit(unit.uid, fx_type, duration)


# ═══════════════════════════════════════════════════════════════════════════
#  PATHFINDING / TARGETING
# ═══════════════════════════════════════════════════════════════════════════

func _find_move_toward(unit: Dictionary, target: Dictionary) -> String:
	var occupied: Dictionary = {}
	for u in units:
		if u.hp > 0 and u.uid != unit.uid:
			occupied[u.hex_key] = true

	var current_dist := Hex.distance(unit.hex_key, target.hex_key)
	var best_hex := ""
	var best_dist := current_dist

	for hex in Hex.neighbors(unit.hex_key):
		if occupied.has(hex):
			continue
		var d := Hex.distance(hex, target.hex_key)
		if d < best_dist:
			best_dist = d
			best_hex = hex
	return best_hex


func _find_nearest_enemy(unit: Dictionary):
	var best = null
	var best_dist := 999
	for other in units:
		if other.hp <= 0 or other.is_player == unit.is_player:
			continue
		var d := Hex.distance(unit.hex_key, other.hex_key)
		if d < best_dist:
			best_dist = d
			best = other
	return best


## Taunt-aware target picker. An enemy tank within TAUNT_RANGE overrides the
## normal nearest pick — distant attackers ignore the taunt.
func _find_target(unit: Dictionary):
	var taunter = null
	var taunter_dist := 999
	for other in units:
		if other.hp <= 0 or other.is_player == unit.is_player:
			continue
		if other.role != GameData.TANK:
			continue
		var d := Hex.distance(unit.hex_key, other.hex_key)
		if d <= TAUNT_RANGE and d < taunter_dist:
			taunter = other
			taunter_dist = d
	if taunter != null:
		return taunter
	return _find_nearest_enemy(unit)


## Smallest hex distance from `from_hex` to any living enemy of `unit`.
func _min_enemy_dist(unit: Dictionary, from_hex: String) -> int:
	var best := 999
	for other in units:
		if other.hp <= 0 or other.is_player == unit.is_player:
			continue
		var d := Hex.distance(from_hex, other.hex_key)
		if d < best:
			best = d
	return best


## Pick a neighbor hex that increases the minimum distance to any enemy
## while still keeping at least one enemy in attack range. Returns "" if
## no improvement is possible.
func _find_kite_hex(unit: Dictionary) -> String:
	var occupied: Dictionary = {}
	for u in units:
		if u.hp > 0 and u.uid != unit.uid:
			occupied[u.hex_key] = true

	var current_min := _min_enemy_dist(unit, unit.hex_key)
	var best_hex := ""
	var best_min := current_min

	for hex in Hex.neighbors(unit.hex_key):
		if occupied.has(hex):
			continue
		var min_d := _min_enemy_dist(unit, hex)
		if min_d <= best_min:
			continue
		var has_target := false
		for other in units:
			if other.hp <= 0 or other.is_player == unit.is_player:
				continue
			if Hex.distance(hex, other.hex_key) <= unit.range:
				has_target = true
				break
		if not has_target:
			continue
		best_min = min_d
		best_hex = hex
	return best_hex


## Run once at combat start: each melee unit leaps to a free hex adjacent
## to its nearest enemy. Processed in spawn order so claims are stable.
func _pounce_melee_units(emit_signals: bool) -> void:
	var occupied: Dictionary = {}
	for u in units:
		occupied[u.hex_key] = u.uid

	for unit in units:
		if unit.role != GameData.MELEE:
			continue
		var target = _find_nearest_enemy(unit)
		if target == null:
			continue
		if Hex.distance(unit.hex_key, target.hex_key) <= 1:
			continue

		var best_hex := ""
		var best_back_dist := 999
		for hex in Hex.neighbors(target.hex_key):
			if occupied.has(hex):
				continue
			var d := Hex.distance(unit.hex_key, hex)
			if d < best_back_dist:
				best_back_dist = d
				best_hex = hex

		if best_hex != "":
			var old_hex: String = unit.hex_key
			occupied.erase(old_hex)
			occupied[best_hex] = unit.uid
			unit.hex_key = best_hex
			if emit_signals:
				EventBus.unit_moved.emit(unit.uid, old_hex, best_hex)


func _units_in_range(hex_key: String, radius: int, target_enemies: bool) -> Array:
	var out: Array = []
	for u in units:
		if u.hp <= 0:
			continue
		if target_enemies and u.is_player:
			continue
		if not target_enemies and not u.is_player:
			continue
		if Hex.distance(hex_key, u.hex_key) <= radius:
			out.append(u)
	return out


func _allies(unit: Dictionary) -> Array:
	var out: Array = []
	for other in units:
		if other.hp > 0 and other.is_player == unit.is_player:
			out.append(other)
	return out


# ═══════════════════════════════════════════════════════════════════════════
#  RESOLUTION
# ═══════════════════════════════════════════════════════════════════════════

func _end_combat(player_won: bool) -> void:
	combat_timer.stop()
	GameState.combat_state = "idle"

	# Streak update happens *before* income calc so the bonus for this round
	# reflects the freshly extended streak (e.g. winning the 3rd in a row pays
	# the +2 immediately, not next round).
	if player_won:
		GameState.win_streak += 1
		GameState.loss_streak = 0
	else:
		GameState.loss_streak += 1
		GameState.win_streak = 0

	var interest: int = GameState.get_interest_gold()
	var streak_bonus: int = GameState.get_streak_bonus_gold()

	if player_won:
		var base_reward: int = 5 + GameState.current_round
		var total: int = base_reward + interest + streak_bonus
		GameState.gold += total
		var msg := "VICTORY! +%d gold" % total
		if streak_bonus > 0:
			msg = "VICTORY! +%d (W%d streak +%d)" % [total, GameState.win_streak, streak_bonus]
		EventBus.banner_requested.emit(msg, Color(0.3, 1, 0.5))
	else:
		var surviving := units.filter(func(u): return not u.is_player and u.hp > 0)
		var damage := 0
		for u in surviving:
			var udata: Dictionary = GameData.units_data.get(u.id, {})
			damage += udata.get("cost", 1)
		damage = maxi(damage, 2)
		GameState.health -= damage
		var base_reward: int = 3 + GameState.current_round
		var total: int = base_reward + interest + streak_bonus
		GameState.gold += total
		EventBus.health_changed.emit(GameState.health)
		var msg := "DEFEAT! -%d HP" % damage
		if streak_bonus > 0:
			msg = "DEFEAT! -%d HP (L%d streak +%d)" % [damage, GameState.loss_streak, streak_bonus]
		EventBus.banner_requested.emit(msg, Color(1, 0.3, 0.3))

	GameState.player_board = GameState.pre_combat_board.duplicate(true)
	GameState.enemy_board.clear()
	GameState.combat_units.clear()
	units.clear()

	GameState.current_round += 1
	EventBus.gold_changed.emit(GameState.gold)
	EventBus.round_changed.emit(GameState.current_round)
	EventBus.streak_changed.emit(GameState.win_streak, GameState.loss_streak)
	GameState.roll_initial_shop()
	EventBus.combat_ended.emit(player_won)

	if GameState.health <= 0:
		EventBus.game_over.emit(8)
		EventBus.banner_requested.emit("GAME OVER", Color(1, 0.2, 0.2))
