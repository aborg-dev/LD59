import * as Phaser from "phaser";
import { GameScene } from "./GameScene.js";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: "#1a1a2e",
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: "game",
  },
  scene: GameScene,
};

(window as unknown as { game: Phaser.Game }).game = new Phaser.Game(config);
