import { Scene } from "phaser";
import { FONT_MONO } from "../fonts.js";

export class DebugScene extends Scene {
  private debugText!: Phaser.GameObjects.Text;
  private bg!: Phaser.GameObjects.Rectangle;
  private btn!: Phaser.GameObjects.Text;
  private panelVisible = false;

  constructor() {
    super("DebugScene");
  }

  create() {
    const { width, height } = this.scale;
    // Toggle button — bottom right
    this.btn = this.add
      .text(width - 10, height - 10, "DBG", {
        fontFamily: FONT_MONO,
        fontSize: 14,
        color: "#00ff00",
        backgroundColor: "rgba(0,0,0,0.6)",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive();

    // Semi-transparent background panel
    this.bg = this.add
      .rectangle(width - 10, height - 50, 300, 400, 0x000000, 0.75)
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(999)
      .setVisible(false);

    // State text
    this.debugText = this.add
      .text(width - 305, height - 445, "", {
        fontFamily: FONT_MONO,
        fontSize: 11,
        color: "#00ff00",
        wordWrap: { width: 290 },
      })
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    this.btn.on("pointerdown", () => {
      this.panelVisible = !this.panelVisible;
      this.bg.setVisible(this.panelVisible);
      this.debugText.setVisible(this.panelVisible);
    });
  }

  update() {
    if (!this.panelVisible) return;

    const dump = window.dumpState();
    const active: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(dump)) {
      if (
        key !== "DebugScene" &&
        val &&
        typeof val === "object" &&
        "active" in val &&
        val.active
      ) {
        active[key] = val;
      }
    }
    this.debugText.setText(JSON.stringify(active, null, 2));
  }
}
