import { FONT_BODY, TEXT_RESOLUTION } from "../../fonts.js";
import type { SectionCtx, SectionDef, SectionHandle } from "../types.js";

const FENCE_Y_TOP = 200;
const FENCE_Y_BOTTOM = 520;
const FUNNEL_START_OFFSET = 600;
const FUNNEL_Y_TOP = 260;
const FUNNEL_Y_BOTTOM = 460;

const CLOVER_RADIUS = 30;
const CLOVER_PAUSE_MS = 800;

const SCARECROW_X_OFFSET = 1400;
const SCARECROW_TRIGGER_R = 60;

export const MEADOW: SectionDef = {
  id: "meadow",
  name: "Open Meadow",
  xRange: [0, 2400],
  setup(ctx: SectionCtx): SectionHandle {
    const [x0, x1] = ctx.xRange;
    const scene = ctx.scene;

    // Fences: straight top & bottom, then converging funnel at the exit.
    const fence = scene.add.graphics().setDepth(2);
    fence.lineStyle(3, 0x6b4226, 1);
    fence.beginPath();
    fence.moveTo(x0, FENCE_Y_TOP);
    fence.lineTo(x1 - FUNNEL_START_OFFSET, FENCE_Y_TOP);
    fence.lineTo(x1, FUNNEL_Y_TOP);
    fence.moveTo(x0, FENCE_Y_BOTTOM);
    fence.lineTo(x1 - FUNNEL_START_OFFSET, FENCE_Y_BOTTOM);
    fence.lineTo(x1, FUNNEL_Y_BOTTOM);
    fence.strokePath();
    ctx.registerWorld(fence);

    // Clover patches — off-path but inside the fences.
    const patches: { x: number; y: number }[] = [
      { x: x0 + 500, y: FENCE_Y_TOP + 35 },
      { x: x0 + 900, y: FENCE_Y_BOTTOM - 35 },
      { x: x0 + 1250, y: FENCE_Y_TOP + 45 },
    ];
    for (const p of patches) {
      const c = scene.add
        .circle(p.x, p.y, CLOVER_RADIUS, 0x3c7a2a, 0.55)
        .setDepth(1);
      c.setStrokeStyle(2, 0x2a5818);
      ctx.registerWorld(c);
    }

    // Scarecrow — visual landmark at the demo-bark location.
    const scareX = x0 + SCARECROW_X_OFFSET;
    const scareY = FENCE_Y_TOP + 55;
    const pole = scene.add
      .rectangle(scareX, scareY + 24, 4, 90, 0x6b4226)
      .setDepth(2);
    const cross = scene.add
      .rectangle(scareX, scareY + 8, 40, 4, 0x6b4226)
      .setDepth(2);
    const head = scene.add
      .circle(scareX, scareY - 12, 12, 0xd4a657)
      .setDepth(2);
    ctx.registerWorld([pole, cross, head]);

    const label = scene.add
      .text(x0 + 200, FENCE_Y_TOP - 40, "Open Meadow", {
        fontFamily: FONT_BODY,
        fontSize: 22,
        color: "#2f2014",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0, 0)
      .setDepth(2);
    ctx.registerWorld(label);

    let scarecrowTriggered = false;

    return {
      update(dt: number): void {
        const dtMs = dt * 1000;

        // Scarecrow demo bark — scare nearby sheep once, the first time the dog
        // gets close enough. Teaches the player what a sprint looks like.
        if (!scarecrowTriggered) {
          const dd = Math.hypot(ctx.dog.x - scareX, ctx.dog.y - scareY);
          if (dd < SCARECROW_TRIGGER_R + 40) {
            scarecrowTriggered = true;
            for (const s of ctx.sheep) {
              if (s.home || s.falling) continue;
              const sd = Math.hypot(s.sprite.x - scareX, s.sprite.y - scareY);
              if (sd < 220) s.scaredMs = Math.max(s.scaredMs, 600);
            }
          }
        }

        // Clover graze pause — first time a sheep overlaps a patch, pin it briefly.
        for (const s of ctx.sheep) {
          if (s.home || s.falling) continue;
          if (s.sprite.x < x0 || s.sprite.x > x1) continue;
          if (s.grazePauseMs > 0) {
            s.grazePauseMs = Math.max(0, s.grazePauseMs - dtMs);
            s.vx *= 0.1;
            s.vy *= 0.1;
            continue;
          }
          for (const p of patches) {
            const d = Math.hypot(s.sprite.x - p.x, s.sprite.y - p.y);
            if (d < CLOVER_RADIUS + 6) {
              s.grazePauseMs = CLOVER_PAUSE_MS;
              break;
            }
          }
        }
      },
    };
  },
};
