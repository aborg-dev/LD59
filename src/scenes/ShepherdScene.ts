import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";
import {
  GOAL_X,
  JOURNEY,
  START_SHEEP,
  WORLD_H,
  WORLD_W,
} from "../levels/journey.js";
import type {
  JourneyApi,
  Personality,
  SectionCtx,
  SectionHandle,
  SheepRef,
  WhistleEvent,
} from "../levels/types.js";

const HUD_TOP_H = 70;

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
const DOG_SPEED = 950;
let FEAR_RADIUS = 180;
let FLEE_FORCE = 520;

const PERSONALITY_COLOURS: Record<Personality, number> = {
  bolter: 0xfafafa,
  dawdler: 0xe6ddd2,
  greedy: 0xfff2b8,
};

export interface ShepherdSceneState {
  active: boolean;
  dog: { x: number; y: number };
  sheep: {
    x: number;
    y: number;
    home: boolean;
    falling: boolean;
    personality: Personality | null;
  }[];
  sheepHome: number;
  sheepLost: number;
  sheepAlive: number;
  sectionIndex: number;
  sectionName: string;
  goalX: number;
  worldW: number;
  whistleCooldownMs: number;
  viewport: { width: number; height: number };
}

export class ShepherdScene extends Phaser.Scene {
  private dogObj!: Phaser.GameObjects.Arc;
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
  private sheep: SheepRef[] = [];
  private sheepHome = 0;
  private sheepLost = 0;
  private accumulator = 0;
  private gameOver = false;
  private whistleCooldownMs = 0;
  private whistleRing!: Phaser.GameObjects.Arc;

  private sectionHandles: SectionHandle[] = [];
  private sectionIndex = 0;

  private whistleEvents: WhistleEvent[] = [];
  private whistleIdSeq = 0;

  private followTarget!: Phaser.GameObjects.Rectangle;

  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  private sheepCountText!: Phaser.GameObjects.Text;
  private sectionText!: Phaser.GameObjects.Text;
  private whistleText!: Phaser.GameObjects.Text;

  private debugPanel: HTMLDivElement | null = null;

  constructor() {
    super("Shepherd");
  }

