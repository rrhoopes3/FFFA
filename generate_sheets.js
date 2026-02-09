// ============================================================
//  FFFA — Sprite Sheet Generator
//  Creates placeholder sprite sheet PNGs for the first 5 units.
//  Run: node generate_sheets.js
//  Requires: npm install canvas
// ============================================================

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// Load animation config
const animConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'unit_animations.json'), 'utf-8'));
const CELL_W = animConfig.meta.cellWidth;   // 64
const CELL_H = animConfig.meta.cellHeight;  // 64
const COLS   = animConfig.meta.columns;     // 6

// Generate ALL units from the config
const UNITS_TO_GENERATE = Object.keys(animConfig.units);

// ── Unit visual profiles ──────────────────────────────────────
const unitProfiles = {
  alley_tabby_thug: {
    bodyColor: '#8899AA',
    darkColor: '#556677',
    lightColor: '#AABBCC',
    eyeColor: '#44CC44',
    accentColor: '#8899AA',
    bodyScale: 1.15,       // Tank = stocky/wide
    headScale: 0.95,
    earStyle: 'pointed',
    tailThickness: 4,
    stripes: true,
    accessories: []
  },
  alley_dumpster_king: {
    bodyColor: '#5D4E37',
    darkColor: '#3D3027',
    lightColor: '#8D7E67',
    eyeColor: '#FFDD00',
    accentColor: '#FFD700',
    bodyScale: 1.3,        // Boss = biggest
    headScale: 1.1,
    earStyle: 'torn',
    tailThickness: 5,
    stripes: false,
    accessories: ['crown']
  },
  alley_feral_boss: {
    bodyColor: '#CC4400',
    darkColor: '#882200',
    lightColor: '#FF6633',
    eyeColor: '#FF0000',
    accentColor: '#FF4400',
    bodyScale: 1.2,        // Berserker = big + wild
    headScale: 1.05,
    earStyle: 'ragged',
    tailThickness: 5,
    stripes: false,
    accessories: ['scars']
  },
  alley_ginger_rogue: {
    bodyColor: '#E88833',
    darkColor: '#BB6611',
    lightColor: '#FFAA55',
    eyeColor: '#33FF88',
    accentColor: '#FF9944',
    bodyScale: 0.85,       // Rogue = sleek/small
    headScale: 0.9,
    earStyle: 'tall',
    tailThickness: 3,
    stripes: true,
    accessories: ['mask']
  },
  alley_street_yowler: {
    bodyColor: '#CCAA44',
    darkColor: '#AA8822',
    lightColor: '#EECC66',
    eyeColor: '#FF8800',
    accentColor: '#DDBB55',
    bodyScale: 1.05,       // Brawler = medium+
    headScale: 1.0,
    earStyle: 'folded',
    tailThickness: 4,
    stripes: false,
    accessories: ['bandana']
  },

  // ── ALLEY: Tuxedo Con (Support) ──
  alley_tuxedo_con: {
    bodyColor: '#222222',
    darkColor: '#111111',
    lightColor: '#FFFFFF',
    eyeColor: '#33CCFF',
    accentColor: '#FFFFFF',
    bodyScale: 0.95,
    headScale: 0.95,
    earStyle: 'pointed',
    tailThickness: 3,
    stripes: false,
    accessories: ['bowtie']
  },

  // ══════════════════════════════════════
  //  PERSIAN FACTION — fluffy, elegant
  // ══════════════════════════════════════
  persian_pampered: {
    bodyColor: '#F0E0D0',
    darkColor: '#C8B8A8',
    lightColor: '#FFF8F0',
    eyeColor: '#4488FF',
    accentColor: '#FFD0E0',
    bodyScale: 1.0,
    headScale: 1.1,
    earStyle: 'pointed',
    tailThickness: 5,
    stripes: false,
    accessories: ['ribbon']
  },
  persian_princess: {
    bodyColor: '#F8E8FF',
    darkColor: '#D0C0E0',
    lightColor: '#FFFFFF',
    eyeColor: '#CC44FF',
    accentColor: '#FFB0D0',
    bodyScale: 1.05,
    headScale: 1.1,
    earStyle: 'pointed',
    tailThickness: 5,
    stripes: false,
    accessories: ['tiara']
  },
  persian_groomer: {
    bodyColor: '#E8D8C8',
    darkColor: '#C0B0A0',
    lightColor: '#FFF0E8',
    eyeColor: '#44CC88',
    accentColor: '#88DDAA',
    bodyScale: 0.95,
    headScale: 1.0,
    earStyle: 'pointed',
    tailThickness: 4,
    stripes: false,
    accessories: ['brush']
  },
  persian_snob: {
    bodyColor: '#E0D0C0',
    darkColor: '#B8A898',
    lightColor: '#F8F0E8',
    eyeColor: '#8844CC',
    accentColor: '#C0A0D0',
    bodyScale: 1.1,
    headScale: 1.05,
    earStyle: 'pointed',
    tailThickness: 5,
    stripes: false,
    accessories: ['monocle']
  },
  persian_himalayan: {
    bodyColor: '#F0E8E0',
    darkColor: '#8B7355',
    lightColor: '#FFFFF0',
    eyeColor: '#4488FF',
    accentColor: '#B0A090',
    bodyScale: 1.0,
    headScale: 1.05,
    earStyle: 'pointed',
    tailThickness: 5,
    stripes: false,
    accessories: []
  },
  persian_emperor: {
    bodyColor: '#E8D8C0',
    darkColor: '#B0A088',
    lightColor: '#FFF8E8',
    eyeColor: '#FFD700',
    accentColor: '#FFD700',
    bodyScale: 1.3,
    headScale: 1.15,
    earStyle: 'pointed',
    tailThickness: 6,
    stripes: false,
    accessories: ['crown']
  },

  // ══════════════════════════════════════
  //  SIAMESE FACTION — sleek, vocal
  // ══════════════════════════════════════
  siamese_screamer: {
    bodyColor: '#D4B896',
    darkColor: '#5C4033',
    lightColor: '#F0E8D8',
    eyeColor: '#4488FF',
    accentColor: '#5C4033',
    bodyScale: 0.85,
    headScale: 0.95,
    earStyle: 'tall',
    tailThickness: 3,
    stripes: false,
    accessories: []
  },
  siamese_chatterbox: {
    bodyColor: '#D8C0A0',
    darkColor: '#6B5040',
    lightColor: '#F0E0D0',
    eyeColor: '#4488FF',
    accentColor: '#6B5040',
    bodyScale: 0.85,
    headScale: 0.95,
    earStyle: 'tall',
    tailThickness: 3,
    stripes: false,
    accessories: []
  },
  siamese_soprano: {
    bodyColor: '#D0B890',
    darkColor: '#604830',
    lightColor: '#F0E0C8',
    eyeColor: '#4488FF',
    accentColor: '#FF8888',
    bodyScale: 0.9,
    headScale: 1.0,
    earStyle: 'tall',
    tailThickness: 3,
    stripes: false,
    accessories: ['ribbon']
  },
  siamese_gossip: {
    bodyColor: '#D8C4A8',
    darkColor: '#685038',
    lightColor: '#F0E4D0',
    eyeColor: '#4488FF',
    accentColor: '#FF88CC',
    bodyScale: 0.9,
    headScale: 1.0,
    earStyle: 'tall',
    tailThickness: 3,
    stripes: false,
    accessories: []
  },
  siamese_opera: {
    bodyColor: '#CCB088',
    darkColor: '#584028',
    lightColor: '#F0DCC0',
    eyeColor: '#4488FF',
    accentColor: '#FF4444',
    bodyScale: 1.0,
    headScale: 1.05,
    earStyle: 'tall',
    tailThickness: 4,
    stripes: false,
    accessories: ['scarf']
  },
  siamese_conductor: {
    bodyColor: '#C8A880',
    darkColor: '#503820',
    lightColor: '#E8D4B8',
    eyeColor: '#4488FF',
    accentColor: '#FFD700',
    bodyScale: 1.1,
    headScale: 1.05,
    earStyle: 'tall',
    tailThickness: 4,
    stripes: false,
    accessories: ['tophat']
  },

  // ══════════════════════════════════════
  //  MAINECOON FACTION — big, fluffy
  // ══════════════════════════════════════
  mainecoon_cub: {
    bodyColor: '#8B7355',
    darkColor: '#6B5340',
    lightColor: '#B8A080',
    eyeColor: '#44CC44',
    accentColor: '#A08868',
    bodyScale: 0.85,
    headScale: 1.1,
    earStyle: 'pointed',
    tailThickness: 5,
    stripes: true,
    accessories: []
  },
  mainecoon_guardian: {
    bodyColor: '#7B6345',
    darkColor: '#5B4330',
    lightColor: '#A89070',
    eyeColor: '#44CC44',
    accentColor: '#907858',
    bodyScale: 1.2,
    headScale: 1.05,
    earStyle: 'pointed',
    tailThickness: 6,
    stripes: true,
    accessories: []
  },
  mainecoon_titan: {
    bodyColor: '#705838',
    darkColor: '#504028',
    lightColor: '#A08860',
    eyeColor: '#FFCC00',
    accentColor: '#887050',
    bodyScale: 1.35,
    headScale: 1.1,
    earStyle: 'pointed',
    tailThickness: 7,
    stripes: true,
    accessories: []
  },
  mainecoon_brawler: {
    bodyColor: '#886848',
    darkColor: '#684838',
    lightColor: '#B89870',
    eyeColor: '#FF8800',
    accentColor: '#A08060',
    bodyScale: 1.15,
    headScale: 1.0,
    earStyle: 'pointed',
    tailThickness: 5,
    stripes: true,
    accessories: ['bandana']
  },
  mainecoon_elder: {
    bodyColor: '#A09080',
    darkColor: '#807060',
    lightColor: '#C8B8A8',
    eyeColor: '#88CCFF',
    accentColor: '#B0A090',
    bodyScale: 1.1,
    headScale: 1.1,
    earStyle: 'pointed',
    tailThickness: 5,
    stripes: false,
    accessories: []
  },
  mainecoon_alpha: {
    bodyColor: '#685038',
    darkColor: '#483828',
    lightColor: '#987858',
    eyeColor: '#FFD700',
    accentColor: '#786048',
    bodyScale: 1.4,
    headScale: 1.15,
    earStyle: 'pointed',
    tailThickness: 7,
    stripes: true,
    accessories: ['scars']
  },

  // ══════════════════════════════════════
  //  BENGAL FACTION — spotted, agile
  // ══════════════════════════════════════
  bengal_kitten: {
    bodyColor: '#DAA520',
    darkColor: '#8B6914',
    lightColor: '#FFD060',
    eyeColor: '#44FF44',
    accentColor: '#CC9910',
    bodyScale: 0.75,
    headScale: 1.05,
    earStyle: 'tall',
    tailThickness: 3,
    stripes: true,
    accessories: []
  },
  bengal_stalker: {
    bodyColor: '#C89818',
    darkColor: '#806010',
    lightColor: '#F0C040',
    eyeColor: '#44FF44',
    accentColor: '#B08810',
    bodyScale: 0.9,
    headScale: 0.95,
    earStyle: 'tall',
    tailThickness: 3,
    stripes: true,
    accessories: []
  },
  bengal_hunter: {
    bodyColor: '#B88810',
    darkColor: '#705008',
    lightColor: '#E0B830',
    eyeColor: '#44FF44',
    accentColor: '#A07808',
    bodyScale: 1.0,
    headScale: 1.0,
    earStyle: 'tall',
    tailThickness: 4,
    stripes: true,
    accessories: []
  },
  bengal_assassin: {
    bodyColor: '#333333',
    darkColor: '#111111',
    lightColor: '#555555',
    eyeColor: '#FF0000',
    accentColor: '#444444',
    bodyScale: 0.9,
    headScale: 0.9,
    earStyle: 'tall',
    tailThickness: 3,
    stripes: false,
    accessories: ['mask']
  },
  bengal_pack_leader: {
    bodyColor: '#C09010',
    darkColor: '#885808',
    lightColor: '#E8B838',
    eyeColor: '#FFCC00',
    accentColor: '#B08008',
    bodyScale: 1.1,
    headScale: 1.05,
    earStyle: 'tall',
    tailThickness: 4,
    stripes: true,
    accessories: []
  },
  bengal_apex: {
    bodyColor: '#A07808',
    darkColor: '#604800',
    lightColor: '#D0A028',
    eyeColor: '#FF4400',
    accentColor: '#906800',
    bodyScale: 1.3,
    headScale: 1.1,
    earStyle: 'tall',
    tailThickness: 5,
    stripes: true,
    accessories: ['scars']
  },

  // ══════════════════════════════════════
  //  SPHYNX FACTION — hairless, eerie
  // ══════════════════════════════════════
  sphynx_creeper: {
    bodyColor: '#FFB6C1',
    darkColor: '#CC8090',
    lightColor: '#FFD8E0',
    eyeColor: '#FFFF00',
    accentColor: '#FF99AA',
    bodyScale: 0.8,
    headScale: 1.1,
    earStyle: 'tall',
    tailThickness: 2,
    stripes: false,
    accessories: []
  },
  sphynx_warmer: {
    bodyColor: '#FFB0A0',
    darkColor: '#CC8878',
    lightColor: '#FFD0C8',
    eyeColor: '#FF8800',
    accentColor: '#FF9988',
    bodyScale: 0.9,
    headScale: 1.05,
    earStyle: 'tall',
    tailThickness: 2,
    stripes: false,
    accessories: []
  },
  sphynx_menace: {
    bodyColor: '#E0A0A0',
    darkColor: '#B07070',
    lightColor: '#FFC8C8',
    eyeColor: '#FF0000',
    accentColor: '#CC8888',
    bodyScale: 1.05,
    headScale: 1.1,
    earStyle: 'tall',
    tailThickness: 3,
    stripes: false,
    accessories: ['scars']
  },
  sphynx_cultist: {
    bodyColor: '#D8A8C0',
    darkColor: '#A07888',
    lightColor: '#F0C8D8',
    eyeColor: '#AA00FF',
    accentColor: '#8800CC',
    bodyScale: 0.95,
    headScale: 1.1,
    earStyle: 'tall',
    tailThickness: 2,
    stripes: false,
    accessories: []
  },
  sphynx_oracle: {
    bodyColor: '#D0A0B0',
    darkColor: '#A07080',
    lightColor: '#F0C0D0',
    eyeColor: '#00FFFF',
    accentColor: '#00CCCC',
    bodyScale: 0.95,
    headScale: 1.15,
    earStyle: 'tall',
    tailThickness: 2,
    stripes: false,
    accessories: []
  },
  sphynx_overlord: {
    bodyColor: '#C08898',
    darkColor: '#906070',
    lightColor: '#E8B0C0',
    eyeColor: '#FF00FF',
    accentColor: '#CC00CC',
    bodyScale: 1.25,
    headScale: 1.2,
    earStyle: 'tall',
    tailThickness: 3,
    stripes: false,
    accessories: ['crown']
  },

  // ══════════════════════════════════════
  //  SCOTTISH FOLD FACTION — round, lucky
  // ══════════════════════════════════════
  scottish_lucky: {
    bodyColor: '#98D8C8',
    darkColor: '#68A898',
    lightColor: '#B8F0E0',
    eyeColor: '#FFD700',
    accentColor: '#88C8B8',
    bodyScale: 0.9,
    headScale: 1.05,
    earStyle: 'folded',
    tailThickness: 4,
    stripes: false,
    accessories: []
  },
  scottish_gambler: {
    bodyColor: '#88C8B8',
    darkColor: '#5898A8',
    lightColor: '#A8E0D0',
    eyeColor: '#FFD700',
    accentColor: '#78B8A8',
    bodyScale: 1.0,
    headScale: 1.0,
    earStyle: 'folded',
    tailThickness: 4,
    stripes: false,
    accessories: ['tophat']
  },
  scottish_dealer: {
    bodyColor: '#80B8A8',
    darkColor: '#508898',
    lightColor: '#A0D8C8',
    eyeColor: '#44CC44',
    accentColor: '#70A898',
    bodyScale: 0.95,
    headScale: 1.0,
    earStyle: 'folded',
    tailThickness: 3,
    stripes: false,
    accessories: ['bowtie']
  },
  scottish_bettor: {
    bodyColor: '#78B0A0',
    darkColor: '#488088',
    lightColor: '#98D0C0',
    eyeColor: '#FF8800',
    accentColor: '#68A090',
    bodyScale: 1.1,
    headScale: 1.0,
    earStyle: 'folded',
    tailThickness: 4,
    stripes: false,
    accessories: []
  },
  scottish_fortune: {
    bodyColor: '#70A898',
    darkColor: '#407878',
    lightColor: '#90C8B8',
    eyeColor: '#CC44FF',
    accentColor: '#8800CC',
    bodyScale: 0.95,
    headScale: 1.1,
    earStyle: 'folded',
    tailThickness: 3,
    stripes: false,
    accessories: []
  },
  scottish_jackpot: {
    bodyColor: '#60A088',
    darkColor: '#387068',
    lightColor: '#88C8B0',
    eyeColor: '#FFD700',
    accentColor: '#FFD700',
    bodyScale: 1.2,
    headScale: 1.1,
    earStyle: 'folded',
    tailThickness: 5,
    stripes: false,
    accessories: ['crown']
  },

  // ══════════════════════════════════════
  //  RAGDOLL FACTION — floppy, soft
  // ══════════════════════════════════════
  ragdoll_faker: {
    bodyColor: '#93C5FD',
    darkColor: '#6395CD',
    lightColor: '#B3D5FF',
    eyeColor: '#4488FF',
    accentColor: '#83B5ED',
    bodyScale: 1.0,
    headScale: 1.05,
    earStyle: 'pointed',
    tailThickness: 5,
    stripes: false,
    accessories: []
  },
  ragdoll_lazy: {
    bodyColor: '#A0C8F0',
    darkColor: '#7098C0',
    lightColor: '#C0E0FF',
    eyeColor: '#4488FF',
    accentColor: '#90B8E0',
    bodyScale: 1.1,
    headScale: 1.05,
    earStyle: 'pointed',
    tailThickness: 5,
    stripes: false,
    accessories: []
  },
  ragdoll_flopper: {
    bodyColor: '#88B8E8',
    darkColor: '#5888B8',
    lightColor: '#A8D0F8',
    eyeColor: '#4488FF',
    accentColor: '#78A8D8',
    bodyScale: 1.15,
    headScale: 1.1,
    earStyle: 'pointed',
    tailThickness: 6,
    stripes: false,
    accessories: []
  },
  ragdoll_dreamer: {
    bodyColor: '#A8C0E0',
    darkColor: '#7890B0',
    lightColor: '#C8D8F0',
    eyeColor: '#CC88FF',
    accentColor: '#98B0D0',
    bodyScale: 0.95,
    headScale: 1.1,
    earStyle: 'pointed',
    tailThickness: 4,
    stripes: false,
    accessories: []
  },
  ragdoll_therapist: {
    bodyColor: '#98B8D8',
    darkColor: '#6888A8',
    lightColor: '#B8D0E8',
    eyeColor: '#FF88AA',
    accentColor: '#FF88AA',
    bodyScale: 1.0,
    headScale: 1.1,
    earStyle: 'pointed',
    tailThickness: 5,
    stripes: false,
    accessories: ['ribbon']
  },
  ragdoll_zen: {
    bodyColor: '#88A8C8',
    darkColor: '#587898',
    lightColor: '#A8C8E0',
    eyeColor: '#00DDDD',
    accentColor: '#00BBBB',
    bodyScale: 1.2,
    headScale: 1.1,
    earStyle: 'pointed',
    tailThickness: 5,
    stripes: false,
    accessories: []
  }
};


