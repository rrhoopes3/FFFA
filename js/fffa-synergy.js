// ============================================================
//  FFFA — Faction Synergy System
//  Version: 0.3.0.0
//  Calculates active synergies from board units, renders the
//  synergy sidebar, and exposes bonus lookup for combat.
// ============================================================
(function() {
  'use strict';
  const G = window.FFFA;

  // ---- core calculation -----------------------------------
  function calculateSynergies() {
    const factionCounts = {};
    const activeSynergies = {};

    Object.values(G.playerBoard).forEach(unitData => {
      const unitId = typeof unitData === 'object' ? unitData.id : unitData;
      const unit = unitsData[unitId];
      if (unit) {
        const faction = unit.faction;
        factionCounts[faction] = (factionCounts[faction] || 0) + 1;
      }
    });

    Object.entries(factionSynergies).forEach(([faction, synergy]) => {
      const count = factionCounts[faction] || 0;
      let activeThreshold = 0;
      let activeBonus = null;
      for (const threshold of synergy.thresholds) {
        if (count >= threshold) {
          activeThreshold = threshold;
          activeBonus = synergy.bonuses[threshold];
        }
      }
      activeSynergies[faction] = { count, activeThreshold, activeBonus, synergy };
    });

    return { factionCounts, activeSynergies };
  }

  // ---- DOM rendering --------------------------------------
  function renderSynergies() {
    const { activeSynergies } = calculateSynergies();
    const list = document.getElementById('synergies-list');
    list.innerHTML = '';

    const sorted = Object.entries(activeSynergies)
      .sort((a, b) => {
        if (a[1].activeBonus && !b[1].activeBonus) return -1;
        if (!a[1].activeBonus && b[1].activeBonus) return 1;
        return b[1].count - a[1].count;
      });

    sorted.forEach(([faction, data]) => {
      if (data.count === 0) return;
      const div = document.createElement('div');
      div.className = `synergy-item ${data.activeBonus ? 'active' : 'inactive'}`;
      div.style.setProperty('--trait-color', data.synergy.color || '#7dc8ff');
      div.dataset.tier = String(data.activeThreshold || 0);
      const nextThreshold = data.synergy.thresholds.find(t => t > data.count) || data.synergy.thresholds[data.synergy.thresholds.length - 1];
      const progress = Math.max(12, Math.min(100, (data.count / Math.max(1, nextThreshold)) * 100));
      const thresholds = data.synergy.thresholds.map(t =>
        `<span class="threshold ${data.count >= t ? 'active' : 'inactive'}">${t}</span>`
      ).join('');
      div.innerHTML = `
        <div class="synergy-emblem"><span class="synergy-icon">${data.synergy.icon}</span></div>
        <div class="synergy-info">
          <div class="synergy-name" style="color: ${data.synergy.color}">${data.synergy.name}</div>
          <div class="synergy-count">${data.count} active</div>
          <div class="synergy-bar"><span style="width: ${progress}%"></span></div>
          <div class="synergy-thresholds">${thresholds}</div>
          ${data.activeBonus ? `<div class="synergy-bonus">${data.activeBonus.description}</div>` : ''}
        </div>
      `;
      list.appendChild(div);
    });

    if (list.children.length === 0) {
      list.innerHTML = '<div class="synergy-empty">Draft units to awaken faction bonuses.</div>';
    }
  }

  // ---- bonus lookup for combat ----------------------------
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

  // ---- public API -----------------------------------------
  window.SynergySystem = {
    calculateSynergies,
    renderSynergies,
    getSynergyBonuses
  };
})();
