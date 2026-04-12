import * as Phaser from "phaser";
import * as sfx from "../sfx.js";

export interface GameSceneState {
  active: boolean;
  ball: { x: number; y: number; radius: number };
  velocity: { x: number; y: number };
  dragging: boolean;
  physics: { friction: number; bounce: number };
  viewport: { width: number; height: number };
}

export class GameScene extends Phaser.Scene {
  private ball!: Phaser.GameObjects.Sprite;
  private velocityX = 0;
  private velocityY = 0;
  private dragging = false;
  private prevDragX = 0;
  private prevDragY = 0;
  private prevDragTime = 0;
  private readonly friction = 0.98;
  private readonly bounce = 0.8;
  private readonly radius = 50;

  constructor() {
    super("GameScene");
  }

  create(): void {
    const { width, height } = this.scale;

    const bg = this.add.image(width / 2, height / 2, "court");
    bg.setDisplaySize(width, height);

    this.ball = this.add.sprite(width / 2, height / 2, "ball");
    this.ball.setDisplaySize(this.radius * 2, this.radius * 2);
    this.ball.setInteractive({ draggable: true });

    this.ball.on("dragstart", (_pointer: Phaser.Input.Pointer) => {
      sfx.resume();
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
      sfx.whoosh();
    });
  }

  dumpState(): GameSceneState {
    return {
      active: this.scene.isActive(),
      ball: { x: this.ball.x, y: this.ball.y, radius: this.radius },
      velocity: { x: this.velocityX, y: this.velocityY },
      dragging: this.dragging,
      physics: { friction: this.friction, bounce: this.bounce },
      viewport: { width: this.scale.width, height: this.scale.height },
    };
  }

  resetBall(): void {
    this.ball.x = this.scale.width / 2;
    this.ball.y = this.scale.height / 2;
    this.velocityX = 0;
    this.velocityY = 0;
    this.dragging = false;
  }

  setVelocity(vx: number, vy: number): void {
    this.velocityX = vx;
    this.velocityY = vy;
  }

  update(_time: number, delta: number): void {
    if (this.dragging) return;

    const dt = delta / 1000;
    const { width, height } = this.scale;

    this.ball.x += this.velocityX * dt;
    this.ball.y += this.velocityY * dt;

    // Bounce off edges
    const maxBounceSpeed = 2000;
    if (this.ball.x - this.radius < 0) {
      this.ball.x = this.radius;
      sfx.bounce(Math.min(Math.abs(this.velocityX) / maxBounceSpeed, 1));
      this.velocityX = Math.abs(this.velocityX) * this.bounce;
    } else if (this.ball.x + this.radius > width) {
      this.ball.x = width - this.radius;
      sfx.bounce(Math.min(Math.abs(this.velocityX) / maxBounceSpeed, 1));
      this.velocityX = -Math.abs(this.velocityX) * this.bounce;
    }

    if (this.ball.y - this.radius < 0) {
      this.ball.y = this.radius;
      sfx.bounce(Math.min(Math.abs(this.velocityY) / maxBounceSpeed, 1));
      this.velocityY = Math.abs(this.velocityY) * this.bounce;
    } else if (this.ball.y + this.radius > height) {
      this.ball.y = height - this.radius;
      sfx.bounce(Math.min(Math.abs(this.velocityY) / maxBounceSpeed, 1));
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
