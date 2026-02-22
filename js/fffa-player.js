// ============================================================
//  FFFA -- Player, GameState, BotAI, MultiplayerCombat
//  Version: 0.3.0.0
//  Extracted from index.html lines 1561-2397
//  All modules read/write through window.FFFA (aliased as G)
// ============================================================
(function () {
  'use strict';

  const G = window.FFFA;

  // ----- Global references from shared.js (stay as-is) -----
  // unitsData, factionSynergies, rollShopUnitForLevel,
  // createCombatUnit, hexDistance

  // ========== PLAYER CLASS ==========

  class Player {
    constructor(id, name, isBot = false) {
      this.id = id;
      this.name = name;
      this.color = G.PLAYER_COLORS[id];
      this.isBot = isBot;
      this.gold = 50;
      this.health = 100;
      this.level = 1;
      this.board = {};        // hexKey -> {id, stars}
      this.bench = Array(9).fill(null);
      this.shop = [];
      this.synergies = {};    // Cached synergy bonuses
      this.isAlive = true;
      this.wins = 0;
      this.losses = 0;
      this.streak = 0;        // Positive = win streak, negative = loss streak
      this.placement = 0;     // Final placement (1-8)
    }

    getUnitCap() {
      return this.level + 2;
    }

    getBoardUnitCount() {
      return Object.keys(this.board).length;
    }

    canAfford(cost) {
      return this.gold >= cost;
    }

    spendGold(amount) {
      this.gold = Math.max(0, this.gold - amount);
    }

    earnGold(amount) {
      this.gold += amount;
    }

    takeDamage(amount) {
      this.health = Math.max(0, this.health - amount);
      if (this.health <= 0) {
        this.isAlive = false;
      }
    }

    // Roll a shop based on player level
    rollShop() {
      this.shop = Array(5).fill().map(() => rollShopUnitForLevel(this.level));
    }

    // Calculate synergies from board
    calculateSynergies() {
      const factionCounts = {};
      const coatCounts = {};

      Object.values(this.board).forEach(unitData => {
        const unitId = typeof unitData === 'object' ? unitData.id : unitData;
        const unit = unitsData[unitId];
        if (unit) {
          factionCounts[unit.faction] = (factionCounts[unit.faction] || 0) + 1;
          if (unit.coat) {
            coatCounts[unit.coat] = (coatCounts[unit.coat] || 0) + 1;
          }
        }
      });

      this.synergies = { factions: factionCounts, coats: coatCounts };
      return this.synergies;
    }
  }

  // ========== GAME STATE MANAGER (8-player mode) ==========

  const GameState = {
    mode: 'single',           // 'single' or 'multiplayer'
    round: 1,
    phase: 'shop',            // 'shop', 'combat', 'settlement'
    players: [],              // Array of Player objects
    humanPlayerIndex: 0,      // Index of human player
    matchups: [],             // Current round matchups: [{playerA: idx, playerB: idx, winner: null}]
    currentMatchupIndex: 0,   // Which matchup is being displayed
    eliminationOrder: [],     // Track order of elimination for placements
    roundRobinSchedule: [],   // Pre-generated schedule

    // Initialize 8-player game
    init(humanCount = 1) {
      this.mode = 'multiplayer';
      this.round = 1;
      this.phase = 'shop';
      this.players = [];
      this.humanPlayerIndex = 0;
      this.eliminationOrder = [];

      // Create players (first one is human, rest are bots)
      for (let i = 0; i < 8; i++) {
        const isBot = i >= humanCount;
        const player = new Player(i, G.PLAYER_NAMES[i], isBot);
        player.rollShop();
        this.players.push(player);
      }

      // Generate round-robin schedule
      this.generateRoundRobinSchedule();

      return this.players[this.humanPlayerIndex];
    },

    // Generate round-robin schedule for 8 players
    // Each round: 4 matches, each player fights once
    // Full cycle: 7 rounds for everyone to fight everyone
    generateRoundRobinSchedule() {
      this.roundRobinSchedule = [];
      const n = 8;

      // Circle method for round-robin tournament
      // Fix player 0, rotate others
      for (let round = 0; round < n - 1; round++) {
        const matches = [];
        const rotation = [0];

        // Build rotation array
        for (let i = 1; i < n; i++) {
          const pos = (i - 1 + round) % (n - 1) + 1;
          rotation.push(pos);
        }

        // Pair up: first with last, second with second-last, etc.
        for (let i = 0; i < n / 2; i++) {
          matches.push({
            playerA: rotation[i],
            playerB: rotation[n - 1 - i]
          });
        }

        this.roundRobinSchedule.push(matches);
      }
    },

    // Get matchups for current round (handles dead players)
    getMatchupsForRound() {
      const scheduleIndex = (this.round - 1) % 7;
      const baseMatchups = this.roundRobinSchedule[scheduleIndex];

      // Filter to only alive players and create ghost army matchups
      const alivePlayers = this.players.filter(p => p.isAlive).map(p => p.id);

      if (alivePlayers.length <= 1) {
        return []; // Game over
      }

      const matchups = [];
      const paired = new Set();

      // Try to use scheduled matchups first
      for (const match of baseMatchups) {
        const aAlive = this.players[match.playerA].isAlive;
        const bAlive = this.players[match.playerB].isAlive;

        if (aAlive && bAlive && !paired.has(match.playerA) && !paired.has(match.playerB)) {
          matchups.push({
            playerA: match.playerA,
            playerB: match.playerB,
            winner: null,
            combatLog: [],
            damage: 0
          });
          paired.add(match.playerA);
          paired.add(match.playerB);
        }
      }

      // Handle unpaired alive players (fight ghost of random opponent)
      const unpaired = alivePlayers.filter(id => !paired.has(id));
      for (const playerId of unpaired) {
        // Fight ghost army of random alive opponent
        const opponents = alivePlayers.filter(id => id !== playerId);
        if (opponents.length > 0) {
          const ghostOpponent = opponents[Math.floor(Math.random() * opponents.length)];
          matchups.push({
            playerA: playerId,
            playerB: ghostOpponent,
            isGhostMatch: true,  // Mark that playerB won't take damage
            winner: null,
            combatLog: [],
            damage: 0
          });
        }
      }

      this.matchups = matchups;
      return matchups;
    },

    // Get human player
    getHumanPlayer() {
      return this.players[this.humanPlayerIndex];
    },

    // Get alive players count
    getAliveCount() {
      return this.players.filter(p => p.isAlive).length;
    },

    // Check if game is over
    isGameOver() {
      return this.getAliveCount() <= 1;
    },

    // Get winner
    getWinner() {
      const alive = this.players.filter(p => p.isAlive);
      return alive.length === 1 ? alive[0] : null;
    },

    // Process eliminations after combat
    processEliminations() {
      this.players.forEach(player => {
        if (!player.isAlive && player.placement === 0) {
          player.placement = 8 - this.eliminationOrder.length;
          this.eliminationOrder.push(player.id);
        }
      });
    },

    // Advance to next round
    nextRound() {
      this.round++;
      this.phase = 'shop';
      this.currentMatchupIndex = 0;

      // Refresh shops for all alive players
      this.players.forEach(player => {
        if (player.isAlive) {
          player.rollShop();
        }
      });
    }
  };

  // ========== BOT AI SYSTEM (Medium Difficulty) ==========

  const BotAI = {
    // Run bot turn: buy units, level up, place on board
    takeTurn(player) {
      if (!player.isBot || !player.isAlive) return;

      // 1. Decide whether to level up or save
      this.decideLevelUp(player);

      // 2. Buy units from shop
      this.buyUnits(player);

      // 3. Position units on board
      this.positionUnits(player);

      // 4. Maybe reroll if gold is high and looking for upgrades
      this.decideReroll(player);
    },

    // Level up decision: level if gold > 50 and can benefit
    decideLevelUp(player) {
      const levelUpCost = player.level < 9 ? 4 : 999;
      // Level up if: plenty of gold AND bench has units waiting
      const benchCount = player.bench.filter(u => u !== null).length;
      const boardCount = player.getBoardUnitCount();

      if (player.gold >= levelUpCost + 10 && boardCount >= player.getUnitCap() && player.level < 9) {
        player.spendGold(levelUpCost);
        player.level++;
      }
    },

    // Buy units that complete synergies or can upgrade
    buyUnits(player) {
      const shop = player.shop;
      if (!shop || shop.length === 0) return;

      // Count units we have for upgrade potential
      const unitCounts = this.countUnits(player);

      // Get current faction counts
      const factionCounts = {};
      Object.values(player.board).forEach(u => {
        const unit = unitsData[typeof u === 'object' ? u.id : u];
        if (unit) factionCounts[unit.faction] = (factionCounts[unit.faction] || 0) + 1;
      });
      player.bench.forEach(u => {
        if (u) {
          const unit = unitsData[u.id];
          if (unit) factionCounts[unit.faction] = (factionCounts[unit.faction] || 0) + 1;
        }
      });

      // Score and buy units
      for (let i = 0; i < shop.length; i++) {
        const unitId = shop[i];
        if (!unitId) continue;

        const unit = unitsData[unitId];
        if (!unit || !player.canAfford(unit.cost)) continue;

        // Find empty bench slot
        const emptySlot = player.bench.findIndex(s => s === null);
        if (emptySlot === -1) break; // Bench full

        // Calculate buy priority
        let priority = 0;

        // High priority: can upgrade (have 2 copies already)
        const count = unitCounts[unitId] || 0;
        if (count >= 2) priority += 50;
        else if (count >= 1) priority += 20;

        // Medium priority: completes synergy threshold
        const factionCount = factionCounts[unit.faction] || 0;
        if (factionCount === 1 || factionCount === 3 || factionCount === 5) {
          priority += 30; // One away from threshold
        }

        // Lower priority for expensive units early
        if (GameState.round <= 5 && unit.cost >= 4) {
          priority -= 20;
        }

        // Buy if priority is decent, we have gold, or bench is empty
        const benchCount = player.bench.filter(u => u !== null).length;
        const boardCount = player.getBoardUnitCount();
        const hasSpace = benchCount + boardCount < player.getUnitCap() + 9;
        if (priority >= 20 || (player.gold >= unit.cost + 5 && hasSpace) || (player.gold >= 30 && unit.cost <= 2)) {
          player.spendGold(unit.cost);
          player.bench[emptySlot] = { id: unitId, stars: 1 };
          shop[i] = null; // Remove from shop

          // Check for merge
          this.checkAndMerge(player, unitId, 1);

          // Update counts
          unitCounts[unitId] = (unitCounts[unitId] || 0) + 1;
          factionCounts[unit.faction] = (factionCounts[unit.faction] || 0) + 1;
        }
      }
    },

    // Count all units (board + bench) by ID and star level
    countUnits(player) {
      const counts = {};

      Object.values(player.board).forEach(u => {
        const id = typeof u === 'object' ? u.id : u;
        const stars = typeof u === 'object' ? u.stars : 1;
        const key = `${id}_${stars}`;
        counts[id] = (counts[id] || 0) + 1;
        counts[key] = (counts[key] || 0) + 1;
      });

      player.bench.forEach(u => {
        if (u) {
          const key = `${u.id}_${u.stars}`;
          counts[u.id] = (counts[u.id] || 0) + 1;
          counts[key] = (counts[key] || 0) + 1;
        }
      });

      return counts;
    },

    // Check and perform merges for bot
    checkAndMerge(player, unitId, starLevel) {
      if (starLevel >= 3) return;

      let matches = [];

      // Check board
      Object.entries(player.board).forEach(([key, unit]) => {
        if (unit.id === unitId && unit.stars === starLevel) {
          matches.push({ location: 'board', key });
        }
      });

      // Check bench
      player.bench.forEach((unit, index) => {
        if (unit && unit.id === unitId && unit.stars === starLevel) {
          matches.push({ location: 'bench', index });
        }
      });

      if (matches.length >= 3) {
        // Perform merge
        const newStars = starLevel + 1;
        let firstBoardKey = null;
        let firstBenchIndex = null;

        matches.slice(0, 3).forEach(match => {
          if (match.location === 'board') {
            if (!firstBoardKey) firstBoardKey = match.key;
            else delete player.board[match.key];
          } else {
            if (firstBenchIndex === null && !firstBoardKey) firstBenchIndex = match.index;
            else player.bench[match.index] = null;
          }
        });

        if (firstBoardKey) {
          player.board[firstBoardKey] = { id: unitId, stars: newStars };
        } else if (firstBenchIndex !== null) {
          player.bench[firstBenchIndex] = { id: unitId, stars: newStars };
        }

        // Recursively check for next level merge
        this.checkAndMerge(player, unitId, newStars);
      }
    },

    // Position units: tanks front (row 4), damage back (rows 5-7)
    positionUnits(player) {
      // Get all units from bench that can be placed
      const boardCount = player.getBoardUnitCount();
      const unitCap = player.getUnitCap();

      if (boardCount >= unitCap) return;

      // Get available hexes in player zone (rows 4-7)
      const frontRow = [4];
      const backRows = [5, 6, 7];

      const occupiedHexes = new Set(Object.keys(player.board));

      // Categorize bench units by role
      const benchUnits = player.bench
        .map((u, idx) => u ? { ...u, benchIndex: idx } : null)
        .filter(u => u !== null);

      // Sort: tanks (Maine Coon, high HP) first, then damage dealers
      benchUnits.sort((a, b) => {
        const unitA = unitsData[a.id];
        const unitB = unitsData[b.id];
        const tankFactions = ['MaineCoon', 'Persian', 'Ragdoll'];

        const aIsTank = tankFactions.includes(unitA?.faction) || (unitA?.stats?.hp > 700);
        const bIsTank = tankFactions.includes(unitB?.faction) || (unitB?.stats?.hp > 700);

        if (aIsTank && !bIsTank) return -1;
        if (!aIsTank && bIsTank) return 1;
        return (unitB?.cost || 0) - (unitA?.cost || 0); // Higher cost first
      });

      // Place units
      let placed = 0;
      for (const benchUnit of benchUnits) {
        if (boardCount + placed >= unitCap) break;

        const unit = unitsData[benchUnit.id];
        const tankFactions = ['MaineCoon', 'Persian', 'Ragdoll'];
        const isTank = tankFactions.includes(unit?.faction) || (unit?.stats?.hp > 700);

        // Find hex
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
          player.board[targetHex] = { id: benchUnit.id, stars: benchUnit.stars };
          player.bench[benchUnit.benchIndex] = null;
          occupiedHexes.add(targetHex);
          placed++;
        }
      }
    },

    // Reroll decision
    decideReroll(player) {
      // Reroll if: high gold, looking for upgrades, still have bench space
      if (player.gold < 10) return;

      const unitCounts = this.countUnits(player);
      const hasUpgradePotential = Object.values(unitCounts).some(c => c === 2);
      const benchHasSpace = player.bench.some(s => s === null);

      if (hasUpgradePotential && benchHasSpace && player.gold >= 20) {
        player.spendGold(2);
        player.rollShop();
        // Try buying again after reroll
        this.buyUnits(player);
      }
    }
  };

  // ========== MULTIPLAYER COMBAT SYSTEM ==========

  const MultiplayerCombat = {
    // Current combat state
    activeBattles: [],       // Array of battle simulations
    displayedBattleIndex: 0, // Which battle is shown to human player
    combatPhaseComplete: false,

    // Calculate synergy bonuses for a player's board
    getSynergyBonusesForPlayer(player) {
      const factionCounts = {};
      Object.values(player.board).forEach(unitData => {
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
            activeBonus = synergy.bonuses[i];
            break;
          }
        }
        if (activeBonus) {
          bonuses[faction] = activeBonus;
        }
      });

      return bonuses;
    },

    // Create ghost army from a player's board (deep copy for combat)
    createGhostArmy(player, asAttacker = true) {
      const synergyBonuses = this.getSynergyBonusesForPlayer(player);
      const army = [];

      Object.entries(player.board).forEach(([hexKey, unitData]) => {
        const unitId = typeof unitData === 'object' ? unitData.id : unitData;
        const stars = typeof unitData === 'object' ? unitData.stars : 1;

        // Mirror hex position if this is the "enemy" (playerB)
        let combatHexKey = hexKey;
        if (!asAttacker) {
          const [col, row] = hexKey.split(',').map(Number);
          // Mirror: row 4 -> row 3, row 5 -> row 2, row 6 -> row 1, row 7 -> row 0
          const mirrorRow = 7 - row;
          combatHexKey = `${col},${mirrorRow}`;
        }

        const unit = createCombatUnit(unitId, combatHexKey, asAttacker, synergyBonuses, stars);
        if (unit) {
          unit.stars = stars;
          unit.ownerId = player.id;
          unit.ownerColor = player.color;
          army.push(unit);
        }
      });

      return army;
    },

    // Simulate a single battle between two players (instant, no animation)
    simulateBattle(playerA, playerB, isGhostMatch = false) {
      const armyA = this.createGhostArmy(playerA, true);
      const armyB = this.createGhostArmy(playerB, false);

      const allUnits = [...armyA, ...armyB];
      const combatLog = [];
      let tick = 0;
      const MAX_TICKS = 1000; // Prevent infinite loops

      combatLog.push(`=== ${playerA.name} vs ${playerB.name} ===`);
      combatLog.push(`${playerA.name}: ${armyA.length} units`);
      combatLog.push(`${playerB.name}: ${armyB.length} units`);

      // Run simulation
      while (tick < MAX_TICKS) {
        const aliveA = armyA.filter(u => u.hp > 0);
        const aliveB = armyB.filter(u => u.hp > 0);

        if (aliveA.length === 0 || aliveB.length === 0) break;

        // Process each unit's action
        for (const unit of allUnits) {
          if (unit.hp <= 0) continue;

          // Find target
          const enemies = unit.isPlayer ? armyB : armyA;
          const target = enemies.filter(e => e.hp > 0)
            .sort((a, b) => hexDistance(unit.hexKey, a.hexKey) - hexDistance(unit.hexKey, b.hexKey))[0];

          if (!target) continue;

          const dist = hexDistance(unit.hexKey, target.hexKey);

          // Attack if in range
          if (dist <= unit.range) {
            let damage = unit.attack;

            // Crit check
            if (Math.random() * 100 < unit.critChance) {
              damage = Math.round(damage * (unit.critDamage / 100));
            }

            // Apply armor reduction
            const armorReduction = target.armor / (target.armor + 100);
            damage = Math.round(damage * (1 - armorReduction));

            // Apply flat damage reduction (Tank class bonus)
            if (target.damageReduction && target.damageReduction > 0) {
              damage = Math.round(damage * (1 - target.damageReduction / 100));
            }

            target.hp -= damage;

            // Lifesteal
            if (unit.lifesteal > 0) {
              const heal = Math.round(damage * unit.lifesteal / 100);
              unit.hp = Math.min(unit.maxHp, unit.hp + heal);
            }
          } else {
            // Move toward target (improved pathfinding)
            const [col, row] = unit.hexKey.split(',').map(Number);
            const [tcol, trow] = target.hexKey.split(',').map(Number);
            const occupied = new Set(allUnits.filter(u => u.hp > 0 && u !== unit).map(u => u.hexKey));

            // Try direct path first
            const dc = Math.sign(tcol - col);
            const dr = Math.sign(trow - row);
            const directKey = `${col + dc},${row + dr}`;

            if (!occupied.has(directKey) && col + dc >= 0 && col + dc < 7 && row + dr >= 0 && row + dr < 8) {
              unit.hexKey = directKey;
            } else {
              // Direct path blocked - try alternative moves
              const currentDist = hexDistance(unit.hexKey, target.hexKey);
              const isOddRow = row & 1;
              const directions = isOddRow
                ? [[1,0], [1,-1], [0,-1], [-1,0], [0,1], [1,1]]
                : [[1,0], [0,-1], [-1,-1], [-1,0], [-1,1], [0,1]];

              let bestMove = null;
              let bestDist = currentDist;

              for (const [dcAlt, drAlt] of directions) {
                const nc = col + dcAlt;
                const nr = row + drAlt;
                if (nc < 0 || nc >= 7 || nr < 0 || nr >= 8) continue;
                const altKey = `${nc},${nr}`;
                if (occupied.has(altKey)) continue;
                const altDist = hexDistance(altKey, target.hexKey);
                if (altDist < bestDist) {
                  bestDist = altDist;
                  bestMove = altKey;
                }
              }

              // If no closer hex, try lateral movement
              if (!bestMove) {
                for (const [dcAlt, drAlt] of directions) {
                  const nc = col + dcAlt;
                  const nr = row + drAlt;
                  if (nc < 0 || nc >= 7 || nr < 0 || nr >= 8) continue;
                  const altKey = `${nc},${nr}`;
                  if (occupied.has(altKey)) continue;
                  const altDist = hexDistance(altKey, target.hexKey);
                  if (altDist === currentDist) {
                    bestMove = altKey;
                    break;
                  }
                }
              }

              if (bestMove) {
                unit.hexKey = bestMove;
              }
            }
          }
        }

        tick++;
      }

      // Determine winner
      const survivorsA = armyA.filter(u => u.hp > 0);
      const survivorsB = armyB.filter(u => u.hp > 0);

      let winner = null;
      let loser = null;
      let damage = 0;

      if (survivorsA.length > 0 && survivorsB.length === 0) {
        winner = playerA;
        loser = playerB;
        // Damage = 2 + sum of surviving unit costs
        damage = 2 + survivorsA.reduce((sum, u) => sum + (unitsData[u.id]?.cost || 1), 0);
      } else if (survivorsB.length > 0 && survivorsA.length === 0) {
        winner = playerB;
        loser = playerA;
        damage = 2 + survivorsB.reduce((sum, u) => sum + (unitsData[u.id]?.cost || 1), 0);
      } else {
        // Draw or timeout - both take minor damage
        damage = 2;
      }

      combatLog.push(`--- Result: ${winner ? winner.name + ' wins!' : 'Draw!'} ---`);
      if (damage > 0 && loser) {
        combatLog.push(`${loser.name} takes ${damage} damage`);
      }

      return {
        playerA: playerA.id,
        playerB: playerB.id,
        winner: winner?.id ?? null,
        loser: loser?.id ?? null,
        damage,
        isGhostMatch,
        survivorsA: survivorsA.length,
        survivorsB: survivorsB.length,
        combatLog,
        // Store armies for animated replay
        armyA,
        armyB
      };
    },

    // Run all matchups for the round
    runAllMatchups() {
      const matchups = GameState.getMatchupsForRound();
      const results = [];

      for (const matchup of matchups) {
        const playerA = GameState.players[matchup.playerA];
        const playerB = GameState.players[matchup.playerB];

        // Skip if either player has no units
        if (Object.keys(playerA.board).length === 0) {
          // Auto-loss for playerA
          results.push({
            ...matchup,
            winner: playerB.id,
            loser: playerA.id,
            damage: 2 + playerB.level,
            combatLog: [`${playerA.name} has no units - auto loss!`]
          });
          continue;
        }
        if (Object.keys(playerB.board).length === 0) {
          results.push({
            ...matchup,
            winner: playerA.id,
            loser: playerB.id,
            damage: 2 + playerA.level,
            combatLog: [`${playerB.name} has no units - auto loss!`]
          });
          continue;
        }

        const result = this.simulateBattle(playerA, playerB, matchup.isGhostMatch);
        results.push(result);
      }

      this.activeBattles = results;
      return results;
    },

    // Apply results to players (damage, streaks, gold)
    applyResults() {
      for (const result of this.activeBattles) {
        const playerA = GameState.players[result.playerA];
        const playerB = GameState.players[result.playerB];

        if (result.winner !== null) {
          const winner = GameState.players[result.winner];
          const loser = GameState.players[result.loser];

          // Update streaks
          winner.wins++;
          winner.streak = winner.streak > 0 ? winner.streak + 1 : 1;

          loser.losses++;
          loser.streak = loser.streak < 0 ? loser.streak - 1 : -1;

          // Apply damage (only if not ghost match, or loser is the one who initiated)
          if (!result.isGhostMatch || result.loser === result.playerA) {
            loser.takeDamage(result.damage);
          }

          // Gold rewards
          const baseGold = 5;
          const streakBonus = Math.min(3, Math.abs(winner.streak) - 1);
          winner.earnGold(baseGold + streakBonus);

          // Loser still gets some gold
          loser.earnGold(2);
        } else {
          // Draw - both get base gold, small damage
          playerA.earnGold(3);
          playerB.earnGold(3);
          if (!result.isGhostMatch) {
            playerA.takeDamage(2);
            playerB.takeDamage(2);
          }
        }
      }

      // Process eliminations
      GameState.processEliminations();
    },

    // Get the battle result for a specific player
    getPlayerBattle(playerId) {
      return this.activeBattles.find(b => b.playerA === playerId || b.playerB === playerId);
    }
  };

  // ========== PUBLIC API ==========
  window.Player = Player;
  window.GameState = GameState;
  window.BotAI = BotAI;
  window.MultiplayerCombat = MultiplayerCombat;

})();
