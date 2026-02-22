// ============================================================
//  FFFA — Tooltip System
//  Version: 0.3.0.0
//  Unit tooltip display with ability descriptions
// ============================================================
(function() {
  'use strict';
  const G = window.FFFA;

  const tooltip = document.getElementById('unit-tooltip');
  let tooltipVisible = false;

  function getAbilityDescription(ability) {
    if (!ability || !ability.effect) return ability?.name || 'No ability';

    const e = ability.effect;
    const parts = [];

    if (e.gold_per_round) parts.push(`+${e.gold_per_round} gold per round`);
    if (e.gold_per_attack) parts.push(`+${e.gold_per_attack} gold per attack`);
    if (e.gold_steal) parts.push(`Steal ${e.gold_steal} gold${e.once_per_target ? ' (once per target)' : ''}`);
    if (e.gold_drop_chance) parts.push(`${e.gold_drop_chance}% chance for +${e.gold_drop} gold`);

    if (e.damage_mult) parts.push(`${Math.round((e.damage_mult - 1) * 100)}% bonus damage`);
    if (e.aoe_damage_mult) parts.push(`${Math.round(e.aoe_damage_mult * 100)}% AoE damage`);
    if (e.crit_chance) parts.push(`+${e.crit_chance}% crit chance`);
    if (e.crit_mult) parts.push(`${e.crit_mult}x crit damage`);
    if (e.execute_threshold) parts.push(`Execute enemies below ${e.execute_threshold}% HP`);

    if (e.self_heal) parts.push(`Heal ${e.self_heal}% of max HP`);
    if (e.self_heal_on_damage) parts.push(`${e.self_heal_on_damage}% lifesteal`);

    if (e.stun) parts.push(`Stun for ${e.stun}s`);
    if (e.aoe_stun) parts.push(`AoE stun for ${e.aoe_stun.duration || e.aoe_stun}s`);
    if (e.silence) parts.push(`Silence for ${e.silence}s`);
    if (e.root) parts.push(`Root for ${e.root.duration}s`);
    if (e.attack_speed_slow) parts.push(`Slow attack speed ${e.attack_speed_slow}%`);
    if (e.aoe_slow) parts.push(`AoE slow ${e.aoe_slow.percent || e.aoe_slow}%`);

    if (e.poison) parts.push(`Poison: ${e.poison.damage} dmg/s for ${e.poison.duration}s`);
    if (e.bleed) parts.push(`Bleed: ${e.bleed.damage} dmg over ${e.bleed.duration}s`);

    if (e.armor) parts.push(`+${e.armor} armor`);
    if (e.damage_reduction) parts.push(`${e.damage_reduction}% damage reduction`);
    if (e.ally_shield) parts.push(`Shield allies for ${e.ally_shield}`);

    if (e.ally_attack_speed) parts.push(`+${e.ally_attack_speed}% ally attack speed`);
    if (e.ally_damage_amp) parts.push(`+${e.ally_damage_amp}% ally damage`);
    if (e.ally_armor) parts.push(`+${e.ally_armor} armor to allies`);
    if (e.ally_crit) parts.push(`+${e.ally_crit}% crit to allies`);

    return parts.length > 0 ? parts.join('. ') + '.' : 'Special effect';
  }

  function showTooltip(unitId, x, y) {
    const unit = unitsData[unitId];
    if (!unit) return;

    const synergy = factionSynergies[unit.faction];
    const factionColor = synergy?.color || '#888';
    const factionName = synergy?.name || unit.faction;
    const factionIcon = synergy?.icon || '\uD83C\uDF10';

    const roleIcons = { Tank: '\uD83D\uDEE1\uFE0F', Ranged: '\uD83C\uDFF9', Melee: '\u2694\uFE0F' };
    const roleColors = { Tank: '#4a9eff', Ranged: '#22c55e', Melee: '#ef4444' };
    const role = unit.role || 'Melee';
    const roleIcon = roleIcons[role] || '\u2694\uFE0F';
    const roleColor = roleColors[role] || '#888';
    const roleBonus = role === 'Tank' ? `+${TANK_ARMOR_BONUS}% Armor, +${TANK_DAMAGE_REDUCTION}% DR` : '';

    const triggerClass = unit.ability?.trigger === 'passive' ? 'trigger-passive' :
                        unit.ability?.trigger === 'on-attack' ? 'trigger-on-attack' : 'trigger-on-cast';

    tooltip.innerHTML = `
      <div class="tooltip-header">
        <span class="tooltip-icon">${unit.icon}</span>
        <div class="tooltip-title">
          <div class="tooltip-name">${unit.name}</div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
            <span class="tooltip-faction" style="background: ${factionColor}33; color: ${factionColor}; border: 1px solid ${factionColor}55;">
              ${factionIcon} ${factionName}
            </span>
            <span class="tooltip-faction" style="background: ${roleColor}33; color: ${roleColor}; border: 1px solid ${roleColor}55;">
              ${roleIcon} ${role}
            </span>
          </div>
        </div>
        <div class="tooltip-cost">${unit.cost}</div>
      </div>
      <div class="tooltip-body">
        ${roleBonus ? `<div style="font-size: 11px; color: ${roleColor}; margin-bottom: 8px; padding: 4px 8px; background: ${roleColor}22; border-radius: 4px; text-align: center;">${roleIcon} Tank Bonus: ${roleBonus}</div>` : ''}
        <div class="tooltip-stats">
          <div class="tooltip-stat">
            <span class="stat-icon">\u2764\uFE0F</span>
            <span class="stat-label">HP</span>
            <span class="stat-value">${unit.stats.hp}</span>
          </div>
          <div class="tooltip-stat">
            <span class="stat-icon">\u2694\uFE0F</span>
            <span class="stat-label">ATK</span>
            <span class="stat-value">${unit.stats.attack}</span>
          </div>
          <div class="tooltip-stat">
            <span class="stat-icon">\u26A1</span>
            <span class="stat-label">SPD</span>
            <span class="stat-value">${unit.stats.speed.toFixed(1)}</span>
          </div>
          <div class="tooltip-stat">
            <span class="stat-icon">\uD83C\uDFAF</span>
            <span class="stat-label">RNG</span>
            <span class="stat-value">${unit.stats.range}</span>
          </div>
        </div>
        ${unit.ability ? `
        <div class="tooltip-ability">
          <div class="ability-header">
            <span class="ability-name">\u2728 ${unit.ability.name}</span>
            <span class="ability-trigger ${triggerClass}">${unit.ability.trigger}</span>
          </div>
          <div class="ability-desc">${getAbilityDescription(unit.ability)}</div>
        </div>
        ` : ''}
      </div>
    `;

    const padding = 15;
    let left = x + padding;
    let top = y - 20;

    if (left + 280 > window.innerWidth) {
      left = x - 280 - padding;
    }
    if (top + 250 > window.innerHeight) {
      top = window.innerHeight - 260;
    }
    if (top < 10) top = 10;

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.display = 'block';
    tooltipVisible = true;
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
    tooltipVisible = false;
  }

  function isTooltipVisible() {
    return tooltipVisible;
  }

  window.TooltipSystem = {
    showTooltip,
    hideTooltip,
    getAbilityDescription,
    isTooltipVisible
  };
})();
