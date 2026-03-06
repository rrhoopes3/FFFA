// ============================================================
//  FFFA — Visual Effects & Particle System
//  Version: 0.3.0.0
//  Attack pulses, death effects, ability effects, damage/heal
//  numbers, attack lines, status icons, and particle emitters.
// ============================================================
(function() {
  'use strict';
  const G = window.FFFA;

  // Lazy cross-module references (HexBoard may load after this file)
  const hexToPixel = (hex) => window.HexBoard.hexToPixel(hex);
  const getHexKey = (hex) => window.HexBoard.getHexKey(hex);

  // ----------------------------------------------------------
  //  Section 1 — Animation utility functions
  // ----------------------------------------------------------

  function addAttackPulse(x, y, color, radius = 30) {
    G.visualEffects.push({
      type: 'attackPulse', x, y, color, radius,
      startTime: Date.now(), duration: 400
    });
  }

  function addDeathEffect(x, y, color, radius = 40) {
    G.visualEffects.push({
      type: 'deathEffect', x, y, color, radius,
      startTime: Date.now(), duration: 600
    });
  }

  function addAbilityEffect(x, y, color, radius = 50) {
    G.visualEffects.push({
      type: 'abilityEffect', x, y, color, radius,
      startTime: Date.now(), duration: 800
    });
  }

  function addCombatHitEffect(attacker, target, damage, isCrit = false) {
    const attackerHex = G.boardHexes.find(h => getHexKey(h) === attacker.hexKey);
    const targetHex = G.boardHexes.find(h => getHexKey(h) === target.hexKey);
    if (attackerHex && targetHex) {
      const attackerPos = hexToPixel(attackerHex);
      const targetPos = hexToPixel(targetHex);
      addAttackPulse(attackerPos.x, attackerPos.y, attacker.color, 40);
      addAttackParticles(attackerPos.x, attackerPos.y, attacker.color);
      G.visualEffects.push({
        type: 'attackLine',
        x: attackerPos.x, y: attackerPos.y,
        x2: targetPos.x, y2: targetPos.y,
        color: attacker.color,
        startTime: Date.now(), duration: 300
      });
      addDamageNumber(target.hexKey, damage, isCrit);
      G.visualEffects.push({
        type: 'hitEffect',
        x: targetPos.x, y: targetPos.y,
        color: attacker.color,
        startTime: Date.now(), duration: 400
      });
    }
  }

  function addHitEffect(x, y, color) {
    G.visualEffects.push({
      type: 'hitEffect', x, y, color,
      startTime: Date.now(), duration: 400
    });
  }

  // ----------------------------------------------------------
  //  Section 2 — Visual effects for combat
  // ----------------------------------------------------------

  function addDamageNumber(hexKey, damage, isCrit = false) {
    const hex = G.boardHexes.find(h => getHexKey(h) === hexKey);
    if (!hex) return;
    const p = hexToPixel(hex);
    G.visualEffects.push({
      type: 'damage',
      x: p.x + (Math.random() - 0.5) * G.hexSize * 0.4,
      y: p.y - G.hexSize * 0.4,
      text: `-${Math.round(damage)}`,
      color: isCrit ? '#ff0' : '#f44',
      startTime: Date.now(), duration: 800
    });
  }

  function addHealNumber(hexKey, amount) {
    const hex = G.boardHexes.find(h => getHexKey(h) === hexKey);
    if (!hex) return;
    const p = hexToPixel(hex);
    G.visualEffects.push({
      type: 'heal',
      x: p.x + (Math.random() - 0.5) * G.hexSize * 0.4,
      y: p.y - G.hexSize * 0.4,
      text: `+${Math.round(amount)}`,
      color: '#4f4',
      startTime: Date.now(), duration: 800
    });
  }

  function addAttackLine(fromKey, toKey, color = '#fff') {
    const fromHex = G.boardHexes.find(h => getHexKey(h) === fromKey);
    const toHex = G.boardHexes.find(h => getHexKey(h) === toKey);
    if (!fromHex || !toHex) return;
    const from = hexToPixel(fromHex);
    const to = hexToPixel(toHex);
    G.visualEffects.push({
      type: 'attackLine',
      x: from.x, y: from.y,
      x2: to.x, y2: to.y,
      color,
      startTime: Date.now(), duration: 150
    });
  }

  function addStatusIcon(hexKey, icon) {
    const hex = G.boardHexes.find(h => getHexKey(h) === hexKey);
    if (!hex) return;
    const p = hexToPixel(hex);
    G.visualEffects.push({
      type: 'status',
      x: p.x, y: p.y - G.hexSize * 0.65,
      text: icon, color: '#fff',
      startTime: Date.now(), duration: 500
    });
  }

  function addAttackParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
      G.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10 - 2,
        life: 1,
        size: Math.random() * 3.2 + 1.8,
        drag: 0.965,
        gravity: 0.08,
        lifeDecay: 0.05,
        glow: color,
        color: color + Math.floor(Math.random()*128).toString(16).padStart(2,'0')
      });
    }
  }

  function addDeathExplosion(hexKey) {
    const p = hexToPixel(G.boardHexes.find(h => getHexKey(h) === hexKey));
    for (let i = 0; i < 20; i++) {
      G.particles.push({
        x: p.x, y: p.y,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15,
        life: 1,
        size: Math.random() * 4 + 2,
        drag: 0.955,
        gravity: 0.05,
        lifeDecay: 0.04,
        glow: '#ff7744',
        color: '#ff4400'
      });
    }
  }

  function addAbilityParticles(x, y, color) {
    for (let i = 0; i < 12; i++) {
      G.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12 - 2,
        life: 1,
        size: Math.random() * 3.8 + 2.4,
        drag: 0.968,
        gravity: 0.06,
        lifeDecay: 0.045,
        glow: color,
        color: color + Math.floor(Math.random()*128).toString(16).padStart(2,'0')
      });
    }
  }

  function addHealParticles(hexKey, amount) {
    const p = hexToPixel(G.boardHexes.find(h => getHexKey(h) === hexKey));
    for (let i = 0; i < 10; i++) {
      G.particles.push({
        x: p.x, y: p.y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8 - 2,
        life: 1,
        size: Math.random() * 3 + 2,
        drag: 0.97,
        gravity: 0.04,
        lifeDecay: 0.04,
        glow: '#66ff99',
        color: '#0f0' + Math.floor(Math.random()*128).toString(16).padStart(2,'0')
      });
    }
  }

  // ----------------------------------------------------------
  //  Public API
  // ----------------------------------------------------------

  window.ParticleSystem = {
    addAttackPulse,
    addDeathEffect,
    addAbilityEffect,
    addCombatHitEffect,
    addHitEffect,
    addDamageNumber,
    addHealNumber,
    addAttackLine,
    addStatusIcon,
    addAttackParticles,
    addDeathExplosion,
    addAbilityParticles,
    addHealParticles
  };

})();
