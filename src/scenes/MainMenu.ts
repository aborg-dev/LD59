import { Scene } from "phaser";
import * as sfx from "../sfx.js";

export interface MainMenuState {
  active: boolean;
}

export class MainMenu extends Scene {
  constructor() {
    super("MainMenu");
  }

  create() {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2 - 40, "Tennis Fling", {
        fontFamily: "Arial Black",
        fontSize: 48,
        color: "#4ecdc4",
        stroke: "#000000",
        strokeThickness: 6,
        align: "center",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 40, "Click to Play", {
        fontFamily: "Arial",
        fontSize: 24,
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5);

    this.input.once("pointerdown", () => {
      sfx.resume();
      sfx.pop();
      this.scene.start("GameScene");
    });
  }

  dumpState(): MainMenuState {
    return { active: this.scene.isActive() };
  }
}
