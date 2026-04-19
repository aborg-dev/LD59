import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";
import mapData from "./shepherd-map.json";
const HUD_TOP_H = 70;
const HUD_BOTTOM_H = 80;

const WORLD_W = 3200;
const WORLD_H = 1800;

const SHEEP_RADIUS = 18;
const MAX_SHEEP = 30;

// Field — babies grow here into adults
const FIELD_CX = 2088;
const FIELD_CY = 900;
const FIELD_W_PX = 288;
const FIELD_H_PX = 168;
const FIELD_CAPACITY_BASE = 3;
const CAPACITY_UPGRADE_STEP = 1;
const FENCE_COST = 100;
const GUARD_RANGE = 320;
const GUARD_BUY_BASE_COST = 30;
const GROW_SEC = 12;
const SPEED_UPGRADE_STEP = 60;
const UPGRADE_MAX_LEVEL = 4;

// Market — adults are sold here for coins
const MARKET_CX = 876;
const MARKET_CY = 840;
const SALE_INTERVAL_MIN_MS = 5000;
const SALE_INTERVAL_MAX_MS = 10000;
const MARKET_WANDER_SPEED = 40;
const SALE_PRICE_MIN = 5;
const SALE_PRICE_MAX = 10;

// Shear shed — pay $SHEAR_VALUE to shear an adult back into a baby
const SHEAR_CX = 1960;
const SHEAR_CY = 440;
const SHEAR_W_PX = 236;
const SHEAR_H_PX = 164;
const SHEAR_VALUE = 3;
const SHEAR_SEC = 4;
const MARKET_W_PX = 236;
const MARKET_H_PX = 216;
const BUILDING_ENTRY_PADDING = SHEEP_RADIUS * 2; // extra margin around buildings for entry detection

// Country road — top-left → turns → center → bottom-right
const ROAD_W_PX = 140;
const TRUCK_W = 66;
const TRUCK_H = 175;
const TRUCK_SPEED = 320;
const ROAD_WAYPOINTS: readonly { x: number; y: number }[] = [
  { x: 350, y: -TRUCK_H },           // [0] spawn off-screen, top-left area
  { x: 350, y: 250 },                 // [1] turn east
  { x: 1500, y: 250 },               // [2] turn south (crosses through center)
  { x: 1500, y: 1350 },              // [3] turn east
  { x: 2850, y: 1350 },              // [4] turn south
  { x: 2850, y: WORLD_H + TRUCK_H }, // [5] exit bottom-right area
];
const DROP_SEGMENT_WP_IDX = 3; // wpIdx when truck is on the center vertical segment
const DROP_X = 1500;
const DROP_Y = 800;

const BABY_SHEEP_SCALE = 0.45;
const ADULT_SHEEP_SCALE = 1.0;

const BUY_SHEEP_BASE_COST = 3;

let SHEEP_MAX_SPEED = 220;
let SHEEP_WANDER_FORCE = 140;
const SHEEP_GRAZE_MIN_SEC = 1.5;
const SHEEP_GRAZE_MAX_SEC = 4.0;
const SHEEP_WALK_MIN_SEC = 0.8;
const SHEEP_WALK_MAX_SEC = 2.2;
const SHEEP_COHESION_RADIUS = 200;
let SHEEP_COHESION_FORCE = 80;
const ALIGNMENT_RADIUS = 130;
let ALIGNMENT_FORCE = 100;
const SEPARATION_RADIUS = 42;
const SEPARATION_FORCE = 240;
let SHEEP_DAMPING = 0.97;
let SHEEP_TURN_RATE = 4.5;
const PANIC_RADIUS = 90;
let PANIC_INHERIT = 0.7;

const TREE_COLLISION = false;

const DOG_RADIUS = 20;
const DOG_W = 34;
const DOG_H = 16;

const DOG_SPEED = 350;
const DOG_TURN_RATE = 6.5;
const HERD_OFFSET = 120;
const HERD_INTERCEPT_THREAT_RANGE = 260;
const HERD_INTERCEPT_MAX_LEASH = 180;
const FOLLOW_DIST = 55;
const FOLLOW_SPREAD = 40;
const FACING_CONE = Math.PI / 3;
const FACING_RANGE = 600;
const HIGHLIGHT_CLUSTER_R = 110;
let FEAR_RADIUS = 180;
let FLEE_FORCE = 520;

const WOLF_W = 42;
const WOLF_H = 22;
const WOLF_TURN_RATE = 3.5;
const WOLF_NORMAL_SPEED = 190;
const WOLF_EAT_RANGE = 32;
const WOLF_CONTACT_RANGE = 80;
const WOLF_FLEE_SPEED = 650;
const WOLF_SCARED_MS = 1800;
const WOLF_SPAWN_MAX_MS = 20000;
const WOLF_SPAWN_MIN_MS = 5000;
const WOLF_RAMP_MS = 180000;

interface Sheep {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  angle: number;
  stage: "baby" | "adult";
  growthT: number;
  shearT: number;
  sold: boolean;
  waiting: boolean;
  grazing: boolean;
  modeT: number;
  wanderAngle: number;
  scaredMs: number;
  salePrice: number;
  readyIcon?: Phaser.GameObjects.Text;
}

interface Wolf {
  sprite: Phaser.GameObjects.Image;
  targetSheep: Sheep | null;
  vx: number;
  vy: number;
  angle: number;
  scaredMs: number;
  howled: boolean;
}

interface Dog {
  sprite: Phaser.GameObjects.Sprite;
  targetSheep: Sheep | null;
  targetWolf: Wolf | null;
  vx: number;
  vy: number;
  angle: number;
  smoothedTurnRate: number;
  mode: "following" | "herding" | "defending" | "guarding";
  postX?: number;
  postY?: number;
}

interface Truck {
  sprite: Phaser.GameObjects.Image;
  wpIdx: number;
  angle: number;
  targetAngle: number;
  state: "arriving" | "dropping" | "leaving";
  dropTimer: number;
  sheepCount: number;
  sheepDropped: number;
}

const TRUCK_TURN_RATE = 7.0; // rad/s — how fast the truck rotates into a new heading

interface MapTree {
  x: number;
  y: number;
  r: number;
  variant: number; // 0–4 maps to tree0…tree4
}

export interface ShepherdSceneState {
  active: boolean;
  alphaDog: { x: number; y: number };
  dogs: { x: number; y: number }[];
  sheep: { x: number; y: number; stage: "baby" | "adult"; growthT: number }[];
  trucks: { x: number; y: number; state: string }[];
  field: {
    x: number;
    y: number;
    w: number;
    h: number;
    capacity: number;
    growing: number;
  };
  market: { x: number; y: number; w: number; h: number; waiting: number };
  shear: { x: number; y: number; w: number; h: number };
  score: number;
  coins: number;
  buySheepCost: number;
  alphaDogSpeed: number;
  fieldCapacity: number;
  speedUpgradeLevel: number;
  capacityUpgradeLevel: number;
  viewport: { width: number; height: number };
}

export class ShepherdScene extends Phaser.Scene {
  private alphaDog!: Dog;
  private alphaDogTargetX = 0;
  private alphaDogTargetY = 0;
  private keys?: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private arrowKeys?: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private dogs: Dog[] = [];
  private wolves: Wolf[] = [];
  private facingSheep: Sheep | null = null;
  private facingWolf: Wolf | null = null;
  private highlightGfx!: Phaser.GameObjects.Graphics;
  private sheep: Sheep[] = [];
  private score = 0;
  private coins = 0;
  private accumulator = 0;

  private trucks: Truck[] = [];
  private gameOverTriggered = false;
  private bgMusic?: Phaser.Sound.BaseSound;
  private truckSfx?: Phaser.Sound.BaseSound;
  private truckSfxFade?: Phaser.Tweens.Tween;
  private shearSfx?: Phaser.Sound.BaseSound;
  private grazingSfx?: Phaser.Sound.BaseSound;
  private paused = false;
  private placingGuard = false;
  private guardMarkers: Phaser.GameObjects.Graphics[] = [];

  private coinText!: Phaser.GameObjects.Text;
  private dogCountText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerTween?: Phaser.Tweens.Tween;
  private dogBuyCost = 5;
  private guardBuyCost = GUARD_BUY_BASE_COST;
  private buySheepCost = BUY_SHEEP_BASE_COST;
  private alphaDogSpeed = DOG_SPEED;
  private fieldCapacity = FIELD_CAPACITY_BASE;
  private speedUpgradeLevel = 0;
  private capacityUpgradeLevel = 0;
  private speedUpgradeCost = 10;
  private capacityUpgradeCost = 10;
  private wolfSpawnStartMs = 0;
  private dogBuyBtn!: Phaser.GameObjects.Text;
  private sheepBuyBtn!: Phaser.GameObjects.Text;
  private speedBuyBtn!: Phaser.GameObjects.Text;
  private capacityBuyBtn!: Phaser.GameObjects.Text;
  private fenceBuyBtn!: Phaser.GameObjects.Text;
  private guardBuyBtn!: Phaser.GameObjects.Text;
  private fieldLabel!: Phaser.GameObjects.Text;
  private marketCountText!: Phaser.GameObjects.Text;
  private fieldRect!: Phaser.GameObjects.Image;
  private fieldBorderGfx!: Phaser.GameObjects.Graphics;
  private fenceGfx!: Phaser.GameObjects.Graphics;
  private fenceBuilt = false;

  private fieldTop = 0;
  private fieldBottom = 0;
  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  private mapTrees: MapTree[] = [];
  private mapSpawns: { x: number; y: number }[] = [];

  private grassLayer!: Phaser.GameObjects.Layer;
  private grassMode: 0 | 1 | 2 = 0; // 0=original, 1=random, 2=noise

  // Debug/editor state
  private debugPanel: HTMLDivElement | null = null;
  private editorActive = false;
  private dogVisuals = false;
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
    this.wolves = [];
    this.sheep = [];
    this.trucks = [];
    this.gameOverTriggered = false;
    this.sound.removeByKey("background");
    this.bgMusic = this.sound.add("background", { loop: true, volume: 0.1 });
    this.bgMusic.play();
    this.dogBuyCost = 5;
    this.guardBuyCost = GUARD_BUY_BASE_COST;
    this.buySheepCost = BUY_SHEEP_BASE_COST;
    this.alphaDogSpeed = DOG_SPEED;
    this.fieldCapacity = FIELD_CAPACITY_BASE;
    this.speedUpgradeLevel = 0;
    this.capacityUpgradeLevel = 0;
    this.speedUpgradeCost = 10;
    this.capacityUpgradeCost = 10;
    this.fenceBuilt = false;

    this.hudCamera = this.cameras.add(0, 0, width, height);

    // Load map objects
    this.mapTrees = (mapData.trees as MapTree[]).map((t, i) => ({
      ...t,
      variant: t.variant ?? (i * 3 + Math.round(t.x * 0.07 + t.y * 0.05)) % 5,
    }));
    this.mapSpawns = mapData.spawns;

    this.buildGrass();

    this.drawRoad();

