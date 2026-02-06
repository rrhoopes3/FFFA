// ============================================================
//  FFFA — Shared Data & Logic
//  Used by both client (index.html) and server (server.js)
// ============================================================

// Unit roles
const UNIT_ROLES = {
  TANK: 'Tank',
  RANGED: 'Ranged',
  MELEE: 'Melee'
};

// Tank bonus constants
const TANK_ARMOR_BONUS = 15;
const TANK_DAMAGE_REDUCTION = 10;

// Star level multipliers
const STAR_MULTIPLIERS = {
  1: 1.0,
  2: 1.8,
  3: 3.0
};

const MANA_TO_CAST = 100;

// ========== UNIT DATA ==========
const unitsData = {
  // ===== Alley Cats - Scrappy street survivors =====
  'alley_tabby_thug': { name: 'Tabby Thug', faction: 'Alley', coat: 'Spotted', cost: 1, color: '#A0AEC1', icon: '🐈‍⬛', role: 'Melee', stats: {hp: 550, attack: 45, speed: 0.9, range: 1}, ability: {name: 'Dumpster Dive', trigger: 'passive', effect: {gold_on_kill: 1}} },
  'alley_ginger_rogue': { name: 'Ginger Rogue', faction: 'Alley', coat: 'Spotted', cost: 1, color: '#A0AEC1', icon: '🐱', role: 'Melee', stats: {hp: 500, attack: 50, speed: 1.0, range: 1}, ability: {name: 'Alley Ambush', trigger: 'on-attack', effect: {crit_chance: 20, crit_mult: 1.5}} },
  'alley_tuxedo_con': { name: 'Tuxedo Con', faction: 'Alley', coat: 'Spotted', cost: 2, color: '#A0AEC1', icon: '😼', role: 'Melee', stats: {hp: 600, attack: 55, speed: 1.1, range: 1}, ability: {name: 'Pickpocket', trigger: 'on-attack', effect: {gold_steal: 2, once_per_target: true}} },
  'alley_street_yowler': { name: 'Street Yowler', faction: 'Alley', coat: 'Vocal', cost: 2, color: '#A0AEC1', icon: '😾', role: 'Ranged', stats: {hp: 550, attack: 50, speed: 1.0, range: 2}, ability: {name: 'Territorial Screech', trigger: 'on-cast', effect: {aoe_slow: {radius: 2, percent: 25}}} },
  'alley_dumpster_king': { name: 'Dumpster King', faction: 'Alley', coat: 'Spotted', cost: 3, color: '#A0AEC1', icon: '👑', role: 'Tank', stats: {hp: 800, attack: 65, speed: 0.9, range: 1}, ability: {name: 'Trash Tornado', trigger: 'on-cast', effect: {aoe_damage_mult: 1.5, gold_drop_chance: 30, gold_drop: 3}} },
  'alley_feral_boss': { name: 'Feral Boss', faction: 'Alley', coat: 'Spotted', cost: 5, color: '#A0AEC1', icon: '🦴', role: 'Tank', stats: {hp: 1200, attack: 95, speed: 1.0, range: 1}, ability: {name: 'Nine Lives', trigger: 'passive', effect: {revive_pct: 50, revive_attack_boost: 30}} },

  // ===== Persian Royals - Aristocratic fluffballs =====
  'persian_princess': { name: 'Persian Princess', faction: 'Persian', coat: 'Fluffy', cost: 2, color: '#F3E5F5', icon: '😻', role: 'Tank', stats: {hp: 650, attack: 50, speed: 0.8, range: 1}, ability: {name: 'Hairball Choke', trigger: 'on-attack', effect: {attack_speed_slow: 20, duration: 3}} },
  'persian_pampered': { name: 'Pampered Prince', faction: 'Persian', coat: 'Fluffy', cost: 1, color: '#F3E5F5', icon: '🎀', role: 'Tank', stats: {hp: 600, attack: 40, speed: 0.7, range: 1}, ability: {name: 'Luxurious Fur', trigger: 'passive', effect: {armor: 20}} },
  'persian_groomer': { name: 'Royal Groomer', faction: 'Persian', coat: 'Fluffy', cost: 2, color: '#F3E5F5', icon: '✨', role: 'Ranged', stats: {hp: 700, attack: 45, speed: 0.8, range: 2}, ability: {name: 'Healing Licks', trigger: 'on-cast', effect: {ally_heal: 15, duration: 4}} },
  'persian_snob': { name: 'Aristocat Snob', faction: 'Persian', coat: 'Fluffy', cost: 3, color: '#F3E5F5', icon: '🍷', role: 'Tank', stats: {hp: 850, attack: 55, speed: 0.7, range: 1}, ability: {name: 'Disdainful Glare', trigger: 'on-attack', effect: {damage_reduction_enemy: 20, duration: 3}} },
  'persian_himalayan': { name: 'Himalayan Heir', faction: 'Persian', coat: 'Fluffy', cost: 4, color: '#F3E5F5', icon: '👸', role: 'Ranged', stats: {hp: 1000, attack: 60, speed: 0.8, range: 2}, ability: {name: 'Royal Decree', trigger: 'on-cast', effect: {ally_shield: 150, ally_armor: 20, duration: 5}} },
  'persian_emperor': { name: 'Persian Emperor', faction: 'Persian', coat: 'Fluffy', cost: 5, color: '#F3E5F5', icon: '🏰', role: 'Tank', stats: {hp: 1300, attack: 70, speed: 0.7, range: 1}, ability: {name: 'Throne of Fluff', trigger: 'passive', effect: {ally_hp_amp: 20, ally_armor: 30}} },

  // ===== Siamese Yowlers - Vocal and precise =====
  'siamese_screamer': { name: 'Siamese Screamer', faction: 'Siamese', coat: 'Vocal', cost: 1, color: '#60A5FA', icon: '🐱', role: 'Ranged', stats: {hp: 500, attack: 55, speed: 1.1, range: 2}, ability: {name: 'Yowl Blast', trigger: 'on-cast', effect: {aoe_silence: 2, radius: 2}} },
  'siamese_chatterbox': { name: 'Chatterbox', faction: 'Siamese', coat: 'Vocal', cost: 1, color: '#60A5FA', icon: '💬', role: 'Ranged', stats: {hp: 480, attack: 50, speed: 1.2, range: 2}, ability: {name: 'Annoying Meow', trigger: 'on-attack', effect: {mana_burn: 15}} },
  'siamese_soprano': { name: 'Soprano Singer', faction: 'Siamese', coat: 'Vocal', cost: 2, color: '#60A5FA', icon: '🎤', role: 'Ranged', stats: {hp: 550, attack: 60, speed: 1.1, range: 3}, ability: {name: 'High Note', trigger: 'on-cast', effect: {damage_mult: 1.8, stun: 1}} },
  'siamese_gossip': { name: 'Gossip Queen', faction: 'Siamese', coat: 'Vocal', cost: 3, color: '#60A5FA', icon: '👄', role: 'Ranged', stats: {hp: 650, attack: 65, speed: 1.0, range: 2}, ability: {name: 'Spread Rumors', trigger: 'on-attack', effect: {ally_attack_amp: 15, duration: 4}} },
  'siamese_opera': { name: 'Opera Diva', faction: 'Siamese', coat: 'Vocal', cost: 4, color: '#60A5FA', icon: '🎭', role: 'Ranged', stats: {hp: 750, attack: 80, speed: 1.1, range: 3}, ability: {name: 'Aria of Doom', trigger: 'on-cast', effect: {aoe_damage_mult: 2.0, aoe_silence: 3}} },
  'siamese_conductor': { name: 'Choir Conductor', faction: 'Siamese', coat: 'Vocal', cost: 5, color: '#60A5FA', icon: '🎼', role: 'Ranged', stats: {hp: 900, attack: 90, speed: 1.0, range: 4}, ability: {name: 'Symphony of Chaos', trigger: 'on-cast', effect: {ally_speed_amp: 40, aoe_stun: {radius: 3, duration: 2}}} },

  // ===== Maine Coon Giants - Big beefy tanks =====
  'mainecoon_titan': { name: 'Maine Coon Titan', faction: 'MaineCoon', coat: 'Fluffy', cost: 3, color: '#92400E', icon: '🦁', role: 'Tank', stats: {hp: 900, attack: 60, speed: 0.8, range: 1}, ability: {name: 'Paw Crush', trigger: 'on-attack', effect: {aoe_stun: 1, radius: 1}} },
  'mainecoon_cub': { name: 'Gentle Giant Cub', faction: 'MaineCoon', coat: 'Fluffy', cost: 1, color: '#92400E', icon: '🐻', role: 'Tank', stats: {hp: 700, attack: 40, speed: 0.8, range: 1}, ability: {name: 'Big Bones', trigger: 'passive', effect: {hp_amp: 15}} },
  'mainecoon_guardian': { name: 'Floofy Guardian', faction: 'MaineCoon', coat: 'Fluffy', cost: 2, color: '#92400E', icon: '🛡️', role: 'Tank', stats: {hp: 800, attack: 50, speed: 0.7, range: 1}, ability: {name: 'Fur Shield', trigger: 'passive', effect: {armor: 30, ally_armor: 10}} },
  'mainecoon_brawler': { name: 'Forest Brawler', faction: 'MaineCoon', coat: 'Fluffy', cost: 3, color: '#92400E', icon: '💪', role: 'Melee', stats: {hp: 950, attack: 70, speed: 0.9, range: 1}, ability: {name: 'Mighty Swipe', trigger: 'on-cast', effect: {damage_mult: 2.0, knockback: true}} },
  'mainecoon_elder': { name: 'Clan Elder', faction: 'MaineCoon', coat: 'Fluffy', cost: 4, color: '#92400E', icon: '🧙', role: 'Ranged', stats: {hp: 1100, attack: 65, speed: 0.7, range: 2}, ability: {name: 'Ancient Wisdom', trigger: 'passive', effect: {ally_hp_amp: 15, ally_damage_reduction: 15}} },
  'mainecoon_alpha': { name: 'Alpha Floof', faction: 'MaineCoon', coat: 'Fluffy', cost: 5, color: '#92400E', icon: '👑', role: 'Tank', stats: {hp: 1400, attack: 85, speed: 0.8, range: 1}, ability: {name: 'Earthquake Stomp', trigger: 'on-cast', effect: {aoe_damage_mult: 2.5, aoe_stun: {radius: 2, duration: 2}}} },

  // ===== Bengal Predators - Wild hunters =====
  'bengal_stalker': { name: 'Bengal Stalker', faction: 'Bengal', coat: 'Spotted', cost: 2, color: '#F59E0B', icon: '🐆', role: 'Ranged', stats: {hp: 600, attack: 65, speed: 1.2, range: 2}, ability: {name: 'Pounce Ambush', trigger: 'on-attack', effect: {first_hit_damage_mult: 1.5}} },
  'bengal_kitten': { name: 'Wild Kitten', faction: 'Bengal', coat: 'Spotted', cost: 1, color: '#F59E0B', icon: '🐾', role: 'Melee', stats: {hp: 500, attack: 55, speed: 1.3, range: 1}, ability: {name: 'Playful Strike', trigger: 'on-attack', effect: {crit_chance: 25}} },
  'bengal_hunter': { name: 'Jungle Hunter', faction: 'Bengal', coat: 'Spotted', cost: 2, color: '#F59E0B', icon: '🎯', role: 'Ranged', stats: {hp: 550, attack: 70, speed: 1.2, range: 3}, ability: {name: 'Prey Mark', trigger: 'on-attack', effect: {vuln_debuff: 20, duration: 4}} },
  'bengal_assassin': { name: 'Shadow Assassin', faction: 'Bengal', coat: 'Spotted', cost: 3, color: '#F59E0B', icon: '🗡️', role: 'Melee', stats: {hp: 650, attack: 85, speed: 1.4, range: 1}, ability: {name: 'Backstab', trigger: 'on-cast', effect: {blink_backline: true, damage_mult: 2.5}} },
  'bengal_pack_leader': { name: 'Pack Leader', faction: 'Bengal', coat: 'Spotted', cost: 4, color: '#F59E0B', icon: '🐅', role: 'Ranged', stats: {hp: 850, attack: 90, speed: 1.2, range: 2}, ability: {name: 'Coordinated Hunt', trigger: 'on-cast', effect: {ally_crit: 25, ally_attack_speed: 20, duration: 5}} },
  'bengal_apex': { name: 'Apex Predator', faction: 'Bengal', coat: 'Spotted', cost: 5, color: '#F59E0B', icon: '☠️', role: 'Melee', stats: {hp: 1000, attack: 110, speed: 1.3, range: 1}, ability: {name: 'Killing Blow', trigger: 'on-attack', effect: {execute_threshold: 25, crit_chance: 40}} },

  // ===== Sphynx Weirdos - Hairless and strange =====
  'sphynx_menace': { name: 'Sphynx Menace', faction: 'Sphynx', coat: 'Hairless', cost: 3, color: '#F3A5B6', icon: '👽', role: 'Melee', stats: {hp: 550, attack: 70, speed: 1.1, range: 1}, ability: {name: 'Skin Infection', trigger: 'on-attack', effect: {poison: {damage: 30, duration: 4}}} },
  'sphynx_creeper': { name: 'Creepy Creeper', faction: 'Sphynx', coat: 'Hairless', cost: 1, color: '#F3A5B6', icon: '🫥', role: 'Melee', stats: {hp: 450, attack: 50, speed: 1.2, range: 1}, ability: {name: 'Unsettling Gaze', trigger: 'on-attack', effect: {attack_speed_slow: 15, duration: 2}} },
  'sphynx_warmer': { name: 'Heat Seeker', faction: 'Sphynx', coat: 'Hairless', cost: 2, color: '#F3A5B6', icon: '🔥', role: 'Melee', stats: {hp: 500, attack: 60, speed: 1.3, range: 1}, ability: {name: 'Warmth Drain', trigger: 'on-attack', effect: {self_heal_on_damage: 20}} },
  'sphynx_cultist': { name: 'Weird Cultist', faction: 'Sphynx', coat: 'Hairless', cost: 3, color: '#F3A5B6', icon: '🔮', role: 'Ranged', stats: {hp: 600, attack: 75, speed: 1.1, range: 2}, ability: {name: 'Curse of Baldness', trigger: 'on-cast', effect: {armor_shred: 40, damage_mult: 1.5}} },
  'sphynx_oracle': { name: 'Naked Oracle', faction: 'Sphynx', coat: 'Hairless', cost: 4, color: '#F3A5B6', icon: '🌙', role: 'Ranged', stats: {hp: 700, attack: 80, speed: 1.2, range: 3}, ability: {name: 'Eldritch Vision', trigger: 'on-cast', effect: {aoe_silence: 3, aoe_slow: {radius: 2, percent: 40}}} },
  'sphynx_overlord': { name: 'Hairless Overlord', faction: 'Sphynx', coat: 'Hairless', cost: 5, color: '#F3A5B6', icon: '💀', role: 'Ranged', stats: {hp: 900, attack: 100, speed: 1.1, range: 2}, ability: {name: 'Plague Touch', trigger: 'on-attack', effect: {poison: {damage: 50, duration: 5}, spread_poison: true}} },

  // ===== Scottish Folds - Quirky gamblers =====
  'scottish_gambler': { name: 'Scottish Gambler', faction: 'ScottishFold', coat: 'Fluffy', cost: 2, color: '#D1D5DB', icon: '🙀', role: 'Melee', stats: {hp: 650, attack: 55, speed: 1.0, range: 1}, ability: {name: 'Fold Crit', trigger: 'passive', effect: {crit_chance: 30, self_damage_chance: 10}} },
  'scottish_lucky': { name: 'Lucky Paws', faction: 'ScottishFold', coat: 'Fluffy', cost: 1, color: '#D1D5DB', icon: '🍀', role: 'Melee', stats: {hp: 550, attack: 45, speed: 1.0, range: 1}, ability: {name: 'Lucky Charm', trigger: 'passive', effect: {gold_drop_chance: 20, gold_drop: 2}} },
  'scottish_dealer': { name: 'Card Dealer', faction: 'ScottishFold', coat: 'Fluffy', cost: 2, color: '#D1D5DB', icon: '🃏', role: 'Ranged', stats: {hp: 600, attack: 50, speed: 1.1, range: 2}, ability: {name: 'Wild Card', trigger: 'on-cast', effect: {random_buff: true, random_debuff_enemy: true}} },
  'scottish_bettor': { name: 'High Roller', faction: 'ScottishFold', coat: 'Fluffy', cost: 3, color: '#D1D5DB', icon: '🎰', role: 'Melee', stats: {hp: 700, attack: 60, speed: 1.0, range: 1}, ability: {name: 'All In', trigger: 'on-cast', effect: {damage_mult: 3.0, self_damage: 20}} },
  'scottish_fortune': { name: 'Fortune Teller', faction: 'ScottishFold', coat: 'Fluffy', cost: 4, color: '#D1D5DB', icon: '🔮', role: 'Ranged', stats: {hp: 800, attack: 70, speed: 0.9, range: 3}, ability: {name: 'Twist of Fate', trigger: 'on-cast', effect: {crit_chance: 50, ally_crit: 20, duration: 5}} },
  'scottish_jackpot': { name: 'Jackpot King', faction: 'ScottishFold', coat: 'Fluffy', cost: 5, color: '#D1D5DB', icon: '💰', role: 'Ranged', stats: {hp: 1000, attack: 80, speed: 1.0, range: 2}, ability: {name: 'Jackpot!', trigger: 'on-kill', effect: {gold_drop: 10, ally_heal: 20, aoe_damage_mult: 2.0}} },

  // ===== Ragdoll Flops - Deceptively lazy =====
  'ragdoll_faker': { name: 'Ragdoll Faker', faction: 'Ragdoll', coat: 'Fluffy', cost: 1, color: '#93C5FD', icon: '😴', role: 'Tank', stats: {hp: 600, attack: 40, speed: 0.9, range: 1}, ability: {name: 'Play Dead', trigger: 'on-low-hp', effect: {fake_death: true, revive_pct: 40, attack_boost: 50}} },
  'ragdoll_lazy': { name: 'Lazy Loafer', faction: 'Ragdoll', coat: 'Fluffy', cost: 1, color: '#93C5FD', icon: '💤', role: 'Tank', stats: {hp: 650, attack: 35, speed: 0.7, range: 1}, ability: {name: 'Nap Time', trigger: 'passive', effect: {hp_regen_pct: 3}} },
  'ragdoll_flopper': { name: 'Master Flopper', faction: 'Ragdoll', coat: 'Fluffy', cost: 2, color: '#93C5FD', icon: '🫠', role: 'Tank', stats: {hp: 700, attack: 45, speed: 0.8, range: 1}, ability: {name: 'Go Limp', trigger: 'on-attack', effect: {dodge_chance: 30}} },
  'ragdoll_dreamer': { name: 'Daydreamer', faction: 'Ragdoll', coat: 'Fluffy', cost: 3, color: '#93C5FD', icon: '💭', role: 'Ranged', stats: {hp: 800, attack: 50, speed: 0.8, range: 2}, ability: {name: 'Dream Shield', trigger: 'on-cast', effect: {ally_shield: 200, invuln: 1}} },
  'ragdoll_therapist': { name: 'Cuddle Therapist', faction: 'Ragdoll', coat: 'Fluffy', cost: 4, color: '#93C5FD', icon: '🤗', role: 'Ranged', stats: {hp: 900, attack: 55, speed: 0.8, range: 2}, ability: {name: 'Group Hug', trigger: 'on-cast', effect: {ally_heal: 25, ally_cleanse: true}} },
  'ragdoll_zen': { name: 'Zen Master', faction: 'Ragdoll', coat: 'Fluffy', cost: 5, color: '#93C5FD', icon: '☯️', role: 'Tank', stats: {hp: 1100, attack: 60, speed: 0.9, range: 3}, ability: {name: 'Inner Peace', trigger: 'passive', effect: {ally_hp_regen: 2, ally_damage_reduction: 20, revive_ally_chance: 30}} }
};

