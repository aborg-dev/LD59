import { Scene } from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

export interface GameOverState {
  active: boolean;
  finalScore: number;
}

interface GameOverData {
  score?: number;
  returnScene?: string;
  totalEarned?: number;
  sheepBought?: number;
  sheepLostToWolves?: number;
  runMs?: number;
}

function fmtRunTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export class GameOver extends Scene {
  private finalScore = 0;
  private returnScene = "MainMenu";

  constructor() {
    super("GameOver");
  }

  create(data: GameOverData) {
    this.finalScore = data.score ?? 0;
    this.returnScene = data.returnScene ?? "MainMenu";
    const totalEarned = data.totalEarned ?? 0;
    const sheepBought = data.sheepBought ?? 0;
    const sheepLostToWolves = data.sheepLostToWolves ?? 0;
    const runMs = data.runMs ?? 0;
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(0x1a1a2e);

    this.add
      .text(width / 2, height * 0.18, "Congratulations!", {
        fontFamily: FONT_UI,
        fontStyle: "bold",
        fontSize: 96,
        color: "#ffe099",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.3, "You retired in comfort", {
        fontFamily: FONT_BODY,
        fontSize: 40,
        color: "#cccccc",
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    const stats: [string, string][] = [
      ["Run time", fmtRunTime(runMs)],
      ["Money earned", `$${totalEarned}`],
      ["Sheep bought", String(sheepBought)],
      ["Sheep lost to wolves", String(sheepLostToWolves)],
    ];

    const labelX = width / 2 - 40;
    const valueX = width / 2 + 40;
    const startY = height * 0.47;
    const rowGap = 70;

    stats.forEach(([label, value], i) => {
      const y = startY + i * rowGap;
      this.add
        .text(labelX, y, label, {
          fontFamily: FONT_BODY,
          fontSize: 36,
          color: "#dddddd",
          align: "right",
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(1, 0.5);
      this.add
        .text(valueX, y, value, {
          fontFamily: FONT_UI,
          fontStyle: "bold",
          fontSize: 44,
          color: "#ffd700",
          stroke: "#000000",
          strokeThickness: 5,
          align: "left",
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0, 0.5);
    });

    const playAgain = this.add
      .text(width / 2, height * 0.78, "Play Again", {
        fontFamily: FONT_UI,
        fontStyle: "bold",
        fontSize: 44,
        color: "#ffffff",
        backgroundColor: "#2a6b3a",
        padding: { left: 48, right: 48, top: 16, bottom: 16 },
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    playAgain.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start(this.returnScene);
    });

    const menu = this.add
      .text(width / 2, height * 0.88, "Menu", {
        fontFamily: FONT_BODY,
        fontSize: 28,
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
