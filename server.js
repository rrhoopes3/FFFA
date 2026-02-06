// ============================================================
//  FFFA — HTTP + WebSocket Game Server
//  Run: node server.js
//  Serves static files AND WebSocket on the same port
//  Compatible with cPanel/Passenger (listens on PORT env var)
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');
const {
  unitsData, allUnitIds, unitsByTier, shopOdds, factionSynergies,
  STAR_MULTIPLIERS, UNIT_ROLES, TANK_ARMOR_BONUS, TANK_DAMAGE_REDUCTION,
  MANA_TO_CAST, rollShopUnitForLevel, hexDistance, getSellValue,
  getSynergyBonusesForBoard, createCombatUnit
} = require('./shared.js');

const PORT = process.env.PORT || 3000;

// ===== MIME TYPES =====
const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

// ===== STATIC FILE SERVER =====
const APP_ROOT = __dirname;

function serveStatic(req, res) {
  // Parse URL, default to index.html
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  // Security: prevent directory traversal
  const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(APP_ROOT, safePath);

  // Make sure we're not serving outside app root
  if (!filePath.startsWith(APP_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Don't serve server.js, .git, node_modules, etc.
  const blocked = ['/server.js', '/shared.js', '/.git', '/node_modules', '/.htaccess', '/.env'];
  if (blocked.some(b => safePath.startsWith(b))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
    });
    res.end(data);
  });
}

// ===== CREATE HTTP SERVER =====
const httpServer = http.createServer(serveStatic);

// ===== ATTACH WEBSOCKET TO HTTP SERVER =====
const wss = new WebSocket.Server({ server: httpServer });

// ===== CONSTANTS =====
const MAX_PLAYERS = 8;
const SHOP_SIZE = 5;
const BENCH_SIZE = 9;
const LEVEL_UP_COST = 4;
const REROLL_COST = 2;
const MAX_LEVEL = 9;
const BASE_SHOP_PHASE_SECONDS = 30;
const MIN_SHOP_PHASE_SECONDS = 15;
const COMBAT_DISPLAY_SECONDS = 8;
const RESULTS_DISPLAY_SECONDS = 5;
const STARTING_GOLD = 50;
const STARTING_HEALTH = 100;
const DISCONNECT_GRACE_MS = 60000;
const LOBBY_CLEANUP_MS = 300000;

const PLAYER_COLORS = [
  '#4CAF50', '#F44336', '#2196F3', '#FF9800',
  '#9C27B0', '#00BCD4', '#FFEB3B', '#E91E63'
];

const BOT_NAMES = [
  'Whiskers', 'Mittens', 'Shadow', 'Luna',
  'Felix', 'Cleo', 'Tiger', 'Noodle',
  'Biscuit', 'Mochi', 'Salem', 'Pixel'
];

// ===== STATE =====
const lobbies = new Map();     // lobbyId -> Lobby
const socketMeta = new Map();  // ws -> { lobbyId, playerIndex, authToken }

// ===== PLAYER STATE =====
class PlayerState {
  constructor(id, name, isBot = false) {
    this.id = id;
    this.name = name;
    this.color = PLAYER_COLORS[id] || '#888';
    this.isBot = isBot;
    this.gold = STARTING_GOLD;
    this.health = STARTING_HEALTH;
    this.level = 1;
    this.board = {};            // hexKey -> {id, stars}
    this.bench = Array(BENCH_SIZE).fill(null);
    this.shop = [];
    this.isAlive = true;
    this.wins = 0;
    this.losses = 0;
    this.streak = 0;            // positive = win streak, negative = loss streak
    this.placement = 0;
  }

  getUnitCap() { return this.level + 2; }
  getBoardUnitCount() { return Object.keys(this.board).length; }
  canAfford(cost) { return this.gold >= cost; }

  spendGold(amount) {
    this.gold = Math.max(0, this.gold - amount);
  }

  earnGold(amount) {
    this.gold += amount;
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.isAlive = false;
  }

  rollShop() {
    this.shop = Array(SHOP_SIZE).fill(null).map(() => rollShopUnitForLevel(this.level));
  }

  calculateSynergies() {
    const factionCounts = {};
    Object.values(this.board).forEach(unitData => {
      const unitId = typeof unitData === 'object' ? unitData.id : unitData;
      const unit = unitsData[unitId];
      if (unit) {
        factionCounts[unit.faction] = (factionCounts[unit.faction] || 0) + 1;
      }
    });
    return factionCounts;
  }

  // Serialize for client (only what they need to see)
  toPublic() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      isBot: this.isBot,
      health: this.health,
      gold: this.gold,
      level: this.level,
      boardCount: this.getBoardUnitCount(),
      isAlive: this.isAlive,
      wins: this.wins,
      losses: this.losses,
      streak: this.streak,
      placement: this.placement
    };
  }

  // Serialize full state for the owning player
  toPrivate() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      gold: this.gold,
      health: this.health,
      level: this.level,
      unitCap: this.getUnitCap(),
      board: this.board,
      bench: this.bench,
      shop: this.shop,
      wins: this.wins,
      losses: this.losses,
      streak: this.streak,
      isAlive: this.isAlive
    };
  }
}

