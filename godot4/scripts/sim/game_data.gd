extends Node
## Static unit / faction / synergy data and helpers. Pure logic, no rendering.
## Autoloaded as `GameData`.

# ─── Roles ──────────────────────────────────────────────────────────────────
const TANK := "Tank"
const RANGED := "Ranged"
const MELEE := "Melee"

# ─── Tank role bonuses ──────────────────────────────────────────────────────
const TANK_ARMOR_BONUS := 15
const TANK_DAMAGE_REDUCTION := 10

# ─── Star multipliers ───────────────────────────────────────────────────────
const STAR_MULTIPLIERS := {1: 1.0, 2: 1.8, 3: 3.0}

# ─── Mana ───────────────────────────────────────────────────────────────────
const MANA_TO_CAST := 100

# ═══════════════════════════════════════════════════════════════════════════
#  UNIT DEFINITIONS — 48 units, 8 factions × 6 each
# ═══════════════════════════════════════════════════════════════════════════
var units_data: Dictionary = {
	# ===== ALLEY (6) =====
	"alley_tabby_thug": {
		"name": "Tabby Thug", "faction": "Alley", "cost": 1, "color": "#A0AEC1", "role": MELEE,
		"stats": {"hp": 550, "attack": 45, "speed": 0.9, "range": 1},
		"ability": {"name": "Dumpster Dive", "trigger": "passive", "effect": {"gold_on_kill": 1}}
	},
	"alley_ginger_rogue": {
		"name": "Ginger Rogue", "faction": "Alley", "cost": 1, "color": "#A0AEC1", "role": MELEE,
		"stats": {"hp": 500, "attack": 50, "speed": 1.0, "range": 1},
		"ability": {"name": "Alley Ambush", "trigger": "on-attack", "effect": {"crit_chance": 20, "crit_mult": 1.5}}
	},
	"alley_tuxedo_con": {
		"name": "Tuxedo Con", "faction": "Alley", "cost": 2, "color": "#A0AEC1", "role": MELEE,
		"stats": {"hp": 600, "attack": 55, "speed": 1.1, "range": 1},
		"ability": {"name": "Pickpocket", "trigger": "on-attack", "effect": {"gold_steal": 2, "once_per_target": true}}
	},
	"alley_street_yowler": {
		"name": "Street Yowler", "faction": "Alley", "cost": 2, "color": "#A0AEC1", "role": RANGED,
		"stats": {"hp": 550, "attack": 50, "speed": 1.0, "range": 2},
		"ability": {"name": "Territorial Screech", "trigger": "on-cast", "effect": {"aoe_slow": {"radius": 2, "percent": 25}}}
	},
	"alley_dumpster_king": {
		"name": "Dumpster King", "faction": "Alley", "cost": 3, "color": "#A0AEC1", "role": TANK,
		"stats": {"hp": 800, "attack": 65, "speed": 0.9, "range": 1},
		"ability": {"name": "Trash Tornado", "trigger": "on-cast", "effect": {"aoe_damage_mult": 1.5, "gold_drop_chance": 30, "gold_drop": 3}}
	},
	"alley_feral_boss": {
		"name": "Feral Boss", "faction": "Alley", "cost": 5, "color": "#A0AEC1", "role": TANK,
		"stats": {"hp": 1200, "attack": 95, "speed": 1.0, "range": 1},
		"ability": {"name": "Nine Lives", "trigger": "passive", "effect": {"revive_pct": 50, "revive_attack_boost": 30}}
	},

	# ===== PERSIAN (6) =====
	"persian_pampered": {
		"name": "Pampered Prince", "faction": "Persian", "cost": 1, "color": "#F3E5F5", "role": TANK,
		"stats": {"hp": 600, "attack": 40, "speed": 0.7, "range": 1},
		"ability": {"name": "Luxurious Fur", "trigger": "passive", "effect": {"armor": 20}}
	},
	"persian_princess": {
		"name": "Persian Princess", "faction": "Persian", "cost": 2, "color": "#F3E5F5", "role": TANK,
		"stats": {"hp": 650, "attack": 50, "speed": 0.8, "range": 1},
		"ability": {"name": "Hairball Choke", "trigger": "on-attack", "effect": {"attack_speed_slow": 20, "duration": 3}}
	},
	"persian_groomer": {
		"name": "Royal Groomer", "faction": "Persian", "cost": 2, "color": "#F3E5F5", "role": RANGED,
		"stats": {"hp": 700, "attack": 45, "speed": 0.8, "range": 2},
		"ability": {"name": "Healing Licks", "trigger": "on-cast", "effect": {"ally_heal": 15, "duration": 4}}
	},
	"persian_snob": {
		"name": "Aristocat Snob", "faction": "Persian", "cost": 3, "color": "#F3E5F5", "role": TANK,
		"stats": {"hp": 850, "attack": 55, "speed": 0.7, "range": 1},
		"ability": {"name": "Disdainful Glare", "trigger": "on-attack", "effect": {"damage_reduction_enemy": 20, "duration": 3}}
	},
	"persian_himalayan": {
		"name": "Himalayan Heir", "faction": "Persian", "cost": 4, "color": "#F3E5F5", "role": RANGED,
		"stats": {"hp": 1000, "attack": 60, "speed": 0.8, "range": 2},
		"ability": {"name": "Royal Decree", "trigger": "on-cast", "effect": {"ally_shield": 150, "ally_armor": 20, "duration": 5}}
	},
	"persian_emperor": {
		"name": "Persian Emperor", "faction": "Persian", "cost": 5, "color": "#F3E5F5", "role": TANK,
		"stats": {"hp": 1300, "attack": 70, "speed": 0.7, "range": 1},
		"ability": {"name": "Throne of Fluff", "trigger": "passive", "effect": {"ally_hp_amp": 20, "ally_armor": 30}}
	},

	# ===== SIAMESE (6) =====
	"siamese_screamer": {
		"name": "Siamese Screamer", "faction": "Siamese", "cost": 1, "color": "#60A5FA", "role": RANGED,
		"stats": {"hp": 500, "attack": 55, "speed": 1.1, "range": 2},
		"ability": {"name": "Yowl Blast", "trigger": "on-cast", "effect": {"aoe_silence": 2, "radius": 2}}
	},
	"siamese_chatterbox": {
		"name": "Chatterbox", "faction": "Siamese", "cost": 1, "color": "#60A5FA", "role": RANGED,
		"stats": {"hp": 480, "attack": 50, "speed": 1.2, "range": 2},
		"ability": {"name": "Annoying Meow", "trigger": "on-attack", "effect": {"mana_burn": 15}}
	},
	"siamese_soprano": {
		"name": "Soprano Singer", "faction": "Siamese", "cost": 2, "color": "#60A5FA", "role": RANGED,
		"stats": {"hp": 550, "attack": 60, "speed": 1.1, "range": 3},
		"ability": {"name": "High Note", "trigger": "on-cast", "effect": {"damage_mult": 1.8, "stun": 1}}
	},
	"siamese_gossip": {
		"name": "Gossip Queen", "faction": "Siamese", "cost": 3, "color": "#60A5FA", "role": RANGED,
		"stats": {"hp": 650, "attack": 65, "speed": 1.0, "range": 2},
		"ability": {"name": "Spread Rumors", "trigger": "on-attack", "effect": {"ally_attack_amp": 15, "duration": 4}}
	},
	"siamese_opera": {
		"name": "Opera Diva", "faction": "Siamese", "cost": 4, "color": "#60A5FA", "role": RANGED,
		"stats": {"hp": 750, "attack": 80, "speed": 1.1, "range": 3},
		"ability": {"name": "Aria of Doom", "trigger": "on-cast", "effect": {"aoe_damage_mult": 2.0, "aoe_silence": 3}}
	},
	"siamese_conductor": {
		"name": "Choir Conductor", "faction": "Siamese", "cost": 5, "color": "#60A5FA", "role": RANGED,
		"stats": {"hp": 900, "attack": 90, "speed": 1.0, "range": 4},
		"ability": {"name": "Symphony of Chaos", "trigger": "on-cast", "effect": {"ally_speed_amp": 40, "aoe_stun": {"radius": 3, "duration": 2}}}
	},

	# ===== MAINECOON (6) =====
	"mainecoon_cub": {
		"name": "Gentle Giant Cub", "faction": "MaineCoon", "cost": 1, "color": "#92400E", "role": TANK,
		"stats": {"hp": 700, "attack": 40, "speed": 0.8, "range": 1},
		"ability": {"name": "Big Bones", "trigger": "passive", "effect": {"hp_amp": 15}}
	},
	"mainecoon_guardian": {
		"name": "Floofy Guardian", "faction": "MaineCoon", "cost": 2, "color": "#92400E", "role": TANK,
		"stats": {"hp": 800, "attack": 50, "speed": 0.7, "range": 1},
		"ability": {"name": "Fur Shield", "trigger": "passive", "effect": {"armor": 30, "ally_armor": 10}}
	},
	"mainecoon_titan": {
		"name": "Maine Coon Titan", "faction": "MaineCoon", "cost": 3, "color": "#92400E", "role": TANK,
		"stats": {"hp": 900, "attack": 60, "speed": 0.8, "range": 1},
		"ability": {"name": "Paw Crush", "trigger": "on-attack", "effect": {"aoe_stun": 1, "radius": 1}}
	},
	"mainecoon_brawler": {
		"name": "Forest Brawler", "faction": "MaineCoon", "cost": 3, "color": "#92400E", "role": MELEE,
		"stats": {"hp": 950, "attack": 70, "speed": 0.9, "range": 1},
		"ability": {"name": "Mighty Swipe", "trigger": "on-cast", "effect": {"damage_mult": 2.0, "knockback": true}}
	},
	"mainecoon_elder": {
		"name": "Clan Elder", "faction": "MaineCoon", "cost": 4, "color": "#92400E", "role": RANGED,
		"stats": {"hp": 1100, "attack": 65, "speed": 0.7, "range": 2},
		"ability": {"name": "Ancient Wisdom", "trigger": "passive", "effect": {"ally_hp_amp": 15, "ally_damage_reduction": 15}}
	},
	"mainecoon_alpha": {
		"name": "Alpha Floof", "faction": "MaineCoon", "cost": 5, "color": "#92400E", "role": TANK,
		"stats": {"hp": 1400, "attack": 85, "speed": 0.8, "range": 1},
		"ability": {"name": "Earthquake Stomp", "trigger": "on-cast", "effect": {"aoe_damage_mult": 2.5, "aoe_stun": {"radius": 2, "duration": 2}}}
	},

	# ===== BENGAL (6) =====
	"bengal_kitten": {
		"name": "Wild Kitten", "faction": "Bengal", "cost": 1, "color": "#F59E0B", "role": MELEE,
		"stats": {"hp": 500, "attack": 55, "speed": 1.3, "range": 1},
		"ability": {"name": "Playful Strike", "trigger": "on-attack", "effect": {"crit_chance": 25}}
	},
	"bengal_stalker": {
		"name": "Bengal Stalker", "faction": "Bengal", "cost": 2, "color": "#F59E0B", "role": RANGED,
		"stats": {"hp": 600, "attack": 65, "speed": 1.2, "range": 2},
		"ability": {"name": "Pounce Ambush", "trigger": "on-attack", "effect": {"first_hit_damage_mult": 1.5}}
	},
	"bengal_hunter": {
		"name": "Jungle Hunter", "faction": "Bengal", "cost": 2, "color": "#F59E0B", "role": RANGED,
		"stats": {"hp": 550, "attack": 70, "speed": 1.2, "range": 3},
		"ability": {"name": "Prey Mark", "trigger": "on-attack", "effect": {"vuln_debuff": 20, "duration": 4}}
	},
	"bengal_assassin": {
		"name": "Shadow Assassin", "faction": "Bengal", "cost": 3, "color": "#F59E0B", "role": MELEE,
		"stats": {"hp": 650, "attack": 85, "speed": 1.4, "range": 1},
		"ability": {"name": "Backstab", "trigger": "on-cast", "effect": {"blink_backline": true, "damage_mult": 2.5}}
	},
	"bengal_pack_leader": {
		"name": "Pack Leader", "faction": "Bengal", "cost": 4, "color": "#F59E0B", "role": RANGED,
		"stats": {"hp": 850, "attack": 90, "speed": 1.2, "range": 2},
		"ability": {"name": "Coordinated Hunt", "trigger": "on-cast", "effect": {"ally_crit": 25, "ally_attack_speed": 20, "duration": 5}}
	},
	"bengal_apex": {
		"name": "Apex Predator", "faction": "Bengal", "cost": 5, "color": "#F59E0B", "role": MELEE,
		"stats": {"hp": 1000, "attack": 110, "speed": 1.3, "range": 1},
		"ability": {"name": "Killing Blow", "trigger": "on-attack", "effect": {"execute_threshold": 25, "crit_chance": 40}}
	},

	# ===== SPHYNX (6) =====
	"sphynx_creeper": {
		"name": "Creepy Creeper", "faction": "Sphynx", "cost": 1, "color": "#F3A5B6", "role": MELEE,
		"stats": {"hp": 450, "attack": 50, "speed": 1.2, "range": 1},
		"ability": {"name": "Unsettling Gaze", "trigger": "on-attack", "effect": {"attack_speed_slow": 15, "duration": 2}}
	},
	"sphynx_warmer": {
		"name": "Heat Seeker", "faction": "Sphynx", "cost": 2, "color": "#F3A5B6", "role": MELEE,
		"stats": {"hp": 500, "attack": 60, "speed": 1.3, "range": 1},
		"ability": {"name": "Warmth Drain", "trigger": "on-attack", "effect": {"self_heal_on_damage": 20}}
	},
	"sphynx_menace": {
		"name": "Sphynx Menace", "faction": "Sphynx", "cost": 3, "color": "#F3A5B6", "role": MELEE,
		"stats": {"hp": 550, "attack": 70, "speed": 1.1, "range": 1},
		"ability": {"name": "Skin Infection", "trigger": "on-attack", "effect": {"poison": {"damage": 30, "duration": 4}}}
	},
	"sphynx_cultist": {
		"name": "Weird Cultist", "faction": "Sphynx", "cost": 3, "color": "#F3A5B6", "role": RANGED,
		"stats": {"hp": 600, "attack": 75, "speed": 1.1, "range": 2},
		"ability": {"name": "Curse of Baldness", "trigger": "on-cast", "effect": {"armor_shred": 40, "damage_mult": 1.5}}
	},
	"sphynx_oracle": {
		"name": "Naked Oracle", "faction": "Sphynx", "cost": 4, "color": "#F3A5B6", "role": RANGED,
		"stats": {"hp": 700, "attack": 80, "speed": 1.2, "range": 3},
		"ability": {"name": "Eldritch Vision", "trigger": "on-cast", "effect": {"aoe_silence": 3, "aoe_slow": {"radius": 2, "percent": 40}}}
	},
	"sphynx_overlord": {
		"name": "Hairless Overlord", "faction": "Sphynx", "cost": 5, "color": "#F3A5B6", "role": RANGED,
		"stats": {"hp": 900, "attack": 100, "speed": 1.1, "range": 2},
		"ability": {"name": "Plague Touch", "trigger": "on-attack", "effect": {"poison": {"damage": 50, "duration": 5}, "spread_poison": true}}
	},

	# ===== SCOTTISHFOLD (6) =====
	"scottish_lucky": {
		"name": "Lucky Paws", "faction": "ScottishFold", "cost": 1, "color": "#D1D5DB", "role": MELEE,
		"stats": {"hp": 550, "attack": 45, "speed": 1.0, "range": 1},
		"ability": {"name": "Lucky Charm", "trigger": "passive", "effect": {"gold_drop_chance": 20, "gold_drop": 2}}
	},
	"scottish_gambler": {
		"name": "Scottish Gambler", "faction": "ScottishFold", "cost": 2, "color": "#D1D5DB", "role": MELEE,
		"stats": {"hp": 650, "attack": 55, "speed": 1.0, "range": 1},
		"ability": {"name": "Fold Crit", "trigger": "passive", "effect": {"crit_chance": 30, "self_damage_chance": 10}}
	},
	"scottish_dealer": {
		"name": "Card Dealer", "faction": "ScottishFold", "cost": 2, "color": "#D1D5DB", "role": RANGED,
		"stats": {"hp": 600, "attack": 50, "speed": 1.1, "range": 2},
		"ability": {"name": "Wild Card", "trigger": "on-cast", "effect": {"random_buff": true, "random_debuff_enemy": true}}
	},
	"scottish_bettor": {
		"name": "High Roller", "faction": "ScottishFold", "cost": 3, "color": "#D1D5DB", "role": MELEE,
		"stats": {"hp": 700, "attack": 60, "speed": 1.0, "range": 1},
		"ability": {"name": "All In", "trigger": "on-cast", "effect": {"damage_mult": 3.0, "self_damage": 20}}
	},
	"scottish_fortune": {
		"name": "Fortune Teller", "faction": "ScottishFold", "cost": 4, "color": "#D1D5DB", "role": RANGED,
		"stats": {"hp": 800, "attack": 70, "speed": 0.9, "range": 3},
		"ability": {"name": "Twist of Fate", "trigger": "on-cast", "effect": {"crit_chance": 50, "ally_crit": 20, "duration": 5}}
	},
	"scottish_jackpot": {
		"name": "Jackpot King", "faction": "ScottishFold", "cost": 5, "color": "#D1D5DB", "role": RANGED,
		"stats": {"hp": 1000, "attack": 80, "speed": 1.0, "range": 2},
		"ability": {"name": "Jackpot!", "trigger": "on-kill", "effect": {"gold_drop": 10, "ally_heal": 20, "aoe_damage_mult": 2.0}}
	},

	# ===== RAGDOLL (6) =====
	"ragdoll_faker": {
		"name": "Ragdoll Faker", "faction": "Ragdoll", "cost": 1, "color": "#93C5FD", "role": TANK,
		"stats": {"hp": 600, "attack": 40, "speed": 0.9, "range": 1},
		"ability": {"name": "Play Dead", "trigger": "on-low-hp", "effect": {"fake_death": true, "revive_pct": 40, "attack_boost": 50}}
	},
	"ragdoll_lazy": {
		"name": "Lazy Loafer", "faction": "Ragdoll", "cost": 1, "color": "#93C5FD", "role": TANK,
		"stats": {"hp": 650, "attack": 35, "speed": 0.7, "range": 1},
		"ability": {"name": "Nap Time", "trigger": "passive", "effect": {"hp_regen_pct": 3}}
	},
	"ragdoll_flopper": {
		"name": "Master Flopper", "faction": "Ragdoll", "cost": 2, "color": "#93C5FD", "role": TANK,
		"stats": {"hp": 700, "attack": 45, "speed": 0.8, "range": 1},
		"ability": {"name": "Go Limp", "trigger": "on-attack", "effect": {"dodge_chance": 30}}
	},
	"ragdoll_dreamer": {
		"name": "Daydreamer", "faction": "Ragdoll", "cost": 3, "color": "#93C5FD", "role": RANGED,
		"stats": {"hp": 800, "attack": 50, "speed": 0.8, "range": 2},
		"ability": {"name": "Dream Shield", "trigger": "on-cast", "effect": {"ally_shield": 200, "invuln": 1}}
	},
	"ragdoll_therapist": {
		"name": "Cuddle Therapist", "faction": "Ragdoll", "cost": 4, "color": "#93C5FD", "role": RANGED,
		"stats": {"hp": 900, "attack": 55, "speed": 0.8, "range": 2},
		"ability": {"name": "Group Hug", "trigger": "on-cast", "effect": {"ally_heal": 25, "ally_cleanse": true}}
	},
	"ragdoll_zen": {
		"name": "Zen Master", "faction": "Ragdoll", "cost": 5, "color": "#93C5FD", "role": TANK,
		"stats": {"hp": 1100, "attack": 60, "speed": 0.9, "range": 3},
		"ability": {"name": "Inner Peace", "trigger": "passive", "effect": {"ally_hp_regen": 2, "ally_damage_reduction": 20, "revive_ally_chance": 30}}
	},
}