const allUnitIds = Object.keys(unitsData);

// Group units by cost tier for weighted shop rolls
const unitsByTier = { 1: [], 2: [], 3: [], 4: [], 5: [] };
Object.entries(unitsData).forEach(([id, unit]) => {
  const tier = unit.cost || 1;
  if (unitsByTier[tier]) unitsByTier[tier].push(id);
});

// Shop odds by player level (% chance for each tier)
// Format: [1-cost, 2-cost, 3-cost, 4-cost, 5-cost]
const shopOdds = {
  1: [100, 0, 0, 0, 0],
  2: [75, 25, 0, 0, 0],
  3: [55, 30, 15, 0, 0],
  4: [45, 33, 20, 2, 0],
  5: [35, 35, 25, 5, 0],
  6: [25, 35, 30, 10, 0],
  7: [20, 30, 33, 15, 2],
  8: [15, 25, 35, 20, 5]
};

// ========== FACTION SYNERGIES ==========
const factionSynergies = {
  Alley: {
    name: "Alley Cats",
    icon: "🐈‍⬛",
    color: "#A0AEC1",
    thresholds: [2, 4, 6],
    bonuses: {
      2: { description: "+2 gold per round", gold_per_round: 2 },
      4: { description: "+4 gold per round, +15% attack", gold_per_round: 4, attack_amp: 15 },
      6: { description: "+6 gold per round, +25% attack, +10% interest", gold_per_round: 6, attack_amp: 25, interest_bonus: 10 }
    }
  },
  Persian: {
    name: "Persian",
    icon: "🐱",
    color: "#F0E6D3",
    thresholds: [2, 4, 6],
    bonuses: {
      2: { description: "+25 armor, +10% damage reflect", armor: 25, damage_reflect: 10 },
      4: { description: "+45 armor, +20% reflect, 10% slow enemies", armor: 45, damage_reflect: 20, slow_enemies: 10 },
      6: { description: "+70 armor, +30% reflect, 20% slow, +200 HP", armor: 70, damage_reflect: 30, slow_enemies: 20, hp_flat: 200 }
    }
  },
  Siamese: {
    name: "Siamese",
    icon: "😺",
    color: "#D4B896",
    thresholds: [2, 4, 6],
    bonuses: {
      2: { description: "+20% attack speed, screech stuns 0.5s", attack_speed: 20, stun_on_cast: 0.5 },
      4: { description: "+35% attack speed, screech stuns 1s, -15% enemy armor", attack_speed: 35, stun_on_cast: 1, armor_shred: 15 },
      6: { description: "+50% attack speed, screech stuns 1.5s, -25% armor, +20 mana/hit", attack_speed: 50, stun_on_cast: 1.5, armor_shred: 25, mana_on_hit: 20 }
    }
  },
  MaineCoon: {
    name: "Maine Coon",
    icon: "🦁",
    color: "#8B7355",
    thresholds: [2, 4, 6],
    bonuses: {
      2: { description: "+30% HP, +10% lifesteal", hp_amp: 30, lifesteal: 10 },
      4: { description: "+50% HP, +20% lifesteal, AOE attacks", hp_amp: 50, lifesteal: 20, aoe_attacks: true },
      6: { description: "+75% HP, +30% lifesteal, AOE, roar fears enemies 1s", hp_amp: 75, lifesteal: 30, aoe_attacks: true, fear_on_ability: 1 }
    }
  },
  Bengal: {
    name: "Bengal",
    icon: "🐆",
    color: "#D4A574",
    thresholds: [2, 4, 6],
    bonuses: {
      2: { description: "+20% crit chance, +25% crit damage", crit_chance: 20, crit_damage: 25 },
      4: { description: "+30% crit, +50% crit dmg, leap to backline", crit_chance: 30, crit_damage: 50, assassin_leap: true },
      6: { description: "+40% crit, +80% crit dmg, leap, execute <20% HP", crit_chance: 40, crit_damage: 80, assassin_leap: true, execute_threshold: 20 }
    }
  },
  Sphynx: {
    name: "Sphynx",
    icon: "👽",
    color: "#E8D5C4",
    thresholds: [2, 4, 6],
    bonuses: {
      2: { description: "Attacks apply disease: 20 dmg/sec", poison_on_hit: 20 },
      4: { description: "Disease 35 dmg/sec, spreads to nearby enemies", poison_on_hit: 35, disease_spread: true },
      6: { description: "Disease 50 dmg/sec, spreads, -20% enemy healing", poison_on_hit: 50, disease_spread: true, grievous_wounds: 20 }
    }
  },
  ScottishFold: {
    name: "Scottish Fold",
    icon: "🎲",
    color: "#C4B5A0",
    thresholds: [2, 4, 6],
    bonuses: {
      2: { description: "25% chance: double damage OR heal 15%", gamble_damage: 25, gamble_heal: 15 },
      4: { description: "35% chance: double damage OR heal 25%, +15% attack", gamble_damage: 35, gamble_heal: 25, attack_amp: 15 },
      6: { description: "50% chance: triple damage OR full heal, +30% attack", gamble_damage: 50, gamble_heal: 100, triple_gamble: true, attack_amp: 30 }
    }
  },
  Ragdoll: {
    name: "Ragdoll",
    icon: "🎭",
    color: "#F5E6D3",
    thresholds: [2, 4, 6],
    bonuses: {
      2: { description: "+20% dodge, revive once at 20% HP", dodge: 20, revive_pct: 20 },
      4: { description: "+35% dodge, revive at 35% HP, go limp (invuln 1s) at 50%", dodge: 35, revive_pct: 35, limp_invuln: 1 },
      6: { description: "+50% dodge, revive at 50% HP, limp 2s, deceive (clone on death)", dodge: 50, revive_pct: 50, limp_invuln: 2, clone_on_death: true }
    }
  }
};

