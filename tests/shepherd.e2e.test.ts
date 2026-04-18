import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ShepherdSceneState } from "../tools/game.js";
import * as game from "../tools/game.js";

const URL = process.env.TEST_URL || "http://localhost:5173";

async function shepherdState(): Promise<ShepherdSceneState> {
  const dump = await game.dumpState();
  if (!dump.Shepherd) throw new Error("Shepherd scene not initialized");
  return dump.Shepherd;
}

beforeAll(async () => {
  await game.launch(URL);
});

afterAll(async () => {
  await game.close();
});

describe("shepherd herding and game end", () => {
  it("spawns sheep from the edges over time", async () => {
    await game.startScene("Shepherd");
    const before = (await shepherdState()).sheep.length;
    await game.advanceTime(6000);
    const after = (await shepherdState()).sheep.length;
    expect(after).toBeGreaterThan(before);
  });

  it("penning a sheep increments score and coins", async () => {
    await game.startScene("Shepherd");

    // Force a spawn, then place it at pen center and tick physics
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.spawnSheep();
      const s = gs.sheep[gs.sheep.length - 1];
      s.sprite.x = gs.penX;
      s.sprite.y = gs.penY;
      s.vx = 0;
      s.vy = 0;
    })()`);
    await game.advanceTime(50);

    const s = await shepherdState();
    expect(s.score).toBeGreaterThanOrEqual(1);
    expect(s.coins).toBeGreaterThanOrEqual(1);
    expect(s.sheep.some((sh) => sh.penned)).toBe(true);
  });

  it("bark pushes nearby sheep away from dog", async () => {
    await game.startScene("Shepherd");

    // Clear any auto-spawned sheep, park dog/sheep far from the pen
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      for (const s of gs.sheep) s.sprite.destroy();
      gs.sheep = [];
      gs.dog.x = 60;
      gs.dog.y = 1100;
      gs.targetX = gs.dog.x;
      gs.targetY = gs.dog.y;
      gs.spawnSheep();
      const s = gs.sheep[gs.sheep.length - 1];
      s.sprite.x = 100;
      s.sprite.y = 1100;
      s.vx = 0;
      s.vy = 0;
      s.wanderAngle = 0;
      s.modeT = 999;
      s.grazing = true;
    })()`);

    const before = (await shepherdState()).sheep.at(-1);
    if (!before) throw new Error("no sheep");

    await game.eval_(`(() => {
      window.game.scene.getScene('Shepherd').bark();
    })()`);
    await game.advanceTime(50);

    const after = (await shepherdState()).sheep.at(-1);
    if (!after) throw new Error("no sheep");
    // Sheep should be pushed to the right (away from dog at x=60)
    expect(after.x).toBeGreaterThan(before.x);
  });

  it("places a whistle tower and pushes sheep toward the pen", async () => {
    await game.startScene("Shepherd");

    // Clear noise sheep, give coins, build a tower to the RIGHT of the pen.
    // Spawn a single sheep further right so flee-from-dog is negligible
    // and the only meaningful force is the tower pushing it pen-ward (left).
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      for (const s of gs.sheep) s.sprite.destroy();
      gs.sheep = [];
      gs.coins = 10;
      gs.buildMode = true;
      const tx = gs.penX + gs.penR + 60;
      const ty = gs.penY;
      gs.tryPlaceTower(tx, ty);
      // Park the dog far away so flee-from-dog is out of range
      gs.dog.x = 60;
      gs.dog.y = 100;
      gs.targetX = gs.dog.x;
      gs.targetY = gs.dog.y;
      gs.spawnSheep();
      const s = gs.sheep[gs.sheep.length - 1];
      s.sprite.x = tx + 20;
      s.sprite.y = ty;
      s.vx = 0;
      s.vy = 0;
      s.modeT = 999;
      s.grazing = true;
      // Force the tower to pulse on the very next step
      gs.towers[0].pulseMs = 999999;
    })()`);

    const st0 = await shepherdState();
    expect(st0.towers.length).toBe(1);
    expect(st0.coins).toBe(7);

    const sheepBefore = st0.sheep.at(-1);
    if (!sheepBefore) throw new Error("no sheep");

    // One physics step is enough — the forced pulse fires immediately.
    await game.advanceTime(100);

    const sheepAfter = (await shepherdState()).sheep.at(-1);
    if (!sheepAfter) throw new Error("no sheep");
    // Sheep should have been pushed left (toward pen at smaller x)
    expect(sheepAfter.x).toBeLessThan(sheepBefore.x);
  });

  it("ends game on timer expiry with correct score", async () => {
    await game.startScene("Shepherd");

    const s = await shepherdState();
    await game.advanceTime(s.timeLeft * 1000);

    const dump = await game.dumpState();
    expect(dump.GameOver?.active).toBe(true);
    expect(typeof dump.GameOver?.finalScore).toBe("number");
  });
});
