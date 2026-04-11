import * as Phaser from 'phaser';

class GameScene extends Phaser.Scene {
  private circle!: Phaser.GameObjects.Arc;
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
    super('GameScene');
  }

  create(): void {
    const { width, height } = this.scale;

    this.circle = this.add.circle(width / 2, height / 2, this.radius, 0x4ecdc4);
    this.circle.setStrokeStyle(3, 0xffffff);
    this.circle.setInteractive({ draggable: true });

    this.circle.on('dragstart', (_pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.velocityX = 0;
      this.velocityY = 0;
      this.prevDragX = this.circle.x;
      this.prevDragY = this.circle.y;
      this.prevDragTime = performance.now();
    });

    this.circle.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      const now = performance.now();
      const dt = (now - this.prevDragTime) / 1000;
      if (dt > 0) {
        this.velocityX = (dragX - this.prevDragX) / dt;
        this.velocityY = (dragY - this.prevDragY) / dt;
      }
      const { width, height } = this.scale;
      const clampedX = Phaser.Math.Clamp(dragX, this.radius, width - this.radius);
      const clampedY = Phaser.Math.Clamp(dragY, this.radius, height - this.radius);
      this.prevDragX = clampedX;
      this.prevDragY = clampedY;
      this.prevDragTime = now;
      this.circle.x = clampedX;
      this.circle.y = clampedY;
    });

    this.circle.on('dragend', () => {
      this.dragging = false;
    });
  }

  update(_time: number, delta: number): void {
    if (this.dragging) return;

    const dt = delta / 1000;
    const { width, height } = this.scale;

    this.circle.x += this.velocityX * dt;
    this.circle.y += this.velocityY * dt;

    // Bounce off edges
    if (this.circle.x - this.radius < 0) {
      this.circle.x = this.radius;
      this.velocityX = Math.abs(this.velocityX) * this.bounce;
    } else if (this.circle.x + this.radius > width) {
      this.circle.x = width - this.radius;
      this.velocityX = -Math.abs(this.velocityX) * this.bounce;
    }

    if (this.circle.y - this.radius < 0) {
      this.circle.y = this.radius;
      this.velocityY = Math.abs(this.velocityY) * this.bounce;
    } else if (this.circle.y + this.radius > height) {
      this.circle.y = height - this.radius;
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

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: 'game',
  },
  scene: GameScene,
};

(window as any).game = new Phaser.Game(config);
