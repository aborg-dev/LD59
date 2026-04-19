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

describe("shepherd idle clicker", () => {
  it("starts with sheep on the field and no dogs", async () => {
    await game.startScene("Shepherd");
    const s = await shepherdState();
    expect(s.sheep.length).toBeGreaterThan(0);
    expect(s.dogs.length).toBe(0);
    expect(s.lastWhistle).toBeNull();
  });

  it("spawns more sheep over time", async () => {
    await game.startScene("Shepherd");
    const before = await shepherdState();
    const initialCount = before.sheep.length;

    // Advance past a spawn interval
    await game.advanceTime(4000);
    const after = await shepherdState();
    expect(after.sheep.length).toBeGreaterThan(initialCount);
  });

  it("whistle pushes nearby sheep away from the click point", async () => {
    await game.startScene("Shepherd");

    const before = await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.spawnSheep();
      const s = gs.sheep[gs.sheep.length - 1];
      s.sprite.x = 3200;
      s.sprite.y = 1650;
      s.vx = 0;
      s.vy = 0;
      return { x: s.sprite.x, y: s.sprite.y };
    })()`);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.whistle(3200, 1600);
    })()`);

    const after = await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const s = gs.sheep[gs.sheep.length - 1];
      return { vx: s.vx, vy: s.vy };
    })()`);

    const s = await shepherdState();
    expect(s.lastWhistle).toEqual({ x: 3200, y: 1600 });
    // Sheep was at y=1650 (below whistle at 1600), so it should be pushed
    // downward (positive vy) by the whistle impulse.
    expect((after as { vy: number }).vy).toBeGreaterThan(0);
    void before;
  });

  it("buying a dog adds an active dog and spends coins", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 100;
      gs.updateCoinText();
      gs.buyDog();
    })()`);

    const s = await shepherdState();
    expect(s.dogs.length).toBe(1);
    expect(s.coins).toBeLessThan(100);
  });

  it("penning a sheep increments score and coins", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.spawnSheep();
      const s = gs.sheep[gs.sheep.length - 1];
      const pen = gs.pens[0];
      s.sprite.x = pen.x;
      s.sprite.y = pen.y;
      s.vx = 0;
      s.vy = 0;
    })()`);
    await game.advanceTime(50);

    const s = await shepherdState();
    expect(s.score).toBeGreaterThanOrEqual(1);
    expect(s.coins).toBeGreaterThanOrEqual(1);
  });
});
