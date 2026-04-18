import { Scene } from "phaser";
import { FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

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
      .text(width / 2, height / 2 - 120, "Shepherd", {
        fontFamily: FONT_UI,
        fontSize: 56,
        color: "#ffe099",
        stroke: "#000000",
        strokeThickness: 6,
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    const playBtn = this.add
      .text(width / 2, height / 2 + 40, "PLAY", {
        fontFamily: FONT_UI,
        fontSize: 48,
        color: "#ffffff",
        backgroundColor: "#2a6b3a",
        padding: { left: 60, right: 60, top: 20, bottom: 20 },
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    playBtn.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("Shepherd");
    });
  }

  dumpState(): MainMenuState {
    return { active: this.scene.isActive() };
  }
}
