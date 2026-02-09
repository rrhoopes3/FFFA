// ============================================================
//  FFFA — Sprite Animator
//  Loads unit_animations.json, manages sprite sheet playback.
// ============================================================

class SpriteAnimator {
  /**
   * @param {Object} unitConfig  - One entry from unit_animations.json → units[key]
   * @param {Object} meta        - The top-level "meta" block (cellWidth, cellHeight, etc.)
   */
  constructor(unitConfig, meta) {
    this.config = unitConfig;
    this.cellW  = meta.cellWidth;
    this.cellH  = meta.cellHeight;

    // Current animation state
    this.currentAnim = 'idle';
    this.frame       = 0;
    this.elapsed     = 0;       // ms accumulated since last frame advance
    this.playing     = true;
    this.finished    = false;   // true when a non-looping anim hits its last frame

    // The loaded Image element (set via loadSheet)
    this.sheet = null;

    // Optional callback when a non-looping animation finishes
    this.onAnimationEnd = null;
  }

  // ----------------------------------------------------------
  //  Load the sprite sheet image
  // ----------------------------------------------------------
  loadSheet() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => { this.sheet = img; resolve(img); };
      img.onerror = () => reject(new Error(`Failed to load sheet: ${this.config.sheet}`));
      img.src = this.config.sheet;
    });
  }

  // ----------------------------------------------------------
  //  Switch to a different animation
  // ----------------------------------------------------------
  play(animName, forceRestart = false) {
    if (!this.config.animations[animName]) {
      console.warn(`Animation "${animName}" not found for ${this.config.name}`);
      return;
    }

    // Don't restart if we're already playing this anim (unless forced)
    if (this.currentAnim === animName && !forceRestart && !this.finished) return;

    this.currentAnim = animName;
    this.frame       = 0;
    this.elapsed     = 0;
    this.finished    = false;
    this.playing     = true;
  }

  // ----------------------------------------------------------
  //  Get info about the current animation
  // ----------------------------------------------------------
  get anim() {
    return this.config.animations[this.currentAnim];
  }

  // ----------------------------------------------------------
  //  Advance the animation timer  (call every frame)
  //  @param {number} dt — delta time in milliseconds
  // ----------------------------------------------------------
  update(dt) {
    if (!this.playing || this.finished) return;

    const anim = this.anim;
    const frameDuration = 1000 / anim.fps;

    this.elapsed += dt;

    while (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration;
      this.frame++;

      if (this.frame >= anim.frames) {
        if (anim.loop) {
          this.frame = 0;
        } else {
          this.frame = anim.frames - 1;
          this.finished = true;
          this.playing  = false;
          if (this.onAnimationEnd) {
            this.onAnimationEnd(this.currentAnim);
          }
          break;
        }
      }
    }
  }

  // ----------------------------------------------------------
  //  Draw the current frame onto a canvas context
  //  @param {CanvasRenderingContext2D} ctx
  //  @param {number} x — destination x on canvas
  //  @param {number} y — destination y on canvas
  //  @param {number} [scale=1] — optional scale multiplier
  //  @param {boolean} [flipX=false] — mirror horizontally
  // ----------------------------------------------------------
  draw(ctx, x, y, scale = 1, flipX = false) {
    if (!this.sheet) return;

    const anim = this.anim;
    const sx   = this.frame * this.cellW;
    const sy   = anim.row   * this.cellH;
    const dw   = this.cellW * scale;
    const dh   = this.cellH * scale;

    ctx.save();

    if (flipX) {
      ctx.translate(x + dw, y);
      ctx.scale(-1, 1);
      ctx.drawImage(this.sheet, sx, sy, this.cellW, this.cellH, 0, 0, dw, dh);
    } else {
      ctx.drawImage(this.sheet, sx, sy, this.cellW, this.cellH, x, y, dw, dh);
    }

    ctx.restore();
  }
}


// ============================================================
//  UnitAnimationManager
//  Loads the JSON config, creates SpriteAnimators for any unit.
// ============================================================

class UnitAnimationManager {
  constructor() {
    this.data      = null;   // parsed unit_animations.json
    this.animators = {};     // unitKey → SpriteAnimator
  }

  // Load and parse the config file
  async loadConfig(path = 'unit_animations.json') {
    const res  = await fetch(path);
    this.data  = await res.json();
    return this.data;
  }

  // Get the list of all unit keys
  get unitKeys() {
    return Object.keys(this.data.units);
  }

  // Create (and load the sheet for) a single unit animator
  async createAnimator(unitKey) {
    const unitConfig = this.data.units[unitKey];
    if (!unitConfig) throw new Error(`Unknown unit: ${unitKey}`);

    const animator = new SpriteAnimator(unitConfig, this.data.meta);
    await animator.loadSheet();

    this.animators[unitKey] = animator;
    return animator;
  }

  // Convenience: load ALL unit animators
  async createAll() {
    const promises = this.unitKeys.map(key => this.createAnimator(key));
    await Promise.all(promises);
    return this.animators;
  }

  // Quick access
  get(unitKey) {
    return this.animators[unitKey];
  }
}


// ============================================================
//  Export for module usage or attach to window for script tags
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SpriteAnimator, UnitAnimationManager };
} else {
  window.SpriteAnimator        = SpriteAnimator;
  window.UnitAnimationManager  = UnitAnimationManager;
}
