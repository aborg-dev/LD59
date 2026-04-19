import { Scene } from "phaser";

export interface PreloaderState {
  active: boolean;
}

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  init() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.add.rectangle(cx, cy, 468, 32).setStrokeStyle(1, 0xffffff);

    const bar = this.add.rectangle(cx - 230, cy, 4, 28, 0xffffff);

    this.load.on("progress", (progress: number) => {
      bar.width = 4 + 460 * progress;
    });
  }

  preload() {
    this.load.setPath("assets");
    this.load.image("ball", "ball.png");
    this.load.image("court", "court.png");
    this.load.audio("bounce", "bounce.wav");
    this.load.audio("pop", "pop.wav");
    this.load.audio("score", "score.wav");
    this.load.spritesheet("sheep", "Sheeple_2x.png", {
      frameWidth: 144,
      frameHeight: 248,
    });
  }

  create() {
    this.scene.start(import.meta.env.DEV ? "Shepherd" : "MainMenu");
  }

  dumpState(): PreloaderState {
    return { active: this.scene.isActive() };
  }
}
