# combat_system.gd — Tick-based combat simulation
# Ported from fffa-combat.js
extends Node

const COMBAT_TICK_SEC := 0.05  # 50ms per tick
const PLAYER_ROWS := [4, 5, 6, 7]
const ENEMY_ROWS := [0, 1, 2, 3]

var combat_timer: Timer
var combat_units: Array = []
var tick_count: int = 0
var particles_vfx: Node2D = null

func _ready() -> void:
	combat_timer = Timer.new()
	combat_timer.wait_time = COMBAT_TICK_SEC
	combat_timer.one_shot = false
	combat_timer.timeout.connect(_combat_tick)
	add_child(combat_timer)
	
	EventBus.combat_ended.connect(_on_combat_ended)

func set_vfx(vfx: Node2D) -> void:
	particles_vfx = vfx

# ── Public API ──

func start_combat() -> void:
	if GameState.combat_state != "idle":
		return
	
	# Save pre-combat board state
	GameState.pre_combat_board = GameState.player_board.duplicate(true)
	
	# Generate enemy board
	GameState.enemy_board = _generate_enemy_board(GameState.current_round)
	
	# Calculate synergies
	var player_synergies := GameData.get_synergy_bonuses(GameState.player_board)
	var enemy_synergies := GameData.get_synergy_bonuses(GameState.enemy_board)
	GameState.active_combat_synergies = player_synergies
	
	# Create combat units
	combat_units.clear()
	var uid := 0
	
	for hex_key in GameState.player_board:
		var unit = GameState.player_board[hex_key]
		var unit_id: String = unit.id if unit is Dictionary else unit
		var stars: int = unit.stars if unit is Dictionary else 1
		var cu := GameData.create_combat_unit(unit_id, hex_key, true, player_synergies, stars)
		if cu.is_empty():
			continue
		cu["uid"] = uid
		cu["stars"] = stars
		uid += 1
		combat_units.append(cu)
	
	for hex_key in GameState.enemy_board:
		var unit = GameState.enemy_board[hex_key]
		var unit_id: String = unit.id if unit is Dictionary else unit
		var stars: int = unit.stars if unit is Dictionary else 1
		var cu := GameData.create_combat_unit(unit_id, hex_key, false, enemy_synergies, stars)
		if cu.is_empty():
			continue
		cu["uid"] = uid
		cu["stars"] = stars
		uid += 1
		combat_units.append(cu)
	
	GameState.combat_units = combat_units
	GameState.combat_state = "combat"
	tick_count = 0
	
	EventBus.combat_started.emit()
	EventBus.banner_requested.emit("FIGHT!", Color(1, 0.3, 0.3))
	SoundManager.play_hiss()
	
	combat_timer.start()

# ── Enemy Generation ──

func _generate_enemy_board(round_num: int) -> Dictionary:
	var board: Dictionary = {}
	var num_units := clampi(round_num + 1, 2, 8)
	var max_tier := clampi(1 + round_num / 2, 1, 5)
	
	for i in num_units:
		var level := clampi(round_num, 1, 8)
		var unit_id := GameData.roll_shop_unit(level)
		var stars := 1
		if round_num >= 4 and randf() < 0.3:
			stars = 2
		if round_num >= 8 and randf() < 0.15:
			stars = 3
		
		# Place in enemy rows (0-3), avoid collisions
		var placed := false
		for _attempt in 20:
			var col := randi_range(0, 6)
			var row: int = ENEMY_ROWS[randi_range(0, 3)]
			var key := "%d,%d" % [col, row]
			if not board.has(key):
				board[key] = {"id": unit_id, "stars": stars}
				placed = true
				break
		if not placed:
			break
	
	return board

# ── Combat Tick ──

func _combat_tick() -> void:
	tick_count += 1
	var current_time := tick_count * COMBAT_TICK_SEC
	
	# Process each living unit
	for unit in combat_units:
		if unit.hp <= 0:
			continue
		
		# Process status effects
		_process_status_effects(unit, current_time)
		
		# Skip turn if stunned
		if _has_status(unit, "stun"):
			continue
		
		# Find target
		var target = _find_nearest_enemy(unit)
		if target == null:
			continue

		var dist: int = GameData.hex_distance(unit.hex_key, target.hex_key)
		
		# In range? Attack
		if dist <= unit.range:
			if current_time - unit.last_action_time >= unit.action_cooldown / 1000.0:
				_process_attack(unit, target, current_time)
		else:
			# Move toward target
			if current_time - unit.last_move_time >= unit.move_cooldown / 1000.0:
				var new_hex := _find_move_toward(unit, target)
				if new_hex != "":
					var old_hex: String = unit.hex_key
					unit.hex_key = new_hex
					unit.last_move_time = current_time
					EventBus.unit_moved.emit(unit.uid, 
						_parse_hex(old_hex), _parse_hex(new_hex))
	
	# Check win/loss
	var player_alive := combat_units.filter(func(u): return u.is_player and u.hp > 0)
	var enemy_alive := combat_units.filter(func(u): return not u.is_player and u.hp > 0)
	
	if player_alive.is_empty() or enemy_alive.is_empty():
		var player_won := not player_alive.is_empty()
		_end_combat(player_won)
	elif tick_count > 600:  # 30 second timeout
		_end_combat(false)

