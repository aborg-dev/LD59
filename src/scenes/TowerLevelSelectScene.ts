import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

const HUD_TOP_H = 70;
const HUD_BOTTOM_H = 80;

// Keep in sync with TowerScene.buildLevels.
export const TOWER_LEVEL_COUNT = 9;
// Indexes of 3-terminal levels — matches TowerScene.buildLevels.
const THREE_TERMINAL_FROM = 5;

export interface TowerLevelSelectState {
  active: boolean;
}

export class TowerLevelSelectScene extends Phaser.Scene {
  constructor() {
    super("TowerLevelSelect");
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .rectangle(width / 2, height / 2, width, height, 0x14331a)
      .setDepth(0);

    // Top HUD
    this.add
      .rectangle(width / 2, 0, width, HUD_TOP_H, 0x111122)
      .setOrigin(0.5, 0)
      .setDepth(100);

    this.add
      .text(width / 2, HUD_TOP_H / 2, "Signal Towers", {
        fontFamily: FONT_UI,
        fontSize: 32,
        color: "#ffe099",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(101);

    // Subtitle
    this.add
      .text(width / 2, HUD_TOP_H + 30, "Pick a level", {
        fontFamily: FONT_BODY,
        fontSize: 20,
        color: "#cfe7d5",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(50);

    // Tile grid
    const cols = 3;
    const tileSize = 170;
    const gap = 28;
    const rows = Math.ceil(TOWER_LEVEL_COUNT / cols);
    const totalW = cols * tileSize + (cols - 1) * gap;
    const totalH = rows * tileSize + (rows - 1) * gap;
    const startX = (width - totalW) / 2 + tileSize / 2;
    const startY = HUD_TOP_H + 120 + tileSize / 2;
    void totalH;

    for (let i = 0; i < TOWER_LEVEL_COUNT; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tx = startX + col * (tileSize + gap);
      const ty = startY + row * (tileSize + gap);

      const is3 = i >= THREE_TERMINAL_FROM;
      const border = is3 ? 0x3dd14a : 0x4ecdc4;

      const tile = this.add
        .rectangle(tx, ty, tileSize, tileSize, 0x225533)
        .setDepth(2)
        .setStrokeStyle(3, border)
        .setInteractive({ useHandCursor: true });

      this.add
        .text(tx, ty - 10, String(i + 1), {
          fontFamily: FONT_UI,
          fontSize: 64,
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 4,
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0.5)
        .setDepth(3);

      this.add
        .text(tx, ty + 52, is3 ? "3 towers" : "2 towers", {
          fontFamily: FONT_BODY,
          fontSize: 16,
          color: is3 ? "#b6e9bc" : "#a6ecec",
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0.5)
        .setDepth(3);

      // Dot indicators
      const dotCount = is3 ? 3 : 2;
      const dotColors = is3 ? [0x4ecdc4, 0xff6b6b, 0x3dd14a] : [0x4ecdc4, 0xff6b6b];
      const dotY = ty - tileSize / 2 + 18;
      const dotSpacing = 14;
      const dotStartX = tx - ((dotCount - 1) * dotSpacing) / 2;
      for (let d = 0; d < dotCount; d++) {
        this.add
          .circle(dotStartX + d * dotSpacing, dotY, 5, dotColors[d])
          .setDepth(3);
      }

      tile.on("pointerdown", () => {
        this.sound.play("pop");
        this.scene.start("Tower", { startLevel: i });
      });
    }

    // Bottom HUD
    this.add
      .rectangle(width / 2, height, width, HUD_BOTTOM_H, 0x111122)
      .setOrigin(0.5, 1)
      .setDepth(100);

    const menu = this.add
      .text(width / 2, height - HUD_BOTTOM_H / 2, "MENU", {
        fontFamily: FONT_BODY,
        fontSize: 22,
        color: "#ffffff",
        backgroundColor: "#333344",
        padding: { left: 24, right: 24, top: 10, bottom: 10 },
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    menu.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("MainMenu");
    });
  }

  dumpState(): TowerLevelSelectState {
    return { active: this.scene.isActive() };
  }
}
