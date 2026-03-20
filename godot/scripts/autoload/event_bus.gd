# event_bus.gd — Central signal hub for decoupled cross-system communication
extends Node

# Combat signals
signal combat_started
signal combat_ended(player_won: bool)
signal unit_attacked(attacker_id: int, target_id: int, damage: int)
signal unit_died(unit_id: int)
signal unit_ability_cast(unit_id: int, ability_name: String)
signal unit_moved(unit_id: int, from_hex: Vector2i, to_hex: Vector2i)

# Shop signals
signal shop_refreshed
signal unit_bought(unit_id: String, slot: int)
signal unit_sold(unit_id: String, source: String)

# Board signals
signal unit_placed(unit_id: String, hex: Vector2i)
signal unit_removed(unit_id: String, hex: Vector2i)
signal units_swapped(hex_a: Vector2i, hex_b: Vector2i)
signal unit_merged(unit_id: String, new_stars: int)

# Player state signals
signal gold_changed(new_gold: int)
signal health_changed(new_health: int)
signal level_changed(new_level: int)
signal round_changed(new_round: int)

# Game flow signals
signal game_started(mode: String)
signal round_started(round_num: int)
signal round_ended(round_num: int)
signal game_over(placement: int)

# UI signals
signal tooltip_requested(unit_data: Dictionary, screen_pos: Vector2)
signal tooltip_hidden
signal synergies_updated(synergy_data: Dictionary)
signal banner_requested(text: String, color: Color)

# Drag signals
signal drag_started(unit_data: Dictionary, source: String)
signal drag_ended(unit_data: Dictionary, target: String)
