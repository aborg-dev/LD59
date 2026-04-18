import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

const ROUND_DURATION_SEC = 45;
const HUD_TOP_H = 70;
const HUD_BOTTOM_H = 80;

const SHEEP_COUNT = 6;
const SHEEP_RADIUS = 18;
const DOG_RADIUS = 22;

const DOG_SPEED = 360;
const SHEEP_MAX_SPEED = 220;
const SHEEP_WANDER_SPEED = 28;
const FEAR_RADIUS = 180;
const FLEE_FORCE = 520;
const SEPARATION_RADIUS = 42;
const SEPARATION_FORCE = 240;
const SHEEP_DAMPING = 0.9;

const BARK_RADIUS = 420;
const BARK_IMPULSE = 1400;
const BARK_COOLDOWN_MS = 700;
const BARK_SCARED_MS = 700;
const SHEEP_SCARED_MAX_SPEED = 560;
const SHEEP_SCARED_DAMPING = 0.985;

interface Sheep {
  sprite: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  penned: boolean;
  wanderT: number;
  wanderAngle: number;
  scaredMs: number;
}

export interface ShepherdSceneState {
  active: boolean;
  dog: { x: number; y: number };
  sheep: { x: number; y: number; penned: boolean }[];
  pen: { x: number; y: number; width: number; height: number };
  score: number;
  timeLeft: number;
  barkCooldownMs: number;
  viewport: { width: number; height: number };
}

export class ShepherdScene extends Phaser.Scene {
  private dog!: Phaser.GameObjects.Arc;
  private sheep: Sheep[] = [];
  private score = 0;
  private timeRemaining = ROUND_DURATION_SEC;
  private accumulator = 0;
  private gameOver = false;
  private targetX = 0;
  private targetY = 0;
  private barkCooldownMs = 0;
  private barkRing!: Phaser.GameObjects.Arc;
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

  private penX = 0;
  private penY = 0;
  private penW = 0;
  private penH = 0;

  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private barkText!: Phaser.GameObjects.Text;
  private muteText!: Phaser.GameObjects.Text;

  private fieldTop = 0;
  private fieldBottom = 0;

  constructor() {
    super("Shepherd");
  }

  create(): void {
    const { width, height } = this.scale;
    this.fieldTop = HUD_TOP_H;
    this.fieldBottom = height - HUD_BOTTOM_H;
    const fieldH = this.fieldBottom - this.fieldTop;

    this.score = 0;
    this.timeRemaining = ROUND_DURATION_SEC;
    this.accumulator = 0;
    this.gameOver = false;
    this.barkCooldownMs = 0;
    this.sheep = [];

    // Grass background
    this.add
      .rectangle(width / 2, this.fieldTop + fieldH / 2, width, fieldH, 0x4a8c3a)
      .setDepth(0);

    // Pen at the top of the field
    const penMargin = 40;
    this.penW = Math.min(360, width - penMargin * 2);
    this.penH = 120;
    this.penX = (width - this.penW) / 2;
    this.penY = this.fieldTop + 30;

    const pen = this.add
      .rectangle(
        this.penX + this.penW / 2,
        this.penY + this.penH / 2,
        this.penW,
        this.penH,
        0x8b5a2b,
        0.25,
      )
      .setDepth(1);
    pen.setStrokeStyle(4, 0xffe099);

    this.add
      .text(this.penX + this.penW / 2, this.penY + 18, "PEN", {
        fontFamily: FONT_UI,
        fontSize: 22,
        color: "#fff1c1",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);

    // Sheep — scattered in the lower portion
    const spawnTop = this.penY + this.penH + 80;
    const spawnBottom = this.fieldBottom - 80;
    for (let i = 0; i < SHEEP_COUNT; i++) {
      const sx = Phaser.Math.Between(60, width - 60);
      const sy = Phaser.Math.Between(spawnTop, spawnBottom);
      const s = this.add.circle(sx, sy, SHEEP_RADIUS, 0xfafafa).setDepth(5);
      s.setStrokeStyle(2, 0x2b2b2b);
      this.sheep.push({
        sprite: s,
        vx: 0,
        vy: 0,
        penned: false,
        wanderT: Math.random() * 2,
        wanderAngle: Math.random() * Math.PI * 2,
        scaredMs: 0,
      });
    }

    // Dog — black, slightly larger, starts near bottom center
    this.dog = this.add
      .circle(width / 2, this.fieldBottom - 100, DOG_RADIUS, 0x222222)
      .setDepth(10);
    this.dog.setStrokeStyle(2, 0xffffff);
    this.targetX = this.dog.x;
    this.targetY = this.dog.y;

    // Bark visualization (hidden by default)
    this.barkRing = this.add
      .circle(this.dog.x, this.dog.y, BARK_RADIUS, 0xffffff, 0.0)
      .setDepth(9);
    this.barkRing.setStrokeStyle(3, 0xffff88, 0);

    // Spacebar triggers bark; WASD + arrows drive the dog
    this.input.keyboard?.on("keydown-SPACE", () => this.bark());
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

    // Input — tap/drag in field to set dog target, double-tap to bark
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      if (p.y < this.fieldTop || p.y > this.fieldBottom) return;
      const now = this.time.now;
      if (
        now - lastTapTime < 300 &&
        Math.hypot(p.x - lastTapX, p.y - lastTapY) < 80
      ) {
        this.bark();
        lastTapTime = 0;
        return;
      }
      lastTapTime = now;
      lastTapX = p.x;
      lastTapY = p.y;
      this.targetX = p.x;
      this.targetY = p.y;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      if (!p.isDown) return;
      if (p.y < this.fieldTop || p.y > this.fieldBottom) return;
      this.targetX = p.x;
      this.targetY = p.y;
    });

