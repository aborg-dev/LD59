import { FONT_BODY, TEXT_RESOLUTION } from "../../fonts.js";
import type {
  SectionCtx,
  SectionDef,
  SectionHandle,
  SheepRef,
} from "../types.js";

const CORRIDOR_Y_TOP = 200;
const CORRIDOR_Y_BOTTOM = 520;
const PULL_RADIUS = 150; // 5u
const BARK_ESCAPE_RADIUS = 90; // 3u
const DOG_ESCAPE_RADIUS = 60; // 2u
const LOCK_RATE_PER_SEC = 0.35;
const OFF_PATH_LIMIT = 120; // 4u past corridor fence
const HEDGE_Y_TOP = CORRIDOR_Y_TOP - 10;
const HEDGE_Y_BOTTOM = CORRIDOR_Y_BOTTOM + 10;

interface Patch {
  x: number;
  y: number;
}

interface LockState {
  patch: Patch;
  barks: number;
}

export const CLOVER_HOLLOW: SectionDef = {
  id: "clover",
  name: "Clover Hollow",
  xRange: [3060, 4110],
  setup(ctx: SectionCtx): SectionHandle {
    const [x0, x1] = ctx.xRange;
    const scene = ctx.scene;

    // Fences — the corridor curves slightly by drawing two arcs, but we keep
    // it straight-ish for physics. Fences are purely cosmetic here; the hedge
    // line beyond them is the actual off-path threshold.
    const fence = scene.add.graphics().setDepth(2);
    fence.lineStyle(3, 0x6b4226, 1);
    fence.beginPath();
    fence.moveTo(x0, CORRIDOR_Y_TOP);
    fence.lineTo(x1, CORRIDOR_Y_TOP);
    fence.moveTo(x0, CORRIDOR_Y_BOTTOM);
    fence.lineTo(x1, CORRIDOR_Y_BOTTOM);
    fence.strokePath();
    ctx.registerWorld(fence);

    // Hedge (visual) — deeper green band past the fence, the lost edge.
    const hedge = scene.add.graphics().setDepth(1);
    hedge.fillStyle(0x2a4a1a, 0.7);
    hedge.fillRect(x0, CORRIDOR_Y_TOP - 30, x1 - x0, 20);
    hedge.fillRect(x0, CORRIDOR_Y_BOTTOM + 10, x1 - x0, 20);
    ctx.registerWorld(hedge);

    // Clover patches — three of them, alternating off the main path.
    const patches: Patch[] = [
      { x: x0 + 230, y: CORRIDOR_Y_TOP + 60 },
      { x: x0 + 530, y: CORRIDOR_Y_BOTTOM - 55 },
      { x: x0 + 820, y: CORRIDOR_Y_TOP + 50 },
    ];
    for (const p of patches) {
      const pull = scene.add
        .circle(p.x, p.y, PULL_RADIUS, 0x3c7a2a, 0.1)
        .setDepth(0);
      ctx.registerWorld(pull);
      const c = scene.add.circle(p.x, p.y, 34, 0x3c7a2a, 0.75).setDepth(1);
      c.setStrokeStyle(2, 0x2a5818);
      const dots = scene.add.graphics().setDepth(1);
      dots.fillStyle(0xffffff, 0.6);
      for (let i = 0; i < 5; i++) {
        dots.fillCircle(
          p.x + Math.cos((i * Math.PI * 2) / 5) * 18,
          p.y + Math.sin((i * Math.PI * 2) / 5) * 18,
          2.5,
        );
      }
      ctx.registerWorld([c, dots]);
    }

    const label = scene.add
      .text(x0 + 200, CORRIDOR_Y_TOP - 48, "Clover Hollow", {
        fontFamily: FONT_BODY,
        fontSize: 22,
        color: "#2f2014",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0, 0)
      .setDepth(2);
    ctx.registerWorld(label);

    const locks = new Map<SheepRef, LockState>();
    const seenWhistles = new Set<number>();

    return {
      update(dt: number): void {
        // Handle bark escape — process whistles before per-sheep updates.
        for (const w of ctx.whistles) {
          if (seenWhistles.has(w.id)) continue;
          if (w.x < x0 - 100 || w.x > x1 + 100) continue;
          seenWhistles.add(w.id);
          for (const [s, lock] of locks) {
            const d = Math.hypot(s.sprite.x - w.x, s.sprite.y - w.y);
            if (d < BARK_ESCAPE_RADIUS) {
              lock.barks++;
              const required = s.personality === "greedy" ? 2 : 1;
              if (lock.barks >= required) {
                locks.delete(s);
                s.scaredMs = Math.max(s.scaredMs, 500);
                // 40% chance to sprint in a random direction (possibly worse).
                if (Math.random() < 0.4) {
                  s.angle = Math.random() * Math.PI * 2;
                }
              }
            }
          }
        }

        for (const s of ctx.sheep) {
          if (s.home || s.falling) continue;
          if (s.sprite.x < x0 || s.sprite.x > x1) {
            locks.delete(s);
            continue;
          }

          // Dog-escape: dog near a locked sheep's patch releases the lock.
          const lock = locks.get(s);
          if (lock) {
            const dd = Math.hypot(
              ctx.dog.x - lock.patch.x,
              ctx.dog.y - lock.patch.y,
            );
            if (dd < DOG_ESCAPE_RADIUS + PULL_RADIUS / 2) {
              // Direct physical nudge from the dog works too; if the dog is
              // close enough to the sheep itself, release.
              const dToSheep = Math.hypot(
                ctx.dog.x - s.sprite.x,
                ctx.dog.y - s.sprite.y,
              );
              if (dToSheep < DOG_ESCAPE_RADIUS) {
                locks.delete(s);
              }
            }
            // While locked, pin the sheep near the patch.
            s.vx *= 0.1;
            s.vy *= 0.1;
            continue;
          }

          // Lock acquisition: check each patch. 35% per sec (×2 for greedy).
          for (const p of patches) {
            const d = Math.hypot(s.sprite.x - p.x, s.sprite.y - p.y);
            if (d >= PULL_RADIUS) continue;
            const rate =
              LOCK_RATE_PER_SEC * (s.personality === "greedy" ? 2 : 1);
            if (Math.random() < rate * dt) {
              locks.set(s, { patch: p, barks: 0 });
              break;
            }
          }

          // Off-path: beyond the hedge is permanent loss.
          if (
            s.sprite.y < HEDGE_Y_TOP - OFF_PATH_LIMIT ||
            s.sprite.y > HEDGE_Y_BOTTOM + OFF_PATH_LIMIT
          ) {
            ctx.loseSheep(s);
          }
        }

        if (seenWhistles.size > 128) {
          const arr = Array.from(seenWhistles);
          seenWhistles.clear();
          for (const id of arr.slice(-32)) seenWhistles.add(id);
        }
      },
    };
  },
};
