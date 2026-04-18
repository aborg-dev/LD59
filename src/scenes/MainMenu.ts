import { Scene } from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

/** Register each prototype here: [scene key, display label] */
export const GAMES: [string, string][] = [["Soccer", "Soccer Fling"]];

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
      .text(width / 2, 160, "Game Jam Prototypes", {
        fontFamily: FONT_UI,
        fontSize: 42,
        color: "#4ecdc4",
        stroke: "#000000",
        strokeThickness: 6,
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    const startY = height / 2 - ((GAMES.length - 1) * 80) / 2;

    for (let i = 0; i < GAMES.length; i++) {
      const [key, label] = GAMES[i];
      const btn = this.add
        .text(width / 2, startY + i * 80, label, {
          fontFamily: FONT_BODY,
          fontSize: 28,
          color: "#ffffff",
          backgroundColor: "#333344",
          padding: { left: 30, right: 30, top: 14, bottom: 14 },
          align: "center",
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      btn.on("pointerdown", () => {
        this.sound.play("pop");
        this.scene.start(key);
      });
    }
  }

  dumpState(): MainMenuState {
    return { active: this.scene.isActive() };
  }
}
