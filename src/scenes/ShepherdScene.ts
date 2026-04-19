import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";
import mapData from "./shepherd-map.json";

const GRID_COLS = 4;
const GRID_ROWS = 4;
const ROOM_W = 1600;
const ROOM_H = 800;
const WORLD_W = ROOM_W * GRID_COLS;
const WORLD_H = ROOM_H * GRID_ROWS;

const HUD_TOP_H = 70;
const HUD_BOTTOM_H = 80;

const PEN_RADIUS = 120;
const SHEEP_RADIUS = 36;
const MAX_SHEEP = 30;
const SPAWN_INTERVAL_MS = 3000;

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

const DOG_RADIUS = 22;
const DOG_SPEED = 350;
const HERD_OFFSET = 120;
let FEAR_RADIUS = 180;
let FLEE_FORCE = 520;

const DRAG_SCALE = 1.4;

interface Sheep {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  angle: number;
  penned: boolean;
  grazing: boolean;
  modeT: number;
  wanderAngle: number;
  scaredMs: number;
  dragged: boolean;
}

interface Dog {
  sprite: Phaser.GameObjects.Arc;
  targetSheep: Sheep | null;
  dragged: boolean;
}

type Drag =
  | { kind: "sheep"; ref: Sheep; shadow: Phaser.GameObjects.Ellipse }
  | { kind: "dog"; ref: Dog; shadow: Phaser.GameObjects.Ellipse };

interface Pen {
  x: number;
  y: number;
  r: number;
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

interface MapTree {
  x: number;
  y: number;
  r: number;
}

export interface ShepherdSceneState {
  active: boolean;
  dogs: { x: number; y: number; dragged: boolean }[];
  sheep: { x: number; y: number; penned: boolean; dragged: boolean }[];
  pens: { x: number; y: number; radius: number }[];
  placingPen: boolean;
  dragging: "sheep" | "dog" | null;
  score: number;
  coins: number;
  viewport: { width: number; height: number };
}

export class ShepherdScene extends Phaser.Scene {
  private dogs: Dog[] = [];
  private sheep: Sheep[] = [];
  private drag: Drag | null = null;
  private score = 0;
  private coins = 0;
  private accumulator = 0;

  private pens: Pen[] = [];

  private coinText!: Phaser.GameObjects.Text;
  private dogCountText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerTween?: Phaser.Tweens.Tween;
  private dogBuyCost = 5;
  private penBuyCost = 25;
  private dogBuyBtn!: Phaser.GameObjects.Text;
  private penBuyBtn!: Phaser.GameObjects.Text;
  private placingPen = false;
  private penGhost!: Phaser.GameObjects.Arc;

  private fieldTop = 0;
  private fieldBottom = 0;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  private mapTrees: MapTree[] = [];
  private mapSpawns: { x: number; y: number }[] = [];

  // Debug/editor state
  private debugPanel: HTMLDivElement | null = null;
  private editorActive = false;
  private editorTool: "tree" | "spawn" = "tree";
  private editorTreeRadius = 60;
  private editorGfx!: Phaser.GameObjects.Graphics;
  private editorCursorGfx!: Phaser.GameObjects.Graphics;
  private editorPanel: HTMLDivElement | null = null;
  private editorPointerWorld = { x: 0, y: 0 };

  constructor() {
    super("Shepherd");
  }

  create(): void {
    const { width, height } = this.scale;
    this.fieldTop = HUD_TOP_H;
    this.fieldBottom = height - HUD_BOTTOM_H;

    this.score = 0;
    this.coins = 5;
    this.accumulator = 0;
    this.dogs = [];
    this.sheep = [];
    this.pens = [];
    this.drag = null;
    this.placingPen = false;
    this.dogBuyCost = 5;
    this.penBuyCost = 25;

    this.hudCamera = this.cameras.add(0, 0, width, height);

    // Grass background
    const bg = this.add
      .rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x4a8c3a)
      .setDepth(0);
    this.hudCamera.ignore(bg);

    // Initial pen in room (1,1)
    this.createPen(1.5 * ROOM_W, 1.5 * ROOM_H);