// ===== BOT AI =====
const BotAI = {
  takeTurn(player) {
    if (!player.isBot || !player.isAlive) return;
    this.decideLevelUp(player);
    this.buyUnits(player);
    this.positionUnits(player);
    this.decideReroll(player);
  },

  decideLevelUp(player) {
    const levelUpCost = player.level < MAX_LEVEL ? LEVEL_UP_COST : 999;
    const benchCount = player.bench.filter(u => u !== null).length;
    const boardCount = player.getBoardUnitCount();

    if (player.gold >= levelUpCost + 10 && boardCount >= player.getUnitCap() && player.level < MAX_LEVEL) {
      player.spendGold(levelUpCost);
      player.level++;
    }
  },

  buyUnits(player) {
    const shop = player.shop;
    if (!shop || shop.length === 0) return;

    const unitCounts = this.countUnits(player);
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

    for (let i = 0; i < shop.length; i++) {
      const unitId = shop[i];
      if (!unitId) continue;

      const unit = unitsData[unitId];
      if (!unit || !player.canAfford(unit.cost)) continue;

      const emptySlot = player.bench.findIndex(s => s === null);
      if (emptySlot === -1) break;

      let priority = 0;
      const count = unitCounts[unitId] || 0;
      if (count >= 2) priority += 50;
      else if (count >= 1) priority += 20;

      const factionCount = factionCounts[unit.faction] || 0;
      if (factionCount === 1 || factionCount === 3 || factionCount === 5) {
        priority += 30;
      }

      if (player.gold >= 30 && unit.cost <= 2) priority += 10;

      if (priority >= 20 || (player.gold >= 30 && unit.cost <= 2)) {
        player.spendGold(unit.cost);
        player.bench[emptySlot] = { id: unitId, stars: 1 };
        shop[i] = null;

        this.checkAndMerge(player, unitId, 1);

        unitCounts[unitId] = (unitCounts[unitId] || 0) + 1;
        factionCounts[unit.faction] = (factionCounts[unit.faction] || 0) + 1;
      }
    }
  },

  countUnits(player) {
    const counts = {};
    Object.values(player.board).forEach(u => {
      const id = typeof u === 'object' ? u.id : u;
      counts[id] = (counts[id] || 0) + 1;
    });
    player.bench.forEach(u => {
      if (u) counts[u.id] = (counts[u.id] || 0) + 1;
    });
    return counts;
  },

  checkAndMerge(player, unitId, starLevel) {
    if (starLevel >= 3) return;
    let matches = [];

    Object.entries(player.board).forEach(([key, unit]) => {
      if (unit.id === unitId && unit.stars === starLevel) {
        matches.push({ location: 'board', key });
      }
    });

    player.bench.forEach((unit, index) => {
      if (unit && unit.id === unitId && unit.stars === starLevel) {
        matches.push({ location: 'bench', index });
      }
    });

    if (matches.length >= 3) {
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

      this.checkAndMerge(player, unitId, newStars);
    }
  },

  positionUnits(player) {
    const boardCount = player.getBoardUnitCount();
    const unitCap = player.getUnitCap();
    if (boardCount >= unitCap) return;

    const occupiedHexes = new Set(Object.keys(player.board));

    const benchUnits = player.bench
      .map((u, idx) => u ? { ...u, benchIndex: idx } : null)
      .filter(u => u !== null);

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
    const frontRow = [4];
    const backRows = [5, 6, 7];

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
        player.board[targetHex] = { id: benchUnit.id, stars: benchUnit.stars };
        player.bench[benchUnit.benchIndex] = null;
        occupiedHexes.add(targetHex);
        placed++;
      }
    }
  },

  decideReroll(player) {
    if (player.gold < 10) return;
    const unitCounts = this.countUnits(player);
    const hasUpgradePotential = Object.values(unitCounts).some(c => c === 2);
    const benchHasSpace = player.bench.some(s => s === null);

    if (hasUpgradePotential && benchHasSpace && player.gold >= 20) {
      player.spendGold(REROLL_COST);
      player.rollShop();
      this.buyUnits(player);
    }
  }
};

// ===== COMBAT SIMULATION =====
function createGhostArmy(player, asAttacker = true) {
  const synergyBonuses = getSynergyBonusesForBoard(player.board);
  const army = [];

  Object.entries(player.board).forEach(([hexKey, unitData]) => {
    const unitId = typeof unitData === 'object' ? unitData.id : unitData;
    const stars = typeof unitData === 'object' ? unitData.stars : 1;

    let combatHexKey = hexKey;
    if (!asAttacker) {
      const [col, row] = hexKey.split(',').map(Number);
      const mirrorRow = 7 - row;
      combatHexKey = `${col},${mirrorRow}`;
    }

    const unit = createCombatUnit(unitId, combatHexKey, asAttacker, synergyBonuses, stars);
    if (unit) {
      unit.stars = stars;
      unit.ownerId = player.id;
      // Convert Set to allow serialization
      unit.attackedTargets = [];
      army.push(unit);
    }
  });

  return army;
}

