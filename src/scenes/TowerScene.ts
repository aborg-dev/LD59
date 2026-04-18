import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

const HUD_TOP_H = 70;
const HUD_BOTTOM_H = 80;

const TOWER_VISUAL_R = 18;
const TERMINAL_VISUAL_R = 28;
const PLACE_MIN_DIST = 44;

const COLOR_FIELD = 0x14331a;
const COLOR_GRID = 0x1d4a28;
const COLOR_OBSTACLE = 0x555566;
const COLOR_OBSTACLE_EDGE = 0x22222a;
const COLOR_RANGE = 0x88ff99;
const COLOR_LINK = 0x66ff88;
const COLOR_PATH = 0xffe066;
const COLOR_TOWER = 0xd8d8e0;
const COLOR_TOWER_EDGE = 0x333344;
const COLOR_SOURCE = 0x4ecdc4;
const COLOR_DEST = 0xff6b6b;

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Level {
  source: { x: number; y: number };
  dest: { x: number; y: number };
  obstacles: Obstacle[];
  range: number;
  hint?: string;
}

interface Tower {
  x: number;
  y: number;
  gfx: Phaser.GameObjects.Graphics;
  rangeGfx: Phaser.GameObjects.Graphics;
}

export interface TowerSceneState {
  active: boolean;
  levelIndex: number;
  levelCount: number;
  towers: { x: number; y: number }[];
  connected: boolean;
  path: number[];
  viewport: { width: number; height: number };
}

export class TowerScene extends Phaser.Scene {
  private levels: Level[] = [];
  private levelIndex = 0;
  private towers: Tower[] = [];
  private connected = false;
  private pathIndices: number[] = [];

  private fieldTop = HUD_TOP_H;
  private fieldBottom = 0;

  private obstacleGfx!: Phaser.GameObjects.Graphics;
  private linkGfx!: Phaser.GameObjects.Graphics;
  private terminalGfx!: Phaser.GameObjects.Graphics;
  private pulseT = 0;

  private levelText!: Phaser.GameObjects.Text;
  private budgetText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private nextBtn!: Phaser.GameObjects.Text;
  private muteText!: Phaser.GameObjects.Text;

  constructor() {
    super("Tower");
  }

