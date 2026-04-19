import { FONT_BODY, TEXT_RESOLUTION } from "../../fonts.js";
import type {
  SectionCtx,
  SectionDef,
  SectionHandle,
  SheepRef,
} from "../types.js";

const PLANK_Y_TOP = 310;
const PLANK_Y_BOTTOM = 410;
const TEETER_Y_TOP_MIN = 265;
const TEETER_Y_BOTTOM_MAX = 455;

const FUNNEL_IN_LEN = 240;
const FUNNEL_OUT_LEN = 240;

const BRIDGE_MAX_SPEED = 110; // half of base SHEEP_MAX_SPEED (220)
const TEETER_MAX_SPEED = 14;
const WOBBLE_AMPLITUDE = 1.8;
const BARK_SCATTER_RADIUS = 150;
const BARK_SCATTER_SPREAD = Math.PI / 4; // ±45°
const PILE_RADIUS = 60;
const PILE_THRESHOLD = 3;
const SPLASH_MS = 500;

function onBridge(s: SheepRef, x0: number, x1: number): boolean {
  return s.sprite.x >= x0 && s.sprite.x <= x1 && !s.home && !s.falling;
}

function inTeeterZone(y: number): boolean {
  return (
    (y >= TEETER_Y_TOP_MIN && y < PLANK_Y_TOP) ||
    (y > PLANK_Y_BOTTOM && y <= TEETER_Y_BOTTOM_MAX)
  );
}

function inFallZone(y: number): boolean {
  return y < TEETER_Y_TOP_MIN || y > TEETER_Y_BOTTOM_MAX;
}

