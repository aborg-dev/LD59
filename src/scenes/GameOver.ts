import { Scene } from "phaser";

export interface GameOverState {
  active: boolean;
  finalScore: number;
}

export class GameOver extends Scene {
  private finalScore = 0;

  constructor() {
    super("GameOver");
  }

  create(data: { score?: number }) {
    this.finalScore = data.score ?? 0;
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(0x1a1a2e);

    this.add
      .text(width / 2, height / 2 - 100, "Time's Up!", {
        fontFamily: "Arial Black",
        fontSize: 48,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 6,
        align: "center",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2, String(this.finalScore), {
        fontFamily: "Arial Black",
        fontSize: 96,
        color: "#f48c28",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        height / 2 + 60,
        this.finalScore === 1 ? "basket" : "baskets",
        {
          fontFamily: "Arial",
          fontSize: 28,
          color: "#cccccc",
          align: "center",
        },
      )
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 140, "Tap to Play Again", {
        fontFamily: "Arial",
        fontSize: 24,
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5);

    this.input.once("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("GameScene");
    });
  }

  dumpState(): GameOverState {
    return { active: this.scene.isActive(), finalScore: this.finalScore };
  }
}