    // Ghost preview used while placing a new pen
    this.penGhost = this.add
      .circle(0, 0, PEN_RADIUS, 0x8b5a2b, 0.18)
      .setDepth(3)
      .setVisible(false);
    this.penGhost.setStrokeStyle(3, 0xffe099, 0.7);
    this.hudCamera.ignore(this.penGhost);

    // Load map objects
    this.mapTrees = mapData.trees as MapTree[];
    this.mapSpawns = mapData.spawns;

    // Render trees
    const treeColors = [0x3a8228, 0x4a9a30, 0x357020];
    const treeGfx = this.add.graphics().setDepth(2);
    for (let i = 0; i < this.mapTrees.length; i++) {
      const t = this.mapTrees[i];
      const col = treeColors[i % treeColors.length];
      treeGfx.fillStyle(0x1e4a10, 0.5);
      treeGfx.fillCircle(t.x + t.r * 0.25, t.y + t.r * 0.25, t.r);
      treeGfx.fillStyle(col, 1);
      treeGfx.fillCircle(t.x, t.y, t.r);
      treeGfx.fillStyle(0x7acc50, 0.45);
      treeGfx.fillCircle(t.x - t.r * 0.28, t.y - t.r * 0.28, t.r * 0.45);
    }
    this.hudCamera.ignore(treeGfx);

    this.editorGfx = this.add.graphics().setDepth(60);
    this.hudCamera.ignore(this.editorGfx);
    this.editorCursorGfx = this.add.graphics().setDepth(61);
    this.hudCamera.ignore(this.editorCursorGfx);

    this.game.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Sheep animation
    this.anims.create({
      key: "sheep-walk",
      frames: this.anims.generateFrameNumbers("sheep", { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    });

    // Pointer handlers: pen placement, drag-to-move sheep/dogs
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.editorActive) {
        this.editorHandlePointerDown(p);
        return;
      }
      if (p.y > this.fieldBottom) return;
      if (p.y < this.fieldTop) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      if (this.placingPen) {
        if (p.button === 2) this.cancelPenPlacement();
        else this.placePenAt(wp.x, wp.y);
        return;
      }
      this.tryStartDrag(wp.x, wp.y);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      if (this.editorActive) this.editorPointerWorld = { x: wp.x, y: wp.y };
      if (this.placingPen) this.penGhost.setPosition(wp.x, wp.y);
      if (this.drag) this.updateDragPosition(wp.x, wp.y);
    });
    this.input.on("pointerup", () => {
      if (this.drag) this.endDrag();
    });
    this.input.on("pointerupoutside", () => {
      if (this.drag) this.endDrag();
    });

