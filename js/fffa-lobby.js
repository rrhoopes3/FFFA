// ============================================================
//  FFFA — Lobby & Initialization System
//  Version: 0.3.0.0
//  Mode selection, lobby UI, WebSocket auto-detect,
//  matchmaking queue, and game bootstrap.
// ============================================================
(function() {
  'use strict';
  const G = window.FFFA;

  // ========== SINGLE PLAYER ==========
  function startSinglePlayer() {
    document.getElementById('mode-select').style.display = 'none';
    window.GameState.mode = 'single';

    // Fight button for single player mode
    document.getElementById('fight').onclick = function() {
      if (G.combatState !== 'idle') return;
      window.CombatSystem.startCombat();
    };

    window.CombatSystem.init();
  }

  // ========== MULTIPLAYER ==========
  function startMultiplayer() {
    document.getElementById('mode-select').style.display = 'none';
    window.GameState.mode = 'multiplayer';

    // Initialize 8 players
    const human = window.GameState.init(1);

    // Sync human's initial state to legacy variables
    G.gold = human.gold;
    G.health = human.health;
    G.playerLevel = human.level;
    G.playerBoard = human.board;
    G.bench = human.bench;
    G.shopUnits = human.shop;
    G.currentRound = window.GameState.round;

    // Show scoreboard
    document.getElementById('scoreboard').classList.add('active');

    // Initialize game
    window.RenderSystem.renderShop();
    window.RenderSystem.renderBoard();
    window.RenderSystem.renderBench();
    window.InputSystem.setupBenchEvents();
    window.RenderSystem.updateUI();
    window.SynergySystem.renderSynergies();
    window.CombatSystem.renderScoreboard();

    // Change fight button to work with multiplayer
    document.getElementById('fight').onclick = function() {
      if (G.combatState !== 'idle') return;
      window.CombatSystem.syncHumanToGameState();
      window.CombatSystem.runMultiplayerCombat();
    };

    // Show initial banner
    G.roundBanner = {
      text: 'ROUND 1',
      subtext: '8 players - Round Robin!',
      color: '#ffd700',
      startTime: Date.now(),
      duration: 2500
    };

    requestAnimationFrame(window.CombatSystem.animationLoop);
  }

  // ========== AUTO-DETECT WEBSOCKET URL ==========
  function autoDetectWebSocketUrl() {
    const input = document.getElementById('server-url');
    if (!input.value) {
      const loc = window.location;
      if (loc.hostname === '' || loc.hostname === 'localhost' || loc.protocol === 'file:') {
        input.value = 'ws://localhost:3001';
      } else {
        // Try to detect if we should use a separate WebSocket port
        // Option 1: Same host with wss:// (Passenger with WebSocket support)
        // Option 2: Separate port wss://host:3002 (standalone WS server)
        const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';

        // Check if there's a config in localStorage
        const savedWsUrl = localStorage.getItem('fffa_ws_url');
        if (savedWsUrl) {
          input.value = savedWsUrl;
          console.log('[WS] Using saved WebSocket URL:', input.value);
        } else {
          // Default: try same host first
          input.value = wsProto + '//' + loc.host;
          console.log('[WS] Auto-detected server URL:', input.value);
        }
      }
    }
  }

  // ========== LOBBY/QUEUE HELPERS ==========
  function getServerUrl() {
    return document.getElementById('server-url').value;
  }

  function showLobbyScreen(mode) {
    window.NetworkManager.lobbyMode = mode;
    document.getElementById('mode-select').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('lobby-form').style.display = 'block';
    document.getElementById('lobby-info').style.display = 'none';
    document.getElementById('queue-info').style.display = 'none';
    // Show/hide lobby code for party-queue mode (they need it to invite friends)
    document.getElementById('lobby-code-section').style.display = '';
  }

  function resetLobbyScreen() {
    if (window.NetworkManager.inQueue) {
      window.NetworkManager.send({ type: 'queue_leave' });
      window.NetworkManager.inQueue = false;
    }
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('lobby-info').style.display = 'none';
    document.getElementById('queue-info').style.display = 'none';
    document.getElementById('lobby-form').style.display = 'block';
    document.getElementById('mode-select').style.display = '';
    window.NetworkManager.lobbyMode = null;
    if (window.NetworkManager.ws) {
      window.NetworkManager.ws.close();
      window.NetworkManager.ws = null;
    }
  }

  function connectAndQueue(name) {
    const serverUrl = getServerUrl();
    window.NetworkManager.inQueue = true;
    window.NetworkManager.setStatus('Connecting to matchmaking...');

    try {
      window.NetworkManager.ws = new WebSocket(serverUrl);
    } catch (e) {
      window.NetworkManager.setStatus('Connection failed: ' + e.message);
      window.NetworkManager.inQueue = false;
      return;
    }

    window.NetworkManager.ws.onopen = () => {
      window.NetworkManager.setStatus('In queue...');
      window.NetworkManager.send({ type: 'queue_join', name: name });
      document.getElementById('lobby-form').style.display = 'none';
      document.getElementById('queue-info').style.display = 'block';
    };

    window.NetworkManager.ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      window.NetworkManager.onMessage(msg);
    };

    window.NetworkManager.ws.onclose = () => {
      if (window.NetworkManager.inQueue) {
        window.NetworkManager.setStatus('Disconnected from queue.');
        window.NetworkManager.inQueue = false;
        document.getElementById('queue-info').style.display = 'none';
      }
    };

    window.NetworkManager.ws.onerror = () => {
      window.NetworkManager.setStatus('Connection error');
    };
  }

  // ========== BUTTON HANDLER SETUP ==========
  function setupButtonHandlers() {
    // Find Match -- solo queue
    document.getElementById('btn-find-match').onclick = () => {
      document.getElementById('mode-select').style.display = 'none';
      document.getElementById('lobby-screen').style.display = 'flex';
      document.getElementById('lobby-form').style.display = 'block';
      document.getElementById('lobby-info').style.display = 'none';
      document.getElementById('queue-info').style.display = 'none';
      // Only show name input, hide lobby code
      document.getElementById('lobby-code-section').style.display = 'none';
      window.NetworkManager.lobbyMode = 'find-match';
      // Replace the join button with a queue-specific one
      document.getElementById('btn-join-lobby').textContent = 'Enter Queue';
      document.getElementById('btn-join-lobby').style.background = '#FF9800';
    };

    // Private Lobby -- create/join lobby, fill with bots
    document.getElementById('btn-private-lobby').onclick = () => {
      showLobbyScreen('private');
      document.getElementById('btn-join-lobby').textContent = 'Join / Create Lobby';
      document.getElementById('btn-join-lobby').style.background = '#4CAF50';
    };

    // Party Queue -- create lobby, group up, then queue together
    document.getElementById('btn-party-queue').onclick = () => {
      showLobbyScreen('party-queue');
      document.getElementById('btn-join-lobby').textContent = 'Join / Create Party';
      document.getElementById('btn-join-lobby').style.background = '#9C27B0';
    };

    // Solo Practice -- offline mode, no server needed
    document.getElementById('btn-solo-practice').onclick = () => {
      console.log('[Solo Practice] Starting offline mode');
      document.getElementById('mode-select').style.display = 'none';
      window.GameState.mode = 'single';

      // Initialize game state
      G.gold = 10;
      G.health = 100;
      G.playerLevel = 1;
      G.currentRound = 1;
      G.playerBoard = {};
      G.bench = Array(9).fill(null);
      G.shopUnits = Array(5).fill().map(() => G.rollShopUnit());

      // Render initial state
      window.RenderSystem.renderShop();
      window.RenderSystem.renderBoard();
      window.RenderSystem.renderBench();
      window.InputSystem.setupBenchEvents();
      window.SynergySystem.renderSynergies();
      window.RenderSystem.updateUI();

      // Fight button for solo/single mode
      document.getElementById('fight').onclick = function() {
        if (G.combatState !== 'idle') return;
        window.CombatSystem.startCombat();
      };

      // Start the animation loop (renders board, particles, banners)
      requestAnimationFrame(window.CombatSystem.animationLoop);

      // Show round banner
      G.roundBanner = {
        text: 'SOLO PRACTICE',
        subtext: 'Build your team and test strategies!',
        color: '#4CAF50',
        startTime: Date.now(),
        duration: 2500
      };

      console.log('[Solo Practice] Game initialized - place units and click FIGHT!');
    };

    // Join/Create Lobby button (shared by all modes)
    document.getElementById('btn-join-lobby').onclick = () => {
      const name = document.getElementById('player-name').value || 'Player';

      if (window.NetworkManager.lobbyMode === 'find-match') {
        // Solo queue -- just connect and queue
        connectAndQueue(name);
        return;
      }

      // Private or Party-Queue -- connect to lobby
      const serverUrl = getServerUrl();
      const lobbyCode = document.getElementById('lobby-code').value.toUpperCase() || null;
      window.NetworkManager.setStatus('Connecting...');
      window.NetworkManager.connect(serverUrl, name, lobbyCode, false);
    };

    // Start Game (Private Lobby only -- fills with bots)
    document.getElementById('btn-start-game').onclick = () => {
      window.NetworkManager.send({ type: 'ready' });
      window.NetworkManager.setStatus('Starting game...');
    };

    // Queue as Party button (Party Queue mode)
    document.getElementById('btn-queue-party').onclick = () => {
      window.NetworkManager.inQueue = true;
      window.NetworkManager.send({ type: 'party_queue', lobbyId: window.NetworkManager.lobbyId });
      window.NetworkManager.setStatus('Queuing as party...');
      document.getElementById('lobby-info').style.display = 'none';
      document.getElementById('queue-info').style.display = 'block';
    };

    // Back button
    document.getElementById('btn-lobby-back').onclick = () => {
      resetLobbyScreen();
    };

    // Cancel queue
    document.getElementById('btn-cancel-queue').onclick = () => {
      if (window.NetworkManager.inQueue) {
        window.NetworkManager.send({ type: 'queue_leave' });
        window.NetworkManager.inQueue = false;
      }
      document.getElementById('queue-info').style.display = 'none';
      // If we came from party-queue, show lobby info again
      if (window.NetworkManager.lobbyMode === 'party-queue' && window.NetworkManager.lobbyId) {
        document.getElementById('lobby-info').style.display = 'block';
        window.NetworkManager.setStatus('Returned to lobby');
      } else {
        resetLobbyScreen();
      }
    };

    // Copy share link to clipboard
    document.getElementById('lobby-share-link').onclick = () => {
      const url = document.getElementById('lobby-share-url').textContent;
      navigator.clipboard.writeText(url).then(() => {
        const el = document.getElementById('lobby-share-link');
        el.style.borderColor = '#4CAF50';
        const hint = el.querySelector('span:last-child');
        hint.textContent = 'Copied!';
        setTimeout(() => { el.style.borderColor = '#555'; hint.textContent = 'Click to copy'; }, 2000);
      });
    };
  }

  // ========== AUTO-JOIN FROM URL PARAMETER ==========
  function checkAutoJoin() {
    const params = new URLSearchParams(window.location.search);
    const lobbyParam = params.get('lobby');
    if (lobbyParam) {
      document.getElementById('lobby-code').value = lobbyParam.toUpperCase();
      showLobbyScreen('private');
      document.getElementById('btn-join-lobby').textContent = 'Join / Create Lobby';
      document.getElementById('btn-join-lobby').style.background = '#4CAF50';
    }
  }

  // ========== RECONNECT DATA CHECK ==========
  function checkReconnect() {
    try {
      const saved = JSON.parse(sessionStorage.getItem('fffa_auth'));
      if (saved && saved.lobbyId && saved.authToken) {
        // Could auto-reconnect here -- for now just clear
      }
    } catch (e) {}
  }

  // ========== SPRITE DEBUG STATUS ==========
  function setupSpriteDebug() {
    setTimeout(() => {
      const total = G.unitAnimConfig ? Object.keys(G.unitAnimConfig.units).length : 0;
      const loaded = Object.keys(G.spriteSheets).length;
      console.log(`[Sprite Status] Config: ${!!G.unitAnimConfig}, Total units: ${total}, Loaded sheets: ${loaded}`);
      if (loaded === 0 && total > 0) {
        console.error('[Sprite Status] No sprite sheets loaded! Check that sheets/ directory exists on server.');
      }
    }, 5000);
  }

  // ========== INIT LOBBY (ENTRY POINT) ==========
  function initLobby() {
    // 1. Initialize canvas & hex board (must be before any rendering)
    window.HexBoard.initCanvas();

    // 2. Set up all button handlers
    setupButtonHandlers();

    // 3. Set up canvas + global input handlers (drag-drop, reroll, levelup)
    window.InputSystem.initInputHandlers();

    // 4. Auto-detect WebSocket URL
    autoDetectWebSocketUrl();

    // 5. Check for auto-join from URL params
    checkAutoJoin();

    // 6. Check for reconnect data
    checkReconnect();

    // 7. Initialize images (but don't start game until mode selected)
    window.CombatSystem.loadUnitImages();

    // 8. Load per-unit sprite sheets from unit_animations.json
    window.SpriteSystem.loadAnimConfigAndSheets();

    // 9. Debug: log sprite system status after 5 seconds
    setupSpriteDebug();
  }

  // ========== PUBLIC API ==========
  window.LobbySystem = {
    startSinglePlayer,
    startMultiplayer,
    initLobby,
    getServerUrl,
    showLobbyScreen,
    resetLobbyScreen,
    connectAndQueue
  };

  // ========== SELF-EXECUTE ==========
  initLobby();
})();
