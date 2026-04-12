import { Scene } from "phaser";

export interface GameOverState {
  active: boolean;
}

export class GameOver extends Scene {
  constructor() {
    super("GameOver");
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(0x1a1a2e);

    this.add
      .text(width / 2, height / 2 - 40, "Game Over", {
        fontFamily: "Arial Black",
        fontSize: 64,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 40, "Click to Restart", {
        fontFamily: "Arial",
        fontSize: 24,
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5);

    this.input.once("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("MainMenu");
    });
  }

  dumpState(): GameOverState {
    return { active: this.scene.isActive() };
  }
}
