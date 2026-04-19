import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

const HUD_TOP_H = 70;
const HUD_BOTTOM_H = 80;

const WAVE_PREP_SEC = 5;
const WAVE_CLEAR_BONUS = 3;

function waveConfig(n: number): { size: number; timeSec: number } {
  return {
    size: 2 + n,
    timeSec: Math.max(15, 28 - n),
  };
}

const PEN_RADIUS = 120;
const SHEEP_RADIUS = 18;

let SHEEP_MAX_SPEED = 220;
let SHEEP_WANDER_FORCE = 140;
const SHEEP_GRAZE_MIN_SEC = 1.5;
const SHEEP_GRAZE_MAX_SEC = 4.0;
const SHEEP_WALK_MIN_SEC = 0.8;
const SHEEP_WALK_MAX_SEC = 2.2;
const SHEEP_COHESION_RADIUS = 160;
let SHEEP_COHESION_FORCE = 55;
const ALIGNMENT_RADIUS = 130;
let ALIGNMENT_FORCE = 100;
const SEPARATION_RADIUS = 42;
const SEPARATION_FORCE = 240;
let SHEEP_DAMPING = 0.97;
let SHEEP_TURN_RATE = 4.5;
const PANIC_RADIUS = 90;
let PANIC_INHERIT = 0.7;

const WHISTLE_RADIUS = 260;
let WHISTLE_IMPULSE = 750;
const WHISTLE_COOLDOWN_MS = 700;
const WHISTLE_SCARED_MS = 700;
let SHEEP_SCARED_MAX_SPEED = 300;
let SHEEP_SCARED_DAMPING = 0.975;

const DOG_RADIUS = 22;
let FEAR_RADIUS = 180;
let FLEE_FORCE = 520;

const CLIFF_WIDTH = 120;
let CLIFF_DRIFT_FORCE = 50;

// Idle-clicker AI-dog tuning.
const DOG_AI_SPEED = 320;
// Where to stand relative to the target sheep (slightly inside the fear ring).
const DOG_FETCH_OFFSET = FEAR_RADIUS - 40;
// Sheep this close to the pen are considered already shepherded — AI ignores them.
const PEN_PROXIMITY_BUFFER = 30;
// Free starter dogs deployed at the start of a run.
const STARTER_DOGS = 3;
// Buy cost grows roughly geometrically; the first paid dog is the (STARTER_DOGS+1)th.
const DOG_BASE_COST = 5;
function dogCost(owned: number): number {
  const paid = Math.max(0, owned - STARTER_DOGS);
  return Math.round(DOG_BASE_COST * 1.6 ** paid);
}

// Wolf — periodic predator that hunts unpenned sheep.
const WOLF_RADIUS = 18;
const WOLF_SPEED = 240;
const WOLF_KILL_RADIUS = SHEEP_RADIUS + WOLF_RADIUS - 4;
const WOLF_DOG_SCARE_RADIUS = 150;
const WOLF_FEAR_RADIUS = 220; // sheep flee from wolf within this range
const WOLF_FLEE_FORCE = 780;
const WOLF_RETREAT_MS = 1500;
const WOLF_SPAWN_INITIAL_MS = 6000;
const WOLF_SPAWN_INTERVAL_MS = 14000;
const MAX_WOLVES = 2;

interface Sheep {
  sprite: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  angle: number;
  penned: boolean;
  grazing: boolean;
  modeT: number;
  wanderAngle: number;
  scaredMs: number;
}

interface AiDog {
  sprite: Phaser.GameObjects.Arc;
  targetSheep: Sheep | null;
}

interface Wolf {
  sprite: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  retreatMs: number;
}

export interface ShepherdSceneState {
  active: boolean;
  cursor: { x: number; y: number };
  sheep: { x: number; y: number; penned: boolean }[];
  aiDogs: { x: number; y: number; targetIndex: number | null }[];
  wolves: { x: number; y: number; retreating: boolean }[];
  pen: { x: number; y: number; radius: number };
  score: number;
  coins: number;
  nextDogCost: number;
  wave: {
    number: number;
    phase: "prep" | "active";
    phaseTimeLeft: number;
    size: number;
    remainingToSpawn: number;
  };
  timeLeft: number;
  whistleCooldownMs: number;
  viewport: { width: number; height: number };
}

export class ShepherdScene extends Phaser.Scene {
  private cursor!: Phaser.GameObjects.Arc;
  private cursorX = 0;
  private cursorY = 0;
  private sheep: Sheep[] = [];
  private aiDogs: AiDog[] = [];
  private wolves: Wolf[] = [];
  private wolfSpawnT = WOLF_SPAWN_INITIAL_MS;
  private score = 0;
  private coins = 0;
  private accumulator = 0;
  private gameOver = false;
  private whistleCooldownMs = 0;
  private whistleRing!: Phaser.GameObjects.Arc;

  // Wave state
  private waveNumber = 1;
  private wavePhase: "prep" | "active" = "prep";
  private phaseTimeLeftMs = 0;
  private sheepToSpawn = 0;
  private waveSpawnOrigin = { x: 0, y: 0 };
  private waveSize = 0;
  private sheepLost = 0;
  private lastShownSec = -1;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerTween?: Phaser.Tweens.Tween;