    // Field — baby sheep grow here. Fence is a paid upgrade.
    this.fieldRect = this.add
      .image(FIELD_CX, FIELD_CY, "farm")
      .setDisplaySize(FIELD_W_PX, FIELD_H_PX)
      .setDepth(1);
    this.hudCamera.ignore(this.fieldRect);
    this.fieldBorderGfx = this.add.graphics().setDepth(1.1);
    this.fieldBorderGfx.lineStyle(4, 0x3a2814, 1);
    this.fieldBorderGfx.strokeRect(
      FIELD_CX - FIELD_W_PX / 2, FIELD_CY - FIELD_H_PX / 2, FIELD_W_PX, FIELD_H_PX,
    );
    this.hudCamera.ignore(this.fieldBorderGfx);
    this.fenceGfx = this.add.graphics().setDepth(1.2).setVisible(false);
    this.hudCamera.ignore(this.fenceGfx);
    this.fieldLabel = this.add
      .text(FIELD_CX, FIELD_CY - FIELD_H_PX / 2 - 44, "FIELD", {
        fontFamily: FONT_UI,
        fontSize: 64,
        color: "#fff1c1",
        stroke: "#000000",
        strokeThickness: 8,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.hudCamera.ignore(this.fieldLabel);
    this.drawFencePosts();

    // Market — adult sheep sold here
    const marketImg = this.add
      .image(MARKET_CX, MARKET_CY, "market")
      .setDisplaySize(MARKET_W_PX, MARKET_H_PX)
      .setDepth(1);
    this.hudCamera.ignore(marketImg);
    const marketLabel = this.add
      .text(MARKET_CX, MARKET_CY - MARKET_H_PX / 2 - 110, "MARKET", {
        fontFamily: FONT_UI,
        fontSize: 64,
        color: "#fff1c1",
        stroke: "#000000",
        strokeThickness: 8,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.hudCamera.ignore(marketLabel);
    const marketPriceLabel = this.add
      .text(
        MARKET_CX,
        MARKET_CY - 12,
        `+$${SALE_PRICE_MIN}-${SALE_PRICE_MAX}`,
        {
          fontFamily: FONT_UI,
          fontSize: 48,
          color: "#ffd700",
          stroke: "#000000",
          strokeThickness: 6,
          resolution: TEXT_RESOLUTION,
        },
      )
      .setOrigin(0.5)
      .setDepth(2);
    this.hudCamera.ignore(marketPriceLabel);
    this.marketCountText = this.add
      .text(MARKET_CX, MARKET_CY - MARKET_H_PX / 2 - 70, "Waiting: 0", {
        fontFamily: FONT_UI,
        fontSize: 44,
        color: "#fff1c1",
        stroke: "#000000",
        strokeThickness: 6,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.hudCamera.ignore(this.marketCountText);

    // Shear shed — adults can be shorn here for a smaller, repeatable payout
    const shearImg = this.add
      .image(SHEAR_CX, SHEAR_CY, "shear")
      .setDisplaySize(SHEAR_W_PX, SHEAR_H_PX)
      .setDepth(1);
    this.hudCamera.ignore(shearImg);
    const shearLabel = this.add
      .text(SHEAR_CX, SHEAR_CY - SHEAR_H_PX / 2 - 100, "SHEAR", {
        fontFamily: FONT_UI,
        fontSize: 64,
        color: "#fff1c1",
        stroke: "#000000",
        strokeThickness: 8,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.hudCamera.ignore(shearLabel);
    const shearPriceLabel = this.add
      .text(SHEAR_CX, SHEAR_CY - 12, `+$${SHEAR_VALUE}`, {
        fontFamily: FONT_UI,
        fontSize: 52,
        color: "#ffd700",
        stroke: "#000000",
        strokeThickness: 6,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.hudCamera.ignore(shearPriceLabel);

    // Entry-area outlines (padded building bounds)
    const entryGfx = this.add.graphics().setDepth(2);
    this.hudCamera.ignore(entryGfx);
    const p = BUILDING_ENTRY_PADDING;
    entryGfx.lineStyle(3, 0x272e25, 0.6);
    entryGfx.strokeRect(
      MARKET_CX - MARKET_W_PX / 2 - p,
      MARKET_CY - MARKET_H_PX / 2 - p,
      MARKET_W_PX + p * 2,
      MARKET_H_PX + p * 2,
    );
    entryGfx.strokeRect(
      SHEAR_CX - SHEAR_W_PX / 2 - p,
      SHEAR_CY - SHEAR_H_PX / 2 - p,
      SHEAR_W_PX + p * 2,
      SHEAR_H_PX + p * 2,
    );
    entryGfx.strokeRect(
      FIELD_CX - FIELD_W_PX / 2 - p,
      FIELD_CY - FIELD_H_PX / 2 - p,
      FIELD_W_PX + p * 2,
      FIELD_H_PX + p * 2,
    );

    // Render trees
    for (const t of this.mapTrees) {
      const key = `tree${t.variant % 5}`;
      const spr = this.add.image(t.x, t.y, key).setScale(2.0).setDepth(2);
      this.hudCamera.ignore(spr);
    }

    this.editorGfx = this.add.graphics().setDepth(60);
    this.hudCamera.ignore(this.editorGfx);
    this.editorCursorGfx = this.add.graphics().setDepth(61);
    this.hudCamera.ignore(this.editorCursorGfx);

    this.highlightGfx = this.add.graphics().setDepth(12);
    this.hudCamera.ignore(this.highlightGfx);

    // Alpha dog — player-controlled, starts between field and market
    const alphaStartX = (FIELD_CX + MARKET_CX) / 2;
    const alphaStartY = FIELD_CY + FIELD_H_PX / 2 + 60;
    for (const key of ["dog_straight", "dog_bend_min", "dog_bend_mid", "dog_bend_max"]) {
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: 11 }),
          frameRate: 12,
          repeat: -1,
        });
      }
    }

    const alphaSprite = this.add
      .sprite(alphaStartX, alphaStartY, "dog_straight")
      .setOrigin(0.5, 0.25)
      .setDepth(11)
      .play("dog_straight");
    this.hudCamera.ignore(alphaSprite);
    this.alphaDog = {
      sprite: alphaSprite,
      targetSheep: null,
      targetWolf: null,
      vx: 0,
      vy: 0,
      angle: 0,
      smoothedTurnRate: 0,
      mode: "following",
    };
    this.alphaDogTargetX = alphaSprite.x;
    this.alphaDogTargetY = alphaSprite.y;

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

    this.game.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Sheep animation
    this.anims.create({
      key: "sheep-walk",
      frames: this.anims.generateFrameNumbers("sheep", { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    });

    // Click to whistle (pushes sheep outward), or place a pen if in placement mode
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.editorActive) {
        this.editorHandlePointerDown(p);
        return;
      }
      if (this.placingGuard) return;
      if (p.y > this.fieldBottom) return;
      if (p.y < this.fieldTop) return;
      this.dispatchFollower();
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      if (this.editorActive) this.editorPointerWorld = { x: wp.x, y: wp.y };
      if (p.y > this.fieldTop && p.y < this.fieldBottom) {
        this.alphaDogTargetX = wp.x;
        this.alphaDogTargetY = wp.y;
      }
    });

    this.input.keyboard?.on("keydown-SPACE", () => this.dispatchFollower());
    this.input.keyboard?.on("keydown-ESC", () => this.cancelGuardPlacement());
    this.input.keyboard?.on("keydown-ENTER", () => this.toggleDebugPanel());

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
        color: "#707070",
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

    const pauseBtn = this.add
      .text(width * 0.71, btnY, "PAUSE", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    pauseBtn.on("pointerdown", () => {
      this.paused = !this.paused;
      pauseBtn.setText(this.paused ? "RESUME" : "PAUSE");
      this.sound.play("pop");
    });
    this.cameras.main.ignore(pauseBtn);

    const menuBtn = this.add
      .text(width * 0.82, btnY, "MENU", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    menuBtn.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("MainMenu");
    });
    this.cameras.main.ignore(menuBtn);

    // Mute toggle — bottom-right, persisted across reloads
    const savedMute = localStorage.getItem("shepherd:muted") === "1";
    this.sound.mute = savedMute;
    const muteBtn = this.add
      .text(width * 0.93, btnY, savedMute ? "UNMUTE" : "MUTE", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    muteBtn.on("pointerdown", () => {
      this.sound.mute = !this.sound.mute;
      localStorage.setItem("shepherd:muted", this.sound.mute ? "1" : "0");
      muteBtn.setText(this.sound.mute ? "UNMUTE" : "MUTE");
    });
    this.cameras.main.ignore(muteBtn);

    this.dogBuyBtn = this.add
      .text(width * 0.05, btnY, "", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.dogBuyBtn.on("pointerdown", () => this.buyDog());
    this.cameras.main.ignore(this.dogBuyBtn);

    this.guardBuyBtn = this.add
      .text(width * 0.16, btnY, "", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.guardBuyBtn.on("pointerdown", () => {
      if (this.placingGuard) this.cancelGuardPlacement();
      else this.buyGuardDog();
    });
    this.cameras.main.ignore(this.guardBuyBtn);

    this.sheepBuyBtn = this.add
      .text(width * 0.27, btnY, "", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.sheepBuyBtn.on("pointerdown", () => this.buySheep());
    this.cameras.main.ignore(this.sheepBuyBtn);

    this.speedBuyBtn = this.add
      .text(width * 0.38, btnY, "", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.speedBuyBtn.on("pointerdown", () => this.buySpeedUpgrade());
    this.cameras.main.ignore(this.speedBuyBtn);

    this.capacityBuyBtn = this.add
      .text(width * 0.49, btnY, "", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.capacityBuyBtn.on("pointerdown", () => this.buyCapacityUpgrade());
    this.cameras.main.ignore(this.capacityBuyBtn);

    this.fenceBuyBtn = this.add
      .text(width * 0.60, btnY, "", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.fenceBuyBtn.on("pointerdown", () => this.buyFence());
    this.cameras.main.ignore(this.fenceBuyBtn);

    this.updateShopButtons();

    // Wolf spawning — interval shrinks as the game progresses
    this.wolfSpawnStartMs = this.time.now;
    this.scheduleNextWolf();

    this.updateDogCountText();

    // Set camera zoomed out to fit entire world
    this.updateCamera();

    this.showBanner("Buy a sheep, herd it to the field!");
  }

  private spawnDog(x: number, y: number): void {
    const sprite = this.add
      .sprite(x, y, "dog_straight")
      .setOrigin(0.5, 0.25)
      .setDepth(10)
      .setScale(0.75)
      .setTint(0xdddddd)
      .play("dog_straight");
    this.hudCamera.ignore(sprite);

    this.dogs.push({
      sprite,
      targetSheep: null,
      vx: 0,
      vy: 0,
      angle: 0,
      smoothedTurnRate: 0,
      targetWolf: null,
      mode: "following",
    });
    this.updateDogCountText();
  }

  private spawnWolf(): void {
    const edge = Math.floor(Math.random() * 4);
    let x: number;
    let y: number;
    if (edge === 0) {
      x = Math.random() * WORLD_W;
      y = -40;
    } else if (edge === 1) {
      x = WORLD_W + 40;
      y = Math.random() * WORLD_H;
    } else if (edge === 2) {
      x = Math.random() * WORLD_W;
      y = WORLD_H + 40;
    } else {
      x = -40;
      y = Math.random() * WORLD_H;
    }

    const sprite = this.add.image(x, y, "wolf").setDepth(9);
    this.hudCamera.ignore(sprite);
    this.wolves.push({
      sprite,
      targetSheep: null,
      vx: 0,
      vy: 0,
      angle: 0,
      scaredMs: 0,
      howled: false,
    });
  }

  private updateCoinText(): void {
    this.coinText.setText(`$${this.coins}`);
    this.updateShopButtons();
  }

  buySpeedUpgrade(): void {
    if (this.speedUpgradeLevel >= UPGRADE_MAX_LEVEL) return;
    if (this.coins < this.speedUpgradeCost) return;
    this.coins -= this.speedUpgradeCost;
    this.speedUpgradeLevel++;
    this.alphaDogSpeed = DOG_SPEED + this.speedUpgradeLevel * SPEED_UPGRADE_STEP;
    this.speedUpgradeCost = Math.ceil(this.speedUpgradeCost * 2);
    this.sound.play("pop");
    this.updateCoinText();
  }

  buyFence(): void {
    if (this.fenceBuilt) return;
    if (this.coins < FENCE_COST) return;
    this.coins -= FENCE_COST;
    this.fenceBuilt = true;
    this.fieldBorderGfx.clear();
    this.fieldBorderGfx.lineStyle(6, 0x8b5a2b, 1);
    this.fieldBorderGfx.strokeRect(
      FIELD_CX - FIELD_W_PX / 2, FIELD_CY - FIELD_H_PX / 2, FIELD_W_PX, FIELD_H_PX,
    );
    this.fenceGfx.setVisible(true);
    this.playBuildSound();
    this.showBanner("Fence built — wolves can't enter the field");
    this.updateCoinText();
  }

  private drawFencePosts(): void {
    const g = this.fenceGfx;
    g.clear();
    g.fillStyle(0x6b3a1a, 1);
    const postHalf = 6;
    const postYs = [FIELD_CY - FIELD_H_PX / 2, FIELD_CY + FIELD_H_PX / 2];
    const postXs = [
      FIELD_CX - FIELD_W_PX / 2,
      FIELD_CX - FIELD_W_PX / 4,
      FIELD_CX,
      FIELD_CX + FIELD_W_PX / 4,
      FIELD_CX + FIELD_W_PX / 2,
    ];
    for (const py of postYs) {
      for (const px of postXs) {
        g.fillRect(px - postHalf, py - postHalf, postHalf * 2, postHalf * 2);
      }
    }
    for (const px of [FIELD_CX - FIELD_W_PX / 2, FIELD_CX + FIELD_W_PX / 2]) {
      for (const py of [
        FIELD_CY - FIELD_H_PX / 4,
        FIELD_CY,
        FIELD_CY + FIELD_H_PX / 4,
      ]) {
        g.fillRect(px - postHalf, py - postHalf, postHalf * 2, postHalf * 2);
      }
    }
  }

  buyCapacityUpgrade(): void {
    if (this.capacityUpgradeLevel >= UPGRADE_MAX_LEVEL) return;
    if (this.coins < this.capacityUpgradeCost) return;
    this.coins -= this.capacityUpgradeCost;
    this.capacityUpgradeLevel++;
    this.fieldCapacity =
      FIELD_CAPACITY_BASE + this.capacityUpgradeLevel * CAPACITY_UPGRADE_STEP;
    this.capacityUpgradeCost = Math.ceil(this.capacityUpgradeCost * 2);
    this.playBuildSound();
    this.updateCoinText();
  }

  private updateMarketCountText(): void {
    const n = this.sheep.filter((s) => s.waiting && !s.sold).length;
    this.marketCountText.setText(`Waiting: ${n}`);
  }

  private scheduleSheepSale(s: Sheep): void {
    const delay =
      SALE_INTERVAL_MIN_MS +
      Math.random() * (SALE_INTERVAL_MAX_MS - SALE_INTERVAL_MIN_MS);
    this.time.delayedCall(delay, () => {
      if (!this.sheep.includes(s) || s.sold) return;
      s.sold = true;
      this.score++;
      this.coins += s.salePrice;
      this.updateCoinText();
      this.sound.play("money");
      this.playSaleFx(s);
      this.updateMarketCountText();
      // Floating price label
      const priceLabel = this.add
        .text(s.sprite.x, s.sprite.y - 36, `+$${s.salePrice}`, {
          fontFamily: FONT_UI,
          fontSize: 44,
          color: "#ffd700",
          stroke: "#000000",
          strokeThickness: 5,
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0.5, 1)
        .setDepth(12);
      this.hudCamera.ignore(priceLabel);
      this.tweens.add({
        targets: priceLabel,
        y: priceLabel.y - 60,
        alpha: 0,
        duration: 900,
        ease: "Quad.easeOut",
        onComplete: () => priceLabel.destroy(),
      });
      this.time.delayedCall(400, () => {
        if (s.sprite.active) {
          this.tweens.add({
            targets: s.sprite,
            alpha: 0,
            scale: 0.3,
            duration: 400,
            onComplete: () => {
              s.sprite.destroy();
              const idx = this.sheep.indexOf(s);
              if (idx >= 0) this.sheep.splice(idx, 1);
            },
          });
        }
      });
    });
  }

  private scheduleNextWolf(): void {
    if (this.gameOverTriggered) return;
    const elapsed = Math.max(0, this.time.now - this.wolfSpawnStartMs);
    const ramp = Math.min(elapsed / WOLF_RAMP_MS, 1);
    const delay =
      WOLF_SPAWN_MAX_MS - (WOLF_SPAWN_MAX_MS - WOLF_SPAWN_MIN_MS) * ramp;
    this.time.delayedCall(delay, () => {
      this.spawnWolf();
      this.scheduleNextWolf();
    });
  }

  private updateDogCountText(): void {
    this.dogCountText.setText(`Dogs: ${this.dogs.length + 1}`);
  }

  private updateShopButtons(): void {
    const dogAffordable = this.coins >= this.dogBuyCost;
    this.dogBuyBtn.setText(`+Dog $${this.dogBuyCost}`);
    this.dogBuyBtn.setBackgroundColor(dogAffordable ? "#2a6a2a" : "#333344");
    this.dogBuyBtn.setAlpha(dogAffordable ? 1 : 0.55);

    const guardAffordable = this.coins >= this.guardBuyCost;
    this.guardBuyBtn.setText(`+Guard $${this.guardBuyCost}`);
    this.guardBuyBtn.setBackgroundColor(
      guardAffordable ? "#2a6a2a" : "#333344",
    );
    this.guardBuyBtn.setAlpha(guardAffordable ? 1 : 0.55);

    const sheepAffordable = this.coins >= this.buySheepCost;
    this.sheepBuyBtn.setText(`+Sheep $${this.buySheepCost}`);
    this.sheepBuyBtn.setBackgroundColor(
      sheepAffordable ? "#2a6a2a" : "#333344",
    );
    this.sheepBuyBtn.setAlpha(sheepAffordable ? 1 : 0.55);

    const speedMaxed = this.speedUpgradeLevel >= UPGRADE_MAX_LEVEL;
    const speedAffordable =
      !speedMaxed && this.coins >= this.speedUpgradeCost;
    this.speedBuyBtn.setText(
      speedMaxed ? "Speed MAX" : `+Speed $${this.speedUpgradeCost}`,
    );
    this.speedBuyBtn.setBackgroundColor(
      speedAffordable ? "#2a6a2a" : "#333344",
    );
    this.speedBuyBtn.setAlpha(speedAffordable ? 1 : 0.55);

    const capMaxed = this.capacityUpgradeLevel >= UPGRADE_MAX_LEVEL;
    const capAffordable = !capMaxed && this.coins >= this.capacityUpgradeCost;
    this.capacityBuyBtn.setText(
      capMaxed ? "Cap MAX" : `+Cap $${this.capacityUpgradeCost}`,
    );
    this.capacityBuyBtn.setBackgroundColor(
      capAffordable ? "#2a6a2a" : "#333344",
    );
    this.capacityBuyBtn.setAlpha(capAffordable ? 1 : 0.55);

    const fenceAffordable = !this.fenceBuilt && this.coins >= FENCE_COST;
    this.fenceBuyBtn.setText(
      this.fenceBuilt ? "Fenced" : `+Fence $${FENCE_COST}`,
    );
    this.fenceBuyBtn.setBackgroundColor(
      this.fenceBuilt ? "#444444" : fenceAffordable ? "#2a6a2a" : "#333344",
    );
    this.fenceBuyBtn.setAlpha(this.fenceBuilt || fenceAffordable ? 1 : 0.55);
  }

  private buyDog(): void {
    if (this.coins < this.dogBuyCost) return;
    this.coins -= this.dogBuyCost;
    this.dogBuyCost = Math.ceil(this.dogBuyCost * 1.6);
    const a = Math.random() * Math.PI * 2;
    this.spawnDog(
      this.alphaDog.sprite.x + Math.cos(a) * 80,
      this.alphaDog.sprite.y + Math.sin(a) * 80,
    );
    this.playBarkSound();
    this.updateCoinText();
  }

  private playBarkSound(): void {
    this.sound.play("bark");
  }

  private playBuildSound(): void {
    this.sound.play("bounce", { rate: 0.6, detune: -600 });
    this.time.delayedCall(180, () =>
      this.sound.play("bounce", { rate: 0.55, detune: -700 }),
    );
  }

  private guardPosts(): { x: number; y: number }[] {
    const off = 40;
    return [
      // Field corners
      { x: FIELD_CX - FIELD_W_PX / 2 - off, y: FIELD_CY - FIELD_H_PX / 2 - off },
      { x: FIELD_CX + FIELD_W_PX / 2 + off, y: FIELD_CY - FIELD_H_PX / 2 - off },
      { x: FIELD_CX + FIELD_W_PX / 2 + off, y: FIELD_CY + FIELD_H_PX / 2 + off },
      { x: FIELD_CX - FIELD_W_PX / 2 - off, y: FIELD_CY + FIELD_H_PX / 2 + off },
      // Market corners
      { x: MARKET_CX - MARKET_W_PX / 2 - off, y: MARKET_CY - MARKET_H_PX / 2 - off },
      { x: MARKET_CX + MARKET_W_PX / 2 + off, y: MARKET_CY - MARKET_H_PX / 2 - off },
      { x: MARKET_CX + MARKET_W_PX / 2 + off, y: MARKET_CY + MARKET_H_PX / 2 + off },
      { x: MARKET_CX - MARKET_W_PX / 2 - off, y: MARKET_CY + MARKET_H_PX / 2 + off },
      // Shear corners
      { x: SHEAR_CX - SHEAR_W_PX / 2 - off, y: SHEAR_CY - SHEAR_H_PX / 2 - off },
      { x: SHEAR_CX + SHEAR_W_PX / 2 + off, y: SHEAR_CY - SHEAR_H_PX / 2 - off },
      { x: SHEAR_CX + SHEAR_W_PX / 2 + off, y: SHEAR_CY + SHEAR_H_PX / 2 + off },
      { x: SHEAR_CX - SHEAR_W_PX / 2 - off, y: SHEAR_CY + SHEAR_H_PX / 2 + off },
    ];
  }

  private isPostOccupied(px: number, py: number): boolean {
    return this.dogs.some(
      (d) => d.mode === "guarding" && Math.hypot((d.postX ?? 0) - px, (d.postY ?? 0) - py) < 10,
    );
  }

  private showGuardMarkers(): void {
    this.cancelGuardPlacement();
    this.placingGuard = true;
    for (const post of this.guardPosts()) {
      if (this.isPostOccupied(post.x, post.y)) continue;
      const g = this.add.graphics().setDepth(50).setInteractive(
        new Phaser.Geom.Circle(post.x, post.y, 22),
        Phaser.Geom.Circle.Contains,
      );
      this.hudCamera.ignore(g);
      const drawMarker = (hover: boolean) => {
        g.clear();
        g.fillStyle(hover ? 0xffd700 : 0xccaaff, hover ? 0.85 : 0.55);
        g.fillCircle(post.x, post.y, 18);
        g.lineStyle(2, 0xffffff, 0.9);
        g.strokeCircle(post.x, post.y, 18);
      };
      drawMarker(false);
      g.on("pointerover", () => drawMarker(true));
      g.on("pointerout", () => drawMarker(false));
      g.on("pointerdown", () => {
        this.coins -= this.guardBuyCost;
        this.guardBuyCost = Math.ceil(this.guardBuyCost * 1.6);
        this.spawnGuardDog(post.x, post.y);
        this.playBarkSound();
        this.updateCoinText();
        this.cancelGuardPlacement();
      });
      this.guardMarkers.push(g);
    }
  }

  private cancelGuardPlacement(): void {
    this.placingGuard = false;
    for (const g of this.guardMarkers) g.destroy();
    this.guardMarkers = [];
  }

  buyGuardDog(): void {
    if (this.coins < this.guardBuyCost) return;
    this.showGuardMarkers();
  }

  private spawnGuardDog(x: number, y: number): void {
    const sprite = this.add
      .sprite(x, y, "dog_straight")
      .setOrigin(0.5, 0.25)
      .setDepth(10)
      .setScale(0.75)
      .setTint(0xddaaff)
      .play("dog_straight");
    this.hudCamera.ignore(sprite);
    this.dogs.push({
      sprite,
      targetSheep: null,
      targetWolf: null,
      vx: 0,
      vy: 0,
      angle: 0,
      smoothedTurnRate: 0,
      mode: "guarding",
      postX: x,
      postY: y,
    });
    this.updateDogCountText();
  }

  private fieldContains(x: number, y: number): boolean {
    return (
      x > FIELD_CX - FIELD_W_PX / 2 &&
      x < FIELD_CX + FIELD_W_PX / 2 &&
      y > FIELD_CY - FIELD_H_PX / 2 &&
      y < FIELD_CY + FIELD_H_PX / 2
    );
  }

  private shearContains(x: number, y: number): boolean {
    const p = BUILDING_ENTRY_PADDING;
    return (
      x > SHEAR_CX - SHEAR_W_PX / 2 - p &&
      x < SHEAR_CX + SHEAR_W_PX / 2 + p &&
      y > SHEAR_CY - SHEAR_H_PX / 2 - p &&
      y < SHEAR_CY + SHEAR_H_PX / 2 + p
    );
  }

  private playEatFx(x: number, y: number): void {
    // Expanding red ring
    const ring = this.add.circle(x, y, 6, 0x000000, 0).setDepth(11);
    ring.setStrokeStyle(4, 0xaa2222, 1);
    this.hudCamera.ignore(ring);
    this.tweens.add({
      targets: ring,
      radius: 60,
      strokeAlpha: 0,
      duration: 450,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
    // Dark splatter bits flying outward
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 40 + Math.random() * 70;
      const bit = this.add.circle(x, y, 4, 0x5a1010, 1).setDepth(11);
      this.hudCamera.ignore(bit);
      this.tweens.add({
        targets: bit,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0.4,
        duration: 500,
        ease: "Quad.easeOut",
        onComplete: () => bit.destroy(),
      });
    }
  }

  private playShearFx(s: Sheep): void {
    const puff = this.add
      .circle(s.sprite.x, s.sprite.y, 6, 0xffffff, 0.65)
      .setDepth(11);
    this.hudCamera.ignore(puff);
    this.tweens.add({
      targets: puff,
      radius: 48,
      alpha: 0,
      duration: 450,
      onComplete: () => puff.destroy(),
    });
  }

  private marketContains(x: number, y: number): boolean {
    const p = BUILDING_ENTRY_PADDING;
    return (
      x > MARKET_CX - MARKET_W_PX / 2 - p &&
      x < MARKET_CX + MARKET_W_PX / 2 + p &&
      y > MARKET_CY - MARKET_H_PX / 2 - p &&
      y < MARKET_CY + MARKET_H_PX / 2 + p
    );
  }

  private babiesGrowing(): number {
    let n = 0;
    for (const s of this.sheep) {
      if (s.sold) continue;
      if (s.stage === "baby" && s.growthT > 0) n++;
    }
    return n;
  }

  private pushOutOfField(
    sprite: { x: number; y: number },
    mover?: { vx: number; vy: number },
  ): void {
    if (!this.fieldContains(sprite.x, sprite.y)) return;
    const leftX = FIELD_CX - FIELD_W_PX / 2;
    const rightX = FIELD_CX + FIELD_W_PX / 2;
    const topY = FIELD_CY - FIELD_H_PX / 2;
    const bottomY = FIELD_CY + FIELD_H_PX / 2;
    const leftD = sprite.x - leftX;
    const rightD = rightX - sprite.x;
    const topD = sprite.y - topY;
    const bottomD = bottomY - sprite.y;
    const minD = Math.min(leftD, rightD, topD, bottomD);
    if (minD === leftD) {
      sprite.x = leftX - 1;
      if (mover) mover.vx = -Math.abs(mover.vx);
    } else if (minD === rightD) {
      sprite.x = rightX + 1;
      if (mover) mover.vx = Math.abs(mover.vx);
    } else if (minD === topD) {
      sprite.y = topY - 1;
      if (mover) mover.vy = -Math.abs(mover.vy);
    } else {
      sprite.y = bottomY + 1;
      if (mover) mover.vy = Math.abs(mover.vy);
    }
  }

  private pushOutOfRect(
    cx: number, cy: number, w: number, h: number,
    sprite: { x: number; y: number },
    mover?: { vx: number; vy: number },
  ): void {
    const leftX = cx - w / 2;
    const rightX = cx + w / 2;
    const topY = cy - h / 2;
    const bottomY = cy + h / 2;
    if (sprite.x <= leftX || sprite.x >= rightX || sprite.y <= topY || sprite.y >= bottomY) return;
    const leftD = sprite.x - leftX;
    const rightD = rightX - sprite.x;
    const topD = sprite.y - topY;
    const bottomD = bottomY - sprite.y;
    const minD = Math.min(leftD, rightD, topD, bottomD);
    if (minD === leftD) {
      sprite.x = leftX - 1;
      if (mover) mover.vx = -Math.abs(mover.vx);
    } else if (minD === rightD) {
      sprite.x = rightX + 1;
      if (mover) mover.vx = Math.abs(mover.vx);
    } else if (minD === topD) {
      sprite.y = topY - 1;
      if (mover) mover.vy = -Math.abs(mover.vy);
    } else {
      sprite.y = bottomY + 1;
      if (mover) mover.vy = Math.abs(mover.vy);
    }
  }

  private sheepGoal(s: Sheep): { x: number; y: number } {
    return s.stage === "adult"
      ? { x: MARKET_CX, y: MARKET_CY }
      : { x: FIELD_CX, y: FIELD_CY };
  }

  buySheep(): void {
    if (this.coins < this.buySheepCost) return;
    if (this.sheep.length >= MAX_SHEEP) return;
    this.coins -= this.buySheepCost;
    const TRUCK_CAPACITY = 10;
    const arriving = this.trucks.findLast((t) => t.state === "arriving" && t.sheepCount < TRUCK_CAPACITY);
    if (arriving) {
      arriving.sheepCount++;
    } else {
      this.spawnTruck();
    }
    this.sound.play("money");
    this.updateCoinText();
  }

  private buildGrass(): void {
    if (this.grassLayer) {
      this.grassLayer.destroy(true);
    }
    const tile = 64;
    const highKeys = ["grass1", "grass2"];
    const lowKeys = ["grassLow1", "grassLow2", "grassLow3", "grassLow4"];
    this.grassLayer = this.add.layer().setDepth(0);
    for (let yy = 0; yy < WORLD_H; yy += tile) {
      for (let xx = 0; xx < WORLD_W; xx += tile) {
        let key: string;
        if (this.grassMode === 0) {
          // Original: wavy boundary — high-detail left, low-detail right
          const baseBoundary = WORLD_W / 3;
          const waveAmp = 220;
          const waveFreq = Math.PI / 900;
          const blendHalf = 96;
          const boundary = baseBoundary + Math.cos(yy * waveFreq) * waveAmp;
          const dist = (xx + tile / 2) - boundary;
          const highProb = dist < -blendHalf ? 1 : dist > blendHalf ? 0 : (blendHalf - dist) / (blendHalf * 2);
          const pool = Math.random() < highProb ? highKeys : lowKeys;
          key = pool[Math.floor(Math.random() * pool.length)];
        } else if (this.grassMode === 1) {
          // Random: uniform across all variants
          const all = [...highKeys, ...lowKeys];
          key = all[Math.floor(Math.random() * all.length)];
        } else {
          // Noise: two-frequency sine sum drives high vs low probability
          const n = Math.sin(xx * 0.013 + Math.cos(yy * 0.009 + 1.3))
                  + Math.sin(yy * 0.011 + Math.cos(xx * 0.007 + 0.7));
          const t = (n + 2) / 4;
          const pool = Math.random() < t ? highKeys : lowKeys;
          key = pool[Math.floor(Math.random() * pool.length)];
        }
        this.grassLayer.add(this.add.image(xx, yy, key).setOrigin(0, 0).setScale(2.0));
      }
    }
    this.hudCamera.ignore(this.grassLayer);
  }

  private drawRoad(): void {
    const gfx = this.add.graphics().setDepth(0.5);
    this.hudCamera.ignore(gfx);

    const halfOuter = ROAD_W_PX / 2;              // 70 — full shoulder half-width
    const halfPaved = Math.round(ROAD_W_PX * 0.28); // ~39 — gray center half-width

    // Pass 1 — ALL shoulder fills (tan) before any paved, so paved always wins
    gfx.fillStyle(0xc4a07a);
    for (let i = 0; i + 1 < ROAD_WAYPOINTS.length; i++) {
      const p0 = ROAD_WAYPOINTS[i];
      const p1 = ROAD_WAYPOINTS[i + 1];
      const horiz = p0.y === p1.y;
      gfx.fillRect(
        Math.min(p0.x, p1.x) - (horiz ? 0 : halfOuter),
        Math.min(p0.y, p1.y) - (horiz ? halfOuter : 0),
        Math.abs(p1.x - p0.x) + (horiz ? 0 : ROAD_W_PX),
        Math.abs(p1.y - p0.y) + (horiz ? ROAD_W_PX : 0),
      );
    }
    for (let i = 1; i + 1 < ROAD_WAYPOINTS.length; i++) {
      const p = ROAD_WAYPOINTS[i];
      gfx.fillRect(p.x - halfOuter, p.y - halfOuter, ROAD_W_PX, ROAD_W_PX);
    }

    // Pass 2 — ALL paved fills (gray) drawn on top of all shoulders.
    // Segment rects extend to the corner point so no gap at junctions.
    // Corner paved fills only the halfPaved×halfPaved centre — the outer corner
    // quadrants stay tan from pass 1, giving a consistent shoulder all round.
    gfx.fillStyle(0x888880);
    for (let i = 0; i + 1 < ROAD_WAYPOINTS.length; i++) {
      const p0 = ROAD_WAYPOINTS[i];
      const p1 = ROAD_WAYPOINTS[i + 1];
      const horiz = p0.y === p1.y;
      if (horiz) {
        gfx.fillRect(Math.min(p0.x, p1.x), p0.y - halfPaved, Math.abs(p1.x - p0.x), halfPaved * 2);
      } else {
        gfx.fillRect(p0.x - halfPaved, Math.min(p0.y, p1.y), halfPaved * 2, Math.abs(p1.y - p0.y));
      }
    }
    for (let i = 1; i + 1 < ROAD_WAYPOINTS.length; i++) {
      const p = ROAD_WAYPOINTS[i];
      gfx.fillRect(p.x - halfPaved, p.y - halfPaved, halfPaved * 2, halfPaved * 2);
    }

    // Pass 3 — rough edge blobs along segments (skipping ±halfOuter from ends)
    gfx.fillStyle(0x7a5630);
    for (let i = 0; i + 1 < ROAD_WAYPOINTS.length; i++) {
      const p0 = ROAD_WAYPOINTS[i];
      const p1 = ROAD_WAYPOINTS[i + 1];
      const horiz = p0.y === p1.y;
      const len = Math.abs(horiz ? p1.x - p0.x : p1.y - p0.y);
      const dirX = horiz ? Math.sign(p1.x - p0.x) : 0;
      const dirY = horiz ? 0 : Math.sign(p1.y - p0.y);
      const skip = halfPaved;
      const usable = len - skip * 2;
      if (usable <= 0) continue;
      const count = Math.floor(usable / 20);
      for (let j = 0; j < count; j++) {
        const t = skip + (j + 0.5) * 20;
        const cx = p0.x + dirX * t;
        const cy = p0.y + dirY * t;
        const r = 5 + Math.random() * 11;
        const off = halfOuter - 4 + Math.random() * 10;
        const jitter = (Math.random() - 0.5) * 18;
        if (horiz) {
          gfx.fillCircle(cx + jitter, cy - off, r);
          gfx.fillCircle(cx + jitter, cy + off, r);
        } else {
          gfx.fillCircle(cx - off, cy + jitter, r);
          gfx.fillCircle(cx + off, cy + jitter, r);
        }
      }
    }

    // Pass 3b — blobs on the 4 outer edges of each corner, same style as segments
    for (let i = 1; i + 1 < ROAD_WAYPOINTS.length; i++) {
      const p = ROAD_WAYPOINTS[i];
      const edgeSigns: [number, "h" | "v"][] = [[-1, "h"], [1, "h"], [-1, "v"], [1, "v"]];
      const count = Math.floor((halfOuter * 2) / 20);
      for (const [sign, axis] of edgeSigns) {
        for (let j = 0; j < count; j++) {
          const along = -halfOuter + (j + 0.5) * 20;
          if (Math.abs(along) < halfPaved) continue; // road passes through here, no shoulder
          const off = halfOuter - 4 + Math.random() * 10;
          const jitter = (Math.random() - 0.5) * 18;
          const r = 5 + Math.random() * 11;
          if (axis === "h") {
            gfx.fillCircle(p.x + along + jitter, p.y + sign * off, r);
          } else {
            gfx.fillCircle(p.x + sign * off, p.y + along + jitter, r);
          }
        }
      }
    }
  }

  private spawnTruck(): void {
    const start = ROAD_WAYPOINTS[0];
    const sprite = this.add
      .image(start.x, start.y, "truck")
      .setOrigin(0.5, 0.35)
      .setDisplaySize(TRUCK_W, TRUCK_H)
      .setScale(2.0)
      .setDepth(7);
    this.hudCamera.ignore(sprite);
    const initAngle = Math.atan2(
      ROAD_WAYPOINTS[1].y - ROAD_WAYPOINTS[0].y,
      ROAD_WAYPOINTS[1].x - ROAD_WAYPOINTS[0].x,
    ) + Math.PI / 2;
    const t: Truck = {
      sprite,
      wpIdx: 1,
      angle: initAngle,
      targetAngle: initAngle,
      state: "arriving",
      dropTimer: 0,
      sheepCount: 1,
      sheepDropped: 0,
    };
    sprite.setRotation(initAngle);
    this.trucks.push(t);
    if (this.truckSfxFade) {
      this.truckSfxFade.stop();
      this.truckSfxFade = undefined;
    }
    if (this.truckSfx?.isPlaying) {
      // Cancel any mid-fade and restore volume — another truck is on the road
      (this.truckSfx as Phaser.Sound.BaseSound & { volume: number }).volume = 0.7;
    } else {
      this.sound.removeByKey("truck");
      this.truckSfx = this.sound.add("truck", { loop: true, volume: 0.7 });
      this.truckSfx.play();
    }
  }

  private setTruckRotation(t: Truck): void {
    if (t.wpIdx < 1 || t.wpIdx >= ROAD_WAYPOINTS.length) return;
    const prev = ROAD_WAYPOINTS[t.wpIdx - 1];
    const next = ROAD_WAYPOINTS[t.wpIdx];
    const dir = Math.atan2(next.y - prev.y, next.x - prev.x);
    t.targetAngle = dir + Math.PI / 2;
  }

  private checkGameOver(): void {
    if (this.gameOverTriggered) return;
    if (this.coins >= this.buySheepCost) return;
    if (this.sheep.some((s) => !s.sold)) return;
    if (this.trucks.length > 0) return;
    this.gameOverTriggered = true;
    this.showBanner("Out of sheep!");
    this.time.delayedCall(1400, () => {
      this.scene.start("GameOver", {
        score: this.score,
        returnScene: "Shepherd",
      });
    });
  }

  private updateTrucks(dt: number): void {
    const truckGap = 20;
    for (let i = this.trucks.length - 1; i >= 0; i--) {
      const t = this.trucks[i];
      if (t.state === "dropping") {
        t.dropTimer += dt;
        const DROP_INTERVAL = 0.3;
        const nextDropAt = 0.2 + t.sheepDropped * DROP_INTERVAL;
        if (t.sheepDropped < t.sheepCount && t.dropTimer >= nextDropAt) {
          this.spawnSheep(t.sprite.x + TRUCK_W / 2 + 20, t.sprite.y);
          this.sound.play("sheep-bleat", { volume: 0.25 });
          t.sheepDropped++;
        }
        if (t.sheepDropped >= t.sheepCount && t.dropTimer >= 0.2 + t.sheepCount * DROP_INTERVAL + 0.2) {
          t.state = "leaving";
        }
      } else if (t.wpIdx >= ROAD_WAYPOINTS.length) {
        t.sprite.destroy();
        this.trucks.splice(i, 1);
        continue;
      } else {
        const target = ROAD_WAYPOINTS[t.wpIdx];
        const dx = target.x - t.sprite.x;
        const dy = target.y - t.sprite.y;
        const distToWp = Math.hypot(dx, dy);
        const step = TRUCK_SPEED * dt;

        // On the drop segment, queue behind other trucks and stop at DROP_Y
        if (t.state === "arriving" && t.wpIdx === DROP_SEGMENT_WP_IDX) {
          const myIdx = this.trucks.indexOf(t);
          let maxY = DROP_Y;
          for (const other of this.trucks) {
            if (other === t || other.state === "leaving") continue;
            if (other.state === "dropping") {
              maxY = Math.min(maxY, DROP_Y - other.sprite.displayHeight - truckGap);
            } else if (other.wpIdx === DROP_SEGMENT_WP_IDX) {
              const otherIdx = this.trucks.indexOf(other);
              const ahead = other.sprite.y > t.sprite.y ||
                (other.sprite.y === t.sprite.y && otherIdx < myIdx);
              if (ahead) {
                maxY = Math.min(maxY, other.sprite.y - other.sprite.displayHeight - truckGap);
              }
            }
          }
          const advance = Math.min(step, maxY - t.sprite.y);
          if (advance > 0) t.sprite.y += advance;
          if (t.sprite.y >= DROP_Y) {
            t.sprite.y = DROP_Y;
            t.state = "dropping";
            t.dropTimer = 0;
          }
        } else {
          // Generic waypoint following
          // Begin rotating early so the turn is visually centered on the corner:
          // start when the truck is half a turn-arc away from the waypoint.
          const anticipateDist = (Math.PI / 2) / TRUCK_TURN_RATE * TRUCK_SPEED * 0.5;
          const nextAfterCorner = t.wpIdx + 1;
          if (nextAfterCorner < ROAD_WAYPOINTS.length && distToWp <= anticipateDist) {
            const corner = ROAD_WAYPOINTS[t.wpIdx];
            const afterCorner = ROAD_WAYPOINTS[nextAfterCorner];
            const dir = Math.atan2(afterCorner.y - corner.y, afterCorner.x - corner.x);
            t.targetAngle = dir + Math.PI / 2;
          }

          // Maintain spacing with the truck ahead (lower index = spawned earlier = further along)
          const truckAhead = i > 0 ? this.trucks[i - 1] : null;
          if (truckAhead && truckAhead.state !== "leaving") {
            const gap = Math.hypot(
              truckAhead.sprite.x - t.sprite.x,
              truckAhead.sprite.y - t.sprite.y,
            );
            if (gap < t.sprite.displayHeight + truckGap) {
              // Too close — skip movement this frame
            } else {
              const clampedStep = Math.min(step, gap - t.sprite.displayHeight - truckGap);
              if (distToWp <= clampedStep) {
                t.sprite.x = target.x;
                t.sprite.y = target.y;
                t.wpIdx++;
                if (t.wpIdx < ROAD_WAYPOINTS.length) {
                  this.setTruckRotation(t);
                }
              } else {
                t.sprite.x += (dx / distToWp) * clampedStep;
                t.sprite.y += (dy / distToWp) * clampedStep;
              }
            }
          } else if (distToWp <= step) {
            t.sprite.x = target.x;
            t.sprite.y = target.y;
            t.wpIdx++;
            if (t.wpIdx < ROAD_WAYPOINTS.length) {
              this.setTruckRotation(t);
            }
          } else {
            t.sprite.x += (dx / distToWp) * step;
            t.sprite.y += (dy / distToWp) * step;
          }
        }
      }

      // Smooth rotation toward target angle every frame
      let diff = t.targetAngle - t.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      t.angle += Math.max(-TRUCK_TURN_RATE * dt, Math.min(TRUCK_TURN_RATE * dt, diff));
      t.sprite.setRotation(t.angle);
    }
    if (
      this.trucks.length === 0 &&
      this.truckSfx?.isPlaying &&
      !this.truckSfxFade
    ) {
      const sfx = this.truckSfx;
      this.truckSfxFade = this.tweens.add({
        targets: sfx,
        volume: 0,
        duration: 1500,
        ease: "Quad.easeIn",
        onComplete: () => {
          sfx.stop();
          if (this.truckSfx === sfx) this.truckSfx = undefined;
          this.truckSfxFade = undefined;
        },
      });
    }
    const anyShearing = this.sheep.some(
      (s) => s.stage === "adult" && s.shearT > 0 && !s.sold,
    );
    if (anyShearing && !this.shearSfx?.isPlaying) {
      this.shearSfx = this.sound.add("shear", { loop: true, volume: 0.4 });
      this.shearSfx.play();
    } else if (!anyShearing && this.shearSfx?.isPlaying) {
      this.shearSfx.stop();
    }
    const anyGrazing = this.sheep.some(
      (s) => s.stage === "baby" && s.growthT > 0 && !s.sold,
    );
    if (anyGrazing && !this.grazingSfx?.isPlaying) {
      this.grazingSfx = this.sound.add("grazing", { loop: true, volume: 0.35 });
      this.grazingSfx.play();
    } else if (!anyGrazing && this.grazingSfx?.isPlaying) {
      this.grazingSfx.stop();
    }
  }

  spawnSheep(ox?: number, oy?: number): Sheep {
    const jitter = 18;
    let sx: number;
    let sy: number;
    if (ox !== undefined && oy !== undefined) {
      sx = ox + Phaser.Math.Between(-jitter, jitter);
      sy = oy + Phaser.Math.Between(-jitter, jitter);
    } else {
      sx = DROP_X + TRUCK_W / 2 + 20;
      sy = DROP_Y;
    }

    // Head toward the field by default
    const dx = FIELD_CX - sx;
    const dy = FIELD_CY - sy;
    const d = Math.hypot(dx, dy) || 1;
    const v0 = 60;
    const initAngle = Math.atan2(dy, dx);

    const s = this.add.sprite(sx, sy, "sheep").setDepth(5);
    s.setScale(BABY_SHEEP_SCALE);
    s.rotation = initAngle + Math.PI / 2;
    s.play("sheep-walk");
    this.hudCamera.ignore(s);

    const sheep: Sheep = {
      sprite: s,
      vx: (dx / d) * v0,
      vy: (dy / d) * v0,
      angle: initAngle,
      stage: "baby",
      growthT: 0,
      shearT: 0,
      sold: false,
      waiting: false,
      salePrice: 0,
      grazing: false,
      modeT: SHEEP_WALK_MIN_SEC + Math.random() * SHEEP_WALK_MAX_SEC,
      wanderAngle: initAngle,
      scaredMs: 0,
    };
    this.sheep.push(sheep);
    return sheep;
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

  private attachReadyIcon(s: Sheep): void {
    if (s.readyIcon) return;
    const icon = this.add
      .text(s.sprite.x, s.sprite.y - 36, "$", {
        fontFamily: FONT_UI,
        fontSize: 44,
        color: "#ffd700",
        stroke: "#000000",
        strokeThickness: 5,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 1)
      .setDepth(6);
    this.hudCamera.ignore(icon);
    s.readyIcon = icon;
  }

  private playGrownFx(s: Sheep): void {
    this.tweens.add({
      targets: s.sprite,
      scale: ADULT_SHEEP_SCALE * 1.25,
      duration: 140,
      yoyo: true,
      ease: "Quad.easeOut",
    });
    const ring = this.add
      .circle(s.sprite.x, s.sprite.y, 6, 0xffffff, 0)
      .setDepth(11);
    ring.setStrokeStyle(3, 0xbfffae, 1);
    this.hudCamera.ignore(ring);
    this.tweens.add({
      targets: ring,
      radius: SHEEP_RADIUS * 2.6,
      strokeAlpha: 0,
      duration: 500,
      onComplete: () => ring.destroy(),
    });
  }

  private playSaleFx(s: Sheep): void {
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
    const ring = this.add
      .circle(s.sprite.x, s.sprite.y, 6, 0xffffff, 0)
      .setDepth(11);
    ring.setStrokeStyle(3, 0xffe099, 1);
    this.hudCamera.ignore(ring);
    this.tweens.add({
      targets: ring,
      radius: SHEEP_RADIUS * 2.8,
      strokeAlpha: 0,
      duration: 500,
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
      alphaDog: { x: this.alphaDog.sprite.x, y: this.alphaDog.sprite.y },
      dogs: this.dogs.map((d) => ({
        x: d.sprite.x,
        y: d.sprite.y,
      })),
      sheep: this.sheep.map((s) => ({
        x: s.sprite.x,
        y: s.sprite.y,
        stage: s.stage,
        growthT: s.growthT,
      })),
      trucks: this.trucks.map((t) => ({
        x: t.sprite.x,
        y: t.sprite.y,
        state: t.state,
      })),
      field: {
        x: FIELD_CX,
        y: FIELD_CY,
        w: FIELD_W_PX,
        h: FIELD_H_PX,
        capacity: this.fieldCapacity,
        growing: this.babiesGrowing(),
      },
      market: {
        x: MARKET_CX,
        y: MARKET_CY,
        w: MARKET_W_PX,
        h: MARKET_H_PX,
        waiting: this.sheep.filter((s) => s.waiting && !s.sold).length,
      },
      shear: { x: SHEAR_CX, y: SHEAR_CY, w: SHEAR_W_PX, h: SHEAR_H_PX },
      score: this.score,
      coins: this.coins,
      buySheepCost: this.buySheepCost,
      alphaDogSpeed: this.alphaDogSpeed,
      fieldCapacity: this.fieldCapacity,
      speedUpgradeLevel: this.speedUpgradeLevel,
      capacityUpgradeLevel: this.capacityUpgradeLevel,
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
    if (!this.paused) {
      this.accumulator += delta;
      while (this.accumulator >= ShepherdScene.stepMs) {
        this.step();
        this.accumulator -= ShepherdScene.stepMs;
      }
    }
    this.updateHighlight();
    this.updateCamera();
  }

  private step(): void {
    const dt = ShepherdScene.stepSec;
    const dtMs = dt * 1000;

    this.updateTrucks(dt);
    this.checkGameOver();
    this.fieldLabel.setText(
      `FIELD  ${this.babiesGrowing()}/${this.fieldCapacity}`,
    );

    // --- Alpha dog (player-controlled) ---
    {
      let kx = 0;
      let ky = 0;
      if (this.keys && this.arrowKeys) {
        if (this.keys.left.isDown || this.arrowKeys.left.isDown) kx -= 1;
        if (this.keys.right.isDown || this.arrowKeys.right.isDown) kx += 1;
        if (this.keys.up.isDown || this.arrowKeys.up.isDown) ky -= 1;
        if (this.keys.down.isDown || this.arrowKeys.down.isDown) ky += 1;
      }
      let desiredVx = 0;
      let desiredVy = 0;
      if (kx !== 0 || ky !== 0) {
        const klen = Math.hypot(kx, ky);
        desiredVx = (kx / klen) * this.alphaDogSpeed;
        desiredVy = (ky / klen) * this.alphaDogSpeed;
        this.alphaDogTargetX = this.alphaDog.sprite.x;
        this.alphaDogTargetY = this.alphaDog.sprite.y;
      } else {
        const ddx = this.alphaDogTargetX - this.alphaDog.sprite.x;
        const ddy = this.alphaDogTargetY - this.alphaDog.sprite.y;
        const dDist = Math.hypot(ddx, ddy);
        if (dDist > 5) {
          desiredVx = (ddx / dDist) * this.alphaDogSpeed;
          desiredVy = (ddy / dDist) * this.alphaDogSpeed;
        }
      }
      const desiredSpd = Math.hypot(desiredVx, desiredVy);
      let diff = 0;
      const prevAlphaAngle = this.alphaDog.angle;
      if (desiredSpd > 2) {
        diff = Math.atan2(desiredVy, desiredVx) - this.alphaDog.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.alphaDog.angle += Math.max(
          -DOG_TURN_RATE * dt,
          Math.min(DOG_TURN_RATE * dt, diff),
        );
      }
      this.updateDogAnim(this.alphaDog, this.alphaDog.angle - prevAlphaAngle, dt);
      const speed =
        desiredSpd > 2 ? this.alphaDogSpeed * Math.max(0, Math.cos(diff)) : 0;
      this.alphaDog.vx = Math.cos(this.alphaDog.angle) * speed;
      this.alphaDog.vy = Math.sin(this.alphaDog.angle) * speed;
      this.alphaDog.sprite.x += this.alphaDog.vx * dt;
      this.alphaDog.sprite.y += this.alphaDog.vy * dt;
      this.alphaDog.sprite.rotation = this.alphaDog.angle + Math.PI / 2;
      this.alphaDog.sprite.x = Phaser.Math.Clamp(
        this.alphaDog.sprite.x,
        DOG_RADIUS,
        WORLD_W - DOG_RADIUS,
      );
      this.alphaDog.sprite.y = Phaser.Math.Clamp(
        this.alphaDog.sprite.y,
        DOG_RADIUS,
        WORLD_H - DOG_RADIUS,
      );
      if (TREE_COLLISION)
        for (const t of this.mapTrees) {
          const tdx = this.alphaDog.sprite.x - t.x;
          const tdy = this.alphaDog.sprite.y - t.y;
          const td = Math.hypot(tdx, tdy);
          const minDist = t.r + DOG_RADIUS;
          if (td < minDist && td > 0.01) {
            this.alphaDog.sprite.x += (tdx / td) * (minDist - td);
            this.alphaDog.sprite.y += (tdy / td) * (minDist - td);
          }
        }
    }

    // Update facing targets once per step
    this.facingWolf = this.findFacingWolf();
    this.facingSheep = this.facingWolf ? null : this.findFacingSheep();

    // Return herding/defending dogs whose target is gone back to following.
    for (const dog of this.dogs) {
      if (
        dog.mode === "herding" &&
        (!dog.targetSheep || dog.targetSheep.sold || dog.targetSheep.waiting)
      ) {
        dog.mode = "following";
        dog.targetSheep = null;
      }
      if (
        dog.mode === "defending" &&
        (!dog.targetWolf || !this.wolves.includes(dog.targetWolf))
      ) {
        dog.mode = "following";
        dog.targetWolf = null;
      }
    }


    // --- Dog AI ---
    const followingDogs = this.dogs.filter((d) => d.mode === "following");
    const fwdX = Math.cos(this.alphaDog.angle);
    const fwdY = Math.sin(this.alphaDog.angle);
    const perpX = -fwdY;
    const perpY = fwdX;

    for (let i = 0; i < followingDogs.length; i++) {
      const dog = followingDogs[i];
      // Alternate sides: 0→right, 1→left, 2→far-right, ...
      const side =
        i % 2 === 0 ? Math.floor(i / 2) + 1 : -(Math.floor(i / 2) + 1);
      const row = Math.floor(i / 2) + 1;
      const targetX =
        this.alphaDog.sprite.x -
        fwdX * FOLLOW_DIST * row +
        perpX * FOLLOW_SPREAD * side * 0.5;
      const targetY =
        this.alphaDog.sprite.y -
        fwdY * FOLLOW_DIST * row +
        perpY * FOLLOW_SPREAD * side * 0.5;
      const toX = targetX - dog.sprite.x;
      const toY = targetY - dog.sprite.y;
      const toDist = Math.hypot(toX, toY);

      let desiredVx = 0;
      let desiredVy = 0;
      if (toDist > 8) {
        desiredVx = (toX / toDist) * DOG_SPEED;
        desiredVy = (toY / toDist) * DOG_SPEED;
      }
      this.moveDog(dog, desiredVx, desiredVy, dt);
    }

    for (const dog of this.dogs) {
      if (dog.mode !== "herding" || !dog.targetSheep) continue;

      const sx = dog.targetSheep.sprite.x;
      const sy = dog.targetSheep.sprite.y;

      // If a wolf close to my sheep is hunting it, stand between the sheep
      // and the wolf to scare it off without abandoning the sheep.
      const threat = this.wolves.find(
        (w) =>
          w.targetSheep === dog.targetSheep &&
          w.scaredMs === 0 &&
          Math.hypot(w.sprite.x - sx, w.sprite.y - sy) <
          HERD_INTERCEPT_THREAT_RANGE,
      );

      let herdX: number;
      let herdY: number;
      if (threat) {
        // Head straight for the wolf, but stay within a leash of the sheep
        const dx = threat.sprite.x - sx;
        const dy = threat.sprite.y - sy;
        const d = Math.hypot(dx, dy) || 1;
        if (d <= HERD_INTERCEPT_MAX_LEASH) {
          herdX = threat.sprite.x;
          herdY = threat.sprite.y;
        } else {
          herdX = sx + (dx / d) * HERD_INTERCEPT_MAX_LEASH;
          herdY = sy + (dy / d) * HERD_INTERCEPT_MAX_LEASH;
        }
      } else {
        const goal = this.sheepGoal(dog.targetSheep);
        const towardGoalDx = goal.x - sx;
        const towardGoalDy = goal.y - sy;
        // base herd position: behind sheep away from goal
        const baseAngle = Math.atan2(-towardGoalDy, -towardGoalDx);

        // Fan-out: find other herding dogs targeting sheep in the same cluster
        const clusterDogs = this.dogs.filter(
          (d) =>
            d.mode === "herding" &&
            d.targetSheep &&
            Math.hypot(
              d.targetSheep.sprite.x - sx,
              d.targetSheep.sprite.y - sy,
            ) < HIGHLIGHT_CLUSTER_R,
        );
        const myIdx = clusterDogs.indexOf(dog);
        const count = clusterDogs.length;
        const fanSpread = Math.PI / 4;
        const fanAngle =
          count > 1 ? (myIdx / (count - 1) - 0.5) * fanSpread * 2 : 0;

        const herdAngle = baseAngle + fanAngle;
        herdX = sx + Math.cos(herdAngle) * HERD_OFFSET;
        herdY = sy + Math.sin(herdAngle) * HERD_OFFSET;
      }

      const toHerdX = herdX - dog.sprite.x;
      const toHerdY = herdY - dog.sprite.y;
      const toHerdD = Math.hypot(toHerdX, toHerdY);

      let desiredVx = 0;
      let desiredVy = 0;
      if (toHerdD > 5) {
        const approachSpeed = Math.min(toHerdD * 3.5, DOG_SPEED);
        desiredVx = (toHerdX / toHerdD) * approachSpeed;
        desiredVy = (toHerdY / toHerdD) * approachSpeed;
      }
      this.moveDog(dog, desiredVx, desiredVy, dt);
    }

    // --- Defending dogs — charge at full speed, no slowdown ---
    for (const dog of this.dogs) {
      if (dog.mode !== "defending" || !dog.targetWolf) continue;
      const toWolfX = dog.targetWolf.sprite.x - dog.sprite.x;
      const toWolfY = dog.targetWolf.sprite.y - dog.sprite.y;
      const toWolfD = Math.hypot(toWolfX, toWolfY);
      const desiredVx = toWolfD > 1 ? (toWolfX / toWolfD) * DOG_SPEED : 0;
      const desiredVy = toWolfD > 1 ? (toWolfY / toWolfD) * DOG_SPEED : 0;
      this.moveDog(dog, desiredVx, desiredVy, dt);
    }

    // --- Guard dogs — stay at post, charge any wolf within range ---
    for (const dog of this.dogs) {
      if (dog.mode !== "guarding") continue;
      const post = {
        x: dog.postX ?? dog.sprite.x,
        y: dog.postY ?? dog.sprite.y,
      };

      let nearest: Wolf | null = null;
      let bestD = GUARD_RANGE;
      for (const w of this.wolves) {
        const d = Math.hypot(w.sprite.x - post.x, w.sprite.y - post.y);
        if (d < bestD) {
          bestD = d;
          nearest = w;
        }
      }
      dog.targetWolf = nearest;

      let desiredVx = 0;
      let desiredVy = 0;
      if (nearest) {
        const toX = nearest.sprite.x - dog.sprite.x;
        const toY = nearest.sprite.y - dog.sprite.y;
        const toD = Math.hypot(toX, toY);
        if (toD > 1) {
          desiredVx = (toX / toD) * DOG_SPEED;
          desiredVy = (toY / toD) * DOG_SPEED;
        }
      } else {
        const toX = post.x - dog.sprite.x;
        const toY = post.y - dog.sprite.y;
        const toD = Math.hypot(toX, toY);
        if (toD > 5) {
          const spd = Math.min(toD * 3, DOG_SPEED);
          desiredVx = (toX / toD) * spd;
          desiredVy = (toY / toD) * spd;
        }
      }
      this.moveDog(dog, desiredVx, desiredVy, dt);
    }

    // --- Wolf AI ---
    for (let i = this.wolves.length - 1; i >= 0; i--) {
      const wolf = this.wolves[i];

      // Remove if out of world bounds
      if (
        wolf.sprite.x < -60 ||
        wolf.sprite.x > WORLD_W + 60 ||
        wolf.sprite.y < -60 ||
        wolf.sprite.y > WORLD_H + 60
      ) {
        wolf.sprite.destroy();
        this.wolves.splice(i, 1);
        continue;
      }

      wolf.scaredMs = Math.max(0, wolf.scaredMs - dtMs);

      // Howl once when the wolf first enters the visible world bounds
      if (!wolf.howled) {
        if (
          wolf.sprite.x >= 0 &&
          wolf.sprite.x <= WORLD_W &&
          wolf.sprite.y >= 0 &&
          wolf.sprite.y <= WORLD_H
        ) {
          wolf.howled = true;
          this.sound.play("howl", { volume: 0.12 });
        }
      }

      // Dog contact: scare wolf and send it fleeing
      const scareSources: { x: number; y: number }[] = this.alphaDog
        ? [this.alphaDog.sprite]
        : [];
      for (const dog of this.dogs) {
        if (
          (dog.mode === "defending" || dog.mode === "guarding") &&
          dog.targetWolf === wolf
        ) {
          scareSources.push(dog.sprite);
        }
        // Herding dog also scares a wolf that's hunting its sheep
        if (
          dog.mode === "herding" &&
          dog.targetSheep &&
          wolf.targetSheep === dog.targetSheep
        ) {
          scareSources.push(dog.sprite);
        }
      }
      for (const src of scareSources) {
        const ddx = wolf.sprite.x - src.x;
        const ddy = wolf.sprite.y - src.y;
        const dd = Math.hypot(ddx, ddy);
        if (dd < WOLF_CONTACT_RANGE && dd > 0.01) {
          if (wolf.scaredMs <= 0) this.playBarkSound();
          wolf.scaredMs = WOLF_SCARED_MS;
          wolf.vx = (ddx / dd) * WOLF_FLEE_SPEED;
          wolf.vy = (ddy / dd) * WOLF_FLEE_SPEED;
          wolf.angle = Math.atan2(wolf.vy, wolf.vx);
        }
      }

      if (wolf.scaredMs > 0) {
        // Fleeing — maintain flee velocity (slight damping so it doesn't accelerate forever)
        wolf.sprite.x += wolf.vx * dt;
        wolf.sprite.y += wolf.vy * dt;
        wolf.sprite.rotation = wolf.angle + Math.PI / 2;
      } else {
        // Normal: turn toward nearest sheep and move. With a fence built,
        // sheep inside the field are protected and wolves ignore them.
        const targetSafe =
          wolf.targetSheep &&
          (wolf.targetSheep.waiting ||
            (this.fenceBuilt &&
              this.fieldContains(
                wolf.targetSheep.sprite.x,
                wolf.targetSheep.sprite.y,
              )));
        if (
          !wolf.targetSheep ||
          wolf.targetSheep.sold ||
          wolf.targetSheep.waiting ||
          targetSafe
        ) {
          let best: Sheep | null = null;
          let bestDist = Infinity;
          for (const s of this.sheep) {
            if (s.sold || s.waiting) continue;
            if (this.fenceBuilt && this.fieldContains(s.sprite.x, s.sprite.y))
              continue;
            const d = Math.hypot(
              s.sprite.x - wolf.sprite.x,
              s.sprite.y - wolf.sprite.y,
            );
            if (d < bestDist) {
              bestDist = d;
              best = s;
            }
          }
          wolf.targetSheep = best;
        }

        let desiredVx = 0;
        let desiredVy = 0;
        if (wolf.targetSheep) {
          const dx = wolf.targetSheep.sprite.x - wolf.sprite.x;
          const dy = wolf.targetSheep.sprite.y - wolf.sprite.y;
          const d = Math.hypot(dx, dy);
          if (d < WOLF_EAT_RANGE) {
            const eaten = wolf.targetSheep;
            const idx = this.sheep.indexOf(eaten);
            if (idx !== -1) {
              this.playEatFx(eaten.sprite.x, eaten.sprite.y);
              this.sound.play("bite");
              this.sheep[idx].readyIcon?.destroy();
              this.sheep[idx].sprite.destroy();
              this.sheep.splice(idx, 1);
              for (const dog of this.dogs) {
                if (dog.targetSheep === eaten) {
                  dog.targetSheep = null;
                  dog.mode = "following";
                }
              }
              if (this.alphaDog.targetSheep === eaten) {
                this.alphaDog.targetSheep = null;
                this.alphaDog.mode = "following";
              }
              for (const w of this.wolves) {
                if (w.targetSheep === eaten) w.targetSheep = null;
              }
              if (this.facingSheep === eaten) this.facingSheep = null;
            }
            wolf.targetSheep = null;
          } else {
            desiredVx = (dx / d) * WOLF_NORMAL_SPEED;
            desiredVy = (dy / d) * WOLF_NORMAL_SPEED;
          }
        }

        const desiredSpd = Math.hypot(desiredVx, desiredVy);
        if (desiredSpd > 2) {
          let diff = Math.atan2(desiredVy, desiredVx) - wolf.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          wolf.angle += Math.max(
            -WOLF_TURN_RATE * dt,
            Math.min(WOLF_TURN_RATE * dt, diff),
          );
        }
        // No target: keep drifting in current direction so the wolf exits the map
        wolf.vx = Math.cos(wolf.angle) * WOLF_NORMAL_SPEED;
        wolf.vy = Math.sin(wolf.angle) * WOLF_NORMAL_SPEED;
        wolf.sprite.x += wolf.vx * dt;
        wolf.sprite.y += wolf.vy * dt;
        wolf.sprite.rotation = wolf.angle + Math.PI / 2;
      }

      // Field fence — with a fence, wolves can't enter. Push any wolf inside
      // the field out to the nearest edge and reflect its velocity.
      if (this.fenceBuilt) this.pushOutOfField(wolf.sprite, wolf);
    }

    // --- Sheep behavior ---
    for (let i = 0; i < this.sheep.length; i++) {
      const s = this.sheep[i];
      if (s.sold) continue;

      // Waiting sheep wander slowly, confined to market rect
      if (s.waiting) {
        s.wanderAngle += (Math.random() - 0.5) * 0.3;
        const wvx = Math.cos(s.wanderAngle) * MARKET_WANDER_SPEED;
        const wvy = Math.sin(s.wanderAngle) * MARKET_WANDER_SPEED;
        s.sprite.x += wvx * dt;
        s.sprite.y += wvy * dt;
        s.angle = s.wanderAngle;
        s.sprite.rotation = s.angle + Math.PI / 2;
        const minX = MARKET_CX - MARKET_W_PX / 2 + SHEEP_RADIUS;
        const maxX = MARKET_CX + MARKET_W_PX / 2 - SHEEP_RADIUS;
        const minY = MARKET_CY - MARKET_H_PX / 2 + SHEEP_RADIUS;
        const maxY = MARKET_CY + MARKET_H_PX / 2 - SHEEP_RADIUS;
        if (s.sprite.x < minX) {
          s.sprite.x = minX;
          s.wanderAngle = Math.PI - s.wanderAngle;
        } else if (s.sprite.x > maxX) {
          s.sprite.x = maxX;
          s.wanderAngle = Math.PI - s.wanderAngle;
        }
        if (s.sprite.y < minY) {
          s.sprite.y = minY;
          s.wanderAngle = -s.wanderAngle;
        } else if (s.sprite.y > maxY) {
          s.sprite.y = maxY;
          s.wanderAngle = -s.wanderAngle;
        }
        continue;
      }

      let ax = 0;
      let ay = 0;

      // Flee from ALL dogs (alpha + AI)
      for (const dog of [this.alphaDog, ...this.dogs]) {
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
        if (o.sold || o.waiting) continue;
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
        if (o.sold || o.waiting) continue;
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

      if (s.readyIcon) {
        const bob = Math.sin(Date.now() / 180) * 4;
        s.readyIcon.setPosition(s.sprite.x, s.sprite.y - 32 + bob);
      }

      // Delete sheep that have fully left the world
      if (
        s.sprite.x < -SHEEP_RADIUS * 2 ||
        s.sprite.x > WORLD_W + SHEEP_RADIUS * 2 ||
        s.sprite.y < -SHEEP_RADIUS * 2 ||
        s.sprite.y > WORLD_H + SHEEP_RADIUS * 2
      ) {
        s.readyIcon?.destroy();
        s.sprite.destroy();
        this.sheep.splice(i, 1);
        i--;
        for (const dog of this.dogs) {
          if (dog.targetSheep === s) {
            dog.targetSheep = null;
            dog.mode = "following";
          }
        }
        if (this.alphaDog.targetSheep === s) {
          this.alphaDog.targetSheep = null;
          this.alphaDog.mode = "following";
        }
        for (const wolf of this.wolves) {
          if (wolf.targetSheep === s) wolf.targetSheep = null;
        }
        if (this.facingSheep === s) this.facingSheep = null;
        continue;
      }

      if (TREE_COLLISION)
        for (const t of this.mapTrees) {
          const tdx = s.sprite.x - t.x;
          const tdy = s.sprite.y - t.y;
          const td = Math.hypot(tdx, tdy);
          const minDist = t.r + SHEEP_RADIUS;
          if (td < minDist && td > 0.01) {
            s.sprite.x += (tdx / td) * (minDist - td);
            s.sprite.y += (tdy / td) * (minDist - td);
          }
        }

      // Building collision — push sheep out of building footprints unless they
      // legitimately belong inside (waiting to sell, shearing, growing)
      if (!s.waiting)
        this.pushOutOfRect(MARKET_CX, MARKET_CY, MARKET_W_PX, MARKET_H_PX, s.sprite, s);
      if (s.shearT === 0)
        this.pushOutOfRect(SHEAR_CX, SHEAR_CY, SHEAR_W_PX, SHEAR_H_PX, s.sprite, s);
      if (s.stage === "adult")
        this.pushOutOfRect(FIELD_CX, FIELD_CY, FIELD_W_PX, FIELD_H_PX, s.sprite, s);

      // Babies that have started growing can't leave the field until adult
      if (s.stage === "baby" && s.growthT > 0) {
        const minX = FIELD_CX - FIELD_W_PX / 2 + SHEEP_RADIUS;
        const maxX = FIELD_CX + FIELD_W_PX / 2 - SHEEP_RADIUS;
        const minY = FIELD_CY - FIELD_H_PX / 2 + SHEEP_RADIUS;
        const maxY = FIELD_CY + FIELD_H_PX / 2 - SHEEP_RADIUS;
        if (s.sprite.x < minX) {
          s.sprite.x = minX;
          s.vx = Math.abs(s.vx);
        } else if (s.sprite.x > maxX) {
          s.sprite.x = maxX;
          s.vx = -Math.abs(s.vx);
        }
        if (s.sprite.y < minY) {
          s.sprite.y = minY;
          s.vy = Math.abs(s.vy);
        } else if (s.sprite.y > maxY) {
          s.sprite.y = maxY;
          s.vy = -Math.abs(s.vy);
        }
      }

      // Adults being sheared can't leave the shed until the shear finishes
      if (s.stage === "adult" && s.shearT > 0) {
        const minX = SHEAR_CX - SHEAR_W_PX / 2 + SHEEP_RADIUS;
        const maxX = SHEAR_CX + SHEAR_W_PX / 2 - SHEEP_RADIUS;
        const minY = SHEAR_CY - SHEAR_H_PX / 2 + SHEEP_RADIUS;
        const maxY = SHEAR_CY + SHEAR_H_PX / 2 - SHEEP_RADIUS;
        if (s.sprite.x < minX) {
          s.sprite.x = minX;
          s.vx = Math.abs(s.vx);
        } else if (s.sprite.x > maxX) {
          s.sprite.x = maxX;
          s.vx = -Math.abs(s.vx);
        }
        if (s.sprite.y < minY) {
          s.sprite.y = minY;
          s.vy = Math.abs(s.vy);
        } else if (s.sprite.y > maxY) {
          s.sprite.y = maxY;
          s.vy = -Math.abs(s.vy);
        }
      }

      // Field capacity — field is full, new babies are bounced off the fence.
      // Sheep already growing (growthT > 0) are handled by the containment
      // clamp above, so this only affects newcomers trying to enter.
      if (
        s.stage === "baby" &&
        s.growthT === 0 &&
        this.babiesGrowing() >= this.fieldCapacity
      ) {
        this.pushOutOfField(s.sprite, s);
      }

      // Field growth — babies grow into adults while in the field
      if (s.stage === "baby" && this.fieldContains(s.sprite.x, s.sprite.y)) {
        s.growthT += dt;
        const t = Math.min(1, s.growthT / GROW_SEC);
        const scale =
          BABY_SHEEP_SCALE + (ADULT_SHEEP_SCALE - BABY_SHEEP_SCALE) * t;
        s.sprite.setScale(scale);
        if (s.growthT >= GROW_SEC) {
          s.stage = "adult";
          s.sprite.setScale(ADULT_SHEEP_SCALE);
          this.sound.play("score");
          this.playGrownFx(s);
          this.attachReadyIcon(s);
        }
      }

      // Shearing — adults inside the shear shed progressively shrink back to
      // babies over SHEAR_SEC seconds. Leaving the shed resets progress.
      if (
        s.stage === "adult" &&
        !s.sold &&
        this.shearContains(s.sprite.x, s.sprite.y)
      ) {
        s.shearT += dt;
        const t = Math.min(1, s.shearT / SHEAR_SEC);
        const scale =
          ADULT_SHEEP_SCALE - (ADULT_SHEEP_SCALE - BABY_SHEEP_SCALE) * t;
        s.sprite.setScale(scale);
        if (s.shearT >= SHEAR_SEC) {
          this.coins += SHEAR_VALUE;
          this.updateCoinText();
          this.sound.play("pop");
          this.playShearFx(s);
          s.stage = "baby";
          s.growthT = 0;
          s.shearT = 0;
          s.sprite.setScale(BABY_SHEEP_SCALE);
          s.readyIcon?.destroy();
          s.readyIcon = undefined;
        }
      } else if (s.stage === "adult" && s.shearT > 0) {
        // Left the shed mid-shear — reset progress and scale
        s.shearT = 0;
        s.sprite.setScale(ADULT_SHEEP_SCALE);
      }

      // Market — adults entering the market wait, then sell individually
      if (
        s.stage === "adult" &&
        !s.waiting &&
        this.marketContains(s.sprite.x, s.sprite.y)
      ) {
        s.waiting = true;
        s.vx *= 0.2;
        s.vy *= 0.2;
        s.salePrice =
          SALE_PRICE_MIN +
          Math.floor(Math.random() * (SALE_PRICE_MAX - SALE_PRICE_MIN + 1));
        if (s.readyIcon) {
          this.tweens.add({
            targets: s.readyIcon,
            alpha: 0,
            y: s.readyIcon.y - 40,
            duration: 500,
            onComplete: () => s.readyIcon?.destroy(),
          });
          s.readyIcon = undefined;
        }
        this.updateMarketCountText();
        this.scheduleSheepSale(s);
      }

      // Fade sheep when inside a building footprint
      const insideBuilding =
        this.marketContains(s.sprite.x, s.sprite.y) ||
        this.shearContains(s.sprite.x, s.sprite.y) ||
        this.fieldContains(s.sprite.x, s.sprite.y);
      s.sprite.setAlpha(insideBuilding ? 0.25 : 1);
    }

    // Positional overlap resolution
    const minSep = SHEEP_RADIUS * 2;
    for (let i = 0; i < this.sheep.length; i++) {
      const a = this.sheep[i];
      if (a.sold || a.waiting) continue;
      for (let j = i + 1; j < this.sheep.length; j++) {
        const b = this.sheep[j];
        if (b.sold || b.waiting) continue;
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

  private updateDogAnim(dog: Dog, angleDelta: number, dt: number): void {
    const rawRate = dt > 0 ? Math.abs(angleDelta) / dt : 0;
    const alpha = 1 - Math.exp(-dt / 0.12); // ~0.12s time constant
    dog.smoothedTurnRate += (rawRate - dog.smoothedTurnRate) * alpha;
    const r = dog.smoothedTurnRate;
    let key: string;
    if (r < DOG_TURN_RATE * 0.2) key = "dog_straight";
    else if (r < DOG_TURN_RATE * 0.5) key = "dog_bend_min";
    else if (r < DOG_TURN_RATE * 0.8) key = "dog_bend_mid";
    else key = "dog_bend_max";
    if (dog.sprite.anims.currentAnim?.key !== key) {
      const progress = dog.sprite.anims.getProgress();
      dog.sprite.play(key, true);
      dog.sprite.anims.setProgress(progress);
    }
    dog.sprite.setFlipX(angleDelta < -0.0001);
  }

  private moveDog(
    dog: Dog,
    desiredVx: number,
    desiredVy: number,
    dt: number,
  ): void {
    const desiredSpd = Math.hypot(desiredVx, desiredVy);
    const prevAngle = dog.angle;
    if (desiredSpd > 2) {
      let diff = Math.atan2(desiredVy, desiredVx) - dog.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      dog.angle += Math.max(
        -DOG_TURN_RATE * dt,
        Math.min(DOG_TURN_RATE * dt, diff),
      );
      dog.vx = Math.cos(dog.angle) * desiredSpd;
      dog.vy = Math.sin(dog.angle) * desiredSpd;
    } else {
      dog.vx = 0;
      dog.vy = 0;
    }
    this.updateDogAnim(dog, dog.angle - prevAngle, dt);
    dog.sprite.x += dog.vx * dt;
    dog.sprite.y += dog.vy * dt;
    dog.sprite.rotation = dog.angle + Math.PI / 2;
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
    if (TREE_COLLISION)
      for (const t of this.mapTrees) {
        const tdx = dog.sprite.x - t.x;
        const tdy = dog.sprite.y - t.y;
        const td = Math.hypot(tdx, tdy);
        const minDist = t.r + DOG_RADIUS;
        if (td < minDist && td > 0.01) {
          dog.sprite.x += (tdx / td) * (minDist - td);
          dog.sprite.y += (tdy / td) * (minDist - td);
        }
      }
  }

  private findFacingWolf(): Wolf | null {
    const fwdX = Math.cos(this.alphaDog.angle);
    const fwdY = Math.sin(this.alphaDog.angle);
    let best: Wolf | null = null;
    let bestDot = Math.cos(FACING_CONE);
    for (const w of this.wolves) {
      const dx = w.sprite.x - this.alphaDog.sprite.x;
      const dy = w.sprite.y - this.alphaDog.sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist > FACING_RANGE || dist < 0.01) continue;
      const dot = (dx / dist) * fwdX + (dy / dist) * fwdY;
      if (dot > bestDot) {
        bestDot = dot;
        best = w;
      }
    }
    return best;
  }

  private findFacingSheep(): Sheep | null {
    const fwdX = Math.cos(this.alphaDog.angle);
    const fwdY = Math.sin(this.alphaDog.angle);
    let best: Sheep | null = null;
    let bestDot = Math.cos(FACING_CONE);
    for (const s of this.sheep) {
      if (s.sold || s.waiting) continue;
      const dx = s.sprite.x - this.alphaDog.sprite.x;
      const dy = s.sprite.y - this.alphaDog.sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist > FACING_RANGE || dist < 0.01) continue;
      const dot = (dx / dist) * fwdX + (dy / dist) * fwdY;
      if (dot > bestDot) {
        bestDot = dot;
        best = s;
      }
    }
    return best;
  }

  private dispatchFollower(): void {
    const follower = this.dogs.find((d) => d.mode === "following");
    if (!follower) return;
    if (this.facingWolf) {
      follower.mode = "defending";
      follower.targetWolf = this.facingWolf;
    } else if (this.facingSheep) {
      follower.mode = "herding";
      follower.targetSheep = this.facingSheep;
    } else {
      return;
    }
    this.playBarkSound();
    const ring = this.add
      .circle(this.alphaDog.sprite.x, this.alphaDog.sprite.y, 10, 0xffffff, 0)
      .setDepth(12);
    ring.setStrokeStyle(4, 0xffd700, 1);
    this.hudCamera.ignore(ring);
    this.tweens.add({
      targets: ring,
      radius: 90,
      strokeAlpha: 0,
      duration: 350,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    });
  }

  private updateHighlight(): void {
    this.highlightGfx.clear();
    const pulse =
      0.55 + 0.45 * Math.sin(((Date.now() % 800) / 800) * Math.PI * 2);
    if (this.facingWolf) {
      this.highlightGfx.lineStyle(3, 0xff4444, pulse);
      this.highlightGfx.strokeRect(
        this.facingWolf.sprite.x - WOLF_W / 2 - 8,
        this.facingWolf.sprite.y - WOLF_H / 2 - 8,
        WOLF_W + 16,
        WOLF_H + 16,
      );
    } else if (this.facingSheep) {
      for (const s of this.sheep) {
        if (s.sold) continue;
        if (
          Math.hypot(
            s.sprite.x - this.facingSheep.sprite.x,
            s.sprite.y - this.facingSheep.sprite.y,
          ) > HIGHLIGHT_CLUSTER_R
        )
          continue;
        this.highlightGfx.lineStyle(3, 0xffd700, pulse);
        this.highlightGfx.strokeCircle(
          s.sprite.x,
          s.sprite.y,
          SHEEP_RADIUS + 7,
        );
      }
    }
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

    const grassModeLabels = ["Original", "Random", "Noise"];
    const grassBtn = document.createElement("button");
    const updateGrassBtn = () => {
      grassBtn.textContent = `Grass: ${grassModeLabels[this.grassMode]}`;
    };
    updateGrassBtn();
    grassBtn.style.cssText =
      "width:100%;padding:6px;margin-bottom:10px;border:1px solid #486;" +
      "background:#243;color:#afa;cursor:pointer;font:12px monospace;border-radius:3px;";
    grassBtn.addEventListener("click", () => {
      this.grassMode = ((this.grassMode + 1) % 3) as 0 | 1 | 2;
      this.buildGrass();
      updateGrassBtn();
    });
    panel.appendChild(grassBtn);

    const moneyBtn = document.createElement("button");
    moneyBtn.textContent = "+$99999";
    moneyBtn.style.cssText =
      "width:100%;padding:6px;margin-bottom:10px;border:1px solid #6a4;" +
      "background:#243;color:#afa;cursor:pointer;font:12px monospace;border-radius:3px;";
    moneyBtn.addEventListener("click", () => {
      this.coins += 99999;
      this.updateCoinText();
      this.updateShopButtons();
    });
    panel.appendChild(moneyBtn);

    const stats = document.createElement("div");
    stats.style.cssText =
      "margin-bottom:10px;padding:4px 6px;background:#1a1a2e;border-radius:3px;color:#fa8;";
    const refreshStats = () => {
      const alive = this.sheep.filter((s) => !s.sold).length;
      stats.textContent = `sheep: ${alive}  dogs: ${this.dogs.length}`;
      if (this.debugPanel) requestAnimationFrame(refreshStats);
    };
    refreshStats();
    panel.appendChild(stats);

    const dogVisualsRow = document.createElement("label");
    dogVisualsRow.style.cssText =
      "display:flex;align-items:center;gap:6px;margin-bottom:10px;cursor:pointer;";
    const dogVisualsCheck = document.createElement("input");
    dogVisualsCheck.type = "checkbox";
    dogVisualsCheck.checked = this.dogVisuals;
    dogVisualsCheck.addEventListener("change", () => {
      this.dogVisuals = dogVisualsCheck.checked;
    });
    dogVisualsRow.appendChild(dogVisualsCheck);
    dogVisualsRow.appendChild(document.createTextNode("Dog state colours"));
    panel.appendChild(dogVisualsRow);

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
        variant: Math.floor(Math.random() * 5),
      });
    } else {
      this.mapSpawns.push({ x: Math.round(wp.x), y: Math.round(wp.y) });
    }
  }

  private editorDeleteNearest(x: number, y: number): void {
    let bestIdx = -1;
    let bestDist = 120;
    if (this.editorTool === "tree") {
      for (let i = 0; i < this.mapTrees.length; i++) {
        const d = Math.hypot(x - this.mapTrees[i].x, y - this.mapTrees[i].y);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      if (bestIdx >= 0) this.mapTrees.splice(bestIdx, 1);
    } else {
      for (let i = 0; i < this.mapSpawns.length; i++) {
        const d = Math.hypot(x - this.mapSpawns[i].x, y - this.mapSpawns[i].y);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      if (bestIdx >= 0) this.mapSpawns.splice(bestIdx, 1);
    }
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
    this.bgMusic?.stop();
    this.bgMusic = undefined;
    this.truckSfxFade?.stop();
    this.truckSfxFade = undefined;
    this.truckSfx?.stop();
    this.truckSfx = undefined;
    this.shearSfx?.stop();
    this.shearSfx = undefined;
    this.grazingSfx?.stop();
    this.grazingSfx = undefined;
  }
}