// ========== SHARED FUNCTIONS ==========

// Roll a random unit for a specific player level
function rollShopUnitForLevel(level) {
  const odds = shopOdds[level] || shopOdds[1];
  const roll = Math.random() * 100;
  let cumulative = 0;

  for (let tier = 1; tier <= 5; tier++) {
    cumulative += odds[tier - 1];
    if (roll < cumulative) {
      const tierUnits = unitsByTier[tier];
      if (tierUnits.length > 0) {
        return tierUnits[Math.floor(Math.random() * tierUnits.length)];
      }
    }
  }
  // Fallback to tier 1
  return unitsByTier[1][Math.floor(Math.random() * unitsByTier[1].length)];
}

// Hex distance (odd-r offset to cube coordinates)
function hexDistance(key1, key2) {
  const [c1, r1] = key1.split(',').map(Number);
  const [c2, r2] = key2.split(',').map(Number);
  const x1 = c1 - Math.floor(r1 / 2);
  const z1 = r1;
  const y1 = -x1 - z1;
  const x2 = c2 - Math.floor(r2 / 2);
  const z2 = r2;
  const y2 = -x2 - z2;
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

// Get sell value based on cost and stars
function getSellValue(cost, stars) {
  if (stars === 1) return cost;
  if (stars === 2) return cost * 3;
  if (stars === 3) return cost * 9;
  return cost;
}

// Calculate synergy bonuses for a board
function getSynergyBonusesForBoard(board) {
  const factionCounts = {};
  Object.values(board).forEach(unitData => {
    const unitId = typeof unitData === 'object' ? unitData.id : unitData;
    const unit = unitsData[unitId];
    if (unit) {
      factionCounts[unit.faction] = (factionCounts[unit.faction] || 0) + 1;
    }
  });

  const bonuses = {};
  Object.entries(factionCounts).forEach(([faction, count]) => {
    const synergy = factionSynergies[faction];
    if (!synergy) return;

    let activeBonus = null;
    for (let i = synergy.thresholds.length - 1; i >= 0; i--) {
      if (count >= synergy.thresholds[i]) {
        activeBonus = synergy.bonuses[synergy.thresholds[i]];
        break;
      }
    }
    if (activeBonus) {
      bonuses[faction] = activeBonus;
    }
  });

  return bonuses;
}

// Create a combat unit from unit data (server-friendly, no visual effects)
function createCombatUnit(unitId, hexKey, isPlayer, synergyBonuses, stars) {
  const data = unitsData[unitId];
  if (!data) return null;
  const stats = data.stats;
  const baseSpeed = stats.speed || 1.0;

  // Apply star level multiplier
  const starMult = STAR_MULTIPLIERS[stars] || 1.0;

  // Start with base stats (scaled by stars)
  let hp = Math.round(stats.hp * starMult);
  let attack = Math.round(stats.attack * starMult);
  let speed = baseSpeed;
  let range = stats.range || 1;
  let armor = 0;
  let damageReduction = 0;
  let critChance = 0;
  let critDamage = 150;
  let lifesteal = 0;
  let poisonOnHit = 0;
  let damageVsPoisoned = 0;
  let executeThreshold = 0;
  let damageAmp = 0;

  // Apply Tank role bonus
  const role = data.role || 'Melee';
  if (role === 'Tank') {
    armor += TANK_ARMOR_BONUS;
    damageReduction += TANK_DAMAGE_REDUCTION;
  }

  // Apply synergy bonuses for player units
  if (isPlayer && synergyBonuses) {
    const faction = data.faction;
    const bonus = synergyBonuses[faction];

    if (bonus) {
      if (bonus.hp_amp) hp = Math.round(hp * (1 + bonus.hp_amp / 100));
      if (bonus.attack_amp) attack = Math.round(attack * (1 + bonus.attack_amp / 100));
      if (bonus.attack_speed) speed = speed * (1 + bonus.attack_speed / 100);
      if (bonus.range_bonus) range += bonus.range_bonus;
      if (bonus.armor) armor += bonus.armor;
      if (bonus.crit_chance) critChance += bonus.crit_chance;
      if (bonus.crit_damage) critDamage += bonus.crit_damage;
      if (bonus.lifesteal) lifesteal += bonus.lifesteal;
      if (bonus.poison_on_hit) poisonOnHit = bonus.poison_on_hit;
      if (bonus.damage_vs_poisoned) damageVsPoisoned = bonus.damage_vs_poisoned;
      if (bonus.execute_threshold) executeThreshold = bonus.execute_threshold;
      if (bonus.damage_amp) damageAmp = bonus.damage_amp;
    }
  }

  return {
    id: unitId,
    hexKey,
    isPlayer,
    maxHp: hp,
    hp: hp,
    baseAttack: attack,
    attack: attack,
    baseSpeed: speed,
    speed: speed,
    range: range,
    armor: armor,
    damageReduction: damageReduction,
    role: role,
    mana: 0,
    maxMana: MANA_TO_CAST,
    faction: data.faction,
    ability: data.ability,
    lastActionTime: 0,
    lastMoveTime: 0,
    actionCooldown: 1000 / speed,
    moveCooldown: 600 / speed,
    statusEffects: [],
    attackedTargets: new Set(),
    hasCast: false,
    hasRevived: false,
    critChance,
    critDamage,
    lifesteal,
    poisonOnHit,
    damageVsPoisoned,
    executeThreshold,
    damageAmp
  };
}

// ========== EXPORTS ==========
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    UNIT_ROLES, TANK_ARMOR_BONUS, TANK_DAMAGE_REDUCTION, STAR_MULTIPLIERS, MANA_TO_CAST,
    unitsData, allUnitIds, unitsByTier, shopOdds, factionSynergies,
    rollShopUnitForLevel, hexDistance, getSellValue, getSynergyBonusesForBoard, createCombatUnit
  };
}
