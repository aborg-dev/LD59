import { Scene } from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

export interface GameOverState {
  active: boolean;
  finalScore: number;
  sheepHome: number;
  sheepLost: number;
  total: number;
  medal: Medal;
}

type Medal = "perfect" | "gold" | "silver" | "bronze" | "none";

interface MedalDisplay {
  title: string;
  message: string;
  color: string;
}

function classify(home: number, total: number): Medal {
  if (home >= total) return "perfect";
  if (home >= 10) return "gold";
  if (home >= 8) return "silver";
  if (home >= 6) return "bronze";
  return "none";
}

function display(medal: Medal, home: number): MedalDisplay {
  switch (medal) {
    case "perfect":
      return {
        title: "Perfect!",
        message: "Not a single woolly soul left behind.",
        color: "#ffe066",
      };
    case "gold":
      return {
        title: "Gold",
        message: "Almost perfect. They'd follow you anywhere.",
        color: "#ffd24a",
      };
    case "silver":
      return {
        title: "Silver",
        message: "A good dog and a careful shepherd.",
        color: "#c9c9cf",
      };
    case "bronze":
      return {
        title: "Bronze",
        message: "Half the flock made it. They're the smart ones.",
        color: "#cd7f32",
      };
    default:
      if (home >= 3)
        return {
          title: "No medal",
          message: "The farm will be quieter tonight.",
          color: "#9a8f82",
        };
      if (home >= 1)
        return {
          title: "No medal",
          message: "Was there ever a flock at all?",
          color: "#9a8f82",
        };
      return {
        title: "No medal",
        message: "...The meadow is empty.",
        color: "#9a8f82",
      };
  }
}

export class GameOver extends Scene {
  private sheepHome = 0;
  private sheepLost = 0;
  private total = 12;
  private medal: Medal = "none";
  private returnScene = "MainMenu";

  constructor() {
    super("GameOver");
  }

  init(data?: {
    sheepHome?: number;
    sheepLost?: number;
    total?: number;
    returnScene?: string;
    score?: number;
  }) {
    this.sheepHome = data?.sheepHome ?? data?.score ?? 0;
    this.sheepLost = data?.sheepLost ?? 0;
    this.total = data?.total ?? 12;
    this.returnScene = data?.returnScene ?? "MainMenu";
    this.medal = classify(this.sheepHome, this.total);
  }

  create(data?: {
    sheepHome?: number;
    sheepLost?: number;
    total?: number;
    returnScene?: string;
    score?: number;
  }) {
    // Re-read in case init wasn't called before create for some reason.
    if (data) {
      if (typeof data.sheepHome === "number") this.sheepHome = data.sheepHome;
      else if (typeof data.score === "number") this.sheepHome = data.score;
      if (typeof data.sheepLost === "number") this.sheepLost = data.sheepLost;
      if (typeof data.total === "number") this.total = data.total;
      if (typeof data.returnScene === "string")
        this.returnScene = data.returnScene;
    }
    this.medal = classify(this.sheepHome, this.total);

    const { width, height } = this.scale;

    // Clear any carry-over world camera viewport from the previous scene
    // (Shepherd shifts main.viewport down by HUD_TOP_H; GameOver wants full canvas).
    this.cameras.main.setViewport(0, 0, width, height);
    const d = display(this.medal, this.sheepHome);

    this.cameras.main.setBackgroundColor(0x1a1a2e);

    this.add
      .text(width / 2, height / 2 - 170, d.title, {
        fontFamily: FONT_UI,
        fontSize: 56,
        color: d.color,
        stroke: "#000000",
        strokeThickness: 6,
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 - 90, `${this.sheepHome} / ${this.total}`, {
        fontFamily: FONT_UI,
        fontSize: 96,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 - 10, "sheep home", {
        fontFamily: FONT_BODY,
        fontSize: 26,
        color: "#cccccc",
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 40, d.message, {
        fontFamily: FONT_BODY,
        fontSize: 24,
        color: "#e0d4b0",
        align: "center",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    const playAgain = this.add
      .text(width / 2, height / 2 + 130, "Play Again", {
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

    const menu = this.add
      .text(width / 2, height / 2 + 210, "Menu", {
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
    return {
      active: this.scene.isActive(),
      finalScore: this.sheepHome,
      sheepHome: this.sheepHome,
      sheepLost: this.sheepLost,
      total: this.total,
      medal: this.medal,
    };
  }
}