// ── Drawing helpers ───────────────────────────────────────────

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function lighten(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

function darken(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Cat drawing function ──────────────────────────────────────
// Draws a cat at center of a 64x64 cell with given pose parameters

function drawCat(ctx, cx, cy, profile, pose) {
  const {
    bodyColor, darkColor, lightColor, eyeColor, accentColor,
    bodyScale, headScale, earStyle, tailThickness, stripes, accessories
  } = profile;

  const {
    bodyYOffset = 0,
    bodyXOffset = 0,
    bodyRotation = 0,
    bodySquash = 1.0,    // horizontal stretch
    bodyStretch = 1.0,   // vertical stretch
    headTilt = 0,
    headYOffset = 0,
    eyeState = 'open',   // 'open', 'half', 'closed', 'angry'
    mouthState = 'closed', // 'closed', 'open', 'yowl', 'grin'
    legPose = 'stand',   // 'stand', 'walk1', 'walk2', 'crouch', 'jump', 'splat'
    tailCurve = 0,       // -1 to 1 extra curve
    tailRaise = 0,       // extra Y offset for tail start
    pawAction = 'none',  // 'none', 'swipe_r', 'swipe_l', 'block', 'both_up'
    opacity = 1.0,
    flipX = false,
    glowColor = null,
    accessories: poseAccessories = []
  } = pose;

  ctx.save();
  ctx.translate(cx, cy);
  if (flipX) ctx.scale(-1, 1);
  ctx.globalAlpha = opacity;

  // Apply body rotation
  ctx.rotate(bodyRotation);

  // Glow effect
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 8;
  }

  const bs = bodyScale;
  const hs = headScale;

  // ── Shadow on ground ──
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(bodyXOffset, 22 + bodyYOffset, 14 * bs * bodySquash, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Tail ──
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = tailThickness;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const tailStartX = bodyXOffset - 10 * bs;
  const tailStartY = 6 + bodyYOffset + tailRaise;
  const tailMidX = tailStartX - 14 * bs;
  const tailMidY = tailStartY - 12 + tailCurve * 8;
  const tailEndX = tailStartX - 8 * bs;
  const tailEndY = tailStartY - 22 + tailCurve * 5;
  ctx.moveTo(tailStartX, tailStartY);
  ctx.quadraticCurveTo(tailMidX, tailMidY, tailEndX, tailEndY);
  ctx.stroke();

  // ── Legs ──
  drawLegs(ctx, bodyXOffset, bodyYOffset, bs, darkColor, bodyColor, legPose);

  // ── Body ──
  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(bodyXOffset, 4 + bodyYOffset, 14 * bs * bodySquash, 12 * bs * bodyStretch, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Belly highlight
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.ellipse(bodyXOffset + 2, 6 + bodyYOffset, 7 * bs * bodySquash, 8 * bs * bodyStretch, 0, 0, Math.PI * 2);
  ctx.fill();

  // Stripes
  if (stripes) {
    ctx.strokeStyle = darken(bodyColor, 0.25);
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      const sx = bodyXOffset + i * 4 * bs;
      ctx.moveTo(sx, -4 + bodyYOffset);
      ctx.lineTo(sx + 1, 8 + bodyYOffset);
      ctx.stroke();
    }
  }

  // ── Paws (front) ──
  drawPaws(ctx, bodyXOffset, bodyYOffset, bs, bodyColor, darkColor, lightColor, pawAction);

  // ── Head ──
  ctx.save();
  ctx.translate(bodyXOffset + 6 * bs, -12 * bs + headYOffset + bodyYOffset);
  ctx.rotate(headTilt);

  // Head shape
  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 10 * hs, 9 * hs, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Inner ear / head highlight
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.ellipse(1, 1, 6 * hs, 5 * hs, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Ears ──
  drawEars(ctx, hs, earStyle, bodyColor, darkColor, lightColor);

  // ── Eyes ──
  drawEyes(ctx, hs, eyeColor, eyeState);

  // ── Mouth ──
  drawMouth(ctx, hs, mouthState, bodyColor);

  // ── Nose ──
  ctx.fillStyle = '#FF9999';
  ctx.beginPath();
  ctx.ellipse(0, 3 * hs, 2 * hs, 1.5 * hs, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Whiskers ──
  ctx.strokeStyle = '#DDD';
  ctx.lineWidth = 0.5;
  for (let side = -1; side <= 1; side += 2) {
    for (let w = 0; w < 2; w++) {
      ctx.beginPath();
      ctx.moveTo(side * 5 * hs, 2 * hs + w * 2);
      ctx.lineTo(side * 14 * hs, w * 3 - 1);
      ctx.stroke();
    }
  }

  ctx.restore(); // head transform

  // ── Accessories ──
  const allAccessories = [...accessories, ...poseAccessories];
  for (const acc of allAccessories) {
    drawAccessory(ctx, bodyXOffset, bodyYOffset, bs, hs, accentColor, acc, headYOffset);
  }

  ctx.restore(); // main transform
}


function drawLegs(ctx, bx, by, bs, darkColor, bodyColor, legPose) {
  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 1.5;

  // Leg positions: [frontLeft, frontRight, backLeft, backRight]
  // Each: [x, y, height]
  let legs;
  switch (legPose) {
    case 'walk1':
      legs = [
        [bx + 7 * bs, 12 + by, 10],  // front-right forward
        [bx + 3 * bs, 14 + by, 8],   // front-left back
        [bx - 7 * bs, 14 + by, 8],   // back-left forward
        [bx - 10 * bs, 12 + by, 10]  // back-right back
      ];
      break;
    case 'walk2':
      legs = [
        [bx + 7 * bs, 14 + by, 8],
        [bx + 3 * bs, 12 + by, 10],
        [bx - 7 * bs, 12 + by, 10],
        [bx - 10 * bs, 14 + by, 8]
      ];
      break;
    case 'crouch':
      legs = [
        [bx + 6 * bs, 14 + by, 6],
        [bx + 2 * bs, 14 + by, 6],
        [bx - 6 * bs, 14 + by, 6],
        [bx - 10 * bs, 14 + by, 6]
      ];
      break;
    case 'jump':
      legs = [
        [bx + 8 * bs, 8 + by, 12],
        [bx + 4 * bs, 10 + by, 10],
        [bx - 6 * bs, 10 + by, 10],
        [bx - 10 * bs, 8 + by, 12]
      ];
      break;
    case 'splat':
      legs = [
        [bx + 12 * bs, 18 + by, 3],
        [bx + 4 * bs, 19 + by, 2],
        [bx - 6 * bs, 19 + by, 2],
        [bx - 14 * bs, 18 + by, 3]
      ];
      break;
    default: // 'stand'
      legs = [
        [bx + 6 * bs, 13 + by, 9],
        [bx + 2 * bs, 13 + by, 9],
        [bx - 6 * bs, 13 + by, 9],
        [bx - 10 * bs, 13 + by, 9]
      ];
  }

  for (const [lx, ly, lh] of legs) {
    // Leg
    ctx.fillStyle = bodyColor;
    ctx.fillRect(lx - 2, ly, 4, lh);
    ctx.strokeRect(lx - 2, ly, 4, lh);
    // Paw
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.ellipse(lx, ly + lh, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPaws(ctx, bx, by, bs, bodyColor, darkColor, lightColor, pawAction) {
  if (pawAction === 'none') return;

  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 1.5;

  switch (pawAction) {
    case 'swipe_r':
      // Right paw extended forward
      ctx.beginPath();
      ctx.ellipse(bx + 18 * bs, -4 + by, 5, 4, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Claw marks
      ctx.strokeStyle = '#FFF';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(bx + 22 * bs + i * 2, -8 + by);
        ctx.lineTo(bx + 24 * bs + i * 2, -2 + by);
        ctx.stroke();
      }
      break;
    case 'swipe_l':
      ctx.beginPath();
      ctx.ellipse(bx - 18 * bs, -4 + by, 5, 4, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'block':
      // Both paws up in front
      for (let side = -1; side <= 1; side += 2) {
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(bx + 14 * bs, -6 + by + side * 5, 5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    case 'both_up':
      for (let side = -1; side <= 1; side += 2) {
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(bx + side * 10 * bs, -14 + by, 4, 5, side * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
  }
}

function drawEars(ctx, hs, earStyle, bodyColor, darkColor, lightColor) {
  const earSize = 7 * hs;

  for (let side = -1; side <= 1; side += 2) {
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    switch (earStyle) {
      case 'torn':
        // Ragged torn ears
        ctx.moveTo(side * 5 * hs, -6 * hs);
        ctx.lineTo(side * 8 * hs, -15 * hs);
        ctx.lineTo(side * 6 * hs, -12 * hs);
        ctx.lineTo(side * 10 * hs, -13 * hs);
        ctx.lineTo(side * 4 * hs, -7 * hs);
        break;
      case 'ragged':
        ctx.moveTo(side * 5 * hs, -6 * hs);
        ctx.lineTo(side * 7 * hs, -16 * hs);
        ctx.lineTo(side * 9 * hs, -14 * hs);
        ctx.lineTo(side * 3 * hs, -7 * hs);
        break;
      case 'tall':
        ctx.moveTo(side * 4 * hs, -7 * hs);
        ctx.lineTo(side * 6 * hs, -18 * hs);
        ctx.lineTo(side * 2 * hs, -8 * hs);
        break;
      case 'folded':
        ctx.moveTo(side * 5 * hs, -6 * hs);
        ctx.lineTo(side * 8 * hs, -12 * hs);
        ctx.lineTo(side * 6 * hs, -10 * hs);
        ctx.lineTo(side * 3 * hs, -7 * hs);
        break;
      default: // 'pointed'
        ctx.moveTo(side * 4 * hs, -6 * hs);
        ctx.lineTo(side * 7 * hs, -16 * hs);
        ctx.lineTo(side * 2 * hs, -7 * hs);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner ear
    ctx.fillStyle = '#FFAAAA';
    ctx.beginPath();
    ctx.moveTo(side * 5 * hs, -7 * hs);
    ctx.lineTo(side * 6.5 * hs, -13 * hs);
    ctx.lineTo(side * 3.5 * hs, -8 * hs);
    ctx.closePath();
    ctx.fill();
  }
}

function drawEyes(ctx, hs, eyeColor, eyeState) {
  for (let side = -1; side <= 1; side += 2) {
    const ex = side * 4 * hs;
    const ey = -1 * hs;

    // Eye white
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    switch (eyeState) {
      case 'closed':
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.moveTo(ex - 3 * hs, ey);
        ctx.lineTo(ex + 3 * hs, ey);
        ctx.stroke();
        continue;
      case 'half':
        ctx.ellipse(ex, ey, 3 * hs, 1.5 * hs, 0, 0, Math.PI * 2);
        break;
      case 'angry':
        ctx.ellipse(ex, ey + 0.5 * hs, 3 * hs, 2 * hs, side * 0.2, 0, Math.PI * 2);
        break;
      default: // 'open'
        ctx.ellipse(ex, ey, 3 * hs, 3 * hs, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    // Pupil
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    const pupilH = eyeState === 'half' ? 1 : eyeState === 'angry' ? 1.8 : 2;
    ctx.ellipse(ex, ey, 1.5 * hs, pupilH * hs, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupil center
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 0.8 * hs, pupilH * 0.7 * hs, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye shine
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.ellipse(ex + 1 * hs, ey - 1 * hs, 0.7 * hs, 0.7 * hs, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMouth(ctx, hs, mouthState, bodyColor) {
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;

  switch (mouthState) {
    case 'open':
      ctx.fillStyle = '#CC3333';
      ctx.beginPath();
      ctx.ellipse(0, 5.5 * hs, 3 * hs, 2.5 * hs, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'yowl':
      ctx.fillStyle = '#CC3333';
      ctx.beginPath();
      ctx.ellipse(0, 6 * hs, 4 * hs, 4 * hs, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Fangs
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.moveTo(-2 * hs, 4 * hs);
      ctx.lineTo(-1 * hs, 8 * hs);
      ctx.lineTo(0, 4 * hs);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(2 * hs, 4 * hs);
      ctx.lineTo(1 * hs, 8 * hs);
      ctx.lineTo(0, 4 * hs);
      ctx.fill();
      break;
    case 'grin':
      ctx.beginPath();
      ctx.moveTo(-3 * hs, 5 * hs);
      ctx.quadraticCurveTo(0, 8 * hs, 3 * hs, 5 * hs);
      ctx.stroke();
      break;
    default: // 'closed'
      ctx.beginPath();
      ctx.moveTo(-2 * hs, 5 * hs);
      ctx.lineTo(0, 6 * hs);
      ctx.lineTo(2 * hs, 5 * hs);
      ctx.stroke();
  }
}

function drawAccessory(ctx, bx, by, bs, hs, accentColor, accessory, headYOffset = 0) {
  const headX = bx + 6 * bs;
  const headY = -12 * bs + headYOffset + by;

  switch (accessory) {
    case 'crown':
      ctx.fillStyle = '#FFD700';
      ctx.strokeStyle = '#AA8800';
      ctx.lineWidth = 1;
      const crownY = headY - 10 * hs;
      ctx.beginPath();
      ctx.moveTo(headX - 8 * hs, crownY + 5);
      ctx.lineTo(headX - 8 * hs, crownY);
      ctx.lineTo(headX - 4 * hs, crownY + 3);
      ctx.lineTo(headX, crownY - 3);
      ctx.lineTo(headX + 4 * hs, crownY + 3);
      ctx.lineTo(headX + 8 * hs, crownY);
      ctx.lineTo(headX + 8 * hs, crownY + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Gems on crown
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(headX, crownY, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0088FF';
      ctx.beginPath();
      ctx.arc(headX - 5 * hs, crownY + 2, 1, 0, Math.PI * 2);
      ctx.arc(headX + 5 * hs, crownY + 2, 1, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'scars':
      ctx.strokeStyle = '#FF6666';
      ctx.lineWidth = 1.5;
      // Scar across face
      ctx.beginPath();
      ctx.moveTo(headX - 6 * hs, headY - 3 * hs);
      ctx.lineTo(headX + 4 * hs, headY + 2 * hs);
      ctx.stroke();
      // Body scar
      ctx.beginPath();
      ctx.moveTo(bx - 4 * bs, 0 + by);
      ctx.lineTo(bx + 8 * bs, 6 + by);
      ctx.stroke();
      break;

    case 'mask':
      ctx.fillStyle = 'rgba(20, 20, 20, 0.7)';
      ctx.beginPath();
      ctx.ellipse(headX, headY - 1 * hs, 10 * hs, 4 * hs, 0, 0, Math.PI * 2);
      ctx.fill();
      // Eye holes
      ctx.fillStyle = '#000';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.ellipse(headX - 4 * hs, headY - 1 * hs, 3.5 * hs, 3.5 * hs, 0, 0, Math.PI * 2);
      ctx.ellipse(headX + 4 * hs, headY - 1 * hs, 3.5 * hs, 3.5 * hs, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;

    case 'bandana':
      ctx.fillStyle = '#DD3333';
      ctx.strokeStyle = '#AA0000';
      ctx.lineWidth = 1;
      // Headband
      ctx.beginPath();
      ctx.ellipse(headX, headY - 5 * hs, 10 * hs, 3 * hs, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(headX + 10 * hs, headY - 5 * hs);
      ctx.lineTo(headX + 14 * hs, headY - 3 * hs);
      ctx.lineTo(headX + 12 * hs, headY - 1 * hs);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'bowtie':
      ctx.fillStyle = '#DD2222';
      ctx.strokeStyle = '#AA0000';
      ctx.lineWidth = 1;
      const btY = by + 0 + 14 * bs;
      ctx.beginPath();
      ctx.moveTo(bx + 6 * bs, btY);
      ctx.lineTo(bx + 12 * bs, btY - 3);
      ctx.lineTo(bx + 12 * bs, btY + 3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx + 6 * bs, btY);
      ctx.lineTo(bx, btY - 3);
      ctx.lineTo(bx, btY + 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(bx + 6 * bs, btY, 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'ribbon':
      ctx.fillStyle = '#FF88AA';
      ctx.strokeStyle = '#DD6688';
      ctx.lineWidth = 1;
      const rbY = headY - 8 * hs;
      ctx.beginPath();
      ctx.moveTo(headX + 5 * hs, rbY);
      ctx.lineTo(headX + 11 * hs, rbY - 3);
      ctx.lineTo(headX + 11 * hs, rbY + 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(headX + 5 * hs, rbY);
      ctx.lineTo(headX + 2 * hs, rbY - 2);
      ctx.lineTo(headX + 2 * hs, rbY + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'tiara':
      ctx.fillStyle = '#FF88CC';
      ctx.strokeStyle = '#CC5588';
      ctx.lineWidth = 1;
      const tiaraY = headY - 9 * hs;
      ctx.beginPath();
      ctx.moveTo(headX - 6 * hs, tiaraY + 3);
      ctx.lineTo(headX - 4 * hs, tiaraY - 1);
      ctx.lineTo(headX - 1 * hs, tiaraY + 1);
      ctx.lineTo(headX, tiaraY - 3);
      ctx.lineTo(headX + 1 * hs, tiaraY + 1);
      ctx.lineTo(headX + 4 * hs, tiaraY - 1);
      ctx.lineTo(headX + 6 * hs, tiaraY + 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Gem
      ctx.fillStyle = '#FF44FF';
      ctx.beginPath();
      ctx.arc(headX, tiaraY - 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'monocle':
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(headX + 4 * hs, headY - 1 * hs, 4 * hs, 0, Math.PI * 2);
      ctx.stroke();
      // Chain
      ctx.beginPath();
      ctx.moveTo(headX + 8 * hs, headY);
      ctx.lineTo(headX + 10 * hs, headY + 8 * hs);
      ctx.stroke();
      break;

    case 'brush':
      ctx.fillStyle = '#885533';
      ctx.strokeStyle = '#664422';
      ctx.lineWidth = 1;
      // Brush handle
      ctx.fillRect(bx - 14 * bs, -2 + by, 8, 2);
      ctx.strokeRect(bx - 14 * bs, -2 + by, 8, 2);
      // Bristles
      ctx.fillStyle = '#DDBB88';
      ctx.fillRect(bx - 16 * bs, -4 + by, 3, 6);
      break;

    case 'scarf':
      ctx.fillStyle = '#FF4444';
      ctx.strokeStyle = '#CC2222';
      ctx.lineWidth = 1;
      const scY = by + 0 + 14 * bs;
      ctx.beginPath();
      ctx.ellipse(bx + 6 * bs, scY, 12 * bs, 3, 0, 0, Math.PI);
      ctx.fill();
      ctx.stroke();
      // Trailing end
      ctx.beginPath();
      ctx.moveTo(bx - 4 * bs, scY);
      ctx.lineTo(bx - 8 * bs, scY + 8);
      ctx.lineTo(bx - 4 * bs, scY + 6);
      ctx.closePath();
      ctx.fill();
      break;

    case 'tophat':
      ctx.fillStyle = '#222222';
      ctx.strokeStyle = '#444444';
      ctx.lineWidth = 1;
      const thY = headY - 10 * hs;
      // Brim
      ctx.beginPath();
      ctx.ellipse(headX, thY + 3, 9 * hs, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Hat body
      ctx.fillRect(headX - 5 * hs, thY - 8, 10 * hs, 11);
      ctx.strokeRect(headX - 5 * hs, thY - 8, 10 * hs, 11);
      // Band
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(headX - 5 * hs, thY - 1, 10 * hs, 2);
      break;
  }
}


// ── Pose generators (per animation type) ──────────────────────

function getIdlePose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: Math.sin(t * Math.PI * 2) * 2,
    tailCurve: Math.sin(t * Math.PI * 2) * 0.5,
    eyeState: frame === 2 ? 'half' : 'open',
    legPose: 'stand'
  };
}

function getWalkPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: Math.abs(Math.sin(t * Math.PI * 2)) * -2,
    bodyXOffset: Math.sin(t * Math.PI * 2) * 1,
    tailCurve: Math.sin(t * Math.PI * 2) * 0.8,
    tailRaise: -2,
    legPose: frame % 2 === 0 ? 'walk1' : 'walk2',
    headTilt: Math.sin(t * Math.PI * 2) * 0.05
  };
}

function getAttackPose(frame, totalFrames) {
  const t = frame / totalFrames;
  if (t < 0.33) {
    // Wind up
    return {
      bodyXOffset: -3 * (t / 0.33),
      bodyRotation: -0.05 * (t / 0.33),
      eyeState: 'angry',
      legPose: 'crouch',
      tailRaise: -3
    };
  } else if (t < 0.5) {
    // Lunge
    const lt = (t - 0.33) / 0.17;
    return {
      bodyXOffset: -3 + lt * 10,
      bodyRotation: 0.1 * lt,
      eyeState: 'angry',
      mouthState: 'open',
      legPose: 'jump',
      pawAction: 'swipe_r',
      tailRaise: -5
    };
  } else if (t < 0.67) {
    // Strike
    return {
      bodyXOffset: 7,
      bodyRotation: 0.1,
      eyeState: 'angry',
      mouthState: 'yowl',
      legPose: 'jump',
      pawAction: 'swipe_r',
      tailCurve: -1
    };
  } else {
    // Recover
    const rt = (t - 0.67) / 0.33;
    return {
      bodyXOffset: 7 * (1 - rt),
      bodyRotation: 0.1 * (1 - rt),
      eyeState: 'open',
      legPose: 'stand',
      tailCurve: -0.5 * (1 - rt)
    };
  }
}

function getHurtPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyXOffset: -4 + t * 4,
    bodyRotation: -0.15 * (1 - t),
    bodyYOffset: -2 * (1 - t),
    eyeState: 'closed',
    mouthState: 'open',
    legPose: t > 0.5 ? 'stand' : 'crouch',
    tailCurve: -1 * (1 - t)
  };
}

function getDeathPose(frame, totalFrames) {
  const t = frame / totalFrames;
  if (t < 0.4) {
    // Stagger
    return {
      bodyRotation: -0.1 - t * 0.3,
      bodyYOffset: t * 5,
      eyeState: 'closed',
      mouthState: 'open',
      legPose: 'crouch',
      opacity: 1.0
    };
  } else {
    // Fall
    const ft = (t - 0.4) / 0.6;
    return {
      bodyRotation: -0.22 - ft * 1.2,
      bodyYOffset: 5 + ft * 8,
      bodyXOffset: -ft * 5,
      eyeState: 'closed',
      legPose: 'splat',
      opacity: 1.0 - ft * 0.3,
      tailCurve: -1
    };
  }
}

// ── Signature move poses ──────────────────────────────────────

function getBlockPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodySquash: 1.1,
    bodyStretch: 0.9,
    bodyYOffset: 2,
    eyeState: 'angry',
    legPose: 'crouch',
    pawAction: 'block',
    tailCurve: -0.5
  };
}

function getSlamPose(frame, totalFrames) {
  const t = frame / totalFrames;
  if (t < 0.4) {
    // Rise up
    return {
      bodyYOffset: -6 * (t / 0.4),
      bodyStretch: 1.15,
      eyeState: 'angry',
      mouthState: 'yowl',
      legPose: 'jump',
      pawAction: 'both_up'
    };
  } else {
    // Slam down
    const st = (t - 0.4) / 0.6;
    return {
      bodyYOffset: -6 + st * 10,
      bodySquash: 1 + st * 0.3,
      bodyStretch: 1.15 - st * 0.3,
      eyeState: 'angry',
      mouthState: 'yowl',
      legPose: st > 0.5 ? 'crouch' : 'jump',
      glowColor: st > 0.5 ? '#FFAA00' : null
    };
  }
}

function getRagePose(frame, totalFrames) {
  const t = frame / totalFrames;
  const shake = (frame % 2 === 0 ? 1 : -1) * 2;
  return {
    bodyXOffset: shake,
    bodyStretch: 1.1,
    eyeState: 'angry',
    mouthState: 'yowl',
    legPose: 'crouch',
    tailRaise: -5,
    tailCurve: -1,
    glowColor: `rgba(255, ${Math.floor(100 - t * 100)}, 0, ${0.3 + t * 0.5})`
  };
}

function getDashPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyXOffset: -5 + t * 20,
    bodyRotation: 0.1,
    bodySquash: 0.85,
    bodyStretch: 1.15,
    eyeState: 'angry',
    legPose: 'jump',
    tailCurve: 1,
    opacity: 0.6 + Math.abs(Math.sin(t * Math.PI)) * 0.4
  };
}

function getYowlPose(frame, totalFrames) {
  const t = frame / totalFrames;
  const shake = (frame % 2 === 0 ? 1 : -1);
  return {
    bodyXOffset: shake,
    bodyYOffset: -2,
    headTilt: shake * 0.05,
    eyeState: 'closed',
    mouthState: 'yowl',
    legPose: 'stand',
    tailRaise: -3,
    tailCurve: shake * 0.5,
    glowColor: t > 0.3 ? 'rgba(255, 255, 0, 0.3)' : null
  };
}

function getTauntPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: Math.sin(t * Math.PI) * -3,
    headTilt: Math.sin(t * Math.PI * 2) * 0.15,
    eyeState: frame === 1 ? 'half' : 'open',
    mouthState: 'grin',
    legPose: 'stand',
    tailRaise: -4,
    tailCurve: Math.sin(t * Math.PI * 2)
  };
}

function getSummonPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: -2,
    bodyStretch: 1.05,
    eyeState: 'angry',
    mouthState: t > 0.3 ? 'yowl' : 'closed',
    legPose: 'stand',
    pawAction: 'both_up',
    glowColor: `rgba(128, 0, 255, ${t * 0.8})`,
    tailCurve: Math.sin(t * Math.PI * 3) * 0.8,
    tailRaise: -3
  };
}

function getHowlPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: -3,
    headYOffset: -3 * t,
    headTilt: -0.2 * t,
    eyeState: 'closed',
    mouthState: 'yowl',
    legPose: 'stand',
    tailRaise: -5,
    tailCurve: -0.8,
    glowColor: t > 0.4 ? 'rgba(255, 100, 0, 0.4)' : null
  };
}

function getStealthPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: 4,
    bodySquash: 1.15,
    bodyStretch: 0.8,
    bodyXOffset: t * 3,
    eyeState: t > 0.5 ? 'half' : 'open',
    legPose: 'crouch',
    tailRaise: 2,
    tailCurve: 0.3,
    opacity: 1.0 - t * 0.6
  };
}

function getShufflePose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyXOffset: Math.sin(t * Math.PI * 3) * 4,
    bodyYOffset: Math.abs(Math.sin(t * Math.PI * 3)) * -2,
    headTilt: Math.sin(t * Math.PI * 3) * 0.1,
    eyeState: 'open',
    mouthState: 'grin',
    legPose: frame % 2 === 0 ? 'walk1' : 'walk2',
    tailCurve: Math.sin(t * Math.PI * 3) * 0.6
  };
}

// ── Additional pose generators for new factions ───────────────

function getPreemPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: -1,
    headTilt: Math.sin(t * Math.PI) * 0.1,
    eyeState: 'half',
    mouthState: 'closed',
    legPose: 'stand',
    tailCurve: Math.sin(t * Math.PI * 2) * 0.3,
    pawAction: t > 0.3 && t < 0.7 ? 'swipe_r' : 'none'
  };
}

function getShieldPose(frame, totalFrames) {
  return getBlockPose(frame, totalFrames); // same as block
}

function getCharmPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: Math.sin(t * Math.PI) * -2,
    headTilt: Math.sin(t * Math.PI * 2) * 0.1,
    eyeState: 'half',
    mouthState: 'grin',
    legPose: 'stand',
    tailCurve: Math.sin(t * Math.PI * 2) * 0.8,
    glowColor: `rgba(255, 128, 200, ${t * 0.5})`
  };
}

function getGroomPose(frame, totalFrames) {
  return getPreemPose(frame, totalFrames);
}

function getHealPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: -2,
    eyeState: 'closed',
    mouthState: 'closed',
    legPose: 'stand',
    pawAction: 'both_up',
    glowColor: `rgba(0, 255, 128, ${0.3 + t * 0.5})`,
    tailCurve: 0.3
  };
}

function getSneerPose(frame, totalFrames) {
  return getTauntPose(frame, totalFrames);
}

function getCastPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: -3,
    eyeState: t > 0.5 ? 'angry' : 'open',
    mouthState: t > 0.3 ? 'open' : 'closed',
    legPose: 'stand',
    pawAction: 'both_up',
    glowColor: `rgba(128, 128, 255, ${0.2 + t * 0.6})`,
    tailCurve: Math.sin(t * Math.PI * 2) * 0.5,
    tailRaise: -3
  };
}

function getMeditatePose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: 3,
    bodySquash: 1.15,
    bodyStretch: 0.85,
    eyeState: 'closed',
    mouthState: 'closed',
    legPose: 'crouch',
    tailCurve: 0.2,
    glowColor: `rgba(128, 200, 255, ${Math.sin(t * Math.PI) * 0.4})`
  };
}

function getDecrePose(frame, totalFrames) {
  return getSummonPose(frame, totalFrames);
}

function getChatterPose(frame, totalFrames) {
  const t = frame / totalFrames;
  const rapid = (frame % 2 === 0);
  return {
    bodyXOffset: rapid ? 1 : -1,
    headTilt: rapid ? 0.05 : -0.05,
    eyeState: 'open',
    mouthState: rapid ? 'open' : 'closed',
    legPose: 'stand',
    tailCurve: Math.sin(t * Math.PI * 4) * 0.5
  };
}

function getSingPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: -2,
    headYOffset: -2 * t,
    headTilt: Math.sin(t * Math.PI) * 0.1,
    eyeState: 'closed',
    mouthState: 'open',
    legPose: 'stand',
    tailCurve: Math.sin(t * Math.PI * 2) * 0.4,
    glowColor: t > 0.3 ? `rgba(255, 200, 100, ${t * 0.3})` : null
  };
}

function getAriaPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: -3,
    headYOffset: -3,
    headTilt: -0.1,
    eyeState: 'closed',
    mouthState: 'yowl',
    legPose: 'stand',
    tailRaise: -4,
    tailCurve: Math.sin(t * Math.PI * 3) * 0.6,
    glowColor: `rgba(255, 180, 80, ${0.3 + t * 0.5})`
  };
}

function getWhisperPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyXOffset: 2,
    headTilt: 0.15,
    eyeState: 'half',
    mouthState: t > 0.3 ? 'open' : 'closed',
    legPose: 'stand',
    tailCurve: 0.3
  };
}

function getGossipPose(frame, totalFrames) {
  return getWhisperPose(frame, totalFrames);
}

function getScreechPose(frame, totalFrames) {
  return getYowlPose(frame, totalFrames);
}

function getConductPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: -1,
    headTilt: Math.sin(t * Math.PI * 3) * 0.1,
    eyeState: 'open',
    mouthState: 'closed',
    legPose: 'stand',
    pawAction: 'both_up',
    tailCurve: Math.sin(t * Math.PI * 3) * 0.5
  };
}

function getPlayPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: Math.abs(Math.sin(t * Math.PI * 2)) * -4,
    bodyXOffset: Math.sin(t * Math.PI * 2) * 3,
    eyeState: 'open',
    mouthState: 'grin',
    legPose: frame % 2 === 0 ? 'walk1' : 'walk2',
    tailCurve: Math.sin(t * Math.PI * 3) * 1,
    tailRaise: -3
  };
}

function getRoarPose(frame, totalFrames) {
  return getHowlPose(frame, totalFrames);
}

function getPouncePose(frame, totalFrames) {
  const t = frame / totalFrames;
  if (t < 0.3) {
    return {
      bodyYOffset: 3,
      bodySquash: 1.2,
      bodyStretch: 0.8,
      eyeState: 'angry',
      legPose: 'crouch',
      tailRaise: -4
    };
  } else {
    const ft = (t - 0.3) / 0.7;
    return {
      bodyYOffset: 3 - ft * 12,
      bodyXOffset: ft * 10,
      bodySquash: 0.9,
      bodyStretch: 1.15,
      eyeState: 'angry',
      mouthState: ft > 0.3 ? 'open' : 'closed',
      legPose: 'jump',
      pawAction: ft > 0.4 ? 'swipe_r' : 'none',
      tailCurve: -0.8
    };
  }
}

function getStalkPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: 4,
    bodySquash: 1.1,
    bodyStretch: 0.85,
    bodyXOffset: t * 4,
    eyeState: 'angry',
    legPose: 'crouch',
    tailRaise: 2,
    tailCurve: -0.3
  };
}

function getCreepPose(frame, totalFrames) {
  return getStalkPose(frame, totalFrames);
}

function getStarePose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: 0,
    eyeState: 'open',
    mouthState: 'closed',
    legPose: 'stand',
    tailCurve: 0,
    glowColor: `rgba(255, 255, 0, ${Math.sin(t * Math.PI) * 0.4})`
  };
}

function getHugPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyXOffset: 3 * t,
    eyeState: 'closed',
    mouthState: 'grin',
    legPose: 'stand',
    pawAction: 'both_up',
    tailCurve: 0.5,
    glowColor: `rgba(255, 128, 200, ${t * 0.3})`
  };
}

function getShiverPose(frame, totalFrames) {
  const shake = (frame % 2 === 0 ? 1 : -1) * 1.5;
  return {
    bodyXOffset: shake,
    bodyYOffset: 1,
    eyeState: 'closed',
    mouthState: 'closed',
    legPose: 'stand',
    tailCurve: shake * 0.3
  };
}

function getRitualPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: -2,
    headTilt: Math.sin(t * Math.PI * 2) * 0.15,
    eyeState: 'closed',
    mouthState: t > 0.4 ? 'yowl' : 'closed',
    legPose: 'stand',
    pawAction: 'both_up',
    glowColor: `rgba(160, 0, 255, ${0.3 + t * 0.5})`,
    tailCurve: Math.sin(t * Math.PI * 2) * 0.8
  };
}

function getVisionPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: -2,
    headYOffset: -2,
    eyeState: 'open',
    mouthState: 'open',
    legPose: 'stand',
    glowColor: `rgba(0, 255, 255, ${0.3 + Math.sin(t * Math.PI) * 0.5})`,
    tailRaise: -2,
    tailCurve: 0
  };
}

function getFlopPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyRotation: -t * 1.2,
    bodyYOffset: t * 8,
    bodyXOffset: -t * 3,
    eyeState: 'closed',
    mouthState: 'grin',
    legPose: t > 0.5 ? 'splat' : 'stand',
    tailCurve: -0.5
  };
}

function getYawnPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: 1,
    headTilt: -0.1 * Math.sin(t * Math.PI),
    eyeState: 'closed',
    mouthState: t > 0.2 && t < 0.8 ? 'yowl' : 'closed',
    legPose: 'stand',
    tailCurve: 0.2
  };
}

function getSleepPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: 5,
    bodyRotation: -0.8,
    bodyXOffset: -2,
    eyeState: 'closed',
    mouthState: 'closed',
    legPose: 'splat',
    tailCurve: 0.3,
    opacity: 0.9
  };
}

function getHissPose(frame, totalFrames) {
  const t = frame / totalFrames;
  return {
    bodyYOffset: -1,
    bodyStretch: 1.1,
    eyeState: 'angry',
    mouthState: 'yowl',
    legPose: 'crouch',
    tailRaise: -5,
    tailCurve: -1
  };
}