# ─── Computed lookup ────────────────────────────────────────────────────────
var units_by_tier: Dictionary = {}

# ─── Shop odds: level → percent chance for tier 1..5 ────────────────────────
var shop_odds: Dictionary = {
	1: [100, 0, 0, 0, 0],
	2: [75, 25, 0, 0, 0],
	3: [55, 30, 15, 0, 0],
	4: [45, 33, 20, 2, 0],
	5: [35, 35, 25, 5, 0],
	6: [25, 35, 30, 10, 0],
	7: [20, 30, 33, 15, 2],
	8: [15, 25, 35, 20, 5],
}

# ═══════════════════════════════════════════════════════════════════════════
#  FACTION SYNERGIES
# ═══════════════════════════════════════════════════════════════════════════
var faction_synergies: Dictionary = {
	"Alley": {
		"name": "Alley", "color": "#A0AEC1", "thresholds": [2, 4, 6],
		"bonuses": {
			2: {"gold_per_round": 2},
			4: {"gold_per_round": 4, "attack_amp": 15},
			6: {"gold_per_round": 6, "attack_amp": 25, "interest_bonus": 10},
		}
	},
	"Persian": {
		"name": "Persian", "color": "#F3E5F5", "thresholds": [2, 4, 6],
		"bonuses": {
			2: {"armor": 25, "damage_reflect": 10},
			4: {"armor": 45, "damage_reflect": 20, "slow_enemies": 10},
			6: {"armor": 70, "damage_reflect": 30, "slow_enemies": 20, "hp_flat": 200},
		}
	},
	"Siamese": {
		"name": "Siamese", "color": "#60A5FA", "thresholds": [2, 4, 6],
		"bonuses": {
			2: {"attack_speed": 20, "stun_on_cast": 0.5},
			4: {"attack_speed": 35, "stun_on_cast": 1, "armor_shred": 15},
			6: {"attack_speed": 50, "stun_on_cast": 1.5, "armor_shred": 25, "mana_on_hit": 20},
		}
	},
	"MaineCoon": {
		"name": "MaineCoon", "color": "#92400E", "thresholds": [2, 4, 6],
		"bonuses": {
			2: {"hp_amp": 30, "lifesteal": 10},
			4: {"hp_amp": 50, "lifesteal": 20, "aoe_attacks": true},
			6: {"hp_amp": 75, "lifesteal": 30, "aoe_attacks": true, "fear_on_ability": 1},
		}
	},
	"Bengal": {
		"name": "Bengal", "color": "#F59E0B", "thresholds": [2, 4, 6],
		"bonuses": {
			2: {"crit_chance": 20, "crit_damage": 25},
			4: {"crit_chance": 30, "crit_damage": 50, "assassin_leap": true},
			6: {"crit_chance": 40, "crit_damage": 80, "assassin_leap": true, "execute_threshold": 20},
		}
	},
	"Sphynx": {
		"name": "Sphynx", "color": "#F3A5B6", "thresholds": [2, 4, 6],
		"bonuses": {
			2: {"poison_on_hit": 20},
			4: {"poison_on_hit": 35, "disease_spread": true},
			6: {"poison_on_hit": 50, "disease_spread": true, "grievous_wounds": 20},
		}
	},
	"ScottishFold": {
		"name": "ScottishFold", "color": "#D1D5DB", "thresholds": [2, 4, 6],
		"bonuses": {
			2: {"gamble_damage": 25, "gamble_heal": 15},
			4: {"gamble_damage": 35, "gamble_heal": 25, "attack_amp": 15},
			6: {"gamble_damage": 50, "gamble_heal": 100, "triple_gamble": true, "attack_amp": 30},
		}
	},
	"Ragdoll": {
		"name": "Ragdoll", "color": "#93C5FD", "thresholds": [2, 4, 6],
		"bonuses": {
			2: {"dodge": 20, "revive_pct": 20},
			4: {"dodge": 35, "revive_pct": 35, "limp_invuln": 1},
			6: {"dodge": 50, "revive_pct": 50, "limp_invuln": 2, "clone_on_death": true},
		}
	},
}


