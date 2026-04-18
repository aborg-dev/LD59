import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";
import mapData from "./shepherd-map.json";

const GRID_COLS = 4;
const GRID_ROWS = 4;
const ROOM_W = 1600;
const ROOM_H = 800;
const WORLD_W = ROOM_W * GRID_COLS; // 6400
const WORLD_H = ROOM_H * GRID_ROWS; // 3200

const HUD_TOP_H = 70;
const HUD_BOTTOM_H = 80;

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
let SHEEP_TURN_RATE = 4.5; // radians per second; limits how fast a sheep can change direction
const PANIC_RADIUS = 90;
let PANIC_INHERIT = 0.7;

const WHISTLE_RADIUS = 260;
let WHISTLE_IMPULSE = 750;
const WHISTLE_COOLDOWN_MS = 700;
const WHISTLE_SCARED_MS = 700;
let SHEEP_SCARED_MAX_SPEED = 300;
let SHEEP_SCARED_DAMPING = 0.975;

const DOG_RADIUS = 22;
const DOG_SPEED = 950;
let FEAR_RADIUS = 180;
let FLEE_FORCE = 520;

const BELT_COST = 5;
const BELT_LONG = 180;
const BELT_SHORT = 80;
const BELT_FORCE = 600;

const BELT_ARROWS: Record<"up" | "down" | "left" | "right", string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

function beltDims(dir: "up" | "down" | "left" | "right"): {
  w: number;
  h: number;
} {
  const horizontal = dir === "left" || dir === "right";
  return {
    w: horizontal ? BELT_LONG : BELT_SHORT,
    h: horizontal ? BELT_SHORT : BELT_LONG,
  };
}

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

type BeltDir = "up" | "down" | "left" | "right";

interface Belt {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: BeltDir;
  gfx: Phaser.GameObjects.Rectangle;
  arrow: Phaser.GameObjects.Text;
}

type PlacingMode = null | BeltDir;

interface MapTree {
  x: number;
  y: number;
  r: number;
}

export interface ShepherdSceneState {
  active: boolean;
  dog: { x: number; y: number };
  sheep: { x: number; y: number; penned: boolean }[];
  pen: { x: number; y: number; radius: number };
  belts: { x: number; y: number; w: number; h: number; dir: BeltDir }[];
  score: number;
  coins: number;
  placing: PlacingMode;
  wave: {
    number: number;
    phase: "prep" | "active";
    size: number;
    remainingToSpawn: number;
  };
  whistleCooldownMs: number;
  viewport: { width: number; height: number };
}

export class ShepherdScene extends Phaser.Scene {
  private dog!: Phaser.GameObjects.Arc;
  private targetX = 0;
  private targetY = 0;
  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private arrowKeys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private sheep: Sheep[] = [];
  private belts: Belt[] = [];
  private score = 0;
  private coins = 0;
  private accumulator = 0;
  private gameOver = false;
  private whistleCooldownMs = 0;
  private whistleRing!: Phaser.GameObjects.Arc;
  private placing: PlacingMode = null;
  private placePreview!: Phaser.GameObjects.Rectangle;
  private placePreviewArrow!: Phaser.GameObjects.Text;

  // Wave state
  private waveNumber = 1;
  private wavePhase: "prep" | "active" = "prep";
  private sheepToSpawn = 0;
  private waveSpawnOrigin = { x: 0, y: 0 };
  private waveSize = 0;
  private sheepLost = 0;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerTween?: Phaser.Tweens.Tween;

  private penX = 0;
  private penY = 0;
  private penR = PEN_RADIUS;

  private coinText!: Phaser.GameObjects.Text;
  private beltBtns: Partial<Record<BeltDir, Phaser.GameObjects.Text>> = {};

  private fieldTop = 0;
  private fieldBottom = 0;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  private debugPanel: HTMLDivElement | null = null;
  private mapTrees: MapTree[] = [];
  private mapSpawns: { x: number; y: number }[] = [];
  private camX = 0;
  private camY = 0;
  private roomCol = 0;
  private roomRow = 0;

  constructor() {
    super("Shepherd");
  }

