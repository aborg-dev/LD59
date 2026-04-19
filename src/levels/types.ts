import type * as Phaser from "phaser";

export type Personality = "bolter" | "dawdler" | "greedy";

export interface SheepRef {
  sprite: Phaser.GameObjects.Rectangle;
  vx: number;
  vy: number;
  angle: number;
  scaredMs: number;
  grazing: boolean;
  modeT: number;
  wanderAngle: number;
  personality: Personality | null;
  home: boolean;
  falling: boolean;
  teeterMs: number;
  grazePauseMs: number;
}

export interface DogRef {
  x: number;
  y: number;
}

export interface WhistleEvent {
  x: number;
  y: number;
  /** the frame-step in which this whistle fired (for once-per-whistle guards) */
  id: number;
}

export interface JourneyApi {
  scene: Phaser.Scene;
  sheep: SheepRef[];
  dog: DogRef;
  /** Whistles fired this frame. Read-only from sections. */
  whistles: readonly WhistleEvent[];
  /** Remove a sheep and increment the lost counter. */
  loseSheep(s: SheepRef): void;
  /** Register a world-space object so the HUD camera ignores it. */
  registerWorld(
    obj: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[],
  ): void;
}

export interface SectionCtx extends JourneyApi {
  xRange: [number, number];
}

export interface SectionHandle {
  /** Called every fixed step for any section whose xRange overlaps an active sheep. */
  update(dt: number): void;
  teardown?(): void;
}

export interface SectionDef {
  id: string;
  name: string;
  xRange: [number, number];
  setup(ctx: SectionCtx): SectionHandle;
}
