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
      .text(width / 2, height * 0.38, "Wool Street", {
        fontFamily: FONT_UI,
        fontStyle: "bold",
        fontSize: 128,
        color: "#ffe099",
        stroke: "#000000",
        strokeThickness: 10,
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    const playBtn = this.add
      .text(width / 2, height * 0.62, "Play", {
        fontFamily: FONT_UI,
        fontStyle: "bold",
        fontSize: 56,
        color: "#ffffff",
        backgroundColor: "#2a6b3a",
        padding: { left: 72, right: 72, top: 20, bottom: 20 },
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