# ── Attack Processing ──

func _process_attack(attacker: Dictionary, target: Dictionary, current_time: float) -> void:
	attacker.last_action_time = current_time
	
	# Base damage
	var damage: int = attacker.attack
	var is_crit := false
	
	# Crit check
	if attacker.crit_chance > 0 and randf() * 100.0 < attacker.crit_chance:
		damage = int(damage * attacker.crit_damage / 100.0)
		is_crit = true
	
	# Execute threshold check
	if attacker.execute_threshold > 0:
		var target_hp_pct := float(target.hp) / float(target.max_hp) * 100.0
		if target_hp_pct < attacker.execute_threshold:
			damage = target.hp + 1  # Lethal
	
	# Apply armor
	var effective_armor: int = target.armor
	for fx in target.status_effects:
		if fx.type == "armor_shred":
			effective_armor -= int(fx.value)
	effective_armor = maxi(effective_armor, 0)
	
	damage -= effective_armor
	var dr = target.get("damage_reduction", 0)
	if dr > 0:
		damage = int(damage * (100 - dr) / 100.0)
	damage = maxi(damage, 1)
	
	# Apply damage
	target.hp -= damage
	
	# Lifesteal
	if attacker.lifesteal > 0:
		var heal := int(damage * attacker.lifesteal / 100.0)
		attacker.hp = mini(attacker.hp + heal, attacker.max_hp)
	
	# Poison on hit
	if attacker.poison_on_hit > 0:
		_add_status_effect(target, "poison", float(attacker.poison_on_hit), 3.0)
	
	# Mana generation
	attacker.mana = mini(attacker.mana + 10, attacker.max_mana)
	target.mana = mini(target.mana + 5, target.max_mana)
	
	# VFX
	if particles_vfx:
		var atk_pos := _hex_to_approx_pos(attacker.hex_key)
		var tgt_pos := _hex_to_approx_pos(target.hex_key)
		particles_vfx.add_attack_line(atk_pos, tgt_pos)
		particles_vfx.add_damage_number(tgt_pos, damage, is_crit)
		particles_vfx.add_attack_pulse(tgt_pos)
	
	EventBus.unit_attacked.emit(attacker.uid, target.uid, damage)
	SoundManager.play_attack_meow()
	
	# Check for ability cast
	if attacker.mana >= attacker.max_mana and not attacker.has_cast:
		_cast_ability(attacker, current_time)
	
	# Check if target died
	if target.hp <= 0:
		target.hp = 0
		EventBus.unit_died.emit(target.uid)
		SoundManager.play_death_meow()
		if particles_vfx:
			particles_vfx.add_death_explosion(_hex_to_approx_pos(target.hex_key))

# ── Ability Casting ──

