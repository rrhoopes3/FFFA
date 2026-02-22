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

    // Dest size -- fill the hex
    const destSize = G.hexSize * 1.4;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + destSize * 0.4, destSize * 0.3, destSize * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Team base circle
    const teamColor = isPlayer ? '#4488ff' : '#ff4444';
    const teamGlow = isPlayer ? 'rgba(68, 136, 255, 0.6)' : 'rgba(255, 68, 68, 0.6)';
    ctx.beginPath();
    ctx.arc(cx, cy + destSize * 0.1, destSize * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = teamGlow;
    ctx.fill();
    ctx.strokeStyle = teamColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Star glow
    const glowColors = { 1: unit.color, 2: '#4af', 3: '#f4a' };
    ctx.shadowColor = glowColors[stars] || unit.color;
    ctx.shadowBlur = stars === 1 ? 10 : stars === 2 ? 20 : 30;

    // Draw the sprite frame
    ctx.drawImage(
      sheet,
      sx, sy, G.SPRITE_CELL, G.SPRITE_CELL,
      cx - destSize / 2, cy - destSize / 2, destSize, destSize
    );
    ctx.shadowBlur = 0;

    // Team arrow
    ctx.fillStyle = teamColor;
    ctx.beginPath();
    if (isPlayer) {
      ctx.moveTo(cx, cy - destSize * 0.55);
      ctx.lineTo(cx - 6, cy - destSize * 0.45);
      ctx.lineTo(cx + 6, cy - destSize * 0.45);
    } else {
      ctx.moveTo(cx, cy - destSize * 0.45);
      ctx.lineTo(cx - 6, cy - destSize * 0.55);
      ctx.lineTo(cx + 6, cy - destSize * 0.55);
    }
    ctx.closePath();
    ctx.fill();

    // Stars
    ctx.font = '12px Arial';
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
