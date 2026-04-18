import * as Phaser from "phaser";
import { Boot, type BootState } from "./scenes/Boot.js";
import { GameOver, type GameOverState } from "./scenes/GameOver.js";
import { MainMenu, type MainMenuState } from "./scenes/MainMenu.js";
import { Preloader, type PreloaderState } from "./scenes/Preloader.js";
import { RoverScene, type RoverSceneState } from "./scenes/RoverScene.js";
import {
  ShepherdScene,
  type ShepherdSceneState,
} from "./scenes/ShepherdScene.js";

const FIELD_W = 1280;
const FIELD_H = 720;
const HUD_TOP_H = 70;
const HUD_BOTTOM_H = 80;

export interface StateDump {
  Boot: BootState | null;
  Preloader: PreloaderState | null;
  MainMenu: MainMenuState | null;
  Shepherd: ShepherdSceneState | null;
  Rover: RoverSceneState | null;
  GameOver: GameOverState | null;
}

declare global {
  interface Window {
    game: Phaser.Game;
    startScene: (key: string) => void;
    advanceTime: (ms: number) => void;
    dumpState: () => StateDump;
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: "#1a1a2e",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: "game",
    width: FIELD_W,
    height: HUD_TOP_H + FIELD_H + HUD_BOTTOM_H,
  },
  scene: [Boot, Preloader, MainMenu, ShepherdScene, RoverScene, GameOver],
};

const game = new Phaser.Game(config);

window.game = game;
window.startScene = (key: string) => {
  game.scene.start(key);
};
window.advanceTime = (ms: number) => {
  const step = 16.666;
  let remaining = ms;
  let time = performance.now();
  while (remaining > 0) {
    const dt = Math.min(remaining, step);
    time += dt;
    game.scene.update(time, dt);
    remaining -= dt;
  }
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
  Shepherd: tryDump(game.scene.getScene("Shepherd") as ShepherdScene),
  Rover: tryDump(game.scene.getScene("Rover") as RoverScene),
  GameOver: tryDump(game.scene.getScene("GameOver") as GameOver),
});

// Debug overlay
const debugBtn = document.createElement("button");
debugBtn.textContent = "DBG";
debugBtn.style.cssText =
  "position:fixed;bottom:10px;right:10px;z-index:9999;padding:6px 12px;" +
  "background:rgba(0,0,0,0.6);color:#0f0;border:1px solid #0f0;" +
  "font:bold 14px monospace;cursor:pointer;border-radius:4px;";
document.body.appendChild(debugBtn);

const debugPanel = document.createElement("pre");
debugPanel.style.cssText =
  "position:fixed;bottom:50px;right:10px;z-index:9998;padding:12px;" +
  "background:rgba(0,0,0,0.75);color:#0f0;font:13px monospace;" +
  "width:300px;max-height:60vh;overflow:auto;border:1px solid #0f0;" +
  "border-radius:4px;display:none;white-space:pre-wrap;word-break:break-all;";
document.body.appendChild(debugPanel);

let debugVisible = false;
let debugInterval: number | undefined;

debugBtn.addEventListener("click", () => {
  debugVisible = !debugVisible;
  debugPanel.style.display = debugVisible ? "block" : "none";
  if (debugVisible) {
    const refresh = () => {
      const dump = window.dumpState();
      const active: Record<string, unknown> = {
        dpr: window.devicePixelRatio,
      };
      for (const [key, val] of Object.entries(dump)) {
        if (val && typeof val === "object" && "active" in val && val.active) {
          active[key] = val;
        }
      }
      debugPanel.textContent = JSON.stringify(active, null, 2);
    };
    refresh();
    debugInterval = window.setInterval(refresh, 200);
  } else {
    clearInterval(debugInterval);
  }
});