func _ready() -> void:
	_build_units_by_tier()


func _build_units_by_tier() -> void:
	units_by_tier = {1: [], 2: [], 3: [], 4: [], 5: []}
	for unit_id in units_data:
		var cost: int = units_data[unit_id]["cost"]
		if units_by_tier.has(cost):
			units_by_tier[cost].append(unit_id)


## Roll a random shop unit weighted by player level.
func roll_shop_unit(level: int) -> String:
	var clamped_level := clampi(level, 1, 8)
	var odds: Array = shop_odds[clamped_level]
	var roll := randf() * 100.0
	var cumulative := 0.0
	var tier := 1
	for i in range(odds.size()):
		cumulative += odds[i]
		if roll < cumulative:
			tier = i + 1
			break
	var tier_units: Array = units_by_tier.get(tier, units_by_tier[1])
	if tier_units.is_empty():
		tier_units = units_by_tier[1]
	return tier_units[randi() % tier_units.size()]


## Sell value scales with star level.
func get_sell_value(cost: int, stars: int) -> int:
	if stars == 3:
		return cost * 9
	elif stars == 2:
		return cost * 3
	return cost


## Compute active synergies for a board (hex_key → unit dict).
func get_synergy_bonuses(board: Dictionary) -> Dictionary:
	var faction_counts: Dictionary = {}
	for hex_key in board:
		var unit = board[hex_key]
		if unit == null:
			continue
		var faction := ""
		if unit is Dictionary and unit.has("id"):
			faction = units_data.get(unit["id"], {}).get("faction", "")
		if faction != "":
			faction_counts[faction] = faction_counts.get(faction, 0) + 1

	var bonuses: Dictionary = {}
	for faction_name in faction_counts:
		var count: int = faction_counts[faction_name]
		if not faction_synergies.has(faction_name):
			continue
		var synergy: Dictionary = faction_synergies[faction_name]
		var thresholds: Array = synergy["thresholds"]
		var best_threshold := 0
		for t in thresholds:
			if count >= t:
				best_threshold = t
		if best_threshold > 0:
			bonuses[faction_name] = synergy["bonuses"][best_threshold].duplicate()
	return bonuses


