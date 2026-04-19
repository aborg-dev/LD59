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
    this.load.audio("bark", "bark.wav");
    this.load.audio("howl", "howl.mp3");
    this.load.audio("background", "background.mp3");
    this.load.audio("truck", "truck.mp3");
    this.load.spritesheet("sheep", "Sheeple.png", {
      frameWidth: 36,
      frameHeight: 62,
    });
    this.load.image("grassLow1", "1723_Gras_LowDetail_1.png");
    this.load.image("grassLow2", "1723_Gras_LowDetail_2.png");
    this.load.image("grassLow3", "1723_Gras_LowDetail_3.png");
    this.load.image("grassLow4", "1723_Gras_LowDetail_4.png");
    this.load.image("grass1", "1723_Gras_HighDetail_1.png");
    this.load.image("grass2", "1723_Gras_HighDetail_2.png");
    this.load.image("tree0", "1755_TreeSmall_1.png");
    this.load.image("tree1", "1755_TreeSmall_2.png");
    this.load.image("tree2", "1755_TreeSmall_3.png");
    this.load.image("tree3", "1809_Tree_Big_1.png");
    this.load.image("tree4", "1809_Tree_Big_2.png");
    this.load.image("wolf", "1826_Wolf_110.png");
    this.load.image("alpha_dog", "1952_Goodboy.png");
  }

  create() {
    this.scene.start(import.meta.env.DEV ? "Shepherd" : "MainMenu");
  }

  dumpState(): PreloaderState {
    return { active: this.scene.isActive() };
  }
}