export const BRIDGE: SectionDef = {
  id: "bridge",
  name: "Rickety Bridge",
  xRange: [2400, 3060],
  setup(ctx: SectionCtx): SectionHandle {
    const [x0, x1] = ctx.xRange;
    const scene = ctx.scene;

    // Ravine background — dark void above & below the plank.
    const ravineTop = scene.add
      .rectangle(
        (x0 + x1) / 2,
        (TEETER_Y_TOP_MIN - 40) / 2 + 20,
        x1 - x0 + 40,
        TEETER_Y_TOP_MIN,
        0x0b0b14,
      )
      .setDepth(0);
    const ravineBot = scene.add
      .rectangle(
        (x0 + x1) / 2,
        (TEETER_Y_BOTTOM_MAX + 720) / 2,
        x1 - x0 + 40,
        720 - TEETER_Y_BOTTOM_MAX,
        0x0b0b14,
      )
      .setDepth(0);
    ctx.registerWorld([ravineTop, ravineBot]);

    // Plank deck.
    const plank = scene.add
      .rectangle(
        (x0 + x1) / 2,
        (PLANK_Y_TOP + PLANK_Y_BOTTOM) / 2,
        x1 - x0,
        PLANK_Y_BOTTOM - PLANK_Y_TOP,
        0x8b5a2b,
      )
      .setDepth(1);
    plank.setStrokeStyle(2, 0x5a3a1a);
    ctx.registerWorld(plank);

    // Plank slats — visual detail.
    const slats = scene.add.graphics().setDepth(1);
    slats.lineStyle(2, 0x5a3a1a, 0.6);
    for (let x = x0 + 30; x < x1; x += 40) {
      slats.beginPath();
      slats.moveTo(x, PLANK_Y_TOP);
      slats.lineTo(x, PLANK_Y_BOTTOM);
      slats.strokePath();
    }
    ctx.registerWorld(slats);

    // Teetering zones — warning colour above and below the plank.
    const teeterGfx = scene.add.graphics().setDepth(1);
    teeterGfx.fillStyle(0x3a2a10, 0.6);
    teeterGfx.fillRect(
      x0,
      TEETER_Y_TOP_MIN,
      x1 - x0,
      PLANK_Y_TOP - TEETER_Y_TOP_MIN,
    );
    teeterGfx.fillRect(
      x0,
      PLANK_Y_BOTTOM,
      x1 - x0,
      TEETER_Y_BOTTOM_MAX - PLANK_Y_BOTTOM,
    );
    ctx.registerWorld(teeterGfx);

    // Entrance and exit funnel fences.
    const fences = scene.add.graphics().setDepth(2);
    fences.lineStyle(3, 0x6b4226, 1);
    // Entrance funnel: narrow from broad meadow to plank width.
    fences.beginPath();
    fences.moveTo(x0 - FUNNEL_IN_LEN, 200);
    fences.lineTo(x0, PLANK_Y_TOP);
    fences.moveTo(x0 - FUNNEL_IN_LEN, 520);
    fences.lineTo(x0, PLANK_Y_BOTTOM);
    // Exit funnel: widen back out.
    fences.moveTo(x1, PLANK_Y_TOP);
    fences.lineTo(x1 + FUNNEL_OUT_LEN, 200);
    fences.moveTo(x1, PLANK_Y_BOTTOM);
    fences.lineTo(x1 + FUNNEL_OUT_LEN, 520);
    fences.strokePath();
    ctx.registerWorld(fences);

    const label = scene.add
      .text((x0 + x1) / 2, 170, "Rickety Bridge", {
        fontFamily: FONT_BODY,
        fontSize: 22,
        color: "#e0d4b0",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 0)
      .setDepth(2);
    ctx.registerWorld(label);

    // Wobble clock — drives plank-sway visual on the sprite.
    let wobbleT = 0;
    // Whistle IDs we've already handled for scatter.
    const seenWhistles = new Set<number>();

    return {
      update(dt: number): void {
        const dtMs = dt * 1000;
        wobbleT += dt;

        // Pass 1: per-sheep bridge rules.
        for (const s of ctx.sheep) {
          if (!onBridge(s, x0, x1)) continue;

          // No-sprint rule: quiet the scared state so sheep don't sprint on
          // the plank. Bolters ignore this 30% of the time (roll once).
          if (s.scaredMs > 0) {
            const ignores = s.personality === "bolter" && Math.random() < 0.3;
            if (!ignores) s.scaredMs = 0;
          }

          // Speed cap while on the bridge.
          const spd = Math.hypot(s.vx, s.vy);
          if (spd > BRIDGE_MAX_SPEED) {
            const k = BRIDGE_MAX_SPEED / spd;
            s.vx *= k;
            s.vy *= k;
          }

          // Teeter behaviour.
          if (inTeeterZone(s.sprite.y)) {
            s.teeterMs += dtMs;
            const ts = Math.hypot(s.vx, s.vy);
            if (ts > TEETER_MAX_SPEED) {
              const k = TEETER_MAX_SPEED / ts;
              s.vx *= k;
              s.vy *= k;
            }
            s.sprite.x += Math.sin(wobbleT * 12) * WOBBLE_AMPLITUDE * dt * 30;
          } else if (inFallZone(s.sprite.y)) {
            beginFall(ctx, s, scene);
          } else {
            // On the plank — reset teeter timer.
            s.teeterMs = 0;
          }
        }

        // Pass 2: bark-on-bridge lateral scatter.
        for (const w of ctx.whistles) {
          if (seenWhistles.has(w.id)) continue;
          if (w.x < x0 || w.x > x1) continue;
          seenWhistles.add(w.id);
          // Find the nearest sheep — it sprints as the "targeted" one.
          let nearest: SheepRef | null = null;
          let nearestD = Number.POSITIVE_INFINITY;
          for (const s of ctx.sheep) {
            if (!onBridge(s, x0, x1)) continue;
            const d = Math.hypot(s.sprite.x - w.x, s.sprite.y - w.y);
            if (d < nearestD) {
              nearestD = d;
              nearest = s;
            }
          }
          // Everyone else within scatter radius picks up a lateral kick.
          for (const s of ctx.sheep) {
            if (s === nearest) continue;
            if (!onBridge(s, x0, x1)) continue;
            const d = Math.hypot(s.sprite.x - w.x, s.sprite.y - w.y);
            if (d > BARK_SCATTER_RADIUS) continue;
            // Random lateral rotation of heading; preserves speed but aims
            // the sheep toward the danger zone.
            const sign =
              s.sprite.y > (PLANK_Y_TOP + PLANK_Y_BOTTOM) / 2 ? 1 : -1;
            s.angle += sign * BARK_SCATTER_SPREAD;
            // Direct velocity kick so the scatter is visible this frame.
            s.vy += sign * 180;
          }
        }

        // Pass 3: pile-up nudge. Count sheep per cluster and push rears.
        for (const a of ctx.sheep) {
          if (!onBridge(a, x0, x1)) continue;
          let count = 0;
          let rearMostX = a.sprite.x;
          let rearMost: SheepRef = a;
          for (const b of ctx.sheep) {
            if (!onBridge(b, x0, x1)) continue;
            const d = Math.hypot(
              a.sprite.x - b.sprite.x,
              a.sprite.y - b.sprite.y,
            );
            if (d < PILE_RADIUS) {
              count++;
              if (b.sprite.x < rearMostX) {
                rearMostX = b.sprite.x;
                rearMost = b;
              }
            }
          }
          if (count >= PILE_THRESHOLD && rearMost !== a) {
            rearMost.vx += 25;
            rearMost.vy += (Math.random() - 0.5) * 20;
          }
        }

        // Tiny whistle-set cleanup so the set doesn't grow forever across the run.
        if (seenWhistles.size > 128) {
          const arr = Array.from(seenWhistles);
          seenWhistles.clear();
          for (const id of arr.slice(-32)) seenWhistles.add(id);
        }
      },
    };
  },
};

function beginFall(
  ctx: SectionCtx,
  s: SheepRef,
  scene: import("phaser").Scene,
): void {
  s.falling = true;
  s.vx = 0;
  s.vy = 60;
  // Splash graphic — cosmetic only, so the sheep's visual can linger briefly
  // while the counter already reflects the loss.
  const splash = scene.add
    .circle(s.sprite.x, s.sprite.y, 10, 0x5a8cc0, 0.7)
    .setDepth(3);
  splash.setStrokeStyle(2, 0xffffff, 0.8);
  ctx.registerWorld(splash);
  scene.tweens.add({
    targets: splash,
    radius: 34,
    alpha: 0,
    duration: SPLASH_MS,
    onComplete: () => splash.destroy(),
  });
  // Commit the loss immediately — the sheep is gone from the active flock.
  ctx.loseSheep(s);
}
