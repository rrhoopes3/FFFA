// ============================================================
//  FFFA -- Network Manager (Online Multiplayer)
//  Version: 0.3.0.0
//  Handles WebSocket connection, lobby management, message
//  routing, state sync, phase changes, matchups, combat
//  results, scoreboard, elimination, and game over.
// ============================================================
(function () {
  'use strict';
  const G = window.FFFA;

  const NetworkManager = {
    ws: null,
    isOnline: false,
    inQueue: false,
    lobbyMode: null, // 'private' | 'party-queue' | null
    lobbyId: null,
    playerIndex: null,
    authToken: null,
    phaseTimerInterval: null,
    phaseTimeRemaining: 0,

    // ----------------------------------------------------------
    //  Connection
    // ----------------------------------------------------------
    connect(serverUrl, name, lobbyId, practice) {
      console.log('[WS] Attempting connection to:', serverUrl);
      this.setStatus('Connecting to ' + serverUrl + '...');

      try {
        this.ws = new WebSocket(serverUrl);
      } catch (e) {
        console.error('[WS] Failed to create WebSocket:', e);
        this.setStatus('Connection failed: ' + e.message);
        return;
      }

      this.ws.onopen = () => {
        console.log('[WS] Connection established');
        this.setStatus('Connected! Joining...');
        this.send({
          type: 'join',
          name: name,
          lobbyId: lobbyId || undefined,
          practice: practice || false
        });
      };

      this.ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        console.log('[WS] Received:', msg.type);
        this.onMessage(msg);
      };

      this.ws.onclose = (event) => {
        console.log('[WS] Connection closed. Code:', event.code,
          'Reason:', event.reason || 'No reason provided');
        this.setStatus('Disconnected. Refresh to reconnect.');
        if (this.isOnline) {
          // Try to reconnect
          setTimeout(() => this.tryReconnect(), 2000);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WS] WebSocket error:', error);
        this.setStatus('Connection error - check console for details');
      };
    },

    // ----------------------------------------------------------
    //  Send helper
    // ----------------------------------------------------------
    send(msg) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      }
    },

    // ----------------------------------------------------------
    //  Reconnect
    // ----------------------------------------------------------
    tryReconnect() {
      if (!this.lobbyId || !this.authToken) return;
      const url = document.getElementById('server-url').value;
      try {
        this.ws = new WebSocket(url);
        this.ws.onopen = () => {
          this.send({
            type: 'reconnect',
            lobbyId: this.lobbyId,
            playerIndex: this.playerIndex,
            authToken: this.authToken
          });
        };
        this.ws.onmessage = (e) => {
          let msg;
          try { msg = JSON.parse(e.data); } catch { return; }
          this.onMessage(msg);
        };
        this.ws.onclose = () => {
          setTimeout(() => this.tryReconnect(), 3000);
        };
      } catch (e) { /* retry later */ }
    },

    // ----------------------------------------------------------
    //  Status display
    // ----------------------------------------------------------
    setStatus(text) {
      const el = document.getElementById('lobby-status');
      if (el) el.textContent = text;
    },

    // ----------------------------------------------------------
    //  Message router
    // ----------------------------------------------------------
    onMessage(msg) {
      switch (msg.type) {
        case 'lobby_state':   this.handleLobbyState(msg);   break;
        case 'queue_status':  this.handleQueueStatus(msg);  break;
        case 'game_start':    this.handleGameStart(msg);    break;
        case 'state_sync':    this.handleStateSync(msg);    break;
        case 'shop_update':   this.handleShopUpdate(msg);   break;
        case 'board_update':  this.handleBoardUpdate(msg);  break;
        case 'phase_change':  this.handlePhaseChange(msg);  break;
        case 'matchup':       this.handleMatchup(msg);      break;
        case 'combat_result': this.handleCombatResult(msg); break;
        case 'scoreboard':    this.handleScoreboard(msg);   break;
        case 'elimination':   this.handleElimination(msg);  break;
        case 'game_over':     this.handleGameOver(msg);     break;
        case 'error':         this.handleError(msg);        break;
      }
    },

    // ----------------------------------------------------------
    //  Queue status
    // ----------------------------------------------------------
    handleQueueStatus(msg) {
      const queueInfo = document.getElementById('queue-info');
      queueInfo.style.display = 'block';
      document.getElementById('queue-count').textContent = msg.count;
      const pct = (msg.count / msg.max) * 100;
      document.getElementById('queue-bar').style.width = pct + '%';
    },

    // ----------------------------------------------------------
    //  Lobby state
    // ----------------------------------------------------------
    handleLobbyState(msg) {
      // If we were in queue, hide queue UI (match found!)
      if (this.inQueue) {
        this.inQueue = false;
        document.getElementById('queue-info').style.display = 'none';
      }

      this.lobbyId = msg.lobbyId;
      if (msg.you !== undefined) this.playerIndex = msg.you;
      if (msg.authToken) {
        this.authToken = msg.authToken;
        sessionStorage.setItem('fffa_auth', JSON.stringify({
          lobbyId: this.lobbyId,
          playerIndex: this.playerIndex,
          authToken: this.authToken
        }));
      }

      // Show lobby info
      const lobbyInfo = document.getElementById('lobby-info');
      lobbyInfo.style.display = 'block';
      document.getElementById('lobby-form').style.display = 'none';
      document.getElementById('lobby-id-display').textContent = msg.lobbyId;

      // Build shareable URL (https, not wss)
      const shareUrl = window.location.origin + '?lobby=' + msg.lobbyId;
      document.getElementById('lobby-share-url').textContent = shareUrl;

      // Show correct action button based on lobby mode
      const startBtn = document.getElementById('btn-start-game');
      const queuePartyBtn = document.getElementById('btn-queue-party');
      if (this.lobbyMode === 'party-queue') {
        startBtn.style.display = 'none';
        queuePartyBtn.style.display = '';
      } else {
        startBtn.style.display = '';
        queuePartyBtn.style.display = 'none';
      }

      const list = document.getElementById('lobby-players-list');
      list.innerHTML = msg.players.map(p =>
        `<div style="padding:4px 8px; margin:2px 0; background:${p.isBot ? '#333' : '#1a3a1a'}; border-radius:4px; font-size:13px;">
          ${p.isBot ? '\u{1F916}' : '\u{1F464}'} ${p.name} ${p.id === this.playerIndex ? '(you)' : ''}
        </div>`
      ).join('');

      this.setStatus(`${msg.players.length}/8 players in lobby`);
    },

    // ----------------------------------------------------------
    //  Game start
    // ----------------------------------------------------------
    handleGameStart(msg) {
      this.isOnline = true;

      // Hide lobby, show game
      document.getElementById('lobby-screen').style.display = 'none';
      document.getElementById('mode-select').style.display = 'none';

      // Store player info
      window.GameState.mode = 'online';

      // Set up PLAYER_NAMES from server data
      msg.players.forEach((p, i) => {
        if (G.PLAYER_NAMES) G.PLAYER_NAMES[i] = p.name;
      });
    },

    // ----------------------------------------------------------
    //  State sync (full state from server)
    // ----------------------------------------------------------
    handleStateSync(msg) {
      this.playerIndex = msg.you;

      // Sync to shared state
      const p = msg.player;
      G.gold        = p.gold;
      G.health      = p.health;
      G.playerLevel = p.level;
      G.playerBoard = p.board;
      G.bench       = p.bench;
      G.shopUnits   = p.shop;
      G.currentRound = msg.round;

      // Initialize GameState players from scoreboard
      window.GameState.mode  = 'online';
      window.GameState.round = msg.round;
      window.GameState.phase = msg.phase;
      window.GameState.players = msg.scoreboard.map(s => {
        const pl = new window.Player(s.id, s.name, s.isBot);
        pl.health    = s.health;
        pl.gold      = s.gold;
        pl.level     = s.level;
        pl.isAlive   = s.isAlive;
        pl.wins      = s.wins;
        pl.losses    = s.losses;
        pl.streak    = s.streak;
        pl.placement = s.placement;
        pl.color     = s.color;
        return pl;
      });
      window.GameState.humanPlayerIndex = this.playerIndex;

      // Show scoreboard
      document.getElementById('scoreboard').classList.add('active');

      // Render everything
      window.RenderSystem.renderShop();
      window.RenderSystem.renderBoard();
      window.RenderSystem.renderBench();
      window.InputSystem.setupBenchEvents();
      window.RenderSystem.updateUI();
      window.SynergySystem.renderSynergies();
      window.CombatSystem.renderScoreboard();

      // Override fight button for online
      document.getElementById('fight').onclick = function () {
        if (G.combatState !== 'idle') return;
        NetworkManager.send({ type: 'ready_combat' });
        document.getElementById('fight').textContent = '\u23F3 WAITING...';
        document.getElementById('fight').disabled = true;
      };

      // Start animation loop
      requestAnimationFrame(window.CombatSystem.animationLoop);

      // Show round banner
      G.roundBanner = {
        text: `ROUND ${msg.round}`,
        subtext: 'Online Match',
        color: '#4CAF50',
        startTime: Date.now(),
        duration: 2000
      };
    },

    // ----------------------------------------------------------
    //  Shop update
    // ----------------------------------------------------------
    handleShopUpdate(msg) {
      G.shopUnits = msg.shop;
      G.gold      = msg.gold;
      window.RenderSystem.renderShop();
      window.RenderSystem.updateUI();
    },

    // ----------------------------------------------------------
    //  Board update
    // ----------------------------------------------------------
    handleBoardUpdate(msg) {
      G.playerBoard = msg.board;
      G.bench       = msg.bench;
      G.gold        = msg.gold;
      G.playerLevel = msg.level;
      G.shopUnits   = msg.shop;
      window.RenderSystem.renderShop();
      window.RenderSystem.renderBoard();
      window.RenderSystem.renderBench();
      window.SynergySystem.renderSynergies();
      window.RenderSystem.updateUI();
    },

    // ----------------------------------------------------------
    //  Phase change
    // ----------------------------------------------------------
    handlePhaseChange(msg) {
      console.log('[Client] Phase change:', msg.phase, 'round:', msg.round);

      if (msg.phase === 'shop') {
        G.combatState = 'idle';
        G.combatUnits = [];
        G.enemyBoard  = {};

        // Restore player board from pre-combat snapshot
        if (G.preCombatBoard) {
          G.playerBoard = G.preCombatBoard;
          G.preCombatBoard = null;
        }
        G.currentRound = msg.round;

        // Re-enable fight button
        const fightBtn = document.getElementById('fight');
        fightBtn.textContent = '\u2694\uFE0F READY';
        fightBtn.disabled = false;

        // Start phase timer
        this.startPhaseTimer(msg.timer, 'Shop Phase');

        G.roundBanner = {
          text: `ROUND ${msg.round}`,
          subtext: `Shop Phase \u2014 ${msg.timer}s`,
          color: '#fff',
          startTime: Date.now(),
          duration: 2000
        };
        window.RenderSystem.renderBoard();

      } else if (msg.phase === 'combat') {
        this.startPhaseTimer(msg.timer, 'Combat');
        document.getElementById('fight').textContent = '\u2694\uFE0F FIGHTING';
        document.getElementById('fight').disabled = true;

      } else if (msg.phase === 'results') {
        this.startPhaseTimer(msg.timer || 5, 'Results');
      }
    },

    // ----------------------------------------------------------
    //  Matchup (receive armies, start animated combat)
    // ----------------------------------------------------------
    handleMatchup(msg) {
      G.combatState = 'combat';
      G.preCombatBoard = { ...G.playerBoard };
      G.visualEffects  = [];
      G.activeCombatSynergies = window.SynergySystem.getSynergyBonuses();

      // Determine which army is ours and which is the enemy's
      const myArmy    = msg.youArePlayerA ? msg.armyA : msg.armyB;
      const enemyArmy = msg.youArePlayerA ? msg.armyB : msg.armyA;

      // Populate enemyBoard so renderBoard() can draw enemy units
      G.enemyBoard = {};
      enemyArmy.forEach(u => {
        if (u.hexKey) {
          G.enemyBoard[u.hexKey] = { id: u.id, stars: u.stars || 1 };
        }
      });

      // Build combatUnits from the armies
      // If we're playerB, flip isPlayer so our units are "player" side
      const needsFlip   = !msg.youArePlayerA;
      const allArmyUnits = [...msg.armyA, ...msg.armyB];

      const combatNow = Date.now();
      G.combatUnits = allArmyUnits.map(u => ({
        ...u,
        isPlayer: needsFlip ? !u.isPlayer : u.isPlayer,
        maxHp: u.maxHp,
        hp: u.hp || u.maxHp,
        statusEffects: [],
        attackedTargets: new Set(),
        hasCast: false,
        hasRevived: false,
        lastActionTime: combatNow,
        lastMoveTime: combatNow,
        actionCooldown: 1000 / (u.speed || 1),
        moveCooldown: 600 / (u.speed || 1),
        mana: 0,
        maxMana: MANA_TO_CAST
      }));

      // Show matchup banner
      G.roundBanner = {
        text: `VS ${msg.opponent.name}`,
        subtext: 'Combat!',
        color: msg.opponent.color || '#f44',
        startTime: Date.now(),
        duration: 2000
      };

      // Log combat start
      G.combatLog = [];
      G.combatLog.push('=== COMBAT START ===');
      G.combatLog.push(`You vs ${msg.opponent.name}`);
      G.combatLog.push(`Your army: ${myArmy.length} units`);
      G.combatLog.push(`Enemy army: ${enemyArmy.length} units`);
      document.getElementById('combatLog').style.display = 'block';
      window.CombatSystem.updateCombatLog();

      window.RenderSystem.renderBoard();

      // Start the combat animation loop (cosmetic only -- server result is canonical)
      G.combatStartTime  = Date.now();
      G.lastCombatTime   = G.combatStartTime;
      G._combatTickCount = 0; // Reset tick counter

      console.log(`[Online Combat Start] ${G.combatUnits.length} units (${G.combatUnits.filter(u => u.isPlayer).length}P vs ${G.combatUnits.filter(u => !u.isPlayer).length}E)`);

      requestAnimationFrame(window.CombatSystem.combatLoop);
    },

    // ----------------------------------------------------------
    //  Combat result (canonical outcome from server)
    // ----------------------------------------------------------
    handleCombatResult(msg) {
      console.log('[Client] Received combat_result');
      // Find our matchup result
      const myResult = msg.results.find(r =>
        r.playerA === this.playerIndex || r.playerB === this.playerIndex
      );

      if (myResult) {
        const won    = myResult.winner === this.playerIndex;
        const damage = myResult.damage;

        G.roundBanner = {
          text: won ? '\u{1F3C6} VICTORY' : '\u{1F480} DEFEAT',
          subtext: won ? 'Well played!' : `${damage} damage taken`,
          color: won ? '#4f4' : '#f44',
          startTime: Date.now(),
          duration: 2500
        };
      }

      // End combat visuals
      setTimeout(() => {
        G.combatState = 'idle';
        G.combatUnits = [];
        G.enemyBoard  = {};
        if (G.preCombatBoard) {
          G.playerBoard = G.preCombatBoard;
          G.preCombatBoard = null;
        }
        window.RenderSystem.renderBoard();
      }, 500);
    },

    // ----------------------------------------------------------
    //  Scoreboard update
    // ----------------------------------------------------------
    handleScoreboard(msg) {
      // Update GameState players from scoreboard data
      msg.players.forEach(s => {
        if (window.GameState.players[s.id]) {
          const p = window.GameState.players[s.id];
          p.health    = s.health;
          p.gold      = s.gold;
          p.isAlive   = s.isAlive;
          p.wins      = s.wins;
          p.losses    = s.losses;
          p.streak    = s.streak;
          p.placement = s.placement;
        }
      });

      // Update own health
      const me = msg.players.find(p => p.id === this.playerIndex);
      if (me) {
        G.health = me.health;
        G.gold   = me.gold;
        window.RenderSystem.updateUI();
      }

      window.CombatSystem.renderScoreboard();
    },

    // ----------------------------------------------------------
    //  Elimination
    // ----------------------------------------------------------
    handleElimination(msg) {
      if (msg.playerId === this.playerIndex) {
        G.roundBanner = {
          text: '\u{1F480} ELIMINATED',
          subtext: `You placed #${msg.placement}`,
          color: '#f44',
          startTime: Date.now(),
          duration: 4000
        };
        window.RenderSystem.renderBoard();
      } else {
        G.roundBanner = {
          text: `${msg.playerName} Eliminated`,
          subtext: `Placed #${msg.placement}`,
          color: '#888',
          startTime: Date.now(),
          duration: 2000
        };
      }
    },

    // ----------------------------------------------------------
    //  Game over
    // ----------------------------------------------------------
    handleGameOver(msg) {
      this.stopPhaseTimer();
      const isWinner = msg.winner && msg.winner.id === this.playerIndex;

      G.roundBanner = {
        text: isWinner ? '\u{1F3C6} YOU WIN!' : `${msg.winner?.name || 'Nobody'} Wins!`,
        subtext: `Final placement: #${msg.placements.find(p => p.id === this.playerIndex)?.placement || '?'}`,
        color: isWinner ? '#ffd700' : '#aaa',
        startTime: Date.now(),
        duration: 10000
      };
      window.RenderSystem.renderBoard();

      setTimeout(() => {
        if (confirm('Game over! Play again?')) {
          location.reload();
        }
      }, 3000);
    },

    // ----------------------------------------------------------
    //  Error handler
    // ----------------------------------------------------------
    handleError(msg) {
      console.warn('Server error:', msg.message);
      // Suppress noisy expected errors -- just log them
      const suppress = ['Board full', 'Not in shop phase', 'Invalid hex'];
      if (suppress.some(s => msg.message.includes(s))) return;
      window.RenderSystem.showErrorToast(msg.message);
    },

    // ----------------------------------------------------------
    //  Phase timer
    // ----------------------------------------------------------
    startPhaseTimer(seconds, label) {
      this.stopPhaseTimer();
      this.phaseTimeRemaining = seconds;

      const timerDisplay = document.getElementById('phase-timer-display');
      const timerLabel   = document.getElementById('phase-timer-label');
      const timerValue   = document.getElementById('phase-timer-value');

      timerDisplay.style.display = 'flex';
      timerLabel.textContent = label;
      timerValue.textContent = seconds;

      this.phaseTimerInterval = setInterval(() => {
        this.phaseTimeRemaining--;
        timerValue.textContent = Math.max(0, this.phaseTimeRemaining);
        if (this.phaseTimeRemaining <= 0) {
          this.stopPhaseTimer();
        }
      }, 1000);
    },

    stopPhaseTimer() {
      clearInterval(this.phaseTimerInterval);
      this.phaseTimerInterval = null;
      const timerDisplay = document.getElementById('phase-timer-display');
      if (timerDisplay) timerDisplay.style.display = 'none';
    }
  };

  // Expose globally
  window.NetworkManager = NetworkManager;
})();