## Build a combat-ready unit dict from a unit_id, applying star scaling,
## tank role bonuses, and (player only) faction synergy bonuses.
func create_combat_unit(unit_id: String, hex_key: String, is_player: bool,
		synergies: Dictionary = {}, stars: int = 1) -> Dictionary:
	var unit_def: Dictionary = units_data.get(unit_id, {})
	if unit_def.is_empty():
		push_warning("GameData.create_combat_unit: unknown unit_id '%s'" % unit_id)
		return {}

	var star_mult: float = STAR_MULTIPLIERS.get(stars, 1.0)
	var base_stats: Dictionary = unit_def["stats"]
	var role: String = unit_def["role"]
	var faction: String = unit_def["faction"]

	var base_hp: float = base_stats["hp"] * star_mult
	var base_attack: float = base_stats["attack"] * star_mult
	var armor := 0
	var damage_reduction := 0
	var crit_chance := 0.0
	var crit_damage := 0.0
	var lifesteal := 0.0
	var poison_on_hit := 0.0
	var execute_threshold := 0.0
	var damage_amp := 0.0

	if role == TANK:
		armor += TANK_ARMOR_BONUS
		damage_reduction += TANK_DAMAGE_REDUCTION

	if is_player and synergies.has(faction):
		var syn: Dictionary = synergies[faction]
		if syn.has("hp_amp"):
			base_hp *= (1.0 + syn["hp_amp"] / 100.0)
		if syn.has("hp_flat"):
			base_hp += syn["hp_flat"]
		if syn.has("armor"):
			armor += int(syn["armor"])
		if syn.has("attack_amp"):
			base_attack *= (1.0 + syn["attack_amp"] / 100.0)
			damage_amp += syn["attack_amp"]
		if syn.has("crit_chance"):
			crit_chance += syn["crit_chance"]
		if syn.has("crit_damage"):
			crit_damage += syn["crit_damage"]
		if syn.has("lifesteal"):
			lifesteal += syn["lifesteal"]
		if syn.has("poison_on_hit"):
			poison_on_hit += syn["poison_on_hit"]
		if syn.has("execute_threshold"):
			execute_threshold += syn["execute_threshold"]

	var max_hp := int(base_hp)
	var speed: float = base_stats["speed"]

	return {
		"id": unit_id,
		"hex_key": hex_key,
		"is_player": is_player,
		"max_hp": max_hp,
		"hp": max_hp,
		"attack": int(base_attack),
		"speed": speed,
		"base_speed": speed,
		"range": base_stats["range"],
		"armor": armor,
		"damage_reduction": damage_reduction,
		"role": role,
		"mana": 0,
		"max_mana": MANA_TO_CAST,
		"faction": faction,
		"ability": unit_def["ability"].duplicate(true),
		"last_action_time": 0.0,
		"last_move_time": 0.0,
		"action_cooldown": 1.0 / speed,
		"move_cooldown": 0.5 / speed,
		"status_effects": [],
		"has_cast": false,
		"has_revived": false,
		"crit_chance": crit_chance,
		"crit_damage": crit_damage,
		"lifesteal": lifesteal,
		"poison_on_hit": poison_on_hit,
		"execute_threshold": execute_threshold,
		"damage_amp": damage_amp,
		"stars": stars,
	}
