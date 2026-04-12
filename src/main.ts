import * as Phaser from "phaser";
import { Boot, type BootState } from "./scenes/Boot.js";
import { GameOver, type GameOverState } from "./scenes/GameOver.js";
import { GameScene, type GameSceneState } from "./scenes/GameScene.js";
import { MainMenu, type MainMenuState } from "./scenes/MainMenu.js";
import { Preloader, type PreloaderState } from "./scenes/Preloader.js";

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

export interface StateDump {
  Boot: BootState;
  Preloader: PreloaderState;
  MainMenu: MainMenuState;
  GameScene: GameSceneState;
  GameOver: GameOverState;
}

declare global {
  interface Window {
    game: Phaser.Game;
    gameScene: () => GameScene;
    skipToScene: (key: string) => void;
    advanceTime: (ms: number) => void;
    dumpState: () => StateDump;
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: "#1a1a2e",
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: "game",
  },
  scene: [Boot, Preloader, MainMenu, GameScene, GameOver],
};

const game = new Phaser.Game(config);

window.game = game;
window.gameScene = () => getActiveScene<GameScene>(game, "GameScene");
window.skipToScene = (key: string) => {
  for (const scene of game.scene.getScenes(true)) {
    game.scene.stop(scene.scene.key);
  }
  game.scene.start(key);
};
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
window.dumpState = () => ({
  Boot: (game.scene.getScene("Boot") as Boot).dumpState(),
  Preloader: (game.scene.getScene("Preloader") as Preloader).dumpState(),
  MainMenu: (game.scene.getScene("MainMenu") as MainMenu).dumpState(),
  GameScene: (game.scene.getScene("GameScene") as GameScene).dumpState(),
  GameOver: (game.scene.getScene("GameOver") as GameOver).dumpState(),
});
