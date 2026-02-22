// ============================================================
//  FFFA — Hex Board: Canvas, hex math, and drawing primitives
//  Extracted from index.html (lines 2963-3342)
//  Version: 0.3.1.0
//  All state lives on window.FFFA (aliased as G)
// ============================================================
(function () {
  'use strict';

  const G = window.FFFA;

  // ── Canvas + resize ──────────────────────────────────────────

  function resizeCanvas() {
    var canvas = G.canvas;
    var hexSize = G.hexSize;
    var origin = G.origin;

    const s3 = Math.sqrt(3);
    const boardArea = document.getElementById('board-area');
    const isMobile = window.innerWidth <= 768;

    // Measure available space from board-area container
    const availW = boardArea ? boardArea.clientWidth - 60 : 600; // padding for frame + overlays
    const availH = boardArea ? boardArea.clientHeight - 40 : 500;

    // Calculate max hexSize that fits:
    // gridW = 7.5 * hexSize * sqrt(3) + hexSize = hexSize * (7.5*sqrt3 + 1)
    // gridH = 7 * 1.5 * hexSize + 2 * hexSize = 12.5 * hexSize
    const maxHexByWidth = availW / (7.5 * s3 + 1);
    const maxHexByHeight = availH / 12.5;

    hexSize = Math.floor(Math.min(maxHexByWidth, maxHexByHeight));
    hexSize = Math.max(28, Math.min(72, hexSize)); // Clamp min 28, max 72
    G.hexSize = hexSize;

    const h = hexSize * s3;
    const gridPixelWidth = 7.5 * h + hexSize;
    const gridPixelHeight = 7 * 1.5 * hexSize + 2 * hexSize;

    const sideMargin = isMobile ? 6 : 20;
    const topMargin = isMobile ? 10 : 20;
    const bottomMargin = isMobile ? 10 : 15;

    canvas.width = Math.ceil(gridPixelWidth + sideMargin * 2);
    canvas.height = Math.ceil(gridPixelHeight + topMargin + bottomMargin);

    origin.x = sideMargin + 2 * h;
    origin.y = topMargin + hexSize;
  }

  // ── Arena background ─────────────────────────────────────────

  function drawBackground() {
    var canvas = G.canvas;
    var ctx = G.ctx;
    var hexSize = G.hexSize;
    var origin = G.origin;

    G.backgroundTime += 0.005;
    var backgroundTime = G.backgroundTime;

    // Dark arena floor gradient
    const floorGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    floorGrad.addColorStop(0, '#0c1624');
    floorGrad.addColorStop(0.3, '#101e30');
    floorGrad.addColorStop(0.5, '#142636');
    floorGrad.addColorStop(0.7, '#101e30');
    floorGrad.addColorStop(1, '#080e18');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle grid pattern for arena floor feel
    ctx.globalAlpha = 0.025;
    ctx.strokeStyle = '#4a6a8a';
    ctx.lineWidth = 1;
    const spacing = hexSize * 0.6;
    for (let x = 0; x < canvas.width; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Center spotlight glow
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, canvas.height * 0.6);
    glowGrad.addColorStop(0, 'rgba(40,65,110,0.12)');
    glowGrad.addColorStop(0.5, 'rgba(20,35,60,0.06)');
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle animated shimmer
    const shimmerX = cx + Math.sin(backgroundTime * 2) * canvas.width * 0.15;
    const shimmerY = cy + Math.cos(backgroundTime * 1.5) * canvas.height * 0.1;
    const shimmerGrad = ctx.createRadialGradient(shimmerX, shimmerY, 0, shimmerX, shimmerY, canvas.height * 0.35);
    shimmerGrad.addColorStop(0, 'rgba(60,80,120,0.04)');
    shimmerGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shimmerGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Divider line between player and enemy halves
    const dividerY = origin.y + hexSize * 1.5 * 3.5;
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(40, dividerY); ctx.lineTo(canvas.width - 40, dividerY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Vignette
    const vigGrad = ctx.createRadialGradient(cx, cy, canvas.height * 0.3, cx, cy, canvas.height * 0.8);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ── Color helper ─────────────────────────────────────────────

  function shadeColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const Gn = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return `rgb(${R},${Gn},${B})`;
  }

  // ── Hex math ─────────────────────────────────────────────────

  function getHexKey(hex) {
    return `${hex.col},${hex.row}`;
  }

  function hexToPixel(hex) {
    var hexSize = G.hexSize;
    var origin = G.origin;
    const x = hexSize * Math.sqrt(3) * (hex.col + 0.5 * (hex.row & 1));
    const y = hexSize * (3 / 2) * hex.row;
    return { x: origin.x + x - 3 * hexSize * Math.sqrt(3) / 2, y: origin.y + y };
  }

  function pixelToHex(px, py) {
    var hexSize = G.hexSize;
    var origin = G.origin;
    const x = (px - origin.x + 3 * hexSize * Math.sqrt(3) / 2) / (hexSize * Math.sqrt(3));
    const y = (py - origin.y) / (hexSize * 3 / 2);
    const row = Math.round(y);
    const col = Math.round(x - 0.5 * (row & 1));
    return { col, row };
  }

  function getNearestHex(raw) {
    const col = Math.round(raw.col);
    const row = Math.round(raw.row);
    return G.boardHexes.find(function (h) { return h.col === col && h.row === row; }) || null;
  }

  // ── Hex drawing ──────────────────────────────────────────────

  function drawHexWithShadow(cx, cy, fill, stroke, isTeamBorder) {
    if (stroke === undefined) stroke = '#555';
    if (isTeamBorder === undefined) isTeamBorder = false;

    var ctx = G.ctx;
    var hexSize = G.hexSize;

    // Build hex path
    const path = new Path2D();
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i - Math.PI / 2;
      const x = cx + hexSize * Math.cos(ang);
      const y = cy + hexSize * Math.sin(ang);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();

    // Semi-transparent fill (15% opacity tint)
    const isDark = (fill === '#1e2a38' || fill === '#2e1a1a');
    if (isDark) {
      // Empty hex: very subtle tint
      ctx.fillStyle = fill === '#1e2a38'
        ? 'rgba(25,45,75,0.25)'   // Player side: blue tint
        : 'rgba(55,25,25,0.25)';  // Enemy side: red tint
    } else {
      // Occupied hex: faction color with low opacity
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = fill;
      ctx.fill(path);
      ctx.globalAlpha = 1;
      // Add subtle inner gradient
      const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, hexSize);
      innerGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
      innerGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
      ctx.fillStyle = innerGrad;
    }
    ctx.fill(path);

    // Glowing outline
    ctx.save();
    if (isTeamBorder) {
      ctx.shadowColor = stroke;
      ctx.shadowBlur = 10;
    } else {
      ctx.shadowColor = isDark
        ? (fill === '#1e2a38' ? 'rgba(50,80,140,0.3)' : 'rgba(140,50,50,0.3)')
        : 'rgba(60,80,120,0.3)';
      ctx.shadowBlur = 5;
    }
    ctx.strokeStyle = isDark
      ? (fill === '#1e2a38' ? 'rgba(60,100,170,0.4)' : 'rgba(170,60,60,0.4)')
      : stroke;
    ctx.lineWidth = isTeamBorder ? 2.5 : 1.2;
    ctx.lineJoin = 'round';
    ctx.stroke(path);
    ctx.restore();
  }

  // ── Unit rendering (sprite first, fallback to emoji/image) ──

  function drawUnitWithShadow(cx, cy, unit, stars, combatUnitRef, unitId) {
    if (stars === undefined) stars = 1;
    if (combatUnitRef === undefined) combatUnitRef = null;
    if (unitId === undefined) unitId = null;

    var ctx = G.ctx;
    var hexSize = G.hexSize;
    var unitImages = G.unitImages;
    var unitAnimations = G.unitAnimations;
    var animationFrame = G.animationFrame;
    var ANIM_DURATION = G.ANIM_DURATION;

    // Try to draw using sprite system first (cross-module lazy call)
    if (window.SpriteSystem && window.SpriteSystem.drawUnitSprite(ctx, cx, cy, unit, stars, combatUnitRef, unitId)) {
      return; // Successfully drew sprite
    }

    // === FALLBACK: Original emoji/image rendering ===

    // Draw shadow
    ctx.beginPath();
    ctx.arc(cx + 3, cy + 3, hexSize * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fill();

    // Star-based glow colors
    const glowColors = {
      1: unit.color,
      2: '#4af',
      3: '#f4a'
    };

    // Draw unit with 3D effect using PNG assets
    // Create a mapping from unit identifiers to image file names
    const unitImageMap = {
      'alley_tabby_thug': 'alley_tabby_thug.png',
      'alley_ginger_rogue': 'alley_ginger_rogue.png',
      'alley_tuxedo_con': 'alley_tuxedo_con.png',
      'alley_street_yowler': 'alley_street_yowler.png',
      'alley_dumpster_king': 'alley_dumpster_king.png',
      'alley_feral_boss': 'alley_feral_boss.png',
      'persian_princess': 'persian_princess.png',
      'persian_pampered': 'persian_pampered.png',
      'persian_groomer': 'persian_groomer.png',
      'persian_snob': 'persian_snob.png',
      'persian_himalayan': 'persian_himalayan.png',
      'persian_emperor': 'persian_emperor.png',
      'siamese_screamer': 'siamese_screamer.png',
      'siamese_chatterbox': 'siamese_chatterbox.png',
      'siamese_soprano': 'siamese_soprano.png',
      'siamese_gossip': 'siamese_gossip.png',
      'siamese_opera': 'siamese_opera.png',
      'siamese_conductor': 'siamese_conductor.png',
      'mainecoon_titan': 'mainecoon_titan.png',
      'mainecoon_cub': 'mainecoon_cub.png',
      'mainecoon_guardian': 'mainecoon_guardian.png',
      'mainecoon_brawler': 'mainecoon_brawler.png',
      'mainecoon_elder': 'mainecoon_elder.png',
      'mainecoon_alpha': 'mainecoon_alpha.png',
      'bengal_stalker': 'bengal_stalker.png',
      'bengal_kitten': 'bengal_kitten.png',
      'bengal_hunter': 'bengal_hunter.png',
      'bengal_assassin': 'bengal_assassin.png',
      'bengal_pack_leader': 'bengal_pack_leader.png',
      'bengal_apex': 'bengal_apex.png',
      'sphynx_menace': 'sphynx_menace.png',
      'sphynx_creeper': 'sphynx_creeper.png',
      'sphynx_warmer': 'sphynx_warmer.png',
      'sphynx_cultist': 'sphynx_cultist.png',
      'sphynx_oracle': 'sphynx_oracle.png',
      'sphynx_overlord': 'sphynx_overlord.png',
      'scottish_gambler': 'scottish_gambler.png',
      'scottish_lucky': 'scottish_lucky.png',
      'scottish_dealer': 'scottish_dealer.png',
      'scottish_bettor': 'scottish_bettor.png',
      'scottish_fortune': 'scottish_fortune.png',
      'scottish_jackpot': 'scottish_jackpot.png',
      'ragdoll_faker': 'ragdoll_faker.png',
      'ragdoll_lazy': 'ragdoll_lazy.png',
      'ragdoll_flopper': 'ragdoll_flopper.png',
      'ragdoll_dreamer': 'ragdoll_dreamer.png',
      'ragdoll_therapist': 'ragdoll_therapist.png',
      'ragdoll_zen': 'ragdoll_zen.png'
    };

    // Get unit key for animation lookup
    const unitKey = unitId || unit.name.toLowerCase().replace(/\s+/g, '_');

    // IDLE SWAY (subtle bob for all units)
    const swayOffset = Math.sin(animationFrame * 0.1 + parseInt(unitKey)) * 2;
    const swayX = cx + swayOffset;
    const swayY = cy + Math.abs(Math.cos(animationFrame * 0.08)) * 1;

    // ATTACK PULSE / ABILITY GLOW
    let pulseScale = 1;
    let glowColor = unit.color;
    if (unitAnimations[unitKey]) {
      const anim = unitAnimations[unitKey];
      const progress = (Date.now() - anim.startTime) / ANIM_DURATION;
      if (progress < 1) {
        pulseScale = 1 + Math.sin(progress * Math.PI) * 0.3;  // Scale pop
        glowColor = 'hsl(' + (parseInt(unit.color.slice(1, 7), 16) % 360) + ', 100%, 60%)';  // Brighten
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 20 * (1 - progress);
      } else {
        delete unitAnimations[unitKey];  // End anim
      }
    }

    // Draw unit image if available
    if (unitImageMap[unitKey] && unitImages[unitKey]) {
      const img = unitImages[unitKey];
      // Draw image with proper scaling and animation
      ctx.save();
      ctx.translate(swayX, swayY);
      ctx.scale(pulseScale, pulseScale);
      ctx.drawImage(img, cx - hexSize * 0.35, cy - hexSize * 0.35, hexSize * 0.7, hexSize * 0.7);
      ctx.restore();
    } else {
      // Fallback to emoji if image not found
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(unit.icon, cx, cy);
    }

    // Add glow effect based on star level
    ctx.shadowColor = glowColors[stars] || unit.color;
    ctx.shadowBlur = stars === 1 ? 15 : stars === 2 ? 25 : 35;

    if (unitImageMap[unitKey] && unitImages[unitKey]) {
      // Redraw image with glow effect and animation
      ctx.save();
      ctx.translate(swayX, swayY);
      ctx.scale(pulseScale, pulseScale);
      var scale = hexSize * 0.7 / 64;
      ctx.drawImage(unitImages[unitKey], cx - hexSize * 0.35, cy - hexSize * 0.35, hexSize * 0.7, hexSize * 0.7);
      ctx.restore();
    } else {
      // Fallback to emoji with glow
      ctx.fillText(unit.icon, cx, cy);
    }
    ctx.shadowBlur = 0;

    // Draw unit border for 3D effect (color based on stars)
    const borderColors = {
      1: 'rgba(255, 255, 255, 0.7)',
      2: 'rgba(68, 170, 255, 0.9)',
      3: 'rgba(255, 68, 170, 0.9)'
    };
    ctx.strokeStyle = borderColors[stars];
    ctx.lineWidth = stars === 1 ? 2 : stars === 2 ? 3 : 4;
    ctx.beginPath();
    ctx.arc(cx, cy, hexSize * 0.4, 0, Math.PI * 2);
    ctx.stroke();

    // Draw star indicators below unit
    ctx.font = '10px Arial';
    ctx.fillStyle = stars === 1 ? '#ffd700' : stars === 2 ? '#4af' : '#f4a';
    ctx.fillText('\u2B50'.repeat(stars), cx, cy + 28);

    // Draw faction label
    ctx.font = '10px Arial';
    ctx.fillStyle = '#aaa';
    ctx.fillText(unit.faction, cx, cy + 40);
  }

  // ── Simple hex (non-shadowed) ────────────────────────────────

  function drawHex(cx, cy, fill, stroke) {
    if (stroke === undefined) stroke = '#555';

    var ctx = G.ctx;
    var hexSize = G.hexSize;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i - Math.PI / 2;
      const x = cx + hexSize * Math.cos(ang);
      const y = cy + hexSize * Math.sin(ang);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // ── Canvas initialization ────────────────────────────────────

  function initCanvas() {
    // 1. Get canvas element and 2d context
    var canvas = document.getElementById('board');
    var ctx = canvas.getContext('2d');

    // 2. Store on G
    G.canvas = canvas;
    G.ctx = ctx;

    // 3. Build boardHexes on G (8 rows x 7 cols)
    var hexes = [];
    for (var row = 0; row < 8; row++) {
      for (var col = 0; col < 7; col++) {
        hexes.push({ col: col, row: row });
      }
    }
    G.boardHexes = hexes;

    // 4. Initial resize
    resizeCanvas();

    // 5. Resize listener
    window.addEventListener('resize', function () {
      resizeCanvas();
    });
  }

  // ── Public API ───────────────────────────────────────────────

  window.HexBoard = {
    initCanvas: initCanvas,
    resizeCanvas: resizeCanvas,
    drawBackground: drawBackground,
    shadeColor: shadeColor,
    getHexKey: getHexKey,
    hexToPixel: hexToPixel,
    pixelToHex: pixelToHex,
    getNearestHex: getNearestHex,
    drawHexWithShadow: drawHexWithShadow,
    drawUnitWithShadow: drawUnitWithShadow,
    drawHex: drawHex
  };

})();
