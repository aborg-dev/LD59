import { FONT_BODY, TEXT_RESOLUTION } from "../../fonts.js";
import type { SectionCtx, SectionDef, SectionHandle } from "../types.js";

const SHEEP_RADIUS = 18;

const CORRIDOR_Y_TOP = 200;
const CORRIDOR_Y_BOTTOM = 520;
const GATE_Y_TOP = 330;
const GATE_Y_BOTTOM = 405;

const FUNNEL_X_START_OFFSET = 0; // fence narrowing starts at x0
const GATE_X_OFFSET = 1090; // relative to x0; the narrow gate is here
const POST_GATE_OFFSET = 1120;

export const HOME_GATE: SectionDef = {
  id: "gate",
  name: "Home Gate",
  xRange: [8010, 9210],
  setup(ctx: SectionCtx): SectionHandle {
    const [x0, x1] = ctx.xRange;
    const gateX = x0 + GATE_X_OFFSET;
    const postGateX = x0 + POST_GATE_OFFSET;
    const scene = ctx.scene;

    // Fences — straight then converging into the gate, then reopening briefly.
    const fence = scene.add.graphics().setDepth(2);
    fence.lineStyle(4, 0x6b4226, 1);
    fence.beginPath();
    // Top fence: straight from x0 to the start of the funnel, then diagonal in.
    fence.moveTo(x0, CORRIDOR_Y_TOP);
    fence.lineTo(x0 + FUNNEL_X_START_OFFSET, CORRIDOR_Y_TOP);
    fence.lineTo(gateX, GATE_Y_TOP);
    fence.moveTo(postGateX, GATE_Y_TOP);
    fence.lineTo(x1, GATE_Y_TOP);
    // Bottom fence.
    fence.moveTo(x0, CORRIDOR_Y_BOTTOM);
    fence.lineTo(x0 + FUNNEL_X_START_OFFSET, CORRIDOR_Y_BOTTOM);
    fence.lineTo(gateX, GATE_Y_BOTTOM);
    fence.moveTo(postGateX, GATE_Y_BOTTOM);
    fence.lineTo(x1, GATE_Y_BOTTOM);
    fence.strokePath();
    ctx.registerWorld(fence);

    // Gate posts.
    const postL = scene.add
      .rectangle(gateX, GATE_Y_TOP - 10, 12, 40, 0x3a2515)
      .setDepth(3);
    const postR = scene.add
      .rectangle(gateX, GATE_Y_BOTTOM + 10, 12, 40, 0x3a2515)
      .setDepth(3);
    ctx.registerWorld([postL, postR]);

    const label = scene.add
      .text((x0 + x1) / 2, 170, "Home Gate", {
        fontFamily: FONT_BODY,
        fontSize: 22,
        color: "#fff1c1",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 0)
      .setDepth(2);
    ctx.registerWorld(label);

    function fenceYRange(x: number): [number, number] {
      // Before the funnel proper: corridor.
      if (x <= x0 + FUNNEL_X_START_OFFSET)
        return [CORRIDOR_Y_TOP, CORRIDOR_Y_BOTTOM];
      // Between the funnel start and the gate: linear narrowing.
      if (x <= gateX) {
        const t =
          (x - (x0 + FUNNEL_X_START_OFFSET)) /
          (gateX - (x0 + FUNNEL_X_START_OFFSET));
        const topY = CORRIDOR_Y_TOP + (GATE_Y_TOP - CORRIDOR_Y_TOP) * t;
        const botY =
          CORRIDOR_Y_BOTTOM + (GATE_Y_BOTTOM - CORRIDOR_Y_BOTTOM) * t;
        return [topY, botY];
      }
      // Past the gate, fences widen slightly (to the fixed GATE_Y band then
      // open again toward the barn). Keep them tight so panicked sheep that
      // missed the gate bounce back.
      return [GATE_Y_TOP, GATE_Y_BOTTOM];
    }

    return {
      update(_dt: number): void {
        for (const s of ctx.sheep) {
          if (s.home || s.falling) continue;
          if (s.sprite.x < x0 || s.sprite.x > x1) continue;

          const [topY, botY] = fenceYRange(s.sprite.x);
          if (s.sprite.y < topY + SHEEP_RADIUS) {
            s.sprite.y = topY + SHEEP_RADIUS;
            if (s.vy < 0) s.vy = -s.vy * 0.4;
          } else if (s.sprite.y > botY - SHEEP_RADIUS) {
            s.sprite.y = botY - SHEEP_RADIUS;
            if (s.vy > 0) s.vy = -s.vy * 0.4;
          }
        }
      },
    };
  },
};