  private penX = 0;
  private penY = 0;
  private penR = PEN_RADIUS;

  private waveText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private buyDogBtn!: Phaser.GameObjects.Text;
  private dogCountText!: Phaser.GameObjects.Text;

  private fieldTop = 0;
  private fieldBottom = 0;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  private currentZoom = 1;
  private cliffX = 0;
  private debugPanel: HTMLDivElement | null = null;

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
    this.aiDogs = [];
    this.wolves = [];
    this.wolfSpawnT = WOLF_SPAWN_INITIAL_MS;
    this.waveNumber = 1;
    this.wavePhase = "prep";
    this.phaseTimeLeftMs = WAVE_PREP_SEC * 1000;
    this.sheepToSpawn = 0;
    this.waveSize = 0;
    this.sheepLost = 0;
    this.lastShownSec = -1;
    this.currentZoom = 1;
    this.hudCamera = this.cameras.add(0, 0, width, height);

    // Grass background.
    const bg = this.add
      .rectangle(width / 2, this.fieldTop + fieldH / 2, 6000, 4000, 0x4a8c3a)
      .setDepth(0);
    this.hudCamera.ignore(bg);

    // Cliff strip on the right.
    this.cliffX = width - CLIFF_WIDTH;
    const cliffGfx = this.add.graphics().setDepth(1);
    cliffGfx.fillStyle(0x080604, 1);
    cliffGfx.fillRect(this.cliffX, this.fieldTop, CLIFF_WIDTH, fieldH);
    cliffGfx.lineStyle(6, 0xa07050, 1);
    cliffGfx.beginPath();
    cliffGfx.moveTo(this.cliffX, this.fieldTop);
    cliffGfx.lineTo(this.cliffX, this.fieldBottom);
    cliffGfx.strokePath();
    this.hudCamera.ignore(cliffGfx);
    const cliffLabel = this.add
      .text(
        this.cliffX + CLIFF_WIDTH / 2,
        this.fieldTop + fieldH / 2,
        "CLIFF",
        {
          fontFamily: FONT_UI,
          fontSize: 16,
          color: "#ff7744",
          stroke: "#000000",
          strokeThickness: 3,
          resolution: TEXT_RESOLUTION,
        },
      )
      .setOrigin(0.5)
      .setDepth(3);
    this.hudCamera.ignore(cliffLabel);

    // Pen.
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

    // Cursor reticle — follows the mouse, marks where the next bark lands.
    // It does not push sheep; it's purely visual.
    this.cursorX = this.penX;
    this.cursorY = this.penY + this.penR + 80;
    this.cursor = this.add
      .circle(this.cursorX, this.cursorY, 14, 0xffffff, 0)
      .setDepth(9);
    this.cursor.setStrokeStyle(2, 0xffe066, 0.9);
    this.hudCamera.ignore(this.cursor);

    // Whistle ring (expands on bark).
    this.whistleRing = this.add
      .circle(0, 0, WHISTLE_RADIUS, 0xffffff, 0.0)
      .setDepth(9);
    this.whistleRing.setStrokeStyle(3, 0xffff88, 0);
    this.hudCamera.ignore(this.whistleRing);

    this.input.keyboard?.on("keydown-SPACE", () =>
      this.whistle(this.cursorX, this.cursorY),
    );
    this.input.keyboard?.on("keydown-ENTER", () => this.toggleDebugPanel());

