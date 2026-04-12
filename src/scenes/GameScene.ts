import * as Phaser from "phaser";

const ROUND_DURATION_SEC = 30;

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

    this.score = 0;
    this.elapsed = 0;
    this.accumulator = 0;
    this.resetDelay = 0;
    this.gameOver = false;
    this.canScore = true;
    this.velocityX = 0;
    this.velocityY = 0;
    this.swiping = false;

    const bg = this.add.image(width / 2, height / 2, "court");
    bg.setDisplaySize(width, height);

    // Goal zone
    const margin = 25;
    const pitchW = width - margin * 2;
    const pitchH = height - margin * 2;
    this.goalW = pitchW * 0.3;
    this.goalH = pitchH * 0.12;
    this.goalX = width / 2 - this.goalW / 2;
    this.goalY = margin;

    // Timer display (top-left)
    this.timerText = this.add.text(20, 20, String(ROUND_DURATION_SEC), {
      fontFamily: "Arial Black",
      fontSize: 36,
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
    });

    // Score display (top-right)
    this.scoreText = this.add.text(width - 20, 20, "0", {
      fontFamily: "Arial Black",
      fontSize: 36,
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
    });
    this.scoreText.setOrigin(1, 0);

    // Ball
    this.ball = this.add.sprite(width / 2, height * 0.7, "ball");
    this.ball.setDisplaySize(this.radius * 2, this.radius * 2);

    // Kick controls — swipe near the ball to kick it
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.gameOver || !this.ball.visible) return;

      // Tap on a moving ball → stop it
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
        this.scoreText.setText(String(this.score));
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
        this.ball.x = width / 2;
        this.ball.y = height * 0.7;
        this.ball.rotation = 0;
        this.ball.setVisible(true);
      }
      return;
    }

    if (!this.ball.visible) return;

    const dt = GameScene.stepSec;
    const { width, height } = this.scale;

    this.prevBallY = this.ball.y;

    this.ball.x += this.velocityX * dt;
    this.ball.y += this.velocityY * dt;

    // Spin based on movement speed
    const speed = Math.hypot(this.velocityX, this.velocityY);
    this.ball.rotation += (speed / this.radius) * dt;

    // Check for score
    this.checkScore();

    // Bounce off edges
    if (this.ball.x - this.radius < 0) {
      this.ball.x = this.radius;
      this.sound.play("bounce");
      this.velocityX = Math.abs(this.velocityX) * this.bounce;
    } else if (this.ball.x + this.radius > width) {
      this.ball.x = width - this.radius;
      this.sound.play("bounce");
      this.velocityX = -Math.abs(this.velocityX) * this.bounce;
    }

    if (this.ball.y - this.radius < 0) {
      this.ball.y = this.radius;
      this.sound.play("bounce");
      this.velocityY = Math.abs(this.velocityY) * this.bounce;
    } else if (this.ball.y + this.radius > height) {
      this.ball.y = height - this.radius;
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
