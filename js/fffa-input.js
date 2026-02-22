/* =========================================================
   fffa-input.js  --  Mouse, Touch & Control-Button Handlers
   ========================================================= */
(function () {
  'use strict';

  const G = window.FFFA;

  // ---- module-private state ----
  let touchDragEl = null;

  // ===== TOUCH DRAG HELPERS =====

  function createTouchDragIndicator(icon, x, y, unitId) {
    if (touchDragEl) touchDragEl.remove();
    touchDragEl = document.createElement('div');
    touchDragEl.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;opacity:0.85;transform:translate(-50%,-50%);';

    // Prefer sprite sheet idle frame (matching mouse drag ghost)
    const sheet = unitId ? G.spriteSheets[unitId] : null;
    const animConfig = unitId ? G.unitAnimConfig?.units?.[unitId] : null;
    const data = unitId ? unitsData[unitId] : null;

    if (sheet && sheet.complete && animConfig && data) {
      const ghostCanvas = document.createElement('canvas');
      ghostCanvas.width = 64;
      ghostCanvas.height = 64;
      const gctx = ghostCanvas.getContext('2d');
      const idleRow = animConfig.animations.idle?.row || 0;
      gctx.drawImage(sheet, 0, idleRow * G.SPRITE_CELL, G.SPRITE_CELL, G.SPRITE_CELL, 0, 0, 64, 64);
      ghostCanvas.style.cssText = `width:60px;height:60px;border-radius:8px;border:2px solid ${data.color};box-shadow:0 4px 12px rgba(0,0,0,0.6);background:rgba(0,0,0,0.3);`;
      touchDragEl.appendChild(ghostCanvas);
    } else {
      // Fallback to emoji icon
      touchDragEl.style.fontSize = '32px';
      touchDragEl.style.textShadow = '0 2px 8px rgba(0,0,0,0.8)';
      touchDragEl.textContent = icon;
    }

    touchDragEl.style.left = x + 'px';
    touchDragEl.style.top = y + 'px';
    document.body.appendChild(touchDragEl);
  }

  function moveTouchDragIndicator(x, y) {
    if (touchDragEl) {
      touchDragEl.style.left = x + 'px';
      touchDragEl.style.top = y + 'px';
    }
  }

  function removeTouchDragIndicator() {
    if (touchDragEl) { touchDragEl.remove(); touchDragEl = null; }
  }

  function getElementAtPoint(x, y, selector) {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
    }
    return null;
  }

  // ===== TOUCH DROP HANDLER (shared by canvas, bench, shop) =====

  function handleTouchDrop(clientX, clientY) {
    removeTouchDragIndicator();

    const sellZone = document.getElementById('sell-zone');
    const sellRect = sellZone.getBoundingClientRect();

    // Reuse the mouseup logic -- simulate the drop
    if (G.draggedUnit.fromBoard) {
      if (sellZone.classList.contains('active') &&
          clientX >= sellRect.left && clientX <= sellRect.right &&
          clientY >= sellRect.top && clientY <= sellRect.bottom) {
        // Sell
        if (window.NetworkManager.isOnline) {
          window.NetworkManager.send({ type: 'sell_board', hexKey: G.draggedUnit.oldKey });
        } else {
          const sellValue = getSellValue(G.draggedUnit.cost, G.draggedUnit.stars);
          G.gold += sellValue;
          delete G.playerBoard[G.draggedUnit.oldKey];
        }
      } else {
        // Check bench drop
        let droppedOnBench = false;
        document.querySelectorAll('.bench-slot').forEach((slot, index) => {
          const slotRect = slot.getBoundingClientRect();
          if (clientX >= slotRect.left && clientX <= slotRect.right &&
              clientY >= slotRect.top && clientY <= slotRect.bottom) {
            droppedOnBench = true;
            if (window.NetworkManager.isOnline) {
              window.NetworkManager.send({ type: 'board_to_bench', hexKey: G.draggedUnit.oldKey, benchIndex: index });
            } else {
              const benchUnit = G.bench[index];
              if (benchUnit === null) {
                G.bench[index] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
                delete G.playerBoard[G.draggedUnit.oldKey];
              } else {
                G.bench[index] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
                G.playerBoard[G.draggedUnit.oldKey] = { id: benchUnit.id, stars: benchUnit.stars };
              }
            }
          }
        });
        if (!droppedOnBench) {
          // Board-to-board move
          const rect = G.canvas.getBoundingClientRect();
          const scaleX = G.canvas.width / rect.width;
          const scaleY = G.canvas.height / rect.height;
          const raw = window.HexBoard.pixelToHex((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
          const hex = window.HexBoard.getNearestHex(raw);
          if (hex && G.playerRows.includes(hex.row)) {
            const newKey = window.HexBoard.getHexKey(hex);
            if (newKey !== G.draggedUnit.oldKey) {
              if (window.NetworkManager.isOnline) {
                window.NetworkManager.send({ type: 'move', fromHex: G.draggedUnit.oldKey, toHex: newKey });
              } else {
                const targetUnit = G.playerBoard[newKey];
                if (!targetUnit) {
                  delete G.playerBoard[G.draggedUnit.oldKey];
                  G.playerBoard[newKey] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
                } else {
                  window.RenderSystem.triggerSwapAnimation(targetUnit.id, targetUnit.stars, newKey, G.draggedUnit.oldKey);
                  G.playerBoard[newKey] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
                  G.playerBoard[G.draggedUnit.oldKey] = { id: targetUnit.id, stars: targetUnit.stars };
                }
              }
            }
          }
        }
      }
    } else if (G.draggedUnit.fromBench) {
      // Check board drop
      const rect = G.canvas.getBoundingClientRect();
      const scaleX = G.canvas.width / rect.width;
      const scaleY = G.canvas.height / rect.height;
      if (clientX >= rect.left && clientX <= rect.right &&
          clientY >= rect.top && clientY <= rect.bottom) {
        const raw = window.HexBoard.pixelToHex((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
        const hex = window.HexBoard.getNearestHex(raw);
        if (hex && G.playerRows.includes(hex.row)) {
          const key = window.HexBoard.getHexKey(hex);
          if (window.NetworkManager.isOnline) {
            window.NetworkManager.send({ type: 'place', benchIndex: G.draggedUnit.slotIndex, hexKey: key });
          } else {
            const boardUnit = G.playerBoard[key];
            if (!boardUnit) {
              if (window.RenderSystem.canPlaceUnit()) {
                G.playerBoard[key] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
                G.bench[G.draggedUnit.slotIndex] = null;
              }
            } else {
              window.RenderSystem.triggerBenchSwapAnimation(boardUnit.id, boardUnit.stars, key, G.draggedUnit.slotIndex);
              G.playerBoard[key] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
              G.bench[G.draggedUnit.slotIndex] = { id: boardUnit.id, stars: boardUnit.stars };
            }
          }
        }
      } else {
        // Check sell zone
        if (sellZone.classList.contains('active') &&
            clientX >= sellRect.left && clientX <= sellRect.right &&
            clientY >= sellRect.top && clientY <= sellRect.bottom) {
          if (window.NetworkManager.isOnline) {
            window.NetworkManager.send({ type: 'sell_bench', benchIndex: G.draggedUnit.slotIndex });
          } else {
            const sellValue = getSellValue(G.draggedUnit.cost, G.draggedUnit.stars || 1);
            G.gold += sellValue;
            G.bench[G.draggedUnit.slotIndex] = null;
          }
        } else {
          // Check bench-to-bench swap
          document.querySelectorAll('.bench-slot').forEach((targetSlot, targetIndex) => {
            const slotRect = targetSlot.getBoundingClientRect();
            if (clientX >= slotRect.left && clientX <= slotRect.right &&
                clientY >= slotRect.top && clientY <= slotRect.bottom) {
              if (targetIndex !== G.draggedUnit.slotIndex) {
                if (window.NetworkManager.isOnline) {
                  window.NetworkManager.send({ type: 'bench_swap', fromIndex: G.draggedUnit.slotIndex, toIndex: targetIndex });
                } else {
                  const targetUnit = G.bench[targetIndex];
                  G.bench[targetIndex] = G.bench[G.draggedUnit.slotIndex];
                  G.bench[G.draggedUnit.slotIndex] = targetUnit;
                }
              }
            }
          });
        }
      }
      const slot = document.querySelector(`.bench-slot[data-slot="${G.draggedUnit.slotIndex}"]`);
      if (slot) slot.style.opacity = '1';
    } else if (G.draggedUnit.fromShop) {
      // Check board drop
      const rect = G.canvas.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right &&
          clientY >= rect.top && clientY <= rect.bottom) {
        const scaleX = G.canvas.width / rect.width;
        const scaleY = G.canvas.height / rect.height;
        const raw = window.HexBoard.pixelToHex((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
        const hex = window.HexBoard.getNearestHex(raw);
        if (hex && G.playerRows.includes(hex.row) && window.RenderSystem.canPlaceUnit()) {
          const key = window.HexBoard.getHexKey(hex);
          if (!G.playerBoard[key]) {
            if (window.NetworkManager.isOnline) {
              const shopIdx = G.shopUnits.indexOf(G.draggedUnit.id);
              if (shopIdx > -1) window.NetworkManager.send({ type: 'buy', shopIndex: shopIdx });
            } else if (G.gold >= G.draggedUnit.cost) {
              if (window.MergeSystem.tryAddUnit(G.draggedUnit.id)) {
                G.gold -= G.draggedUnit.cost;
                const benchIdx = G.bench.findIndex(b => b && b.id === G.draggedUnit.id);
                if (benchIdx !== -1) {
                  G.playerBoard[key] = G.bench[benchIdx];
                  G.bench[benchIdx] = null;
                }
                const shopIndex = G.shopUnits.indexOf(G.draggedUnit.id);
                if (shopIndex > -1) G.shopUnits[shopIndex] = G.rollShopUnit();
                window.RenderSystem.renderShop();
              }
            }
          }
        }
      } else {
        // Check bench drop
        const benchEl = getElementAtPoint(clientX, clientY, '.bench-slot');
        if (benchEl) {
          const benchIndex = parseInt(benchEl.dataset.slot);
          if (G.bench[benchIndex] === null) {
            if (window.NetworkManager.isOnline) {
              const shopIdx = G.shopUnits.indexOf(G.draggedUnit.id);
              if (shopIdx > -1) window.NetworkManager.send({ type: 'buy', shopIndex: shopIdx });
            } else if (G.gold >= G.draggedUnit.cost) {
              if (window.MergeSystem.tryAddUnit(G.draggedUnit.id)) {
                G.gold -= G.draggedUnit.cost;
                const shopIndex = G.shopUnits.indexOf(G.draggedUnit.id);
                if (shopIndex > -1) G.shopUnits[shopIndex] = G.rollShopUnit();
                window.RenderSystem.renderShop();
              }
            }
          }
        }
      }
    }

    // Cleanup
    sellZone.classList.remove('active', 'drag-over');
    document.querySelectorAll('.bench-slot').forEach(s => s.classList.remove('drag-over', 'drag-over-swap'));
    G.draggedUnit = null;
    G.highlightHex = null;
    G.swapTargetInfo = null;
    window.RenderSystem.renderBench();
    window.RenderSystem.renderBoard();
    window.SynergySystem.renderSynergies();
    window.RenderSystem.updateUI();
  }

  // ===== BENCH EVENTS =====

  function setupBenchEvents() {
    const slots = document.querySelectorAll('.bench-slot');
    const sellZone = document.getElementById('sell-zone');

    slots.forEach((slot, index) => {
      // Drag start from bench
      slot.addEventListener('mousedown', e => {
        const unit = G.bench[index];
        if (unit && G.combatState === 'idle') {
          e.preventDefault();
          G.draggedUnit = {
            fromBench: true,
            id: unit.id,
            stars: unit.stars,
            slotIndex: index,
            cost: unitsData[unit.id].cost
          };
          sellZone.classList.add('active');
          slot.style.opacity = '0.5';
          window.TooltipSystem.hideTooltip();
          // Create visual drag ghost
          window.RenderSystem.showDragGhost(unit.id, e.clientX, e.clientY);
        }
      });

      // Hover for tooltip
      slot.addEventListener('mouseenter', e => {
        const unit = G.bench[index];
        if (unit && !G.draggedUnit) {
          window.TooltipSystem.showTooltip(unit.id, e.clientX, e.clientY);
        }
      });

      slot.addEventListener('mousemove', e => {
        const unit = G.bench[index];
        if (unit && window.TooltipSystem.isTooltipVisible() && !G.draggedUnit) {
          window.TooltipSystem.showTooltip(unit.id, e.clientX, e.clientY);
        }
      });

      slot.addEventListener('mouseleave', () => {
        window.TooltipSystem.hideTooltip();
      });

      // Drop onto bench slot
      slot.addEventListener('dragover', e => {
        e.preventDefault();
        slot.classList.add('drag-over');
      });

      slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-over');
      });

      slot.addEventListener('drop', e => {
        e.preventDefault();
        slot.classList.remove('drag-over');

        if (G.draggedUnit?.fromShop && G.bench[index] === null) {
          if (window.NetworkManager.isOnline) {
            // Online: send buy to server
            const shopIdx = G.draggedUnit.shopIndex !== undefined ? G.draggedUnit.shopIndex : G.shopUnits.indexOf(G.draggedUnit.id);
            if (shopIdx > -1) {
              window.NetworkManager.send({ type: 'buy', shopIndex: shopIdx });
            }
          } else {
            // Offline: local buy
            if (G.gold >= G.draggedUnit.cost) {
              if (window.MergeSystem.tryAddUnit(G.draggedUnit.id)) {
                G.gold -= G.draggedUnit.cost;
                const shopIndex = G.shopUnits.indexOf(G.draggedUnit.id);
                if (shopIndex > -1) G.shopUnits[shopIndex] = G.rollShopUnit();
                window.RenderSystem.renderShop();
                window.RenderSystem.renderBench();
                window.RenderSystem.updateUI();
              }
            }
          }
        }
        G.draggedUnit = null;
      });
    });

    // Sell zone events
    sellZone.addEventListener('dragover', e => {
      e.preventDefault();
      sellZone.classList.add('drag-over');
    });

    sellZone.addEventListener('dragleave', () => {
      sellZone.classList.remove('drag-over');
    });

    sellZone.addEventListener('drop', e => {
      e.preventDefault();
      sellZone.classList.remove('drag-over');
      sellZone.classList.remove('active');

      if (G.draggedUnit) {
        if (window.NetworkManager.isOnline) {
          if (G.draggedUnit.fromBench) {
            window.NetworkManager.send({ type: 'sell_bench', benchIndex: G.draggedUnit.slotIndex });
          } else if (G.draggedUnit.fromBoard) {
            window.NetworkManager.send({ type: 'sell_board', hexKey: G.draggedUnit.oldKey });
          }
        } else {
          const sellValue = getSellValue(G.draggedUnit.cost, G.draggedUnit.stars || 1);
          G.gold += sellValue;

          if (G.draggedUnit.fromBench) {
            G.bench[G.draggedUnit.slotIndex] = null;
          } else if (G.draggedUnit.fromBoard) {
            delete G.playerBoard[G.draggedUnit.oldKey];
          }

          window.RenderSystem.renderBench();
          window.RenderSystem.renderBoard();
          window.SynergySystem.renderSynergies();
          window.RenderSystem.updateUI();
        }
      }
      G.draggedUnit = null;
    });

    // Global mouseup to handle bench drag end
    document.addEventListener('mouseup', e => {
      if (G.draggedUnit?.fromBench) {
        const slot = document.querySelector(`.bench-slot[data-slot="${G.draggedUnit.slotIndex}"]`);
        if (slot) slot.style.opacity = '1';

        // Check if dropped on board
        const rect = G.canvas.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const scaleX = G.canvas.width / rect.width;
          const scaleY = G.canvas.height / rect.height;
          const raw = window.HexBoard.pixelToHex((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
          const hex = window.HexBoard.getNearestHex(raw);

          if (hex && G.playerRows.includes(hex.row)) {
            const key = window.HexBoard.getHexKey(hex);

            if (window.NetworkManager.isOnline) {
              window.NetworkManager.send({ type: 'place', benchIndex: G.draggedUnit.slotIndex, hexKey: key });
            } else {
              const boardUnit = G.playerBoard[key];

              if (!boardUnit) {
                // Move from bench to empty board slot (if within cap)
                if (window.RenderSystem.canPlaceUnit()) {
                  G.playerBoard[key] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
                  G.bench[G.draggedUnit.slotIndex] = null;

                  // Check for merge on board
                  const matches = window.MergeSystem.checkForMerge(G.draggedUnit.id, G.draggedUnit.stars);
                  if (matches) {
                    window.MergeSystem.performMerge(matches, G.draggedUnit.id, G.draggedUnit.stars);
                  }
                }
              } else {
                // Swap bench unit with board unit -- animate the displaced unit
                window.RenderSystem.triggerBenchSwapAnimation(boardUnit.id, boardUnit.stars, key, G.draggedUnit.slotIndex);
                G.playerBoard[key] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
                G.bench[G.draggedUnit.slotIndex] = { id: boardUnit.id, stars: boardUnit.stars };

                // Check for merges after swap
                const boardMatches = window.MergeSystem.checkForMerge(G.draggedUnit.id, G.draggedUnit.stars);
                if (boardMatches) {
                  window.MergeSystem.performMerge(boardMatches, G.draggedUnit.id, G.draggedUnit.stars);
                }
                const benchMatches = window.MergeSystem.checkForMerge(boardUnit.id, boardUnit.stars);
                if (benchMatches) {
                  window.MergeSystem.performMerge(benchMatches, boardUnit.id, boardUnit.stars);
                }
              }
            }
          }
        }

        // Check if dropped on another bench slot
        const benchSlots = document.querySelectorAll('.bench-slot');
        benchSlots.forEach((targetSlot, targetIndex) => {
          const slotRect = targetSlot.getBoundingClientRect();
          if (e.clientX >= slotRect.left && e.clientX <= slotRect.right &&
              e.clientY >= slotRect.top && e.clientY <= slotRect.bottom) {
            if (targetIndex !== G.draggedUnit.slotIndex) {
              if (window.NetworkManager.isOnline) {
                window.NetworkManager.send({ type: 'bench_swap', fromIndex: G.draggedUnit.slotIndex, toIndex: targetIndex });
              } else {
                // Swap or move
                const targetUnit = G.bench[targetIndex];
                G.bench[targetIndex] = G.bench[G.draggedUnit.slotIndex];
                G.bench[G.draggedUnit.slotIndex] = targetUnit;
              }
            }
          }
        });

        sellZone.classList.remove('active');
        window.RenderSystem.renderBench();
        window.RenderSystem.renderBoard();
        window.SynergySystem.renderSynergies();
        window.RenderSystem.updateUI();
        G.draggedUnit = null;
      }
    });
  }

  // ===== SHOP TOUCH HANDLERS (called from renderShop) =====

  function addShopTouchHandlers(div, unitId, cost) {
    div.addEventListener('touchstart', e => {
      if (G.combatState !== 'idle') return;
      e.preventDefault();
      const t = e.touches[0];
      const unitDef = unitsData[unitId];
      G.draggedUnit = { fromShop: true, id: unitId, cost: cost };
      createTouchDragIndicator(unitDef.icon, t.clientX, t.clientY, unitId);
    }, { passive: false });

    div.addEventListener('touchmove', e => {
      if (!G.draggedUnit) return;
      e.preventDefault();
      const t = e.touches[0];
      moveTouchDragIndicator(t.clientX, t.clientY);

      const rect = G.canvas.getBoundingClientRect();
      const scaleX = G.canvas.width / rect.width;
      const scaleY = G.canvas.height / rect.height;
      if (t.clientX >= rect.left && t.clientX <= rect.right &&
          t.clientY >= rect.top && t.clientY <= rect.bottom) {
        const raw = window.HexBoard.pixelToHex((t.clientX - rect.left) * scaleX, (t.clientY - rect.top) * scaleY);
        const hex = window.HexBoard.getNearestHex(raw);
        G.highlightHex = (hex && G.playerRows.includes(hex.row)) ? hex : null;
      } else {
        G.highlightHex = null;
      }

      document.querySelectorAll('.bench-slot').forEach(s => s.classList.remove('drag-over', 'drag-over-swap'));
      const benchTarget = getElementAtPoint(t.clientX, t.clientY, '.bench-slot');
      if (benchTarget) benchTarget.classList.add('drag-over');

      window.RenderSystem.renderBoard();
    }, { passive: false });

    div.addEventListener('touchend', e => {
      if (!G.draggedUnit || !G.draggedUnit.fromShop) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      handleTouchDrop(t.clientX, t.clientY);
    }, { passive: false });
  }

  // ===== INIT: Wire up all global event listeners =====

  function initInputHandlers() {
    // --- Global mousemove for drag ghost ---
    document.addEventListener('mousemove', e => {
      if (G.draggedUnit) {
        window.RenderSystem.moveDragGhost(e.clientX, e.clientY);
        // Highlight bench slots during drag (swap-aware)
        document.querySelectorAll('.bench-slot').forEach((slot, idx) => {
          slot.classList.remove('drag-over', 'drag-over-swap');
          const r = slot.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            if (G.draggedUnit.fromBench && idx === G.draggedUnit.slotIndex) return; // same slot
            const benchUnit = G.bench[idx];
            slot.classList.add(benchUnit ? 'drag-over-swap' : 'drag-over');
          }
        });
      }
    });

    // --- Global mouseup cleanup for drag ghost + stale drag state ---
    document.addEventListener('mouseup', () => {
      window.RenderSystem.removeDragGhost();
      G.swapTargetInfo = null;
      document.querySelectorAll('.bench-slot').forEach(s => s.classList.remove('drag-over', 'drag-over-swap'));
      // Clean up stale drag state (e.g. drag started from shop but not dropped on board)
      if (G.draggedUnit) {
        G.draggedUnit = null;
        G.highlightHex = null;
        G.canvas.style.cursor = 'default';
        document.getElementById('sell-zone').classList.remove('active');
        window.RenderSystem.renderBoard();
      }
    });

    // --- Escape key cancels any drag in progress ---
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && G.draggedUnit) {
        // Restore bench slot opacity
        if (G.draggedUnit.fromBench) {
          const slot = document.querySelector(`.bench-slot[data-slot="${G.draggedUnit.slotIndex}"]`);
          if (slot) slot.style.opacity = '1';
        }
        document.getElementById('sell-zone').classList.remove('active');
        window.RenderSystem.removeDragGhost();
        G.draggedUnit = null;
        G.highlightHex = null;
        G.swapTargetInfo = null;
        document.querySelectorAll('.bench-slot').forEach(s => s.classList.remove('drag-over', 'drag-over-swap'));
        window.RenderSystem.renderBoard();
        window.RenderSystem.renderBench();
      }
    });

    // --- Canvas mousedown ---
    G.canvas.addEventListener('mousedown', e => {
      if (G.draggedUnit || G.combatState !== 'idle') return;
      const rect = G.canvas.getBoundingClientRect();
      const scaleX = G.canvas.width / rect.width;
      const scaleY = G.canvas.height / rect.height;
      const raw = window.HexBoard.pixelToHex((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
      const hex = window.HexBoard.getNearestHex(raw);
      if (hex && G.playerRows.includes(hex.row)) {
        const key = window.HexBoard.getHexKey(hex);
        const unit = G.playerBoard[key];
        if (unit) {
          G.draggedUnit = {
            fromBoard: true,
            id: unit.id,
            stars: unit.stars,
            oldKey: key,
            cost: unitsData[unit.id].cost
          };
          document.getElementById('sell-zone').classList.add('active');
          window.TooltipSystem.hideTooltip();
          window.RenderSystem.showDragGhost(unit.id, e.clientX, e.clientY);
          window.RenderSystem.renderBoard();
        }
      }
    });

    // --- Canvas mousemove ---
    G.canvas.addEventListener('mousemove', e => {
      const rect = G.canvas.getBoundingClientRect();
      const scaleX = G.canvas.width / rect.width;
      const scaleY = G.canvas.height / rect.height;
      const raw = window.HexBoard.pixelToHex((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
      const hex = window.HexBoard.getNearestHex(raw);
      if (G.draggedUnit) {
        const isPlayerArea = hex && G.playerRows.includes(hex.row);

        let valid = false;
        G.swapTargetInfo = null;
        if (isPlayerArea) {
          const targetKey = window.HexBoard.getHexKey(hex);
          const targetUnit = G.playerBoard[targetKey];
          const isSameSpot = targetKey === G.draggedUnit.oldKey;

          if (G.draggedUnit.fromShop) {
            valid = !targetUnit && window.RenderSystem.canPlaceUnit();
          } else if (G.draggedUnit.fromBoard) {
            valid = !targetUnit || isSameSpot || (targetUnit && !isSameSpot);
            // Track swap target for visual feedback
            if (targetUnit && !isSameSpot) {
              G.swapTargetInfo = { unitId: targetUnit.id, stars: targetUnit.stars };
            }
          } else if (G.draggedUnit.fromBench) {
            valid = (!targetUnit && window.RenderSystem.canPlaceUnit()) || (targetUnit && true);
            if (targetUnit) {
              G.swapTargetInfo = { unitId: targetUnit.id, stars: targetUnit.stars };
            }
          }
        }

        G.highlightHex = valid ? hex : null;
        G.canvas.style.cursor = valid ? (G.swapTargetInfo ? 'pointer' : 'grab') : 'no-drop';
        window.TooltipSystem.hideTooltip();
      } else {
        G.highlightHex = null;
        G.canvas.style.cursor = 'default';

        // Show tooltip for units on board
        if (hex && G.combatState === 'idle') {
          const key = window.HexBoard.getHexKey(hex);
          const unitData = G.playerBoard[key] || G.enemyBoard[key];
          // Handle both object format {id, stars} and legacy string format
          const unitId = unitData ? (typeof unitData === 'object' ? unitData.id : unitData) : null;
          if (unitId && unitId !== G.hoveredBoardUnit) {
            G.hoveredBoardUnit = unitId;
            window.TooltipSystem.showTooltip(unitId, e.clientX, e.clientY);
          } else if (unitId && window.TooltipSystem.isTooltipVisible()) {
            // Update position while hovering same unit
            window.TooltipSystem.showTooltip(unitId, e.clientX, e.clientY);
          } else if (!unitId) {
            G.hoveredBoardUnit = null;
            window.TooltipSystem.hideTooltip();
          }
        } else if (!hex) {
          G.hoveredBoardUnit = null;
          window.TooltipSystem.hideTooltip();
        }
      }
      window.RenderSystem.renderBoard();
    });

    // --- Canvas mouseup (handles ALL drag types: fromBoard, fromShop, fromBench) ---
    G.canvas.addEventListener('mouseup', e => {
      if (!G.draggedUnit) return;

      const rect = G.canvas.getBoundingClientRect();
      const scaleX = G.canvas.width / rect.width;
      const scaleY = G.canvas.height / rect.height;
      const raw = window.HexBoard.pixelToHex((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
      const hex = window.HexBoard.getNearestHex(raw);
      const sellZone = document.getElementById('sell-zone');
      const sellRect = sellZone.getBoundingClientRect();
      const isOnSellZone = sellZone.classList.contains('active') &&
        e.clientX >= sellRect.left && e.clientX <= sellRect.right &&
        e.clientY >= sellRect.top && e.clientY <= sellRect.bottom;

      // --- SHOP → BOARD drop ---
      if (G.draggedUnit.fromShop) {
        if (hex && G.playerRows.includes(hex.row)) {
          const key = window.HexBoard.getHexKey(hex);
          if (!G.playerBoard[key] && window.RenderSystem.canPlaceUnit()) {
            if (window.NetworkManager.isOnline) {
              const shopIdx = G.draggedUnit.shopIndex !== undefined ? G.draggedUnit.shopIndex : G.shopUnits.indexOf(G.draggedUnit.id);
              if (shopIdx > -1) window.NetworkManager.send({ type: 'buy', shopIndex: shopIdx });
            } else if (G.gold >= G.draggedUnit.cost) {
              if (window.MergeSystem.tryAddUnit(G.draggedUnit.id)) {
                G.gold -= G.draggedUnit.cost;
                // Move from bench to the target board hex
                const benchIdx = G.bench.findIndex(b => b && b.id === G.draggedUnit.id);
                if (benchIdx !== -1) {
                  G.playerBoard[key] = G.bench[benchIdx];
                  G.bench[benchIdx] = null;
                  const matches = window.MergeSystem.checkForMerge(G.draggedUnit.id, G.playerBoard[key].stars);
                  if (matches) window.MergeSystem.performMerge(matches, G.draggedUnit.id, G.playerBoard[key].stars);
                }
                const sIdx = G.draggedUnit.shopIndex !== undefined ? G.draggedUnit.shopIndex : G.shopUnits.indexOf(G.draggedUnit.id);
                if (sIdx > -1) G.shopUnits[sIdx] = G.rollShopUnit();
                window.RenderSystem.renderShop();
                if (window.GameState.mode === 'multiplayer') {
                  const human = window.GameState.getHumanPlayer();
                  human.gold = G.gold; human.bench = [...G.bench]; human.shop = [...G.shopUnits];
                }
              }
            }
          }
        }
      }

      // --- BENCH → BOARD drop ---
      else if (G.draggedUnit.fromBench) {
        if (hex && G.playerRows.includes(hex.row)) {
          const key = window.HexBoard.getHexKey(hex);
          const targetUnit = G.playerBoard[key];
          if (window.NetworkManager.isOnline) {
            window.NetworkManager.send({ type: 'bench_to_board', benchIndex: G.draggedUnit.slotIndex, hexKey: key });
          } else {
            if (!targetUnit && window.RenderSystem.canPlaceUnit()) {
              // Place bench unit on empty board hex
              G.playerBoard[key] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
              G.bench[G.draggedUnit.slotIndex] = null;
              const matches = window.MergeSystem.checkForMerge(G.draggedUnit.id, G.draggedUnit.stars);
              if (matches) window.MergeSystem.performMerge(matches, G.draggedUnit.id, G.draggedUnit.stars);
            } else if (targetUnit) {
              // Swap bench unit with board unit
              G.playerBoard[key] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
              G.bench[G.draggedUnit.slotIndex] = { id: targetUnit.id, stars: targetUnit.stars };
              const matches = window.MergeSystem.checkForMerge(G.draggedUnit.id, G.draggedUnit.stars);
              if (matches) window.MergeSystem.performMerge(matches, G.draggedUnit.id, G.draggedUnit.stars);
            }
          }
        }
      }

      // --- BOARD → BOARD / SELL / BENCH drop ---
      else if (G.draggedUnit.fromBoard) {
        if (isOnSellZone) {
          if (window.NetworkManager.isOnline) {
            window.NetworkManager.send({ type: 'sell_board', hexKey: G.draggedUnit.oldKey });
          } else {
            const sellValue = getSellValue(G.draggedUnit.cost, G.draggedUnit.stars);
            G.gold += sellValue;
            delete G.playerBoard[G.draggedUnit.oldKey];
          }
          sellZone.classList.remove('active');
        } else {
          // Check if dropped on bench
          let droppedOnBench = false;
          const benchSlots = document.querySelectorAll('.bench-slot');
          benchSlots.forEach((slot, index) => {
            const slotRect = slot.getBoundingClientRect();
            if (e.clientX >= slotRect.left && e.clientX <= slotRect.right &&
                e.clientY >= slotRect.top && e.clientY <= slotRect.bottom) {
              droppedOnBench = true;
              if (window.NetworkManager.isOnline) {
                window.NetworkManager.send({ type: 'board_to_bench', hexKey: G.draggedUnit.oldKey, benchIndex: index });
              } else {
                const benchUnit = G.bench[index];
                if (benchUnit === null) {
                  G.bench[index] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
                  delete G.playerBoard[G.draggedUnit.oldKey];
                } else {
                  G.bench[index] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
                  G.playerBoard[G.draggedUnit.oldKey] = { id: benchUnit.id, stars: benchUnit.stars };
                  const matches = window.MergeSystem.checkForMerge(benchUnit.id, benchUnit.stars);
                  if (matches) window.MergeSystem.performMerge(matches, benchUnit.id, benchUnit.stars);
                }
              }
            }
          });

          if (!droppedOnBench && hex && G.playerRows.includes(hex.row)) {
            const newKey = window.HexBoard.getHexKey(hex);
            if (newKey !== G.draggedUnit.oldKey) {
              if (window.NetworkManager.isOnline) {
                window.NetworkManager.send({ type: 'move', fromHex: G.draggedUnit.oldKey, toHex: newKey });
              } else {
                const targetUnit = G.playerBoard[newKey];
                if (!targetUnit) {
                  delete G.playerBoard[G.draggedUnit.oldKey];
                  G.playerBoard[newKey] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
                } else {
                  // Board-to-board swap
                  window.RenderSystem.triggerSwapAnimation(targetUnit.id, targetUnit.stars, newKey, G.draggedUnit.oldKey);
                  G.playerBoard[newKey] = { id: G.draggedUnit.id, stars: G.draggedUnit.stars };
                  G.playerBoard[G.draggedUnit.oldKey] = { id: targetUnit.id, stars: targetUnit.stars };
                }
                const matches = window.MergeSystem.checkForMerge(G.draggedUnit.id, G.draggedUnit.stars);
                if (matches) window.MergeSystem.performMerge(matches, G.draggedUnit.id, G.draggedUnit.stars);
              }
            }
          }
          sellZone.classList.remove('active');
        }
      }

      // --- Cleanup ---
      // Restore bench slot opacity if dragged from bench
      document.querySelectorAll('.bench-slot').forEach(s => { s.style.opacity = '1'; });
      G.draggedUnit = null;
      G.highlightHex = null;
      G.swapTargetInfo = null;
      G.canvas.style.cursor = 'default';
      window.RenderSystem.removeDragGhost();
      window.RenderSystem.renderBench();
      window.RenderSystem.renderBoard();
      window.SynergySystem.renderSynergies();
      window.RenderSystem.updateUI();
    });

    // --- Canvas mouseleave ---
    G.canvas.addEventListener('mouseleave', () => {
      G.hoveredBoardUnit = null;
      window.TooltipSystem.hideTooltip();
    });

    // --- Canvas dragover / drop (shop card HTML5 drag) ---
    G.canvas.addEventListener('dragover', e => e.preventDefault());
    G.canvas.addEventListener('drop', e => {
      e.preventDefault();
      if (!G.draggedUnit?.fromShop) return;

      if (window.NetworkManager.isOnline) {
        // Online: just send buy to server (server handles placement)
        const shopIdx = G.draggedUnit.shopIndex !== undefined ? G.draggedUnit.shopIndex : G.shopUnits.indexOf(G.draggedUnit.id);
        if (shopIdx > -1) {
          window.NetworkManager.send({ type: 'buy', shopIndex: shopIdx });
        }
      } else if (G.gold >= G.draggedUnit.cost) {
        const rect = G.canvas.getBoundingClientRect();
        const raw = window.HexBoard.pixelToHex(e.clientX - rect.left, e.clientY - rect.top);
        const hex = window.HexBoard.getNearestHex(raw);

        // Dropping directly on board (if space)
        if (hex && G.playerRows.includes(hex.row) && window.RenderSystem.canPlaceUnit()) {
          const key = window.HexBoard.getHexKey(hex);
          if (!G.playerBoard[key]) {
            // First add to bench (for merge logic)
            if (window.MergeSystem.tryAddUnit(G.draggedUnit.id)) {
              G.gold -= G.draggedUnit.cost;
              // Now move from bench to board
              const benchIdx = G.bench.findIndex(b => b && b.id === G.draggedUnit.id);
              if (benchIdx !== -1) {
                G.playerBoard[key] = G.bench[benchIdx];
                G.bench[benchIdx] = null;
                // Check for merge on board
                const matches = window.MergeSystem.checkForMerge(G.draggedUnit.id, G.playerBoard[key].stars);
                if (matches) {
                  window.MergeSystem.performMerge(matches, G.draggedUnit.id, G.playerBoard[key].stars);
                }
              }
              // Remove from shop
              const sIdx = G.draggedUnit.shopIndex !== undefined ? G.draggedUnit.shopIndex : G.shopUnits.indexOf(G.draggedUnit.id);
              if (sIdx > -1) G.shopUnits[sIdx] = G.rollShopUnit();
              window.RenderSystem.renderShop();
              window.RenderSystem.renderBench();
              window.RenderSystem.updateUI();
              window.SynergySystem.renderSynergies();
            }
          }
        } else {
          // Dropping elsewhere - buy to bench
          if (window.MergeSystem.tryAddUnit(G.draggedUnit.id)) {
            G.gold -= G.draggedUnit.cost;
            const sIdx = G.draggedUnit.shopIndex !== undefined ? G.draggedUnit.shopIndex : G.shopUnits.indexOf(G.draggedUnit.id);
            if (sIdx > -1) G.shopUnits[sIdx] = G.rollShopUnit();
            window.RenderSystem.renderShop();
            window.RenderSystem.renderBench();
            window.RenderSystem.updateUI();
          }
        }
      }
      G.draggedUnit = null;
      G.highlightHex = null;
      window.RenderSystem.renderBoard();
    });

    // ===== CANVAS TOUCH EVENTS =====

    // Touch on canvas (board units)
    G.canvas.addEventListener('touchstart', e => {
      if (G.draggedUnit || G.combatState !== 'idle') return;
      const t = e.touches[0];
      const rect = G.canvas.getBoundingClientRect();
      const scaleX = G.canvas.width / rect.width;
      const scaleY = G.canvas.height / rect.height;
      const raw = window.HexBoard.pixelToHex((t.clientX - rect.left) * scaleX, (t.clientY - rect.top) * scaleY);
      const hex = window.HexBoard.getNearestHex(raw);
      if (hex && G.playerRows.includes(hex.row)) {
        const key = window.HexBoard.getHexKey(hex);
        const unit = G.playerBoard[key];
        if (unit) {
          e.preventDefault();
          G.draggedUnit = {
            fromBoard: true,
            id: unit.id,
            stars: unit.stars,
            oldKey: key,
            cost: unitsData[unit.id].cost
          };
          const unitDef = unitsData[unit.id];
          createTouchDragIndicator(unitDef.icon, t.clientX, t.clientY, unit.id);
          document.getElementById('sell-zone').classList.add('active');
          window.RenderSystem.renderBoard();
        }
      }
    }, { passive: false });

    G.canvas.addEventListener('touchmove', e => {
      if (!G.draggedUnit) return;
      e.preventDefault();
      const t = e.touches[0];
      moveTouchDragIndicator(t.clientX, t.clientY);

      const rect = G.canvas.getBoundingClientRect();
      const scaleX = G.canvas.width / rect.width;
      const scaleY = G.canvas.height / rect.height;
      const raw = window.HexBoard.pixelToHex((t.clientX - rect.left) * scaleX, (t.clientY - rect.top) * scaleY);
      const hex = window.HexBoard.getNearestHex(raw);

      G.swapTargetInfo = null;
      if (hex && G.playerRows.includes(hex.row)) {
        G.highlightHex = hex;
        // Track swap target for visual feedback (orange highlight)
        const targetKey = window.HexBoard.getHexKey(hex);
        const targetUnit = G.playerBoard[targetKey];
        const isSameSpot = targetKey === G.draggedUnit.oldKey;
        if (G.draggedUnit.fromBoard) {
          if (targetUnit && !isSameSpot) {
            G.swapTargetInfo = { unitId: targetUnit.id, stars: targetUnit.stars };
          }
        } else if (G.draggedUnit.fromBench) {
          if (targetUnit) {
            G.swapTargetInfo = { unitId: targetUnit.id, stars: targetUnit.stars };
          }
        }
      } else {
        G.highlightHex = null;
      }

      // Highlight sell zone
      const sellZone = document.getElementById('sell-zone');
      const sellRect = sellZone.getBoundingClientRect();
      if (t.clientX >= sellRect.left && t.clientX <= sellRect.right &&
          t.clientY >= sellRect.top && t.clientY <= sellRect.bottom) {
        sellZone.classList.add('drag-over');
      } else {
        sellZone.classList.remove('drag-over');
      }

      // Highlight bench slots (swap-aware)
      document.querySelectorAll('.bench-slot').forEach(s => s.classList.remove('drag-over', 'drag-over-swap'));
      const benchEl = getElementAtPoint(t.clientX, t.clientY, '.bench-slot');
      if (benchEl) {
        const benchIdx = parseInt(benchEl.dataset.slot);
        const isOccupied = G.bench[benchIdx] !== null;
        const isSameSlot = G.draggedUnit.fromBench && benchIdx === G.draggedUnit.slotIndex;
        if (!isSameSlot) benchEl.classList.add(isOccupied ? 'drag-over-swap' : 'drag-over');
      }

      window.RenderSystem.renderBoard();
    }, { passive: false });

    G.canvas.addEventListener('touchend', e => {
      if (!G.draggedUnit) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      handleTouchDrop(t.clientX, t.clientY);
    }, { passive: false });

    // ===== BENCH SLOT TOUCH EVENTS =====

    document.querySelectorAll('.bench-slot').forEach((slot, index) => {
      slot.addEventListener('touchstart', e => {
        const unit = G.bench[index];
        if (unit && G.combatState === 'idle') {
          e.preventDefault();
          const t = e.touches[0];
          G.draggedUnit = {
            fromBench: true,
            id: unit.id,
            stars: unit.stars,
            slotIndex: index,
            cost: unitsData[unit.id].cost
          };
          const unitDef = unitsData[unit.id];
          createTouchDragIndicator(unitDef.icon, t.clientX, t.clientY, unit.id);
          document.getElementById('sell-zone').classList.add('active');
          slot.style.opacity = '0.5';
        }
      }, { passive: false });

      slot.addEventListener('touchmove', e => {
        if (!G.draggedUnit) return;
        e.preventDefault();
        const t = e.touches[0];
        moveTouchDragIndicator(t.clientX, t.clientY);

        // Highlight board hex
        G.swapTargetInfo = null;
        const rect = G.canvas.getBoundingClientRect();
        const scaleX = G.canvas.width / rect.width;
        const scaleY = G.canvas.height / rect.height;
        if (t.clientX >= rect.left && t.clientX <= rect.right &&
            t.clientY >= rect.top && t.clientY <= rect.bottom) {
          const raw = window.HexBoard.pixelToHex((t.clientX - rect.left) * scaleX, (t.clientY - rect.top) * scaleY);
          const hex = window.HexBoard.getNearestHex(raw);
          if (hex && G.playerRows.includes(hex.row)) {
            G.highlightHex = hex;
            const targetUnit = G.playerBoard[window.HexBoard.getHexKey(hex)];
            if (targetUnit) {
              G.swapTargetInfo = { unitId: targetUnit.id, stars: targetUnit.stars };
            }
          } else {
            G.highlightHex = null;
          }
        } else {
          G.highlightHex = null;
        }

        // Highlight sell zone
        const sellZone = document.getElementById('sell-zone');
        const sellRect = sellZone.getBoundingClientRect();
        if (t.clientX >= sellRect.left && t.clientX <= sellRect.right &&
            t.clientY >= sellRect.top && t.clientY <= sellRect.bottom) {
          sellZone.classList.add('drag-over');
        } else {
          sellZone.classList.remove('drag-over');
        }

        document.querySelectorAll('.bench-slot').forEach(s => s.classList.remove('drag-over', 'drag-over-swap'));
        const benchTarget = getElementAtPoint(t.clientX, t.clientY, '.bench-slot');
        if (benchTarget) {
          const bIdx = parseInt(benchTarget.dataset.slot);
          const isOcc = G.bench[bIdx] !== null;
          const isSame = G.draggedUnit.fromBench && bIdx === G.draggedUnit.slotIndex;
          if (!isSame) benchTarget.classList.add(isOcc ? 'drag-over-swap' : 'drag-over');
        }

        window.RenderSystem.renderBoard();
      }, { passive: false });

      // touchend is handled by the canvas touchend (global cleanup)
      slot.addEventListener('touchend', e => {
        if (!G.draggedUnit) return;
        e.preventDefault();
        const t = e.changedTouches[0];
        handleTouchDrop(t.clientX, t.clientY);
      }, { passive: false });
    });

    // ===== REROLL BUTTON =====
    document.getElementById('reroll').onclick = () => {
      if (window.NetworkManager.isOnline) {
        window.NetworkManager.send({ type: 'reroll' });
        return;
      }
      if (G.gold >= 2) {
        G.gold -= 2;
        G.shopUnits = Array(5).fill().map(() => G.rollShopUnit());
        window.RenderSystem.renderShop();
        window.RenderSystem.updateUI();
        // Sync to multiplayer state
        if (window.GameState.mode === 'multiplayer') {
          const human = window.GameState.getHumanPlayer();
          human.gold = G.gold;
          human.shop = [...G.shopUnits];
        }
      }
    };

    // ===== LEVEL UP BUTTON =====
    document.getElementById('levelup').onclick = () => {
      if (window.NetworkManager.isOnline) {
        window.NetworkManager.send({ type: 'level_up' });
        return;
      }
      const cost = 4 * Math.pow(2, G.playerLevel - 1);  // Doubles each level: 4, 8, 16, 32...
      if (G.gold >= cost && G.playerLevel < 9) {
        G.gold -= cost;
        G.playerLevel++;
        window.SynergySystem.renderSynergies(); // Update synergies (shows unit cap hint)
        window.RenderSystem.updateUI();
        // Sync to multiplayer state
        if (window.GameState.mode === 'multiplayer') {
          const human = window.GameState.getHumanPlayer();
          human.gold = G.gold;
          human.level = G.playerLevel;
        }
      }
    };
  }

  // ===== PUBLIC API =====

  window.InputSystem = {
    setupBenchEvents:     setupBenchEvents,
    addShopTouchHandlers: addShopTouchHandlers,
    initInputHandlers:    initInputHandlers
  };
})();
