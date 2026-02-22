// fffa-render.js — Rendering system (board, shop, bench, UI, drag ghost, visual effects)
// Extracted from index.html lines 3346-4038
// v1.0.0
(function() {
  'use strict';

  const G = window.FFFA;

  // Module-private drag ghost element
  let dragGhostEl = null;

  // ========== BOARD RENDERING ==========
  function renderBoard() {
    // Increment animation frame
    G.animationFrame++;

    // During combat, sync playerBoard/enemyBoard from combatUnits positions
    if ((G.combatState === 'combat' || G.combatState === 'resolution') && G.combatUnits.length > 0) {
      // Rebuild boards from live combat unit positions
      const livePlayerBoard = {};
      const liveEnemyBoard = {};
      G.combatUnits.forEach(cu => {
        if (cu.hp <= 0) return;
        const data = { id: cu.id, stars: cu.stars || 1 };
        if (cu.isPlayer) {
          livePlayerBoard[cu.hexKey] = data;
        } else {
          liveEnemyBoard[cu.hexKey] = data;
        }
      });
      // Use live positions for rendering (don't modify the saved boards)
      var renderPlayerBoard = livePlayerBoard;
      var renderEnemyBoard = liveEnemyBoard;
    } else {
      var renderPlayerBoard = G.playerBoard;
      var renderEnemyBoard = G.enemyBoard;
    }

    // Update and draw particles
    G.particles = G.particles.filter(part => {
      part.x += part.vx;
      part.y += part.vy;
      part.vy += 0.2;  // Gravity
      part.life -= 0.03;
      return part.life > 0;
    });

    // Draw 3D background
    window.HexBoard.drawBackground();

    // Collect hex data for two-pass rendering
    const hexRenderData = [];

    // PASS 1: Draw all hex fills and basic borders first
    G.boardHexes.forEach(hex => {
      const p = window.HexBoard.hexToPixel(hex);
      const key = window.HexBoard.getHexKey(hex);
      const isPlayer = G.playerRows.includes(hex.row);

      // Get unit data (new format: {id, stars} or old format: string)
      let unitData = renderPlayerBoard[key] || renderEnemyBoard[key];
      let unitId = null;
      let stars = 1;

      if (unitData) {
        if (typeof unitData === 'object') {
          unitId = unitData.id;
          stars = unitData.stars || 1;
        } else {
          unitId = unitData; // Old format compatibility
        }
      }

      let fill = isPlayer ? '#1e2a38' : '#2e1a1a';
      let teamStroke = null;

      // Check if this hex has a unit (from either board)
      const isPlayerUnit = renderPlayerBoard[key] !== undefined;
      const isEnemyUnit = renderEnemyBoard[key] !== undefined;

      if (unitId) {
        fill = unitsData[unitId].color;
        // Set border color based on team: blue for player, red for enemy
        if (isPlayerUnit) {
          teamStroke = '#4a9eff'; // Blue for player
          if (stars === 2) teamStroke = '#66b3ff';
          if (stars === 3) teamStroke = '#99ccff';
        } else if (isEnemyUnit) {
          teamStroke = '#ff4a4a'; // Red for enemy
          if (stars === 2) teamStroke = '#ff6666';
          if (stars === 3) teamStroke = '#ff9999';
        }
      }

      const isDragging = G.draggedUnit && (G.draggedUnit.fromBoard || G.draggedUnit.fromBench) && G.draggedUnit.oldKey === key;
      if (isDragging) {
        fill = isPlayer ? '#1e2a38' : '#2e1a1a';
        teamStroke = null;
      }

      // Draw hex fill only (no team border yet)
      window.HexBoard.drawHexWithShadow(p.x, p.y, fill, '#555', false);

      // Store data for second pass if this hex has a unit
      if (teamStroke && !isDragging) {
        hexRenderData.push({ p, teamStroke, unitId, stars, key });
      }
    });

    // PASS 2: Draw glowing team borders on top of all hexes
    hexRenderData.forEach(({ p, teamStroke }) => {
      G.ctx.save();
      G.ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i - Math.PI / 2;
        const x = p.x + G.hexSize * Math.cos(ang);
        const y = p.y + G.hexSize * Math.sin(ang);
        if (i === 0) G.ctx.moveTo(x, y);
        else G.ctx.lineTo(x, y);
      }
      G.ctx.closePath();
      G.ctx.shadowColor = teamStroke;
      G.ctx.shadowBlur = 10;
      G.ctx.strokeStyle = teamStroke;
      G.ctx.lineWidth = 2.5;
      G.ctx.lineJoin = 'round';
      G.ctx.stroke();
      G.ctx.restore();
    });

    // Draw particles
    G.particles.forEach(part => {
      G.ctx.save();
      G.ctx.globalAlpha = part.life;
      G.ctx.fillStyle = part.color;
      G.ctx.beginPath();
      G.ctx.arc(part.x, part.y, part.size * part.life, 0, Math.PI * 2);
      G.ctx.fill();
      G.ctx.restore();
    });

    // PASS 3: Draw units on top
    hexRenderData.forEach(({ p, unitId, stars, key }) => {
      const u = unitsData[unitId];
      // Find combat unit reference if in combat (for sprite animation state)
      let combatUnitRef = null;
      if (G.combatState === 'combat') {
        combatUnitRef = G.combatUnits.find(cu => cu.hexKey === key && cu.hp > 0);
      }
      // Draw unit with 3D shadow effect
      window.HexBoard.drawUnitWithShadow(p.x, p.y, u, stars, combatUnitRef, unitId);
    });

    if (G.highlightHex) {
      const p = window.HexBoard.hexToPixel(G.highlightHex);
      if (G.swapTargetInfo) {
        // Swap highlight -- orange glow
        G.ctx.globalAlpha = 0.4;
        window.HexBoard.drawHex(p.x, p.y, '#ff9933', '#ffbb55');
        G.ctx.globalAlpha = 1;
        // Draw swap arrows icon
        G.ctx.save();
        G.ctx.font = 'bold 14px Arial';
        G.ctx.fillStyle = '#ffcc44';
        G.ctx.textAlign = 'center';
        G.ctx.textBaseline = 'middle';
        G.ctx.shadowColor = 'rgba(0,0,0,0.7)';
        G.ctx.shadowBlur = 4;
        G.ctx.fillText('\u21C4', p.x, p.y - G.hexSize * 0.65);
        G.ctx.restore();

        // Show the swap target ghost on the source hex (where it will go)
        if (G.draggedUnit && G.draggedUnit.oldKey) {
          const srcHex = G.boardHexes.find(h => window.HexBoard.getHexKey(h) === G.draggedUnit.oldKey);
          if (srcHex) {
            const sp = window.HexBoard.hexToPixel(srcHex);
            // Draw orange highlight on source hex too
            G.ctx.globalAlpha = 0.25;
            window.HexBoard.drawHex(sp.x, sp.y, '#ff9933', '#ffbb55');
            G.ctx.globalAlpha = 1;
            // Draw ghost of the unit that will land here
            const ghostUnit = unitsData[G.swapTargetInfo.unitId];
            if (ghostUnit) {
              G.ctx.save();
              G.ctx.globalAlpha = 0.45;
              window.HexBoard.drawUnitWithShadow(sp.x, sp.y, ghostUnit, G.swapTargetInfo.stars, null, G.swapTargetInfo.unitId);
              G.ctx.restore();
              // Arrow pointing here
              G.ctx.save();
              G.ctx.font = 'bold 14px Arial';
              G.ctx.fillStyle = '#ffcc44';
              G.ctx.textAlign = 'center';
              G.ctx.textBaseline = 'middle';
              G.ctx.shadowColor = 'rgba(0,0,0,0.7)';
              G.ctx.shadowBlur = 4;
              G.ctx.fillText('\u21C4', sp.x, sp.y - G.hexSize * 0.65);
              G.ctx.restore();
            }
          }
        }
      } else {
        // Normal place highlight -- green glow
        G.ctx.globalAlpha = 0.4;
        window.HexBoard.drawHex(p.x, p.y, '#33ff66', '#33ff66');
        G.ctx.globalAlpha = 1;
      }
    }

    // Draw swap animations (units sliding to new positions)
    const now = Date.now();
    G.swapAnimations = G.swapAnimations.filter(anim => {
      const elapsed = now - anim.startTime;
      const progress = Math.min(1, elapsed / anim.duration);
      if (progress >= 1) return false; // animation done

      // Ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const x = anim.fromX + (anim.toX - anim.fromX) * ease;
      const y = anim.fromY + (anim.toY - anim.fromY) * ease;

      const unit = unitsData[anim.unitId];
      if (unit) {
        G.ctx.save();
        G.ctx.globalAlpha = 0.7 + 0.3 * progress; // fade in as it arrives
        window.HexBoard.drawUnitWithShadow(x, y, unit, anim.stars, null, anim.unitId);
        G.ctx.restore();
      }
      return true; // keep animating
    });

    // Combat visuals (health/mana bars)
    if (G.combatState === 'combat' || G.combatState === 'resolution') {
      G.combatUnits.forEach(unit => {
        if (unit.hp <= 0) return;
        const hex = G.boardHexes.find(h => window.HexBoard.getHexKey(h) === unit.hexKey);
        if (!hex) return;
        const p = window.HexBoard.hexToPixel(hex);

        // Status effect indicators with shadows
        const hasStatus = window.CombatSystem.hasStatus;
        if (hasStatus && hasStatus(unit, G.STATUS?.STUN)) {
          G.ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
          G.ctx.beginPath();
          G.ctx.arc(p.x + 2, p.y + 2, G.hexSize * 0.6, 0, Math.PI * 2);
          G.ctx.fill();
          G.ctx.fillStyle = 'rgba(255, 255, 0, 0.6)';
          G.ctx.beginPath();
          G.ctx.arc(p.x, p.y, G.hexSize * 0.6, 0, Math.PI * 2);
          G.ctx.fill();
        }
        if (hasStatus && hasStatus(unit, G.STATUS?.POISON)) {
          G.ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
          G.ctx.beginPath();
          G.ctx.arc(p.x + 2, p.y + 2, G.hexSize * 0.5, 0, Math.PI * 2);
          G.ctx.fill();
          G.ctx.fillStyle = 'rgba(0, 255, 0, 0.4)';
          G.ctx.beginPath();
          G.ctx.arc(p.x, p.y, G.hexSize * 0.5, 0, Math.PI * 2);
          G.ctx.fill();
        }
        if (hasStatus && hasStatus(unit, G.STATUS?.SHIELD)) {
          G.ctx.strokeStyle = '#4af';
          G.ctx.lineWidth = 3;
          G.ctx.beginPath();
          G.ctx.arc(p.x + 2, p.y + 2, G.hexSize * 0.7, 0, Math.PI * 2);
          G.ctx.stroke();
          G.ctx.strokeStyle = '#4af';
          G.ctx.lineWidth = 3;
          G.ctx.beginPath();
          G.ctx.arc(p.x, p.y, G.hexSize * 0.7, 0, Math.PI * 2);
          G.ctx.stroke();
        }

        // HP bar with 3D effect (scaled to hex size)
        const barWidth = G.hexSize * 0.85;
        const barHalfWidth = barWidth / 2;
        const hpBarH = Math.max(4, G.hexSize * 0.08);
        const manaBarH = Math.max(3, G.hexSize * 0.06);
        G.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        G.ctx.fillRect(p.x - barHalfWidth - 2, p.y - G.hexSize * 0.82, barWidth + 4, hpBarH + 2);
        G.ctx.fillStyle = '#333';
        G.ctx.fillRect(p.x - barHalfWidth, p.y - G.hexSize * 0.78, barWidth, hpBarH);
        const hpPct = Math.max(0, unit.hp / unit.maxHp);
        G.ctx.fillStyle = hpPct > 0.5 ? 'rgba(63, 185, 80, 0.9)' : hpPct > 0.25 ? 'rgba(255, 200, 0, 0.9)' : 'rgba(248, 81, 73, 0.9)';
        G.ctx.fillRect(p.x - barHalfWidth, p.y - G.hexSize * 0.78, barWidth * hpPct, hpBarH);

        // Mana bar with 3D effect
        G.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        G.ctx.fillRect(p.x - barHalfWidth - 2, p.y - G.hexSize * 0.68, barWidth + 4, manaBarH + 2);
        G.ctx.fillStyle = '#003';
        G.ctx.fillRect(p.x - barHalfWidth, p.y - G.hexSize * 0.64, barWidth, manaBarH);
        const manaPct = unit.mana / unit.maxMana;
        G.ctx.fillStyle = 'rgba(88, 166, 255, 0.9)';
        G.ctx.fillRect(p.x - barHalfWidth, p.y - G.hexSize * 0.64, barWidth * manaPct, manaBarH);
      });

      // Draw visual effects
      const now = Date.now();
      G.visualEffects = G.visualEffects.filter(fx => now - fx.startTime < fx.duration);

      G.visualEffects.forEach(fx => {
        const progress = (now - fx.startTime) / fx.duration;
        const alpha = 1 - progress;

        if (fx.type === 'damage' || fx.type === 'heal') {
          G.ctx.globalAlpha = alpha;
          G.ctx.fillStyle = fx.color;
          G.ctx.font = `bold ${Math.max(14, Math.round(G.hexSize * 0.35))}px Arial`;
          G.ctx.textAlign = 'center';

          // Add glow effect to damage numbers
          if (fx.type === 'damage') {
            G.ctx.shadowColor = fx.color;
            G.ctx.shadowBlur = 10;
          } else if (fx.type === 'heal') {
            G.ctx.shadowColor = '#0f0';
            G.ctx.shadowBlur = 15;
          }
          G.ctx.fillText(fx.text, fx.x, fx.y - progress * 30);
          G.ctx.shadowBlur = 0;
          G.ctx.globalAlpha = 1;
        } else if (fx.type === 'attackLine') {
          G.ctx.globalAlpha = alpha;
          G.ctx.strokeStyle = fx.color;
          G.ctx.lineWidth = 4;
          G.ctx.beginPath();
          G.ctx.moveTo(fx.x, fx.y);
          G.ctx.lineTo(fx.x2, fx.y2);
          G.ctx.stroke();

          // Add glow to attack lines
          G.ctx.shadowColor = fx.color;
          G.ctx.shadowBlur = 5;
          G.ctx.stroke();
          G.ctx.shadowBlur = 0;
          G.ctx.globalAlpha = 1;
        } else if (fx.type === 'status') {
          G.ctx.globalAlpha = alpha;
          G.ctx.font = '24px Arial';
          G.ctx.textAlign = 'center';

          // Add glow effect to status icons
          G.ctx.shadowColor = '#fff';
          G.ctx.shadowBlur = 12;
          G.ctx.fillText(fx.text, fx.x, fx.y - progress * 15);
          G.ctx.shadowBlur = 0;
          G.ctx.globalAlpha = 1;
        } else if (fx.type === 'attackPulse') {
          // Attack pulse animation
          G.ctx.globalAlpha = alpha * 0.7;

          // Create a multi-layered pulse effect
          const layers = 3;
          for (let i = 0; i < layers; i++) {
            const layerProgress = Math.min(1, progress + (i * 0.2));
            const layerRadius = fx.radius * (1 - layerProgress);

            if (layerProgress < 1) {
              G.ctx.strokeStyle = fx.color;
              G.ctx.lineWidth = 2 + (i * 0.5);
              G.ctx.beginPath();
              G.ctx.arc(fx.x, fx.y, layerRadius, 0, Math.PI * 2);
              G.ctx.stroke();
            }
          }

          // Add glow effect
          G.ctx.shadowColor = fx.color;
          G.ctx.shadowBlur = 10;
          G.ctx.strokeStyle = fx.color;
          G.ctx.lineWidth = 2;
          G.ctx.beginPath();
          G.ctx.arc(fx.x, fx.y, fx.radius * (1 - progress), 0, Math.PI * 2);
          G.ctx.stroke();
          G.ctx.shadowBlur = 0;

          G.ctx.globalAlpha = 1;
        } else if (fx.type === 'deathEffect') {
          // Death explosion animation
          G.ctx.globalAlpha = alpha;

          // Create a multi-layered explosion effect
          const layers = 3;
          for (let i = 0; i < layers; i++) {
            const layerProgress = Math.min(1, progress + (i * 0.2));
            const layerRadius = fx.radius * layerProgress;

            if (layerProgress < 1) {
              G.ctx.fillStyle = `rgba(${parseInt(fx.color.slice(1, 3), 16)}, ${parseInt(fx.color.slice(3, 5), 16)}, ${parseInt(fx.color.slice(5, 7), 16)}, ${0.8 - (i * 0.2)})`;
              G.ctx.beginPath();
              G.ctx.arc(fx.x, fx.y, layerRadius, 0, Math.PI * 2);
              G.ctx.fill();
            }
          }

          // Add glow effect
          G.ctx.shadowColor = fx.color;
          G.ctx.shadowBlur = 20;
          G.ctx.fillStyle = fx.color;
          G.ctx.beginPath();
          G.ctx.arc(fx.x, fx.y, fx.radius * progress * 0.5, 0, Math.PI * 2);
          G.ctx.fill();
          G.ctx.shadowBlur = 0;

          G.ctx.globalAlpha = 1;
        } else if (fx.type === 'abilityEffect') {
          // Ability casting circle animation
          G.ctx.globalAlpha = alpha * 0.5;

          // Create a multi-layered circle effect
          const layers = 4;
          for (let i = 0; i < layers; i++) {
            const layerProgress = Math.min(1, progress + (i * 0.15));
            const layerRadius = fx.radius * (1 - layerProgress);

            if (layerProgress < 1) {
              G.ctx.strokeStyle = fx.color;
              G.ctx.lineWidth = 1 + (i * 0.5);
              G.ctx.beginPath();
              G.ctx.arc(fx.x, fx.y, layerRadius, 0, Math.PI * 2);
              G.ctx.stroke();
            }
          }

          // Add glow effect
          G.ctx.shadowColor = fx.color;
          G.ctx.shadowBlur = 15;
          G.ctx.strokeStyle = fx.color;
          G.ctx.lineWidth = 2;
          G.ctx.beginPath();
          G.ctx.arc(fx.x, fx.y, fx.radius * (1 - progress), 0, Math.PI * 2);
          G.ctx.stroke();
          G.ctx.shadowBlur = 0;

          G.ctx.globalAlpha = 1;
        } else if (fx.type === 'hitEffect') {
          // Hit effect animation
          G.ctx.globalAlpha = alpha * 0.8;
          G.ctx.fillStyle = fx.color;
          G.ctx.beginPath();
          G.ctx.arc(fx.x, fx.y, 15 * (1 - progress), 0, Math.PI * 2);
          G.ctx.fill();

          // Add glow effect
          G.ctx.shadowColor = fx.color;
          G.ctx.shadowBlur = 15;
          G.ctx.beginPath();
          G.ctx.arc(fx.x, fx.y, 15 * (1 - progress), 0, Math.PI * 2);
          G.ctx.fill();
          G.ctx.shadowBlur = 0;
          G.ctx.globalAlpha = 1;
        } else if (fx.type === 'unitScale') {
          // Unit scaling animation
          const scale = 1 + (0.5 * progress);
          G.ctx.globalAlpha = alpha;
          // This would be handled by drawing the unit with scaling
          G.ctx.globalAlpha = 1;
        }
      });
    }

    // Draw round banner
    if (G.roundBanner) {
      const now = Date.now();
      const elapsed = now - G.roundBanner.startTime;
      if (elapsed < G.roundBanner.duration) {
        const progress = elapsed / G.roundBanner.duration;
        // Fade in for first 20%, hold, fade out for last 20%
        let alpha = 1;
        if (progress < 0.2) alpha = progress / 0.2;
        else if (progress > 0.8) alpha = (1 - progress) / 0.2;

        G.ctx.globalAlpha = alpha;

        // Dark banner background
        G.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        G.ctx.fillRect(0, G.canvas.height / 2 - 40, G.canvas.width, 80);

        // Add glow effect to banner
        G.ctx.shadowColor = G.roundBanner.color || '#fff';
        G.ctx.shadowBlur = 12;

        // Banner text
        G.ctx.fillStyle = G.roundBanner.color || '#fff';
        G.ctx.font = 'bold 36px Arial';
        G.ctx.textAlign = 'center';
        G.ctx.textBaseline = 'middle';
        G.ctx.fillText(G.roundBanner.text, G.canvas.width / 2, G.canvas.height / 2);

        G.ctx.shadowBlur = 0;

        // Subtext if present
        if (G.roundBanner.subtext) {
          G.ctx.font = '18px Arial';
          G.ctx.fillStyle = '#aaa';
          G.ctx.fillText(G.roundBanner.subtext, G.canvas.width / 2, G.canvas.height / 2 + 28);
        }

        G.ctx.globalAlpha = 1;
      } else {
        G.roundBanner = null;
      }
    }
  }

  // ========== SHOP RENDERING ==========
  function renderShop() {
    const shopEl = document.getElementById('shop') || document.getElementById('shop-section');
    shopEl.innerHTML = '';
    G.shopUnits.forEach((id, shopIdx) => {
      if (!id) return; // Skip empty/purchased shop slots
      const u = unitsData[id];
      if (!u) return;
      const synergy = factionSynergies[u.faction];
      const div = document.createElement('div');
      div.className = 'unit';
      div.draggable = true;
      div.style.borderColor = synergy?.color || '#777';
      div.style.setProperty('--faction-color', synergy?.color || 'rgba(70,70,110,0.5)');
      div.dataset.shopIndex = shopIdx; // Track actual shop position
      const hasPortrait = G.unitImages && G.unitImages[id];
      const iconHtml = hasPortrait
        ? `<img src="portraits/${id}.png" alt="${u.name}" style="width:72px;height:72px;border-radius:6px;object-fit:cover;border:1px solid #484f58;">`
        : u.icon;
      div.innerHTML = `
        <div class="unit-icon">${iconHtml}</div>
        <div class="unit-name">${u.name}</div>
        <div class="unit-cost">${u.cost}g</div>
        <div class="unit-faction" style="color: ${synergy?.color || '#aaa'}">${synergy?.icon || ''} ${u.faction}</div>
      `;
      let wasDragged = false;
      div.addEventListener('dragstart', e => {
        wasDragged = true;
        G.draggedUnit = { fromShop: true, id, cost: u.cost, shopIndex: shopIdx };
        e.dataTransfer.setData('text/plain', id);
        window.TooltipSystem.hideTooltip();
      });
      div.addEventListener('click', e => {
        if (wasDragged) { wasDragged = false; return; }
        if (G.combatState !== 'idle') return;
        window.TooltipSystem.hideTooltip();
        // Click-to-buy: purchase unit to bench
        if (window.NetworkManager.isOnline) {
          window.NetworkManager.send({ type: 'buy', shopIndex: shopIdx });
        } else if (G.gold >= u.cost) {
          if (window.MergeSystem.tryAddUnit(id)) {
            G.gold -= u.cost;
            G.shopUnits[shopIdx] = G.rollShopUnit();
            renderShop();
            renderBench();
            renderBoard();
            window.SynergySystem.renderSynergies();
            updateUI();
            if (window.GameState.mode === 'multiplayer') {
              const human = window.GameState.getHumanPlayer();
              human.gold = G.gold;
              human.bench = [...G.bench];
              human.shop = [...G.shopUnits];
            }
          }
        }
      });
      div.addEventListener('mouseenter', e => {
        window.TooltipSystem.showTooltip(id, e.clientX, e.clientY);
      });
      div.addEventListener('mousemove', e => {
        if (window.TooltipSystem.isTooltipVisible()) {
          window.TooltipSystem.showTooltip(id, e.clientX, e.clientY);
        }
      });
      div.addEventListener('mouseleave', () => {
        window.TooltipSystem.hideTooltip();
      });
      // Touch support for mobile
      if (typeof window.InputSystem !== 'undefined' && typeof window.InputSystem.addShopTouchHandlers === 'function') {
        window.InputSystem.addShopTouchHandlers(div, id, u.cost);
      } else if (typeof addShopTouchHandlers === 'function') {
        addShopTouchHandlers(div, id, u.cost);
      }
      shopEl.appendChild(div);
    });
  }

  // Get max units allowed based on player level (level 1 = 3 units, level 2 = 4, etc.)
  function getMaxUnits() {
    return G.playerLevel + 2;
  }

  // Get current unit count on board
  function getUnitCount() {
    return Object.keys(G.playerBoard).length;
  }

  // Check if we can place another unit
  function canPlaceUnit() {
    return getUnitCount() < getMaxUnits();
  }

  // ========== BENCH RENDERING ==========
  function renderBench() {
    const slots = document.querySelectorAll('.bench-slot');
    slots.forEach((slot, index) => {
      const unit = G.bench[index];
      slot.innerHTML = '';
      slot.classList.remove('occupied');
      slot.classList.remove('drag-over');

      if (unit) {
        const data = unitsData[unit.id];
        slot.classList.add('occupied');
        slot.style.borderColor = data.color;

        const starText = '\u2B50'.repeat(unit.stars);
        const hasPortrait = G.unitImages && G.unitImages[unit.id];
        const iconHtml = hasPortrait
          ? `<img src="portraits/${unit.id}.png" alt="${data.name}" style="width:60px;height:60px;border-radius:6px;object-fit:cover;">`
          : `<span class="bench-unit">${data.icon}</span>`;
        slot.innerHTML = `
          ${iconHtml}
          <span class="bench-unit-stars">${starText}</span>
          <span class="bench-unit-cost">${data.cost}g</span>
        `;
      } else {
        slot.style.borderColor = '';
      }
    });
  }

  // ========== SWAP ANIMATIONS ==========
  // Trigger a swap slide animation between two board hex positions
  function triggerSwapAnimation(unitId, stars, fromHexKey, toHexKey) {
    const fromHex = G.boardHexes.find(h => window.HexBoard.getHexKey(h) === fromHexKey);
    const toHex = G.boardHexes.find(h => window.HexBoard.getHexKey(h) === toHexKey);
    if (!fromHex || !toHex) return;
    const fp = window.HexBoard.hexToPixel(fromHex);
    const tp = window.HexBoard.hexToPixel(toHex);
    G.swapAnimations.push({
      unitId, stars,
      fromX: fp.x, fromY: fp.y,
      toX: tp.x, toY: tp.y,
      startTime: Date.now(),
      duration: G.SWAP_ANIM_DURATION
    });
  }

  // Trigger swap animation for a unit sliding from board hex to bench slot position
  function triggerBenchSwapAnimation(unitId, stars, fromHexKey, benchSlotIndex) {
    const fromHex = G.boardHexes.find(h => window.HexBoard.getHexKey(h) === fromHexKey);
    if (!fromHex) return;
    const fp = window.HexBoard.hexToPixel(fromHex);
    const slot = document.querySelector(`.bench-slot[data-slot="${benchSlotIndex}"]`);
    if (!slot) return;
    const slotRect = slot.getBoundingClientRect();
    const canvasRect = G.canvas.getBoundingClientRect();
    // Convert bench slot screen position to canvas coords
    const toX = (slotRect.left + slotRect.width / 2 - canvasRect.left) * (G.canvas.width / canvasRect.width);
    const toY = (slotRect.top + slotRect.height / 2 - canvasRect.top) * (G.canvas.height / canvasRect.height);
    G.swapAnimations.push({
      unitId, stars,
      fromX: fp.x, fromY: fp.y,
      toX, toY,
      startTime: Date.now(),
      duration: G.SWAP_ANIM_DURATION
    });
  }

  // ========== DRAG GHOST ==========
  function showDragGhost(unitId, x, y) {
    removeDragGhost();
    dragGhostEl = document.createElement('div');
    dragGhostEl.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;opacity:0.85;transform:translate(-50%,-50%);';
    const data = unitsData[unitId];

    // Prefer sprite sheet idle frame, then portrait, then emoji
    const sheet = G.spriteSheets[unitId];
    const animConfig = G.unitAnimConfig?.units?.[unitId];
    if (sheet && sheet.complete && animConfig) {
      // Extract idle frame 0 from sprite sheet onto a small canvas
      const ghostCanvas = document.createElement('canvas');
      ghostCanvas.width = 64;
      ghostCanvas.height = 64;
      const gctx = ghostCanvas.getContext('2d');
      const idleRow = animConfig.animations.idle?.row || 0;
      gctx.drawImage(sheet, 0, idleRow * G.SPRITE_CELL, G.SPRITE_CELL, G.SPRITE_CELL, 0, 0, 64, 64);
      dragGhostEl.innerHTML = '';
      ghostCanvas.style.cssText = `width:60px;height:60px;border-radius:8px;border:2px solid ${data.color};box-shadow:0 4px 12px rgba(0,0,0,0.6);background:rgba(0,0,0,0.3);`;
      dragGhostEl.appendChild(ghostCanvas);
    } else if (G.unitImages && G.unitImages[unitId]) {
      dragGhostEl.innerHTML = `<img src="portraits/${unitId}.png" style="width:56px;height:56px;border-radius:6px;border:2px solid ${data.color};box-shadow:0 2px 8px rgba(0,0,0,0.5);">`;
    } else {
      dragGhostEl.innerHTML = `<div style="font-size:32px;background:${data.color};border-radius:6px;padding:4px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);">${data.icon}</div>`;
    }
    dragGhostEl.style.left = x + 'px';
    dragGhostEl.style.top = y + 'px';
    document.body.appendChild(dragGhostEl);
  }

  function moveDragGhost(x, y) {
    if (dragGhostEl) {
      dragGhostEl.style.left = x + 'px';
      dragGhostEl.style.top = y + 'px';
    }
  }

  function removeDragGhost() {
    if (dragGhostEl) {
      dragGhostEl.remove();
      dragGhostEl = null;
    }
  }

  // ========== ERROR TOAST ==========
  function showErrorToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(200,40,40,0.9);color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:bold;z-index:9999;pointer-events:none;transition:opacity 0.5s;';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, 1500);
    setTimeout(() => { toast.remove(); }, 2000);
  }

  // ========== UI UPDATE ==========
  function updateUI() {
    document.getElementById('round').textContent = G.currentRound;
    document.getElementById('gold').textContent = G.gold;
    document.getElementById('health').textContent = G.health;
    document.getElementById('level').textContent = G.playerLevel;
    const unitCapEl = document.getElementById('unitcap');
    unitCapEl.textContent = `${getUnitCount()}/${getMaxUnits()}`;
    // Color code: green if room, yellow if close, red if at cap
    const ratio = getUnitCount() / getMaxUnits();
    unitCapEl.style.color = ratio >= 1 ? '#f44' : ratio >= 0.8 ? '#ff0' : '#4f4';
    document.getElementById('reroll').disabled = G.gold < 2;
    const lvlCost = 4 * Math.pow(2, G.playerLevel - 1);  // Doubles each level: 4, 8, 16, 32...
    document.getElementById('levelup').textContent = `LEVEL UP (${lvlCost}g)`;
    document.getElementById('levelup').disabled = G.gold < lvlCost || G.playerLevel >= 9;
    document.getElementById('fight').disabled = G.combatState !== 'idle';

    // Sync human player state to GameState in multiplayer mode
    if (typeof window.GameState !== 'undefined' && window.GameState.mode === 'multiplayer') {
      const human = window.GameState.getHumanPlayer();
      if (human) {
        human.board = { ...G.playerBoard };
        human.bench = [...G.bench];
        human.gold = G.gold;
        human.level = G.playerLevel;
        human.health = G.health;
      }
    }
  }

  // ========== PUBLIC API ==========
  window.RenderSystem = {
    renderBoard,
    renderShop,
    getMaxUnits,
    getUnitCount,
    canPlaceUnit,
    renderBench,
    triggerSwapAnimation,
    triggerBenchSwapAnimation,
    showDragGhost,
    moveDragGhost,
    removeDragGhost,
    showErrorToast,
    updateUI
  };

})();