function simulateBattle(playerA, playerB, isGhostMatch = false) {
  const armyA = createGhostArmy(playerA, true);
  const armyB = createGhostArmy(playerB, false);

  const allUnits = [...armyA, ...armyB];
  let tick = 0;
  const MAX_TICKS = 1000;

  while (tick < MAX_TICKS) {
    const aliveA = armyA.filter(u => u.hp > 0);
    const aliveB = armyB.filter(u => u.hp > 0);
    if (aliveA.length === 0 || aliveB.length === 0) break;

    for (const unit of allUnits) {
      if (unit.hp <= 0) continue;

      const enemies = unit.isPlayer ? armyB : armyA;
      const target = enemies.filter(e => e.hp > 0)
        .sort((a, b) => hexDistance(unit.hexKey, a.hexKey) - hexDistance(unit.hexKey, b.hexKey))[0];

      if (!target) continue;

      const dist = hexDistance(unit.hexKey, target.hexKey);

      if (dist <= unit.range) {
        let damage = unit.attack;

        // Crit check
        if (Math.random() * 100 < unit.critChance) {
          damage = Math.round(damage * (unit.critDamage / 100));
        }

        // Armor reduction
        const armorReduction = target.armor / (target.armor + 100);
        damage = Math.round(damage * (1 - armorReduction));

        // Flat damage reduction (Tank bonus)
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
        // Move toward target
        const [col, row] = unit.hexKey.split(',').map(Number);
        const [tcol, trow] = target.hexKey.split(',').map(Number);
        const occupied = new Set(allUnits.filter(u => u.hp > 0 && u !== unit).map(u => u.hexKey));

        const dc = Math.sign(tcol - col);
        const dr = Math.sign(trow - row);
        const directKey = `${col + dc},${row + dr}`;

        if (!occupied.has(directKey) && col + dc >= 0 && col + dc < 7 && row + dr >= 0 && row + dr < 8) {
          unit.hexKey = directKey;
        } else {
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

          if (!bestMove) {
            for (const [dcAlt, drAlt] of directions) {
              const nc = col + dcAlt;
              const nr = row + drAlt;
              if (nc < 0 || nc >= 7 || nr < 0 || nr >= 8) continue;
              const altKey = `${nc},${nr}`;
              if (occupied.has(altKey)) continue;
              if (hexDistance(altKey, target.hexKey) === currentDist) {
                bestMove = altKey;
                break;
              }
            }
          }

          if (bestMove) unit.hexKey = bestMove;
        }
      }
    }
    tick++;
  }

  const survivorsA = armyA.filter(u => u.hp > 0);
  const survivorsB = armyB.filter(u => u.hp > 0);

  let winner = null;
  let loser = null;
  let damage = 0;

  if (survivorsA.length > 0 && survivorsB.length === 0) {
    winner = playerA.id;
    loser = playerB.id;
    damage = 2 + survivorsA.reduce((sum, u) => sum + (unitsData[u.id]?.cost || 1), 0);
  } else if (survivorsB.length > 0 && survivorsA.length === 0) {
    winner = playerB.id;
    loser = playerA.id;
    damage = 2 + survivorsB.reduce((sum, u) => sum + (unitsData[u.id]?.cost || 1), 0);
  } else {
    damage = 2;
  }

  // Serialize armies for client animation (strip non-serializable fields)
  const serializeArmy = (army) => army.map(u => ({
    id: u.id, hexKey: u.hexKey, isPlayer: u.isPlayer,
    maxHp: u.maxHp, hp: u.maxHp, // Send starting HP for animation
    attack: u.attack, speed: u.speed, range: u.range,
    armor: u.armor, damageReduction: u.damageReduction,
    role: u.role, faction: u.faction, stars: u.stars,
    ownerId: u.ownerId,
    critChance: u.critChance, critDamage: u.critDamage,
    lifesteal: u.lifesteal, ability: u.ability
  }));

  return {
    playerA: playerA.id,
    playerB: playerB.id,
    winner,
    loser,
    damage,
    isGhostMatch,
    survivorsA: survivorsA.length,
    survivorsB: survivorsB.length,
    armyA: serializeArmy(armyA),
    armyB: serializeArmy(armyB)
  };
}

// ===== ROUND-ROBIN SCHEDULING =====
function generateRoundRobinSchedule() {
  const schedule = [];
  const n = MAX_PLAYERS;

  for (let round = 0; round < n - 1; round++) {
    const matches = [];
    const rotation = [0];

    for (let i = 1; i < n; i++) {
      const pos = (i - 1 + round) % (n - 1) + 1;
      rotation.push(pos);
    }

    for (let i = 0; i < n / 2; i++) {
      matches.push({
        playerA: rotation[i],
        playerB: rotation[n - 1 - i]
      });
    }

    schedule.push(matches);
  }
  return schedule;
}

function getMatchupsForRound(lobby) {
  const scheduleIndex = (lobby.round - 1) % 7;
  const baseMatchups = lobby.roundRobinSchedule[scheduleIndex];
  const alivePlayers = lobby.players.filter(p => p.state.isAlive).map(p => p.state.id);

  if (alivePlayers.length <= 1) return [];

  const matchups = [];
  const paired = new Set();

  for (const match of baseMatchups) {
    const aAlive = lobby.players[match.playerA]?.state.isAlive;
    const bAlive = lobby.players[match.playerB]?.state.isAlive;

    if (aAlive && bAlive && !paired.has(match.playerA) && !paired.has(match.playerB)) {
      matchups.push({
        playerA: match.playerA,
        playerB: match.playerB,
        isGhostMatch: false
      });
      paired.add(match.playerA);
      paired.add(match.playerB);
    }
  }

  const unpaired = alivePlayers.filter(id => !paired.has(id));
  for (const playerId of unpaired) {
    const opponents = alivePlayers.filter(id => id !== playerId);
    if (opponents.length > 0) {
      const ghostOpponent = opponents[Math.floor(Math.random() * opponents.length)];
      matchups.push({
        playerA: playerId,
        playerB: ghostOpponent,
        isGhostMatch: true
      });
    }
  }

  return matchups;
}