    // --- Top bar (timer + score) ---
    this.add
      .rectangle(width / 2, 0, width, HUD_TOP_H, 0x111122)
      .setOrigin(0.5, 0)
      .setDepth(100);

    this.timerText = this.add
      .text(24, HUD_TOP_H / 2, String(ROUND_DURATION_SEC), {
        fontFamily: FONT_UI,
        fontSize: 36,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0, 0.5)
      .setDepth(101);

    this.time.addEvent({
      delay: 1000,
      repeat: ROUND_DURATION_SEC - 1,
      callback: () => {
        this.timeRemaining--;
        this.timerText.setText(String(this.timeRemaining));
        if (this.timeRemaining <= 5) this.timerText.setColor("#ff4444");
        if (this.timeRemaining <= 0) this.endGame();
      },
    });

    this.scoreText = this.add
      .text(width - 24, HUD_TOP_H / 2, `0 / ${SHEEP_COUNT}`, {
        fontFamily: FONT_UI,
        fontSize: 36,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(1, 0.5)
      .setDepth(101);

    // --- Bottom bar (bark + menu + mute) ---
    this.add
      .rectangle(width / 2, height, width, HUD_BOTTOM_H, 0x111122)
      .setOrigin(0.5, 1)
      .setDepth(100);

    const btnY = this.fieldBottom + HUD_BOTTOM_H / 2;

    const btnStyle = {
      fontFamily: FONT_BODY,
      fontSize: 22,
      color: "#ffffff",
      backgroundColor: "#333344",
      padding: { left: 18, right: 18, top: 10, bottom: 10 },
      resolution: TEXT_RESOLUTION,
    };

    this.barkText = this.add
      .text(width / 2 - 200, btnY, "BARK", {
        ...btnStyle,
        backgroundColor: "#804020",
        fontSize: 26,
      })
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });

    this.barkText.on("pointerdown", () => this.bark());

    const menuText = this.add
      .text(width / 2, btnY, "MENU", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });

