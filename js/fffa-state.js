// ============================================================
//  FFFA — Shared Game State
//  Version: 0.3.0.0
//  All modules read/write through window.FFFA (aliased as G)
// ============================================================
(function() {
  'use strict';

  // Status effect constants (from combat system)
  const STATUS = {
    STUN: 'stun',
    SLOW: 'slow',
    POISON: 'poison',
    SILENCE: 'silence',
    SHIELD: 'shield'
  };

  // Player colors for 8-player mode
  const PLAYER_COLORS = [
    '#4CAF50', '#F44336', '#2196F3', '#FF9800',
    '#9C27B0', '#00BCD4', '#FFEB3B', '#E91E63'
  ];

  const PLAYER_NAMES = [
    'You', 'Whiskers', 'Mittens', 'Shadow',
    'Luna', 'Felix', 'Cleo', 'Tiger'
  ];

  // Animation/timing constants
  const SWAP_ANIM_DURATION = 200;
  const ANIM_DURATION = 300;
  const SPRITE_CELL = 64;

  // Board row definitions
  const playerRows = [4, 5, 6, 7];
  const enemyRows = [0, 1, 2, 3];

  window.FFFA = {
    // Version
    VERSION: '0.4.0.0',

    // Constants (read-only by convention)
    STATUS,
    PLAYER_COLORS,
    PLAYER_NAMES,
    SWAP_ANIM_DURATION,
    ANIM_DURATION,
    SPRITE_CELL,
    playerRows,
    enemyRows,

    // Player state
    gold: 50,
    health: 100,
    playerLevel: 1,
    currentRound: 1,
    shopUnits: [],
    playerBoard: {},
    enemyBoard: {},
    bench: Array(9).fill(null),
    preCombatBoard: {},

    // UI/Interaction state
    highlightHex: null,
    draggedUnit: null,
    swapTargetInfo: null,
    roundBanner: null,
    hoveredBoardUnit: null,

    // Animation state
    swapAnimations: [],
    animationFrame: 0,
    unitAnimations: {},
    visualEffects: [],
    particles: [],

    // Combat state
    combatState: 'idle',
    combatUnits: [],
    combatLog: [],
    lastCombatTime: 0,
    combatStartTime: 0,
    activeCombatSynergies: {},
    _combatTickCount: 0,

    // Canvas/Board (set during init)
    canvas: null,
    ctx: null,
    hexSize: 48,
    origin: { x: 0, y: 0 },
    boardHexes: [],
    backgroundTime: 0,

    // Assets
    unitImages: {},
    spriteSheets: {},
    unitSpriteStates: {},
    unitAnimConfig: (typeof UNIT_ANIM_CONFIG !== 'undefined') ? UNIT_ANIM_CONFIG : null,
    soundEnabled: true,

    // Client-only shop roll using legacy global playerLevel
    rollShopUnit() {
      return rollShopUnitForLevel(this.playerLevel);
    }
  };
})();