  create(): void {
    const { width, height } = this.scale;
    this.fieldTop = HUD_TOP_H;
    this.fieldBottom = height - HUD_BOTTOM_H;

    this.score = 0;
    this.coins = 0;
    this.accumulator = 0;
    this.gameOver = false;
    this.whistleCooldownMs = 0;
    this.sheep = [];
    this.belts = [];
    this.placing = null;
    this.waveNumber = 1;
    this.wavePhase = "prep";
    this.sheepToSpawn = 0;
    this.waveSize = 0;
    this.sheepLost = 0;

    this.hudCamera = this.cameras.add(0, 0, width, height);
    this.whistleCooldownMs = 0;

    // Grass background — large so it fills the view when zoomed out
    const bg = this.add
      .rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x4a8c3a)
      .setDepth(0);
    this.hudCamera.ignore(bg);

    // Pen in room (1,1) — second column, second row
    this.penX = 1.5 * ROOM_W;
    this.penY = 1.5 * ROOM_H;

    // Camera starts on the pen room, locked; transitions on room crossing
    this.roomCol = 1;
    this.roomRow = 1;
    this.camX = this.penX;
    this.camY = this.penY;
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

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

    // Load map objects
    this.mapTrees = mapData.trees as MapTree[];
    this.mapSpawns = mapData.spawns;

    // Render trees (one graphics object for all)
    const treeColors = [0x3a8228, 0x4a9a30, 0x357020];
    const treeGfx = this.add.graphics().setDepth(2);
    for (let i = 0; i < this.mapTrees.length; i++) {
      const t = this.mapTrees[i];
      const col = treeColors[i % treeColors.length];
      // Shadow
      treeGfx.fillStyle(0x1e4a10, 0.5);
      treeGfx.fillCircle(t.x + t.r * 0.25, t.y + t.r * 0.25, t.r);
      // Canopy
      treeGfx.fillStyle(col, 1);
      treeGfx.fillCircle(t.x, t.y, t.r);
      // Highlight
      treeGfx.fillStyle(0x7acc50, 0.45);
      treeGfx.fillCircle(t.x - t.r * 0.28, t.y - t.r * 0.28, t.r * 0.45);
    }
    this.hudCamera.ignore(treeGfx);

    // Dog starts next to the pen
    this.dog = this.add
      .circle(this.penX, this.penY + this.penR + 80, DOG_RADIUS, 0x222222)
      .setDepth(10);
    this.dog.setStrokeStyle(2, 0xffffff);
    this.hudCamera.ignore(this.dog);
    this.targetX = this.dog.x;
    this.targetY = this.dog.y;

