import { BRIDGE } from "./sections/bridge.js";
import { CLOVER_HOLLOW } from "./sections/clover.js";
import { CROSSROADS } from "./sections/crossroads.js";
import { DARK_FOREST } from "./sections/forest.js";
import { HOME_GATE } from "./sections/gate.js";
import { MEADOW } from "./sections/meadow.js";
import { RIVER_FORD } from "./sections/river.js";
import type { SectionDef } from "./types.js";

export const JOURNEY: SectionDef[] = [
  MEADOW,
  BRIDGE,
  CLOVER_HOLLOW,
  DARK_FOREST,
  RIVER_FORD,
  CROSSROADS,
  HOME_GATE,
];

export const WORLD_W = 10000;
export const WORLD_H = 720;
export const GOAL_X = HOME_GATE.xRange[1] - 40;
export const START_SHEEP = 12;
