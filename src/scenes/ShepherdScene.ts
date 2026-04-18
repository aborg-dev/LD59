import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

const HUD_TOP_H = 70;
const HUD_BOTTOM_H = 80;

const WAVE_PREP_SEC = 5;
const WAVE_SPAWN_SPREAD_MS = 3000;
const WAVE_CLEAR_BONUS = 3;

function waveConfig(n: number): { size: number; timeSec: number } {
  return {
    size: 2 + n,
    timeSec: Math.max(15, 28 - n),
  };
}

const PEN_RADIUS = 120;
const SHEEP_RADIUS = 18;

const SHEEP_MAX_SPEED = 220;
const SHEEP_WANDER_FORCE = 140;
const SHEEP_GRAZE_MIN_SEC = 1.5;
const SHEEP_GRAZE_MAX_SEC = 4.0;
const SHEEP_WALK_MIN_SEC = 0.8;
const SHEEP_WALK_MAX_SEC = 2.2;
const SHEEP_COHESION_RADIUS = 160;
const SHEEP_COHESION_FORCE = 28;
const SEPARATION_RADIUS = 42;
const SEPARATION_FORCE = 240;
const SHEEP_DAMPING = 0.9;

const WHISTLE_RADIUS = 260;
const WHISTLE_IMPULSE = 1400;
const WHISTLE_COOLDOWN_MS = 700;
const WHISTLE_SCARED_MS = 700;
const SHEEP_SCARED_MAX_SPEED = 560;
const SHEEP_SCARED_DAMPING = 0.985;

const HAY_COST = 6;
const HAY_RADIUS = 130;
const HAY_EAT_DIST = 45;
const HAY_FORCE = 900;
const HAY_PUSH_FORCE = 1400;
const HAY_VISUAL_R = 16;

interface Sheep {
  sprite: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  penned: boolean;
  grazing: boolean;
  modeT: number;
  wanderAngle: number;
  scaredMs: number;
}

interface HayPile {
  x: number;
  y: number;
  gfx: Phaser.GameObjects.Arc;
  ring: Phaser.GameObjects.Arc;
}

export interface ShepherdSceneState {
  active: boolean;
  sheep: { x: number; y: number; penned: boolean }[];
  pen: { x: number; y: number; radius: number };
  hayPiles: { x: number; y: number }[];
  score: number;
  coins: number;
  placing: boolean;
  wave: {
    number: number;
    phase: "prep" | "active";
    phaseTimeLeft: number;
    size: number;
    remainingToSpawn: number;
  };
  /** Seconds left in the current wave phase — preserved for test-helper use */
  timeLeft: number;
  whistleCooldownMs: number;
  viewport: { width: number; height: number };
}

export class ShepherdScene extends Phaser.Scene {
  private sheep: Sheep[] = [];
  private hayPiles: HayPile[] = [];
  private score = 0;
  private coins = 0;
  private accumulator = 0;
  private gameOver = false;
  private whistleCooldownMs = 0;
  private whistleRing!: Phaser.GameObjects.Arc;
  private placing = false;
  private placePreview!: Phaser.GameObjects.Arc;

  // Wave state
  private waveNumber = 1;
  private wavePhase: "prep" | "active" = "prep";
  private phaseTimeLeftMs = 0;
  private sheepToSpawn = 0;
  private waveSpawnOrigin = { x: 0, y: 0 };
  private nextSpawnMs = 0;
  private waveSize = 0;
  private lastShownSec = -1;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerTween?: Phaser.Tweens.Tween;

  private penX = 0;
  private penY = 0;
  private penR = PEN_RADIUS;

  private waveText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hayBtn!: Phaser.GameObjects.Text;

  private fieldTop = 0;
  private fieldBottom = 0;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  private currentZoom = 1;

  constructor() {
    super("Shepherd");
  }