    this.input.keyboard?.on("keydown-ENTER", () => this.toggleDebugPanel());
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.placingPen) this.cancelPenPlacement();
    });

    // --- Top HUD ---
    const hudTopBar = this.add
      .rectangle(width / 2, 0, width, HUD_TOP_H, 0x111122)
      .setOrigin(0.5, 0)
      .setDepth(100);
    this.cameras.main.ignore(hudTopBar);

    this.coinText = this.add
      .text(width / 2 - 120, HUD_TOP_H / 2, `$${this.coins}`, {
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

    this.dogCountText = this.add
      .text(width / 2 + 120, HUD_TOP_H / 2, `Dogs: ${this.dogs.length}`, {
        fontFamily: FONT_UI,
        fontSize: 32,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(101);
    this.cameras.main.ignore(this.dogCountText);

    // Banner
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

    // --- Bottom HUD ---
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

    this.dogBuyBtn = this.add
      .text(width * 0.15, btnY, "", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.dogBuyBtn.on("pointerdown", () => this.buyDog());
    this.cameras.main.ignore(this.dogBuyBtn);

    this.penBuyBtn = this.add
      .text(width * 0.35, btnY, "", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.penBuyBtn.on("pointerdown", () => this.startPenPlacement());
    this.cameras.main.ignore(this.penBuyBtn);

    this.updateShopButtons();

    // Continuous sheep spawning
    this.time.addEvent({
      delay: SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => {
        const unpenned = this.sheep.filter((s) => !s.penned).length;
        if (unpenned >= MAX_SHEEP) return;
        if (this.mapSpawns.length === 0) return;
        const sp =
          this.mapSpawns[Phaser.Math.Between(0, this.mapSpawns.length - 1)];
        this.spawnSheep(sp.x, sp.y);
      },
    });

    // Spawn a few sheep initially
    for (let i = 0; i < 5 && i < this.mapSpawns.length; i++) {
      const sp = this.mapSpawns[i];
      this.spawnSheep(sp.x, sp.y);
    }

    this.updateDogCountText();

    // Set camera zoomed out to fit entire world
    this.updateCamera();

    this.showBanner("Drag sheep and dogs to move them!");
  }

  private spawnDog(x: number, y: number): void {
    const sprite = this.add.circle(x, y, DOG_RADIUS, 0x222222).setDepth(10);
    sprite.setStrokeStyle(2, 0xffffff);
    this.hudCamera.ignore(sprite);

    this.dogs.push({
      sprite,
      targetSheep: null,
      dragged: false,
    });
    this.updateDogCountText();
  }

  private tryStartDrag(x: number, y: number): void {
    let best:
      | { kind: "sheep"; ref: Sheep; dist: number }
      | { kind: "dog"; ref: Dog; dist: number }
      | null = null;

    for (const s of this.sheep) {
      if (s.penned) continue;
      const d = Math.hypot(s.sprite.x - x, s.sprite.y - y);
      if (d <= SHEEP_RADIUS && (!best || d < best.dist)) {
        best = { kind: "sheep", ref: s, dist: d };
      }
    }
    for (const dog of this.dogs) {
      const d = Math.hypot(dog.sprite.x - x, dog.sprite.y - y);
      if (d <= DOG_RADIUS && (!best || d < best.dist)) {
        best = { kind: "dog", ref: dog, dist: d };
      }
    }
    if (!best) return;

    const sprite = best.ref.sprite;
    const shadow = this.add
      .ellipse(
        sprite.x,
        sprite.y + 10,
        sprite.displayWidth * 0.7,
        10,
        0x000000,
        0.35,
      )
      .setDepth(sprite.depth - 0.5);
    this.hudCamera.ignore(shadow);

    if (best.kind === "sheep") {
      best.ref.dragged = true;
      best.ref.vx = 0;
      best.ref.vy = 0;
      best.ref.sprite.setScale(best.ref.sprite.scaleX * DRAG_SCALE);
      best.ref.sprite.setDepth(20);
      this.drag = { kind: "sheep", ref: best.ref, shadow };
    } else {
      best.ref.dragged = true;
      best.ref.sprite.setScale(DRAG_SCALE);
      best.ref.sprite.setDepth(20);
      this.drag = { kind: "dog", ref: best.ref, shadow };
    }
    this.updateDragPosition(x, y);
  }

  private updateDragPosition(x: number, y: number): void {
    if (!this.drag) return;
    const cx = Phaser.Math.Clamp(x, 0, WORLD_W);
    const cy = Phaser.Math.Clamp(y, 0, WORLD_H);
    const sprite = this.drag.ref.sprite;
    sprite.x = cx;
    sprite.y = cy - 12;
    this.drag.shadow.setPosition(cx, cy + 6);
  }

  private endDrag(): void {
    if (!this.drag) return;
    const sprite = this.drag.ref.sprite;
    const shadow = this.drag.shadow;
    const dropX = shadow.x;
    const dropY = shadow.y - 6;
    sprite.x = dropX;
    sprite.y = dropY;
    shadow.destroy();
    if (this.drag.kind === "sheep") {
      const s = this.drag.ref;
      s.dragged = false;
      s.sprite.setScale(s.sprite.scaleX / DRAG_SCALE);
      s.sprite.setDepth(5);
      s.scaredMs = 0;
    } else {
      const d = this.drag.ref;
      d.dragged = false;
      d.sprite.setScale(1);
      d.sprite.setDepth(10);
      d.targetSheep = null;
    }
    this.drag = null;
  }

  private updateCoinText(): void {
    this.coinText.setText(`$${this.coins}`);
    this.updateShopButtons();
  }

  private updateDogCountText(): void {
    this.dogCountText.setText(`Dogs: ${this.dogs.length}`);
  }

  private updateShopButtons(): void {
    const dogAffordable = this.coins >= this.dogBuyCost;
    this.dogBuyBtn.setText(`+Dog $${this.dogBuyCost}`);
    this.dogBuyBtn.setBackgroundColor(dogAffordable ? "#2a6a2a" : "#333344");
    this.dogBuyBtn.setAlpha(dogAffordable ? 1 : 0.55);

    const penAffordable = this.coins >= this.penBuyCost;
    const label = this.placingPen ? "Cancel" : `+Pen $${this.penBuyCost}`;
    this.penBuyBtn.setText(label);
    this.penBuyBtn.setBackgroundColor(
      this.placingPen ? "#884422" : penAffordable ? "#2a6a2a" : "#333344",
    );
    this.penBuyBtn.setAlpha(this.placingPen || penAffordable ? 1 : 0.55);
  }

  private buyDog(): void {
    if (this.coins < this.dogBuyCost) return;
    this.coins -= this.dogBuyCost;
    this.dogBuyCost = Math.ceil(this.dogBuyCost * 1.6);
    const origin = this.pens[0];
    const a = Math.random() * Math.PI * 2;
    this.spawnDog(
      origin.x + Math.cos(a) * (origin.r + 40),
      origin.y + Math.sin(a) * (origin.r + 40),
    );
    this.sound.play("pop");
    this.updateCoinText();
  }

  private nearestPen(x: number, y: number): Pen | null {
    let best: Pen | null = null;
    let bestDist = Infinity;
    for (const p of this.pens) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  private createPen(x: number, y: number): Pen {
    const circle = this.add
      .circle(x, y, PEN_RADIUS, 0x8b5a2b, 0.25)
      .setDepth(1);
    circle.setStrokeStyle(4, 0xffe099);
    this.hudCamera.ignore(circle);
    const label = this.add
      .text(x, y, "PEN", {
        fontFamily: FONT_UI,
        fontSize: 24,
        color: "#fff1c1",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.hudCamera.ignore(label);
    const pen: Pen = { x, y, r: PEN_RADIUS, circle, label };
    this.pens.push(pen);
    return pen;
  }

  private startPenPlacement(): void {
    if (this.placingPen) {
      this.cancelPenPlacement();
      return;
    }
    if (this.coins < this.penBuyCost) return;
    this.placingPen = true;
    this.penGhost.setVisible(true);
    this.showBanner("Click to place pen  (ESC to cancel)");
    this.updateShopButtons();
  }

  private cancelPenPlacement(): void {
    this.placingPen = false;
    this.penGhost.setVisible(false);
    this.updateShopButtons();
  }

  private placePenAt(x: number, y: number): void {
    if (this.coins < this.penBuyCost) {
      this.cancelPenPlacement();
      return;
    }
    this.coins -= this.penBuyCost;
    this.penBuyCost = Math.ceil(this.penBuyCost * 1.7);
    this.createPen(x, y);
    this.sound.play("pop");
    this.cancelPenPlacement();
    this.updateCoinText();
  }

  spawnSheep(ox?: number, oy?: number): void {
    const jitter = 30;
    let sx: number;
    let sy: number;
    if (ox !== undefined && oy !== undefined) {
      sx = ox + Phaser.Math.Between(-jitter, jitter);
      sy = oy + Phaser.Math.Between(-jitter, jitter);
    } else {
      const sp =
        this.mapSpawns[Phaser.Math.Between(0, this.mapSpawns.length - 1)];
      sx = sp.x + Phaser.Math.Between(-jitter, jitter);
      sy = sp.y + Phaser.Math.Between(-jitter, jitter);
    }

    const pen = this.nearestPen(sx, sy) ?? this.pens[0];
    const dx = sx - pen.x;
    const dy = sy - pen.y;
    const d = Math.hypot(dx, dy) || 1;
    const v0 = 60;
    const initAngle = Math.atan2(dy, dx);

    const s = this.add.sprite(sx, sy, "sheep").setDepth(5).setScale(0.5);
    s.rotation = initAngle + Math.PI / 2;
    s.play("sheep-walk");
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
      dragged: false,
    });
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

  private playPenEntryFx(s: Sheep): void {
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 260,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        const r = 255;
        const g = Math.round(255 + (224 - 255) * t);
        const b = Math.round(255 + (153 - 255) * t);
        s.sprite.setTint((r << 16) | (g << 8) | b);
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

  private updateCamera(): void {
    const { width } = this.scale;
    const fieldH = this.fieldBottom - this.fieldTop;
    // Restrict main camera to the field area between HUD bars
    this.cameras.main.setViewport(0, this.fieldTop, width, fieldH);
    const zoom = Math.min(width / WORLD_W, fieldH / WORLD_H);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
  }

  dumpState(): ShepherdSceneState {
    return {
      active: this.scene.isActive(),
      dogs: this.dogs.map((d) => ({
        x: d.sprite.x,
        y: d.sprite.y,
        dragged: d.dragged,
      })),
      sheep: this.sheep.map((s) => ({
        x: s.sprite.x,
        y: s.sprite.y,
        penned: s.penned,
        dragged: s.dragged,
      })),
      pens: this.pens.map((p) => ({ x: p.x, y: p.y, radius: p.r })),
      placingPen: this.placingPen,
      dragging: this.drag ? this.drag.kind : null,
      score: this.score,
      coins: this.coins,
      viewport: { width: this.scale.width, height: this.scale.height },
    };
  }

  private static readonly stepMs = 16.666;
  private static readonly stepSec = ShepherdScene.stepMs / 1000;

  update(_time: number, delta: number): void {
    if (this.editorActive) {
      this.updateEditorGraphics();
      this.updateCamera();
      return;
    }
    this.accumulator += delta;
    while (this.accumulator >= ShepherdScene.stepMs) {
      this.step();
      this.accumulator -= ShepherdScene.stepMs;
    }
    this.updateCamera();
  }

  private step(): void {
    const dt = ShepherdScene.stepSec;
    const dtMs = dt * 1000;

    // --- Dog AI ---
    for (const dog of this.dogs) {
      if (dog.dragged) continue;
      if (
        !dog.targetSheep ||
        dog.targetSheep.penned ||
        dog.targetSheep.dragged
      ) {
        dog.targetSheep = this.findTargetSheep(dog);
      }

      if (dog.targetSheep) {
        const sx = dog.targetSheep.sprite.x;
        const sy = dog.targetSheep.sprite.y;
        const pen = this.nearestPen(sx, sy);
        const pen_x = pen ? pen.x : sx;
        const pen_y = pen ? pen.y : sy;
        const dx = sx - pen_x;
        const dy = sy - pen_y;
        const d = Math.hypot(dx, dy) || 1;
        const herdX = sx + (dx / d) * HERD_OFFSET;
        const herdY = sy + (dy / d) * HERD_OFFSET;

        const toHerdX = herdX - dog.sprite.x;
        const toHerdY = herdY - dog.sprite.y;
        const toHerdD = Math.hypot(toHerdX, toHerdY);
        if (toHerdD > 5) {
          const move = Math.min(toHerdD, DOG_SPEED * dt);
          dog.sprite.x += (toHerdX / toHerdD) * move;
          dog.sprite.y += (toHerdY / toHerdD) * move;
        }
      }

      dog.sprite.x = Phaser.Math.Clamp(
        dog.sprite.x,
        DOG_RADIUS,
        WORLD_W - DOG_RADIUS,
      );
      dog.sprite.y = Phaser.Math.Clamp(
        dog.sprite.y,
        DOG_RADIUS,
        WORLD_H - DOG_RADIUS,
      );
    }

    // --- Sheep behavior ---
    for (let i = 0; i < this.sheep.length; i++) {
      const s = this.sheep[i];
      if (s.penned || s.dragged) continue;

      let ax = 0;
      let ay = 0;

      // Flee from ALL dogs
      for (const dog of this.dogs) {
        const fdx = s.sprite.x - dog.sprite.x;
        const fdy = s.sprite.y - dog.sprite.y;
        const fd = Math.hypot(fdx, fdy);
        if (fd < FEAR_RADIUS && fd > 0.01) {
          const strength = (1 - fd / FEAR_RADIUS) * FLEE_FORCE;
          ax += (fdx / fd) * strength;
          ay += (fdy / fd) * strength;
          s.scaredMs = Math.max(s.scaredMs, 300);
        }
      }

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

      // Flock: cohesion + alignment + panic contagion
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

      // Wander/graze
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

      // Scared tick
      if (s.scaredMs > 0) s.scaredMs = Math.max(0, s.scaredMs - dtMs);
      const scared = s.scaredMs > 0;
      const damping = scared ? 0.975 : SHEEP_DAMPING;
      const maxSpeed = scared ? 300 : SHEEP_MAX_SPEED;

      // Desired velocity
      const desiredVx = (s.vx + ax * dt) * damping;
      const desiredVy = (s.vy + ay * dt) * damping;
      const desiredSpd = Math.hypot(desiredVx, desiredVy);

      // Heading turns toward desired direction
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
      s.sprite.rotation = s.angle + Math.PI / 2;

      // World bounds
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
      {
        const spd = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(s.angle) * spd;
        s.vy = Math.sin(s.angle) * spd;
      }

      // Pen check — penned if contained in any pen
      let insidePen = false;
      for (const p of this.pens) {
        const pdx = s.sprite.x - p.x;
        const pdy = s.sprite.y - p.y;
        if (Math.hypot(pdx, pdy) + SHEEP_RADIUS <= p.r) {
          insidePen = true;
          break;
        }
      }
      if (insidePen) {
        s.penned = true;
        s.vx = 0;
        s.vy = 0;
        this.score++;
        this.coins++;
        this.updateCoinText();
        this.sound.play("score");
        this.playPenEntryFx(s);

        // Fade out penned sheep after a moment
        this.time.delayedCall(800, () => {
          if (s.sprite.active) {
            this.tweens.add({
              targets: s.sprite,
              alpha: 0,
              scale: 0.3,
              duration: 450,
              onComplete: () => {
                s.sprite.destroy();
                const idx = this.sheep.indexOf(s);
                if (idx >= 0) this.sheep.splice(idx, 1);
              },
            });
          }
        });
      }
    }

    // Positional overlap resolution
    const minSep = SHEEP_RADIUS * 2;
    for (let i = 0; i < this.sheep.length; i++) {
      const a = this.sheep[i];
      if (a.penned || a.dragged) continue;
      for (let j = i + 1; j < this.sheep.length; j++) {
        const b = this.sheep[j];
        if (b.penned || b.dragged) continue;
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

  private findTargetSheep(dog: Dog): Sheep | null {
    const targeted = new Set(
      this.dogs
        .filter((d) => d !== dog && d.targetSheep)
        .map((d) => d.targetSheep),
    );
    let best: Sheep | null = null;
    let bestDist = Infinity;
    for (const s of this.sheep) {
      if (s.penned || targeted.has(s)) continue;
      const d = Math.hypot(
        s.sprite.x - dog.sprite.x,
        s.sprite.y - dog.sprite.y,
      );
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  // --- Debug panel ---
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

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit Map";
    editBtn.style.cssText =
      "width:100%;padding:6px;margin-bottom:10px;border:1px solid #668;" +
      "background:#334;color:#ddd;cursor:pointer;font:12px monospace;border-radius:3px;";
    editBtn.addEventListener("click", () => this.enterEditorMode());
    panel.appendChild(editBtn);

    const stats = document.createElement("div");
    stats.style.cssText =
      "margin-bottom:10px;padding:4px 6px;background:#1a1a2e;border-radius:3px;color:#fa8;";
    const refreshStats = () => {
      const unpenned = this.sheep.filter((s) => !s.penned).length;
      stats.textContent = `sheep: ${unpenned}  dogs: ${this.dogs.length}`;
      if (this.debugPanel) requestAnimationFrame(refreshStats);
    };
    refreshStats();
    panel.appendChild(stats);

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

  // --- Editor mode ---
  private enterEditorMode(): void {
    this.editorActive = true;
    this.buildEditorPanel();
    this.updateEditorGraphics();
  }

  private exitEditorMode(): void {
    this.editorActive = false;
    this.editorPanel?.remove();
    this.editorPanel = null;
    this.editorGfx.clear();
    this.editorCursorGfx.clear();
  }

  private updateEditorGraphics(): void {
    this.editorGfx.clear();
    for (const t of this.mapTrees) {
      this.editorGfx.fillStyle(0x00ffff, 0.12);
      this.editorGfx.fillCircle(t.x, t.y, t.r);
      this.editorGfx.lineStyle(2, 0x00ffff, 0.8);
      this.editorGfx.strokeCircle(t.x, t.y, t.r);
    }
    for (const sp of this.mapSpawns) {
      this.editorGfx.lineStyle(3, 0xff8800, 0.9);
      const s = 14;
      this.editorGfx.lineBetween(sp.x - s, sp.y - s, sp.x + s, sp.y + s);
      this.editorGfx.lineBetween(sp.x + s, sp.y - s, sp.x - s, sp.y + s);
      this.editorGfx.fillStyle(0xff8800, 0.8);
      this.editorGfx.fillCircle(sp.x, sp.y, 5);
    }
    this.editorCursorGfx.clear();
    const { x, y } = this.editorPointerWorld;
    if (this.editorTool === "tree") {
      this.editorCursorGfx.lineStyle(2, 0x00ffff, 1);
      this.editorCursorGfx.strokeCircle(x, y, this.editorTreeRadius);
    } else {
      this.editorCursorGfx.lineStyle(3, 0xff8800, 1);
      const s = 14;
      this.editorCursorGfx.lineBetween(x - s, y - s, x + s, y + s);
      this.editorCursorGfx.lineBetween(x + s, y - s, x - s, y + s);
    }
  }

  private editorHandlePointerDown(p: Phaser.Input.Pointer): void {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    if (p.button === 2) {
      this.editorDeleteNearest(wp.x, wp.y);
      return;
    }
    if (this.editorTool === "tree") {
      this.mapTrees.push({
        x: Math.round(wp.x),
        y: Math.round(wp.y),
        r: this.editorTreeRadius,
      });
    } else {
      this.mapSpawns.push({ x: Math.round(wp.x), y: Math.round(wp.y) });
    }
  }

  private editorDeleteNearest(x: number, y: number): void {
    let bestIdx = -1;
    let bestDist = 120;
    for (let i = 0; i < this.mapTrees.length; i++) {
      const t = this.mapTrees[i];
      const d = Math.hypot(x - t.x, y - t.y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      this.mapTrees.splice(bestIdx, 1);
      return;
    }
    bestDist = 60;
    for (let i = 0; i < this.mapSpawns.length; i++) {
      const sp = this.mapSpawns[i];
      const d = Math.hypot(x - sp.x, y - sp.y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) this.mapSpawns.splice(bestIdx, 1);
  }

  private buildEditorPanel(): void {
    const panel = document.createElement("div");
    this.editorPanel = panel;
    panel.style.cssText =
      "position:fixed;top:70px;left:0;padding:10px;background:rgba(10,10,30,0.92);" +
      "color:#ddd;font:12px monospace;border-right:2px solid #46a;z-index:9998;" +
      "display:flex;flex-direction:column;gap:8px;min-width:210px;box-sizing:border-box;";

    const title = document.createElement("div");
    title.textContent = "Map Editor";
    title.style.cssText = "font-size:13px;font-weight:bold;color:#adf;";
    panel.appendChild(title);

    const hint = document.createElement("div");
    hint.textContent = "L-click: place   R-click: delete";
    hint.style.color = "#888";
    panel.appendChild(hint);

    const toolRow = document.createElement("div");
    toolRow.style.cssText = "display:flex;gap:4px;";
    const makeToolBtn = (label: string, tool: "tree" | "spawn") => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.dataset.tool = tool;
      btn.style.cssText =
        "flex:1;padding:6px;border:1px solid #668;color:#ddd;cursor:pointer;" +
        "font:11px monospace;background:" +
        (this.editorTool === tool ? "#46a" : "#334") +
        ";";
      btn.addEventListener("click", () => {
        this.editorTool = tool;
        toolRow.querySelectorAll("button").forEach((b) => {
          (b as HTMLButtonElement).style.background =
            (b as HTMLButtonElement).dataset.tool === tool ? "#46a" : "#334";
        });
      });
      return btn;
    };
    toolRow.appendChild(makeToolBtn("Tree", "tree"));
    toolRow.appendChild(makeToolBtn("Spawn", "spawn"));
    panel.appendChild(toolRow);

    const radiusLabel = document.createElement("div");
    radiusLabel.style.cssText = "display:flex;justify-content:space-between;";
    const rlbl = document.createElement("span");
    rlbl.textContent = "Tree Radius";
    const rval = document.createElement("span");
    rval.style.color = "#fa8";
    rval.textContent = String(this.editorTreeRadius);
    radiusLabel.appendChild(rlbl);
    radiusLabel.appendChild(rval);
    const radiusSlider = document.createElement("input");
    radiusSlider.type = "range";
    radiusSlider.min = "20";
    radiusSlider.max = "150";
    radiusSlider.step = "5";
    radiusSlider.value = String(this.editorTreeRadius);
    radiusSlider.style.cssText = "width:100%;cursor:pointer;accent-color:#6af;";
    radiusSlider.addEventListener("input", () => {
      this.editorTreeRadius = parseFloat(radiusSlider.value);
      rval.textContent = String(this.editorTreeRadius);
    });
    const radiusRow = document.createElement("div");
    radiusRow.appendChild(radiusLabel);
    radiusRow.appendChild(radiusSlider);
    panel.appendChild(radiusRow);

    const counts = document.createElement("div");
    counts.style.color = "#888";
    const refreshCounts = () => {
      counts.textContent = `Trees: ${this.mapTrees.length}  Spawns: ${this.mapSpawns.length}`;
      if (this.editorPanel) requestAnimationFrame(refreshCounts);
    };
    refreshCounts();
    panel.appendChild(counts);

    const dlBtn = document.createElement("button");
    dlBtn.textContent = "Download JSON";
    dlBtn.style.cssText =
      "padding:7px;border:1px solid #668;background:#334;color:#ddd;cursor:pointer;font:12px monospace;";
    dlBtn.addEventListener("click", () => this.editorDownload());
    panel.appendChild(dlBtn);

    if (import.meta.env.DEV) {
      const saveBtn = document.createElement("button");
      saveBtn.textContent = "Save to File";
      saveBtn.style.cssText =
        "padding:7px;border:1px solid #668;background:#263;color:#ddd;cursor:pointer;font:12px monospace;";
      saveBtn.addEventListener("click", () => this.editorSaveToServer(saveBtn));
      panel.appendChild(saveBtn);
    }

    const exitBtn = document.createElement("button");
    exitBtn.textContent = "Exit Edit Mode";
    exitBtn.style.cssText =
      "padding:7px;border:1px solid #668;background:#422;color:#ddd;cursor:pointer;font:12px monospace;";
    exitBtn.addEventListener("click", () => this.exitEditorMode());
    panel.appendChild(exitBtn);

    document.body.appendChild(panel);
  }

  private editorDownload(): void {
    const data = JSON.stringify(
      { trees: this.mapTrees, spawns: this.mapSpawns },
      null,
      2,
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    a.download = "shepherd-map.json";
    a.click();
  }

  private async editorSaveToServer(btn: HTMLButtonElement): Promise<void> {
    const orig = btn.textContent;
    btn.textContent = "Saving...";
    btn.disabled = true;
    try {
      const res = await fetch("/api/save-shepherd-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trees: this.mapTrees, spawns: this.mapSpawns }),
      });
      const json = await res.json();
      btn.textContent = json.ok ? "Saved!" : "Error";
    } catch {
      btn.textContent = "Failed";
    }
    setTimeout(() => {
      btn.textContent = orig;
      btn.disabled = false;
    }, 2000);
  }

  shutdown(): void {
    this.debugPanel?.remove();
    this.debugPanel = null;
    this.editorPanel?.remove();
    this.editorPanel = null;
  }
}
