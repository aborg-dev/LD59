import { Scene } from "phaser";
import { FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

export interface MainMenuState {
  active: boolean;
}

const WORLD_W = 8000;
const WORLD_H = 1050;
const CAM_SPEED = 120;
const DOG_SPEED_MIN = 70;
const DOG_SPEED_MAX = 220;
const SPEED_ACCEL = 80;
const ANIM_SPEED_REF = 150;

interface Critter {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  baseVy: number;
  wigglePhase: number;
  wiggleFreq: number;
  wiggleAmp: number;
  soundKey: string;
  soundTimer: number;
}

export class MainMenu extends Scene {
  private dogSprite!: Phaser.GameObjects.Sprite;
  private dogVx = CAM_SPEED;
  private targetSpeed = CAM_SPEED;
  private speedTimer = 3;

  private critters: Critter[] = [];
  private wolfTimer = 4;
  private sheepTimer = 2;

  constructor() {
    super("MainMenu");
  }

  create() {
    const { width, height } = this.scale;

    this.buildGrass();
    this.buildTrees();

    if (!this.anims.exists("dog")) {
      this.anims.create({
        key: "dog",
        frames: this.anims.generateFrameNumbers("dog", { start: 0, end: 11 }),
        frameRate: 25,
        repeat: -1,
      });
    }
    if (!this.anims.exists("wolf")) {
      this.anims.create({
        key: "wolf",
        frames: this.anims.generateFrameNumbers("wolf", { start: 0, end: 7 }),
        frameRate: 20,
        repeat: -1,
      });
    }
    if (!this.anims.exists("sheep")) {
      this.anims.create({
        key: "sheep",
        frames: this.anims.generateFrameNumbers("sheep", { start: 0, end: 3 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    // Sprite walks north in the sheet — rotate 90° CW so it walks east
    this.dogSprite = this.add
      .sprite(width * 0.4, WORLD_H / 2, "dog")
      .setOrigin(0.5, 0.5)
      .setScale(2)
      .setDepth(3)
      .setAngle(90);
    this.dogSprite.play("dog");

    this.add
      .text(width / 2, height * 0.38, "Wool Street", {
        fontFamily: FONT_UI,
        fontStyle: "bold",
        fontSize: 128,
        color: "#ffe099",
        stroke: "#000000",
        strokeThickness: 10,
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setScrollFactor(0);

    const playBtn = this.add
      .text(width / 2, height * 0.62, "Play", {
        fontFamily: FONT_UI,
        fontStyle: "bold",
        fontSize: 56,
        color: "#ffffff",
        backgroundColor: "#2a6b3a",
        padding: { left: 72, right: 72, top: 20, bottom: 20 },
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    playBtn.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("Shepherd");
    });

    this.dogVx = CAM_SPEED;
    this.targetSpeed = CAM_SPEED;
    this.speedTimer = 2 + Math.random() * 2;
    this.critters = [];
    this.wolfTimer = 3 + Math.random() * 4;
    this.sheepTimer = 1 + Math.random() * 3;
  }

  private buildGrass(): void {
    const tile = 64;
    const highKeys = ["grass1", "grass2"];
    const lowKeys = ["grassLow1", "grassLow2", "grassLow3", "grassLow4"];
    for (let yy = 0; yy < WORLD_H; yy += tile) {
      for (let xx = 0; xx < WORLD_W; xx += tile) {
        const n =
          Math.sin(xx * 0.013 + Math.cos(yy * 0.009 + 1.3)) +
          Math.sin(yy * 0.011 + Math.cos(xx * 0.007 + 0.7));
        const p = (n + 2) / 4;
        const pool = Math.random() < p ? highKeys : lowKeys;
        const key = pool[Math.floor(Math.random() * pool.length)];
        this.add.image(xx, yy, key).setOrigin(0, 0).setScale(2.0).setDepth(0);
      }
    }
  }

  private buildTrees(): void {
    const naturalHalfWidths = [32, 32, 32, 64, 64];
    for (let i = 0; i < 225; i++) {
      const variant = Math.floor(Math.random() * 5);
      const hw = naturalHalfWidths[variant];
      const r = hw * (0.8 + Math.random() * 0.6);
      const x = 100 + Math.random() * (WORLD_W - 200);
      const y =
        Math.random() < 0.5
          ? Math.random() * WORLD_H * 0.35
          : WORLD_H * 0.65 + Math.random() * WORLD_H * 0.35;
      this.add
        .image(x, y, `tree${variant}`)
        .setScale(r / hw)
        .setDepth(2);
    }
  }

  private spawnCritter(key: string, soundKey: string): void {
    const cam = this.cameras.main.worldView;
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? cam.left - 80 : cam.right + 80;
    const y = WORLD_H * 0.15 + Math.random() * WORLD_H * 0.7;
    const speed = 180 + Math.random() * 120;
    const vx = fromLeft ? speed : -speed;
    const baseVy = (Math.random() - 0.5) * 35;

    const initAngle = Math.atan2(baseVy, vx) * (180 / Math.PI) + 90;
    const sprite = this.add
      .sprite(x, y, key)
      .setOrigin(0.5, 0.5)
      .setScale(2)
      .setDepth(3)
      .setAngle(initAngle);
    sprite.play(key);

    this.critters.push({
      sprite,
      vx,
      vy: baseVy,
      baseVy,
      wigglePhase: Math.random() * Math.PI * 2,
      wiggleFreq: 0.3 + Math.random() * 0.4,
      wiggleAmp: 12 + Math.random() * 18,
      soundKey,
      soundTimer: 3 + Math.random() * 5,
    });
  }

  update(time: number, delta: number): void {
    const { width } = this.scale;
    const dt = delta / 1000;
    const t = time / 1000;

    // Constant camera scroll
    this.cameras.main.scrollX += CAM_SPEED * dt;

    // Loop world seamlessly when camera reaches the end
    if (this.cameras.main.scrollX + width >= WORLD_W) {
      this.cameras.main.scrollX = 0;
      this.dogSprite.x -= WORLD_W;
      for (const c of this.critters) c.sprite.x -= WORLD_W;
    }

    // Dog speed variation (always positive)
    this.speedTimer -= dt;
    if (this.speedTimer <= 0) {
      this.targetSpeed =
        DOG_SPEED_MIN + Math.random() * (DOG_SPEED_MAX - DOG_SPEED_MIN);
      this.speedTimer = 2 + Math.random() * 3;
    }

    const diff = this.targetSpeed - this.dogVx;
    const step = SPEED_ACCEL * dt;
    this.dogVx += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;

    this.dogSprite.x += this.dogVx * dt;

    const scrollX = this.cameras.main.scrollX;
    this.dogSprite.x = Math.max(
      scrollX + 150,
      Math.min(this.dogSprite.x, scrollX + width - 150),
    );
    this.dogSprite.anims.timeScale = Math.max(0.1, this.dogVx / ANIM_SPEED_REF);

    // Spawn wolves and sheep
    this.wolfTimer -= dt;
    if (this.wolfTimer <= 0) {
      this.spawnCritter("wolf", "howl");
      this.wolfTimer = 5 + Math.random() * 6;
    }
    this.sheepTimer -= dt;
    if (this.sheepTimer <= 0) {
      // Spawn 1-3 sheep in a loose cluster
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) this.spawnCritter("sheep", "sheep-bleat");
      this.sheepTimer = 4 + Math.random() * 5;
    }

    // Update critters
    const cam = this.cameras.main.worldView;
    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i];
      c.vy =
        c.baseVy +
        Math.sin(t * c.wiggleFreq * Math.PI * 2 + c.wigglePhase) * c.wiggleAmp;
      c.sprite.x += c.vx * dt;
      c.sprite.y = Math.max(50, Math.min(c.sprite.y + c.vy * dt, WORLD_H - 50));
      // Tilt sprite to match actual velocity direction
      c.sprite.setAngle(Math.atan2(c.vy, c.vx) * (180 / Math.PI) + 90);

      c.soundTimer -= dt;
      if (c.soundTimer <= 0) {
        this.sound.play(c.soundKey, { volume: 0.2 });
        c.soundTimer = 4 + Math.random() * 6;
      }

      if (
        (c.vx > 0 && c.sprite.x > cam.right + 200) ||
        (c.vx < 0 && c.sprite.x < cam.left - 200)
      ) {
        c.sprite.destroy();
        this.critters.splice(i, 1);
      }
    }
  }

  dumpState(): MainMenuState {
    return { active: this.scene.isActive() };
  }
}
