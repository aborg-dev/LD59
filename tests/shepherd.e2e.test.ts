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

describe("shepherd core loop", () => {
  it("starts empty — no sheep, no dogs until the player buys them", async () => {
    await game.startScene("Shepherd");
    const s = await shepherdState();
    expect(s.sheep.length).toBe(0);
    expect(s.dogs.length).toBe(0);
    expect(s.coins).toBeGreaterThan(0);
  });

  it("buying a sheep spawns a truck and drops a baby sheep", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 100;
      gs.updateCoinText();
      gs.buySheep();
    })()`);

    const truckOnly = await shepherdState();
    expect(truckOnly.trucks.length).toBe(1);

    // Give the truck time to drive to the drop point and release the sheep
    await game.advanceTime(8000);

    const after = await shepherdState();
    expect(after.sheep.length).toBeGreaterThanOrEqual(1);
    expect(after.sheep[0].stage).toBe("baby");
    expect(after.coins).toBeLessThan(100);
  });

  it("buying a dog adds a dog and spends coins", async () => {
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

  it("baby sheep in the field grow into adults over time", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const sheep = gs.spawnSheep();
      sheep.sprite.x = gs.dumpState().field.x;
      sheep.sprite.y = gs.dumpState().field.y;
      sheep.vx = 0;
      sheep.vy = 0;
    })()`);

    await game.advanceTime(15000);

    const s = await shepherdState();
    const adults = s.sheep.filter((sh) => sh.stage === "adult");
    expect(adults.length).toBeGreaterThanOrEqual(1);
  });

  it("adult sheep in the market are sold for coins", async () => {
    await game.startScene("Shepherd");

    const startCoins = (await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const sheep = gs.spawnSheep();
      sheep.stage = 'adult';
      sheep.growthT = 999;
      sheep.sprite.setScale(1);
      const m = gs.dumpState().market;
      sheep.sprite.x = m.x;
      sheep.sprite.y = m.y;
      sheep.vx = 0;
      sheep.vy = 0;
      return gs.coins;
    })()`)) as number;

    await game.advanceTime(200);

    const s = await shepherdState();
    expect(s.score).toBeGreaterThanOrEqual(1);
    expect(s.coins).toBeGreaterThan(startCoins);
  });
});