// ===== LOBBY CLASS =====
class Lobby {
  constructor(id) {
    this.id = id;
    this.players = [];          // [{ws, state: PlayerState, authToken, disconnected, disconnectTimer}]
    this.status = 'waiting';    // 'waiting' | 'playing' | 'finished'
    this.round = 0;
    this.phase = 'shop';        // 'shop' | 'combat' | 'results'
    this.phaseTimer = null;
    this.roundRobinSchedule = generateRoundRobinSchedule();
    this.eliminationOrder = [];
    this.combatResults = [];
    this.createdAt = Date.now();
    this.readyCombatSet = new Set(); // track which humans clicked ready
  }

  getAliveCount() {
    return this.players.filter(p => p.state.isAlive).length;
  }

  isGameOver() {
    return this.getAliveCount() <= 1;
  }

  getWinner() {
    const alive = this.players.filter(p => p.state.isAlive);
    return alive.length === 1 ? alive[0].state : null;
  }

  broadcast(msg, excludeIndex = -1) {
    const data = JSON.stringify(msg);
    this.players.forEach((p, idx) => {
      if (idx !== excludeIndex && p.ws && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(data);
      }
    });
  }

  sendTo(playerIndex, msg) {
    const p = this.players[playerIndex];
    if (p && p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(msg));
    }
  }

  sendScoreboard() {
    this.broadcast({
      type: 'scoreboard',
      players: this.players.map(p => p.state.toPublic())
    });
  }

  getHumanCount() {
    return this.players.filter(p => !p.state.isBot).length;
  }

  getConnectedHumanCount() {
    return this.players.filter(p => !p.state.isBot && !p.disconnected && p.ws && p.ws.readyState === WebSocket.OPEN).length;
  }
}

// ===== LOBBY MANAGEMENT =====
function generateLobbyId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function createLobby() {
  let id;
  do { id = generateLobbyId(); } while (lobbies.has(id));
  const lobby = new Lobby(id);
  lobbies.set(id, lobby);
  return lobby;
}

function findOrCreateLobby(lobbyId) {
  if (lobbyId && lobbies.has(lobbyId)) {
    const lobby = lobbies.get(lobbyId);
    if (lobby.status === 'waiting' && lobby.players.length < MAX_PLAYERS) {
      return lobby;
    }
    return null; // Lobby full or already started
  }
  return createLobby();
}

// ===== GAME FLOW =====
function fillBotsAndStart(lobby) {
  let botIdx = 0;
  while (lobby.players.length < MAX_PLAYERS) {
    const id = lobby.players.length;
    const name = BOT_NAMES[botIdx++] || `Bot ${id}`;
    const state = new PlayerState(id, name, true);
    state.rollShop();
    lobby.players.push({
      ws: null,
      state,
      authToken: null,
      disconnected: false,
      disconnectTimer: null
    });
  }
  startGame(lobby);
}

function startGame(lobby) {
  lobby.status = 'playing';
  lobby.round = 1;

  // Roll initial shops for all players
  lobby.players.forEach(p => {
    if (!p.state.shop || p.state.shop.length === 0) {
      p.state.rollShop();
    }
  });

  // Send game_start to all humans
  lobby.broadcast({
    type: 'game_start',
    players: lobby.players.map(p => ({
      id: p.state.id,
      name: p.state.name,
      color: p.state.color,
      isBot: p.state.isBot
    })),
    lobbyId: lobby.id
  });

  // Send initial state sync to each human
  lobby.players.forEach((p, idx) => {
    if (!p.state.isBot) {
      sendStateSync(lobby, idx);
    }
  });

  // Start shop phase
  startShopPhase(lobby);
}

function sendStateSync(lobby, playerIndex) {
  const p = lobby.players[playerIndex];
  if (!p || p.state.isBot) return;

  lobby.sendTo(playerIndex, {
    type: 'state_sync',
    you: playerIndex,
    round: lobby.round,
    phase: lobby.phase,
    player: p.state.toPrivate(),
    scoreboard: lobby.players.map(pl => pl.state.toPublic())
  });
}

function startShopPhase(lobby) {
  lobby.phase = 'shop';
  lobby.readyCombatSet.clear();

  const timerSeconds = Math.max(MIN_SHOP_PHASE_SECONDS, BASE_SHOP_PHASE_SECONDS - Math.floor(lobby.round / 3));

  lobby.broadcast({
    type: 'phase_change',
    phase: 'shop',
    round: lobby.round,
    timer: timerSeconds
  });

  // Send each human their shop
  lobby.players.forEach((p, idx) => {
    if (!p.state.isBot && p.state.isAlive) {
      lobby.sendTo(idx, {
        type: 'shop_update',
        shop: p.state.shop,
        gold: p.state.gold
      });
    }
  });

  lobby.sendScoreboard();

  // Phase timer
  lobby.phaseTimer = setTimeout(() => {
    transitionToCombat(lobby);
  }, timerSeconds * 1000);
}