// ── Map animation name to pose function ───────────────────────

const poseMap = {
  idle:     getIdlePose,
  walk:     getWalkPose,
  attack:   getAttackPose,
  block:    getBlockPose,
  slam:     getSlamPose,
  rage:     getRagePose,
  dash:     getDashPose,
  yowl:     getYowlPose,
  hurt:     getHurtPose,
  death:    getDeathPose,
  taunt:    getTauntPose,
  summon:   getSummonPose,
  howl:     getHowlPose,
  stealth:  getStealthPose,
  shuffle:  getShufflePose,
  trick:    getShufflePose,
  // Persian
  preen:    getPreemPose,
  shield:   getShieldPose,
  charm:    getCharmPose,
  groom:    getGroomPose,
  heal:     getHealPose,
  sneer:    getSneerPose,
  cast:     getCastPose,
  meditate: getMeditatePose,
  decree:   getDecrePose,
  // Siamese
  screech:  getScreechPose,
  chatter:  getChatterPose,
  sing:     getSingPose,
  aria:     getAriaPose,
  whisper:  getWhisperPose,
  gossip:   getGossipPose,
  conduct:  getConductPose,
  // MaineCoon
  play:     getPlayPose,
  roar:     getRoarPose,
  // Bengal
  pounce:   getPouncePose,
  stalk:    getStalkPose,
  // Sphynx
  creep:    getCreepPose,
  stare:    getStarePose,
  hug:      getHugPose,
  shiver:   getShiverPose,
  ritual:   getRitualPose,
  vision:   getVisionPose,
  // Ragdoll
  flop:     getFlopPose,
  yawn:     getYawnPose,
  sleep:    getSleepPose,
  hiss:     getHissPose
};


