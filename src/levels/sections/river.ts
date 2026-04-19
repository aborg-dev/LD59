import { FONT_BODY, TEXT_RESOLUTION } from "../../fonts.js";
import type {
  SectionCtx,
  SectionDef,
  SectionHandle,
  SheepRef,
} from "../types.js";

const CORRIDOR_Y_TOP = 200;
const CORRIDOR_Y_BOTTOM = 520;
const RIVER_WIDTH = 600; // 20u
const RIVER_BANK_MARGIN = 300;
const CURRENT_SPEED = 30; // px/s south drift while in the ford
const DRIFT_WARN_Y = 460;
const SWEPT_Y = 485;
const HESITATION_MS = 400;
const DOG_PUSH_RADIUS = 140;
const DOG_PUSH_FORCE = 60;

export const RIVER_FORD: SectionDef = {
  id: "river",
  name: "River Ford",
  xRange: [5910, 7110],
  setup(ctx: SectionCtx): SectionHandle {
    const [x0, x1] = ctx.xRange;
    const riverX0 = x0 + RIVER_BANK_MARGIN;
    const riverX1 = x1 - RIVER_BANK_MARGIN;
    const scene = ctx.scene;

    // Banks (light sand).
    const westBank = scene.add
      .rectangle(
        (x0 + riverX0) / 2,
        (CORRIDOR_Y_TOP + CORRIDOR_Y_BOTTOM) / 2,
        RIVER_BANK_MARGIN,
        CORRIDOR_Y_BOTTOM - CORRIDOR_Y_TOP,
        0xd6c78b,
        0.6,
      )
      .setDepth(0);
    const eastBank = scene.add
      .rectangle(
        (riverX1 + x1) / 2,
        (CORRIDOR_Y_TOP + CORRIDOR_Y_BOTTOM) / 2,
        RIVER_BANK_MARGIN,
        CORRIDOR_Y_BOTTOM - CORRIDOR_Y_TOP,
        0xd6c78b,
        0.6,
      )
      .setDepth(0);
    ctx.registerWorld([westBank, eastBank]);

    // River surface.
    const river = scene.add
      .rectangle(
        (riverX0 + riverX1) / 2,
        (CORRIDOR_Y_TOP + CORRIDOR_Y_BOTTOM) / 2,
        RIVER_WIDTH,
        CORRIDOR_Y_BOTTOM - CORRIDOR_Y_TOP,
        0x3a6fa8,
        0.85,
      )
      .setDepth(0);
    ctx.registerWorld(river);

    // Ripple lines — animated (static for simplicity; a subtle shimmer would be nicer).
    const ripples = scene.add.graphics().setDepth(1);
    ripples.lineStyle(1, 0xaed6ff, 0.4);
    for (let yy = CORRIDOR_Y_TOP + 20; yy < CORRIDOR_Y_BOTTOM; yy += 18) {
      for (let xx = riverX0 + 10; xx < riverX1; xx += 70) {
        ripples.beginPath();
        ripples.moveTo(xx, yy);
        ripples.lineTo(xx + 30, yy);
        ripples.strokePath();
      }
    }
    ctx.registerWorld(ripples);

    // Drift warning zone — yellow tint.
    const warnStrip = scene.add
      .rectangle(
        (riverX0 + riverX1) / 2,
        (DRIFT_WARN_Y + SWEPT_Y) / 2,
        RIVER_WIDTH,
        SWEPT_Y - DRIFT_WARN_Y,
        0xd9a244,
        0.3,
      )
      .setDepth(1);
    ctx.registerWorld(warnStrip);

    // Fences: corridor top and along banks.
    const fence = scene.add.graphics().setDepth(2);
    fence.lineStyle(3, 0x6b4226, 1);
    fence.beginPath();
    fence.moveTo(x0, CORRIDOR_Y_TOP);
    fence.lineTo(x1, CORRIDOR_Y_TOP);
    fence.strokePath();
    ctx.registerWorld(fence);

    const label = scene.add
      .text((x0 + x1) / 2, 170, "River Ford", {
        fontFamily: FONT_BODY,
        fontSize: 22,
        color: "#cde6ff",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 0)
      .setDepth(2);
    ctx.registerWorld(label);

    const hesitationMs = new Map<SheepRef, number>();

    return {
      update(dt: number): void {
        const dtMs = dt * 1000;

        for (const s of ctx.sheep) {
          if (s.home || s.falling) continue;
          if (s.sprite.x < x0 || s.sprite.x > x1) {
            hesitationMs.delete(s);
            continue;
          }

          // Bank hesitation — first time approaching the water, pin briefly.
          const nearWestBank =
            s.sprite.x >= riverX0 - 10 && s.sprite.x <= riverX0 + 10;
          if (nearWestBank && !hesitationMs.has(s)) {
            hesitationMs.set(s, HESITATION_MS);
          }
          const hesRemaining = hesitationMs.get(s);
          if (hesRemaining !== undefined && hesRemaining > 0) {
            hesitationMs.set(s, hesRemaining - dtMs);
            s.vx *= 0.1;
            s.vy *= 0.1;
            continue;
          }

          // In the ford — current drifts sheep south.
          if (s.sprite.x >= riverX0 && s.sprite.x <= riverX1) {
            s.vy += CURRENT_SPEED * dt * 60; // amplify dt to produce visible drift

            // Dog in/near the water helps push sheep back north.
            if (ctx.dog.y > CORRIDOR_Y_TOP + 50) {
              const dd = Math.hypot(
                ctx.dog.x - s.sprite.x,
                ctx.dog.y - s.sprite.y,
              );
              if (dd < DOG_PUSH_RADIUS && dd > 0.01) {
                const nx = (s.sprite.x - ctx.dog.x) / dd;
                const ny = (s.sprite.y - ctx.dog.y) / dd;
                s.vx += nx * DOG_PUSH_FORCE * dt * 60;
                s.vy += ny * DOG_PUSH_FORCE * dt * 60;
              }
            }

            // Swept-away — too far south.
            if (s.sprite.y > SWEPT_Y) {
              const splash = scene.add
                .circle(s.sprite.x, s.sprite.y, 10, 0x5a8cc0, 0.7)
                .setDepth(3);
              splash.setStrokeStyle(2, 0xffffff, 0.8);
              ctx.registerWorld(splash);
              scene.tweens.add({
                targets: splash,
                radius: 34,
                alpha: 0,
                duration: 500,
                onComplete: () => splash.destroy(),
              });
              ctx.loseSheep(s);
            }
          }
        }
      },
    };
  },
};
