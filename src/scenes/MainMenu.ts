import { Scene } from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

/** Register each prototype here: [scene key, display label] */
export const GAMES: [string, string][] = [
  ["Shepherd", "Shepherd Dog"],
  ["Rover", "Rover Search"],
];

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
      .text(width / 2, 80, "Select a Game", {
        fontFamily: FONT_UI,
        fontSize: 48,
        color: "#ffe099",
        stroke: "#000000",
        strokeThickness: 6,
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    const btnH = 70;
    const gap = 20;
    const totalH = GAMES.length * (btnH + gap) - gap;
    let y = height / 2 - totalH / 2 + btnH / 2;

    for (const [key, label] of GAMES) {
      const btn = this.add
        .text(width / 2, y, label, {
          fontFamily: FONT_BODY,
          fontSize: 34,
          color: "#ffffff",
          backgroundColor: "#2a6b3a",
          padding: { left: 48, right: 48, top: 16, bottom: 16 },
          align: "center",
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      btn.on("pointerdown", () => {
        this.sound.play("pop");
        this.scene.start(key);
      });

      y += btnH + gap;
    }
  }

  dumpState(): MainMenuState {
    return { active: this.scene.isActive() };
  }
}
