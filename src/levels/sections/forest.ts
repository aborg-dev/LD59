import { FONT_BODY, TEXT_RESOLUTION } from "../../fonts.js";
import type {
  SectionCtx,
  SectionDef,
  SectionHandle,
  SheepRef,
} from "../types.js";

const CORRIDOR_Y_TOP = 200;
const CORRIDOR_Y_BOTTOM = 520;

const MUSH_PULL_R = 180; // 6u
const MUSH_CORE_R = 30;
const MUSH_LOST_MS = 4000;
const MUSH_BARK_ESCAPE_R = 120; // 4u
const MUSH_DOG_ESCAPE_R = 60; // 2u
const MUSH_TRANCE_SPEED = 44; // 20% of base 220

const FOX_PANIC_R = 210; // 7u
const FOX_CYCLE_MIN_MS = 8000;
const FOX_CYCLE_MAX_MS = 12000;
const FOX_WARNING_MS = 1500;

const DEEP_WOOD_LOST_MS = 5000;
const DEEP_TOP_Y = 160;
const DEEP_BOTTOM_Y = 560;

const EXIT_PULL_R = 600; // 20u from exit x
const EXIT_PULL_FORCE = 9; // 0.3 u/s, applied as per-frame velocity nudge

interface MushRing {
  x: number;
  y: number;
}

interface FoxBush {
  x: number;
  y: number;
  visual: import("phaser").GameObjects.Arc;
  shadow: import("phaser").GameObjects.Arc;
  nextTriggerMs: number;
  warningActive: boolean;
}