// ── Main generation ───────────────────────────────────────────

function generateSheet(unitKey) {
  const unitConfig = animConfig.units[unitKey];
  const profile = unitProfiles[unitKey];

  if (!unitConfig || !profile) {
    console.error(`Missing config/profile for: ${unitKey}`);
    return;
  }

  const animNames = Object.keys(unitConfig.animations);
  const rows = animNames.length;
  const sheetW = COLS * CELL_W;   // 384
  const sheetH = rows * CELL_H;   // 448

  const canvas = createCanvas(sheetW, sheetH);
  const ctx = canvas.getContext('2d');

  // Dark background (transparent)
  ctx.clearRect(0, 0, sheetW, sheetH);

  // Draw grid lines (faint) for debugging
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 0.5;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL_H);
    ctx.lineTo(sheetW, r * CELL_H);
    ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL_W, 0);
    ctx.lineTo(c * CELL_W, sheetH);
    ctx.stroke();
  }

  // Draw each animation row
  animNames.forEach((animName, rowIndex) => {
    const anim = unitConfig.animations[animName];
    const poseFunc = poseMap[animName] || getIdlePose;

    for (let frame = 0; frame < anim.frames; frame++) {
      const cellX = frame * CELL_W;
      const cellY = anim.row * CELL_H;
      const centerX = cellX + CELL_W / 2;
      const centerY = cellY + CELL_H / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(cellX, cellY, CELL_W, CELL_H);
      ctx.clip();

      // Get pose for this frame
      const pose = poseFunc(frame, anim.frames);

      // Draw the cat
      drawCat(ctx, centerX, centerY, profile, pose);

      ctx.restore();

      // Frame number label (tiny, bottom-right corner)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '7px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${frame}`, cellX + CELL_W - 2, cellY + CELL_H - 2);
    }

    // Animation name label on first cell (top-left corner)
    const labelY = anim.row * CELL_H;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(animName, 2, labelY + 8);
  });

  // ── Save to file ──
  const outDir = path.join(__dirname, 'sheets');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `${unitKey}_sheet.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buffer);

  console.log(`✓ Generated ${outPath} (${sheetW}×${sheetH}, ${buffer.length} bytes)`);
}


// ── Run ───────────────────────────────────────────────────────

console.log('FFFA Sprite Sheet Generator');
console.log('==========================');
console.log(`Cell size: ${CELL_W}×${CELL_H}, Grid: ${COLS} cols`);
console.log('');

for (const unitKey of UNITS_TO_GENERATE) {
  generateSheet(unitKey);
}

console.log('');
console.log('Done! Sheets saved to ./sheets/');
