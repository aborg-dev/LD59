import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";
import {
  cleanLevel,
  TOWER_LEVELS,
  type TowerInhibitor,
  type TowerLevel,
  type TowerObstacle,
  type TowerTerminal,
} from "../levels/tower/index.js";

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
const COLOR_INHIBITOR = 0xff3355;
const COLOR_INHIBITOR_EDGE = 0x661122;
const TERMINAL_COLORS = [0x4ecdc4, 0xff6b6b, 0x3dd14a];

const EDITOR_HANDLE_COLOR = 0xffff66;
const EDITOR_HANDLE_ACTIVE = 0xffffff;
const GRID_SNAP = 10;

const RANGE_MIN = 120;
const RANGE_MAX = 720;
const RANGE_STEP = 20;

const DEFAULT_OBSTACLE_W = 160;
const DEFAULT_OBSTACLE_H = 100;
const MIN_OBSTACLE_W = 40;
const MIN_OBSTACLE_H = 40;
const DEFAULT_INHIBITOR_RADIUS = 120;
const MIN_INHIBITOR_RADIUS = 30;
const OBSTACLE_CORNER_SIZE = 18;

interface Tower {
  x: number;
  y: number;
  gfx: Phaser.GameObjects.Graphics;
  rangeGfx: Phaser.GameObjects.Graphics;
}

type PlaceMode = "terminal" | "obstacle" | "inhibitor" | "delete" | null;
type HandleKind =
  | "terminal"
  | "obstacleBody"
  | "obstacleCorner"
  | "inhibitorBody"
  | "inhibitorRadius";

interface TerminalHandleSet {
  body: Phaser.GameObjects.Arc;
}
interface ObstacleHandleSet {
  body: Phaser.GameObjects.Zone;
  corner: Phaser.GameObjects.Rectangle;
}
interface InhibitorHandleSet {
  body: Phaser.GameObjects.Arc;
  radius: Phaser.GameObjects.Arc;
}

export interface TowerSceneState {
  active: boolean;
  levelIndex: number;
  levelCount: number;
  terminalCount: number;
  towers: { x: number; y: number }[];
  connected: boolean;
  viewport: { width: number; height: number };
  editor?: {
    active: boolean;
    dirty: boolean;
    placeMode: PlaceMode;
    draft: TowerLevel | null;
  };
}

export class TowerScene extends Phaser.Scene {
  private levels: TowerLevel[] = TOWER_LEVELS;
  private levelIndex = 0;
  private towers: Tower[] = [];
  private connected = false;
  private pathEdges: [number, number][] = [];

  private fieldTop = HUD_TOP_H;
  private fieldBottom = 0;

  private fieldGrid!: Phaser.GameObjects.Graphics;
  private obstacleGfx!: Phaser.GameObjects.Graphics;
  private inhibitorGfx!: Phaser.GameObjects.Graphics;
  private linkGfx!: Phaser.GameObjects.Graphics;
  private terminalGfx!: Phaser.GameObjects.Graphics;
  private pulseT = 0;

  private levelText!: Phaser.GameObjects.Text;
  private budgetText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private nextBtn!: Phaser.GameObjects.Text;
  private muteText!: Phaser.GameObjects.Text;
  private resetBtn!: Phaser.GameObjects.Text;
  private menuBtn!: Phaser.GameObjects.Text;
  private editBtn: Phaser.GameObjects.Text | null = null;

  private editorActive = false;
  private draft: TowerLevel | null = null;
  private dirty = false;
  private placeMode: PlaceMode = null;
  private paletteGroup: Phaser.GameObjects.GameObject[] = [];
  private paletteButtons: Map<string, Phaser.GameObjects.Text> = new Map();
  private rangeLabel: Phaser.GameObjects.Text | null = null;
  private saveStatusTimer = 0;
  private terminalHandles: TerminalHandleSet[] = [];
  private obstacleHandles: ObstacleHandleSet[] = [];
  private inhibitorHandles: InhibitorHandleSet[] = [];

  constructor() {
    super("Tower");
  }

