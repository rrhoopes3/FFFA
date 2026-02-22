// ============================================================
//  FFFA — Star Merge System
//  Version: 0.3.0.0
//  Handles 3-into-1 star-level merging of units on board/bench,
//  cascade merges, and the "try add unit from shop" flow.
// ============================================================
(function() {
  'use strict';
  const G = window.FFFA;

  // External globals from shared.js: unitsData, getSellValue

  // ---- helpers (lazy cross-module refs) ----------------------

  function _renderBench()    { window.RenderSystem.renderBench();    }
  function _renderBoard()    { window.RenderSystem.renderBoard();    }
  function _renderSynergies(){ window.SynergySystem.renderSynergies(); }
  function _updateUI()       { window.RenderSystem.updateUI();       }

  // ---- core merge logic --------------------------------------

  // Check if we can merge 3 units of same type/star level
  function checkForMerge(unitId, starLevel) {
    // Count matching units on board and bench
    let matches = [];

    // Check board
    Object.entries(G.playerBoard).forEach(([key, unit]) => {
      if (unit.id === unitId && unit.stars === starLevel) {
        matches.push({ location: 'board', key });
      }
    });

    // Check bench
    G.bench.forEach((unit, index) => {
      if (unit && unit.id === unitId && unit.stars === starLevel) {
        matches.push({ location: 'bench', index });
      }
    });

    return matches.length >= 3 ? matches : null;
  }

  // Perform merge: remove 3 units, create upgraded unit
  function performMerge(matches, unitId, currentStars) {
    if (currentStars >= 3) return false; // Can't upgrade beyond 3 stars

    const newStars = currentStars + 1;

    // Remove the 3 matching units, keep track of first board position
    let firstBoardKey = null;
    let firstBenchIndex = null;

    matches.slice(0, 3).forEach(match => {
      if (match.location === 'board') {
        if (!firstBoardKey) firstBoardKey = match.key;
        else delete G.playerBoard[match.key];
      } else {
        if (!firstBenchIndex && firstBenchIndex !== 0 && !firstBoardKey) firstBenchIndex = match.index;
        else G.bench[match.index] = null;
      }
    });

    // Place upgraded unit in first position found
    if (firstBoardKey) {
      G.playerBoard[firstBoardKey] = { id: unitId, stars: newStars };
    } else if (firstBenchIndex !== null) {
      G.bench[firstBenchIndex] = { id: unitId, stars: newStars };
    }

    // Show merge effect
    addMergeEffect(unitId, newStars);

    // Check for another merge at the new star level
    setTimeout(() => {
      const nextMerge = checkForMerge(unitId, newStars);
      if (nextMerge) {
        performMerge(nextMerge, unitId, newStars);
      }
      _renderBench();
      _renderBoard();
      _renderSynergies();
      _updateUI();
    }, 300);

    return true;
  }

  function addMergeEffect(unitId, stars) {
    const unit = unitsData[unitId];
    G.roundBanner = {
      text: '\u2B50 ' + stars + '-STAR ' + unit.name.toUpperCase() + '! \u2B50',
      subtext: stars === 2 ? '\u00D71.8 stats!' : '\u00D73.0 stats!',
      color: stars === 2 ? '#4af' : '#f4a',
      startTime: Date.now(),
      duration: 1500
    };
  }

  // Try to add a unit (from shop) - returns true if successful
  function tryAddUnit(unitId) {
    // First check if adding this would trigger a merge
    const existingMatches = checkForMerge(unitId, 1);

    if (existingMatches && existingMatches.length >= 2) {
      // We have 2 already, this will make 3 - find a spot temporarily
      const emptyBenchSlot = G.bench.findIndex(s => s === null);
      if (emptyBenchSlot !== -1) {
        G.bench[emptyBenchSlot] = { id: unitId, stars: 1 };
        // Now check and perform merge
        const matches = checkForMerge(unitId, 1);
        if (matches) {
          performMerge(matches, unitId, 1);
        }
        return true;
      }
      return false; // No space
    }

    // No merge possible, just add to bench
    const emptySlot = G.bench.findIndex(s => s === null);
    if (emptySlot !== -1) {
      G.bench[emptySlot] = { id: unitId, stars: 1 };
      // Still check for merge in case we now have 3
      const matches = checkForMerge(unitId, 1);
      if (matches) {
        performMerge(matches, unitId, 1);
      }
      return true;
    }

    return false; // Bench full
  }

  // ---- public API -------------------------------------------
  window.MergeSystem = {
    checkForMerge,
    performMerge,
    tryAddUnit,
    addMergeEffect
  };
})();
