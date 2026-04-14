import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

const ROUND_DURATION_SEC = 30;
export const HUD_TOP_H = 70;
export const HUD_BOTTOM_H = 80;
export const FIELD_W = 720;
export const FIELD_H = 1280;

export interface GameSceneState {
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

export class GameScene extends Phaser.Scene {
  private ball!: Phaser.GameObjects.Sprite;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private velocityX = 0;
  private velocityY = 0;
  private accumulator = 0;
  private score = 0;
  private elapsed = 0;
  private resetDelay = 0;
  private canScore = true;
  private gameOver = false;
  private readonly friction = 0.98;
  private readonly bounce = 0.8;
  private readonly radius = 50;
  private readonly kickReach = 80;

  private muteText!: Phaser.GameObjects.Text;

  // Swipe tracking
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeStartTime = 0;
  private swiping = false;

  // Goal zone
  private goalX = 0;
  private goalY = 0;
  private goalW = 0;
  private goalH = 0;

  private get timeLeft(): number {
    return Math.max(0, ROUND_DURATION_SEC - Math.floor(this.elapsed / 1000));
  }

  constructor() {
    super("GameScene");
  }

  create(): void {
    const { width, height } = this.scale;
    const fieldTop = HUD_TOP_H;
    const fieldBottom = height - HUD_BOTTOM_H;
    const fieldH = fieldBottom - fieldTop;

    this.score = 0;
    this.elapsed = 0;
    this.accumulator = 0;
    this.resetDelay = 0;
    this.gameOver = false;
    this.canScore = true;
    this.velocityX = 0;
    this.velocityY = 0;
    this.swiping = false;

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

    const restartText = this.add
      .text(width / 2 - 130, btnY, "RESTART", {
        fontFamily: FONT_BODY,
        fontSize: 22,
        color: "#ffffff",
        backgroundColor: "#333344",
        padding: { left: 18, right: 18, top: 10, bottom: 10 },
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });

    restartText.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.restart();
    });

    const muted = this.game.sound.mute;
    this.muteText = this.add
      .text(width / 2 + 130, btnY, muted ? "UNMUTE" : "MUTE", {
        fontFamily: FONT_BODY,
        fontSize: 22,
        color: "#ffffff",
        backgroundColor: "#333344",
        padding: { left: 18, right: 18, top: 10, bottom: 10 },
        resolution: TEXT_RESOLUTION,
      })
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

    // Kick controls — swipe near the ball to kick it
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.gameOver || !this.ball.visible) return;
      if (pointer.y < fieldTop || pointer.y > fieldBottom) return;

      // Tap on a moving ball -> stop it
      const dist = Math.hypot(pointer.x - this.ball.x, pointer.y - this.ball.y);
      const speed = Math.hypot(this.velocityX, this.velocityY);
      if (dist < this.radius + 20 && speed > 10) {
        this.velocityX = 0;
        this.velocityY = 0;
        return;
      }

      this.swiping = true;
      this.swipeStartX = pointer.x;
      this.swipeStartY = pointer.y;
      this.swipeStartTime = performance.now();
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.swiping || this.gameOver || !this.ball.visible) return;
      this.swiping = false;

      const dt = (performance.now() - this.swipeStartTime) / 1000;
      if (dt <= 0) return;

      const dx = pointer.x - this.swipeStartX;
      const dy = pointer.y - this.swipeStartY;
      const swipeLen = Math.hypot(dx, dy);
      if (swipeLen < 20) return; // too short, not a swipe

      // Check if the swipe path passed near the ball
      const toBallX = this.ball.x - this.swipeStartX;
      const toBallY = this.ball.y - this.swipeStartY;
      // Project ball position onto swipe direction
      const dot = (toBallX * dx + toBallY * dy) / swipeLen;
      const closestX = this.swipeStartX + (dx / swipeLen) * dot;
      const closestY = this.swipeStartY + (dy / swipeLen) * dot;
      const distToBall = Math.hypot(
        closestX - this.ball.x,
        closestY - this.ball.y,
      );

      if (distToBall < this.kickReach && dot >= 0 && dot <= swipeLen) {
        // Kick! Apply swipe velocity to the ball
        this.velocityX = dx / dt;
        this.velocityY = dy / dt;
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
        this.resetDelay = 500;
      }
    } else {
      this.canScore = true;
    }
  }

  private endGame(): void {
    this.gameOver = true;
    this.velocityX = 0;
    this.velocityY = 0;
    this.scene.start("GameOver", { score: this.score });
  }

  dumpState(): GameSceneState {
    return {
      active: this.scene.isActive(),
      ball: { x: this.ball.x, y: this.ball.y, radius: this.radius },
      velocity: { x: this.velocityX, y: this.velocityY },
      dragging: this.swiping,
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
  private static readonly stepSec = GameScene.stepMs / 1000;

  update(_time: number, delta: number): void {
    if (this.gameOver) return;

    this.accumulator += delta;
    while (this.accumulator >= GameScene.stepMs) {
      this.step();
      if (this.gameOver) return;
      this.accumulator -= GameScene.stepMs;
    }
  }

  private step(): void {
    // Countdown timer
    this.elapsed += GameScene.stepMs;
    const tl = this.timeLeft;
    this.timerText.setText(String(tl));
    if (tl <= 5) {
      this.timerText.setColor("#ff4444");
    }
    if (tl <= 0) {
      this.endGame();
      return;
    }

    // Ball reset after scoring
    if (this.resetDelay > 0) {
      this.resetDelay -= GameScene.stepMs;
      if (this.resetDelay <= 0) {
        this.resetDelay = 0;
        const { width, height } = this.scale;
        const fieldH = height - HUD_TOP_H - HUD_BOTTOM_H;
        this.ball.x = width / 2;
        this.ball.y = HUD_TOP_H + fieldH * 0.7;
        this.ball.rotation = 0;
        this.ball.setVisible(true);
      }
      return;
    }

    if (!this.ball.visible) return;

    const dt = GameScene.stepSec;
    const { width, height } = this.scale;
    const fieldTop = HUD_TOP_H;
    const fieldBottom = height - HUD_BOTTOM_H;

    this.prevBallY = this.ball.y;

    this.ball.x += this.velocityX * dt;
    this.ball.y += this.velocityY * dt;

    // Spin based on movement speed
    const speed = Math.hypot(this.velocityX, this.velocityY);
    this.ball.rotation += (speed / this.radius) * dt;

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