func _cast_ability(unit: Dictionary, _current_time: float) -> void:
	var ability: Dictionary = unit.get("ability", {})
	if ability.is_empty():
		return
	
	var trigger: String = ability.get("trigger", "")
	if trigger == "passive":
		return  # Passives already applied
	
	var effect: Dictionary = ability.get("effect", {})
	unit.mana = 0
	unit.has_cast = true
	
	EventBus.unit_ability_cast.emit(unit.uid, ability.get("name", ""))
	
	if particles_vfx:
		var unit_pos := _hex_to_approx_pos(unit.hex_key)
		var faction_color := Color.from_string(
			GameData.units_data.get(unit.id, {}).get("color", "#ffffff"), Color.WHITE)
		particles_vfx.add_ability_particles(unit_pos, faction_color, 10)
	
	# AOE damage
	if effect.has("aoe_damage_mult"):
		var mult: float = effect.aoe_damage_mult
		var radius: int = effect.get("radius", 1)
		var targets = _get_units_in_range(unit.hex_key, radius, not unit.is_player)
		for t in targets:
			var dmg: int = int(unit.attack * mult) - int(t.armor)
			dmg = maxi(dmg, 1)
			t.hp -= dmg
			if particles_vfx:
				particles_vfx.add_damage_number(_hex_to_approx_pos(t.hex_key), dmg)
			if t.hp <= 0:
				t.hp = 0
				EventBus.unit_died.emit(t.uid)
	
	# Single target damage mult
	if effect.has("damage_mult") and not effect.has("aoe_damage_mult"):
		var target = _find_nearest_enemy(unit)
		if target:
			var dmg: int = int(unit.attack * effect.damage_mult) - int(target.armor)
			dmg = maxi(dmg, 1)
			target.hp -= dmg
			if particles_vfx:
				particles_vfx.add_damage_number(_hex_to_approx_pos(target.hex_key), dmg)
			if target.hp <= 0:
				target.hp = 0
				EventBus.unit_died.emit(target.uid)
	
	# Healing
	if effect.has("ally_heal"):
		var heal_pct: float = effect.ally_heal
		var allies = _get_allies(unit)
		for ally in allies:
			var heal: int = int(ally.max_hp * heal_pct / 100.0)
			ally.hp = mini(ally.hp + heal, ally.max_hp)
			if particles_vfx:
				particles_vfx.add_heal_number(_hex_to_approx_pos(ally.hex_key), heal)
	
	# Shield
	if effect.has("ally_shield"):
		var shield_val: int = effect.ally_shield
		var allies = _get_allies(unit)
		for ally in allies:
			ally.hp = mini(ally.hp + shield_val, ally.max_hp + shield_val)

	# Stun
	if effect.has("stun"):
		var target = _find_nearest_enemy(unit)
		if target:
			_add_status_effect(target, "stun", 0.0, effect.stun)
	
	# AOE stun
	if effect.has("aoe_stun"):
		var stun_data = effect.aoe_stun
		var radius: int = stun_data.get("radius", 1) if stun_data is Dictionary else 1
		var duration: float = stun_data.get("duration", 1) if stun_data is Dictionary else stun_data
		var targets = _get_units_in_range(unit.hex_key, radius, not unit.is_player)
		for t in targets:
			_add_status_effect(t, "stun", 0.0, duration)

# ── Status Effects ──

func _process_status_effects(unit: Dictionary, current_time: float) -> void:
	var to_remove: Array[int] = []
	for i in unit.status_effects.size():
		var fx: Dictionary = unit.status_effects[i]
		
		# Poison damage
		if fx.type == "poison":
			unit.hp -= int(fx.value * COMBAT_TICK_SEC)
			if unit.hp <= 0:
				unit.hp = 0
				EventBus.unit_died.emit(unit.uid)
		
		# Slow
		if fx.type == "slow":
			unit.speed = unit.base_speed * (1.0 - fx.value / 100.0)
		
		# Decrement duration
		fx.duration -= COMBAT_TICK_SEC
		if fx.duration <= 0:
			to_remove.append(i)
			# Remove slow effect
			if fx.type == "slow":
				unit.speed = unit.base_speed
	
	# Remove expired effects (reverse order)
	to_remove.reverse()
	for idx in to_remove:
		unit.status_effects.remove_at(idx)

func _has_status(unit: Dictionary, status_type: String) -> bool:
	for fx in unit.status_effects:
		if fx.type == status_type:
			return true
	return false

func _add_status_effect(unit: Dictionary, effect_type: String, value: float, duration: float) -> void:
	# Check for existing effect and refresh duration
	for fx in unit.status_effects:
		if fx.type == effect_type:
			fx.duration = maxf(fx.duration, duration)
			fx.value = maxf(fx.value, value)
			return
	unit.status_effects.append({"type": effect_type, "value": value, "duration": duration})

# ── Pathfinding ──

func _find_move_toward(unit: Dictionary, target: Dictionary) -> String:
	var neighbors := _get_hex_neighbors(unit.hex_key)
	var occupied: Dictionary = {}
	for u in combat_units:
		if u.hp > 0 and u.uid != unit.uid:
			occupied[u.hex_key] = true
	
	var current_dist := GameData.hex_distance(unit.hex_key, target.hex_key)
	var best_hex := ""
	var best_dist := current_dist
	var lateral_options: Array[String] = []
	
	for hex in neighbors:
		if occupied.has(hex):
			continue
		var dist := GameData.hex_distance(hex, target.hex_key)
		if dist < best_dist:
			best_dist = dist
			best_hex = hex
			lateral_options.clear()
		elif dist == current_dist and best_hex == "":
			lateral_options.append(hex)
	
	if best_hex != "":
		return best_hex
	if not lateral_options.is_empty():
		return lateral_options[randi_range(0, lateral_options.size() - 1)]
	return ""