function checkAllHumansReady(lobby) {
  const aliveHumans = lobby.players
    .filter(p => !p.state.isBot && p.state.isAlive && !p.disconnected);

  if (aliveHumans.length === 0) return true;

  return aliveHumans.every(p => lobby.readyCombatSet.has(p.state.id));
}

function transitionToCombat(lobby) {
  if (lobby.phase !== 'shop') return;
  clearTimeout(lobby.phaseTimer);
  lobby.phase = 'combat';

  // Run bot AI
  lobby.players.forEach(p => {
    if (p.state.isBot && p.state.isAlive) {
      BotAI.takeTurn(p.state);
    }
  });

  // Generate matchups
  const matchups = getMatchupsForRound(lobby);

  if (matchups.length === 0) {
    // Game over
    endGame(lobby);
    return;
  }

  // Simulate all battles
  const results = [];
  for (const matchup of matchups) {
    const playerA = lobby.players[matchup.playerA].state;
    const playerB = lobby.players[matchup.playerB].state;

    // Auto-loss for empty boards
    if (Object.keys(playerA.board).length === 0) {
      results.push({
        playerA: playerA.id, playerB: playerB.id,
        winner: playerB.id, loser: playerA.id,
        damage: 2 + playerB.level,
        isGhostMatch: matchup.isGhostMatch,
        survivorsA: 0, survivorsB: Object.keys(playerB.board).length,
        armyA: [], armyB: []
      });
      continue;
    }
    if (Object.keys(playerB.board).length === 0) {
      results.push({
        playerA: playerA.id, playerB: playerB.id,
        winner: playerA.id, loser: playerB.id,
        damage: 2 + playerA.level,
        isGhostMatch: matchup.isGhostMatch,
        survivorsA: Object.keys(playerA.board).length, survivorsB: 0,
        armyA: [], armyB: []
      });
      continue;
    }

    const result = simulateBattle(playerA, playerB, matchup.isGhostMatch);
    results.push(result);
  }

  lobby.combatResults = results;

  // Tell clients about combat phase
  lobby.broadcast({
    type: 'phase_change',
    phase: 'combat',
    round: lobby.round,
    timer: COMBAT_DISPLAY_SECONDS
  });

  // Send each human their matchup
  lobby.players.forEach((p, idx) => {
    if (p.state.isBot || !p.state.isAlive) return;

    const myResult = results.find(r => r.playerA === p.state.id || r.playerB === p.state.id);
    if (myResult) {
      const isPlayerA = myResult.playerA === p.state.id;
      const opponentId = isPlayerA ? myResult.playerB : myResult.playerA;
      const opponent = lobby.players[opponentId].state;

      lobby.sendTo(idx, {
        type: 'matchup',
        opponent: {
          id: opponent.id,
          name: opponent.name,
          color: opponent.color,
          boardCount: opponent.getBoardUnitCount()
        },
        armyA: myResult.armyA,
        armyB: myResult.armyB,
        youArePlayerA: isPlayerA
      });
    }
  });

  // After combat display time, apply results
  lobby.phaseTimer = setTimeout(() => {
    transitionToResults(lobby);
  }, COMBAT_DISPLAY_SECONDS * 1000);
}

function transitionToResults(lobby) {
  if (lobby.phase !== 'combat') return;
  lobby.phase = 'results';

  const results = lobby.combatResults;

  // Apply results
  for (const result of results) {
    if (result.winner !== null && result.loser !== null) {
      const winnerState = lobby.players[result.winner].state;
      const loserState = lobby.players[result.loser].state;

      // Damage (only if not ghost match for the loser)
      if (!result.isGhostMatch) {
        loserState.takeDamage(result.damage);
      } else {
        // In ghost match, only playerA takes/receives damage
        if (result.loser === result.playerA) {
          loserState.takeDamage(result.damage);
        }
      }

      // Streaks
      winnerState.wins++;
      if (winnerState.streak >= 0) winnerState.streak++;
      else winnerState.streak = 1;

      loserState.losses++;
      if (loserState.streak <= 0) loserState.streak--;
      else loserState.streak = -1;
    } else {
      // Draw — both take minor damage
      const pA = lobby.players[result.playerA].state;
      const pB = lobby.players[result.playerB].state;
      if (!result.isGhostMatch) {
        pA.takeDamage(result.damage);
        pB.takeDamage(result.damage);
      }
    }
  }

  // Gold income
  lobby.players.forEach(p => {
    if (!p.state.isAlive) return;
    const baseIncome = 5;
    const interestIncome = Math.min(5, Math.floor(p.state.gold / 10));
    const streakBonus = Math.min(3, Math.abs(p.state.streak));
    p.state.earnGold(baseIncome + interestIncome + streakBonus);
  });

  // Process eliminations
  lobby.players.forEach(p => {
    if (!p.state.isAlive && p.state.placement === 0) {
      p.state.placement = 8 - lobby.eliminationOrder.length;
      lobby.eliminationOrder.push(p.state.id);

      lobby.broadcast({
        type: 'elimination',
        playerId: p.state.id,
        playerName: p.state.name,
        placement: p.state.placement
      });
    }
  });

  // Send results
  lobby.broadcast({
    type: 'combat_result',
    results: results.map(r => ({
      playerA: r.playerA,
      playerB: r.playerB,
      winner: r.winner,
      loser: r.loser,
      damage: r.damage,
      isGhostMatch: r.isGhostMatch,
      survivorsA: r.survivorsA,
      survivorsB: r.survivorsB
    }))
  });

  lobby.sendScoreboard();

  // Check game over
  if (lobby.isGameOver()) {
    lobby.phaseTimer = setTimeout(() => {
      endGame(lobby);
    }, RESULTS_DISPLAY_SECONDS * 1000);
    return;
  }

  // Next round
  lobby.phaseTimer = setTimeout(() => {
    lobby.round++;

    // Roll new shops
    lobby.players.forEach(p => {
      if (p.state.isAlive) {
        p.state.rollShop();
      }
    });

    startShopPhase(lobby);
  }, RESULTS_DISPLAY_SECONDS * 1000);
}

