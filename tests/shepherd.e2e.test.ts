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
    expect(s.dragging).toBeNull();
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

  it("dragging a sheep into a pen pens it", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.spawnSheep();
      const s = gs.sheep[gs.sheep.length - 1];
      s.sprite.x = 1000;
      s.sprite.y = 1000;
      s.vx = 0;
      s.vy = 0;
      gs.tryStartDrag(s.sprite.x, s.sprite.y);
      const pen = gs.pens[0];
      gs.updateDragPosition(pen.x, pen.y);
      gs.endDrag();
    })()`);
    await game.advanceTime(50);

    const s = await shepherdState();
    const penned = s.sheep.filter((sh) => sh.penned).length;
    expect(penned).toBeGreaterThanOrEqual(1);
    expect(s.dragging).toBeNull();
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
