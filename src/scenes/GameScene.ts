import * as Phaser from "phaser";

export interface GameSceneState {
  active: boolean;
  ball: { x: number; y: number; radius: number };
  velocity: { x: number; y: number };
  dragging: boolean;
  score: number;
  timeLeft: number;
  hoop: { x: number; y: number };
  physics: { friction: number; bounce: number };
  viewport: { width: number; height: number };
}

export class GameScene extends Phaser.Scene {
  private ball!: Phaser.GameObjects.Sprite;
  private hoop!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private velocityX = 0;
  private velocityY = 0;
  private dragging = false;
  private prevDragX = 0;
  private prevDragY = 0;
  private prevDragTime = 0;
  private score = 0;
  private timeLeft = 30;
  private elapsed = 0;
  private resetDelay = 0;
  private canScore = true;
  private gameOver = false;
  private readonly friction = 0.98;
  private readonly bounce = 0.8;
  private readonly radius = 50;
  private readonly hoopRadius = 42;
  private readonly gameDuration = 30;

  constructor() {
    super("GameScene");
  }

  create(): void {
    const { width, height } = this.scale;

    this.score = 0;
    this.timeLeft = this.gameDuration;
    this.elapsed = 0;
    this.gameOver = false;
    this.canScore = true;

    const bg = this.add.image(width / 2, height / 2, "court");
    bg.setDisplaySize(width, height);

    // Hoop at the top of the court
    this.hoop = this.add.image(width / 2, 90, "hoop");

    // Timer display (top-left)
    this.timerText = this.add.text(20, 20, "30", {
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

    // Ball starts at the bottom
    this.ball = this.add.sprite(width / 2, height * 0.7, "ball");
    this.ball.setDisplaySize(this.radius * 2, this.radius * 2);
    this.ball.setInteractive({ draggable: true });

    this.ball.on("dragstart", (_pointer: Phaser.Input.Pointer) => {
      if (this.gameOver) return;
      this.dragging = true;
      this.velocityX = 0;
      this.velocityY = 0;
      this.prevDragX = this.ball.x;
      this.prevDragY = this.ball.y;
      this.prevDragTime = performance.now();
    });

    this.ball.on(
      "drag",
      (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        if (this.gameOver) return;
        const now = performance.now();
        const dt = (now - this.prevDragTime) / 1000;
        if (dt > 0) {
          this.velocityX = (dragX - this.prevDragX) / dt;
          this.velocityY = (dragY - this.prevDragY) / dt;
        }
        const { width, height } = this.scale;
        const clampedX = Phaser.Math.Clamp(
          dragX,
          this.radius,
          width - this.radius,
        );
        const clampedY = Phaser.Math.Clamp(
          dragY,
          this.radius,
          height - this.radius,
        );
        this.prevDragX = clampedX;
        this.prevDragY = clampedY;
        this.prevDragTime = now;
        this.ball.x = clampedX;
        this.ball.y = clampedY;
      },
    );

    this.ball.on("dragend", () => {
      this.dragging = false;
    });
  }

  private checkScore(): void {
    const dx = this.ball.x - this.hoop.x;
    const dy = this.ball.y - this.hoop.y;
    const dist = Math.hypot(dx, dy);

    if (dist < this.hoopRadius && this.velocityY < 0) {
      if (this.canScore) {
        this.score++;
        this.scoreText.setText(String(this.score));
        this.sound.play("score");
        this.canScore = false;

        // Ball disappears and resets after a short delay
        this.ball.setVisible(false);
        this.velocityX = 0;
        this.velocityY = 0;
        this.dragging = false;
        this.resetDelay = 500;
      }
    } else {
      this.canScore = true;
    }
  }

  private endGame(): void {
    this.gameOver = true;
    this.dragging = false;
    this.velocityX = 0;
    this.velocityY = 0;
    this.scene.start("GameOver", { score: this.score });
  }

  dumpState(): GameSceneState {
    return {
      active: this.scene.isActive(),
      ball: { x: this.ball.x, y: this.ball.y, radius: this.radius },
      velocity: { x: this.velocityX, y: this.velocityY },
      dragging: this.dragging,
      score: this.score,
      timeLeft: this.timeLeft,
      hoop: { x: this.hoop.x, y: this.hoop.y },
      physics: { friction: this.friction, bounce: this.bounce },
      viewport: { width: this.scale.width, height: this.scale.height },
    };
  }

  setVelocity(vx: number, vy: number): void {
    this.velocityX = vx;
    this.velocityY = vy;
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;

    // Countdown timer
    this.elapsed += delta;
    if (this.elapsed >= 1000) {
      this.elapsed -= 1000;
      this.timeLeft--;
      this.timerText.setText(String(Math.max(0, this.timeLeft)));
      if (this.timeLeft <= 5) {
        this.timerText.setColor("#ff4444");
      }
      if (this.timeLeft <= 0) {
        this.endGame();
        return;
      }
    }

    // Ball reset after scoring
    if (this.resetDelay > 0) {
      this.resetDelay -= delta;
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

    if (this.dragging || !this.ball.visible) return;

    const dt = delta / 1000;
    const { width, height } = this.scale;

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