function endGame(lobby) {
  clearTimeout(lobby.phaseTimer);
  lobby.status = 'finished';

  const winner = lobby.getWinner();
  if (winner) {
    winner.placement = 1;
  }

  // Build final placements
  const placements = lobby.players.map(p => ({
    id: p.state.id,
    name: p.state.name,
    placement: p.state.placement,
    isBot: p.state.isBot
  })).sort((a, b) => a.placement - b.placement);

  lobby.broadcast({
    type: 'game_over',
    winner: winner ? { id: winner.id, name: winner.name } : null,
    placements
  });

  // Schedule cleanup
  setTimeout(() => {
    lobbies.delete(lobby.id);
    console.log(`Lobby ${lobby.id} cleaned up`);
  }, LOBBY_CLEANUP_MS);
}

// ===== ACTION HANDLERS =====
function handleBuy(lobby, playerIndex, msg) {
  const ps = lobby.players[playerIndex].state;
  if (lobby.phase !== 'shop') return sendError(lobby, playerIndex, 'Not in shop phase');
  if (!ps.isAlive) return;

  const shopIndex = msg.shopIndex;
  if (shopIndex < 0 || shopIndex >= SHOP_SIZE) return sendError(lobby, playerIndex, 'Invalid shop slot');

  const unitId = ps.shop[shopIndex];
  if (!unitId) return sendError(lobby, playerIndex, 'Slot empty');

  const unit = unitsData[unitId];
  if (!unit) return sendError(lobby, playerIndex, 'Unknown unit');
  if (!ps.canAfford(unit.cost)) return sendError(lobby, playerIndex, 'Not enough gold');

  const emptyBench = ps.bench.findIndex(s => s === null);
  if (emptyBench === -1) return sendError(lobby, playerIndex, 'Bench full');

  // Apply
  ps.spendGold(unit.cost);
  ps.bench[emptyBench] = { id: unitId, stars: 1 };
  ps.shop[shopIndex] = null;

  // Check merge
  BotAI.checkAndMerge(ps, unitId, 1);

  sendBoardUpdate(lobby, playerIndex);
}

function handleSellBoard(lobby, playerIndex, msg) {
  const ps = lobby.players[playerIndex].state;
  if (lobby.phase !== 'shop') return sendError(lobby, playerIndex, 'Not in shop phase');

  const hexKey = msg.hexKey;
  const unit = ps.board[hexKey];
  if (!unit) return sendError(lobby, playerIndex, 'No unit at that hex');

  const data = unitsData[unit.id];
  const sellValue = getSellValue(data.cost, unit.stars);
  ps.earnGold(sellValue);
  delete ps.board[hexKey];

  sendBoardUpdate(lobby, playerIndex);
}

function handleSellBench(lobby, playerIndex, msg) {
  const ps = lobby.players[playerIndex].state;
  if (lobby.phase !== 'shop') return sendError(lobby, playerIndex, 'Not in shop phase');

  const benchIndex = msg.benchIndex;
  if (benchIndex < 0 || benchIndex >= BENCH_SIZE) return sendError(lobby, playerIndex, 'Invalid bench slot');

  const unit = ps.bench[benchIndex];
  if (!unit) return sendError(lobby, playerIndex, 'No unit in that bench slot');

  const data = unitsData[unit.id];
  const sellValue = getSellValue(data.cost, unit.stars);
  ps.earnGold(sellValue);
  ps.bench[benchIndex] = null;

  sendBoardUpdate(lobby, playerIndex);
}

function handlePlace(lobby, playerIndex, msg) {
  const ps = lobby.players[playerIndex].state;
  if (lobby.phase !== 'shop') return sendError(lobby, playerIndex, 'Not in shop phase');

  const { benchIndex, hexKey } = msg;
  if (benchIndex < 0 || benchIndex >= BENCH_SIZE) return sendError(lobby, playerIndex, 'Invalid bench slot');

  const unit = ps.bench[benchIndex];
  if (!unit) return sendError(lobby, playerIndex, 'No unit in bench slot');

  // Validate hex is in player zone (rows 4-7)
  const [col, row] = hexKey.split(',').map(Number);
  if (col < 0 || col >= 7 || row < 4 || row > 7) return sendError(lobby, playerIndex, 'Invalid hex position');

  // Check if hex is occupied — if so, swap to bench
  if (ps.board[hexKey]) {
    // Swap: board unit goes to bench, bench unit goes to board
    const boardUnit = ps.board[hexKey];
    ps.bench[benchIndex] = boardUnit;
    ps.board[hexKey] = unit;
  } else {
    // Check unit cap
    if (ps.getBoardUnitCount() >= ps.getUnitCap()) {
      return sendError(lobby, playerIndex, 'Board full (level up to place more)');
    }
    ps.board[hexKey] = unit;
    ps.bench[benchIndex] = null;
  }

  sendBoardUpdate(lobby, playerIndex);
}

