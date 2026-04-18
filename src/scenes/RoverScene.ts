import * as Phaser from "phaser";
import { FONT_BODY, FONT_MONO, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

const HEX_SIZE = 24;
const HEX_FIELD_RADIUS = 8; // cube-distance from center to edge

const BATTERY_MAX = 6;
const PASSIVE_DRAIN = 1;
const BATTERY_BAR_W = 340;
const BATTERY_BAR_H = 22;

const ATMO_USES_MAX = 2;
const ROCK_QUERY_USES_MAX = 2;
const RELAY_COUNT = 3;
const RELAY_SUCCESS_RADIUS = 2;
const ROCK_QUERY_RADIUS = 3;

const PROBE_RADIUS = 4;

const TINT_GREEN = 0x00ff88;
const TINT_RED = 0xff4455;
const TINT_ALPHA = 0.15;

const SMOKE_COLOR = 0x88dd99;
const SMOKE_BLOB_RADIUS = 28;
const SMOKE_CONE_STEPS = 3; // max downwind distance
const SMOKE_NATURAL_CHANCE = 0.6; // geological sources are patchy
const SMOKE_CONE_CHANCE = 0.72; // rover cone cells are patchy

const FOG_COLOR = 0x2a2a3a;
const COLOR_RELAY = 0x4ecdc4;

const RELAY_BAR_W = 560;
const RELAY_BAR_H = 50;
const RELAY_SWEET_W = 80;
const RELAY_HOLD_MS = 2000;
const RELAY_COUNTDOWN_MS = 8000;
const RELAY_OSC_SPEED = 1.2;

const ROVER_HUD_BOTTOM_H = 160;
const HUD_TOP_H = 70;

const DEPTH_HEX_BG = 1;
const DEPTH_FOG = 4;
const DEPTH_OBJECT = 5;
const DEPTH_TINT = 6; // above fog, visible on all cells
const DEPTH_PROBE_DOT = 7;
const DEPTH_OVERLAY = 50;
const DEPTH_HUD = 100;
const DEPTH_HUD_TEXT = 101;

type TerrainType = "plain" | "rock" | "crater" | "ridge";
type GamePhase =
  | "select_action"
  | "probing"
  | "relay_minigame"
  | "won"
  | "lost";
// Axial hex directions (pointy-top): E NE NW W SW SE
type WindDir = "E" | "NE" | "NW" | "W" | "SW" | "SE";

const WIND_DIRS: WindDir[] = ["E", "NE", "NW", "W", "SW", "SE"];
const WIND_AXIAL_DIR: Record<WindDir, { dq: number; dr: number }> = {
  E: { dq: 1, dr: 0 },
  NE: { dq: 1, dr: -1 },
  NW: { dq: 0, dr: -1 },
  W: { dq: -1, dr: 0 },
  SW: { dq: -1, dr: 1 },
  SE: { dq: 0, dr: 1 },
};
// Pixel unit vectors per wind direction (for HUD arrow)
const WIND_PIXEL_DIR: Record<WindDir, { dx: number; dy: number }> = {
  E: { dx: 1, dy: 0 },
  NE: { dx: 0.5, dy: -0.87 },
  NW: { dx: -0.5, dy: -0.87 },
  W: { dx: -1, dy: 0 },
  SW: { dx: -0.5, dy: 0.87 },
  SE: { dx: 0.5, dy: 0.87 },
};
const WIND_ADJACENT: Record<WindDir, [WindDir, WindDir]> = {
  E: ["NE", "SE"],
  NE: ["E", "NW"],
  NW: ["NE", "W"],
  W: ["NW", "SW"],
  SW: ["W", "SE"],
  SE: ["SW", "E"],
};

interface HexCell {
  q: number; // axial column
  r: number; // axial row
  terrain: TerrainType;
  hasRover: boolean;
  hasRelay: boolean;
  relayIndex: number;
  fogged: boolean;
  tint: "none" | "green" | "red";
  bgGfx: Phaser.GameObjects.Graphics;
  fogGfx: Phaser.GameObjects.Graphics;
  tintGfx: Phaser.GameObjects.Graphics;
  px: number;
  py: number;
}

interface WindState {
  direction: WindDir;
  strength: number;
}

interface RelayMiniState {
  stationCell: HexCell;
  stationIndex: number;
  barLeft: number;
  sweetX: number;
  oscT: number;
  pointerX: number | null;
  holdMs: number;
  countdownMs: number;
  spikes: number[];
  dimOverlay: Phaser.GameObjects.Rectangle;
  barBg: Phaser.GameObjects.Rectangle;
  sweetZone: Phaser.GameObjects.Rectangle;
  spikeGfxArr: Phaser.GameObjects.Graphics[];
  holdBar: Phaser.GameObjects.Rectangle;
  timerText: Phaser.GameObjects.Text;
  extraTexts: Phaser.GameObjects.Text[];
}

export interface RoverSceneState {
  active: boolean;
  battery: number;
  batteryMax: number;
  turn: number;
  phase: GamePhase;
  atmoUsesLeft: number;
  rockQueryUsesLeft: number;
  roverFound: boolean;
  probeCount: number;
}

export class RoverScene extends Phaser.Scene {
  cells: HexCell[] = []; // flat list of all cells in the hex field
  roverCell!: HexCell;

  private cellMap = new Map<string, HexCell>(); // "q,r" → cell
  private relayCells: HexCell[] = [];
  private relayUsed: boolean[] = [];
  private wind!: WindState;
  private mini: RelayMiniState | null = null;
  private smokeGfxArr: Phaser.GameObjects.Graphics[] = [];

  private battery = BATTERY_MAX;
  private turn = 0;
  private probeCount = 0;
  private phase: GamePhase = "select_action";
  private atmoUsesLeft = ATMO_USES_MAX;
  private rockQueryUsesLeft = ROCK_QUERY_USES_MAX;
  roverFound = false;

  // Tint tracking
  private hasGreenHit = false;
  private greenCandidates = new Set<string>(); // "q,r" keys

  private batteryBarGfx!: Phaser.GameObjects.Graphics;
  private turnText!: Phaser.GameObjects.Text;
  private windArrowGfx!: Phaser.GameObjects.Graphics;
  private windDirText!: Phaser.GameObjects.Text;
  private probeBtn!: Phaser.GameObjects.Text;
  private atmoBtn!: Phaser.GameObjects.Text;
  private rockBtn!: Phaser.GameObjects.Text;
  private rockQueryResultText!: Phaser.GameObjects.Text;
  private probeDots: Phaser.GameObjects.Graphics[] = [];
  private probeHoverGfx!: Phaser.GameObjects.Graphics;
  private legendObjects: Phaser.GameObjects.GameObject[] = [];
  private legendVisible = false;

  constructor() {
    super("Rover");
  }

  create() {
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.smokeGfxArr = [];
    this.probeDots = [];
    this.mini = null;
    this.hasGreenHit = false;
    this.greenCandidates = new Set();
    this.battery = BATTERY_MAX;
    this.turn = 0;
    this.probeCount = 0;
    this.phase = "select_action";
    this.atmoUsesLeft = ATMO_USES_MAX;
    this.rockQueryUsesLeft = ROCK_QUERY_USES_MAX;
    this.roverFound = false;

    const { width, height } = this.scale;

    this.add
      .rectangle(width / 2, height / 2, width, height, 0x1a2a1a)
      .setDepth(0);

    this.initGrid();
    this.initWind();
    this.drawAllCells();
    this.buildTopHUD();
    this.buildBottomHUD();

    this.probeHoverGfx = this.add.graphics().setDepth(DEPTH_PROBE_DOT);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.y < HUD_TOP_H || pointer.y > height - ROVER_HUD_BOTTOM_H)
        return;
      this.onFieldTap(pointer.x, pointer.y);
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.phase !== "probing") return;
      if (pointer.y < HUD_TOP_H || pointer.y > height - ROVER_HUD_BOTTOM_H) {
        this.probeHoverGfx.clear();
        return;
      }
      const cell = this.cellAtPixel(pointer.x, pointer.y);
      this.drawProbeHover(cell);
    });

    this.input.on("pointerout", () => this.probeHoverGfx.clear());

    this.refreshHUD();
  }

  update(_time: number, delta: number) {
    if (this.phase === "relay_minigame" && this.mini) {
      this.updateRelayMini(delta);
    }
  }

  // ── Grid initialization ────────────────────────────────────────────────

  private initGrid(): void {
    this.cells = [];
    this.cellMap = new Map();
    this.relayCells = [];
    this.relayUsed = Array(RELAY_COUNT).fill(false);

    const R = HEX_FIELD_RADIUS;
    for (let q = -R; q <= R; q++) {
      const rMin = Math.max(-R, -q - R);
      const rMax = Math.min(R, -q + R);
      for (let r = rMin; r <= rMax; r++) {
        const { x, y } = this.hexToPixel(q, r);
        const rnd = Phaser.Math.FloatBetween(0, 1);
        let terrain: TerrainType;
        if (rnd < 0.15) terrain = "rock";
        else if (rnd < 0.23) terrain = "crater";
        else if (rnd < 0.28) terrain = "ridge";
        else terrain = "plain";

        const cell: HexCell = {
          q,
          r,
          terrain,
          hasRover: false,
          hasRelay: false,
          relayIndex: -1,
          fogged: terrain !== "rock",
          tint: "none",
          bgGfx: this.add.graphics().setDepth(DEPTH_HEX_BG),
          fogGfx: this.add.graphics().setDepth(DEPTH_FOG),
          tintGfx: this.add.graphics().setDepth(DEPTH_TINT),
          px: x,
          py: y,
        };
        this.cells.push(cell);
        this.cellMap.set(`${q},${r}`, cell);
      }
    }

    // Rover: non-rock, at least 2 rings from edge
    const roverCandidates = this.cells.filter(
      (c) => c.terrain !== "rock" && this.hexDist(c.q, c.r) <= R - 2,
    );
    const ri = Phaser.Math.Between(0, roverCandidates.length - 1);
    this.roverCell = roverCandidates[ri];
    this.roverCell.hasRover = true;

    // Relay stations: one per horizontal third (split by q)
    const third = Math.ceil((R * 2) / RELAY_COUNT);
    for (let i = 0; i < RELAY_COUNT; i++) {
      const qMin = -R + i * third;
      const qMax = -R + (i + 1) * third - 1;
      const candidates = this.cells.filter(
        (c) =>
          c.terrain !== "rock" &&
          !c.hasRover &&
          !c.hasRelay &&
          c.q >= qMin &&
          c.q <= qMax &&
          this.hexDist(c.q, c.r) <= R - 2,
      );
      if (candidates.length > 0) {
        const idx = Phaser.Math.Between(0, candidates.length - 1);
        candidates[idx].hasRelay = true;
        candidates[idx].relayIndex = i;
        this.relayCells.push(candidates[idx]);
      }
    }
  }

  private initWind(): void {
    const dir = WIND_DIRS[Phaser.Math.Between(0, WIND_DIRS.length - 1)];
    this.wind = { direction: dir, strength: Phaser.Math.Between(1, 3) };
  }

  // ── Drawing ────────────────────────────────────────────────────────────

  private drawAllCells(): void {
    for (const cell of this.cells) {
      this.drawCell(cell);
    }
    // Relay markers (visible through fog at higher depth)
    for (const cell of this.relayCells) {
      const g = this.add.graphics().setDepth(DEPTH_OBJECT);
      g.fillStyle(COLOR_RELAY, 0.9);
      g.fillCircle(cell.px, cell.py, 10);
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeCircle(cell.px, cell.py, 10);
    }
  }

  private drawCell(cell: HexCell): void {
    const terrainColors: Record<TerrainType, number> = {
      plain: 0x334433,
      rock: 0xb8a898,
      crater: 0x443322,
      ridge: 0x556644,
    };

    const bg = cell.bgGfx;
    bg.clear();
    this.hexFill(
      bg,
      cell.px,
      cell.py,
      HEX_SIZE - 1,
      terrainColors[cell.terrain],
      1.0,
    );
    if (cell.terrain === "rock") {
      bg.lineStyle(2, 0xddccbb, 0.8);
    } else {
      bg.lineStyle(1, 0x223322, 0.5);
    }
    this.hexStroke(bg, cell.px, cell.py, HEX_SIZE - 1);

    const fg = cell.fogGfx;
    fg.clear();
    if (cell.fogged) {
      this.hexFill(fg, cell.px, cell.py, HEX_SIZE - 1, FOG_COLOR, 0.88);
    }
  }

  revealCell(cell: HexCell): void {
    if (!cell.fogged) return;
    cell.fogged = false;
    this.tweens.add({
      targets: cell.fogGfx,
      alpha: 0,
      duration: 300,
      ease: "Linear",
    });
  }

  private revealRover(): void {
    this.revealCell(this.roverCell);
    const g = this.add.graphics().setDepth(DEPTH_OBJECT + 3);
    g.fillStyle(0xff6b6b, 1.0);
    g.fillCircle(this.roverCell.px, this.roverCell.py, 14);
    g.lineStyle(3, 0xffffff, 1.0);
    g.strokeCircle(this.roverCell.px, this.roverCell.py, 14);
  }

  private drawProbeHover(cell: HexCell | null): void {
    this.probeHoverGfx.clear();
    if (!cell) return;
    const area = this.getCellsWithin({ q: cell.q, r: cell.r }, PROBE_RADIUS);
    this.probeHoverGfx.lineStyle(2, 0xffffff, 0.7);
    for (const c of area) {
      this.hexStroke(this.probeHoverGfx, c.px, c.py, HEX_SIZE - 2);
    }
  }

  private getCellsWithin(
    center: { q: number; r: number },
    radius: number,
  ): HexCell[] {
    return this.cells.filter(
      (cell) => this.cubeDistance(center, cell) <= radius,
    );
  }

  private updateCellTint(cell: HexCell): void {
    cell.tintGfx.clear();
    if (cell.tint === "none") return;
    const color = cell.tint === "green" ? TINT_GREEN : TINT_RED;
    this.hexFill(
      cell.tintGfx,
      cell.px,
      cell.py,
      HEX_SIZE - 2,
      color,
      TINT_ALPHA,
    );
  }

  private applyProbeTint(
    center: { q: number; r: number },
    radius: number,
    detected: boolean,
  ): void {
    const area = this.getCellsWithin(center, radius);
    const areaKeys = new Set(area.map((c) => `${c.q},${c.r}`));

    if (!this.hasGreenHit) {
      if (detected) {
        // Snapshot reds before clearing, then establish green candidates minus reds
        this.hasGreenHit = true;
        const redKeys = new Set(
          this.cells
            .filter((c) => c.tint === "red")
            .map((c) => `${c.q},${c.r}`),
        );
        for (const cell of this.cells) {
          if (cell.tint !== "none") {
            cell.tint = "none";
            this.updateCellTint(cell);
          }
        }
        this.greenCandidates = new Set(
          [...areaKeys].filter((k) => !redKeys.has(k)),
        );
        for (const key of this.greenCandidates) {
          const [q, r] = key.split(",").map(Number);
          const cell = this.getCell(q, r);
          if (cell) {
            cell.tint = "green";
            this.updateCellTint(cell);
          }
        }
      } else {
        // Excluding phase: union red areas
        for (const cell of area) {
          if (cell.tint !== "red") {
            cell.tint = "red";
            this.updateCellTint(cell);
          }
        }
      }
    } else {
      // Pinpointing phase
      if (detected) {
        const next = new Set<string>();
        for (const key of this.greenCandidates) {
          if (areaKeys.has(key)) next.add(key);
        }
        this.greenCandidates = next;
      } else {
        for (const key of areaKeys) {
          this.greenCandidates.delete(key);
        }
      }
      this.redrawCandidates();
    }

    // Centre dot at probe origin
    const origin = this.getCell(center.q, center.r);
    if (origin) {
      const dot = this.add.graphics().setDepth(DEPTH_PROBE_DOT);
      dot.fillStyle(detected ? TINT_GREEN : TINT_RED, 0.9);
      dot.fillCircle(origin.px, origin.py, 5);
      this.probeDots.push(dot);
    }
  }

  private redrawCandidates(): void {
    for (const cell of this.cells) {
      const want = this.greenCandidates.has(`${cell.q},${cell.r}`)
        ? "green"
        : "none";
      if (cell.tint !== want) {
        cell.tint = want;
        this.updateCellTint(cell);
      }
    }
  }

  // ── Hex helpers ────────────────────────────────────────────────────────

  private hexToPixel(q: number, r: number): { x: number; y: number } {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = (HUD_TOP_H + height - ROVER_HUD_BOTTOM_H) / 2;
    return {
      x: cx + HEX_SIZE * Math.sqrt(3) * (q + r / 2),
      y: cy + HEX_SIZE * 1.5 * r,
    };
  }

  // Cube distance from center (0,0) — used for field-edge checks
  private hexDist(q: number, r: number): number {
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
  }

  private hexPoints(
    px: number,
    py: number,
    size: number,
  ): Phaser.Types.Math.Vector2Like[] {
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      pts.push({
        x: px + size * Math.cos(angle),
        y: py + size * Math.sin(angle),
      });
    }
    return pts;
  }

  private hexFill(
    gfx: Phaser.GameObjects.Graphics,
    px: number,
    py: number,
    size: number,
    color: number,
    alpha: number,
  ): void {
    gfx.fillStyle(color, alpha);
    gfx.fillPoints(this.hexPoints(px, py, size), true);
  }

  private hexStroke(
    gfx: Phaser.GameObjects.Graphics,
    px: number,
    py: number,
    size: number,
  ): void {
    gfx.strokePoints(this.hexPoints(px, py, size), true);
  }

  private cubeDistance(
    a: { q: number; r: number },
    b: { q: number; r: number },
  ): number {
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  }

  private getCell(q: number, r: number): HexCell | null {
    return this.cellMap.get(`${q},${r}`) ?? null;
  }

  private cellAtPixel(px: number, py: number): HexCell | null {
    const threshold = HEX_SIZE * HEX_SIZE;
    for (const cell of this.cells) {
      const dx = px - cell.px;
      const dy = py - cell.py;
      if (dx * dx + dy * dy <= threshold) return cell;
    }
    return null;
  }

  // ── HUD ───────────────────────────────────────────────────────────────

  private buildTopHUD(): void {
    const { width } = this.scale;

    this.add
      .rectangle(width / 2, 0, width, HUD_TOP_H, 0x111122)
      .setOrigin(0.5, 0)
      .setDepth(DEPTH_HUD);

    // Battery bar background
    const barX = 80;
    const barY = HUD_TOP_H / 2;
    this.add
      .rectangle(
        barX + BATTERY_BAR_W / 2,
        barY,
        BATTERY_BAR_W,
        BATTERY_BAR_H,
        0x333344,
      )
      .setDepth(DEPTH_HUD);

    this.batteryBarGfx = this.add.graphics().setDepth(DEPTH_HUD + 1);

    this.add
      .text(barX - 8, barY, "BATT", {
        fontFamily: FONT_UI,
        fontSize: 14,
        color: "#aaaaff",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(1, 0.5)
      .setDepth(DEPTH_HUD_TEXT);

    this.turnText = this.add
      .text(width - 16, HUD_TOP_H / 2, "TURN 0", {
        fontFamily: FONT_UI,
        fontSize: 18,
        color: "#ffe099",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(1, 0.5)
      .setDepth(DEPTH_HUD_TEXT);

    this.windArrowGfx = this.add
      .graphics()
      .setDepth(DEPTH_HUD_TEXT)
      .setVisible(false);
    this.windDirText = this.add
      .text(barX + BATTERY_BAR_W + 16, barY, "", {
        fontFamily: FONT_UI,
        fontSize: 14,
        color: "#88ffcc",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0, 0.5)
      .setDepth(DEPTH_HUD_TEXT)
      .setVisible(false);
  }

  private buildBottomHUD(): void {
    const { width, height } = this.scale;
    const fieldBottom = height - ROVER_HUD_BOTTOM_H;

    this.add
      .rectangle(width / 2, height, width, ROVER_HUD_BOTTOM_H, 0x111122)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_HUD);

    const btnY = fieldBottom + 52;
    const btnStyle = {
      fontFamily: FONT_BODY,
      fontSize: 18,
      color: "#ffffff",
      backgroundColor: "#333344",
      padding: { left: 14, right: 14, top: 10, bottom: 10 },
      resolution: TEXT_RESOLUTION,
    };

    this.probeBtn = this.add
      .text(width * 0.14, btnY, "PROBE", btnStyle)
      .setOrigin(0.5)
      .setDepth(DEPTH_HUD_TEXT)
      .setInteractive({ useHandCursor: true });
    this.probeBtn.on("pointerdown", () => this.onProbeButtonDown());

    this.atmoBtn = this.add
      .text(width * 0.37, btnY, `ATMO (${ATMO_USES_MAX})`, btnStyle)
      .setOrigin(0.5)
      .setDepth(DEPTH_HUD_TEXT)
      .setInteractive({ useHandCursor: true });
    this.atmoBtn.on("pointerdown", () => this.onAtmoButtonDown());

    this.rockBtn = this.add
      .text(width * 0.63, btnY, `SCAN (${ROCK_QUERY_USES_MAX})`, btnStyle)
      .setOrigin(0.5)
      .setDepth(DEPTH_HUD_TEXT)
      .setInteractive({ useHandCursor: true });
    this.rockBtn.on("pointerdown", () => this.onRockQueryButtonDown());

    const menuBtn = this.add
      .text(width * 0.8, btnY, "MENU", btnStyle)
      .setOrigin(0.5)
      .setDepth(DEPTH_HUD_TEXT)
      .setInteractive({ useHandCursor: true });
    menuBtn.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("MainMenu");
    });

    const helpBtn = this.add
      .text(width * 0.94, btnY, "?", {
        ...btnStyle,
        color: "#4ecdc4",
        padding: { left: 18, right: 18, top: 10, bottom: 10 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_HUD_TEXT)
      .setInteractive({ useHandCursor: true });
    helpBtn.on("pointerdown", () => this.toggleLegend());

    this.rockQueryResultText = this.add
      .text(width / 2, fieldBottom + 108, "", {
        fontFamily: FONT_MONO,
        fontSize: 15,
        color: "#88ffcc",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_HUD_TEXT)
      .setVisible(false);
  }

  private refreshHUD(): void {
    this.refreshBatteryBar();
    this.turnText.setText(`TURN ${this.turn}`);
    this.updateActionButtons();
  }

  private refreshBatteryBar(): void {
    const frac = this.battery / BATTERY_MAX;
    const barX = 80;
    const barY = HUD_TOP_H / 2;
    const color = frac > 0.5 ? 0x00cc44 : frac > 0.25 ? 0xffcc00 : 0xff3333;
    this.batteryBarGfx.clear();
    this.batteryBarGfx.fillStyle(color, 1.0);
    this.batteryBarGfx.fillRect(
      barX,
      barY - (BATTERY_BAR_H - 4) / 2,
      BATTERY_BAR_W * frac,
      BATTERY_BAR_H - 4,
    );
  }

  private updateActionButtons(): void {
    const canProbe = this.phase === "select_action" && this.battery > 0;
    this.probeBtn.setColor(canProbe ? "#ffffff" : "#555555");

    this.atmoBtn.setText(`ATMO (${this.atmoUsesLeft})`);
    this.atmoBtn.setColor(
      this.phase === "select_action" && this.atmoUsesLeft > 0
        ? "#ffffff"
        : "#555555",
    );

    this.rockBtn.setText(`SCAN (${this.rockQueryUsesLeft})`);
    this.rockBtn.setColor(
      this.phase === "select_action" && this.rockQueryUsesLeft > 0
        ? "#ffffff"
        : "#555555",
    );
  }

  private drawWindArrow(): void {
    const { width } = this.scale;
    const ax = width - 100;
    const ay = HUD_TOP_H / 2;
    const pix = WIND_PIXEL_DIR[this.wind.direction];
    const len = 18;

    this.windArrowGfx.clear();
    this.windArrowGfx.lineStyle(3, 0x88ffcc, 1.0);
    this.windArrowGfx.beginPath();
    this.windArrowGfx.moveTo(ax, ay);
    this.windArrowGfx.lineTo(ax + pix.dx * len, ay + pix.dy * len);
    this.windArrowGfx.strokePath();
    this.windArrowGfx.fillStyle(0x88ffcc, 1.0);
    this.windArrowGfx.fillCircle(ax + pix.dx * len, ay + pix.dy * len, 4);
  }

  // ── Actions ───────────────────────────────────────────────────────────

  private onFieldTap(px: number, py: number): void {
    if (this.phase === "relay_minigame") return;

    const cell = this.cellAtPixel(px, py);
    if (!cell) return;

    if (this.phase === "probing") {
      this.executeProbe(cell);
    } else if (this.phase === "select_action" && cell.hasRelay) {
      const ri = cell.relayIndex;
      if (ri >= 0 && !this.relayUsed[ri]) {
        this.startRelayMinigame(cell);
      }
    }
  }

  onProbeButtonDown(): void {
    if (this.phase !== "select_action" || this.battery <= 0) return;
    this.phase = "probing";
    this.probeBtn.setStyle({ backgroundColor: "#224422" });
  }

  executeProbe(cell: HexCell): void {
    if (this.phase !== "probing") return;

    this.probeCount++;
    this.probeHoverGfx.clear();
    this.revealCell(cell);
    this.probeBtn.setStyle({ backgroundColor: "#333344" });

    if (cell.hasRover) {
      this.roverFound = true;
      this.revealRover();
      this.phase = "won";
      this.endTurn();
      this.showEndScreen("WIN");
      return;
    }

    const D = this.cubeDistance(cell, this.roverCell);
    const detected = D <= PROBE_RADIUS;

    this.applyProbeTint({ q: cell.q, r: cell.r }, PROBE_RADIUS, detected);

    this.showMessage(
      detected ? "◉  SIGNAL DETECTED" : "○  NO SIGNAL",
      detected ? 0x00cc66 : 0x884444,
      1400,
    );

    this.phase = "select_action";
    this.endTurn();
  }

  onAtmoButtonDown(): void {
    if (this.atmoUsesLeft <= 0 || this.phase !== "select_action") return;
    this.atmoUsesLeft--;

    for (const g of this.smokeGfxArr) g.destroy();
    this.smokeGfxArr = [];

    // Natural smoke: craters and ridges, same color, randomly patchy
    for (const cell of this.cells) {
      if (
        (cell.terrain === "crater" || cell.terrain === "ridge") &&
        Phaser.Math.FloatBetween(0, 1) < SMOKE_NATURAL_CHANCE
      ) {
        const alpha = Phaser.Math.FloatBetween(0.25, 0.45);
        const rs = Phaser.Math.FloatBetween(0.85, 1.15);
        const g = this.add.graphics().setDepth(DEPTH_OBJECT + 1);
        g.fillStyle(SMOKE_COLOR, alpha);
        g.fillCircle(cell.px, cell.py, SMOKE_BLOB_RADIUS * rs);
        this.smokeGfxArr.push(g);
        this.revealCell(cell);
      }
    }

    // Rover smoke: cone downwind — main direction + two adjacent, up to SMOKE_CONE_STEPS
    const coneDirs: WindDir[] = [
      this.wind.direction,
      ...WIND_ADJACENT[this.wind.direction],
    ];
    for (const dir of coneDirs) {
      const off = WIND_AXIAL_DIR[dir];
      const maxStep = Math.min(
        SMOKE_CONE_STEPS,
        dir === this.wind.direction
          ? this.wind.strength + 1
          : this.wind.strength,
      );
      for (let step = 1; step <= maxStep; step++) {
        if (Phaser.Math.FloatBetween(0, 1) > SMOKE_CONE_CHANCE) continue;
        const tc = this.getCell(
          this.roverCell.q + off.dq * step,
          this.roverCell.r + off.dr * step,
        );
        if (tc) {
          const alpha = Phaser.Math.FloatBetween(0.28, 0.5);
          const rs = Phaser.Math.FloatBetween(0.9, 1.2);
          const g = this.add.graphics().setDepth(DEPTH_OBJECT + 2);
          g.fillStyle(SMOKE_COLOR, alpha);
          g.fillCircle(tc.px, tc.py, SMOKE_BLOB_RADIUS * rs);
          this.smokeGfxArr.push(g);
        }
      }
    }

    this.drawWindArrow();
    this.windArrowGfx.setVisible(true);
    this.windDirText.setText(`WIND: ${this.wind.direction}`).setVisible(true);

    this.endTurn();
  }

  onRockQueryButtonDown(): void {
    if (this.rockQueryUsesLeft <= 0 || this.phase !== "select_action") return;
    this.rockQueryUsesLeft--;

    let count = 0;
    for (const cell of this.cells) {
      if (
        cell.terrain === "rock" &&
        this.cubeDistance(this.roverCell, cell) <= ROCK_QUERY_RADIUS
      ) {
        count++;
      }
    }

    const displayed = Math.max(0, count + Phaser.Math.Between(-1, 1));
    this.rockQueryResultText
      .setText(
        `~${displayed} rocks within ${ROCK_QUERY_RADIUS} cells of signal`,
      )
      .setVisible(true);

    this.time.addEvent({
      delay: 5000,
      callback: () => this.rockQueryResultText?.setVisible(false),
    });

    this.endTurn();
  }

  endTurn(): void {
    this.turn++;
    this.battery = Math.max(0, this.battery - PASSIVE_DRAIN);
    this.refreshHUD();

    if (this.battery <= 0 && this.phase !== "won" && this.phase !== "lost") {
      this.phase = "lost";
      this.showEndScreen("LOST");
    }
  }

  // ── Relay minigame ────────────────────────────────────────────────────

  private startRelayMinigame(cell: HexCell): void {
    this.phase = "relay_minigame";
    this.relayUsed[cell.relayIndex] = true;

    const { width, height } = this.scale;
    const barLeft = (width - RELAY_BAR_W) / 2;
    const barCenterY = height / 2;

    const spikes: number[] = [];
    for (let i = 0; i < 4; i++) {
      spikes.push(
        Phaser.Math.FloatBetween(RELAY_SWEET_W, RELAY_BAR_W - RELAY_SWEET_W),
      );
    }

    const dimOverlay = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.72)
      .setDepth(DEPTH_OVERLAY)
      .setInteractive();

    const barBg = this.add
      .rectangle(width / 2, barCenterY, RELAY_BAR_W, RELAY_BAR_H, 0x223344)
      .setDepth(DEPTH_OVERLAY + 1);

    const sweetZone = this.add
      .rectangle(barLeft, barCenterY, RELAY_SWEET_W, RELAY_BAR_H, 0x00ff88, 0.5)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH_OVERLAY + 2);

    const spikeGfxArr: Phaser.GameObjects.Graphics[] = [];
    for (const sx of spikes) {
      const sg = this.add.graphics().setDepth(DEPTH_OVERLAY + 2);
      sg.fillStyle(0xff3333, 0.85);
      sg.fillRect(
        barLeft + sx - 5,
        barCenterY - RELAY_BAR_H / 2,
        10,
        RELAY_BAR_H,
      );
      spikeGfxArr.push(sg);
    }

    const holdBar = this.add
      .rectangle(barLeft, barCenterY + RELAY_BAR_H / 2 + 10, 0, 8, 0x00ff88)
      .setOrigin(0, 0.5)
      .setDepth(DEPTH_OVERLAY + 3);

    const timerText = this.add
      .text(
        width / 2,
        barCenterY - RELAY_BAR_H / 2 - 30,
        `${(RELAY_COUNTDOWN_MS / 1000).toFixed(1)}s`,
        {
          fontFamily: FONT_MONO,
          fontSize: 28,
          color: "#ffffff",
          resolution: TEXT_RESOLUTION,
        },
      )
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_OVERLAY + 3);

    const instrText = this.add
      .text(
        width / 2,
        barCenterY + RELAY_BAR_H / 2 + 28,
        "Hold pointer in green zone to lock frequency",
        {
          fontFamily: FONT_BODY,
          fontSize: 17,
          color: "#aaaaaa",
          resolution: TEXT_RESOLUTION,
        },
      )
      .setOrigin(0.5, 0)
      .setDepth(DEPTH_OVERLAY + 3);

    const titleText = this.add
      .text(
        width / 2,
        barCenterY - RELAY_BAR_H / 2 - 70,
        `RELAY STATION ${cell.relayIndex + 1}`,
        {
          fontFamily: FONT_UI,
          fontSize: 22,
          color: "#4ecdc4",
          resolution: TEXT_RESOLUTION,
        },
      )
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_OVERLAY + 3);

    this.mini = {
      stationCell: cell,
      stationIndex: cell.relayIndex,
      barLeft,
      sweetX: (RELAY_BAR_W - RELAY_SWEET_W) / 2,
      oscT: 0,
      pointerX: null,
      holdMs: 0,
      countdownMs: RELAY_COUNTDOWN_MS,
      spikes,
      dimOverlay,
      barBg,
      sweetZone,
      spikeGfxArr,
      holdBar,
      timerText,
      extraTexts: [instrText, titleText],
    };

    dimOverlay.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.mini) return;
      this.mini.pointerX = Phaser.Math.Clamp(
        pointer.x - this.mini.barLeft,
        0,
        RELAY_BAR_W,
      );
    });
    dimOverlay.on("pointerout", () => {
      if (this.mini) this.mini.pointerX = null;
    });
  }

  private updateRelayMini(delta: number): void {
    if (!this.mini) return;
    const mini = this.mini;

    mini.oscT += (delta / 1000) * RELAY_OSC_SPEED;
    const amp = (RELAY_BAR_W - RELAY_SWEET_W) / 2;
    mini.sweetX = amp + amp * Math.sin(mini.oscT);
    mini.sweetZone.x = mini.barLeft + mini.sweetX;

    if (mini.pointerX !== null) {
      const inZone =
        mini.pointerX >= mini.sweetX &&
        mini.pointerX <= mini.sweetX + RELAY_SWEET_W;
      const px = mini.pointerX;
      const onSpike =
        px !== null && mini.spikes.some((sx) => Math.abs(px - sx) < 8);
      if (inZone && !onSpike) {
        mini.holdMs += delta;
      } else {
        mini.holdMs = Math.max(0, mini.holdMs - delta * 1.5);
      }
    } else {
      mini.holdMs = Math.max(0, mini.holdMs - delta);
    }

    mini.holdBar.width = RELAY_BAR_W * (mini.holdMs / RELAY_HOLD_MS);
    mini.countdownMs -= delta;
    mini.timerText.setText(
      `${Math.max(0, mini.countdownMs / 1000).toFixed(1)}s`,
    );

    if (mini.holdMs >= RELAY_HOLD_MS) {
      this.onRelaySuccess();
    } else if (mini.countdownMs <= 0) {
      this.onRelayFailure();
    }
  }

  private onRelaySuccess(): void {
    const station = this.mini?.stationCell;
    if (!station) return;
    this.destroyRelayMiniObjects();
    this.mini = null;

    const D = this.cubeDistance(station, this.roverCell);
    const detected = D <= RELAY_SUCCESS_RADIUS;

    this.applyProbeTint(
      { q: station.q, r: station.r },
      RELAY_SUCCESS_RADIUS,
      detected,
    );

    this.showMessage(
      detected
        ? "SIGNAL LOCKED — rover nearby!"
        : "SIGNAL LOCKED — not in range",
      detected ? 0x00ff88 : 0xff4455,
    );
    this.phase = "select_action";
    this.endTurn();
  }

  private onRelayFailure(): void {
    this.destroyRelayMiniObjects();
    this.mini = null;

    this.showMessage("INTERFERENCE — lost turn", 0xff4444);
    this.phase = "select_action";
    this.endTurn();
  }

  private destroyRelayMiniObjects(): void {
    if (!this.mini) return;
    this.mini.dimOverlay.destroy();
    this.mini.barBg.destroy();
    this.mini.sweetZone.destroy();
    this.mini.holdBar.destroy();
    this.mini.timerText.destroy();
    for (const sg of this.mini.spikeGfxArr) sg.destroy();
    for (const t of this.mini.extraTexts) t.destroy();
  }

  // ── End screen / messages ─────────────────────────────────────────────

  private showMessage(text: string, color: number, durationMs = 2200): void {
    const { width, height } = this.scale;
    const bg = this.add
      .rectangle(width / 2, height / 2, 520, 72, color, 0.88)
      .setDepth(DEPTH_OVERLAY + 10);
    const txt = this.add
      .text(width / 2, height / 2, text, {
        fontFamily: FONT_UI,
        fontSize: 18,
        color: "#000000",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY + 11);
    this.time.addEvent({
      delay: durationMs,
      callback: () => {
        bg.destroy();
        txt.destroy();
      },
    });
  }

  private showEndScreen(result: "WIN" | "LOST"): void {
    const { width, height } = this.scale;

    this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.78)
      .setDepth(DEPTH_OVERLAY + 20);

    const titleColor = result === "WIN" ? "#00ff88" : "#ff4444";
    const titleStr = result === "WIN" ? "ROVER FOUND" : "SIGNAL LOST";
    const subStr =
      result === "WIN"
        ? `Located in ${this.turn} turns · ${this.probeCount} probes`
        : `Battery depleted after ${this.turn} turns`;

    this.add
      .text(width / 2, height / 2 - 90, titleStr, {
        fontFamily: FONT_UI,
        fontSize: 48,
        color: titleColor,
        stroke: "#000000",
        strokeThickness: 6,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY + 21);

    this.add
      .text(width / 2, height / 2 - 24, subStr, {
        fontFamily: FONT_BODY,
        fontSize: 22,
        color: "#ffffff",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY + 21);

    const btnStyle = {
      fontFamily: FONT_BODY,
      fontSize: 22,
      color: "#ffffff",
      backgroundColor: "#333344",
      padding: { left: 20, right: 20, top: 12, bottom: 12 },
      resolution: TEXT_RESOLUTION,
    };

    const restartBtn = this.add
      .text(width / 2 - 110, height / 2 + 60, "RESTART", btnStyle)
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY + 21)
      .setInteractive({ useHandCursor: true });
    restartBtn.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.restart();
    });

    const menuBtn = this.add
      .text(width / 2 + 110, height / 2 + 60, "MENU", btnStyle)
      .setOrigin(0.5)
      .setDepth(DEPTH_OVERLAY + 21)
      .setInteractive({ useHandCursor: true });
    menuBtn.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("MainMenu");
    });
  }

  // ── Legend ────────────────────────────────────────────────────────────

  private toggleLegend(): void {
    if (this.legendVisible) {
      this.hideLegend();
    } else {
      this.showLegend();
    }
  }

  private showLegend(): void {
    if (this.legendVisible) return;
    this.legendVisible = true;

    const { width, height } = this.scale;
    const cx = width / 2;
    const panelW = 620;
    const panelH = 780;
    const py = height / 2;
    const L = cx - panelW / 2 + 24; // left text margin
    const objs = this.legendObjects;

    const dim = this.add
      .rectangle(cx, py, width, height, 0x000000, 0.6)
      .setDepth(DEPTH_OVERLAY + 30)
      .setInteractive(); // absorb taps
    objs.push(dim);

    const panel = this.add
      .rectangle(cx, py, panelW, panelH, 0x0d1b2a, 0.97)
      .setDepth(DEPTH_OVERLAY + 31);
    objs.push(panel);

    // border
    const border = this.add.graphics().setDepth(DEPTH_OVERLAY + 31);
    border.lineStyle(2, 0x4ecdc4, 0.7);
    border.strokeRect(cx - panelW / 2, py - panelH / 2, panelW, panelH);
    objs.push(border);

    const d = DEPTH_OVERLAY + 32;
    const add = (go: Phaser.GameObjects.GameObject) => {
      objs.push(go);
      return go;
    };

    const title = (x: number, y: number, t: string) =>
      add(
        this.add
          .text(x, y, t, {
            fontFamily: FONT_UI,
            fontSize: 15,
            color: "#4ecdc4",
            resolution: TEXT_RESOLUTION,
          })
          .setDepth(d),
      );
    const label = (x: number, y: number, t: string, color = "#dddddd") =>
      add(
        this.add
          .text(x, y, t, {
            fontFamily: FONT_BODY,
            fontSize: 14,
            color,
            resolution: TEXT_RESOLUTION,
          })
          .setDepth(d),
      );
    const dot = (x: number, y: number, color: number, r = 8) => {
      const g = this.add.graphics().setDepth(d);
      g.fillStyle(color, 1);
      g.fillCircle(x, y, r);
      objs.push(g);
    };
    const swatch = (x: number, y: number, color: number) => {
      const g = this.add.graphics().setDepth(d);
      g.fillStyle(color, 1);
      g.fillRect(x - 10, y - 9, 20, 18);
      objs.push(g);
    };

    let y = py - panelH / 2 + 28;
    const gap = 26;
    const sectionGap = 14;
    const iX = L + 14; // icon centre x
    const tX = L + 32; // text start x

    add(
      this.add
        .text(cx, y, "LEGEND", {
          fontFamily: FONT_UI,
          fontSize: 20,
          color: "#ffffff",
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0.5, 0)
        .setDepth(d),
    );
    y += 36;

    // ── Grid symbols ──────────────────────────────────────────────────
    title(L, y, "GRID SYMBOLS");
    y += sectionGap + 4;

    dot(iX, y + 7, 0x4ecdc4);
    label(tX, y, "Relay station — tap to start frequency minigame");
    y += gap;

    dot(iX, y + 7, 0xff6b6b, 10);
    label(tX, y, "Rover — revealed when you find it");
    y += gap;

    // red tint swatch
    {
      const g = this.add.graphics().setDepth(d);
      g.fillStyle(TINT_RED, TINT_ALPHA);
      g.fillPoints(this.hexPoints(iX, y + 7, 10), true);
      objs.push(g);
    }
    label(
      tX,
      y,
      "Red — excluded zone. Shown while no green hit yet.",
      "#ff9999",
    );
    y += gap;

    // green tint swatch
    {
      const g = this.add.graphics().setDepth(d);
      g.fillStyle(TINT_GREEN, TINT_ALPHA);
      g.fillPoints(this.hexPoints(iX, y + 7, 10), true);
      objs.push(g);
    }
    label(
      tX,
      y,
      "Green — candidate cells. First hit starts it; more greens narrow it.",
      "#88ffcc",
    );
    y += gap + sectionGap;

    // ── Terrain ───────────────────────────────────────────────────────
    title(L, y, "TERRAIN  (visible through fog only for rocks)");
    y += sectionGap + 4;

    swatch(iX, y + 7, 0x334433);
    label(tX, y, "Plain — rover can rest here");
    y += gap;

    swatch(iX, y + 7, 0xb8a898);
    label(tX, y, "Rock — always visible, use as landmarks");
    y += gap;

    swatch(iX, y + 7, 0x443322);
    label(tX, y, "Crater — emits natural smoke (ATMO)");
    y += gap;

    swatch(iX, y + 7, 0x556644);
    label(tX, y, "Ridge — emits natural smoke (ATMO)");
    y += gap + sectionGap;

    // ── Smoke ─────────────────────────────────────────────────────────
    title(L, y, "SMOKE  (revealed by ATMO)");
    y += sectionGap + 4;

    dot(iX, y + 7, SMOKE_COLOR, 10);
    label(
      tX,
      y,
      "All smoke looks the same. Geological (craters/ridges) + rover exhaust.",
      "#88dd88",
    );
    y += gap;

    label(
      L,
      y,
      "Rover smoke fans out in a cone downwind (wind dir ±1). Probe revealed",
    );
    y += gap - 8;
    label(
      L,
      y,
      "terrain to find which blobs aren't craters/ridges — those are rover exhaust.",
    );
    y += gap + sectionGap;

    // ── Actions ───────────────────────────────────────────────────────
    title(L, y, "ACTIONS");
    y += sectionGap + 4;

    label(L, y, "PROBE", "#ffffff");
    label(
      L + 72,
      y,
      `Tap a hex → green if rover within ${PROBE_RADIUS} cells, red if not.  10 battery + 1 turn.`,
    );
    y += gap;

    label(L, y, "ATMO", "#ffffff");
    label(
      L + 72,
      y,
      "Reveal wind + smoke zones.  Free battery, costs 1 turn.  2 uses.",
    );
    y += gap;

    label(L, y, "SCAN", "#ffffff");
    label(
      L + 72,
      y,
      "Show ~N rocks within 3 cells of rover.  1 turn.  2 uses.",
    );
    y += gap;

    dot(iX, y + 7, 0x4ecdc4, 7);
    label(tX, y, "Relay tap → hold pointer in green zone 2 s → precise ring.");
    y += gap + sectionGap;

    // ── Battery ───────────────────────────────────────────────────────
    title(L, y, "BATTERY BAR");
    y += sectionGap + 4;

    const bx = L;
    const barW = 160;
    {
      const g = this.add.graphics().setDepth(d);
      g.fillStyle(0x00cc44, 1);
      g.fillRect(bx, y + 2, barW * 0.7, 14);
      g.fillStyle(0xffcc00, 1);
      g.fillRect(bx + barW * 0.7, y + 2, barW * 0.08, 14);
      g.fillStyle(0xff3333, 1);
      g.fillRect(bx + barW * 0.78, y + 2, barW * 0.22, 14);
      g.lineStyle(1, 0x888888, 0.6);
      g.strokeRect(bx, y + 2, barW, 14);
      objs.push(g);
    }
    label(bx + barW + 10, y, "green > 50%   yellow > 25%   red ≤ 25%");
    y += gap;
    label(L, y, "Loses 1 unit per action (turn).  Reach 0 → lost.");

    // Close button
    const closeBtn = this.add
      .text(cx + panelW / 2 - 16, py - panelH / 2 + 16, "✕", {
        fontFamily: FONT_UI,
        fontSize: 20,
        color: "#aaaaaa",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(1, 0)
      .setDepth(d)
      .setInteractive({ useHandCursor: true });
    closeBtn.on("pointerdown", () => this.hideLegend());
    objs.push(closeBtn);

    // Tap dim to close
    dim.on("pointerdown", () => this.hideLegend());
  }

  private hideLegend(): void {
    if (!this.legendVisible) return;
    this.legendVisible = false;
    for (const obj of this.legendObjects) obj.destroy();
    this.legendObjects = [];
  }

  // ── State dump ────────────────────────────────────────────────────────

  dumpState(): RoverSceneState {
    return {
      active: this.scene.isActive(),
      battery: this.battery,
      batteryMax: BATTERY_MAX,
      turn: this.turn,
      phase: this.phase,
      atmoUsesLeft: this.atmoUsesLeft,
      rockQueryUsesLeft: this.rockQueryUsesLeft,
      roverFound: this.roverFound,
      probeCount: this.probeCount,
    };
  }
}