    // WASD + arrow keys to drive the dog
    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = {
        up: kb.addKey(K.W),
        down: kb.addKey(K.S),
        left: kb.addKey(K.A),
        right: kb.addKey(K.D),
      };
      this.arrowKeys = {
        up: kb.addKey(K.UP),
        down: kb.addKey(K.DOWN),
        left: kb.addKey(K.LEFT),
        right: kb.addKey(K.RIGHT),
      };
    }

    // Whistle visualization (hidden by default, positioned on each whistle)
    this.whistleRing = this.add
      .circle(0, 0, WHISTLE_RADIUS, 0xffffff, 0.0)
      .setDepth(9);
    this.whistleRing.setStrokeStyle(3, 0xffff88, 0);
    this.hudCamera.ignore(this.whistleRing);

    // Belt placement preview (hidden until placing mode)
    this.placePreview = this.add
      .rectangle(0, 0, BELT_LONG, BELT_SHORT, 0x4a4a55, 0.35)
      .setDepth(4);
    this.placePreview.setStrokeStyle(2, 0xaaaaff, 0.8);
    this.placePreview.setVisible(false);
    this.hudCamera.ignore(this.placePreview);

    this.placePreviewArrow = this.add
      .text(0, 0, "", {
        fontFamily: FONT_UI,
        fontSize: 40,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(5);
    this.placePreviewArrow.setVisible(false);
    this.hudCamera.ignore(this.placePreviewArrow);

    this.input.keyboard?.on("keydown-SPACE", () =>
      this.whistle(this.dog.x, this.dog.y),
    );
    this.input.keyboard?.on("keydown-ENTER", () => this.toggleDebugPanel());

    // Mouse movement steers the dog; click barks from the dog's position.
    // In belt-placing mode, click drops a conveyor belt.
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      if (p.y > this.fieldBottom) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      if (this.placing) {
        this.tryPlaceBelt(wp.x, wp.y, this.placing);
        return;
      }
      this.whistle(this.dog.x, this.dog.y);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      if (!this.placing) {
        if (p.y <= this.fieldBottom) {
          const wp = this.cameras.main.getWorldPoint(p.x, p.y);
          this.targetX = wp.x;
          this.targetY = wp.y;
        }
        this.placePreview.setVisible(false);
        this.placePreviewArrow.setVisible(false);
        return;
      }
      if (p.y > this.fieldBottom) {
        this.placePreview.setVisible(false);
        this.placePreviewArrow.setVisible(false);
        return;
      }
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      const { w, h } = beltDims(this.placing);
      this.placePreview.setVisible(true);
      this.placePreview.setSize(w, h);
      this.placePreview.setPosition(wp.x, wp.y);
      this.placePreviewArrow.setVisible(true);
      this.placePreviewArrow.setPosition(wp.x, wp.y);
      this.placePreviewArrow.setText(BELT_ARROWS[this.placing]);
      const ok = this.canPlaceBelt(wp.x, wp.y, this.placing);
      this.placePreview.setFillStyle(ok ? 0x4a4a55 : 0xaa4444, 0.35);
      this.placePreview.setStrokeStyle(2, ok ? 0xaaaaff : 0xff8888, 0.8);
    });

    // --- Top HUD: coins | wave ---
    const hudTopBar = this.add
      .rectangle(width / 2, 0, width, HUD_TOP_H, 0x111122)
      .setOrigin(0.5, 0)
      .setDepth(100);
    this.cameras.main.ignore(hudTopBar);

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

    const dirs: BeltDir[] = ["up", "down", "left", "right"];
    const baseX = width * 0.12;
    const spacing = width * 0.11;
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      const btn = this.add
        .text(baseX + i * spacing, btnY, `${BELT_ARROWS[dir]} $${BELT_COST}`, {
          ...btnStyle,
          backgroundColor: "#3a3a55",
          fontSize: 26,
        })
        .setOrigin(0.5)
        .setDepth(101)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerdown", () => this.togglePlacing(dir));
      this.cameras.main.ignore(btn);
      this.beltBtns[dir] = btn;
    }

    const menuBtn = this.add
      .text(width * 0.85, btnY, "MENU", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    menuBtn.on("pointerdown", () => {
      this.sound.play("pop");
      this.endGame();
    });
    this.cameras.main.ignore(menuBtn);
  }

  private togglePlacing(dir: BeltDir): void {
    if (this.gameOver) return;
    this.placing = this.placing === dir ? null : dir;
    if (!this.placing) {
      this.placePreview.setVisible(false);
      this.placePreviewArrow.setVisible(false);
    }
    for (const d of ["up", "down", "left", "right"] as BeltDir[]) {
      const btn = this.beltBtns[d];
      btn?.setBackgroundColor(this.placing === d ? "#7a7acc" : "#3a3a55");
    }
    this.sound.play("pop");
  }

  private canPlaceBelt(x: number, y: number, dir: BeltDir): boolean {
    if (this.coins < BELT_COST) return false;
    const { w, h } = beltDims(dir);
    if (x - w / 2 < 50) return false;
    if (x + w / 2 > WORLD_W - 50) return false;
    if (y - h / 2 < 50) return false;
    if (y + h / 2 > WORLD_H - 50) return false;
    // Can't overlap the pen
    if (Math.hypot(x - this.penX, y - this.penY) < this.penR + 40) return false;
    // Stay clear of existing belts (distance between centers)
    for (const b of this.belts) {
      if (Math.abs(x - b.x) < (w + b.w) / 2 - 4) {
        if (Math.abs(y - b.y) < (h + b.h) / 2 - 4) return false;
      }
    }
    return true;
  }

  private tryPlaceBelt(x: number, y: number, dir: BeltDir): void {
    if (!this.canPlaceBelt(x, y, dir)) {
      this.sound.play("pop");
      return;
    }
    this.coins -= BELT_COST;
    this.updateCoinText();

    const { w, h } = beltDims(dir);
    const gfx = this.add.rectangle(x, y, w, h, 0x4a4a55, 0.7).setDepth(3);
    gfx.setStrokeStyle(2, 0x222228);
    this.hudCamera.ignore(gfx);

    const arrow = this.add
      .text(x, y, BELT_ARROWS[dir], {
        fontFamily: FONT_UI,
        fontSize: 44,
        color: "#ffe099",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(4);
    this.hudCamera.ignore(arrow);

    this.belts.push({ x, y, w, h, dir, gfx, arrow });
    this.sound.play("score");
  }

  private updateCoinText(): void {
    this.coinText.setText(`$${this.coins}`);
  }

  private spawnSheep(): void {
    // Scatter around the wave's shared spawn origin so the flock arrives as a group
    const jitter = 60;
    const sx = this.waveSpawnOrigin.x + Phaser.Math.Between(-jitter, jitter);
    const sy = this.waveSpawnOrigin.y + Phaser.Math.Between(-jitter, jitter);

    // Initial velocity pointing away from the pen
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
        const fleeAngle = Math.atan2(dy, dx);
        const dot = Math.cos(s.angle - fleeAngle); // 1 = facing away, -1 = facing toward
        const k = (1 - d / WHISTLE_RADIUS) * WHISTLE_IMPULSE;
        if (dot > 0) {
          // Already facing roughly away — accelerate along current heading
          s.vx += Math.cos(s.angle) * k;
          s.vy += Math.sin(s.angle) * k;
        } else {
          // Facing toward the bark — brake hard, nudge flee dir so turn model can pivot
          s.vx = s.vx * 0.15 + Math.cos(fleeAngle) * k * 0.2;
          s.vy = s.vy * 0.15 + Math.sin(fleeAngle) * k * 0.2;
        }
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
   * Belt force — any sheep inside a belt's rectangle gets a constant push
   * in the belt's direction.
   */
  private beltForce(sx: number, sy: number): { ax: number; ay: number } {
    let ax = 0;
    let ay = 0;
    for (const b of this.belts) {
      if (Math.abs(sx - b.x) > b.w / 2) continue;
      if (Math.abs(sy - b.y) > b.h / 2) continue;
      switch (b.dir) {
        case "up":
          ay -= BELT_FORCE;
          break;
        case "down":
          ay += BELT_FORCE;
          break;
        case "left":
          ax -= BELT_FORCE;
          break;
        case "right":
          ax += BELT_FORCE;
          break;
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
    return {
      active: this.scene.isActive(),
      dog: { x: this.dog.x, y: this.dog.y },
      sheep: this.sheep.map((s) => ({
        x: s.sprite.x,
        y: s.sprite.y,
        penned: s.penned,
      })),
      pen: { x: this.penX, y: this.penY, radius: this.penR },
      belts: this.belts.map((b) => ({
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        dir: b.dir,
      })),
      score: this.score,
      coins: this.coins,
      placing: this.placing,
      wave: {
        number: this.waveNumber,
        phase: this.wavePhase,
        size: this.waveSize,
        remainingToSpawn: this.sheepToSpawn,
      },
      whistleCooldownMs: this.whistleCooldownMs,
      viewport: { width: this.scale.width, height: this.scale.height },
    };
  }

  private static readonly stepMs = 16.666;
  private static readonly stepSec = ShepherdScene.stepMs / 1000;

  private updateZoom(): void {
    const { width } = this.scale;
    const fieldH = this.fieldBottom - this.fieldTop;
    // Fit one full room on screen; a sliver of adjacent rooms may show at edges.
    const zoom = Math.min(width / ROOM_W, fieldH / ROOM_H);
    this.cameras.main.setZoom(zoom);

    // Switch displayed room when the dog crosses a boundary
    const dogCol = Phaser.Math.Clamp(Math.floor(this.dog.x / ROOM_W), 0, GRID_COLS - 1);
    const dogRow = Phaser.Math.Clamp(Math.floor(this.dog.y / ROOM_H), 0, GRID_ROWS - 1);
    if (dogCol !== this.roomCol || dogRow !== this.roomRow) {
      this.roomCol = dogCol;
      this.roomRow = dogRow;
    }

    // Slide camera toward current room center
    const targetX = (this.roomCol + 0.5) * ROOM_W;
    const targetY = (this.roomRow + 0.5) * ROOM_H;
    this.camX += (targetX - this.camX) * 0.12;
    this.camY += (targetY - this.camY) * 0.12;
    this.cameras.main.centerOn(this.camX, this.camY);
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
    this.wavePhase = "active";
    this.showBanner(`Wave ${this.waveNumber}!`);
    this.waveSpawnOrigin = this.pickSpawnOrigin();
    for (let i = 0; i < cfg.size; i++) this.spawnSheep();
  }

  private pickSpawnOrigin(): { x: number; y: number } {
    const idx = Phaser.Math.Between(0, this.mapSpawns.length - 1);
    return { ...this.mapSpawns[idx] };
  }

  private completeWave(): void {
    if (this.gameOver) return;
    this.gameOver = true; // stop step() loop so this can't fire again
    const perfect = this.sheepLost === 0;
    if (perfect) {
      this.coins += WAVE_CLEAR_BONUS;
      this.updateCoinText();
    }
    this.sound.play("score");
    this.showBanner(
      perfect
        ? `Cleared! No sheep lost! +$${WAVE_CLEAR_BONUS}`
        : `Cleared! (Lost ${this.sheepLost} sheep, no bonus)`,
    );
    this.clearPennedSheep();
    this.time.delayedCall(1500, () => {
      this.scene.start("GameOver", {
        score: this.score,
        returnScene: "Shepherd",
      });
    });
  }

  /** Pop the sheep and emit a small ring when it crosses into the pen. */
  private playPenEntryFx(s: Sheep): void {
    // Color settles into the "penned" gold over a short tween rather than snapping.
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 260,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        const r = Math.round(250 + (255 - 250) * t); // 0xfa → 0xff
        const g = Math.round(250 + (224 - 250) * t); // 0xfa → 0xe0
        const b = Math.round(250 + (153 - 250) * t); // 0xfa → 0x99
        s.sprite.setFillStyle((r << 16) | (g << 8) | b);
      },
    });
    // Scale pop — brief squash-and-stretch as the sheep settles.
    this.tweens.add({
      targets: s.sprite,
      scale: 1.3,
      duration: 120,
      yoyo: true,
      ease: "Quad.easeOut",
    });
    // Expanding ring emitted from the sheep's position.
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

  /** Retire all penned sheep with a quick fade-out so the pen is ready for the next wave. */
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

  private step(): void {
    const dt = ShepherdScene.stepSec;
    const dtMs = dt * 1000;

    if (this.whistleCooldownMs > 0) {
      this.whistleCooldownMs = Math.max(0, this.whistleCooldownMs - dtMs);
    }

    if (this.wavePhase === "prep") {
      this.startWave();
    } else {
      // Wave clear? (all penned)
      const unpenned = this.sheep.filter((s) => !s.penned).length;
      if (unpenned === 0) {
        this.completeWave();
        return;
      }
    }

    // Dog movement — keyboard overrides tap target when held
    let kx = 0;
    let ky = 0;
    if (this.keys && this.arrowKeys) {
      if (this.keys.left.isDown || this.arrowKeys.left.isDown) kx -= 1;
      if (this.keys.right.isDown || this.arrowKeys.right.isDown) kx += 1;
      if (this.keys.up.isDown || this.arrowKeys.up.isDown) ky -= 1;
      if (this.keys.down.isDown || this.arrowKeys.down.isDown) ky += 1;
    }
    if (kx !== 0 || ky !== 0) {
      const klen = Math.hypot(kx, ky);
      const step = DOG_SPEED * dt;
      this.dog.x += (kx / klen) * step;
      this.dog.y += (ky / klen) * step;
      this.targetX = this.dog.x;
      this.targetY = this.dog.y;
    } else {
      const ddx = this.targetX - this.dog.x;
      const ddy = this.targetY - this.dog.y;
      const dDist = Math.hypot(ddx, ddy);
      if (dDist > 2) {
        const move = Math.min(dDist, DOG_SPEED * dt);
        this.dog.x += (ddx / dDist) * move;
        this.dog.y += (ddy / dDist) * move;
      }
    }
    // Clamp dog to world bounds
    this.dog.x = Phaser.Math.Clamp(this.dog.x, DOG_RADIUS, WORLD_W - DOG_RADIUS);
    this.dog.y = Phaser.Math.Clamp(this.dog.y, DOG_RADIUS, WORLD_H - DOG_RADIUS);

    // Push dog out of trees
    for (const t of this.mapTrees) {
      const tdx = this.dog.x - t.x;
      const tdy = this.dog.y - t.y;
      const td = Math.hypot(tdx, tdy);
      const minDist = t.r + DOG_RADIUS;
      if (td < minDist && td > 0.01) {
        const push = minDist - td;
        this.dog.x += (tdx / td) * push;
        this.dog.y += (tdy / td) * push;
      }
    }

    // Sheep behavior
    for (let i = 0; i < this.sheep.length; i++) {
      const s = this.sheep[i];
      if (s.penned) continue;

      let ax = 0;
      let ay = 0;

      // Flee from dog
      const fdx = s.sprite.x - this.dog.x;
      const fdy = s.sprite.y - this.dog.y;
      const fd = Math.hypot(fdx, fdy);
      if (fd < FEAR_RADIUS && fd > 0.01) {
        const strength = (1 - fd / FEAR_RADIUS) * FLEE_FORCE;
        ax += (fdx / fd) * strength;
        ay += (fdy / fd) * strength;
      }

      // Conveyor belts shove any sheep standing on them in the belt's direction.
      const belt = this.beltForce(s.sprite.x, s.sprite.y);
      ax += belt.ax;
      ay += belt.ay;

      // Separation from other sheep
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

      // Flock: cohesion + alignment + panic contagion in one neighbour pass
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
        // Panic spreads through the flock like a wave
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

      // Wander/graze — only when isolated (flock members follow alignment instead)
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

      // Scared tick (set by whistle)
      if (s.scaredMs > 0) s.scaredMs = Math.max(0, s.scaredMs - dtMs);
      const scared = s.scaredMs > 0;
      const damping = scared ? SHEEP_SCARED_DAMPING : SHEEP_DAMPING;
      const maxSpeed = scared ? SHEEP_SCARED_MAX_SPEED : SHEEP_MAX_SPEED;

      // Desired velocity from forces
      const desiredVx = (s.vx + ax * dt) * damping;
      const desiredVy = (s.vy + ay * dt) * damping;
      const desiredSpd = Math.hypot(desiredVx, desiredVy);

      // Heading turns toward desired direction at a limited rate
      if (desiredSpd > 2) {
        let diff = Math.atan2(desiredVy, desiredVx) - s.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = (scared ? SHEEP_TURN_RATE * 5 : SHEEP_TURN_RATE) * dt;
        s.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
      }

      // Velocity strictly along heading
      const clampedSpd = Math.min(desiredSpd, maxSpeed);
      s.vx = Math.cos(s.angle) * clampedSpd;
      s.vy = Math.sin(s.angle) * clampedSpd;

      s.sprite.x += s.vx * dt;
      s.sprite.y += s.vy * dt;
      s.sprite.rotation = s.angle;

      // World bounds — reflect angle off edges
      if (s.sprite.x < SHEEP_RADIUS) {
        s.sprite.x = SHEEP_RADIUS;
        s.angle = Math.PI - s.angle;
      } else if (s.sprite.x > WORLD_W - SHEEP_RADIUS) {
        s.sprite.x = WORLD_W - SHEEP_RADIUS;
        s.angle = Math.PI - s.angle;
      }
      if (s.sprite.y < SHEEP_RADIUS) {
        s.sprite.y = SHEEP_RADIUS;
        s.angle = -s.angle;
      } else if (s.sprite.y > WORLD_H - SHEEP_RADIUS) {
        s.sprite.y = WORLD_H - SHEEP_RADIUS;
        s.angle = -s.angle;
      }
      // Resync velocity to heading after any bounce
      {
        const spd = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(s.angle) * spd;
        s.vy = Math.sin(s.angle) * spd;
      }

      // Tree collisions — push out and reflect off canopy
      for (const t of this.mapTrees) {
        const tdx = s.sprite.x - t.x;
        const tdy = s.sprite.y - t.y;
        const td = Math.hypot(tdx, tdy);
        const minDist = t.r + SHEEP_RADIUS;
        if (td < minDist && td > 0.01) {
          const nx = tdx / td;
          const ny = tdy / td;
          s.sprite.x = t.x + nx * minDist;
          s.sprite.y = t.y + ny * minDist;
          const dot = Math.cos(s.angle) * nx + Math.sin(s.angle) * ny;
          if (dot < 0) {
            s.angle = Math.atan2(
              Math.sin(s.angle) - 2 * dot * ny,
              Math.cos(s.angle) - 2 * dot * nx,
            );
            const spd = Math.hypot(s.vx, s.vy) * 0.6;
            s.vx = Math.cos(s.angle) * spd;
            s.vy = Math.sin(s.angle) * spd;
          }
        }
      }

      // Pen check — sheep center fully inside the pen circle
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

    // Positional overlap resolution — push overlapping sheep apart directly
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
