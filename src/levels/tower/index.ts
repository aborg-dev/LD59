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

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function cleanLevel<T>(value: T): T {
  if (typeof value === "number") return round(value) as unknown as T;
  if (Array.isArray(value)) return value.map(cleanLevel) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = cleanLevel(v);
    return out as unknown as T;
  }
  return value;
}