export const DARK_FOREST: SectionDef = {
  id: "forest",
  name: "Dark Forest",
  xRange: [4110, 5910],
  setup(ctx: SectionCtx): SectionHandle {
    const [x0, x1] = ctx.xRange;
    const scene = ctx.scene;

    // Dark forest floor tint.
    const floor = scene.add
      .rectangle(
        (x0 + x1) / 2,
        (CORRIDOR_Y_TOP + CORRIDOR_Y_BOTTOM) / 2,
        x1 - x0,
        CORRIDOR_Y_BOTTOM - CORRIDOR_Y_TOP,
        0x2d4020,
        0.6,
      )
      .setDepth(0);
    ctx.registerWorld(floor);

    // Deep wood edges — darker bands outside the corridor.
    const deep = scene.add.graphics().setDepth(0);
    deep.fillStyle(0x0f1a08, 0.9);
    deep.fillRect(x0, DEEP_TOP_Y - 40, x1 - x0, DEEP_TOP_Y - (DEEP_TOP_Y - 40));
    deep.fillRect(x0, DEEP_BOTTOM_Y, x1 - x0, 720 - DEEP_BOTTOM_Y);
    ctx.registerWorld(deep);

    // Scattered trees — visual only.
    const trees = scene.add.graphics().setDepth(1);
    for (let i = 0; i < 60; i++) {
      const tx = x0 + Math.random() * (x1 - x0);
      const ty =
        Math.random() < 0.5
          ? 90 + Math.random() * (CORRIDOR_Y_TOP - 100)
          : CORRIDOR_Y_BOTTOM + 10 + Math.random() * 90;
      trees.fillStyle(0x1f2f12, 1);
      trees.fillCircle(tx, ty, 8 + Math.random() * 8);
      trees.fillStyle(0x3a1f0c, 1);
      trees.fillRect(tx - 2, ty, 4, 6);
    }
    ctx.registerWorld(trees);

    // Mushroom rings — 3 of them, alternating sides.
    const rings: MushRing[] = [
      { x: x0 + 300, y: CORRIDOR_Y_TOP + 60 },
      { x: x0 + 700, y: CORRIDOR_Y_BOTTOM - 60 },
      { x: x0 + 1200, y: CORRIDOR_Y_TOP + 70 },
    ];
    for (const r of rings) {
      // Pull radius (faint).
      const pull = scene.add
        .circle(r.x, r.y, MUSH_PULL_R, 0x8a5ab0, 0.08)
        .setDepth(0);
      ctx.registerWorld(pull);
      // Ring of small mushrooms.
      const ringGfx = scene.add.graphics().setDepth(1);
      for (let i = 0; i < 12; i++) {
        const theta = (i / 12) * Math.PI * 2;
        const mx = r.x + Math.cos(theta) * MUSH_CORE_R;
        const my = r.y + Math.sin(theta) * MUSH_CORE_R;
        ringGfx.fillStyle(0xc84040, 1);
        ringGfx.fillCircle(mx, my - 1, 4);
        ringGfx.fillStyle(0xffffff, 1);
        ringGfx.fillCircle(mx - 1, my - 2, 1);
      }
      ctx.registerWorld(ringGfx);
    }

    // Fox bushes — 2 of them.
    const bushPositions = [
      { x: x0 + 500, y: CORRIDOR_Y_BOTTOM - 30 },
      { x: x0 + 1000, y: CORRIDOR_Y_TOP + 30 },
    ];
    const bushes: FoxBush[] = bushPositions.map((p) => {
      const visual = scene.add.circle(p.x, p.y, 20, 0x3d5a1d, 1).setDepth(2);
      visual.setStrokeStyle(2, 0x2a4010);
      const shadow = scene.add.circle(p.x, p.y, 8, 0x000000, 0).setDepth(3);
      ctx.registerWorld([visual, shadow]);
      return {
        x: p.x,
        y: p.y,
        visual,
        shadow,
        nextTriggerMs:
          FOX_CYCLE_MIN_MS +
          Math.random() * (FOX_CYCLE_MAX_MS - FOX_CYCLE_MIN_MS),
        warningActive: false,
      };
    });

    const label = scene.add
      .text((x0 + x1) / 2, 170, "Dark Forest", {
        fontFamily: FONT_BODY,
        fontSize: 22,
        color: "#aad1ff",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 0)
      .setDepth(2);
    ctx.registerWorld(label);

    // Per-sheep state.
    const mushLock = new Map<SheepRef, { ring: MushRing; sinkMs: number }>();
    const deepTimer = new Map<SheepRef, number>();
    const seenWhistles = new Set<number>();

    return {
      update(dt: number): void {
        const dtMs = dt * 1000;

        // Fox timers.
        for (const b of bushes) {
          b.nextTriggerMs -= dtMs;
          if (!b.warningActive && b.nextTriggerMs < FOX_WARNING_MS) {
            b.warningActive = true;
            b.shadow.setAlpha(0.8);
          }
          if (b.nextTriggerMs <= 0) {
            // Rustle fires — panic nearby sheep.
            b.visual.setFillStyle(0x5a7a30);
            scene.tweens.add({
              targets: b.visual,
              scale: 1.3,
              yoyo: true,
              duration: 150,
              onComplete: () => b.visual.setFillStyle(0x3d5a1d),
            });
            for (const s of ctx.sheep) {
              if (s.home || s.falling) continue;
              const d = Math.hypot(s.sprite.x - b.x, s.sprite.y - b.y);
              if (d < FOX_PANIC_R) {
                s.scaredMs = Math.max(s.scaredMs, 2500);
                s.angle = Math.random() * Math.PI * 2;
              }
            }
            b.nextTriggerMs =
              FOX_CYCLE_MIN_MS +
              Math.random() * (FOX_CYCLE_MAX_MS - FOX_CYCLE_MIN_MS);
            b.warningActive = false;
            b.shadow.setAlpha(0);
          }
        }

        // Handle bark-escape for mushroom rings.
        for (const w of ctx.whistles) {
          if (seenWhistles.has(w.id)) continue;
          if (w.x < x0 || w.x > x1) continue;
          seenWhistles.add(w.id);
          for (const [s] of mushLock) {
            const d = Math.hypot(s.sprite.x - w.x, s.sprite.y - w.y);
            if (d < MUSH_BARK_ESCAPE_R) {
              mushLock.delete(s);
              s.scaredMs = Math.max(s.scaredMs, 600);
            }
          }
        }

        for (const s of ctx.sheep) {
          if (s.home || s.falling) continue;
          const inSection = s.sprite.x >= x0 && s.sprite.x <= x1;
          if (!inSection) {
            mushLock.delete(s);
            deepTimer.delete(s);
            continue;
          }

          // Mushroom trance.
          const lock = mushLock.get(s);
          if (lock) {
            // Dog-escape.
            const dToSheep = Math.hypot(
              ctx.dog.x - s.sprite.x,
              ctx.dog.y - s.sprite.y,
            );
            if (dToSheep < MUSH_DOG_ESCAPE_R) {
              mushLock.delete(s);
            } else {
              // Clamp trance speed.
              const sp = Math.hypot(s.vx, s.vy);
              if (sp > MUSH_TRANCE_SPEED) {
                const k = MUSH_TRANCE_SPEED / sp;
                s.vx *= k;
                s.vy *= k;
              }
              // Sink timer if in core of ring.
              const dd = Math.hypot(
                s.sprite.x - lock.ring.x,
                s.sprite.y - lock.ring.y,
              );
              if (dd < MUSH_CORE_R) {
                lock.sinkMs += dtMs;
                if (lock.sinkMs >= MUSH_LOST_MS) {
                  ctx.loseSheep(s);
                  mushLock.delete(s);
                  continue;
                }
              } else {
                lock.sinkMs = Math.max(0, lock.sinkMs - dtMs);
              }
            }
          } else {
            for (const r of rings) {
              const d = Math.hypot(s.sprite.x - r.x, s.sprite.y - r.y);
              if (d < MUSH_PULL_R) {
                mushLock.set(s, { ring: r, sinkMs: 0 });
                break;
              }
            }
          }

          // Deep-wood lost timer.
          if (s.sprite.y < DEEP_TOP_Y || s.sprite.y > DEEP_BOTTOM_Y) {
            const elapsed = (deepTimer.get(s) ?? 0) + dtMs;
            if (elapsed >= DEEP_WOOD_LOST_MS) {
              ctx.loseSheep(s);
              deepTimer.delete(s);
              continue;
            }
            deepTimer.set(s, elapsed);
          } else {
            deepTimer.delete(s);
          }

          // Exit pull toward the east end — helps stragglers find the way.
          const distToExit = x1 - s.sprite.x;
          if (distToExit > 0 && distToExit < EXIT_PULL_R) {
            s.vx += EXIT_PULL_FORCE * dt;
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
