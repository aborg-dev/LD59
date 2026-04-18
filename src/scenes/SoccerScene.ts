import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

const ROUND_DURATION_SEC = 30;
export const HUD_TOP_H = 70;
export const HUD_BOTTOM_H = 80;
export const FIELD_W = 720;
export const FIELD_H = 1280;

export interface SoccerSceneState {
  active: boolean;
  ball: { x: number; y: number; radius: number };
  velocity: { x: number; y: number };
  dragging: boolean;
  score: number;
  timeLeft: number;
  goal: { x: number; y: number; width: number; height: number };
  physics: { friction: number; bounce: number };
  viewport: { width: number; height: number };
}

export class SoccerScene extends Phaser.Scene {
  private ball!: Phaser.GameObjects.Sprite;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private velocityX = 0;
  private velocityY = 0;
  private accumulator = 0;
  private score = 0;
  private timeRemaining = ROUND_DURATION_SEC;
  private canScore = true;
  private gameOver = false;
  private readonly friction = 0.98;
  private readonly bounce = 0.8;
  private readonly radius = 50;

  private muteText!: Phaser.GameObjects.Text;

  // Keeper
  private keeper!: Phaser.GameObjects.Rectangle;
  private readonly keeperW = 90;
  private readonly keeperH = 18;
  private readonly keeperSpeed = 280;

  private dragging = false;
  private lastDragTime = 0;
  private dragVelX = 0;
  private dragVelY = 0;

  // Goal zone
  private goalX = 0;
  private goalY = 0;
  private goalW = 0;
  private goalH = 0;

  private get timeLeft(): number {
    return this.timeRemaining;
  }

  constructor() {
    super("Soccer");
  }

  create(): void {
    const { width, height } = this.scale;
    const fieldTop = HUD_TOP_H;
    const fieldBottom = height - HUD_BOTTOM_H;
    const fieldH = fieldBottom - fieldTop;

    this.score = 0;
    this.timeRemaining = ROUND_DURATION_SEC;
    this.accumulator = 0;
    this.gameOver = false;
    this.canScore = true;
    this.velocityX = 0;
    this.velocityY = 0;
    this.dragging = false;

    // Court background — fits inside the field area only
    const bg = this.add.image(width / 2, fieldTop + fieldH / 2, "court");
    bg.setDisplaySize(width, fieldH);

    // Goal zone (relative to the field area)
    const margin = 25;
    const pitchW = width - margin * 2;
    const pitchH = fieldH - margin * 2;
    this.goalW = pitchW * 0.3;
    this.goalH = pitchH * 0.12;
    this.goalX = width / 2 - this.goalW / 2;
    this.goalY = fieldTop + margin;

    // Goalkeeper — patrols the bottom edge of the goal zone
    this.keeper = this.add.rectangle(
      this.goalX + this.keeperW / 2,
      this.goalY + this.goalH,
      this.keeperW,
      this.keeperH,
      0xffcc00,
    );

    // --- Top bar (timer + score) ---
    this.add
      .rectangle(width / 2, 0, width, HUD_TOP_H, 0x111122)
      .setOrigin(0.5, 0)
      .setDepth(100);

    this.timerText = this.add.text(
      24,
      HUD_TOP_H / 2,
      String(ROUND_DURATION_SEC),
      {
        fontFamily: FONT_UI,
        fontSize: 36,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      },
    );
    this.timerText.setOrigin(0, 0.5).setDepth(101);

    // Countdown timer — ticks once per second
    this.time.addEvent({
      delay: 1000,
      repeat: ROUND_DURATION_SEC - 1,
      callback: () => {
        this.timeRemaining--;
        this.timerText.setText(String(this.timeRemaining));
        if (this.timeRemaining <= 5) {
          this.timerText.setColor("#ff4444");
        }
        if (this.timeRemaining <= 0) {
          this.endGame();
        }
      },
    });

    this.scoreText = this.add.text(width - 24, HUD_TOP_H / 2, "0 goals", {
      fontFamily: FONT_UI,
      fontSize: 36,
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
      resolution: TEXT_RESOLUTION,
    });
    this.scoreText.setOrigin(1, 0.5).setDepth(101);

    // --- Bottom bar (restart + mute) ---
    this.add
      .rectangle(width / 2, height, width, HUD_BOTTOM_H, 0x111122)
      .setOrigin(0.5, 1)
      .setDepth(100);

    const btnY = fieldBottom + HUD_BOTTOM_H / 2;

    const btnStyle = {
      fontFamily: FONT_BODY,
      fontSize: 22,
      color: "#ffffff",
      backgroundColor: "#333344",
      padding: { left: 18, right: 18, top: 10, bottom: 10 },
      resolution: TEXT_RESOLUTION,
    };

    const restartText = this.add
      .text(width / 2 - 200, btnY, "RESTART", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });

    restartText.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.restart();
    });

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

    // Ball — spawns in the lower portion of the field
    this.ball = this.add.sprite(width / 2, fieldTop + fieldH * 0.7, "ball");
    this.ball.setDisplaySize(this.radius * 2, this.radius * 2);
    this.ball.setInteractive({ draggable: true, useHandCursor: true });

    // Drag-and-release controls (built-in Phaser drag)
    this.ball.on("dragstart", () => {
      if (this.gameOver) return;
      this.dragging = true;
      this.velocityX = 0;
      this.velocityY = 0;
      this.dragVelX = 0;
      this.dragVelY = 0;
      this.lastDragTime = this.time.now;
    });

    this.ball.on(
      "drag",
      (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        const { width, height } = this.scale;
        const prevX = this.ball.x;
        const prevY = this.ball.y;
        this.ball.x = Math.max(
          this.radius,
          Math.min(dragX, width - this.radius),
        );
        this.ball.y = Math.max(
          HUD_TOP_H + this.radius,
          Math.min(dragY, height - HUD_BOTTOM_H - this.radius),
        );
        const now = this.time.now;
        const dt = (now - this.lastDragTime) / 1000;
        if (dt > 0) {
          this.dragVelX = (this.ball.x - prevX) / dt;
          this.dragVelY = (this.ball.y - prevY) / dt;
        }
        this.lastDragTime = now;
      },
    );

    this.ball.on("dragend", () => {
      this.dragging = false;
      // Drop stale velocity if drag ended without recent movement
      if (this.time.now - this.lastDragTime > 100) {
        this.dragVelX = 0;
        this.dragVelY = 0;
      }
      this.velocityX = this.dragVelX;
      this.velocityY = this.dragVelY;
      if (Math.hypot(this.velocityX, this.velocityY) > 50) {
        this.sound.play("bounce");
      }
    });
  }

  private prevBallY = 0;

  private checkScore(): void {
    const minY = Math.min(this.prevBallY, this.ball.y);
    const maxY = Math.max(this.prevBallY, this.ball.y);
    const crossedGoalY = minY <= this.goalY + this.goalH && maxY >= this.goalY;
    const inGoalX =
      this.ball.x >= this.goalX && this.ball.x <= this.goalX + this.goalW;
    const inGoal = crossedGoalY && inGoalX;

    if (inGoal) {
      if (this.canScore) {
        this.score++;
        this.scoreText.setText(
          `${this.score} ${this.score === 1 ? "goal" : "goals"}`,
        );
        this.sound.play("score");
        this.canScore = false;

        this.ball.setVisible(false);
        this.velocityX = 0;
        this.velocityY = 0;
        this.time.delayedCall(500, () => {
          const { width, height } = this.scale;
          const fieldH = height - HUD_TOP_H - HUD_BOTTOM_H;
          this.ball.x = width / 2;
          this.ball.y = HUD_TOP_H + fieldH * 0.7;
          this.ball.rotation = 0;
          this.ball.setVisible(true);
        });
      }
    } else {
      this.canScore = true;
    }
  }

  private endGame(): void {
    this.gameOver = true;
    this.velocityX = 0;
    this.velocityY = 0;
    this.scene.start("GameOver", { score: this.score, returnScene: "Soccer" });
  }

  dumpState(): SoccerSceneState {
    return {
      active: this.scene.isActive(),
      ball: { x: this.ball.x, y: this.ball.y, radius: this.radius },
      velocity: { x: this.velocityX, y: this.velocityY },
      dragging: this.dragging,
      score: this.score,
      timeLeft: this.timeLeft,
      goal: {
        x: this.goalX,
        y: this.goalY,
        width: this.goalW,
        height: this.goalH,
      },
      physics: { friction: this.friction, bounce: this.bounce },
      viewport: { width: this.scale.width, height: this.scale.height },
    };
  }

  private static readonly stepMs = 16.666;
  private static readonly stepSec = SoccerScene.stepMs / 1000;

  update(_time: number, delta: number): void {
    if (this.gameOver) return;

    this.accumulator += delta;
    while (this.accumulator >= SoccerScene.stepMs) {
      this.step();
      if (this.gameOver) return;
      this.accumulator -= SoccerScene.stepMs;
    }
  }

  private step(): void {
    if (!this.ball.visible) return;
    if (this.dragging) return;

    const dt = SoccerScene.stepSec;
    const { width, height } = this.scale;
    const fieldTop = HUD_TOP_H;
    const fieldBottom = height - HUD_BOTTOM_H;

    this.prevBallY = this.ball.y;

    this.ball.x += this.velocityX * dt;
    this.ball.y += this.velocityY * dt;

    // Spin based on movement speed
    const speed = Math.hypot(this.velocityX, this.velocityY);
    this.ball.rotation += (speed / this.radius) * dt;

    // Keeper AI — track ball x with limited speed
    const keeperMinX = this.goalX + this.keeperW / 2;
    const keeperMaxX = this.goalX + this.goalW - this.keeperW / 2;
    const targetX = Math.max(keeperMinX, Math.min(this.ball.x, keeperMaxX));
    const diff = targetX - this.keeper.x;
    const maxMove = this.keeperSpeed * dt;
    this.keeper.x += Math.sign(diff) * Math.min(Math.abs(diff), maxMove);

    // Ball-keeper collision (circle vs AABB)
    const kLeft = this.keeper.x - this.keeperW / 2;
    const kRight = this.keeper.x + this.keeperW / 2;
    const kTop = this.keeper.y - this.keeperH / 2;
    const kBottom = this.keeper.y + this.keeperH / 2;
    const closestX = Math.max(kLeft, Math.min(this.ball.x, kRight));
    const closestY = Math.max(kTop, Math.min(this.ball.y, kBottom));
    const distX = this.ball.x - closestX;
    const distY = this.ball.y - closestY;
    if (distX * distX + distY * distY < this.radius * this.radius) {
      // Push ball out and deflect
      if (Math.abs(distY) >= Math.abs(distX)) {
        // Vertical hit — bounce downward
        this.ball.y = kBottom + this.radius;
        this.velocityY = Math.abs(this.velocityY) * this.bounce;
      } else {
        // Side hit — bounce sideways
        this.ball.x += Math.sign(distX) * (this.radius - Math.abs(distX) + 1);
        this.velocityX =
          Math.sign(distX) * Math.abs(this.velocityX) * this.bounce;
      }
      // Add some keeper deflection to make saves feel dynamic
      this.velocityX += (this.ball.x - this.keeper.x) * 2;
      this.sound.play("bounce");
    }

    // Check for score
    this.checkScore();

    // Bounce off field edges
    if (this.ball.x - this.radius < 0) {
      this.ball.x = this.radius;
      this.sound.play("bounce");
      this.velocityX = Math.abs(this.velocityX) * this.bounce;
    } else if (this.ball.x + this.radius > width) {
      this.ball.x = width - this.radius;
      this.sound.play("bounce");
      this.velocityX = -Math.abs(this.velocityX) * this.bounce;
    }

    if (this.ball.y - this.radius < fieldTop) {
      this.ball.y = fieldTop + this.radius;
      this.sound.play("bounce");
      this.velocityY = Math.abs(this.velocityY) * this.bounce;
    } else if (this.ball.y + this.radius > fieldBottom) {
      this.ball.y = fieldBottom - this.radius;
      this.sound.play("bounce");
      this.velocityY = -Math.abs(this.velocityY) * this.bounce;
    }

    // Friction
    this.velocityX *= this.friction;
    this.velocityY *= this.friction;

    // Stop when slow enough
    if (Math.abs(this.velocityX) < 0.5) this.velocityX = 0;
    if (Math.abs(this.velocityY) < 0.5) this.velocityY = 0;
  }
}
