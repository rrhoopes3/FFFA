extends Node
## Central signal hub. Sim emits, view & audio listen. No imports either way.

# ─── Combat ─────────────────────────────────────────────────────────────────
signal combat_started
signal combat_ended(player_won: bool)
signal combat_unit_spawned(uid: int, unit_id: String, hex_key: String, is_player: bool, stars: int)
signal unit_attacked(attacker_uid: int, target_uid: int, damage: int, is_crit: bool)
signal unit_damaged(uid: int, hp: int, max_hp: int)
signal unit_healed(uid: int, amount: int)
signal unit_died(uid: int)
signal unit_moved(uid: int, from_hex: String, to_hex: String)
signal unit_ability_cast(uid: int, ability_name: String)
signal status_applied(uid: int, status_type: String, duration: float)

# ─── Shop / Bench / Board ───────────────────────────────────────────────────
signal shop_refreshed
signal unit_bought(unit_id: String, slot: int)
signal unit_sold(unit_id: String, source: String)
signal unit_placed(unit_id: String, hex_key: String)
signal unit_removed(unit_id: String, hex_key: String)
signal units_swapped(hex_a: String, hex_b: String)
signal unit_merged(unit_id: String, new_stars: int)

# ─── Player state ───────────────────────────────────────────────────────────
signal gold_changed(new_gold: int)
signal health_changed(new_health: int)
signal level_changed(new_level: int)
signal round_changed(new_round: int)
signal synergies_updated(synergy_data: Dictionary)

# ─── Game flow ──────────────────────────────────────────────────────────────
signal game_started(mode: String)
signal round_started(round_num: int)
signal round_ended(round_num: int)
signal game_over(placement: int)
signal banner_requested(text: String, color: Color)

# ─── Drag / UI ──────────────────────────────────────────────────────────────
signal tooltip_requested(unit_data: Dictionary, screen_pos: Vector2)
signal tooltip_hidden
signal drag_started(unit_data: Dictionary, source: String)
signal drag_ended(unit_data: Dictionary, target: String)
