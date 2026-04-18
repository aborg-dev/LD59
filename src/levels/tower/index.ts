export interface TowerObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TowerTerminal {
  x: number;
  y: number;
}

export interface TowerInhibitor {
  x: number;
  y: number;
  radius: number;
}

export interface TowerLevel {
  terminals: TowerTerminal[];
  obstacles: TowerObstacle[];
  inhibitors?: TowerInhibitor[];
  range: number;
  hint?: string;
}

const modules = import.meta.glob<TowerLevel>("./*.json", {
  eager: true,
  import: "default",
});

export const TOWER_LEVELS: TowerLevel[] = Object.keys(modules)
  .sort()
  .map((k) => modules[k]);