    // Click anywhere in the play area = bark at cursor.
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      if (p.y > this.fieldBottom) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.whistle(wp.x, wp.y);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      if (p.y > this.fieldBottom) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.cursorX = wp.x;
      this.cursorY = wp.y;
      this.cursor.setPosition(wp.x, wp.y);
    });

    // Top HUD: timer | coins | wave.
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

    // Mid-field banner.
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

    // Bottom HUD: BUY DOG | dogs owned | MENU.
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

    this.buyDogBtn = this.add
      .text(width * 0.18, btnY, this.buyDogLabel(), {
        ...btnStyle,
        backgroundColor: "#3a554a",
      })
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.buyDogBtn.on("pointerdown", () => this.tryBuyDog());
    this.cameras.main.ignore(this.buyDogBtn);

    this.dogCountText = this.add
      .text(width * 0.36, btnY, "Dogs: 0", {
        fontFamily: FONT_UI,
        fontSize: 22,
        color: "#bcd6c0",
        stroke: "#000000",
        strokeThickness: 3,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(101);
    this.cameras.main.ignore(this.dogCountText);

    const helpText = this.add
      .text(width * 0.55, btnY, "Click to bark · Buy dogs to auto-herd", {
        fontFamily: FONT_BODY,
        fontSize: 16,
        color: "#aaaaaa",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(101);
    this.cameras.main.ignore(helpText);

    const menuBtn = this.add
      .text(width * 0.85, btnY, "MENU", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    menuBtn.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("MainMenu");
    });
    this.cameras.main.ignore(menuBtn);

    // Free starter dogs — deployed automatically at the start of a run.
    for (let i = 0; i < STARTER_DOGS; i++) this.spawnAiDog();
  }

  private buyDogLabel(): string {
    return `Buy Dog $${dogCost(this.aiDogs.length)}`;
  }

  private updateBuyDogBtn(): void {
    this.buyDogBtn.setText(this.buyDogLabel());
    const affordable = this.coins >= dogCost(this.aiDogs.length);
    this.buyDogBtn.setBackgroundColor(affordable ? "#3a554a" : "#3a3a44");
    this.buyDogBtn.setColor(affordable ? "#ffffff" : "#888888");
    this.dogCountText.setText(`Dogs: ${this.aiDogs.length}`);
  }

  tryBuyDog(): boolean {
    if (this.gameOver) return false;
    const cost = dogCost(this.aiDogs.length);
    if (this.coins < cost) {
      this.sound.play("pop");
      return false;
    }
    this.coins -= cost;
    this.updateCoinText();
    this.spawnAiDog();
    this.sound.play("score");
    return true;
  }

  private spawnAiDog(): void {
    // Spawn just outside the pen so the dog has somewhere safe to start.
    const angle = Math.random() * Math.PI * 2;
    const r = this.penR + DOG_RADIUS + 20;
    const x = this.penX + Math.cos(angle) * r;
    const y = this.penY + Math.sin(angle) * r;
    const spr = this.add.circle(x, y, DOG_RADIUS, 0x444466).setDepth(10);
    spr.setStrokeStyle(2, 0xffffff);
    this.hudCamera.ignore(spr);
    this.aiDogs.push({ sprite: spr, targetSheep: null });
    this.updateBuyDogBtn();
  }

  private updateCoinText(): void {
    this.coinText.setText(`$${this.coins}`);
    this.updateBuyDogBtn();
  }

  private spawnSheep(): void {
    const jitter = 60;
    const sx = this.waveSpawnOrigin.x + Phaser.Math.Between(-jitter, jitter);
    const sy = this.waveSpawnOrigin.y + Phaser.Math.Between(-jitter, jitter);
    const dx = sx - this.penX;
    const dy = sy - this.penY;
    const d = Math.hypot(dx, dy) || 1;
    const v0 = 60;
    const initAngle = Math.atan2(dy, dx);
    const s = this.add
      .rectangle(sx, sy, SHEEP_RADIUS * 2, SHEEP_RADIUS, 0xfafafa)
      .setDepth(5);
    s.setStrokeStyle(2, 0x2b2b2b);
    s.rotation = initAngle;
    this.hudCamera.ignore(s);
    this.sheep.push({
      sprite: s,
      vx: (dx / d) * v0,
      vy: (dy / d) * v0,
      angle: initAngle,
      penned: false,
      grazing: false,
      modeT: SHEEP_WALK_MIN_SEC + Math.random() * SHEEP_WALK_MAX_SEC,
      wanderAngle: initAngle,
      scaredMs: 0,
    });
  }

  whistle(wx: number, wy: number): void {
    if (this.gameOver) return;
    if (this.whistleCooldownMs > 0) return;
    this.whistleCooldownMs = WHISTLE_COOLDOWN_MS;
    this.sound.play("pop");

    for (const s of this.sheep) {
      if (s.penned) continue;
      const dx = s.sprite.x - wx;
      const dy = s.sprite.y - wy;
      const d = Math.hypot(dx, dy);
      if (d < WHISTLE_RADIUS && d > 0.01) {
        const fleeAngle = Math.atan2(dy, dx);
        const dot = Math.cos(s.angle - fleeAngle);
        const k = (1 - d / WHISTLE_RADIUS) * WHISTLE_IMPULSE;
        if (dot > 0) {
          s.vx += Math.cos(s.angle) * k;
          s.vy += Math.sin(s.angle) * k;
        } else {
          s.vx = s.vx * 0.15 + Math.cos(fleeAngle) * k * 0.2;
          s.vy = s.vy * 0.15 + Math.sin(fleeAngle) * k * 0.2;
        }
        s.scaredMs = WHISTLE_SCARED_MS;
      }
    }

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
      cursor: { x: this.cursorX, y: this.cursorY },
      sheep: this.sheep.map((s) => ({
        x: s.sprite.x,
        y: s.sprite.y,
        penned: s.penned,
      })),
      aiDogs: this.aiDogs.map((d) => ({
        x: d.sprite.x,
        y: d.sprite.y,
        targetIndex: d.targetSheep ? this.sheep.indexOf(d.targetSheep) : null,
      })),
      wolves: this.wolves.map((w) => ({
        x: w.sprite.x,
        y: w.sprite.y,
        retreating: w.retreatMs > 0,
      })),
      pen: { x: this.penX, y: this.penY, radius: this.penR },
      score: this.score,
      coins: this.coins,
      nextDogCost: dogCost(this.aiDogs.length),
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
    const MARGIN = WHISTLE_RADIUS + 40;

    let reqHalfW = this.penR;
    let reqHalfH = this.penR;

    for (const s of this.sheep) {
      if (s.penned) continue;
      reqHalfW = Math.max(
        reqHalfW,
        Math.abs(s.sprite.x - this.penX) + SHEEP_RADIUS,
      );
      reqHalfH = Math.max(
        reqHalfH,
        Math.abs(s.sprite.y - this.penY) + SHEEP_RADIUS,
      );
    }

    reqHalfW += MARGIN;
    reqHalfH += MARGIN;

    const targetZoom = Math.min(
      1,
      Math.min(fieldW / 2 / reqHalfW, fieldH / 2 / reqHalfH),
    );
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
    this.sheepLost = 0;
    this.sheepToSpawn = 0;
    this.phaseTimeLeftMs = cfg.timeSec * 1000;
    this.wavePhase = "active";
    this.lastShownSec = -1;
    this.waveText.setText(`Wave ${this.waveNumber}`);
    this.showBanner(`Wave ${this.waveNumber}!`);
    this.waveSpawnOrigin = this.pickSpawnOrigin();
    for (let i = 0; i < cfg.size; i++) this.spawnSheep();
  }

  private pickSpawnOrigin(): { x: number; y: number } {
    const fieldH = this.fieldBottom - this.fieldTop;
    const edge = Phaser.Math.Between(0, 2);
    if (edge === 0)
      return {
        x: Phaser.Math.Between(80, this.cliffX - 80),
        y: this.fieldTop + 20,
      };
    if (edge === 1)
      return {
        x: Phaser.Math.Between(80, this.cliffX - 80),
        y: this.fieldBottom - 20,
      };
    return { x: 20, y: this.fieldTop + Phaser.Math.Between(80, fieldH - 80) };
  }

  private completeWave(): void {
    const perfect = this.sheepLost === 0;
    if (perfect) {
      this.coins += WAVE_CLEAR_BONUS;
      this.updateCoinText();
    }
    this.sound.play("score");
    this.waveNumber++;
    this.wavePhase = "prep";
    this.phaseTimeLeftMs = WAVE_PREP_SEC * 1000;
    this.lastShownSec = -1;
    this.waveText.setText(`Wave ${this.waveNumber}`);
    this.showBanner(
      perfect
        ? `Cleared! No sheep lost! +$${WAVE_CLEAR_BONUS}`
        : `Cleared! (Lost ${this.sheepLost} sheep, no bonus)`,
    );
    this.sheepLost = 0;
    this.clearPennedSheep();
    // Reset wolves between waves so the player gets a breather.
    for (const w of this.wolves) w.sprite.destroy();
    this.wolves = [];
    this.wolfSpawnT = WOLF_SPAWN_INITIAL_MS;
  }

  private playPenEntryFx(s: Sheep): void {
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 260,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        const r = Math.round(250 + (255 - 250) * t);
        const g = Math.round(250 + (224 - 250) * t);
        const b = Math.round(250 + (153 - 250) * t);
        s.sprite.setFillStyle((r << 16) | (g << 8) | b);
      },
    });
    this.tweens.add({
      targets: s.sprite,
      scale: 1.3,
      duration: 120,
      yoyo: true,
      ease: "Quad.easeOut",
    });
    const ring = this.add
      .circle(s.sprite.x, s.sprite.y, 6, 0xffffff, 0)
      .setDepth(11);
    ring.setStrokeStyle(3, 0xffe099, 1);
    this.hudCamera.ignore(ring);
    this.tweens.add({
      targets: ring,
      radius: SHEEP_RADIUS * 2.4,
      strokeAlpha: 0,
      duration: 450,
      onComplete: () => ring.destroy(),
    });
  }

  private clearPennedSheep(): void {
    const retiring = this.sheep.filter((s) => s.penned);
    this.sheep = this.sheep.filter((s) => !s.penned);
    for (const s of retiring) {
      this.tweens.add({
        targets: s.sprite,
        alpha: 0,
        scale: 0.3,
        duration: 450,
        onComplete: () => s.sprite.destroy(),
      });
    }
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

  /**
   * Pick a target sheep for each AI dog and step the dog toward its
   * "fetch point" — the position behind the sheep (relative to the pen)
   * from which the dog's fear radius will push the sheep pen-ward.
   */
  private spawnWolf(): void {
    // Pick an entry edge — anything except the right-side cliff.
    const fieldH = this.fieldBottom - this.fieldTop;
    const edge = Phaser.Math.Between(0, 2);
    let x: number;
    let y: number;
    if (edge === 0) {
      x = Phaser.Math.Between(60, this.cliffX - 60);
      y = this.fieldTop - 20;
    } else if (edge === 1) {
      x = Phaser.Math.Between(60, this.cliffX - 60);
      y = this.fieldBottom + 20;
    } else {
      x = -20;
      y = this.fieldTop + Phaser.Math.Between(60, fieldH - 60);
    }
    const sprite = this.add.circle(x, y, WOLF_RADIUS, 0x991111).setDepth(8);
    sprite.setStrokeStyle(3, 0x550000);
    this.hudCamera.ignore(sprite);
    // Inner notch makes it visibly different from a dog (smaller, redder).
    this.wolves.push({ sprite, vx: 0, vy: 0, retreatMs: 0 });
  }

  private updateWolves(dt: number): void {
    const dtMs = dt * 1000;

    // Spawn timer — only ticks during an active wave.
    if (this.wavePhase === "active" && this.wolves.length < MAX_WOLVES) {
      this.wolfSpawnT -= dtMs;
      if (this.wolfSpawnT <= 0) {
        this.spawnWolf();
        this.wolfSpawnT = WOLF_SPAWN_INTERVAL_MS;
      }
    }

    for (let wi = 0; wi < this.wolves.length; wi++) {
      const w = this.wolves[wi];

      // Compute how strongly the closest dogs are scaring this wolf.
      let dogFleeX = 0;
      let dogFleeY = 0;
      let dogPressure = 0;
      for (const dog of this.aiDogs) {
        const dx = w.sprite.x - dog.sprite.x;
        const dy = w.sprite.y - dog.sprite.y;
        const d = Math.hypot(dx, dy);
        if (d < WOLF_DOG_SCARE_RADIUS && d > 0.01) {
          const k = 1 - d / WOLF_DOG_SCARE_RADIUS;
          dogFleeX += (dx / d) * k;
          dogFleeY += (dy / d) * k;
          dogPressure += k;
        }
      }

      let dirX = 0;
      let dirY = 0;
      let speed = WOLF_SPEED;

      if (dogPressure > 0.05) {
        // Flee from dogs — high priority, breaks current task.
        const fm = Math.hypot(dogFleeX, dogFleeY);
        if (fm > 0.01) {
          dirX = dogFleeX / fm;
          dirY = dogFleeY / fm;
        }
        speed = WOLF_SPEED * 1.3;
        // Mark as retreating so it despawns when off-screen.
        w.retreatMs = Math.max(w.retreatMs, 400);
      } else if (w.retreatMs > 0) {
        // Retreating after a kill — head toward nearest edge.
        w.retreatMs -= dtMs;
        const dxLeft = w.sprite.x;
        const dxRight = this.cliffX - w.sprite.x;
        const dyTop = w.sprite.y - this.fieldTop;
        const dyBot = this.fieldBottom - w.sprite.y;
        const minD = Math.min(dxLeft, dxRight, dyTop, dyBot);
        if (minD === dxLeft) dirX = -1;
        else if (minD === dxRight) dirX = 1;
        else if (minD === dyTop) dirY = -1;
        else dirY = 1;
      } else {
        // Hunt the closest unpenned sheep.
        let target: Sheep | null = null;
        let bestD = Number.POSITIVE_INFINITY;
        for (const s of this.sheep) {
          if (s.penned) continue;
          const dx = s.sprite.x - w.sprite.x;
          const dy = s.sprite.y - w.sprite.y;
          const d = Math.hypot(dx, dy);
          if (d < bestD) {
            bestD = d;
            target = s;
          }
        }
        if (target) {
          const dx = target.sprite.x - w.sprite.x;
          const dy = target.sprite.y - w.sprite.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.01) {
            dirX = dx / d;
            dirY = dy / d;
          }
          if (d < WOLF_KILL_RADIUS) {
            // Eat the sheep, then retreat briefly.
            target.sprite.destroy();
            const idx = this.sheep.indexOf(target);
            if (idx >= 0) this.sheep.splice(idx, 1);
            this.sheepLost++;
            w.retreatMs = WOLF_RETREAT_MS;
            this.sound.play("pop");
          }
        }
      }

      w.vx = dirX * speed;
      w.vy = dirY * speed;
      w.sprite.x += w.vx * dt;
      w.sprite.y += w.vy * dt;

      // Despawn when far enough off-screen while retreating.
      if (w.retreatMs > 0) {
        if (
          w.sprite.x < -40 ||
          w.sprite.x > this.cliffX + 40 ||
          w.sprite.y < this.fieldTop - 60 ||
          w.sprite.y > this.fieldBottom + 60
        ) {
          w.sprite.destroy();
          this.wolves.splice(wi, 1);
          wi--;
        }
      }
    }
  }

  private updateAiDogs(dt: number): void {
    if (this.aiDogs.length === 0) return;

    // Build the candidate set: unpenned sheep that are not already inside
    // the pen halo. Sort by distance to the pen so we can hand them out
    // farthest-first (those need the most help).
    const candidates: { s: Sheep; dist: number }[] = [];
    for (const s of this.sheep) {
      if (s.penned) continue;
      const d = Math.hypot(s.sprite.x - this.penX, s.sprite.y - this.penY);
      if (d <= this.penR + SHEEP_RADIUS + PEN_PROXIMITY_BUFFER) continue;
      candidates.push({ s, dist: d });
    }
    candidates.sort((a, b) => b.dist - a.dist);

    // Round-robin assignment: each dog gets the next-best candidate not
    // already claimed.
    const claimed = new Set<Sheep>();
    for (const dog of this.aiDogs) {
      let picked: Sheep | null = null;
      for (const c of candidates) {
        if (claimed.has(c.s)) continue;
        picked = c.s;
        break;
      }
      dog.targetSheep = picked;
      if (picked) claimed.add(picked);
    }

    // Move each dog toward its fetch point (or back to a holding spot).
    for (const dog of this.aiDogs) {
      let tx: number;
      let ty: number;
      if (dog.targetSheep) {
        const s = dog.targetSheep;
        const vx = s.sprite.x - this.penX;
        const vy = s.sprite.y - this.penY;
        const vlen = Math.hypot(vx, vy) || 1;
        // Stand on the FAR side of the sheep so the flee push aims at the pen.
        tx = s.sprite.x + (vx / vlen) * DOG_FETCH_OFFSET;
        ty = s.sprite.y + (vy / vlen) * DOG_FETCH_OFFSET;
      } else {
        // Idle just outside the pen, top side.
        tx = this.penX;
        ty = this.penY - this.penR - 60;
      }

      // Clamp targets so we don't try to walk into the cliff.
      tx = Math.min(tx, this.cliffX - DOG_RADIUS - 4);
      ty = Math.max(
        this.fieldTop + DOG_RADIUS,
        Math.min(ty, this.fieldBottom - DOG_RADIUS),
      );

      const dx = tx - dog.sprite.x;
      const dy = ty - dog.sprite.y;
      const d = Math.hypot(dx, dy);
      if (d > 2) {
        const move = Math.min(d, DOG_AI_SPEED * dt);
        dog.sprite.x += (dx / d) * move;
        dog.sprite.y += (dy / d) * move;
      }

      // Keep dog inside the field and clear of the cliff.
      dog.sprite.x = Math.max(
        DOG_RADIUS,
        Math.min(dog.sprite.x, this.cliffX - DOG_RADIUS),
      );
      dog.sprite.y = Math.max(
        this.fieldTop + DOG_RADIUS,
        Math.min(dog.sprite.y, this.fieldBottom - DOG_RADIUS),
      );
    }
  }

  private step(): void {
    const dt = ShepherdScene.stepSec;
    const dtMs = dt * 1000;

    if (this.whistleCooldownMs > 0) {
      this.whistleCooldownMs = Math.max(0, this.whistleCooldownMs - dtMs);
    }

    // Wave state machine.
    this.phaseTimeLeftMs -= dtMs;
    this.updateTimerHud();

    if (this.wavePhase === "prep") {
      if (this.phaseTimeLeftMs <= 0) this.startWave();
    } else {
      const unpenned = this.sheep.filter((s) => !s.penned).length;
      if (unpenned === 0) {
        this.completeWave();
      } else if (this.phaseTimeLeftMs <= 0) {
        this.endGame();
        return;
      }
    }

    // AI dogs pick targets and walk to fetch points.
    this.updateAiDogs(dt);
    // Wolves stalk the flock.
    this.updateWolves(dt);

    // Sheep behaviour.
    for (let i = 0; i < this.sheep.length; i++) {
      const s = this.sheep[i];
      if (s.penned) continue;

      let ax = 0;
      let ay = 0;

      // Flee from each AI dog within fear radius.
      for (const dog of this.aiDogs) {
        const fdx = s.sprite.x - dog.sprite.x;
        const fdy = s.sprite.y - dog.sprite.y;
        const fd = Math.hypot(fdx, fdy);
        if (fd < FEAR_RADIUS && fd > 0.01) {
          const strength = (1 - fd / FEAR_RADIUS) * FLEE_FORCE;
          ax += (fdx / fd) * strength;
          ay += (fdy / fd) * strength;
        }
      }

      // Wolves are scarier than dogs — bigger force, also triggers panic sprint.
      for (const wolf of this.wolves) {
        const fdx = s.sprite.x - wolf.sprite.x;
        const fdy = s.sprite.y - wolf.sprite.y;
        const fd = Math.hypot(fdx, fdy);
        if (fd < WOLF_FEAR_RADIUS && fd > 0.01) {
          const strength = (1 - fd / WOLF_FEAR_RADIUS) * WOLF_FLEE_FORCE;
          ax += (fdx / fd) * strength;
          ay += (fdy / fd) * strength;
          s.scaredMs = Math.max(s.scaredMs, 600);
        }
      }

      // Rightward pull toward the cliff (kept from the original — adds challenge).
      ax += CLIFF_DRIFT_FORCE;

      // Separation from other sheep.
      for (let j = 0; j < this.sheep.length; j++) {
        if (i === j) continue;
        const o = this.sheep[j];
        if (o.penned) continue;
        const odx = s.sprite.x - o.sprite.x;
        const ody = s.sprite.y - o.sprite.y;
        const od = Math.hypot(odx, ody);
        if (od < SEPARATION_RADIUS && od > 0.01) {
          const k = (1 - od / SEPARATION_RADIUS) * SEPARATION_FORCE;
          ax += (odx / od) * k;
          ay += (ody / od) * k;
        }
      }

      // Cohesion + alignment + panic contagion.
      let cohX = 0,
        cohY = 0,
        cohN = 0;
      let alignVx = 0,
        alignVy = 0,
        alignN = 0;
      for (let j = 0; j < this.sheep.length; j++) {
        if (i === j) continue;
        const o = this.sheep[j];
        if (o.penned) continue;
        const odx = o.sprite.x - s.sprite.x;
        const ody = o.sprite.y - s.sprite.y;
        const od = Math.hypot(odx, ody);
        if (od < SEPARATION_RADIUS || od > SHEEP_COHESION_RADIUS) continue;
        cohX += odx;
        cohY += ody;
        cohN++;
        if (od < ALIGNMENT_RADIUS) {
          alignVx += o.vx;
          alignVy += o.vy;
          alignN++;
        }
        if (od < PANIC_RADIUS && o.scaredMs > s.scaredMs) {
          s.scaredMs = Math.max(s.scaredMs, o.scaredMs * PANIC_INHERIT);
        }
      }
      if (cohN > 0) {
        const cm = Math.hypot(cohX, cohY);
        if (cm > 0.01) {
          ax += (cohX / cm) * SHEEP_COHESION_FORCE;
          ay += (cohY / cm) * SHEEP_COHESION_FORCE;
        }
      }
      if (alignN > 0) {
        const am = Math.hypot(alignVx, alignVy);
        if (am > 0.01) {
          ax += (alignVx / am) * ALIGNMENT_FORCE;
          ay += (alignVy / am) * ALIGNMENT_FORCE;
        }
      }

      // Wander/graze when isolated.
      s.modeT -= dt;
      if (s.modeT <= 0) {
        s.grazing = alignN === 0 ? !s.grazing : false;
        s.modeT = s.grazing
          ? SHEEP_GRAZE_MIN_SEC +
            Math.random() * (SHEEP_GRAZE_MAX_SEC - SHEEP_GRAZE_MIN_SEC)
          : SHEEP_WALK_MIN_SEC +
            Math.random() * (SHEEP_WALK_MAX_SEC - SHEEP_WALK_MIN_SEC);
        if (!s.grazing) s.wanderAngle = Math.random() * Math.PI * 2;
      }
      if (!s.grazing && alignN === 0) {
        s.wanderAngle += (Math.random() - 0.5) * 0.15;
        ax += Math.cos(s.wanderAngle) * SHEEP_WANDER_FORCE;
        ay += Math.sin(s.wanderAngle) * SHEEP_WANDER_FORCE;
      }

      // Scared decay.
      if (s.scaredMs > 0) s.scaredMs = Math.max(0, s.scaredMs - dtMs);
      const scared = s.scaredMs > 0;
      const damping = scared ? SHEEP_SCARED_DAMPING : SHEEP_DAMPING;
      const maxSpeed = scared ? SHEEP_SCARED_MAX_SPEED : SHEEP_MAX_SPEED;

      const desiredVx = (s.vx + ax * dt) * damping;
      const desiredVy = (s.vy + ay * dt) * damping;
      const desiredSpd = Math.hypot(desiredVx, desiredVy);

      if (desiredSpd > 2) {
        let diff = Math.atan2(desiredVy, desiredVx) - s.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = (scared ? SHEEP_TURN_RATE * 5 : SHEEP_TURN_RATE) * dt;
        s.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
      }

      const clampedSpd = Math.min(desiredSpd, maxSpeed);
      s.vx = Math.cos(s.angle) * clampedSpd;
      s.vy = Math.sin(s.angle) * clampedSpd;

      s.sprite.x += s.vx * dt;
      s.sprite.y += s.vy * dt;
      s.sprite.rotation = s.angle;

      // Cliff — sheep that cross the edge fall into the void.
      if (this.isInCliff(s.sprite.x)) {
        s.sprite.destroy();
        this.sheep.splice(i, 1);
        i--;
        this.sheepLost++;
        continue;
      }

      // Field bounds.
      if (s.sprite.x < SHEEP_RADIUS) {
        s.sprite.x = SHEEP_RADIUS;
        s.vx = Math.abs(s.vx) * 0.5;
      }
      if (s.sprite.y < this.fieldTop + SHEEP_RADIUS) {
        s.sprite.y = this.fieldTop + SHEEP_RADIUS;
        s.vy = Math.abs(s.vy) * 0.5;
      } else if (s.sprite.y > this.fieldBottom - SHEEP_RADIUS) {
        s.sprite.y = this.fieldBottom - SHEEP_RADIUS;
        s.vy = -Math.abs(s.vy) * 0.5;
      }

      // Pen check.
      const pdx = s.sprite.x - this.penX;
      const pdy = s.sprite.y - this.penY;
      if (Math.hypot(pdx, pdy) + SHEEP_RADIUS <= this.penR) {
        s.penned = true;
        s.vx = 0;
        s.vy = 0;
        this.score++;
        this.coins++;
        this.updateCoinText();
        this.sound.play("score");
        this.playPenEntryFx(s);
      }
    }

    // Positional overlap resolution between sheep.
    const minSep = SHEEP_RADIUS * 2;
    for (let i = 0; i < this.sheep.length; i++) {
      const a = this.sheep[i];
      if (a.penned) continue;
      for (let j = i + 1; j < this.sheep.length; j++) {
        const b = this.sheep[j];
        if (b.penned) continue;
        const dx = b.sprite.x - a.sprite.x;
        const dy = b.sprite.y - a.sprite.y;
        const dist = Math.hypot(dx, dy);
        if (dist < minSep && dist > 0.01) {
          const push = (minSep - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.sprite.x -= nx * push;
          a.sprite.y -= ny * push;
          b.sprite.x += nx * push;
          b.sprite.y += ny * push;
        }
      }
    }
  }

  private isInCliff(x: number): boolean {
    return x > this.cliffX;
  }

  private toggleDebugPanel(): void {
    if (this.debugPanel) {
      this.debugPanel.remove();
      this.debugPanel = null;
    } else {
      this.buildDebugPanel();
    }
  }

  private buildDebugPanel(): void {
    const panel = document.createElement("div");
    this.debugPanel = panel;
    panel.style.cssText =
      "position:fixed;top:70px;right:0;width:280px;max-height:calc(100vh - 90px);" +
      "overflow-y:auto;background:rgba(10,10,20,0.93);color:#ddd;font:12px monospace;" +
      "padding:10px;border-left:2px solid #446;z-index:9999;box-sizing:border-box;";

    const title = document.createElement("div");
    title.textContent = "Sheep Debug  [ENTER to close]";
    title.style.cssText =
      "font-size:13px;font-weight:bold;color:#adf;margin-bottom:10px;";
    panel.appendChild(title);

    const params: Array<{
      label: string;
      get: () => number;
      set: (v: number) => void;
      min: number;
      max: number;
      step: number;
    }> = [
      {
        label: "Max Speed",
        get: () => SHEEP_MAX_SPEED,
        set: (v) => {
          SHEEP_MAX_SPEED = v;
        },
        min: 0,
        max: 800,
        step: 5,
      },
      {
        label: "Scared Max Speed",
        get: () => SHEEP_SCARED_MAX_SPEED,
        set: (v) => {
          SHEEP_SCARED_MAX_SPEED = v;
        },
        min: 0,
        max: 800,
        step: 5,
      },
      {
        label: "Damping",
        get: () => SHEEP_DAMPING,
        set: (v) => {
          SHEEP_DAMPING = v;
        },
        min: 0.8,
        max: 0.999,
        step: 0.001,
      },
      {
        label: "Scared Damping",
        get: () => SHEEP_SCARED_DAMPING,
        set: (v) => {
          SHEEP_SCARED_DAMPING = v;
        },
        min: 0.8,
        max: 0.999,
        step: 0.001,
      },
      {
        label: "Wander Force",
        get: () => SHEEP_WANDER_FORCE,
        set: (v) => {
          SHEEP_WANDER_FORCE = v;
        },
        min: 0,
        max: 400,
        step: 5,
      },
      {
        label: "Cohesion Force",
        get: () => SHEEP_COHESION_FORCE,
        set: (v) => {
          SHEEP_COHESION_FORCE = v;
        },
        min: 0,
        max: 200,
        step: 2,
      },
      {
        label: "Alignment Force",
        get: () => ALIGNMENT_FORCE,
        set: (v) => {
          ALIGNMENT_FORCE = v;
        },
        min: 0,
        max: 300,
        step: 5,
      },
      {
        label: "Whistle Impulse",
        get: () => WHISTLE_IMPULSE,
        set: (v) => {
          WHISTLE_IMPULSE = v;
        },
        min: 0,
        max: 2000,
        step: 25,
      },
      {
        label: "Flee Force",
        get: () => FLEE_FORCE,
        set: (v) => {
          FLEE_FORCE = v;
        },
        min: 0,
        max: 1000,
        step: 10,
      },
      {
        label: "Fear Radius",
        get: () => FEAR_RADIUS,
        set: (v) => {
          FEAR_RADIUS = v;
        },
        min: 0,
        max: 500,
        step: 5,
      },
      {
        label: "Panic Inherit",
        get: () => PANIC_INHERIT,
        set: (v) => {
          PANIC_INHERIT = v;
        },
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        label: "Cliff Drift",
        get: () => CLIFF_DRIFT_FORCE,
        set: (v) => {
          CLIFF_DRIFT_FORCE = v;
        },
        min: 0,
        max: 200,
        step: 5,
      },
      {
        label: "Turn Rate",
        get: () => SHEEP_TURN_RATE,
        set: (v) => {
          SHEEP_TURN_RATE = v;
        },
        min: 0.5,
        max: 15,
        step: 0.5,
      },
    ];

    for (const cfg of params) {
      const row = document.createElement("div");
      row.style.marginBottom = "7px";

      const labelRow = document.createElement("div");
      labelRow.style.cssText =
        "display:flex;justify-content:space-between;margin-bottom:2px;";
      const lbl = document.createElement("span");
      lbl.textContent = cfg.label;
      const val = document.createElement("span");
      val.style.color = "#fa8";
      val.textContent =
        cfg.step < 0.01 ? cfg.get().toFixed(3) : String(cfg.get());
      labelRow.appendChild(lbl);
      labelRow.appendChild(val);

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(cfg.min);
      slider.max = String(cfg.max);
      slider.step = String(cfg.step);
      slider.value = String(cfg.get());
      slider.style.cssText = "width:100%;cursor:pointer;accent-color:#6af;";
      slider.addEventListener("input", () => {
        const v = parseFloat(slider.value);
        cfg.set(v);
        val.textContent = cfg.step < 0.01 ? v.toFixed(3) : String(v);
      });

      row.appendChild(labelRow);
      row.appendChild(slider);
      panel.appendChild(row);
    }

    document.body.appendChild(panel);
  }

  shutdown(): void {
    this.debugPanel?.remove();
    this.debugPanel = null;
  }
}
