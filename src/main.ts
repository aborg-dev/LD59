import * as Phaser from "phaser";
import { GameScene } from "./GameScene.js";

function getActiveScene<T extends Phaser.Scene>(
  game: Phaser.Game,
  name: string,
): T {
  const active = game.scene.getScenes(true);
  const found = active.find((s) => s.scene.key === name);
  if (!found) {
    const running = active.map((s) => s.scene.key).join(", ") || "(none)";
    throw new Error(`Scene "${name}" is not active. Active scenes: ${running}`);
  }
  return found as T;
}

declare global {
  interface Window {
    game: Phaser.Game;
    gameScene: () => GameScene;
    advanceTime: (ms: number) => void;
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: "#1a1a2e",
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: "game",
  },
  scene: GameScene,
};

const game = new Phaser.Game(config);

window.game = game;
window.gameScene = () => getActiveScene<GameScene>(game, "GameScene");
window.advanceTime = (ms: number) => {
  const stepMs = 16.666;
  let remaining = ms;
  while (remaining > 0) {
    const dt = Math.min(remaining, stepMs);
    for (const scene of game.scene.getScenes(true)) {
      scene.update(performance.now(), dt);
    }
    remaining -= dt;
  }
};
