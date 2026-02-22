// ============================================================
//  FFFA — Combat System
//  Version: 0.3.1.0
//  Combat state management, pathfinding, status effects, damage
//  calculation, abilities, passives, combat tick processing,
//  multiplayer combat, animation loop, and game init.
// ============================================================
(function() {
  'use strict';
  const G = window.FFFA;

  // Lazy cross-module references (other modules may load after this file)
  const getHexKey     = (h) => window.HexBoard.getHexKey(h);
  const hexToPixel    = (h) => window.HexBoard.hexToPixel(h);

  // Particle / visual helpers
  const addDamageNumber     = (...a) => window.ParticleSystem.addDamageNumber(...a);
  const addHealNumber       = (...a) => window.ParticleSystem.addHealNumber(...a);
  const addAttackLine       = (...a) => window.ParticleSystem.addAttackLine(...a);
  const addStatusIcon       = (...a) => window.ParticleSystem.addStatusIcon(...a);
  const addAttackParticles  = (...a) => window.ParticleSystem.addAttackParticles(...a);
  const addDeathExplosion   = (...a) => window.ParticleSystem.addDeathExplosion(...a);
  const addAbilityParticles = (...a) => window.ParticleSystem.addAbilityParticles(...a);
  const addHealParticles    = (...a) => window.ParticleSystem.addHealParticles(...a);
  const addAttackPulse      = (...a) => window.ParticleSystem.addAttackPulse(...a);
  const addAbilityEffect    = (...a) => window.ParticleSystem.addAbilityEffect(...a);
  const addCombatHitEffect  = (...a) => window.ParticleSystem.addCombatHitEffect(...a);

  // Sprite helpers
  const setUnitAnimation = (...a) => window.SpriteSystem.setUnitAnimation(...a);

  // Render helpers
  const renderBoard    = () => window.RenderSystem.renderBoard();
  const renderBench    = () => window.RenderSystem.renderBench();
  const renderShop     = () => window.RenderSystem.renderShop();
  const updateUI       = () => window.RenderSystem.updateUI();

  // Synergy helpers
  const renderSynergies   = () => window.SynergySystem.renderSynergies();
  const calculateSynergies = () => window.SynergySystem.calculateSynergies();

  // Input helpers
  const setupBenchEvents = () => window.InputSystem.setupBenchEvents();

  // Sound helpers
  const playMeow          = () => window.SoundSystem.playMeow();
  const maybePlayAttackMeow = () => window.SoundSystem.maybePlayAttackMeow();
  const playDeathMeow     = () => window.SoundSystem.playDeathMeow();
  const playHiss          = () => window.SoundSystem.playHiss();

  // Tooltip helpers
  const showTooltip = (...a) => window.TooltipSystem.showTooltip(...a);
  const hideTooltip = ()     => window.TooltipSystem.hideTooltip();

  // ----------------------------------------------------------
  //  Module-private constants & state
  // ----------------------------------------------------------
  const COMBAT_TICK_MS = 50;

  let currentMultiplayerMatchups = null;
  let currentOpponent = null;

  // ----------------------------------------------------------
  //  Section 1 — Hex neighbours & pathfinding
  // ----------------------------------------------------------

  // Get neighbors of a hex (odd-r offset)
  function getHexNeighbors(hexKey) {
    const [col, row] = hexKey.split(',').map(Number);
    const isOddRow = row & 1;
    const directions = isOddRow
      ? [[1,0], [1,-1], [0,-1], [-1,0], [0,1], [1,1]]
      : [[1,0], [0,-1], [-1,-1], [-1,0], [-1,1], [0,1]];
    return directions
      .map(([dc, dr]) => ({ col: col + dc, row: row + dr }))
      .filter(h => h.col >= 0 && h.col < 7 && h.row >= 0 && h.row < 8)
      .map(h => getHexKey(h));
  }

  // Find path toward target (improved pathfinding)
  function findMoveToward(unit, target, units) {
    const neighbors = getHexNeighbors(unit.hexKey);
    const occupied = new Set(units.filter(u => u.hp > 0 && u !== unit).map(u => u.hexKey));
    const currentDist = hexDistance(unit.hexKey, target.hexKey);

    let bestHex = null;
    let bestDist = currentDist;
    let lateralOptions = []; // Hexes at same distance (for getting around obstacles)

    for (const hex of neighbors) {
      if (occupied.has(hex)) continue;
      const dist = hexDistance(hex, target.hexKey);
      if (dist < bestDist) {
        // Found a closer hex - prefer this
        bestDist = dist;
        bestHex = hex;
        lateralOptions = []; // Clear lateral since we found something better
      } else if (dist === currentDist && !bestHex) {
        // Same distance - track as lateral option for obstacle avoidance
        lateralOptions.push(hex);
      }
    }

    // If no closer hex found, try lateral movement to get around obstacles
    if (!bestHex && lateralOptions.length > 0) {
      // Pick the lateral hex that has the most open neighbors (better pathing potential)
      let bestLateral = null;
      let bestOpenNeighbors = -1;
      for (const lateralHex of lateralOptions) {
        const lateralNeighbors = getHexNeighbors(lateralHex);
        const openCount = lateralNeighbors.filter(n => !occupied.has(n)).length;
        // Also prefer hexes that are in the general direction of the target
        const [lc, lr] = lateralHex.split(',').map(Number);
        const [tc, tr] = target.hexKey.split(',').map(Number);
        const [uc, ur] = unit.hexKey.split(',').map(Number);
        // Check if this lateral move is in the right general direction
        const towardTarget = (Math.sign(tc - uc) === Math.sign(lc - uc) || Math.sign(tc - uc) === 0) &&
                             (Math.sign(tr - ur) === Math.sign(lr - ur) || Math.sign(tr - ur) === 0);
        const directionBonus = towardTarget ? 3 : 0;
        if (openCount + directionBonus > bestOpenNeighbors) {
          bestOpenNeighbors = openCount + directionBonus;
          bestLateral = lateralHex;
        }
      }
      bestHex = bestLateral;
    }

    return bestHex;
  }

  function findNearestEnemy(unit, units) {
    let nearest = null;
    let minDist = Infinity;
    for (const other of units) {
      if (other.isPlayer === unit.isPlayer || other.hp <= 0) continue;
      const dist = hexDistance(unit.hexKey, other.hexKey);
      if (dist < minDist) {
        minDist = dist;
        nearest = other;
      }
    }
    return { target: nearest, distance: minDist };
  }

  // ----------------------------------------------------------
  //  Section 2 — Status effects
  // ----------------------------------------------------------

  function hasStatus(unit, type) {
    return unit.statusEffects.some(s => s.type === type);
  }

  function getStatusValue(unit, type) {
    const effect = unit.statusEffects.find(s => s.type === type);
    return effect ? effect.value : 0;
  }

  function applyStatus(unit, type, duration, value = 0) {
    // Remove existing of same type
    unit.statusEffects = unit.statusEffects.filter(s => s.type !== type);
    unit.statusEffects.push({ type, duration, value, startTime: Date.now() });

    const name = unitsData[unit.id].name;
    if (type === G.STATUS.STUN) G.combatLog.push(`${name} is STUNNED for ${(duration/1000).toFixed(1)}s!`);
    else if (type === G.STATUS.SLOW) G.combatLog.push(`${name} is SLOWED ${value}%!`);
    else if (type === G.STATUS.POISON) G.combatLog.push(`${name} is POISONED for ${value} dmg/sec!`);
    else if (type === G.STATUS.SHIELD) G.combatLog.push(`${name} gains ${value} SHIELD!`);
  }

  function updateStatusEffects(unit, deltaTime) {
    const now = Date.now();
    // Process poison damage
    const poison = unit.statusEffects.find(s => s.type === G.STATUS.POISON);
    if (poison) {
      const tickDamage = poison.value * (deltaTime / 1000);
      unit.hp -= tickDamage;
    }

    // Update speed based on slow
    const slow = unit.statusEffects.find(s => s.type === G.STATUS.SLOW);
    if (slow) {
      unit.speed = unit.baseSpeed * (1 - slow.value / 100);
      unit.actionCooldown = 1000 / unit.speed;
      unit.moveCooldown = 600 / unit.speed;
    } else {
      unit.speed = unit.baseSpeed;
      unit.actionCooldown = 1000 / unit.speed;
      unit.moveCooldown = 600 / unit.speed;
    }

    // Remove expired effects
    unit.statusEffects = unit.statusEffects.filter(s => now - s.startTime < s.duration);
  }

  // ----------------------------------------------------------
  //  Section 3 — Damage calculation
  // ----------------------------------------------------------

  function calculateDamage(attacker, defender, baseDamage) {
    // Armor reduces damage: damage * 100 / (100 + armor)
    const armorReduction = 100 / (100 + defender.armor);
    let damage = baseDamage * armorReduction;

    // Apply flat damage reduction (Tank class bonus)
    if (defender.damageReduction && defender.damageReduction > 0) {
      damage = damage * (1 - defender.damageReduction / 100);
    }

    // Shield absorbs damage
    const shield = defender.statusEffects.find(s => s.type === G.STATUS.SHIELD);
    if (shield) {
      if (shield.value >= damage) {
        shield.value -= damage;
        return 0;
      } else {
        damage -= shield.value;
        defender.statusEffects = defender.statusEffects.filter(s => s.type !== G.STATUS.SHIELD);
      }
    }

    // Persian synergy: Damage reflect
    if (defender.isPlayer) {
      const persianSynergy = G.activeCombatSynergies['Persian'];
      if (persianSynergy?.damage_reflect && defender.faction === 'Persian') {
        const reflectDamage = damage * persianSynergy.damage_reflect / 100;
        attacker.hp -= reflectDamage;
        if (reflectDamage > 5) {
          addDamageNumber(attacker.hexKey, reflectDamage);
        }
      }
    }

    return damage;
  }

  // ----------------------------------------------------------
  //  Section 4 — Ability execution
  // ----------------------------------------------------------

  function executeAbility(unit, target, trigger) {
    const abl = unit.ability;
    if (!abl || !abl.effect) return;
    if (abl.trigger !== trigger) return;

    // Add ability particles at unit location
    const unitHex = G.boardHexes.find(h => getHexKey(h) === unit.hexKey);
    if (unitHex) {
      const unitPos = hexToPixel(unitHex);
      addAbilityParticles(unitPos.x, unitPos.y, unit.color);
    }

    const effect = abl.effect;
    const attackerName = unitsData[unit.id].name;
    const targetName = target ? unitsData[target.id].name : '';

    // Gold effects
    if (effect.gold_per_attack) {
      G.gold += effect.gold_per_attack;
      G.combatLog.push(`${attackerName}'s ${abl.name}: +${effect.gold_per_attack}g!`);
    }
    if (effect.gold_steal && target) {
      if (!effect.once_per_target || !unit.attackedTargets.has(target.hexKey)) {
        G.gold += effect.gold_steal;
        G.combatLog.push(`${attackerName} steals ${effect.gold_steal}g!`);
        if (effect.once_per_target) unit.attackedTargets.add(target.hexKey);
      }
    }
    if (effect.gold_drop_chance && Math.random() * 100 < effect.gold_drop_chance) {
      G.gold += effect.gold_drop;
      G.combatLog.push(`${attackerName}'s ${abl.name}: +${effect.gold_drop}g drop!`);
    }

    // Damage effects
    if (effect.damage_mult && target) {
      const bonusDmg = unit.attack * (effect.damage_mult - 1);
      const finalDmg = calculateDamage(unit, target, bonusDmg);
      target.hp -= finalDmg;
      G.combatLog.push(`${abl.name} deals ${Math.round(finalDmg)} bonus damage!`);
    }

    // Self heal
    if (effect.self_heal) {
      const heal = unit.maxHp * effect.self_heal / 100;
      unit.hp = Math.min(unit.maxHp, unit.hp + heal);
      addHealNumber(unit.hexKey, heal);
      G.combatLog.push(`${attackerName} heals for ${Math.round(heal)}!`);
    }
    if (effect.self_heal_on_damage && target) {
      const heal = unit.attack * effect.self_heal_on_damage / 100;
      unit.hp = Math.min(unit.maxHp, unit.hp + heal);
      addHealNumber(unit.hexKey, heal);
    }

    // Status effects
    if (effect.attack_speed_slow && target) {
      applyStatus(target, G.STATUS.SLOW, (effect.duration || 3) * 1000, effect.attack_speed_slow);
    }
    if (effect.poison && target) {
      applyStatus(target, G.STATUS.POISON, effect.poison.duration * 1000, effect.poison.damage);
    }
    if (effect.bleed && target) {
      applyStatus(target, G.STATUS.POISON, effect.bleed.duration * 1000, effect.bleed.damage / effect.bleed.duration);
    }
    if (effect.stun && target) {
      applyStatus(target, G.STATUS.STUN, effect.stun * 1000);
    }
    if (effect.root && target) {
      applyStatus(target, G.STATUS.STUN, effect.root.duration * 1000);
    }
    if (effect.silence && target) {
      applyStatus(target, G.STATUS.SILENCE, effect.silence * 1000);
    }

    // AOE effects
    if (effect.aoe_stun) {
      const radius = effect.aoe_stun.radius || 2;
      const duration = (effect.aoe_stun.duration || effect.aoe_stun) * 1000;
      G.combatUnits.filter(u => u.isPlayer !== unit.isPlayer && u.hp > 0)
        .filter(u => hexDistance(unit.hexKey, u.hexKey) <= radius)
        .forEach(u => applyStatus(u, G.STATUS.STUN, duration));
    }
    if (effect.aoe_slow) {
      const radius = effect.aoe_slow.radius || 2;
      const percent = effect.aoe_slow.percent || effect.aoe_slow;
      G.combatUnits.filter(u => u.isPlayer !== unit.isPlayer && u.hp > 0)
        .filter(u => hexDistance(unit.hexKey, u.hexKey) <= radius)
        .forEach(u => applyStatus(u, G.STATUS.SLOW, 3000, percent));
    }

    // Ally buffs
    if (effect.ally_shield) {
      G.combatUnits.filter(u => u.isPlayer === unit.isPlayer && u.hp > 0)
        .forEach(u => applyStatus(u, G.STATUS.SHIELD, (effect.duration || 5) * 1000, effect.ally_shield));
    }
    if (effect.ally_damage_amp) {
      // Simplified: just boost attack temporarily
      G.combatUnits.filter(u => u.isPlayer === unit.isPlayer && u.hp > 0)
        .forEach(u => { u.attack = u.baseAttack * (1 + effect.ally_damage_amp / 100); });
    }

    // Crit chance
    if (effect.crit_chance && target && Math.random() * 100 < effect.crit_chance) {
      const critMult = effect.crit_mult || 2;
      const critDmg = unit.attack * (critMult - 1);
      const finalCrit = calculateDamage(unit, target, critDmg);
      target.hp -= finalCrit;
      addDamageNumber(target.hexKey, finalCrit, true); // true = crit (yellow)
      addStatusIcon(unit.hexKey, '💥');
      G.combatLog.push(`CRIT! ${Math.round(finalCrit)} bonus damage!`);
    }

    // Execute low HP
    if (effect.execute_threshold && target) {
      const threshold = target.maxHp * effect.execute_threshold / 100;
      if (target.hp > 0 && target.hp < threshold) {
        target.hp = 0;
        G.combatLog.push(`${attackerName} EXECUTES ${targetName}!`);
      }
    }

    // Damage reduction (passive armor)
    if (effect.damage_reduction) {
      unit.armor += effect.damage_reduction;
    }
    if (effect.armor) {
      unit.armor += effect.armor;
    }
  }

  // ----------------------------------------------------------
  //  Section 5 — Passive abilities
  // ----------------------------------------------------------

  function executePassives(unit) {
    const abl = unit.ability;
    if (!abl || abl.trigger !== 'passive' || !abl.effect) return;

    const effect = abl.effect;

    // Ally-wide passives
    if (effect.ally_attack_speed) {
      G.combatUnits.filter(u => u.isPlayer === unit.isPlayer && u.faction === unit.faction && u.hp > 0)
        .forEach(u => {
          u.speed = u.baseSpeed * (1 + effect.ally_attack_speed / 100);
          u.actionCooldown = 1000 / u.speed;
        });
    }
    if (effect.ally_hp_amp) {
      G.combatUnits.filter(u => u.isPlayer === unit.isPlayer && u.faction === unit.faction && u.hp > 0)
        .forEach(u => {
          const bonus = u.maxHp * effect.ally_hp_amp / 100;
          u.maxHp += bonus;
          u.hp += bonus;
        });
    }
    if (effect.ally_armor) {
      G.combatUnits.filter(u => u.isPlayer === unit.isPlayer && u.faction === unit.faction && u.hp > 0)
        .forEach(u => { u.armor += effect.ally_armor; });
    }
    if (effect.ally_crit) {
      // Store for later use in attacks
      unit.bonusCrit = effect.ally_crit;
    }
    if (effect.damage_reduction) {
      unit.armor += effect.damage_reduction;
    }
    if (effect.armor) {
      unit.armor += effect.armor;
    }
  }

  // ----------------------------------------------------------
  //  Section 6 — Combat tick processing
  // ----------------------------------------------------------

  function processCombatTick(deltaTime) {
    const now = Date.now();

    G._combatTickCount++;

    // Timeout safety (60s max)
    if (now - G.combatStartTime > 60000) {
      const playerHp = G.combatUnits.filter(u => u.isPlayer && u.hp > 0).reduce((s, u) => s + u.hp, 0);
      const enemyHp = G.combatUnits.filter(u => !u.isPlayer && u.hp > 0).reduce((s, u) => s + u.hp, 0);
      endCombat(playerHp >= enemyHp);
      return;
    }

    let playerAlive = false, enemyAlive = false;

    // Sort by speed for turn order
    const sortedUnits = [...G.combatUnits].sort((a, b) => b.speed - a.speed);

    for (const unit of sortedUnits) {
      if (unit.hp <= 0) {
        // Check for Ragdoll revive synergy
        if (unit.isPlayer && !unit.hasRevived) {
          const ragdollSynergy = G.activeCombatSynergies['Ragdoll'];
          if (ragdollSynergy?.revive_pct && unit.faction === 'Ragdoll') {
            unit.hp = unit.maxHp * ragdollSynergy.revive_pct / 100;
            unit.hasRevived = true;
            addStatusIcon(unit.hexKey, '🎭');
            addHealNumber(unit.hexKey, unit.hp);
            G.combatLog.push(`${unitsData[unit.id].name} goes LIMP and REVIVES with ${Math.round(unit.hp)} HP!`);
          }
        }
        if (unit.hp <= 0) continue;
      }
      if (unit.isPlayer) playerAlive = true;
      else enemyAlive = true;

      // Update status effects
      updateStatusEffects(unit, deltaTime);
      if (unit.hp <= 0) {
        G.combatLog.push(`${unitsData[unit.id].name} dies from poison!`);
        continue;
      }

      // Apply synergy healing over time
      if (unit.isPlayer) {
        // Maine Coon synergy: lifesteal is handled on attack (see lifesteal code below)

        // Sphynx synergy: disease spread is passive on poison application
      }

      // Stunned units can't act
      if (hasStatus(unit, G.STATUS.STUN)) continue;

      // Passive mana regen
      unit.mana = Math.min(unit.maxMana, unit.mana + deltaTime * 0.02);

      const { target, distance } = findNearestEnemy(unit, G.combatUnits);
      if (!target) continue;

      // In range: try to attack
      if (distance <= unit.range) {
        if (now - unit.lastActionTime >= unit.actionCooldown) {
          // Check for on-cast ability with full mana
          if (unit.mana >= MANA_TO_CAST && unit.ability?.trigger === 'on-cast' && !hasStatus(unit, G.STATUS.SILENCE)) {
            addStatusIcon(unit.hexKey, '✨');
            G.combatLog.push(`${unitsData[unit.id].name} casts ${unit.ability.name}!`);
            executeAbility(unit, target, 'on-cast');
            unit.mana = 0;
          }

          // Calculate base damage with damage amp
          let baseDamage = unit.attack;
          if (unit.damageAmp) {
            baseDamage = baseDamage * (1 + unit.damageAmp / 100);
          }

          // Check for bonus damage vs diseased targets (Sphynx synergy)
          if (unit.damageVsPoisoned && hasStatus(target, G.STATUS.POISON)) {
            baseDamage = baseDamage * (1 + unit.damageVsPoisoned / 100);
            addStatusIcon(unit.hexKey, '🦠');
          }

          // Check for critical hit (synergy bonus)
          let isCrit = false;
          if (unit.critChance && Math.random() * 100 < unit.critChance) {
            isCrit = true;
            baseDamage = baseDamage * (unit.critDamage / 100);
            addStatusIcon(unit.hexKey, '💥');
            playHiss(); // HISS on crit!

            // Mana on hit (Siamese synergy)
            const siameseSynergy = G.activeCombatSynergies['Siamese'];
            if (siameseSynergy?.mana_on_hit && unit.faction === 'Siamese') {
              unit.mana = Math.min(unit.maxMana, unit.mana + siameseSynergy.mana_on_hit);
            }
          }

          const damage = calculateDamage(unit, target, baseDamage);
          target.hp -= damage;
          unit.lastActionTime = now;
          unit.mana = Math.min(unit.maxMana, unit.mana + 10); // Mana on attack

          // Meow on every 5th attack!
          maybePlayAttackMeow();

          // Apply lifesteal (Maine Coon synergy)
          if (unit.lifesteal && damage > 0) {
            const healAmount = damage * unit.lifesteal / 100;
            unit.hp = Math.min(unit.maxHp, unit.hp + healAmount);
            if (healAmount > 5) {
              addHealNumber(unit.hexKey, healAmount);
            }
          }

          // Apply disease on hit (Sphynx synergy)
          if (unit.poisonOnHit && !hasStatus(target, G.STATUS.POISON)) {
            applyStatus(target, G.STATUS.POISON, 4000, unit.poisonOnHit);
            addStatusIcon(target.hexKey, '🦠');
          }

          // Visual feedback
          addCombatHitEffect(unit, target, damage, isCrit);

          // Add attack animation
          G.unitAnimations[unit.hexKey] = { type: 'attack', startTime: Date.now() };

          // Trigger sprite animations
          setUnitAnimation(unit.hexKey, 'attack');
          setUnitAnimation(target.hexKey, 'hurt');
          // Sprite attack animation triggered
          const attackerHex = G.boardHexes.find(h => getHexKey(h) === unit.hexKey);
          if (attackerHex) {
            const pos = hexToPixel(attackerHex);
            addAttackParticles(pos.x, pos.y, unit.color);
          }

          G.combatLog.push(`${unitsData[unit.id].name} hits ${unitsData[target.id].name} for ${Math.round(damage)}${isCrit ? ' CRIT!' : ''} (${Math.round(Math.max(0, target.hp))} HP)`);

          // Check for execute (Bengal synergy)
          if (unit.executeThreshold && target.hp > 0) {
            const threshold = target.maxHp * unit.executeThreshold / 100;
            if (target.hp < threshold) {
              target.hp = 0;
              addStatusIcon(target.hexKey, '🐆');
              G.combatLog.push(`${unitsData[unit.id].name} POUNCES and EXECUTES ${unitsData[target.id].name}!`);
            }
          }

          // On-attack abilities
          if (!hasStatus(unit, G.STATUS.SILENCE)) {
            executeAbility(unit, target, 'on-attack');
          }

          if (target.hp <= 0) {
            G.combatLog.push(`${unitsData[target.id].name} defeated!`);

            // Add death animation
            G.unitAnimations[target.hexKey] = { type: 'death', startTime: Date.now(), deathTime: Date.now() };
            setUnitAnimation(target.hexKey, 'death');
            addDeathExplosion(target.hexKey);

            // Sad death meow
            playDeathMeow();
          }
        }
      } else {
        // Out of range: move toward enemy
        if (now - unit.lastMoveTime >= unit.moveCooldown) {
          const newHex = findMoveToward(unit, target, G.combatUnits);
          if (newHex) {
            // Update board state for rendering
            if (unit.isPlayer) {
              delete G.playerBoard[unit.hexKey];
              G.playerBoard[newHex] = { id: unit.id, stars: unit.stars || 1 };
            } else {
              delete G.enemyBoard[unit.hexKey];
              G.enemyBoard[newHex] = { id: unit.id, stars: unit.stars || 1 };
            }
            // Unit movement processed
            unit.hexKey = newHex;
            unit.lastMoveTime = now;
            setUnitAnimation(newHex, 'walk');
          }
        }
      }
    }

    // Check win/lose
    playerAlive = G.combatUnits.some(u => u.isPlayer && u.hp > 0);
    enemyAlive = G.combatUnits.some(u => !u.isPlayer && u.hp > 0);

    if (!playerAlive || !enemyAlive) {
      endCombat(playerAlive);
    }
  }

  // ----------------------------------------------------------
  //  Section 7 — Synergy bonuses (local convenience wrapper)
  // ----------------------------------------------------------

  // Get combined synergy bonuses for a faction
  function getSynergyBonuses() {
    const { activeSynergies } = calculateSynergies();
    const bonuses = {};

    Object.entries(activeSynergies).forEach(([faction, data]) => {
      if (data.activeBonus) {
        bonuses[faction] = data.activeBonus;
      }
    });

    return bonuses;
  }

  // ----------------------------------------------------------
  //  Section 8 — Auto-fill board
  // ----------------------------------------------------------

  // Auto-fill board from bench up to unit cap
  function autoFillBoard() {
    const unitCap = G.playerLevel + 2;
    let boardCount = Object.keys(G.playerBoard).length;
    if (boardCount >= unitCap) return false;

    const occupiedHexes = new Set(Object.keys(G.playerBoard));
    const frontRow = [4];
    const backRows = [5, 6, 7];

    // Collect bench units, sort tanks first then by cost
    const benchUnits = G.bench
      .map((u, idx) => u ? { ...u, benchIndex: idx } : null)
      .filter(u => u !== null);

    if (benchUnits.length === 0) return false;

    benchUnits.sort((a, b) => {
      const unitA = unitsData[a.id];
      const unitB = unitsData[b.id];
      const tankFactions = ['MaineCoon', 'Persian', 'Ragdoll'];
      const aIsTank = tankFactions.includes(unitA?.faction) || (unitA?.stats?.hp > 700);
      const bIsTank = tankFactions.includes(unitB?.faction) || (unitB?.stats?.hp > 700);
      if (aIsTank && !bIsTank) return -1;
      if (!aIsTank && bIsTank) return 1;
      return (unitB?.cost || 0) - (unitA?.cost || 0);
    });

    let placed = 0;
    for (const benchUnit of benchUnits) {
      if (boardCount + placed >= unitCap) break;
      const unit = unitsData[benchUnit.id];
      const tankFactions = ['MaineCoon', 'Persian', 'Ragdoll'];
      const isTank = tankFactions.includes(unit?.faction) || (unit?.stats?.hp > 700);
      let targetHex = null;
      const rows = isTank ? frontRow : backRows;
      for (const row of [...rows, ...frontRow, ...backRows]) {
        for (let col = 0; col < 7; col++) {
          const key = `${col},${row}`;
          if (!occupiedHexes.has(key)) {
            targetHex = key;
            break;
          }
        }
        if (targetHex) break;
      }
      if (targetHex) {
        G.playerBoard[targetHex] = { id: benchUnit.id, stars: benchUnit.stars };
        G.bench[benchUnit.benchIndex] = null;
        occupiedHexes.add(targetHex);
        placed++;
      }
    }
    if (placed > 0) {
      renderBoard();
      renderBench();
      updateUI();
    }
    return placed > 0;
  }

  // ----------------------------------------------------------
  //  Section 9 — Start combat (single-player / practice)
  // ----------------------------------------------------------

  function startCombat() {
    // Auto-fill board from bench if not full
    autoFillBoard();

    if (Object.keys(G.playerBoard).length === 0) {
      alert('Place some units first!');
      return;
    }
    if (G.combatState !== 'idle') return;

    // Save pre-combat positions for reset after combat
    G.preCombatBoard = { ...G.playerBoard };

    G.combatState = 'combat';
    G.combatUnits = [];
    G.combatLog = [];
    G.visualEffects = []; // Clear visual effects
    G.combatStartTime = Date.now();
    G.lastCombatTime = G.combatStartTime;

    // Calculate synergy bonuses for this combat
    const synergyBonuses = getSynergyBonuses();
    G.activeCombatSynergies = synergyBonuses;

    // Log active synergies
    const activeSynergyNames = Object.entries(synergyBonuses)
      .map(([faction, bonus]) => `${factionSynergies[faction].name}: ${bonus.description}`)
      .filter(Boolean);
    if (activeSynergyNames.length > 0) {
      G.combatLog.push(`=== ACTIVE SYNERGIES ===`);
      activeSynergyNames.forEach(s => G.combatLog.push(`• ${s}`));
    }

    // Show round banner
    G.roundBanner = {
      text: `ROUND ${G.currentRound}`,
      subtext: 'FIGHT!',
      color: '#ffd700',
      startTime: Date.now(),
      duration: 1500
    };

    // Create player combat units with synergy bonuses and star levels
    Object.entries(G.playerBoard).forEach(([key, unitData]) => {
      const unitId = typeof unitData === 'object' ? unitData.id : unitData;
      const stars = typeof unitData === 'object' ? unitData.stars : 1;
      const unit = createCombatUnit(unitId, key, true, synergyBonuses, stars);
      if (unit) {
        unit.stars = stars; // Store for display
        G.combatUnits.push(unit);
      }
    });

    // Spawn enemies in rows 0-3 (enemy half of board)
    G.enemyBoard = {};
    const enemyCount = Math.min(3 + G.currentRound, 12); // Scale with round, not level
    const enemyHexes = G.boardHexes.filter(h => h.row <= 3);

    // Shuffle enemy hexes for variety
    const shuffledHexes = [...enemyHexes].sort(() => Math.random() - 0.5);

    // Scale enemy star levels with round
    const getEnemyStars = () => {
      if (G.currentRound >= 15) return Math.random() < 0.3 ? 3 : 2;
      if (G.currentRound >= 8) return Math.random() < 0.5 ? 2 : 1;
      if (G.currentRound >= 4) return Math.random() < 0.3 ? 2 : 1;
      return 1;
    };

    // Prefer higher cost units in later rounds
    const getEnemyUnitId = () => {
      const maxTier = Math.min(5, 1 + Math.floor(G.currentRound / 3));
      const availableTiers = [];
      for (let t = 1; t <= maxTier; t++) {
        if (unitsByTier[t] && unitsByTier[t].length > 0) {
          // Weight higher tiers more in later rounds
          const weight = t <= maxTier - 1 ? 1 : 2;
          for (let w = 0; w < weight; w++) {
            availableTiers.push(...unitsByTier[t]);
          }
        }
      }
      return availableTiers[Math.floor(Math.random() * availableTiers.length)];
    };

    for (let i = 0; i < enemyCount && i < shuffledHexes.length; i++) {
      const hex = shuffledHexes[i];
      const key = getHexKey(hex);
      const unitId = getEnemyUnitId();
      const stars = getEnemyStars();
      G.enemyBoard[key] = { id: unitId, stars: stars };
    }

    Object.entries(G.enemyBoard).forEach(([key, unitData]) => {
      const unitId = typeof unitData === 'object' ? unitData.id : unitData;
      const stars = typeof unitData === 'object' ? unitData.stars : 1;
      const unit = createCombatUnit(unitId, key, false, null, stars);
      if (unit) {
        unit.stars = stars;
        G.combatUnits.push(unit);
      }
    });

    // Execute passive abilities at combat start
    G.combatUnits.forEach(u => executePassives(u));

    // Add initial combat animations
    G.combatUnits.forEach(u => {
      if (u.isPlayer) {
        // Add a subtle glow effect to player units at start
        const hex = G.boardHexes.find(h => getHexKey(h) === u.hexKey);
        if (hex) {
          const p = hexToPixel(hex);
          addAbilityEffect(p.x, p.y, u.color, 30);
        }
      }
    });

    // Add initial combat animations
    G.combatUnits.forEach(u => {
      if (u.isPlayer) {
        // Add a subtle glow effect to player units at start
        const hex = G.boardHexes.find(h => getHexKey(h) === u.hexKey);
        if (hex) {
          const p = hexToPixel(hex);
          addAbilityEffect(p.x, p.y, u.color, 30);
        }
      }
    });

    G.combatLog.push(`=== COMBAT START ===`);
    G.combatLog.push(`Your army: ${G.combatUnits.filter(u => u.isPlayer).length} units`);
    G.combatLog.push(`Enemy army: ${G.combatUnits.filter(u => !u.isPlayer).length} units`);

    // Initialize combat timing so units don't all attack on frame 1
    const initTime = Date.now();
    G.combatUnits.forEach(u => {
      u.lastActionTime = initTime;
      u.lastMoveTime = initTime;
      // Initialize sprite animation to idle
      setUnitAnimation(u.hexKey, 'idle');
    });

    console.log(`[Combat Start] ${G.combatUnits.length} units initialized, state: ${G.combatState}`);
    G._combatTickCount = 0; // Reset tick counter

    document.getElementById('combatLog').style.display = 'block';
    updateCombatLog();
    renderBoard();
    requestAnimationFrame(combatLoop);
  }

  // ----------------------------------------------------------
  //  Section 10 — Combat loop
  // ----------------------------------------------------------

  function combatLoop() {
    if (G.combatState !== 'combat') {
      return;
    }

    const now = Date.now();
    const delta = now - G.lastCombatTime;

    // Process combat logic on tick intervals only
    if (delta >= COMBAT_TICK_MS) {
      try {
        processCombatTick(delta);
        G.lastCombatTime = now;
        updateCombatLog();
      } catch (error) {
        console.error('[combatLoop] ERROR in processCombatTick:', error);
        console.error('Stack:', error.stack);
        G.combatState = 'idle';
        return;
      }
    }

    // Render every frame for smooth sprite animations
    renderBoard();

    if (G.combatState === 'combat') {
      requestAnimationFrame(combatLoop);
    }
  }

  // ----------------------------------------------------------
  //  Section 11 — Combat animation helpers
  // ----------------------------------------------------------

  // Add attack animation to units when they attack
  function addUnitAttackAnimation(attacker, target) {
    const attackerHex = G.boardHexes.find(h => getHexKey(h) === attacker.hexKey);
    const targetHex = G.boardHexes.find(h => getHexKey(h) === target.hexKey);

    if (attackerHex && targetHex) {
      const attackerPos = hexToPixel(attackerHex);
      const targetPos = hexToPixel(targetHex);

      // Add attack pulse effect
      addAttackPulse(attackerPos.x, attackerPos.y, attacker.color, 40);

      // Add attack line effect
      G.visualEffects.push({
        type: 'attackLine',
        x: attackerPos.x,
        y: attackerPos.y,
        x2: targetPos.x,
        y2: targetPos.y,
        color: attacker.color,
        startTime: Date.now(),
        duration: 300
      });
    }
  }

  function updateCombatLog() {
    const logEl = document.getElementById('combatLog');
    logEl.innerHTML = G.combatLog.slice(-20).map(line => `<div>${line}</div>`).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ----------------------------------------------------------
  //  Section 12 — End combat (single-player / practice)
  // ----------------------------------------------------------

  function endCombat(playerWon) {
    // In online mode, combat is cosmetic — server sends canonical results
    // Just stop the animation loop; handleCombatResult will clean up
    if (typeof window.GameState !== 'undefined' && window.GameState.mode === 'online') {
      G.combatState = 'resolution'; // Stop combatLoop but don't reset state
      return;
    }

    // In multiplayer mode, use the multiplayer end combat handler
    if (typeof window.GameState !== 'undefined' && window.GameState.mode === 'multiplayer') {
      endMultiplayerCombat(playerWon);
      return;
    }

    G.combatState = 'idle';

    const survivors = G.combatUnits.filter(u => u.isPlayer && u.hp > 0).length;
    const totalPlayerUnits = Object.keys(G.preCombatBoard).length;
    const enemiesKilled = G.combatUnits.filter(u => !u.isPlayer && u.hp <= 0).length;

    // Calculate Alley synergy gold bonus
    let synergyGoldBonus = 0;
    const alleySynergy = G.activeCombatSynergies['Alley'];
    if (alleySynergy?.gold_per_round) {
      synergyGoldBonus = alleySynergy.gold_per_round;
    }

    // Show result banner
    if (playerWon) {
      const baseGold = 5 + Math.floor(enemiesKilled / 2);
      const totalGold = baseGold + synergyGoldBonus;
      G.gold += totalGold;
      G.combatLog.push(`=== VICTORY! ===`);
      G.combatLog.push(`+${baseGold} gold (${survivors} survivors)`);
      if (synergyGoldBonus > 0) {
        G.combatLog.push(`+${synergyGoldBonus} gold (Alley synergy)`);
      }

      G.roundBanner = {
        text: 'VICTORY!',
        subtext: synergyGoldBonus > 0 ? `+${totalGold} gold (+${synergyGoldBonus} Alley)` : `+${baseGold} gold`,
        color: '#4f4',
        startTime: Date.now(),
        duration: 2000
      };
    } else {
      const damage = 5 + G.combatUnits.filter(u => !u.isPlayer && u.hp > 0).length * 2;
      G.health -= damage;
      // Still give Alley synergy gold on loss
      if (synergyGoldBonus > 0) {
        G.gold += synergyGoldBonus;
        G.combatLog.push(`+${synergyGoldBonus} gold (Alley synergy)`);
      }
      G.combatLog.push(`=== DEFEAT! ===`);
      G.combatLog.push(`-${damage} health`);

      G.roundBanner = {
        text: 'DEFEAT',
        subtext: `-${damage} health`,
        color: '#f44',
        startTime: Date.now(),
        duration: 2000
      };
    }

    // Restore player board to pre-combat positions (units reset)
    G.playerBoard = { ...G.preCombatBoard };

    // Clear sprite animation states for combat units
    G.combatUnits.forEach(u => {
      if (G.unitSpriteStates[u.hexKey]) {
        delete G.unitSpriteStates[u.hexKey];
      }
    });

    // Increment round
    G.currentRound++;

    updateUI();
    G.enemyBoard = {};

    setTimeout(() => {
      document.getElementById('combatLog').style.display = 'none';

      // Auto-refresh shop each round
      G.shopUnits = Array(5).fill().map(() => G.rollShopUnit());
      renderShop();

      // Show "Preparing Round X" banner
      G.roundBanner = {
        text: `ROUND ${G.currentRound}`,
        subtext: 'Prepare your units!',
        color: '#fff',
        startTime: Date.now(),
        duration: 1500
      };

      renderBoard();
      renderBench();
      renderSynergies(); // Update synergies panel after combat

      if (G.health <= 0) {
        setTimeout(() => {
          alert('GAME OVER! You have been eliminated.');
          G.health = 100;
          G.gold = 50;
          G.playerLevel = 1;
          G.currentRound = 1;
          G.playerBoard = {};
          G.bench = Array(9).fill(null);
          G.preCombatBoard = {};
          G.shopUnits = Array(5).fill().map(() => G.rollShopUnit());
          renderShop();
          renderBench();
          updateUI();
          renderBoard();
        }, 500);
      }
    }, 2000);
  }

  // ----------------------------------------------------------
  //  Section 13 — Animation loop (idle / resolution rendering)
  // ----------------------------------------------------------

  // Animation loop - render during idle and resolution states
  // (combatLoop handles rendering during 'combat' state)
  function animationLoop() {
    if (G.combatState === 'idle' || G.combatState === 'resolution') {
      renderBoard();
    }
    requestAnimationFrame(animationLoop);
  }

  function addUnitAbilityAnimation(unit) {
    const hex = G.boardHexes.find(h => getHexKey(h) === unit.hexKey);
    if (hex) {
      const p = hexToPixel(hex);
      addAbilityEffect(p.x, p.y, unit.color, 60);
    }
  }

  // Function to trigger various combat animations
  function triggerCombatAnimation(unit, animationType) {
    switch(animationType) {
      case 'attack':
        // Attack animation is handled in addUnitAttackAnimation
        break;
      case 'death':
        addUnitDeathAnimation(unit);
        break;
      case 'ability':
        addUnitAbilityAnimation(unit);
        break;
      case 'hit':
        // Add a hit flash effect
        const hex = G.boardHexes.find(h => getHexKey(h) === unit.hexKey);
        if (hex) {
          const p = hexToPixel(hex);
          addAttackPulse(p.x, p.y, unit.color, 20);
        }
        break;
    }
  }

  // ----------------------------------------------------------
  //  Section 14 — Init & asset loading
  // ----------------------------------------------------------

  function init() {
    G.shopUnits = Array(5).fill().map(() => G.rollShopUnit());
    renderShop();
    renderBoard();
    renderBench();
    setupBenchEvents();
    updateUI();
    renderSynergies(); // Initialize synergies panel

    // Show initial round banner
    G.roundBanner = {
      text: `ROUND ${G.currentRound}`,
      subtext: 'Place your units and FIGHT!',
      color: '#ffd700',
      startTime: Date.now(),
      duration: 2000
    };

    // Start animation loop
    requestAnimationFrame(animationLoop);
  }

  // Load unit portrait images from portraits/ directory
  function loadUnitImages() {
    // Load portrait for every unit defined in unitsData
    Object.keys(unitsData).forEach(unitId => {
      const img = new Image();
      img.src = 'portraits/' + unitId + '.png';
      img.onload = function() {
        G.unitImages[unitId] = img;
      };
      img.onerror = function() {
        // Portrait not found — unit will use emoji fallback
      };
    });
  }

  // ----------------------------------------------------------
  //  Section 15 — Multiplayer UI functions
  // ----------------------------------------------------------

  // Render the scoreboard
  function renderScoreboard() {
    if (window.GameState.mode !== 'multiplayer' && window.GameState.mode !== 'online') return;

    const list = document.getElementById('scoreboard-list');
    if (!list) return;

    // Sort players by health (alive first), then by placement
    const sortedPlayers = [...window.GameState.players].sort((a, b) => {
      if (a.isAlive && !b.isAlive) return -1;
      if (!a.isAlive && b.isAlive) return 1;
      return b.health - a.health;
    });

    list.innerHTML = sortedPlayers.map(player => {
      const isHuman = player.id === window.GameState.humanPlayerIndex;
      const isFighting = window.GameState.phase === 'combat' &&
        window.MultiplayerCombat.activeBattles.some(b =>
          (b.playerA === player.id || b.playerB === player.id));

      let classes = 'scoreboard-player';
      if (!player.isAlive) classes += ' eliminated';
      if (isHuman) classes += ' current';
      if (isFighting) classes += ' fighting';

      const healthClass = player.health > 50 ? 'healthy' : '';
      const streakText = player.streak > 0 ? `W${player.streak}` :
                        player.streak < 0 ? `L${Math.abs(player.streak)}` : '-';
      const streakClass = player.streak > 0 ? 'win' : player.streak < 0 ? 'loss' : '';

      return `
        <div class="${classes}">
          <div class="player-color" style="background: ${player.color}"></div>
          <div class="player-name">${player.name}${isHuman ? ' (You)' : ''}</div>
          <div class="player-health ${healthClass}">${'\u2764\uFE0F'}${player.health}</div>
          <div class="player-gold">${'\uD83D\uDCB0'}${player.gold}</div>
          <div class="player-streak ${streakClass}">${streakText}</div>
        </div>
      `;
    }).join('');
  }

  // Show matchup result
  function showMatchupResult(result) {
    const display = document.getElementById('matchup-display');
    const playerAEl = document.getElementById('matchup-player-a');
    const playerBEl = document.getElementById('matchup-player-b');
    const resultEl = document.getElementById('matchup-result');
    const damageEl = document.getElementById('matchup-damage');

    const playerA = window.GameState.players[result.playerA];
    const playerB = window.GameState.players[result.playerB];
    const humanId = window.GameState.humanPlayerIndex;

    playerAEl.textContent = playerA.name;
    playerAEl.style.background = playerA.color;
    playerAEl.style.color = '#fff';

    playerBEl.textContent = playerB.name;
    playerBEl.style.background = playerB.color;
    playerBEl.style.color = '#fff';

    // Determine result from human perspective
    const humanWon = result.winner === humanId;
    const humanLost = result.loser === humanId;
    const humanInvolved = humanWon || humanLost;

    if (humanInvolved) {
      if (humanWon) {
        resultEl.textContent = '\uD83C\uDFC6 VICTORY!';
        resultEl.className = 'matchup-result win';
        damageEl.textContent = '';
      } else {
        resultEl.textContent = '\uD83D\uDC80 DEFEAT';
        resultEl.className = 'matchup-result loss';
        damageEl.textContent = `-${result.damage} HP`;
      }
    } else {
      const winner = result.winner !== null ? window.GameState.players[result.winner] : null;
      resultEl.textContent = winner ? `${winner.name} wins!` : 'Draw!';
      resultEl.className = 'matchup-result';
      damageEl.textContent = '';
    }

    display.classList.add('active');

    // Auto-hide after delay
    setTimeout(() => {
      display.classList.remove('active');
    }, 2500);
  }

  // ----------------------------------------------------------
  //  Section 16 — Run multiplayer combat phase
  // ----------------------------------------------------------

  // Run multiplayer combat phase
  function runMultiplayerCombat() {
    if (window.GameState.mode !== 'multiplayer' && window.GameState.mode !== 'online') return;
    if (G.combatState !== 'idle') return;

    window.GameState.phase = 'combat';

    // Have all bots take their turns first
    window.GameState.players.forEach(player => {
      if (player.isBot && player.isAlive) {
        window.BotAI.takeTurn(player);
      }
    });

    // Auto-fill human board from bench before combat
    syncHumanToGameState();
    const humanPlayer = window.GameState.getHumanPlayer();
    if (humanPlayer.getBoardUnitCount() < humanPlayer.getUnitCap() && humanPlayer.bench.some(u => u !== null)) {
      window.BotAI.positionUnits(humanPlayer);
    }

    // Sync human player state to legacy variables
    const human = window.GameState.getHumanPlayer();
    G.playerBoard = human.board;
    G.bench = human.bench;
    G.gold = human.gold;
    G.health = human.health;
    G.playerLevel = human.level;

    // Find who the human is fighting this round
    const matchups = window.GameState.getMatchupsForRound();
    const humanMatchup = matchups.find(m =>
      m.playerA === window.GameState.humanPlayerIndex || m.playerB === window.GameState.humanPlayerIndex
    );

    if (!humanMatchup || Object.keys(G.playerBoard).length === 0) {
      // No matchup or no units - skip combat animation
      skipMultiplayerCombat();
      return;
    }

    // Determine opponent
    const opponentId = humanMatchup.playerA === window.GameState.humanPlayerIndex
      ? humanMatchup.playerB
      : humanMatchup.playerA;
    const opponent = window.GameState.players[opponentId];

    // Start animated combat against opponent's ghost army
    startAnimatedMultiplayerCombat(opponent, matchups);
  }

  function skipMultiplayerCombat() {
    // Run instant simulation for all matchups
    const results = window.MultiplayerCombat.runAllMatchups();
    window.MultiplayerCombat.applyResults();

    // Advance to next round
    renderScoreboard();
    const humanAfter = window.GameState.getHumanPlayer();
    G.gold = humanAfter.gold;
    G.health = humanAfter.health;
    updateUI();

    startNextMultiplayerRound();
  }

  // ----------------------------------------------------------
  //  Section 17 — Animated multiplayer combat
  // ----------------------------------------------------------

  function startAnimatedMultiplayerCombat(opponent, matchups) {
    // Save pre-combat positions for reset
    G.preCombatBoard = { ...G.playerBoard };

    G.combatState = 'combat';
    G.combatUnits = [];
    G.combatLog = [];
    G.visualEffects = [];
    G.combatStartTime = Date.now();
    G.lastCombatTime = G.combatStartTime;

    // Calculate synergy bonuses for player
    const synergyBonuses = getSynergyBonuses();
    G.activeCombatSynergies = synergyBonuses;

    // Show round banner with opponent name
    G.roundBanner = {
      text: `ROUND ${window.GameState.round}`,
      subtext: `vs ${opponent.name}`,
      color: opponent.color,
      startTime: Date.now(),
      duration: 1500
    };

    // Create player combat units
    Object.entries(G.playerBoard).forEach(([key, unitData]) => {
      const unitId = typeof unitData === 'object' ? unitData.id : unitData;
      const stars = typeof unitData === 'object' ? unitData.stars : 1;
      const unit = createCombatUnit(unitId, key, true, synergyBonuses, stars);
      if (unit) {
        unit.stars = stars;
        G.combatUnits.push(unit);
      }
    });

    // Create opponent's ghost army (mirrored to enemy rows)
    G.enemyBoard = {};
    const opponentSynergies = window.MultiplayerCombat.getSynergyBonusesForPlayer(opponent);

    Object.entries(opponent.board).forEach(([hexKey, unitData]) => {
      const unitId = typeof unitData === 'object' ? unitData.id : unitData;
      const stars = typeof unitData === 'object' ? unitData.stars : 1;

      // Mirror hex position: row 4->3, 5->2, 6->1, 7->0
      const [col, row] = hexKey.split(',').map(Number);
      const mirrorRow = 7 - row;
      const mirrorKey = `${col},${mirrorRow}`;

      G.enemyBoard[mirrorKey] = { id: unitId, stars: stars };

      const unit = createCombatUnit(unitId, mirrorKey, false, opponentSynergies, stars);
      if (unit) {
        unit.stars = stars;
        unit.ownerName = opponent.name;
        unit.ownerColor = opponent.color;
        G.combatUnits.push(unit);
      }
    });

    // Execute passive abilities
    G.combatUnits.forEach(u => executePassives(u));

    // Store matchups for later resolution
    currentMultiplayerMatchups = matchups;
    currentOpponent = opponent;

    // Log combat start
    G.combatLog.push(`=== COMBAT START ===`);
    G.combatLog.push(`You vs ${opponent.name}`);
    G.combatLog.push(`Your army: ${G.combatUnits.filter(u => u.isPlayer).length} units`);
    G.combatLog.push(`Enemy army: ${G.combatUnits.filter(u => !u.isPlayer).length} units`);

    // Initialize combat timing so units don't all attack on frame 1
    const mpInitTime = Date.now();
    G.combatUnits.forEach(u => {
      u.lastActionTime = mpInitTime;
      u.lastMoveTime = mpInitTime;
    });

    document.getElementById('combatLog').style.display = 'block';
    updateCombatLog();
    renderBoard();

    // Start the combat loop!
    requestAnimationFrame(combatLoop);
  }

  // ----------------------------------------------------------
  //  Section 18 — End multiplayer combat
  // ----------------------------------------------------------

  // Modified combat end for multiplayer
  function endMultiplayerCombat(playerWon) {
    G.combatState = 'idle';

    // Run the full simulation for ALL matchups (including human's)
    const results = window.MultiplayerCombat.runAllMatchups();

    // Find human's result
    const humanBattle = window.MultiplayerCombat.getPlayerBattle(window.GameState.humanPlayerIndex);

    // Show result popup
    if (humanBattle) {
      showMatchupResult(humanBattle);
    }

    // Apply all results
    window.MultiplayerCombat.applyResults();

    // Update UI
    renderScoreboard();
    const humanAfter = window.GameState.getHumanPlayer();
    G.gold = humanAfter.gold;
    G.health = humanAfter.health;
    updateUI();

    // Reset board positions
    G.playerBoard = { ...G.preCombatBoard };
    G.enemyBoard = {};
    renderBoard();

    // Show combat log briefly
    document.getElementById('combatLog').style.display = 'block';
    const allLogs = results.flatMap(r => r.combatLog);
    G.combatLog = allLogs;
    updateCombatLog();

    // Check for game over after delay
    setTimeout(() => {
      document.getElementById('combatLog').style.display = 'none';
      startNextMultiplayerRound();
    }, 3000);
  }

  // ----------------------------------------------------------
  //  Section 19 — Next multiplayer round
  // ----------------------------------------------------------

  function startNextMultiplayerRound() {
    const humanAfter = window.GameState.getHumanPlayer();

    if (window.GameState.isGameOver()) {
      const winner = window.GameState.getWinner();
      const humanWon = winner && winner.id === window.GameState.humanPlayerIndex;

      G.roundBanner = {
        text: humanWon ? '\uD83C\uDFC6 VICTORY!' : '\uD83D\uDC80 GAME OVER',
        subtext: humanWon ? 'You are the champion!' : `${winner?.name || 'Nobody'} wins!`,
        color: humanWon ? '#ffd700' : '#f44',
        startTime: Date.now(),
        duration: 5000
      };
      renderBoard();

      setTimeout(() => {
        if (confirm(humanWon ? 'Congratulations! Play again?' : 'Game Over! Play again?')) {
          location.reload();
        }
      }, 3000);
      return;
    }

    // Check if human is eliminated
    if (!humanAfter.isAlive) {
      const placement = humanAfter.placement || (8 - window.GameState.eliminationOrder.length);
      G.roundBanner = {
        text: '\uD83D\uDC80 ELIMINATED',
        subtext: `You placed #${placement}`,
        color: '#f44',
        startTime: Date.now(),
        duration: 3000
      };
      renderBoard();

      setTimeout(() => {
        if (confirm(`You placed #${placement}! Watch the rest or restart?`)) {
          location.reload();
        }
      }, 2000);
      return;
    }

    // Advance to next round
    window.GameState.nextRound();
    G.currentRound = window.GameState.round;

    // Sync human's new shop
    const humanNext = window.GameState.getHumanPlayer();
    G.shopUnits = humanNext.shop;
    G.gold = humanNext.gold;

    G.roundBanner = {
      text: `ROUND ${window.GameState.round}`,
      subtext: `${window.GameState.getAliveCount()} players remaining`,
      color: '#fff',
      startTime: Date.now(),
      duration: 2000
    };

    renderShop();
    renderBoard();
    renderBench();
    renderScoreboard();
    updateUI();
  }

  // ----------------------------------------------------------
  //  Section 20 — Sync human to game state
  // ----------------------------------------------------------

  // Sync human player actions to GameState
  function syncHumanToGameState() {
    if (window.GameState.mode !== 'multiplayer' && window.GameState.mode !== 'online') return;

    const human = window.GameState.getHumanPlayer();
    human.board = { ...G.playerBoard };
    human.bench = [...G.bench];
    human.gold = G.gold;
    human.level = G.playerLevel;
    human.shop = [...G.shopUnits];
  }

  // ----------------------------------------------------------
  //  Public API
  // ----------------------------------------------------------

  window.CombatSystem = {
    getHexNeighbors,
    findMoveToward,
    findNearestEnemy,
    hasStatus,
    getStatusValue,
    applyStatus,
    updateStatusEffects,
    calculateDamage,
    executeAbility,
    executePassives,
    processCombatTick,
    autoFillBoard,
    startCombat,
    combatLoop,
    endCombat,
    animationLoop,
    init,
    loadUnitImages,
    renderScoreboard,
    showMatchupResult,
    runMultiplayerCombat,
    startAnimatedMultiplayerCombat,
    endMultiplayerCombat,
    startNextMultiplayerRound,
    syncHumanToGameState,
    updateCombatLog
  };

})();
