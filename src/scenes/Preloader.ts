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
    this.load.audio("shear", "shear.wav");
    this.load.audio("howl", "howl.mp3");
    this.load.audio("background", "background.mp3");
    this.load.audio("truck", "truck.mp3");
    this.load.audio("grazing", "grazing.mp3");
    this.load.audio("money", "money.mp3");
    this.load.audio("sheep-bleat", "sheep.wav");
    this.load.audio("bite", "bite.wav");
    this.load.spritesheet("sheep", "Sheeple.png", {
      frameWidth: 36,
      frameHeight: 62,
    });
    this.load.image("farm", "0.5Field.png");
    this.load.image("market", "0.5Market.png");
    this.load.image("shear", "2222_Sheering.png");
    this.load.image("truck", "Truck_No Noise.png");
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
    this.load.image("font", "1807_Font.png");
    this.load.image("road_block_a", "road/road_block_a.png");
    this.load.image("road_block_b", "road/road_block_b.png");
    this.load.image("road_block_c", "road/road_block_c.png");
    this.load.image("road_block_d", "road/road_block_d.png");
    this.load.image("road_e", "road/road_e.png");
    for (let i = 1; i <= 12; i++) {
      this.load.image(`stone${i}`, `road/stone${i}.png`);
    }
    this.load.image("road_f", "road/road_f.png");
    this.load.image("road_g", "road/road_g.png");
    this.load.image("road_h", "road/road_h.png");
    this.load.spritesheet("wolf", "sprite_wolf.png", {
      frameWidth: 30,
      frameHeight: 110,
    });
    this.load.spritesheet("wolf_scared", "sprite_wolf_scared.png", {
      frameWidth: 30,
      frameHeight: 110,
    });
    this.load.spritesheet("dog", "sprite_dog.png", {
      frameWidth: 40,
      frameHeight: 110,
    });
    this.load.spritesheet("dog_small", "sprite_dog_small.png", {
      frameWidth: 34,
      frameHeight: 93,
    });
  }

  create() {
    this.scene.start(import.meta.env.DEV ? "Shepherd" : "MainMenu");
  }

  dumpState(): PreloaderState {
    return { active: this.scene.isActive() };
  }
}