  create(): void {
    const { width, height } = this.scale;
    this.fieldTop = HUD_TOP_H;
    this.fieldBottom = height - HUD_BOTTOM_H;
    const fieldH = this.fieldBottom - this.fieldTop;

    this.towers = [];
    this.connected = false;
    this.pathIndices = [];
    this.levelIndex = 0;

    this.levels = this.buildLevels(width, this.fieldTop, this.fieldBottom);

    this.add
      .rectangle(
        width / 2,
        this.fieldTop + fieldH / 2,
        width,
        fieldH,
        COLOR_FIELD,
      )
      .setDepth(0);

    const grid = this.add.graphics().setDepth(1);
    grid.lineStyle(1, COLOR_GRID, 0.7);
    for (let x = 40; x < width; x += 40) {
      grid.moveTo(x, this.fieldTop);
      grid.lineTo(x, this.fieldBottom);
    }
    for (let y = this.fieldTop + 40; y < this.fieldBottom; y += 40) {
      grid.moveTo(0, y);
      grid.lineTo(width, y);
    }
    grid.strokePath();

    this.obstacleGfx = this.add.graphics().setDepth(2);
    this.linkGfx = this.add.graphics().setDepth(3);
    this.terminalGfx = this.add.graphics().setDepth(6);

    // Top HUD
    this.add
      .rectangle(width / 2, 0, width, HUD_TOP_H, 0x111122)
      .setOrigin(0.5, 0)
      .setDepth(100);

    this.levelText = this.add
      .text(24, HUD_TOP_H / 2, "", {
        fontFamily: FONT_UI,
        fontSize: 28,
        color: "#ffe099",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0, 0.5)
      .setDepth(101);

    this.budgetText = this.add
      .text(width - 24, HUD_TOP_H / 2, "", {
        fontFamily: FONT_UI,
        fontSize: 28,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(1, 0.5)
      .setDepth(101);

    // Hint/status texts inside field
    this.hintText = this.add
      .text(width / 2, this.fieldTop + 24, "", {
        fontFamily: FONT_BODY,
        fontSize: 18,
        color: "#cfe7d5",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 0)
      .setDepth(50);

    this.statusText = this.add
      .text(width / 2, this.fieldBottom - 34, "", {
        fontFamily: FONT_UI,
        fontSize: 28,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 5,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 1)
      .setDepth(50);

    // Bottom HUD
    this.add
      .rectangle(width / 2, height, width, HUD_BOTTOM_H, 0x111122)
      .setOrigin(0.5, 1)
      .setDepth(100);

    const btnY = this.fieldBottom + HUD_BOTTOM_H / 2;
    const btnStyle = {
      fontFamily: FONT_BODY,
      fontSize: 20,
      color: "#ffffff",
      backgroundColor: "#333344",
      padding: { left: 16, right: 16, top: 10, bottom: 10 },
      resolution: TEXT_RESOLUTION,
    };

    const resetBtn = this.add
      .text(width / 2 - 240, btnY, "RESET", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    resetBtn.on("pointerdown", () => {
      this.sound.play("pop");
      this.clearTowers();
      this.refresh();
    });

    const menuBtn = this.add
      .text(width / 2 - 80, btnY, "MENU", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    menuBtn.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("MainMenu");
    });

    const muted = this.game.sound.mute;
    this.muteText = this.add
      .text(width / 2 + 80, btnY, muted ? "UNMUTE" : "MUTE", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.muteText.on("pointerdown", () => {
      this.game.sound.mute = !this.game.sound.mute;
      this.muteText.setText(this.game.sound.mute ? "UNMUTE" : "MUTE");
    });

    this.nextBtn = this.add
      .text(width / 2 + 240, btnY, "NEXT", {
        ...btnStyle,
        backgroundColor: "#446633",
      })
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.nextBtn.on("pointerdown", () => {
      if (!this.connected) return;
      this.sound.play("score");
      this.goToLevel(this.levelIndex + 1);
    });

    // Field input — tap to place, tap on tower to remove
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.y < this.fieldTop || p.y > this.fieldBottom) return;
      this.onFieldTap(p.x, p.y);
    });

    this.loadLevel(0);
  }

  update(_time: number, delta: number): void {
    if (!this.connected) return;
    this.pulseT += delta * 0.006;
    this.drawLinks();
  }

  private buildLevels(w: number, top: number, bottom: number): Level[] {
    const h = bottom - top;
    const left = 80;
    const right = w - 80;
    return [
      {
        source: { x: left, y: top + h * 0.5 },
        dest: { x: right, y: top + h * 0.5 },
        obstacles: [],
        range: 320,
        hint: "Tap to place a relay tower.\nChain the signal across the field.",
      },
      {
        source: { x: left, y: top + h * 0.2 },
        dest: { x: right, y: top + h * 0.8 },
        obstacles: [{ x: w * 0.3, y: top + h * 0.35, w: 280, h: 200 }],
        range: 280,
        hint: "Stone blocks the signal. Route around.",
      },
      {
        source: { x: left, y: top + h * 0.5 },
        dest: { x: right, y: top + h * 0.5 },
        obstacles: [
          { x: w * 0.2, y: top + h * 0.1, w: 120, h: h * 0.55 },
          { x: w * 0.55, y: top + h * 0.35, w: 120, h: h * 0.55 },
        ],
        range: 300,
        hint: "Zig-zag through the gaps.",
      },
      {
        source: { x: left, y: top + h * 0.15 },
        dest: { x: right, y: top + h * 0.85 },
        obstacles: [
          { x: 0, y: top + h * 0.3, w: w * 0.6, h: 80 },
          { x: w * 0.4, y: top + h * 0.55, w: w * 0.6, h: 80 },
          { x: w * 0.15, y: top + h * 0.78, w: 140, h: h * 0.18 },
        ],
        range: 260,
        hint: "A winding corridor. Pick line-of-sight carefully.",
      },
      {
        source: { x: left, y: top + h * 0.5 },
        dest: { x: right, y: top + h * 0.5 },
        obstacles: [
          { x: w * 0.15, y: top + h * 0.05, w: 90, h: h * 0.35 },
          { x: w * 0.15, y: top + h * 0.6, w: 90, h: h * 0.35 },
          { x: w * 0.45, y: top + h * 0.2, w: 90, h: h * 0.6 },
          { x: w * 0.72, y: top + h * 0.05, w: 90, h: h * 0.35 },
          { x: w * 0.72, y: top + h * 0.6, w: 90, h: h * 0.35 },
        ],
        range: 240,
        hint: "Tight slots. Plan before you place.",
      },
    ];
  }

  private loadLevel(index: number): void {
    if (index >= this.levels.length) {
      this.scene.start("GameOver", {
        score: this.levels.length,
        returnScene: "Tower",
      });
      return;
    }
    this.levelIndex = index;
    this.clearTowers();
    const level = this.levels[index];

    // Draw obstacles
    this.obstacleGfx.clear();
    for (const o of level.obstacles) {
      this.obstacleGfx.fillStyle(COLOR_OBSTACLE, 1);
      this.obstacleGfx.lineStyle(3, COLOR_OBSTACLE_EDGE);
      this.obstacleGfx.fillRoundedRect(o.x, o.y, o.w, o.h, 6);
      this.obstacleGfx.strokeRoundedRect(o.x, o.y, o.w, o.h, 6);
    }

    // Draw terminals
    this.drawTerminals();

    this.levelText.setText(`Level ${index + 1}/${this.levels.length}`);
    this.hintText.setText(level.hint ?? "");
    this.refresh();
  }

  private goToLevel(index: number): void {
    this.loadLevel(index);
  }

  private drawTerminals(): void {
    const { source, dest, range } = this.levels[this.levelIndex];
    this.terminalGfx.clear();

    // Range aura for source
    this.terminalGfx.fillStyle(COLOR_SOURCE, 0.08);
    this.terminalGfx.fillCircle(source.x, source.y, range);
    this.terminalGfx.lineStyle(2, COLOR_SOURCE, 0.25);
    this.terminalGfx.strokeCircle(source.x, source.y, range);

    // Range aura for dest
    this.terminalGfx.fillStyle(COLOR_DEST, 0.08);
    this.terminalGfx.fillCircle(dest.x, dest.y, range);
    this.terminalGfx.lineStyle(2, COLOR_DEST, 0.25);
    this.terminalGfx.strokeCircle(dest.x, dest.y, range);

    // Source tower — stylized beacon
    this.drawBeacon(this.terminalGfx, source.x, source.y, COLOR_SOURCE, "S");
    this.drawBeacon(this.terminalGfx, dest.x, dest.y, COLOR_DEST, "D");
  }

  private drawBeacon(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    color: number,
    _tag: string,
  ): void {
    // Base
    g.fillStyle(COLOR_TOWER_EDGE, 1);
    g.fillRoundedRect(
      x - TERMINAL_VISUAL_R,
      y + TERMINAL_VISUAL_R * 0.3,
      TERMINAL_VISUAL_R * 2,
      10,
      3,
    );
    // Body
    g.fillStyle(color, 1);
    g.lineStyle(3, 0x000000, 1);
    g.fillCircle(x, y, TERMINAL_VISUAL_R);
    g.strokeCircle(x, y, TERMINAL_VISUAL_R);
    // Inner dot
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(x, y, TERMINAL_VISUAL_R * 0.35);
  }

  private onFieldTap(x: number, y: number): void {
    // Remove existing tower if tap is on one
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      if (Phaser.Math.Distance.Between(x, y, t.x, t.y) <= TOWER_VISUAL_R + 10) {
        t.gfx.destroy();
        t.rangeGfx.destroy();
        this.towers.splice(i, 1);
        this.sound.play("pop");
        this.refresh();
        return;
      }
    }

    const level = this.levels[this.levelIndex];

    // Don't place on a terminal
    if (
      Phaser.Math.Distance.Between(x, y, level.source.x, level.source.y) <
      TERMINAL_VISUAL_R + 12
    )
      return;
    if (
      Phaser.Math.Distance.Between(x, y, level.dest.x, level.dest.y) <
      TERMINAL_VISUAL_R + 12
    )
      return;

    // Don't place inside obstacle
    for (const o of level.obstacles) {
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return;
    }

    // Enforce minimum spacing
    for (const t of this.towers) {
      if (Phaser.Math.Distance.Between(x, y, t.x, t.y) < PLACE_MIN_DIST) return;
    }

    this.placeTower(x, y);
  }

  private placeTower(x: number, y: number): void {
    const level = this.levels[this.levelIndex];

    const rangeGfx = this.add.graphics().setDepth(2);
    rangeGfx.fillStyle(COLOR_RANGE, 0.06);
    rangeGfx.fillCircle(x, y, level.range);
    rangeGfx.lineStyle(1, COLOR_RANGE, 0.2);
    rangeGfx.strokeCircle(x, y, level.range);

    const gfx = this.add.graphics().setDepth(7);
    gfx.fillStyle(COLOR_TOWER_EDGE, 1);
    gfx.fillRoundedRect(
      x - TOWER_VISUAL_R,
      y + TOWER_VISUAL_R * 0.3,
      TOWER_VISUAL_R * 2,
      8,
      3,
    );
    gfx.fillStyle(COLOR_TOWER, 1);
    gfx.lineStyle(3, 0x000000, 1);
    gfx.fillCircle(x, y, TOWER_VISUAL_R);
    gfx.strokeCircle(x, y, TOWER_VISUAL_R);
    gfx.fillStyle(0xffe066, 1);
    gfx.fillCircle(x, y, TOWER_VISUAL_R * 0.4);

    this.towers.push({ x, y, gfx, rangeGfx });
    this.sound.play("pop");
    this.refresh();
  }

  private clearTowers(): void {
    for (const t of this.towers) {
      t.gfx.destroy();
      t.rangeGfx.destroy();
    }
    this.towers = [];
  }

  private refresh(): void {
    this.budgetText.setText(`Towers: ${this.towers.length}`);
    const { connected, path } = this.computeConnectivity();
    const wasConnected = this.connected;
    this.connected = connected;
    this.pathIndices = path;
    this.drawLinks();

    if (connected && !wasConnected) this.sound.play("score");

    if (connected) {
      this.statusText.setText("SIGNAL THROUGH — tap NEXT");
      this.statusText.setColor("#88ff99");
      this.nextBtn.setVisible(true);
    } else {
      this.statusText.setText("");
      this.nextBtn.setVisible(false);
    }
  }

  private nodes(): { x: number; y: number }[] {
    const level = this.levels[this.levelIndex];
    return [
      level.source,
      level.dest,
      ...this.towers.map((t) => ({ x: t.x, y: t.y })),
    ];
  }

  private canLink(
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): boolean {
    const level = this.levels[this.levelIndex];
    if (Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) > level.range)
      return false;
    const line = new Phaser.Geom.Line(a.x, a.y, b.x, b.y);
    for (const o of level.obstacles) {
      const r = new Phaser.Geom.Rectangle(o.x, o.y, o.w, o.h);
      if (Phaser.Geom.Intersects.LineToRectangle(line, r)) return false;
    }
    return true;
  }

  private computeConnectivity(): { connected: boolean; path: number[] } {
    const nodes = this.nodes();
    const from = 0;
    const to = 1;
    const prev = new Map<number, number>();
    prev.set(from, -1);
    const queue: number[] = [from];
    while (queue.length) {
      const cur = queue.shift() as number;
      if (cur === to) break;
      for (let i = 0; i < nodes.length; i++) {
        if (i === cur || prev.has(i)) continue;
        if (this.canLink(nodes[cur], nodes[i])) {
          prev.set(i, cur);
          queue.push(i);
        }
      }
    }
    if (!prev.has(to)) return { connected: false, path: [] };
    const path: number[] = [];
    let c: number | undefined = to;
    while (c !== undefined && c !== -1) {
      path.push(c);
      c = prev.get(c);
    }
    return { connected: true, path: path.reverse() };
  }

  private drawLinks(): void {
    const nodes = this.nodes();
    this.linkGfx.clear();

    // All potential edges between towers + terminals (faint)
    this.linkGfx.lineStyle(2, COLOR_LINK, 0.35);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (this.canLink(nodes[i], nodes[j])) {
          this.linkGfx.lineBetween(
            nodes[i].x,
            nodes[i].y,
            nodes[j].x,
            nodes[j].y,
          );
        }
      }
    }

    // Connected path — bright, pulsing
    if (this.connected && this.pathIndices.length > 1) {
      const pulse = 0.55 + 0.45 * Math.sin(this.pulseT);
      this.linkGfx.lineStyle(6, COLOR_PATH, 0.9);
      for (let i = 0; i < this.pathIndices.length - 1; i++) {
        const a = nodes[this.pathIndices[i]];
        const b = nodes[this.pathIndices[i + 1]];
        this.linkGfx.lineBetween(a.x, a.y, b.x, b.y);
      }
      // Pulsing overlay
      this.linkGfx.lineStyle(2 + 4 * pulse, 0xffffff, 0.3 * pulse);
      for (let i = 0; i < this.pathIndices.length - 1; i++) {
        const a = nodes[this.pathIndices[i]];
        const b = nodes[this.pathIndices[i + 1]];
        this.linkGfx.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
  }

  dumpState(): TowerSceneState {
    return {
      active: this.scene.isActive(),
      levelIndex: this.levelIndex,
      levelCount: this.levels.length,
      towers: this.towers.map((t) => ({ x: t.x, y: t.y })),
      connected: this.connected,
      path: [...this.pathIndices],
      viewport: { width: this.scale.width, height: this.scale.height },
    };
  }
}