function handleMove(lobby, playerIndex, msg) {
  const ps = lobby.players[playerIndex].state;
  if (lobby.phase !== 'shop') return sendError(lobby, playerIndex, 'Not in shop phase');

  const { fromHex, toHex } = msg;

  const unit = ps.board[fromHex];
  if (!unit) return sendError(lobby, playerIndex, 'No unit at source hex');

  // Validate destination
  const [col, row] = toHex.split(',').map(Number);
  if (col < 0 || col >= 7 || row < 4 || row > 7) return sendError(lobby, playerIndex, 'Invalid hex position');

  if (ps.board[toHex]) {
    // Swap
    const other = ps.board[toHex];
    ps.board[toHex] = unit;
    ps.board[fromHex] = other;
  } else {
    ps.board[toHex] = unit;
    delete ps.board[fromHex];
  }

  sendBoardUpdate(lobby, playerIndex);
}

function handleBoardToBench(lobby, playerIndex, msg) {
  const ps = lobby.players[playerIndex].state;
  if (lobby.phase !== 'shop') return sendError(lobby, playerIndex, 'Not in shop phase');

  const { hexKey, benchIndex } = msg;

  const unit = ps.board[hexKey];
  if (!unit) return sendError(lobby, playerIndex, 'No unit at hex');

  if (benchIndex !== undefined && benchIndex >= 0 && benchIndex < BENCH_SIZE) {
    if (ps.bench[benchIndex]) {
      // Swap with bench unit
      const benchUnit = ps.bench[benchIndex];
      ps.bench[benchIndex] = unit;
      ps.board[hexKey] = benchUnit;
    } else {
      ps.bench[benchIndex] = unit;
      delete ps.board[hexKey];
    }
  } else {
    // Find empty bench slot
    const emptySlot = ps.bench.findIndex(s => s === null);
    if (emptySlot === -1) return sendError(lobby, playerIndex, 'Bench full');
    ps.bench[emptySlot] = unit;
    delete ps.board[hexKey];
  }

  sendBoardUpdate(lobby, playerIndex);
}

function handleBenchSwap(lobby, playerIndex, msg) {
  const ps = lobby.players[playerIndex].state;
  const { fromIndex, toIndex } = msg;

  if (fromIndex < 0 || fromIndex >= BENCH_SIZE || toIndex < 0 || toIndex >= BENCH_SIZE) {
    return sendError(lobby, playerIndex, 'Invalid bench slots');
  }

  const temp = ps.bench[fromIndex];
  ps.bench[fromIndex] = ps.bench[toIndex];
  ps.bench[toIndex] = temp;

  sendBoardUpdate(lobby, playerIndex);
}

function handleReroll(lobby, playerIndex) {
  const ps = lobby.players[playerIndex].state;
  if (lobby.phase !== 'shop') return sendError(lobby, playerIndex, 'Not in shop phase');
  if (!ps.canAfford(REROLL_COST)) return sendError(lobby, playerIndex, 'Not enough gold');

  ps.spendGold(REROLL_COST);
  ps.rollShop();

  lobby.sendTo(playerIndex, {
    type: 'shop_update',
    shop: ps.shop,
    gold: ps.gold
  });
}

function handleLevelUp(lobby, playerIndex) {
  const ps = lobby.players[playerIndex].state;
  if (lobby.phase !== 'shop') return sendError(lobby, playerIndex, 'Not in shop phase');
  if (ps.level >= MAX_LEVEL) return sendError(lobby, playerIndex, 'Already max level');
  if (!ps.canAfford(LEVEL_UP_COST)) return sendError(lobby, playerIndex, 'Not enough gold');

  ps.spendGold(LEVEL_UP_COST);
  ps.level++;

  sendBoardUpdate(lobby, playerIndex);
}

function handleReadyCombat(lobby, playerIndex) {
  if (lobby.phase !== 'shop') return;

  const ps = lobby.players[playerIndex].state;
  if (!ps.isAlive) return;

  lobby.readyCombatSet.add(ps.id);

  if (checkAllHumansReady(lobby)) {
    transitionToCombat(lobby);
  }
}

// ===== HELPERS =====
function sendBoardUpdate(lobby, playerIndex) {
  const ps = lobby.players[playerIndex].state;
  lobby.sendTo(playerIndex, {
    type: 'board_update',
    board: ps.board,
    bench: ps.bench,
    gold: ps.gold,
    level: ps.level,
    unitCap: ps.getUnitCap(),
    shop: ps.shop
  });
}

function sendError(lobby, playerIndex, message) {
  lobby.sendTo(playerIndex, {
    type: 'error',
    message
  });
}