  create(data?: { startLevel?: number }): void {
    const { width, height } = this.scale;
    this.fieldTop = HUD_TOP_H;
    this.fieldBottom = height - HUD_BOTTOM_H;

    this.towers = [];
    this.connected = false;
    this.pathEdges = [];
    this.levelIndex = data?.startLevel ?? 0;
    this.editorActive = false;
    this.draft = null;
    this.dirty = false;
    this.placeMode = null;
    this.terminalHandles = [];
    this.obstacleHandles = [];
    this.inhibitorHandles = [];
    this.paletteGroup = [];
    this.paletteButtons.clear();
    this.input.mouse?.disableContextMenu();

    this.add
      .rectangle(width / 2, height / 2, width, height, COLOR_FIELD)
      .setDepth(0);

    this.fieldGrid = this.add.graphics().setDepth(1);
    this.drawFieldGrid();

    this.obstacleGfx = this.add.graphics().setDepth(2);
    this.inhibitorGfx = this.add.graphics().setDepth(2);
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

    this.hintText = this.add
      .text(width / 2, HUD_TOP_H + 24, "", {
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

    this.resetBtn = this.add
      .text(0, btnY, "RESET", btnStyle)
      .setOrigin(1, 0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.resetBtn.on("pointerdown", () => {
      this.sound.play("pop");
      this.clearTowers();
      this.refresh();
    });

    const menuBtn = this.add
      .text(0, btnY, "MENU", btnStyle)
      .setOrigin(1, 0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    menuBtn.on("pointerdown", () => {
      if (this.editorActive && this.draft) {
        this.levels[this.levelIndex] = this.cloneLevel(this.draft);
      }
      this.sound.play("pop");
      this.scene.start("TowerLevelSelect");
    });

    const muted = this.game.sound.mute;
    this.muteText = this.add
      .text(0, btnY, muted ? "UNMUTE" : "MUTE", btnStyle)
      .setOrigin(1, 0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.muteText.on("pointerdown", () => {
      this.game.sound.mute = !this.game.sound.mute;
      this.muteText.setText(this.game.sound.mute ? "UNMUTE" : "MUTE");
    });

    this.nextBtn = this.add
      .text(0, btnY, "NEXT", {
        ...btnStyle,
        backgroundColor: "#446633",
      })
      .setOrigin(1, 0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.nextBtn.on("pointerdown", () => {
      if (!this.connected) return;
      this.sound.play("score");
      this.goToLevel(this.levelIndex + 1);
    });

    if (import.meta.env.DEV) {
      this.editBtn = this.add
        .text(0, btnY, "EDIT", {
          ...btnStyle,
          backgroundColor: "#663388",
        })
        .setOrigin(1, 0.5)
        .setDepth(101)
        .setInteractive({ useHandCursor: true });
      this.editBtn.on("pointerdown", () => this.toggleEditor());
    }

    this.layoutBottomActions(width);
    this.menuBtn = menuBtn;

    // Field input — tap to place, tap on tower to remove (gameplay)
    //                 editor: palette place, drag handles, right-click delete
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.y < this.fieldTop || p.y > this.fieldBottom) return;
      if (this.editorActive) {
        this.onEditorFieldTap(p);
      } else {
        this.onFieldTap(p.x, p.y);
      }
    });

    // Drag events for editor handles
    this.input.on(
      "drag",
      (
        _pointer: Phaser.Input.Pointer,
        obj: Phaser.GameObjects.GameObject,
        dragX: number,
        dragY: number,
      ) => {
        if (!this.editorActive) return;
        this.onEditorDrag(obj, dragX, dragY);
      },
    );
    this.input.on(
      "dragend",
      (_pointer: Phaser.Input.Pointer, _obj: Phaser.GameObjects.GameObject) => {
        if (!this.editorActive) return;
        this.snapDraftToGrid();
        this.rebuildHandles();
        this.redrawDraft();
        this.dirty = true;
      },
    );

    this.loadLevel(this.levelIndex);
  }

  update(_time: number, delta: number): void {
    if (this.saveStatusTimer > 0) {
      this.saveStatusTimer -= delta;
      if (this.saveStatusTimer <= 0) {
        this.refresh();
      }
    }
    if (!this.connected) return;
    this.pulseT += delta * 0.006;
    this.drawLinks();
  }

  private drawFieldGrid(): void {
    const { width } = this.scale;
    this.fieldGrid.clear();
    this.fieldGrid.lineStyle(1, COLOR_GRID, 0.7);
    for (let x = 40; x < width; x += 40) {
      this.fieldGrid.moveTo(x, this.fieldTop);
      this.fieldGrid.lineTo(x, this.fieldBottom);
    }
    for (let y = this.fieldTop + 40; y < this.fieldBottom; y += 40) {
      this.fieldGrid.moveTo(0, y);
      this.fieldGrid.lineTo(width, y);
    }
    this.fieldGrid.strokePath();
  }

  private currentLevel(): TowerLevel {
    return this.draft ?? this.levels[this.levelIndex];
  }

  private loadLevel(index: number): void {
    if (index >= this.levels.length) {
      this.scene.start("TowerLevelSelect");
      return;
    }
    if (index !== this.levelIndex && this.draft) {
      // Switching levels — drop the in-progress draft from the previous level.
      this.draft = null;
      this.dirty = false;
    }
    this.levelIndex = index;
    this.clearTowers();
    const level = this.currentLevel();

    this.drawObstacles();
    this.drawInhibitors();
    this.drawTerminals();

    this.levelText.setText(`Level ${index + 1}/${this.levels.length}`);
    this.hintText.setText(this.editorActive ? "" : (level.hint ?? ""));
    this.refresh();
  }

  private goToLevel(index: number): void {
    this.loadLevel(index);
  }

  private drawObstacles(): void {
    const level = this.currentLevel();
    this.obstacleGfx.clear();
    for (const o of level.obstacles) {
      this.obstacleGfx.fillStyle(COLOR_OBSTACLE, 1);
      this.obstacleGfx.lineStyle(3, COLOR_OBSTACLE_EDGE);
      this.obstacleGfx.fillRoundedRect(o.x, o.y, o.w, o.h, 6);
      this.obstacleGfx.strokeRoundedRect(o.x, o.y, o.w, o.h, 6);
    }
  }

  private drawInhibitors(): void {
    this.inhibitorGfx.clear();
    const inhibitors = this.currentLevel().inhibitors ?? [];
    for (const jam of inhibitors) {
      this.inhibitorGfx.fillStyle(COLOR_INHIBITOR, 0.14);
      this.inhibitorGfx.fillCircle(jam.x, jam.y, jam.radius);
      this.inhibitorGfx.lineStyle(2, COLOR_INHIBITOR, 0.55);
      this.inhibitorGfx.strokeCircle(jam.x, jam.y, jam.radius);
      this.inhibitorGfx.fillStyle(COLOR_INHIBITOR_EDGE, 1);
      this.inhibitorGfx.fillCircle(jam.x, jam.y, 22);
      this.inhibitorGfx.fillStyle(COLOR_INHIBITOR, 1);
      this.inhibitorGfx.fillCircle(jam.x, jam.y, 18);
      this.inhibitorGfx.lineStyle(3, 0xffffff, 0.9);
      const s = 8;
      this.inhibitorGfx.lineBetween(jam.x - s, jam.y - s, jam.x + s, jam.y + s);
      this.inhibitorGfx.lineBetween(jam.x - s, jam.y + s, jam.x + s, jam.y - s);
    }
  }

  private drawTerminals(): void {
    const { terminals, range } = this.currentLevel();
    this.terminalGfx.clear();

    const level = this.levels[this.levelIndex];
    for (let i = 0; i < terminals.length; i++) {
      const t = terminals[i];
      const color = TERMINAL_COLORS[i % TERMINAL_COLORS.length];
      const pts = this.rangePoints(t.x, t.y, range, level);
      this.terminalGfx.fillStyle(color, 0.07);
      this.terminalGfx.fillPoints(pts, true);
      this.terminalGfx.lineStyle(2, color, 0.22);
      this.terminalGfx.strokePoints(pts, true);
    }
    for (let i = 0; i < terminals.length; i++) {
      const t = terminals[i];
      const color = TERMINAL_COLORS[i % TERMINAL_COLORS.length];
      this.drawBeacon(this.terminalGfx, t.x, t.y, color);
    }
  }

  private drawBeacon(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    color: number,
  ): void {
    g.fillStyle(COLOR_TOWER_EDGE, 1);
    g.fillRoundedRect(
      x - TERMINAL_VISUAL_R,
      y + TERMINAL_VISUAL_R * 0.3,
      TERMINAL_VISUAL_R * 2,
      10,
      3,
    );
    g.fillStyle(color, 1);
    g.lineStyle(3, 0x000000, 1);
    g.fillCircle(x, y, TERMINAL_VISUAL_R);
    g.strokeCircle(x, y, TERMINAL_VISUAL_R);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(x, y, TERMINAL_VISUAL_R * 0.35);
  }

  private onFieldTap(x: number, y: number): void {
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

    const level = this.currentLevel();
    for (const term of level.terminals) {
      if (
        Phaser.Math.Distance.Between(x, y, term.x, term.y) <
        TERMINAL_VISUAL_R + 12
      )
        return;
    }
    for (const o of level.obstacles) {
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return;
    }
    for (const jam of level.inhibitors ?? []) {
      if (Phaser.Math.Distance.Between(x, y, jam.x, jam.y) <= jam.radius)
        return;
    }
    for (const t of this.towers) {
      if (Phaser.Math.Distance.Between(x, y, t.x, t.y) < PLACE_MIN_DIST) return;
    }

    this.placeTower(x, y);
  }

  private rayRectDist(
    ox: number,
    oy: number,
    dx: number,
    dy: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
  ): number | null {
    let tEnter = 0;
    let tExit = Infinity;
    if (Math.abs(dx) < 1e-9) {
      if (ox < rx || ox > rx + rw) return null;
    } else {
      let t1 = (rx - ox) / dx;
      let t2 = (rx + rw - ox) / dx;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tEnter = Math.max(tEnter, t1);
      tExit = Math.min(tExit, t2);
    }
    if (Math.abs(dy) < 1e-9) {
      if (oy < ry || oy > ry + rh) return null;
    } else {
      let t1 = (ry - oy) / dy;
      let t2 = (ry + rh - oy) / dy;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tEnter = Math.max(tEnter, t1);
      tExit = Math.min(tExit, t2);
    }
    if (tEnter > tExit || tEnter <= 0) return null;
    return tEnter;
  }

  private rayCircleDist(
    ox: number,
    oy: number,
    dx: number,
    dy: number,
    cx: number,
    cy: number,
    r: number,
  ): number | null {
    const fx = ox - cx;
    const fy = oy - cy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / 2;
    if (t <= 0) return null;
    return t;
  }

  private rangePoints(
    x: number,
    y: number,
    range: number,
    level: TowerLevel,
  ): Phaser.Math.Vector2[] {
    const NUM_RAYS = 360;
    const points: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < NUM_RAYS; i++) {
      const angle = (i / NUM_RAYS) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let dist = range;
      for (const o of level.obstacles) {
        const d = this.rayRectDist(x, y, dx, dy, o.x, o.y, o.w, o.h);
        if (d !== null && d < dist) dist = d;
      }
      for (const jam of level.inhibitors ?? []) {
        const d = this.rayCircleDist(x, y, dx, dy, jam.x, jam.y, jam.radius);
        if (d !== null && d < dist) dist = d;
      }
      points.push(new Phaser.Math.Vector2(x + dx * dist, y + dy * dist));
    }
    return points;
  }

  private placeTower(x: number, y: number): void {
    const level = this.currentLevel();
    const rangeGfx = this.add.graphics().setDepth(2);
    const rangePts = this.rangePoints(x, y, level.range, level);
    rangeGfx.fillStyle(COLOR_RANGE, 0.06);
    rangeGfx.fillPoints(rangePts, true);
    rangeGfx.lineStyle(1, COLOR_RANGE, 0.2);
    rangeGfx.strokePoints(rangePts, true);

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
    if (this.editorActive) {
      if (this.saveStatusTimer <= 0) {
        this.budgetText.setColor(this.dirty ? "#ffe099" : "#88ff99");
        this.budgetText.setText(this.dirty ? "UNSAVED" : "SAVED");
      }
      this.statusText.setText("");
      this.nextBtn.setVisible(false);
      return;
    }
    this.budgetText.setColor("#ffffff");
    this.budgetText.setText(`Towers: ${this.towers.length}`);
    const { connected, edges } = this.computeConnectivity();
    const wasConnected = this.connected;
    this.connected = connected;
    this.pathEdges = edges;
    this.drawLinks();

    if (connected && !wasConnected) this.sound.play("score");

    if (connected) {
      const n = this.currentLevel().terminals.length;
      this.statusText.setText(
        n > 2 ? "ALL TOWERS LINKED — tap NEXT" : "SIGNAL THROUGH — tap NEXT",
      );
      this.statusText.setColor("#88ff99");
      this.nextBtn.setVisible(true);
    } else {
      this.statusText.setText("");
      this.nextBtn.setVisible(false);
    }
  }

  private nodes(): { x: number; y: number }[] {
    const level = this.currentLevel();
    return [
      ...level.terminals,
      ...this.towers.map((t) => ({ x: t.x, y: t.y })),
    ];
  }

  private terminalCount(): number {
    return this.currentLevel().terminals.length;
  }

  private canLink(
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): boolean {
    const level = this.currentLevel();
    if (Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) > level.range)
      return false;
    const line = new Phaser.Geom.Line(a.x, a.y, b.x, b.y);
    for (const o of level.obstacles) {
      const r = new Phaser.Geom.Rectangle(o.x, o.y, o.w, o.h);
      if (Phaser.Geom.Intersects.LineToRectangle(line, r)) return false;
    }
    for (const jam of level.inhibitors ?? []) {
      const c = new Phaser.Geom.Circle(jam.x, jam.y, jam.radius);
      if (Phaser.Geom.Intersects.LineToCircle(line, c)) return false;
    }
    return true;
  }

  private computeConnectivity(): {
    connected: boolean;
    edges: [number, number][];
  } {
    const nodes = this.nodes();
    const termCount = this.terminalCount();

    const prev = new Map<number, number>();
    prev.set(0, -1);
    const queue: number[] = [0];
    while (queue.length) {
      const cur = queue.shift() as number;
      for (let i = 0; i < nodes.length; i++) {
        if (i === cur || prev.has(i)) continue;
        if (this.canLink(nodes[cur], nodes[i])) {
          prev.set(i, cur);
          queue.push(i);
        }
      }
    }

    for (let t = 0; t < termCount; t++) {
      if (!prev.has(t)) return { connected: false, edges: [] };
    }

    const seen = new Set<string>();
    const edges: [number, number][] = [];
    for (let t = 1; t < termCount; t++) {
      let c: number | undefined = t;
      while (c !== undefined && c !== -1) {
        const p = prev.get(c);
        if (p === undefined || p === -1) break;
        const lo = Math.min(c, p);
        const hi = Math.max(c, p);
        const key = `${lo}-${hi}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push([c, p]);
        }
        c = p;
      }
    }
    return { connected: true, edges };
  }

  private drawLinks(): void {
    if (this.editorActive) {
      this.linkGfx.clear();
      return;
    }
    const nodes = this.nodes();
    this.linkGfx.clear();

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

    if (this.connected && this.pathEdges.length > 0) {
      const pulse = 0.55 + 0.45 * Math.sin(this.pulseT);
      this.linkGfx.lineStyle(6, COLOR_PATH, 0.9);
      for (const [i, j] of this.pathEdges) {
        this.linkGfx.lineBetween(
          nodes[i].x,
          nodes[i].y,
          nodes[j].x,
          nodes[j].y,
        );
      }
      this.linkGfx.lineStyle(2 + 4 * pulse, 0xffffff, 0.3 * pulse);
      for (const [i, j] of this.pathEdges) {
        this.linkGfx.lineBetween(
          nodes[i].x,
          nodes[i].y,
          nodes[j].x,
          nodes[j].y,
        );
      }
    }
  }

  // ---------- editor ----------

  private toggleEditor(): void {
    if (this.editorActive) {
      this.exitEditor();
    } else {
      this.enterEditor();
    }
  }

  private enterEditor(): void {
    this.sound.play("pop");
    this.clearTowers();
    if (!this.draft) {
      this.draft = this.cloneLevel(this.levels[this.levelIndex]);
      this.dirty = false;
    }
    this.editorActive = true;
    this.placeMode = null;
    this.hintText.setText("");
    this.resetBtn.setVisible(false);
    this.nextBtn.setVisible(false);
    this.muteText.setVisible(false);
    if (this.editBtn) this.editBtn.setText("PLAY");
    this.buildPalette();
    this.layoutBottomActions(this.scale.width);
    this.rebuildHandles();
    this.redrawDraft();
    this.refresh();
  }

  private exitEditor(): void {
    if (!this.draft) return;
    this.sound.play("pop");
    // Promote the draft into the in-memory level so it stays the active
    // playable version even if the user later returns to this scene without
    // saving to disk. SAVE is what persists across page reloads.
    this.levels[this.levelIndex] = this.cloneLevel(this.draft);
    this.editorActive = false;
    this.placeMode = null;
    this.destroyHandles();
    this.destroyPalette();
    if (this.editBtn) this.editBtn.setText("EDIT");
    this.resetBtn.setVisible(true);
    this.muteText.setVisible(true);
    // nextBtn visibility is set by refresh() based on connection state.
    this.layoutBottomActions(this.scale.width);
    this.loadLevel(this.levelIndex);
  }

  private cloneLevel(level: TowerLevel): TowerLevel {
    return {
      terminals: level.terminals.map((t) => ({ ...t })),
      obstacles: level.obstacles.map((o) => ({ ...o })),
      inhibitors: level.inhibitors?.map((j) => ({ ...j })) ?? [],
      range: level.range,
      hint: level.hint,
    };
  }

  private layoutBottomActions(width: number): void {
    const margin = 24;
    const gap = 12;
    let x = width - margin;
    // In editor mode only MENU + PLAY/EDIT are visible; pack them tight on
    // the right so the palette has the rest of the row. In gameplay all five
    // buttons keep fixed slots — visibility toggles for NEXT don't shuffle
    // the others.
    const order: (Phaser.GameObjects.Text | null)[] = this.editorActive
      ? [this.editBtn, this.menuBtn]
      : [
          this.nextBtn,
          this.muteText,
          this.menuBtn,
          this.resetBtn,
          this.editBtn,
        ];
    for (const btn of order) {
      if (!btn) continue;
      btn.setX(x);
      x -= btn.width + gap;
    }
  }

  private buildPalette(): void {
    const btnY = this.fieldBottom + HUD_BOTTOM_H / 2;

    const btnStyle = {
      fontFamily: FONT_BODY,
      fontSize: 18,
      color: "#ffffff",
      backgroundColor: "#3a3a55",
      padding: { left: 10, right: 10, top: 8, bottom: 8 },
      resolution: TEXT_RESOLUTION,
    };

    const items: Phaser.GameObjects.Text[] = [];
    const makeBtn = (
      label: string,
      onClick: () => void,
      key?: string,
      bg?: string,
    ): Phaser.GameObjects.Text => {
      const t = this.add
        .text(
          0,
          btnY,
          label,
          bg ? { ...btnStyle, backgroundColor: bg } : btnStyle,
        )
        .setOrigin(0, 0.5)
        .setDepth(102)
        .setInteractive({ useHandCursor: true });
      t.on("pointerdown", (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return;
        onClick();
      });
      this.paletteGroup.push(t);
      items.push(t);
      if (key) this.paletteButtons.set(key, t);
      return t;
    };

    makeBtn("+ Terminal", () => this.setPlaceMode("terminal"), "terminal");
    makeBtn("+ Obstacle", () => this.setPlaceMode("obstacle"), "obstacle");
    makeBtn("+ Inhibitor", () => this.setPlaceMode("inhibitor"), "inhibitor");
    makeBtn("× Delete", () => this.setPlaceMode("delete"), "delete", "#883344");
    makeBtn("Range −", () => this.adjustRange(-RANGE_STEP));

    this.rangeLabel = this.add
      .text(0, btnY, `${this.draft?.range ?? 0}`, {
        fontFamily: FONT_UI,
        fontSize: 22,
        color: "#ffe099",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0, 0.5)
      .setDepth(102);
    this.paletteGroup.push(this.rangeLabel);
    items.push(this.rangeLabel);

    makeBtn("Range +", () => this.adjustRange(RANGE_STEP));
    makeBtn("SAVE", () => this.saveLevel(), "save", "#446633");

    // Left-anchored layout starting at x=24. The bottom HUD's right side keeps
    // the always-visible MENU button; in editor mode RESET/MUTE/NEXT/EDIT are
    // hidden so the palette has the rest of the row to itself.
    const gap = 6;
    let x = 24;
    for (const b of items) {
      b.setX(x);
      x += b.width + gap;
    }

    this.updatePaletteVisuals();
  }

  private destroyPalette(): void {
    for (const obj of this.paletteGroup) obj.destroy();
    this.paletteGroup = [];
    this.paletteButtons.clear();
    this.rangeLabel = null;
  }

  private updatePaletteVisuals(): void {
    for (const [key, btn] of this.paletteButtons) {
      if (key === "save") continue;
      const active = this.placeMode === key;
      if (key === "delete") {
        btn.setStyle({
          backgroundColor: active ? "#cc4466" : "#883344",
          color: active ? "#ffff99" : "#ffffff",
        });
      } else {
        btn.setStyle({
          backgroundColor: active ? "#5a5a88" : "#3a3a55",
          color: active ? "#ffff99" : "#ffffff",
        });
      }
    }
    if (this.rangeLabel && this.draft) {
      this.rangeLabel.setText(`${this.draft.range}`);
    }
  }

  private setPlaceMode(mode: Exclude<PlaceMode, null>): void {
    this.placeMode = this.placeMode === mode ? null : mode;
    this.updatePaletteVisuals();
  }

  private adjustRange(delta: number): void {
    if (!this.draft) return;
    const next = Phaser.Math.Clamp(
      this.draft.range + delta,
      RANGE_MIN,
      RANGE_MAX,
    );
    if (next === this.draft.range) return;
    this.draft.range = next;
    this.dirty = true;
    this.drawTerminals();
    this.updatePaletteVisuals();
    this.refresh();
  }

  private onEditorFieldTap(p: Phaser.Input.Pointer): void {
    if (!this.draft) return;
    const hits = this.input.hitTestPointer(p);
    const hitHandle = hits.some((h) => h.getData("editor") === true);

    if (p.rightButtonDown() || this.placeMode === "delete") {
      if (hitHandle) this.deleteHandleTarget(hits);
      return;
    }
    if (hitHandle) return; // drag or no-op; don't place through handles
    if (!this.placeMode) return;

    const x = this.snap(p.x);
    const y = this.snap(p.y);
    if (y < this.fieldTop || y > this.fieldBottom) return;

    if (this.placeMode === "terminal") {
      this.draft.terminals.push({ x, y });
    } else if (this.placeMode === "obstacle") {
      this.draft.obstacles.push({
        x: x - DEFAULT_OBSTACLE_W / 2,
        y: y - DEFAULT_OBSTACLE_H / 2,
        w: DEFAULT_OBSTACLE_W,
        h: DEFAULT_OBSTACLE_H,
      });
    } else if (this.placeMode === "inhibitor") {
      if (!this.draft.inhibitors) this.draft.inhibitors = [];
      this.draft.inhibitors.push({
        x,
        y,
        radius: DEFAULT_INHIBITOR_RADIUS,
      });
    }
    this.dirty = true;
    this.sound.play("pop");
    this.rebuildHandles();
    this.redrawDraft();
    this.refresh();
  }

  private deleteHandleTarget(hits: Phaser.GameObjects.GameObject[]): void {
    if (!this.draft) return;
    for (const h of hits) {
      if (h.getData("editor") !== true) continue;
      const kind = h.getData("kind") as HandleKind;
      const idx = h.getData("index") as number;
      if (kind === "terminal") {
        this.draft.terminals.splice(idx, 1);
      } else if (kind === "obstacleBody" || kind === "obstacleCorner") {
        this.draft.obstacles.splice(idx, 1);
      } else if (kind === "inhibitorBody" || kind === "inhibitorRadius") {
        this.draft.inhibitors?.splice(idx, 1);
      }
      this.dirty = true;
      this.sound.play("pop");
      this.rebuildHandles();
      this.redrawDraft();
      this.refresh();
      return;
    }
  }

  private onEditorDrag(
    obj: Phaser.GameObjects.GameObject,
    dragX: number,
    dragY: number,
  ): void {
    if (!this.draft) return;
    if (obj.getData("editor") !== true) return;
    const kind = obj.getData("kind") as HandleKind;
    const idx = obj.getData("index") as number;
    const clampedY = Phaser.Math.Clamp(dragY, this.fieldTop, this.fieldBottom);

    if (kind === "terminal") {
      const t = this.draft.terminals[idx];
      if (!t) return;
      t.x = dragX;
      t.y = clampedY;
      (obj as Phaser.GameObjects.Arc).setPosition(t.x, t.y);
    } else if (kind === "obstacleBody") {
      const o = this.draft.obstacles[idx];
      if (!o) return;
      o.x = dragX - o.w / 2;
      o.y = clampedY - o.h / 2;
      const set = this.obstacleHandles[idx];
      if (set) {
        (set.body as Phaser.GameObjects.Zone).setPosition(
          o.x + o.w / 2,
          o.y + o.h / 2,
        );
        set.corner.setPosition(o.x + o.w, o.y + o.h);
      }
    } else if (kind === "obstacleCorner") {
      const o = this.draft.obstacles[idx];
      if (!o) return;
      o.w = Math.max(MIN_OBSTACLE_W, dragX - o.x);
      o.h = Math.max(MIN_OBSTACLE_H, clampedY - o.y);
      const set = this.obstacleHandles[idx];
      if (set) {
        set.corner.setPosition(o.x + o.w, o.y + o.h);
        (set.body as Phaser.GameObjects.Zone).setPosition(
          o.x + o.w / 2,
          o.y + o.h / 2,
        );
        set.body.setSize(o.w, o.h);
        if (set.body.input) {
          set.body.input.hitArea = new Phaser.Geom.Rectangle(0, 0, o.w, o.h);
        }
      }
    } else if (kind === "inhibitorBody") {
      const j = this.draft.inhibitors?.[idx];
      if (!j) return;
      j.x = dragX;
      j.y = clampedY;
      const set = this.inhibitorHandles[idx];
      if (set) {
        set.body.setPosition(j.x, j.y);
        set.radius.setPosition(j.x + j.radius, j.y);
      }
    } else if (kind === "inhibitorRadius") {
      const j = this.draft.inhibitors?.[idx];
      if (!j) return;
      const dx = dragX - j.x;
      const dy = clampedY - j.y;
      j.radius = Math.max(
        MIN_INHIBITOR_RADIUS,
        Math.round(Math.sqrt(dx * dx + dy * dy)),
      );
      const set = this.inhibitorHandles[idx];
      if (set) {
        set.radius.setPosition(j.x + j.radius, j.y);
      }
    }
    this.dirty = true;
    this.redrawDraft();
    this.refresh();
  }

  private snap(v: number): number {
    return Math.round(v / GRID_SNAP) * GRID_SNAP;
  }

  private snapDraftToGrid(): void {
    if (!this.draft) return;
    for (const t of this.draft.terminals) {
      t.x = this.snap(t.x);
      t.y = this.snap(t.y);
    }
    for (const o of this.draft.obstacles) {
      o.x = this.snap(o.x);
      o.y = this.snap(o.y);
      o.w = Math.max(MIN_OBSTACLE_W, this.snap(o.w));
      o.h = Math.max(MIN_OBSTACLE_H, this.snap(o.h));
    }
    for (const j of this.draft.inhibitors ?? []) {
      j.x = this.snap(j.x);
      j.y = this.snap(j.y);
      j.radius = Math.max(MIN_INHIBITOR_RADIUS, this.snap(j.radius));
    }
  }

  private redrawDraft(): void {
    this.drawObstacles();
    this.drawInhibitors();
    this.drawTerminals();
  }

  private destroyHandles(): void {
    for (const h of this.terminalHandles) h.body.destroy();
    for (const h of this.obstacleHandles) {
      h.body.destroy();
      h.corner.destroy();
    }
    for (const h of this.inhibitorHandles) {
      h.body.destroy();
      h.radius.destroy();
    }
    this.terminalHandles = [];
    this.obstacleHandles = [];
    this.inhibitorHandles = [];
  }

  private rebuildHandles(): void {
    this.destroyHandles();
    if (!this.draft) return;

    const d = this.draft;
    for (let i = 0; i < d.terminals.length; i++) {
      const t = d.terminals[i];
      const body = this.add
        .circle(t.x, t.y, TERMINAL_VISUAL_R + 4, EDITOR_HANDLE_COLOR, 0.25)
        .setStrokeStyle(2, EDITOR_HANDLE_COLOR, 0.9)
        .setDepth(20);
      body.setInteractive({ draggable: true, useHandCursor: true });
      body.setData("editor", true);
      body.setData("kind", "terminal");
      body.setData("index", i);
      this.terminalHandles.push({ body });
    }

    for (let i = 0; i < d.obstacles.length; i++) {
      const o = d.obstacles[i];
      const body = this.add.zone(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h);
      body.setOrigin(0.5, 0.5);
      body.setInteractive({ draggable: true, useHandCursor: true });
      body.setData("editor", true);
      body.setData("kind", "obstacleBody");
      body.setData("index", i);
      body.setDepth(18);

      const corner = this.add
        .rectangle(
          o.x + o.w,
          o.y + o.h,
          OBSTACLE_CORNER_SIZE,
          OBSTACLE_CORNER_SIZE,
          EDITOR_HANDLE_ACTIVE,
          0.9,
        )
        .setStrokeStyle(2, 0x000000, 1)
        .setDepth(21);
      corner.setInteractive({ draggable: true, useHandCursor: true });
      corner.setData("editor", true);
      corner.setData("kind", "obstacleCorner");
      corner.setData("index", i);
      this.obstacleHandles.push({ body, corner });
    }

    const jams = d.inhibitors ?? [];
    for (let i = 0; i < jams.length; i++) {
      const j = jams[i];
      const body = this.add
        .circle(j.x, j.y, 26, EDITOR_HANDLE_COLOR, 0.35)
        .setStrokeStyle(2, EDITOR_HANDLE_COLOR, 0.9)
        .setDepth(20);
      body.setInteractive({ draggable: true, useHandCursor: true });
      body.setData("editor", true);
      body.setData("kind", "inhibitorBody");
      body.setData("index", i);

      const radius = this.add
        .circle(j.x + j.radius, j.y, 12, EDITOR_HANDLE_ACTIVE, 0.9)
        .setStrokeStyle(2, 0x000000, 1)
        .setDepth(21);
      radius.setInteractive({ draggable: true, useHandCursor: true });
      radius.setData("editor", true);
      radius.setData("kind", "inhibitorRadius");
      radius.setData("index", i);
      this.inhibitorHandles.push({ body, radius });
    }
  }

  private serializedLevel(): TowerLevel {
    if (!this.draft) throw new Error("no draft");
    const out: TowerLevel = {
      terminals: this.draft.terminals.map((t) => ({ x: t.x, y: t.y })),
      obstacles: this.draft.obstacles.map((o) => ({
        x: o.x,
        y: o.y,
        w: o.w,
        h: o.h,
      })),
      range: this.draft.range,
    };
    if (this.draft.inhibitors && this.draft.inhibitors.length > 0) {
      out.inhibitors = this.draft.inhibitors.map((j) => ({
        x: j.x,
        y: j.y,
        radius: j.radius,
      }));
    }
    if (this.draft.hint) out.hint = this.draft.hint;
    return cleanLevel(out);
  }

  private async saveLevel(): Promise<void> {
    if (!this.draft) return;
    this.snapDraftToGrid();
    const payload = {
      index: this.levelIndex,
      level: this.serializedLevel(),
    };
    this.setSaveStatus("Saving…", "#ffe099");
    try {
      const res = await fetch("/api/save-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.levels[this.levelIndex] = this.cloneLevel(payload.level);
      this.dirty = false;
      this.setSaveStatus("Saved", "#88ff99");
      this.sound.play("score");
      this.redrawDraft();
      this.rebuildHandles();
      this.refresh();
    } catch (err) {
      this.setSaveStatus(`Save failed: ${err}`, "#ff6666");
    }
  }

  private setSaveStatus(msg: string, color: string): void {
    this.budgetText.setColor(color);
    this.budgetText.setText(msg);
    this.saveStatusTimer = 3000;
  }

  private dumpEditorState(): TowerSceneState["editor"] {
    return {
      active: this.editorActive,
      dirty: this.dirty,
      placeMode: this.editorActive ? this.placeMode : null,
      draft: this.draft ? this.cloneLevel(this.draft) : null,
    };
  }

  dumpState(): TowerSceneState {
    const level = this.currentLevel();
    return {
      active: this.scene.isActive(),
      levelIndex: this.levelIndex,
      levelCount: this.levels.length,
      terminalCount: level?.terminals.length ?? 0,
      towers: this.towers.map((t) => ({ x: t.x, y: t.y })),
      connected: this.connected,
      viewport: { width: this.scale.width, height: this.scale.height },
      editor: this.dumpEditorState(),
    };
  }
}

// Keep the imported types reachable for downstream consumers.
export type { TowerInhibitor, TowerLevel, TowerObstacle, TowerTerminal };
