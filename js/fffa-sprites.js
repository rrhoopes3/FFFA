// fffa-sprites.js — Sprite animation system (extracted from index.html)
// Each unit has its own sprite sheet: 6 columns x 7 rows, 64x64 per cell
// Animation config loaded from unit_animations_data.js (global UNIT_ANIM_CONFIG)

(function () {
  'use strict';

  const G = window.FFFA;

  // Module-private debug log tracker
  let _spriteDebugLogged = {};

  // Initialize globals on G if not already present
  G.unitAnimConfig = (typeof UNIT_ANIM_CONFIG !== 'undefined') ? UNIT_ANIM_CONFIG : null;
  G.SPRITE_CELL = 64;
  G.spriteSheets = {};
  G.unitSpriteStates = {};

  // Load all per-unit sprite sheet PNGs (config already in global UNIT_ANIM_CONFIG)
  function loadAnimConfigAndSheets() {
    if (!G.unitAnimConfig) {
      console.warn('UNIT_ANIM_CONFIG not found, sprite sheets disabled');
      return;
    }
    const unitKeys = Object.keys(G.unitAnimConfig.units);
    console.log(`Animation config ready: ${unitKeys.length} units`);
    let loadedCount = 0;
    let failedCount = 0;
    Object.entries(G.unitAnimConfig.units).forEach(([unitKey, unitDef]) => {
      const img = new Image();
      img.src = unitDef.sheet;
      img.onload = () => {
        G.spriteSheets[unitKey] = img;
        loadedCount++;
        if (loadedCount + failedCount === unitKeys.length) {
          console.log(`Sprite sheets loaded: ${loadedCount} OK, ${failedCount} failed, keys: ${Object.keys(G.spriteSheets).slice(0,3).join(',')}`);
        }
      };
      img.onerror = (e) => {
        failedCount++;
        console.warn(`Failed to load sheet: ${unitDef.sheet} (${e.type})`);
        if (loadedCount + failedCount === unitKeys.length) {
          console.log(`Sprite sheets loaded: ${loadedCount} OK, ${failedCount} failed`);
        }
      };
    });
  }

  // Get the unit key from a unit data object
  function getUnitKey(unit) {
    if (unit.id) return unit.id;
    return unit.name.toLowerCase().replace(/\s+/g, '_');
  }

  // Get current animation frame for a unit (advances time-based)
  function getUnitSpriteFrame(instanceId, unitKey, animName) {
    if (!G.unitAnimConfig) return { frame: 0, row: 0 };
    const unitDef = G.unitAnimConfig.units[unitKey];
    if (!unitDef) return { frame: 0, row: 0 };
    const anim = unitDef.animations[animName] || unitDef.animations.idle;
    if (!anim) return { frame: 0, row: 0 };

    const now = Date.now();
    const fps = anim.fps || 8;
    const frameDuration = 1000 / fps;

    // Initialize state if not exists
    if (!G.unitSpriteStates[instanceId]) {
      G.unitSpriteStates[instanceId] = {
        animName: animName,
        frame: 0,
        lastFrameTime: now,
        stateStartTime: now
      };
    }

    const state = G.unitSpriteStates[instanceId];

    // If animation changed, reset
    if (state.animName !== animName) {
      state.animName = animName;
      state.frame = 0;
      state.lastFrameTime = now;
      state.stateStartTime = now;
    }

    // Advance frame
    if (now - state.lastFrameTime >= frameDuration) {
      state.lastFrameTime = now;
      state.frame++;
      if (state.frame >= anim.frames) {
        if (anim.loop) {
          state.frame = 0;
        } else {
          // Non-looping finished -- return to idle (unless death)
          if (animName !== 'death') {
            state.animName = 'idle';
            const idleAnim = unitDef.animations.idle;
            state.frame = 0;
            state.stateStartTime = now;
          } else {
            state.frame = anim.frames - 1; // hold last
          }
        }
      }
    }

    const finalAnim = unitDef.animations[state.animName] || anim;
    return { frame: Math.min(state.frame, finalAnim.frames - 1), row: finalAnim.row };
  }

  // Set animation state for a unit
  function setUnitAnimation(instanceId, newAnimName) {
    if (!G.unitSpriteStates[instanceId]) {
      G.unitSpriteStates[instanceId] = { animName: 'idle', frame: 0, lastFrameTime: Date.now(), stateStartTime: Date.now() };
    }
    const state = G.unitSpriteStates[instanceId];
    if (state.animName !== newAnimName) {
      state.animName = newAnimName;
      state.frame = 0;
      state.stateStartTime = Date.now();
      state.lastFrameTime = Date.now();
    }
  }

  // Draw a unit using its per-unit sprite sheet
  function drawUnitSprite(ctx, cx, cy, unit, stars, combatUnit, explicitUnitId) {
    if (stars === undefined) stars = 1;

    const unitKey = explicitUnitId || getUnitKey(unit);
    const sheet = G.spriteSheets[unitKey];

    // Need both the sheet and the animation config
    if (!sheet || !sheet.complete || sheet.naturalWidth === 0 || !G.unitAnimConfig || !G.unitAnimConfig.units[unitKey]) {
      if (!_spriteDebugLogged[unitKey]) {
        _spriteDebugLogged[unitKey] = true;
        console.warn(`Sprite fallback for ${unitKey}: sheet=${!!sheet}, complete=${sheet?.complete}, config=${!!G.unitAnimConfig?.units?.[unitKey]}, totalSheets=${Object.keys(G.spriteSheets).length}`);
      }
      return false; // fall back to static image
    }

    const instanceId = combatUnit ? combatUnit.hexKey : (explicitUnitId || unitKey) + '_board';
    const isPlayer = combatUnit ? combatUnit.isPlayer : true;

    // Determine which animation to play
    let animName = 'idle';
    if (combatUnit) {
      if (combatUnit.hp <= 0) {
        animName = 'death';
      } else if (G.unitSpriteStates[instanceId]) {
        animName = G.unitSpriteStates[instanceId].animName;
      }
    }

    const { frame, row } = getUnitSpriteFrame(instanceId, unitKey, animName);

    // Debug: draw animation name on unit
    if (combatUnit && window.location.search.includes('debug')) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(cx - 20, cy + G.hexSize * 0.6, 40, 12);
      ctx.fillStyle = '#0f0';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(animName, cx, cy + G.hexSize * 0.7);
    }

    // Source rect from sheet
    const sx = frame * G.SPRITE_CELL;
    const sy = row * G.SPRITE_CELL;

    // Dest size -- fill the hex with a little more presence
    const destSize = G.hexSize * 1.5;
    const teamColor = isPlayer ? '#64a8ff' : '#ff6c74';
    const teamGlow = isPlayer ? 'rgba(100, 168, 255, 0.34)' : 'rgba(255, 108, 116, 0.34)';
    const rarityColors = { 1: '#7dc8ff', 2: '#72df97', 3: '#f1c35d', 4: '#ff8a65', 5: '#d997ff' };
    const glowColors = { 1: unit.color, 2: '#7dc8ff', 3: '#f4a' };
    const rarityColor = rarityColors[unit.cost || 1] || '#7dc8ff';
    const seed = unitKey.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const bob = Math.sin(Date.now() / 260 + seed) * G.hexSize * 0.04;
    const drawY = cy - G.hexSize * 0.08 + bob;

    // Shadow and pedestal
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + destSize * 0.34, destSize * 0.32, destSize * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = teamGlow;
    ctx.beginPath();
    ctx.arc(cx, cy + destSize * 0.12, destSize * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rarityColor + '22';
    ctx.beginPath();
    ctx.arc(cx, cy + destSize * 0.08, destSize * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = teamColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy + destSize * 0.12, destSize * 0.43, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = rarityColor;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy + destSize * 0.12, destSize * 0.34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw the sprite frame
    ctx.shadowColor = glowColors[stars] || unit.color;
    ctx.shadowBlur = stars === 1 ? 10 : stars === 2 ? 18 : 28;
    ctx.drawImage(
      sheet,
      sx, sy, G.SPRITE_CELL, G.SPRITE_CELL,
      cx - destSize / 2, drawY - destSize / 2, destSize, destSize
    );
    ctx.shadowBlur = 0;

    // Team crest arrow
    ctx.fillStyle = teamColor;
    ctx.beginPath();
    if (isPlayer) {
      ctx.moveTo(cx, drawY - destSize * 0.54);
      ctx.lineTo(cx - 7, drawY - destSize * 0.43);
      ctx.lineTo(cx + 7, drawY - destSize * 0.43);
    } else {
      ctx.moveTo(cx, drawY - destSize * 0.43);
      ctx.lineTo(cx - 7, drawY - destSize * 0.54);
      ctx.lineTo(cx + 7, drawY - destSize * 0.54);
    }
    ctx.closePath();
    ctx.fill();

    // Stars
    ctx.font = '700 12px Rajdhani';
    ctx.fillStyle = glowColors[stars] || unit.color;
    ctx.textAlign = 'center';
    ctx.fillText('\u2605'.repeat(stars), cx, cy + destSize * 0.5);

    return true;
  }

  // Expose public API
  window.SpriteSystem = {
    loadAnimConfigAndSheets: loadAnimConfigAndSheets,
    getUnitKey: getUnitKey,
    getUnitSpriteFrame: getUnitSpriteFrame,
    setUnitAnimation: setUnitAnimation,
    drawUnitSprite: drawUnitSprite
  };

})();
