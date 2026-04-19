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
      const f = gs.dumpState().field;
      sheep.sprite.x = f.x;
      sheep.sprite.y = f.y;
      sheep.vx = 0;
      sheep.vy = 0;
    })()`);

    await game.advanceTime(15000);

    const s = await shepherdState();
    const adults = s.sheep.filter((sh) => sh.stage === "adult");
    expect(adults.length).toBeGreaterThanOrEqual(1);
  });

  it("grow upgrade reduces grow time", async () => {
    await game.startScene("Shepherd");

    const before = (await shepherdState()).growSec;
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 1000;
      gs.updateCoinText();
      gs.buyGrowUpgrade();
    })()`);

    const after = await shepherdState();
    expect(after.growSec).toBeLessThan(before);
    expect(after.growUpgradeLevel).toBe(1);
  });

  it("sell upgrade increases coins earned on sale", async () => {
    await game.startScene("Shepherd");

    const startCoins = (await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 1000;
      gs.updateCoinText();
      gs.buySellUpgrade();
      gs.buySellUpgrade();
      const c = gs.coins;
      // Place an adult sheep inside the market to trigger a sale
      const sheep = gs.spawnSheep();
      sheep.stage = 'adult';
      sheep.growthT = 999;
      sheep.sprite.setScale(1);
      const m = gs.dumpState().market;
      sheep.sprite.x = m.x;
      sheep.sprite.y = m.y;
      sheep.vx = 0;
      sheep.vy = 0;
      return c;
    })()`)) as number;

    await game.advanceTime(200);

    const s = await shepherdState();
    // Default sell price is 10; +2 levels of +5 each → 20 per sale
    expect(s.coins - startCoins).toBeGreaterThanOrEqual(20);
  });

  it("triggers game over when out of money and sheep", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 0;
      gs.updateCoinText();
      for (const s of gs.sheep) s.sprite.destroy();
      gs.sheep = [];
      for (const t of gs.trucks) t.sprite.destroy();
      gs.trucks = [];
    })()`);

    await game.advanceTime(2000);
    const dump = await game.dumpState();
    expect(dump.Shepherd?.active).toBe(false);
    expect(dump.GameOver?.active).toBe(true);
  });

  it("growing baby sheep cannot wander out of the field", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const sheep = gs.spawnSheep();
      const f = gs.dumpState().field;
      sheep.sprite.x = f.x;
      sheep.sprite.y = f.y;
      sheep.vx = 0;
      sheep.vy = 0;
    })()`);

    // Let it enter the field so growthT > 0, then advance partially — it must stay inside
    await game.advanceTime(2000);
    const mid = await shepherdState();
    const f = mid.field;
    const sheep = mid.sheep[0];
    expect(sheep.stage).toBe("baby");
    expect(sheep.x).toBeGreaterThan(f.x - f.w / 2);
    expect(sheep.x).toBeLessThan(f.x + f.w / 2);
    expect(sheep.y).toBeGreaterThan(f.y - f.h / 2);
    expect(sheep.y).toBeLessThan(f.y + f.h / 2);
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