func _get_hex_neighbors(hex_key: String) -> Array[String]:
	var parts := hex_key.split(",")
	var col := int(parts[0])
	var row := int(parts[1])
	var is_odd := row & 1
	
	var directions: Array
	if is_odd:
		directions = [[1,0], [1,-1], [0,-1], [-1,0], [0,1], [1,1]]
	else:
		directions = [[1,0], [0,-1], [-1,-1], [-1,0], [-1,1], [0,1]]
	
	var result: Array[String] = []
	for dir in directions:
		var nc: int = col + dir[0]
		var nr: int = row + dir[1]
		if nc >= 0 and nc < 7 and nr >= 0 and nr < 8:
			result.append("%d,%d" % [nc, nr])
	return result

# ── Targeting Helpers ──

func _find_nearest_enemy(unit: Dictionary):
	var best = null
	var best_dist := 999
	for other in combat_units:
		if other.hp <= 0 or other.is_player == unit.is_player:
			continue
		var dist := GameData.hex_distance(unit.hex_key, other.hex_key)
		if dist < best_dist:
			best_dist = dist
			best = other
	return best

func _get_units_in_range(hex_key: String, radius: int, target_enemies: bool) -> Array:
	var result: Array = []
	for unit in combat_units:
		if unit.hp <= 0:
			continue
		if target_enemies and unit.is_player:
			continue
		if not target_enemies and not unit.is_player:
			continue
		if GameData.hex_distance(hex_key, unit.hex_key) <= radius:
			result.append(unit)
	return result

func _get_allies(unit: Dictionary) -> Array:
	var result: Array = []
	for other in combat_units:
		if other.hp > 0 and other.is_player == unit.is_player:
			result.append(other)
	return result

# ── Combat Resolution ──

func _end_combat(player_won: bool) -> void:
	combat_timer.stop()
	GameState.combat_state = "idle"
	
	if player_won:
		# Award gold
		var gold_reward := 5 + GameState.current_round
		GameState.gold += gold_reward
		# Interest (1 gold per 10 saved, max 5)
		var interest := mini(GameState.gold / 10, 5)
		GameState.gold += interest
		EventBus.banner_requested.emit("VICTORY! +%d gold" % (gold_reward + interest), Color(0.3, 1, 0.5))
	else:
		# Take damage based on surviving enemy units
		var surviving := combat_units.filter(func(u): return not u.is_player and u.hp > 0)
		var damage := 0
		for u in surviving:
			var udata = GameData.units_data.get(u.id, {})
			damage += udata.get("cost", 1)
		damage = maxi(damage, 2)
		GameState.health -= damage
		GameState.gold += 3 + GameState.current_round  # Consolation gold
		EventBus.health_changed.emit(GameState.health)
		EventBus.banner_requested.emit("DEFEAT! -%d HP" % damage, Color(1, 0.3, 0.3))
	
	# Restore player board
	GameState.player_board = GameState.pre_combat_board.duplicate(true)
	GameState.enemy_board.clear()
	GameState.combat_units.clear()
	combat_units.clear()
	
	# Advance round
	GameState.current_round += 1
	EventBus.gold_changed.emit(GameState.gold)
	EventBus.round_changed.emit(GameState.current_round)
	
	# Reroll shop for new round
	GameState.roll_initial_shop()
	
	EventBus.combat_ended.emit(player_won)
	
	# Check game over
	if GameState.health <= 0:
		EventBus.game_over.emit(8)
		EventBus.banner_requested.emit("GAME OVER", Color(1, 0.2, 0.2))

func _on_combat_ended(_won: bool) -> void:
	pass

# ── Helpers ──

func _parse_hex(hex_key: String) -> Vector2i:
	var parts := hex_key.split(",")
	return Vector2i(int(parts[0]), int(parts[1]))

func _hex_to_approx_pos(hex_key: String) -> Vector2:
	# Approximate screen position for VFX (requires hex_board reference)
	var parts := hex_key.split(",")
	var col := int(parts[0])
	var row := int(parts[1])
	# Rough pixel estimate based on hex geometry
	var hex_size := 48
	var x := hex_size * sqrt(3.0) * (col + 0.5 * (row & 1)) + 200
	var y := hex_size * 1.5 * row + 100
	return Vector2(x, y)