// ===== WEBSOCKET HANDLER =====
wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return;
    }

    const meta = socketMeta.get(ws);

    switch (msg.type) {
      case 'join': {
        const lobbyId = msg.lobbyId || null;
        const name = (msg.name || 'Player').slice(0, 16);
        const practice = msg.practice || false;

        let lobby;
        if (practice) {
          lobby = createLobby();
        } else {
          lobby = findOrCreateLobby(lobbyId);
        }

        if (!lobby) {
          ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found or full' }));
          return;
        }

        const playerIndex = lobby.players.length;
        const authToken = crypto.randomBytes(16).toString('hex');
        const state = new PlayerState(playerIndex, name, false);
        state.rollShop();

        lobby.players.push({
          ws,
          state,
          authToken,
          disconnected: false,
          disconnectTimer: null
        });

        socketMeta.set(ws, { lobbyId: lobby.id, playerIndex, authToken });

        // Send lobby state
        ws.send(JSON.stringify({
          type: 'lobby_state',
          lobbyId: lobby.id,
          you: playerIndex,
          authToken,
          players: lobby.players.map(p => ({
            id: p.state.id,
            name: p.state.name,
            isBot: p.state.isBot,
            isReady: false
          }))
        }));

        // Notify others
        lobby.broadcast({
          type: 'lobby_state',
          lobbyId: lobby.id,
          players: lobby.players.map(p => ({
            id: p.state.id,
            name: p.state.name,
            isBot: p.state.isBot,
            isReady: false
          }))
        }, playerIndex);

        // If practice mode, fill with bots and start immediately
        if (practice) {
          fillBotsAndStart(lobby);
        }

        console.log(`${name} joined lobby ${lobby.id} (${lobby.players.length}/${MAX_PLAYERS})`);
        break;
      }

      case 'ready': {
        if (!meta) return;
        const lobby = lobbies.get(meta.lobbyId);
        if (!lobby || lobby.status !== 'waiting') return;

        // When any human sends ready, fill bots and start
        fillBotsAndStart(lobby);
        break;
      }

      case 'reconnect': {
        const lobby = lobbies.get(msg.lobbyId);
        if (!lobby) {
          ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
          return;
        }

        const playerIndex = msg.playerIndex;
        const player = lobby.players[playerIndex];
        if (!player || player.state.isBot) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid player' }));
          return;
        }
        if (player.authToken !== msg.authToken) {
          ws.send(JSON.stringify({ type: 'error', message: 'Auth failed' }));
          return;
        }

        // Replace socket
        player.ws = ws;
        player.disconnected = false;
        if (player.disconnectTimer) {
          clearTimeout(player.disconnectTimer);
          player.disconnectTimer = null;
        }

        socketMeta.set(ws, { lobbyId: lobby.id, playerIndex, authToken: player.authToken });

        // Send full state sync
        sendStateSync(lobby, playerIndex);
        console.log(`${player.state.name} reconnected to lobby ${lobby.id}`);
        break;
      }

      case 'buy':            if (meta) { const l = lobbies.get(meta.lobbyId); if (l) handleBuy(l, meta.playerIndex, msg); } break;
      case 'sell_board':      if (meta) { const l = lobbies.get(meta.lobbyId); if (l) handleSellBoard(l, meta.playerIndex, msg); } break;
      case 'sell_bench':      if (meta) { const l = lobbies.get(meta.lobbyId); if (l) handleSellBench(l, meta.playerIndex, msg); } break;
      case 'place':           if (meta) { const l = lobbies.get(meta.lobbyId); if (l) handlePlace(l, meta.playerIndex, msg); } break;
      case 'move':            if (meta) { const l = lobbies.get(meta.lobbyId); if (l) handleMove(l, meta.playerIndex, msg); } break;
      case 'board_to_bench':  if (meta) { const l = lobbies.get(meta.lobbyId); if (l) handleBoardToBench(l, meta.playerIndex, msg); } break;
      case 'bench_swap':      if (meta) { const l = lobbies.get(meta.lobbyId); if (l) handleBenchSwap(l, meta.playerIndex, msg); } break;
      case 'reroll':          if (meta) { const l = lobbies.get(meta.lobbyId); if (l) handleReroll(l, meta.playerIndex); } break;
      case 'level_up':        if (meta) { const l = lobbies.get(meta.lobbyId); if (l) handleLevelUp(l, meta.playerIndex); } break;
      case 'ready_combat':    if (meta) { const l = lobbies.get(meta.lobbyId); if (l) handleReadyCombat(l, meta.playerIndex); } break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', t: msg.t }));
        break;
    }
  });

  ws.on('close', () => {
    const meta = socketMeta.get(ws);
    if (meta) {
      const lobby = lobbies.get(meta.lobbyId);
      if (lobby) {
        const player = lobby.players[meta.playerIndex];
        if (player) {
          player.disconnected = true;
          player.ws = null;
          console.log(`${player.state.name} disconnected from lobby ${lobby.id}`);

          // Grace period for reconnection
          if (lobby.status === 'playing') {
            player.disconnectTimer = setTimeout(() => {
              console.log(`${player.state.name} timed out — treating as eliminated`);
              // Don't forcefully eliminate — just let them take bot-like zero actions
            }, DISCONNECT_GRACE_MS);
          }

          // If lobby is waiting and no humans left, clean up
          if (lobby.status === 'waiting' && lobby.getConnectedHumanCount() === 0) {
            lobbies.delete(lobby.id);
            console.log(`Empty lobby ${lobby.id} cleaned up`);
          }
        }
      }
      socketMeta.delete(ws);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

// ===== START SERVER =====
httpServer.listen(PORT, () => {
  console.log(`FFFA server listening on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}`);
  console.log(`Static files served from ${APP_ROOT}`);
});