  create(): void {
    const { width, height } = this.scale;
    this.fieldTop = HUD_TOP_H;
    this.fieldBottom = height - HUD_BOTTOM_H;
    const fieldH = this.fieldBottom - this.fieldTop;

    this.score = 0;
    this.coins = 0;
    this.accumulator = 0;
    this.gameOver = false;
    this.whistleCooldownMs = 0;
    this.sheep = [];
    this.hayPiles = [];
    this.placing = false;
    this.waveNumber = 1;
    this.wavePhase = "prep";
    this.phaseTimeLeftMs = WAVE_PREP_SEC * 1000;
    this.sheepToSpawn = 0;
    this.waveSize = 0;
    this.lastShownSec = -1;
    this.currentZoom = 1;
    this.hudCamera = this.cameras.add(0, 0, width, height);

    // Grass background — large so it fills the view when zoomed out
    const bg = this.add
      .rectangle(width / 2, this.fieldTop + fieldH / 2, 6000, 4000, 0x4a8c3a)
      .setDepth(0);
    this.hudCamera.ignore(bg);

    // Pen — circle in the middle
    this.penX = width / 2;
    this.penY = this.fieldTop + fieldH / 2;

    const pen = this.add
      .circle(this.penX, this.penY, this.penR, 0x8b5a2b, 0.25)
      .setDepth(1);
    pen.setStrokeStyle(4, 0xffe099);
    this.hudCamera.ignore(pen);

    const penLabel = this.add
      .text(this.penX, this.penY, "PEN", {
        fontFamily: FONT_UI,
        fontSize: 24,
        color: "#fff1c1",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.hudCamera.ignore(penLabel);

    // Whistle visualization (hidden by default, positioned on each whistle)
    this.whistleRing = this.add
      .circle(0, 0, WHISTLE_RADIUS, 0xffffff, 0.0)
      .setDepth(9);
    this.whistleRing.setStrokeStyle(3, 0xffff88, 0);
    this.hudCamera.ignore(this.whistleRing);

    // Hay placement preview (hidden until placing mode)
    this.placePreview = this.add
      .circle(0, 0, HAY_RADIUS, 0xffd966, 0.1)
      .setDepth(4);
    this.placePreview.setStrokeStyle(2, 0xffd966, 0.7);
    this.placePreview.setVisible(false);
    this.hudCamera.ignore(this.placePreview);

    this.input.keyboard?.on("keydown-H", () => this.togglePlacing());

    // Click in the field → whistle at the click location, scattering nearby
    // sheep. In placing mode, clicks drop a hay pile instead.
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      if (p.y > this.fieldBottom) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      if (this.placing) {
        this.tryPlaceHay(wp.x, wp.y);
        return;
      }
      this.whistle(wp.x, wp.y);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      if (!this.placing) {
        this.placePreview.setVisible(false);
        return;
      }
      if (p.y > this.fieldBottom) {
        this.placePreview.setVisible(false);
        return;
      }
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.placePreview.setVisible(true);
      this.placePreview.setPosition(wp.x, wp.y);
      const ok = this.canPlaceHay(wp.x, wp.y);
      this.placePreview.setFillStyle(ok ? 0xffd966 : 0xff6666, 0.1);
      this.placePreview.setStrokeStyle(2, ok ? 0xffd966 : 0xff6666, 0.7);
    });

    // --- Top HUD: timer | coins | wave ---
    const hudTopBar = this.add
      .rectangle(width / 2, 0, width, HUD_TOP_H, 0x111122)
      .setOrigin(0.5, 0)
      .setDepth(100);
    this.cameras.main.ignore(hudTopBar);

    this.timerText = this.add
      .text(24, HUD_TOP_H / 2, String(WAVE_PREP_SEC), {
        fontFamily: FONT_UI,
        fontSize: 36,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0, 0.5)
      .setDepth(101);
    this.cameras.main.ignore(this.timerText);

    this.coinText = this.add
      .text(width / 2, HUD_TOP_H / 2, "$0", {
        fontFamily: FONT_UI,
        fontSize: 32,
        color: "#ffe066",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(101);
    this.cameras.main.ignore(this.coinText);

    this.waveText = this.add
      .text(width - 24, HUD_TOP_H / 2, `Wave ${this.waveNumber}`, {
        fontFamily: FONT_UI,
        fontSize: 28,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(1, 0.5)
      .setDepth(101);
    this.cameras.main.ignore(this.waveText);

    // Mid-field banner for wave transitions — on HUD camera so it stays at fixed screen position
    this.bannerText = this.add
      .text(width / 2, this.fieldTop + 60, "", {
        fontFamily: FONT_UI,
        fontSize: 36,
        color: "#fff1c1",
        stroke: "#000000",
        strokeThickness: 5,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setAlpha(0);
    this.cameras.main.ignore(this.bannerText);

    this.showBanner(`Wave ${this.waveNumber} — prep`);

    // --- Bottom HUD: HAY | MENU ---
    const hudBottomBar = this.add
      .rectangle(width / 2, height, width, HUD_BOTTOM_H, 0x111122)
      .setOrigin(0.5, 1)
      .setDepth(100);
    this.cameras.main.ignore(hudBottomBar);

    const btnY = this.fieldBottom + HUD_BOTTOM_H / 2;

    const btnStyle = {
      fontFamily: FONT_BODY,
      fontSize: 22,
      color: "#ffffff",
      backgroundColor: "#333344",
      padding: { left: 16, right: 16, top: 10, bottom: 10 },
      resolution: TEXT_RESOLUTION,
    };

    this.hayBtn = this.add
      .text(width * 0.3, btnY, `HAY $${HAY_COST}`, {
        ...btnStyle,
        backgroundColor: "#8a6a1f",
        fontSize: 24,
      })
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.hayBtn.on("pointerdown", () => this.togglePlacing());
    this.cameras.main.ignore(this.hayBtn);

    const menuBtn = this.add
      .text(width * 0.7, btnY, "MENU", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    menuBtn.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("MainMenu");
    });
    this.cameras.main.ignore(menuBtn);
  }

  private togglePlacing(): void {
    if (this.gameOver) return;
    this.placing = !this.placing;
    this.placePreview.setVisible(false);
    this.hayBtn.setBackgroundColor(this.placing ? "#d4a84a" : "#8a6a1f");
    this.sound.play("pop");
  }

  private canPlaceHay(x: number, y: number): boolean {
    if (this.coins < HAY_COST) return false;
    // Can't place in HUD
    if (y < this.fieldTop + 20 || y > this.fieldBottom - 20) return false;
    if (x < 20 || x > this.scale.width - 20) return false;
    // Can't place inside pen
    if (Math.hypot(x - this.penX, y - this.penY) < this.penR + 30) return false;
    // Spacing
    for (const h of this.hayPiles) {
      if (Math.hypot(x - h.x, y - h.y) < 50) return false;
    }
    return true;
  }

  private tryPlaceHay(x: number, y: number): void {
    if (!this.canPlaceHay(x, y)) {
      this.sound.play("pop");
      return;
    }
    this.coins -= HAY_COST;
    this.updateCoinText();

    const ring = this.add.circle(x, y, HAY_RADIUS, 0xffd966, 0.06).setDepth(3);
    ring.setStrokeStyle(1, 0xffd966, 0.4);
    this.hudCamera.ignore(ring);

    const gfx = this.add.circle(x, y, HAY_VISUAL_R, 0xe6c85a).setDepth(8);
    gfx.setStrokeStyle(3, 0x6b4a1f);
    this.hudCamera.ignore(gfx);

    // Darker tuft on top for a pile-of-hay feel
    const tuft = this.add.circle(x, y - 4, HAY_VISUAL_R * 0.5, 0xb8964a).setDepth(9);
    this.hudCamera.ignore(tuft);

    this.hayPiles.push({ x, y, gfx, ring });
    this.sound.play("score");
  }

  private updateCoinText(): void {
    this.coinText.setText(`$${this.coins}`);
  }

  private spawnSheep(): void {
    // Scatter around the wave's shared spawn origin so the flock arrives as a group
    const jitter = 30;
    const sx = this.waveSpawnOrigin.x + Phaser.Math.Between(-jitter, jitter);
    const sy = this.waveSpawnOrigin.y + Phaser.Math.Between(-jitter, jitter);

    // Initial velocity pointing away from the pen
    const dx = sx - this.penX;
    const dy = sy - this.penY;
    const d = Math.hypot(dx, dy) || 1;
    const v0 = 60;

    const s = this.add.circle(sx, sy, SHEEP_RADIUS, 0xfafafa).setDepth(5);
    s.setStrokeStyle(2, 0x2b2b2b);
    this.hudCamera.ignore(s);
    this.sheep.push({
      sprite: s,
      vx: (dx / d) * v0,
      vy: (dy / d) * v0,
      penned: false,
      grazing: false,
      modeT: SHEEP_WALK_MIN_SEC + Math.random() * SHEEP_WALK_MAX_SEC,
      wanderAngle: Math.atan2(dy, dx),
      scaredMs: 0,
    });
  }

  private whistle(wx: number, wy: number): void {
    if (this.gameOver) return;
    if (this.whistleCooldownMs > 0) return;
    this.whistleCooldownMs = WHISTLE_COOLDOWN_MS;
    this.sound.play("pop");

    // Push unpenned sheep away from the whistle point.
    for (const s of this.sheep) {
      if (s.penned) continue;
      const dx = s.sprite.x - wx;
      const dy = s.sprite.y - wy;
      const d = Math.hypot(dx, dy);
      if (d < WHISTLE_RADIUS && d > 0.01) {
        const k = (1 - d / WHISTLE_RADIUS) * WHISTLE_IMPULSE;
        s.vx += (dx / d) * k;
        s.vy += (dy / d) * k;
        s.scaredMs = WHISTLE_SCARED_MS;
      }
    }

    // Visual ring at the whistle point.
    this.whistleRing.setPosition(wx, wy);
    this.whistleRing.setRadius(10);
    this.whistleRing.setStrokeStyle(4, 0xffff88, 1);
    this.tweens.add({
      targets: this.whistleRing,
      radius: WHISTLE_RADIUS,
      strokeAlpha: 0,
      duration: 400,
      onComplete: () => {
        this.whistleRing.setStrokeStyle(3, 0xffff88, 0);
      },
    });
  }

  /**
   * Hay pull/push combined into one step. Sheep are drawn in from HAY_RADIUS
   * toward HAY_EAT_DIST, then pushed back out if they get closer than that,
   * so they cluster in a ring around the pile instead of sitting on it.
   */
  private hayForce(sx: number, sy: number): { ax: number; ay: number } {
    let ax = 0;
    let ay = 0;
    for (const h of this.hayPiles) {
      const dx = h.x - sx;
      const dy = h.y - sy;
      const d = Math.hypot(dx, dy);
      if (d > HAY_RADIUS || d < 0.01) continue;
      const nx = dx / d;
      const ny = dy / d;
      if (d > HAY_EAT_DIST) {
        const t = (d - HAY_EAT_DIST) / (HAY_RADIUS - HAY_EAT_DIST);
        const k = t * HAY_FORCE;
        ax += nx * k;
        ay += ny * k;
      } else {
        const t = 1 - d / HAY_EAT_DIST;
        const k = t * HAY_PUSH_FORCE;
        ax -= nx * k;
        ay -= ny * k;
      }
    }
    return { ax, ay };
  }

  private endGame(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.scene.start("GameOver", {
      score: this.score,
      returnScene: "Shepherd",
    });
  }

  dumpState(): ShepherdSceneState {
    const phaseTimeLeft = Math.max(0, this.phaseTimeLeftMs / 1000);
    return {
      active: this.scene.isActive(),
      sheep: this.sheep.map((s) => ({
        x: s.sprite.x,
        y: s.sprite.y,
        penned: s.penned,
      })),
      pen: { x: this.penX, y: this.penY, radius: this.penR },
      hayPiles: this.hayPiles.map((h) => ({ x: h.x, y: h.y })),
      score: this.score,
      coins: this.coins,
      placing: this.placing,
      wave: {
        number: this.waveNumber,
        phase: this.wavePhase,
        phaseTimeLeft,
        size: this.waveSize,
        remainingToSpawn: this.sheepToSpawn,
      },
      timeLeft: phaseTimeLeft,
      whistleCooldownMs: this.whistleCooldownMs,
      viewport: { width: this.scale.width, height: this.scale.height },
    };
  }

  private static readonly stepMs = 16.666;
  private static readonly stepSec = ShepherdScene.stepMs / 1000;

  private updateZoom(): void {
    const fieldW = this.scale.width;
    const fieldH = this.fieldBottom - this.fieldTop;
    // Extra space beyond the farthest sheep so the player can whistle from behind
    const MARGIN = WHISTLE_RADIUS + 40;

    let reqHalfW = this.penR;
    let reqHalfH = this.penR;

    for (const s of this.sheep) {
      if (s.penned) continue;
      reqHalfW = Math.max(reqHalfW, Math.abs(s.sprite.x - this.penX) + SHEEP_RADIUS);
      reqHalfH = Math.max(reqHalfH, Math.abs(s.sprite.y - this.penY) + SHEEP_RADIUS);
    }

    reqHalfW += MARGIN;
    reqHalfH += MARGIN;

    const targetZoom = Math.min(
      1,
      Math.min((fieldW / 2) / reqHalfW, (fieldH / 2) / reqHalfH),
    );
    // Zoom out immediately when needed; only zoom back in between waves
    if (targetZoom < this.currentZoom || this.wavePhase === "prep") {
      this.currentZoom += (targetZoom - this.currentZoom) * 0.05;
    }
    this.cameras.main.setZoom(this.currentZoom);
    this.cameras.main.centerOn(this.penX, this.penY);
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;
    this.accumulator += delta;
    while (this.accumulator >= ShepherdScene.stepMs) {
      this.step();
      if (this.gameOver) return;
      this.accumulator -= ShepherdScene.stepMs;
    }
    this.updateZoom();
  }

  private startWave(): void {
    const cfg = waveConfig(this.waveNumber);
    this.waveSize = cfg.size;
    this.sheepToSpawn = cfg.size;
    this.nextSpawnMs = 0;
    this.phaseTimeLeftMs = cfg.timeSec * 1000;
    this.wavePhase = "active";
    this.lastShownSec = -1;
    this.waveText.setText(`Wave ${this.waveNumber}`);
    this.showBanner(`Wave ${this.waveNumber}!`);
    this.waveSpawnOrigin = this.pickSpawnOrigin();
  }

  private pickSpawnOrigin(): { x: number; y: number } {
    const { width } = this.scale;
    const fieldH = this.fieldBottom - this.fieldTop;
    const edge = Phaser.Math.Between(0, 3);
    if (edge === 0) return { x: Phaser.Math.Between(80, width - 80), y: this.fieldTop + 20 };
    if (edge === 1) return { x: width - 20, y: this.fieldTop + Phaser.Math.Between(80, fieldH - 80) };
    if (edge === 2) return { x: Phaser.Math.Between(80, width - 80), y: this.fieldBottom - 20 };
    return { x: 20, y: this.fieldTop + Phaser.Math.Between(80, fieldH - 80) };
  }

  private completeWave(): void {
    this.coins += WAVE_CLEAR_BONUS;
    this.updateCoinText();
    this.sound.play("score");
    this.waveNumber++;
    this.wavePhase = "prep";
    this.phaseTimeLeftMs = WAVE_PREP_SEC * 1000;
    this.lastShownSec = -1;
    this.waveText.setText(`Wave ${this.waveNumber}`);
    this.showBanner(`Cleared! +$${WAVE_CLEAR_BONUS}`);
  }

  private showBanner(msg: string): void {
    if (this.bannerTween) this.bannerTween.stop();
    this.bannerText.setText(msg);
    this.bannerText.setAlpha(1);
    this.bannerTween = this.tweens.add({
      targets: this.bannerText,
      alpha: 0,
      delay: 900,
      duration: 600,
    });
  }

  private updateTimerHud(): void {
    const sec = Math.max(0, Math.ceil(this.phaseTimeLeftMs / 1000));
    if (sec !== this.lastShownSec) {
      this.lastShownSec = sec;
      this.timerText.setText(String(sec));
      if (this.wavePhase === "active" && sec <= 5) {
        this.timerText.setColor("#ff4444");
      } else if (this.wavePhase === "prep") {
        this.timerText.setColor("#88ddff");
      } else {
        this.timerText.setColor("#ffffff");
      }
    }
  }

  private step(): void {
    const dt = ShepherdScene.stepSec;
    const dtMs = dt * 1000;
    const { width } = this.scale;

    if (this.whistleCooldownMs > 0) {
      this.whistleCooldownMs = Math.max(0, this.whistleCooldownMs - dtMs);
    }

    // Wave state machine
    this.phaseTimeLeftMs -= dtMs;
    this.updateTimerHud();

    if (this.wavePhase === "prep") {
      if (this.phaseTimeLeftMs <= 0) this.startWave();
    } else {
      // Stagger spawns across the first WAVE_SPAWN_SPREAD_MS of the wave
      if (this.sheepToSpawn > 0) {
        this.nextSpawnMs -= dtMs;
        if (this.nextSpawnMs <= 0) {
          this.spawnSheep();
          this.sheepToSpawn--;
          this.nextSpawnMs =
            this.waveSize > 1 ? WAVE_SPAWN_SPREAD_MS / this.waveSize : 0;
        }
      }

      // Wave clear? (all spawned, all penned)
      if (this.sheepToSpawn === 0) {
        const unpenned = this.sheep.filter((s) => !s.penned).length;
        if (unpenned === 0) {
          this.completeWave();
        } else if (this.phaseTimeLeftMs <= 0) {
          this.endGame();
          return;
        }
      }
    }

    // Sheep behavior
    for (let i = 0; i < this.sheep.length; i++) {
      const s = this.sheep[i];
      if (s.penned) continue;

      let ax = 0;
      let ay = 0;

      // Hay pulls sheep in from the outer radius and holds them in a ring
      // just outside the pile.
      const hay = this.hayForce(s.sprite.x, s.sprite.y);
      ax += hay.ax;
      ay += hay.ay;

      // Separation from other sheep
      for (let j = 0; j < this.sheep.length; j++) {
        if (i === j) continue;
        const o = this.sheep[j];
        const odx = s.sprite.x - o.sprite.x;
        const ody = s.sprite.y - o.sprite.y;
        const od = Math.hypot(odx, ody);
        if (od < SEPARATION_RADIUS && od > 0.01) {
          const k = (1 - od / SEPARATION_RADIUS) * SEPARATION_FORCE;
          ax += (odx / od) * k;
          ay += (ody / od) * k;
        }
      }

      // Graze/walk alternation
      s.modeT -= dt;
      if (s.modeT <= 0) {
        s.grazing = !s.grazing;
        s.modeT = s.grazing
          ? SHEEP_GRAZE_MIN_SEC +
            Math.random() * (SHEEP_GRAZE_MAX_SEC - SHEEP_GRAZE_MIN_SEC)
          : SHEEP_WALK_MIN_SEC +
            Math.random() * (SHEEP_WALK_MAX_SEC - SHEEP_WALK_MIN_SEC);
        if (!s.grazing) s.wanderAngle = Math.random() * Math.PI * 2;
      }
      if (!s.grazing) {
        s.wanderAngle += (Math.random() - 0.5) * 0.4;
        ax += Math.cos(s.wanderAngle) * SHEEP_WANDER_FORCE;
        ay += Math.sin(s.wanderAngle) * SHEEP_WANDER_FORCE;
      }

      // Cohesion — pull toward other unpenned sheep
      let cohX = 0;
      let cohY = 0;
      let cohN = 0;
      for (let j = 0; j < this.sheep.length; j++) {
        if (i === j) continue;
        const o = this.sheep[j];
        if (o.penned) continue;
        const odx = o.sprite.x - s.sprite.x;
        const ody = o.sprite.y - s.sprite.y;
        const od = Math.hypot(odx, ody);
        if (od > SEPARATION_RADIUS && od < SHEEP_COHESION_RADIUS) {
          cohX += odx;
          cohY += ody;
          cohN++;
        }
      }
      if (cohN > 0) {
        const cm = Math.hypot(cohX, cohY);
        if (cm > 0.01) {
          ax += (cohX / cm) * SHEEP_COHESION_FORCE;
          ay += (cohY / cm) * SHEEP_COHESION_FORCE;
        }
      }

      // Scared tick (set by whistle)
      if (s.scaredMs > 0) s.scaredMs = Math.max(0, s.scaredMs - dtMs);
      const scared = s.scaredMs > 0;
      const damping = scared ? SHEEP_SCARED_DAMPING : SHEEP_DAMPING;
      const maxSpeed = scared ? SHEEP_SCARED_MAX_SPEED : SHEEP_MAX_SPEED;

      // Integrate velocity
      s.vx = (s.vx + ax * dt) * damping;
      s.vy = (s.vy + ay * dt) * damping;

      // Clamp speed
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > maxSpeed) {
        s.vx = (s.vx / sp) * maxSpeed;
        s.vy = (s.vy / sp) * maxSpeed;
      }

      s.sprite.x += s.vx * dt;
      s.sprite.y += s.vy * dt;

      // Field bounds
      if (s.sprite.x < SHEEP_RADIUS) {
        s.sprite.x = SHEEP_RADIUS;
        s.vx = Math.abs(s.vx) * 0.5;
      } else if (s.sprite.x > width - SHEEP_RADIUS) {
        s.sprite.x = width - SHEEP_RADIUS;
        s.vx = -Math.abs(s.vx) * 0.5;
      }
      if (s.sprite.y < this.fieldTop + SHEEP_RADIUS) {
        s.sprite.y = this.fieldTop + SHEEP_RADIUS;
        s.vy = Math.abs(s.vy) * 0.5;
      } else if (s.sprite.y > this.fieldBottom - SHEEP_RADIUS) {
        s.sprite.y = this.fieldBottom - SHEEP_RADIUS;
        s.vy = -Math.abs(s.vy) * 0.5;
      }

      // Pen check — sheep center fully inside the pen circle
      const pdx = s.sprite.x - this.penX;
      const pdy = s.sprite.y - this.penY;
      if (Math.hypot(pdx, pdy) + SHEEP_RADIUS <= this.penR) {
        s.penned = true;
        s.vx = 0;
        s.vy = 0;
        s.sprite.setFillStyle(0xffe099);
        this.score++;
        this.coins++;
        this.updateCoinText();
        this.sound.play("score");
      }
    }
  }
}
