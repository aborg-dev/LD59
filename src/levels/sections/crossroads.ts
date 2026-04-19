import { FONT_BODY, TEXT_RESOLUTION } from "../../fonts.js";
import type { SectionCtx, SectionDef, SectionHandle } from "../types.js";

const CORRIDOR_Y_TOP = 200;
const CORRIDOR_Y_BOTTOM = 520;

const ROAD_WIDTH = 90; // 3u — the kill strip along x
const CART_CYCLE_MS = 18000;
const CART_WARN_MS = 4000;
const CART_TRAVEL_SPEED = 420; // px/s, south-to-north traversal

export const CROSSROADS: SectionDef = {
  id: "crossroads",
  name: "Crossroads",
  xRange: [7110, 8010],
  setup(ctx: SectionCtx): SectionHandle {
    const [x0, x1] = ctx.xRange;
    const roadCenterX = (x0 + x1) / 2;
    const roadX0 = roadCenterX - ROAD_WIDTH / 2;
    const roadX1 = roadCenterX + ROAD_WIDTH / 2;
    const scene = ctx.scene;

    // Grass under the crossroads (lighter green).
    const base = scene.add
      .rectangle(
        (x0 + x1) / 2,
        (CORRIDOR_Y_TOP + CORRIDOR_Y_BOTTOM) / 2,
        x1 - x0,
        CORRIDOR_Y_BOTTOM - CORRIDOR_Y_TOP,
        0x528a42,
        0.3,
      )
      .setDepth(0);
    ctx.registerWorld(base);

    // Road strip — dirt colour, spans the full screen height.
    const road = scene.add
      .rectangle(roadCenterX, 360, ROAD_WIDTH, 720, 0x8f7340, 1)
      .setDepth(0);
    road.setStrokeStyle(2, 0x5a4a28);
    ctx.registerWorld(road);

    // Dashed centre line on the road.
    const dashes = scene.add.graphics().setDepth(1);
    dashes.fillStyle(0xe0c878, 1);
    for (let y = 0; y < 720; y += 40) {
      dashes.fillRect(roadCenterX - 2, y, 4, 20);
    }
    ctx.registerWorld(dashes);

    // Corridor fences — everywhere except across the road.
    const fence = scene.add.graphics().setDepth(2);
    fence.lineStyle(3, 0x6b4226, 1);
    fence.beginPath();
    fence.moveTo(x0, CORRIDOR_Y_TOP);
    fence.lineTo(roadX0, CORRIDOR_Y_TOP);
    fence.moveTo(roadX1, CORRIDOR_Y_TOP);
    fence.lineTo(x1, CORRIDOR_Y_TOP);
    fence.moveTo(x0, CORRIDOR_Y_BOTTOM);
    fence.lineTo(roadX0, CORRIDOR_Y_BOTTOM);
    fence.moveTo(roadX1, CORRIDOR_Y_BOTTOM);
    fence.lineTo(x1, CORRIDOR_Y_BOTTOM);
    fence.strokePath();
    ctx.registerWorld(fence);

    // Warning dust cloud — visible during the warn window.
    const dust = scene.add
      .circle(roadCenterX, CORRIDOR_Y_BOTTOM + 60, 26, 0xbfa070, 0)
      .setDepth(3);
    ctx.registerWorld(dust);

    // Cart — rectangle on wheels, hidden until it crosses.
    const cartBody = scene.add
      .rectangle(roadCenterX, 800, 64, 38, 0x8b5a2b)
      .setDepth(4);
    cartBody.setStrokeStyle(2, 0x3a2515);
    const cartLoad = scene.add
      .rectangle(roadCenterX, 800, 44, 18, 0xd6b46a)
      .setDepth(5);
    ctx.registerWorld([cartBody, cartLoad]);

    const label = scene.add
      .text((x0 + x1) / 2, 170, "Crossroads", {
        fontFamily: FONT_BODY,
        fontSize: 22,
        color: "#c0a060",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 0)
      .setDepth(2);
    ctx.registerWorld(label);

    let cycleT = 0;
    let cartActive = false;
    let cartY = 800;

    return {
      update(dt: number): void {
        const dtMs = dt * 1000;
        cycleT += dtMs;
        const phase = cycleT % CART_CYCLE_MS;
        // Warning phase: the last CART_WARN_MS of the cycle before impact.
        const warningOn =
          phase > CART_CYCLE_MS - CART_WARN_MS &&
          phase <= CART_CYCLE_MS - (CART_WARN_MS - 1000);
        dust.setAlpha(warningOn ? 0.6 : 0);

        // At cycle-end, spawn the cart.
        if (phase >= CART_CYCLE_MS - 16.66) {
          cartActive = true;
          cartY = CORRIDOR_Y_BOTTOM + 120;
        }
        if (cartActive) {
          cartY -= CART_TRAVEL_SPEED * dt;
          cartBody.setPosition(roadCenterX, cartY);
          cartLoad.setPosition(roadCenterX, cartY - 18);
          // Kill zone — any sheep in the road x-band with y near cartY is lost.
          for (const s of ctx.sheep) {
            if (s.home || s.falling) continue;
            if (s.sprite.x < roadX0 || s.sprite.x > roadX1) continue;
            if (Math.abs(s.sprite.y - cartY) < 26) {
              ctx.loseSheep(s);
            }
          }
          if (cartY < CORRIDOR_Y_TOP - 120) {
            cartActive = false;
            cartBody.setPosition(roadCenterX, 800);
            cartLoad.setPosition(roadCenterX, 800);
          }
        }
      },
    };
  },
};