    menuText.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("MainMenu");
    });

    const muted = this.game.sound.mute;
    this.muteText = this.add
      .text(width / 2 + 200, btnY, muted ? "UNMUTE" : "MUTE", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });

    this.muteText.on("pointerdown", () => {
      this.game.sound.mute = !this.game.sound.mute;
      this.muteText.setText(this.game.sound.mute ? "UNMUTE" : "MUTE");
    });
  }

  private bark(): void {
    if (this.gameOver) return;
    if (this.barkCooldownMs > 0) return;
    this.barkCooldownMs = BARK_COOLDOWN_MS;
    this.sound.play("pop");

    // Apply impulse to unpenned sheep within BARK_RADIUS
    for (const s of this.sheep) {
      if (s.penned) continue;
      const dx = s.sprite.x - this.dog.x;
      const dy = s.sprite.y - this.dog.y;
      const d = Math.hypot(dx, dy);
      if (d < BARK_RADIUS && d > 0.01) {
        const k = (1 - d / BARK_RADIUS) * BARK_IMPULSE;
        s.vx += (dx / d) * k;
        s.vy += (dy / d) * k;
        s.scaredMs = BARK_SCARED_MS;
      }
    }

    // Visual ring
    this.barkRing.setPosition(this.dog.x, this.dog.y);
    this.barkRing.setRadius(10);
    this.barkRing.setStrokeStyle(4, 0xffff88, 1);
    this.tweens.add({
      targets: this.barkRing,
      radius: BARK_RADIUS,
      strokeAlpha: 0,
      duration: 400,
      onUpdate: () => {
        // Keep stroke visible during tween; tween strokeAlpha doesn't auto-update color
      },
      onComplete: () => {
        this.barkRing.setStrokeStyle(3, 0xffff88, 0);
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
    return {
      active: this.scene.isActive(),
      dog: { x: this.dog.x, y: this.dog.y },
      sheep: this.sheep.map((s) => ({
        x: s.sprite.x,
        y: s.sprite.y,
        penned: s.penned,
      })),
      pen: { x: this.penX, y: this.penY, width: this.penW, height: this.penH },
      score: this.score,
      timeLeft: this.timeRemaining,
      barkCooldownMs: this.barkCooldownMs,
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
  }

  private step(): void {
    const dt = ShepherdScene.stepSec;
    const { width } = this.scale;

    if (this.barkCooldownMs > 0) {
      this.barkCooldownMs = Math.max(0, this.barkCooldownMs - dt * 1000);
    }

    // Dog movement — keyboard overrides the tap target when any key is held
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
      // Sync tap-target to current position so pointer control doesn't yank back
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

      // Wander — slow idle drift
      s.wanderT -= dt;
      if (s.wanderT <= 0) {
        s.wanderAngle += (Math.random() - 0.5) * 1.6;
        s.wanderT = 0.5 + Math.random();
      }
      ax += Math.cos(s.wanderAngle) * SHEEP_WANDER_SPEED;
      ay += Math.sin(s.wanderAngle) * SHEEP_WANDER_SPEED;

      // Scared tick (set by bark)
      if (s.scaredMs > 0) s.scaredMs = Math.max(0, s.scaredMs - dt * 1000);
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

      // Pen check — if fully inside, lock in place
      const inPenX =
        s.sprite.x - SHEEP_RADIUS >= this.penX &&
        s.sprite.x + SHEEP_RADIUS <= this.penX + this.penW;
      const inPenY =
        s.sprite.y - SHEEP_RADIUS >= this.penY &&
        s.sprite.y + SHEEP_RADIUS <= this.penY + this.penH;
      if (inPenX && inPenY) {
        s.penned = true;
        s.vx = 0;
        s.vy = 0;
        s.sprite.setFillStyle(0xffe099);
        this.score++;
        this.scoreText.setText(`${this.score} / ${SHEEP_COUNT}`);
        this.sound.play("score");
        if (this.score >= SHEEP_COUNT) {
          this.time.delayedCall(500, () => this.endGame());
        }
      }
    }

    // Keep dog inside field
    const w = this.scale.width;
    if (this.dog.x < DOG_RADIUS) this.dog.x = DOG_RADIUS;
    else if (this.dog.x > w - DOG_RADIUS) this.dog.x = w - DOG_RADIUS;
    if (this.dog.y < this.fieldTop + DOG_RADIUS)
      this.dog.y = this.fieldTop + DOG_RADIUS;
    else if (this.dog.y > this.fieldBottom - DOG_RADIUS)
      this.dog.y = this.fieldBottom - DOG_RADIUS;
  }
}
