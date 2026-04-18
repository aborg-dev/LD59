import { Scene } from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

export interface GameOverState {
  active: boolean;
  finalScore: number;
}

export class GameOver extends Scene {
  private finalScore = 0;
  private returnScene = "MainMenu";

  constructor() {
    super("GameOver");
  }

  create(data: { score?: number; returnScene?: string }) {
    this.finalScore = data.score ?? 0;
    this.returnScene = data.returnScene ?? "MainMenu";
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(0x1a1a2e);

    this.add
      .text(width / 2, height / 2 - 100, "Game Over", {
        fontFamily: FONT_UI,
        fontSize: 48,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 6,
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2, String(this.finalScore), {
        fontFamily: FONT_UI,
        fontSize: 96,
        color: "#f48c28",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        height / 2 + 60,
        "sheep penned",
        {
          fontFamily: FONT_BODY,
          fontSize: 28,
          color: "#cccccc",
          align: "center",
          resolution: TEXT_RESOLUTION,
        },
      )
      .setOrigin(0.5);

    // Play again
    const playAgain = this.add
      .text(width / 2, height / 2 + 160, "Play Again", {
        fontFamily: FONT_BODY,
        fontSize: 28,
        color: "#ffffff",
        backgroundColor: "#333344",
        padding: { left: 24, right: 24, top: 12, bottom: 12 },
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    playAgain.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start(this.returnScene);
    });

    // Back to menu
    const menu = this.add
      .text(width / 2, height / 2 + 240, "Menu", {
        fontFamily: FONT_BODY,
        fontSize: 24,
        color: "#aaaaaa",
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    menu.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("MainMenu");
    });
  }

  dumpState(): GameOverState {
    return { active: this.scene.isActive(), finalScore: this.finalScore };
  }
}
