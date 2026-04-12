import * as Phaser from "phaser";
import { Boot, type BootState } from "./scenes/Boot.js";
import { DebugScene } from "./scenes/DebugScene.js";
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
  Boot: BootState | null;
  Preloader: PreloaderState | null;
  MainMenu: MainMenuState | null;
  GameScene: GameSceneState | null;
  GameOver: GameOverState | null;
}

declare global {
  interface Window {
    game: Phaser.Game;
    gameScene: () => GameScene;
    startScene: (key: string) => void;
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
  scene: [Boot, Preloader, MainMenu, GameScene, GameOver, DebugScene],
};

const game = new Phaser.Game(config);

window.game = game;
window.gameScene = () => getActiveScene<GameScene>(game, "GameScene");
window.startScene = (key: string) => {
  game.scene.start(key);
};
window.advanceTime = (ms: number) => {
  game.scene.update(performance.now(), ms);
};
function tryDump<T>(scene: { dumpState(): T } | null): T | null {
  try {
    return scene?.dumpState() ?? null;
  } catch {
    return null;
  }
}
window.dumpState = () => ({
  Boot: tryDump(game.scene.getScene("Boot") as Boot),
  Preloader: tryDump(game.scene.getScene("Preloader") as Preloader),
  MainMenu: tryDump(game.scene.getScene("MainMenu") as MainMenu),
  GameScene: tryDump(game.scene.getScene("GameScene") as GameScene),
  GameOver: tryDump(game.scene.getScene("GameOver") as GameOver),
});