  create(): void {
    const { width, height } = this.scale;
    const viewportH = height;

    this.sheep = [];
    this.sheepHome = 0;
    this.sheepLost = 0;
    this.accumulator = 0;
    this.gameOver = false;
    this.whistleCooldownMs = 0;
    this.sectionHandles = [];
    this.sectionIndex = 0;
    this.whistleEvents = [];
    this.whistleIdSeq = 0;

    // Main camera follows the flock along the journey. Shifted down so the
    // HUD bar occupies the top strip of the canvas.
    this.cameras.main.setViewport(0, HUD_TOP_H, width, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    // HUD camera — fixed viewport overlay covering the whole canvas.
    this.hudCamera = this.cameras.add(0, 0, width, viewportH);
    this.hudCamera.setScroll(0, 0);

    // Grass background — tiled by drawing one big rect across the world.
    const bg = this.add
      .rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x4a8c3a)
      .setDepth(0);
    this.hudCamera.ignore(bg);

    // Farm gate marker at x=0.
    const farm = this.add.graphics().setDepth(1);
    farm.fillStyle(0x6b4226, 1);
    farm.fillRect(0, 180, 20, 360);
    farm.fillStyle(0x8b5a2b, 1);
    farm.fillRect(20, 230, 40, 240);
    this.hudCamera.ignore(farm);

    // Barn marker at GOAL_X.
    const barn = this.add.graphics().setDepth(1);
    barn.fillStyle(0x6b4226, 1);
    barn.fillRect(GOAL_X - 40, 230, 80, 280);
    barn.fillStyle(0x3a2515, 1);
    barn.fillRect(GOAL_X - 20, 300, 40, 180);
    const barnLabel = this.add
      .text(GOAL_X, 200, "Barn", {
        fontFamily: FONT_BODY,
        fontSize: 22,
        color: "#fff1c1",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 1)
      .setDepth(2);
    this.hudCamera.ignore(barn);
    this.hudCamera.ignore(barnLabel);

    // Invisible follow target.
    this.followTarget = this.add.rectangle(80, WORLD_H / 2, 1, 1, 0, 0);
    this.hudCamera.ignore(this.followTarget);
    this.cameras.main.startFollow(this.followTarget, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(120, 80);

    // Sections — each registers its own world objects via ctx.registerWorld.
    const ctxBase: JourneyApi = {
      scene: this,
      sheep: this.sheep,
      dog: { x: 0, y: 0 },
      whistles: this.whistleEvents,
      loseSheep: (s) => this.removeSheep(s, true),
      registerWorld: (obj) => {
        if (Array.isArray(obj)) for (const o of obj) this.hudCamera.ignore(o);
        else this.hudCamera.ignore(obj);
      },
    };
    for (const def of JOURNEY) {
      const ctx: SectionCtx = { ...ctxBase, xRange: def.xRange };
      this.sectionHandles.push(def.setup(ctx));
    }

    // Sheep — 12 of them at the farm, random personalities.
    const personalities: Personality[] = ["bolter", "dawdler", "greedy"];
    const assigned = new Set<number>();
    // Pick 2-3 sheep indices to get a personality (each random).
    const numSpecial = 2 + Math.floor(Math.random() * 2);
    while (assigned.size < numSpecial) {
      assigned.add(Math.floor(Math.random() * START_SHEEP));
    }
    const indexToPersonality = new Map<number, Personality>();
    let pi = 0;
    for (const idx of assigned) {
      indexToPersonality.set(idx, personalities[pi % personalities.length]);
      pi++;
    }
    for (let i = 0; i < START_SHEEP; i++) {
      this.spawnSheep(
        40 + Math.random() * 80,
        280 + Math.random() * 160,
        indexToPersonality.get(i) ?? null,
      );
    }

    // Dog.
    this.dogObj = this.add.circle(80, 360, DOG_RADIUS, 0x222222).setDepth(10);
    this.dogObj.setStrokeStyle(2, 0xffffff);
    this.hudCamera.ignore(this.dogObj);
    this.targetX = this.dogObj.x;
    this.targetY = this.dogObj.y;

    // Keep the shared dog ref fresh each frame (done in step()).
    ctxBase.dog.x = this.dogObj.x;
    ctxBase.dog.y = this.dogObj.y;

    // Keyboard.
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

    // Whistle visualization.
    this.whistleRing = this.add
      .circle(0, 0, WHISTLE_RADIUS, 0xffffff, 0.0)
      .setDepth(9);
    this.whistleRing.setStrokeStyle(3, 0xffff88, 0);
    this.hudCamera.ignore(this.whistleRing);

    this.input.keyboard?.on("keydown-SPACE", () =>
      this.whistle(this.dogObj.x, this.dogObj.y),
    );
    this.input.keyboard?.on("keydown-ENTER", () => this.toggleDebugPanel());

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      if (p.y > viewportH - 10) return;
      this.whistle(this.dogObj.x, this.dogObj.y);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.targetX = wp.x;
      this.targetY = wp.y;
    });

    // HUD bar.
    const hudBar = this.add
      .rectangle(width / 2, 0, width, HUD_TOP_H, 0x111122)
      .setOrigin(0.5, 0)
      .setDepth(100);
    this.cameras.main.ignore(hudBar);

    this.sheepCountText = this.add
      .text(24, HUD_TOP_H / 2, "", {
        fontFamily: FONT_UI,
        fontSize: 28,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0, 0.5)
      .setDepth(101);
    this.cameras.main.ignore(this.sheepCountText);

    this.sectionText = this.add
      .text(width / 2, HUD_TOP_H / 2, "", {
        fontFamily: FONT_UI,
        fontSize: 26,
        color: "#ffe066",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(101);
    this.cameras.main.ignore(this.sectionText);

    this.whistleText = this.add
      .text(width - 24, HUD_TOP_H / 2, "Whistle: ready", {
        fontFamily: FONT_UI,
        fontSize: 22,
        color: "#aaffaa",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(1, 0.5)
      .setDepth(101);
    this.cameras.main.ignore(this.whistleText);

    this.updateHud();
  }

  private spawnSheep(
    x: number,
    y: number,
    personality: Personality | null,
  ): SheepRef {
    const colour = personality ? PERSONALITY_COLOURS[personality] : 0xfafafa;
    const scale = personality === "dawdler" ? 1.15 : 1;
    const s = this.add
      .rectangle(x, y, SHEEP_RADIUS * 2 * scale, SHEEP_RADIUS * scale, colour)
      .setDepth(5);
    s.setStrokeStyle(2, 0x2b2b2b);
    this.hudCamera.ignore(s);

    const sheep: SheepRef = {
      sprite: s,
      vx: 0,
      vy: 0,
      angle: 0,
      scaredMs: 0,
      grazing: false,
      modeT: SHEEP_WALK_MIN_SEC + Math.random() * SHEEP_WALK_MAX_SEC,
      wanderAngle: 0,
      personality,
      home: false,
      falling: false,
      teeterMs: 0,
      grazePauseMs: 0,
    };
    this.sheep.push(sheep);
    return sheep;
  }

  private removeSheep(s: SheepRef, countAsLost: boolean): void {
    const idx = this.sheep.indexOf(s);
    if (idx < 0) return;
    this.sheep.splice(idx, 1);
    s.sprite.destroy();
    if (countAsLost) this.sheepLost++;
  }

  whistle(wx: number, wy: number): void {
    if (this.gameOver) return;
    if (this.whistleCooldownMs > 0) return;
    this.whistleCooldownMs = WHISTLE_COOLDOWN_MS;
    this.sound.play("pop");

    this.whistleEvents.push({ x: wx, y: wy, id: ++this.whistleIdSeq });

    for (const s of this.sheep) {
      if (s.home || s.falling) continue;
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

  dumpState(): ShepherdSceneState {
    const alive = this.sheep.filter((s) => !s.home && !s.falling).length;
    return {
      active: this.scene.isActive(),
      dog: { x: this.dogObj.x, y: this.dogObj.y },
      sheep: this.sheep.map((s) => ({
        x: s.sprite.x,
        y: s.sprite.y,
        home: s.home,
        falling: s.falling,
        personality: s.personality,
      })),
      sheepHome: this.sheepHome,
      sheepLost: this.sheepLost,
      sheepAlive: alive,
      sectionIndex: this.sectionIndex,
      sectionName: JOURNEY[this.sectionIndex]?.name ?? "",
      goalX: GOAL_X,
      worldW: WORLD_W,
      whistleCooldownMs: this.whistleCooldownMs,
      viewport: { width: this.scale.width, height: this.scale.height },
    };
  }

  private static readonly stepMs = 16.666;
  private static readonly stepSec = ShepherdScene.stepMs / 1000;

  update(_time: number, delta: number): void {
    if (this.gameOver) return;
    this.accumulator += delta;
    while (this.accumulator >= ShepherdScene.stepMs) {
      this.step();
      if (this.gameOver) return;
      this.accumulator -= ShepherdScene.stepMs;
    }
    this.updateFollowTarget();
    this.updateHud();
  }

  private updateFollowTarget(): void {
    this.followTarget.x = Phaser.Math.Clamp(
      this.dogObj.x,
      200,
      WORLD_W - 200,
    );
    this.followTarget.y = Phaser.Math.Clamp(
      this.dogObj.y,
      WORLD_H / 2 - 60,
      WORLD_H / 2 + 60,
    );
  }

  private updateHud(): void {
    const alive = this.sheep.filter((s) => !s.home && !s.falling).length;
    this.sheepCountText.setText(
      `Sheep ${alive + this.sheepHome}/${START_SHEEP}  Home: ${this.sheepHome}  Lost: ${this.sheepLost}`,
    );
    this.sectionText.setText(JOURNEY[this.sectionIndex]?.name ?? "");
    if (this.whistleCooldownMs > 0) {
      this.whistleText.setText(
        `Whistle: ${(this.whistleCooldownMs / 1000).toFixed(1)}s`,
      );
      this.whistleText.setColor("#ff8844");
    } else {
      this.whistleText.setText("Whistle: ready");
      this.whistleText.setColor("#aaffaa");
    }
  }

  private step(): void {
    const dt = ShepherdScene.stepSec;
    const dtMs = dt * 1000;

    if (this.whistleCooldownMs > 0) {
      this.whistleCooldownMs = Math.max(0, this.whistleCooldownMs - dtMs);
    }

    // Dog movement.
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
      this.dogObj.x += (kx / klen) * step;
      this.dogObj.y += (ky / klen) * step;
      this.targetX = this.dogObj.x;
      this.targetY = this.dogObj.y;
    } else {
      const ddx = this.targetX - this.dogObj.x;
      const ddy = this.targetY - this.dogObj.y;
      const dDist = Math.hypot(ddx, ddy);
      if (dDist > 2) {
        const move = Math.min(dDist, DOG_SPEED * dt);
        this.dogObj.x += (ddx / dDist) * move;
        this.dogObj.y += (ddy / dDist) * move;
      }
    }
    this.dogObj.x = Phaser.Math.Clamp(
      this.dogObj.x,
      DOG_RADIUS,
      WORLD_W - DOG_RADIUS,
    );
    this.dogObj.y = Phaser.Math.Clamp(
      this.dogObj.y,
      DOG_RADIUS,
      WORLD_H - DOG_RADIUS,
    );

    // Sync the dog ref shared with sections.
    // (ctxBase.dog was aliased at setup; the sheep flock AI reads this.dogObj directly.)

    // Flock step.
    for (let i = 0; i < this.sheep.length; i++) {
      const s = this.sheep[i];
      if (s.home || s.falling) continue;

      let ax = 0;
      let ay = 0;

      // Flee from dog.
      const fdx = s.sprite.x - this.dogObj.x;
      const fdy = s.sprite.y - this.dogObj.y;
      const fd = Math.hypot(fdx, fdy);
      if (fd < FEAR_RADIUS && fd > 0.01) {
        const strength = (1 - fd / FEAR_RADIUS) * FLEE_FORCE;
        ax += (fdx / fd) * strength;
        ay += (fdy / fd) * strength;
      }

      // Separation.
      for (let j = 0; j < this.sheep.length; j++) {
        if (i === j) continue;
        const o = this.sheep[j];
        if (o.home || o.falling) continue;
        const odx = s.sprite.x - o.sprite.x;
        const ody = s.sprite.y - o.sprite.y;
        const od = Math.hypot(odx, ody);
        if (od < SEPARATION_RADIUS && od > 0.01) {
          const k = (1 - od / SEPARATION_RADIUS) * SEPARATION_FORCE;
          ax += (odx / od) * k;
          ay += (ody / od) * k;
        }
      }

      // Flock: cohesion + alignment + panic contagion.
      let cohX = 0,
        cohY = 0,
        cohN = 0;
      let alignVx = 0,
        alignVy = 0,
        alignN = 0;
      const dawdlerBoost = s.personality === "dawdler" ? 1.8 : 1;
      for (let j = 0; j < this.sheep.length; j++) {
        if (i === j) continue;
        const o = this.sheep[j];
        if (o.home || o.falling) continue;
        const odx = o.sprite.x - s.sprite.x;
        const ody = o.sprite.y - s.sprite.y;
        const od = Math.hypot(odx, ody);
        if (od < SEPARATION_RADIUS * dawdlerBoost || od > SHEEP_COHESION_RADIUS)
          continue;
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

      // Wander/graze (only when isolated).
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
      if (!s.grazing && alignN === 0 && s.grazePauseMs === 0) {
        s.wanderAngle += (Math.random() - 0.5) * 0.15;
        const wanderK = s.personality === "dawdler" ? 0.5 : 1;
        ax += Math.cos(s.wanderAngle) * SHEEP_WANDER_FORCE * wanderK;
        ay += Math.sin(s.wanderAngle) * SHEEP_WANDER_FORCE * wanderK;
      }

      // Scared tick.
      if (s.scaredMs > 0) s.scaredMs = Math.max(0, s.scaredMs - dtMs);
      const scared = s.scaredMs > 0;
      const damping = scared ? SHEEP_SCARED_DAMPING : SHEEP_DAMPING;
      const bolterBoost = s.personality === "bolter" && scared ? 1.4 : 1;
      const maxSpeed =
        (scared ? SHEEP_SCARED_MAX_SPEED : SHEEP_MAX_SPEED) * bolterBoost;

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

      // World bounds.
      if (s.sprite.x < SHEEP_RADIUS) {
        s.sprite.x = SHEEP_RADIUS;
        s.vx = Math.abs(s.vx) * 0.5;
      } else if (s.sprite.x > WORLD_W - SHEEP_RADIUS) {
        s.sprite.x = WORLD_W - SHEEP_RADIUS;
        s.vx = -Math.abs(s.vx) * 0.5;
      }
      if (s.sprite.y < HUD_TOP_H + SHEEP_RADIUS) {
        s.sprite.y = HUD_TOP_H + SHEEP_RADIUS;
        s.vy = Math.abs(s.vy) * 0.5;
      } else if (s.sprite.y > WORLD_H - SHEEP_RADIUS) {
        s.sprite.y = WORLD_H - SHEEP_RADIUS;
        s.vy = -Math.abs(s.vy) * 0.5;
      }
    }

    // Positional overlap resolution.
    const minSep = SHEEP_RADIUS * 2;
    for (let i = 0; i < this.sheep.length; i++) {
      const a = this.sheep[i];
      if (a.home || a.falling) continue;
      for (let j = i + 1; j < this.sheep.length; j++) {
        const b = this.sheep[j];
        if (b.home || b.falling) continue;
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

    // Section updates — run after the base physics step.
    for (let i = 0; i < JOURNEY.length; i++) {
      const def = JOURNEY[i];
      let anyInside = false;
      for (const s of this.sheep) {
        if (s.home || s.falling) continue;
        if (s.sprite.x >= def.xRange[0] && s.sprite.x <= def.xRange[1]) {
          anyInside = true;
          break;
        }
      }
      // Also include sections whose xRange is near a whistle this frame.
      if (!anyInside) {
        for (const w of this.whistleEvents) {
          if (w.x >= def.xRange[0] && w.x <= def.xRange[1]) {
            anyInside = true;
            break;
          }
        }
      }
      if (anyInside) this.sectionHandles[i].update(dt);
    }

    // Home detection.
    for (const s of this.sheep) {
      if (s.home || s.falling) continue;
      if (s.sprite.x >= GOAL_X) {
        s.home = true;
        this.sheepHome++;
        s.vx = 0;
        s.vy = 0;
        this.tweens.add({
          targets: s.sprite,
          alpha: 0,
          scale: 0.4,
          duration: 600,
          onComplete: () => s.sprite.destroy(),
        });
      }
    }

    // Current section (for HUD) — the rightmost section containing the flock.
    this.sectionIndex = this.computeSectionIndex();

    // Clear whistles at end of frame — they're one-shot events.
    this.whistleEvents.length = 0;

    // End-of-journey check.
    const stillPlaying = this.sheep.some((s) => !s.home && !s.falling);
    if (!stillPlaying) this.endGame();
  }

  private computeSectionIndex(): number {
    const alive = this.sheep.filter((s) => !s.home && !s.falling);
    if (alive.length === 0) return JOURNEY.length - 1;
    let meanX = 0;
    for (const s of alive) meanX += s.sprite.x;
    meanX /= alive.length;
    for (let i = JOURNEY.length - 1; i >= 0; i--) {
      if (meanX >= JOURNEY[i].xRange[0]) return i;
    }
    return 0;
  }

  private endGame(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.scene.start("GameOver", {
      sheepHome: this.sheepHome,
      sheepLost: this.sheepLost,
      total: START_SHEEP,
      returnScene: "Shepherd",
    });
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
