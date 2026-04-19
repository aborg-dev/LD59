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

  it("herding dog scares a nearby wolf hunting its sheep without leaving", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 200;
      gs.updateCoinText();
      gs.buyDog();

      // Sheep outside the field; dog already positioned between sheep and wolf
      const sheep = gs.spawnSheep();
      sheep.sprite.x = 1200; sheep.sprite.y = 1300;
      sheep.vx = 0; sheep.vy = 0;
      sheep.stage = 'adult'; sheep.growthT = 999;

      const dog = gs.dogs[0];
      dog.mode = 'herding';
      dog.targetSheep = sheep;
      dog.sprite.x = 1140; dog.sprite.y = 1300;
      dog.vx = 0; dog.vy = 0;
      dog.angle = Math.PI; // already facing the wolf

      const wolfSprite = gs.add.image(950, 1300, 'wolf');
      gs.hudCamera.ignore(wolfSprite);
      gs.wolves.push({ sprite: wolfSprite, targetSheep: sheep, vx: 0, vy: 0, angle: 0, scaredMs: 0 });
    })()`);

    await game.advanceTime(1200);

    const result = (await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const dog = gs.dogs[0];
      const wolf = gs.wolves[0];
      return { mode: dog.mode, scaredMs: wolf.scaredMs, sheepLeft: gs.sheep.length };
    })()`)) as { mode: string; scaredMs: number; sheepLeft: number };

    // Dog must stay in herding mode, not switch to defending
    expect(result.mode).toBe("herding");
    // Sheep must still be alive (the whole point of the change)
    expect(result.sheepLeft).toBe(1);
    // Wolf must have been scared at some point
    expect(result.scaredMs).toBeGreaterThan(0);
  });

  it("multiple trucks queue on the road without overlapping", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 1000;
      gs.updateCoinText();
      gs.buySheep();
      gs.buySheep();
      gs.buySheep();
    })()`);

    // Lead truck hits drop zone at ~7.3s; allow 9s so all trucks are spread on the vertical segment
    await game.advanceTime(9000);

    const trucks = (await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      return gs.trucks.map(t => ({ x: t.sprite.x, y: t.sprite.y, state: t.state }));
    })()`)) as { x: number; y: number; state: string }[];

    expect(trucks.length).toBeGreaterThanOrEqual(2);
    const sorted = [...trucks].sort((a, b) => a.y - b.y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].y - sorted[i].y;
      expect(gap).toBeGreaterThanOrEqual(80);
    }
  });

  it("buying a guard dog spawns at a field post and scares nearby wolves", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 200;
      gs.updateCoinText();
      const post = gs.guardPosts()[0];
      gs.spawnGuardDog(post.x, post.y);
    })()`);

    const sAfterBuy = await shepherdState();
    expect(sAfterBuy.dogs.length).toBe(1);

    // Place a wolf adjacent to the guard's post and let it get scared
    const wolfInit = (await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const guard = gs.dogs[0];
      const sprite = gs.add.rectangle(guard.postX + 60, guard.postY, 42, 22, 0x7a1a1a).setDepth(9);
      gs.hudCamera.ignore(sprite);
      gs.wolves.push({ sprite, targetSheep: null, vx: 0, vy: 0, angle: 0, scaredMs: 0 });
      return { x: sprite.x, y: sprite.y };
    })()`)) as { x: number; y: number };

    await game.advanceTime(500);

    const wolfEnd = (await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const w = gs.wolves[0];
      return { x: w.sprite.x, y: w.sprite.y, scaredMs: w.scaredMs };
    })()`)) as { x: number; y: number; scaredMs: number };

    // Wolf should be fleeing (scared) or off in a different position
    const moved =
      Math.hypot(wolfEnd.x - wolfInit.x, wolfEnd.y - wolfInit.y) > 30;
    expect(wolfEnd.scaredMs > 0 || moved).toBe(true);
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

  it("speed upgrade increases the alpha dog's max speed", async () => {
    await game.startScene("Shepherd");

    const before = (await shepherdState()).alphaDogSpeed;
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 1000;
      gs.updateCoinText();
      gs.buySpeedUpgrade();
    })()`);

    const after = await shepherdState();
    expect(after.alphaDogSpeed).toBeGreaterThan(before);
    expect(after.speedUpgradeLevel).toBe(1);
  });

  it("capacity upgrade raises the field's max simultaneously growing sheep", async () => {
    await game.startScene("Shepherd");

    const before = (await shepherdState()).fieldCapacity;
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 1000;
      gs.updateCoinText();
      gs.buyCapacityUpgrade();
    })()`);

    const after = await shepherdState();
    expect(after.fieldCapacity).toBe(before + 1);
    expect(after.capacityUpgradeLevel).toBe(1);
    expect(after.field.capacity).toBe(before + 1);
  });

  it("fence costs $100 and must be purchased to block wolves", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 200;
      gs.updateCoinText();
      gs.buyFence();
    })()`);

    const s = await shepherdState();
    expect(s.coins).toBe(100);
  });

  it("fenced field bounces wolves out; without fence they can enter", async () => {
    // Without fence: wolf placed inside stays inside
    await game.startScene("Shepherd");
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const f = gs.dumpState().field;
      const sprite = gs.add.rectangle(f.x, f.y, 42, 22, 0x7a1a1a).setDepth(9);
      gs.hudCamera.ignore(sprite);
      gs.wolves.push({ sprite, targetSheep: null, vx: 0, vy: 0, angle: 0, scaredMs: 0 });
    })()`);
    await game.advanceTime(100);
    const unfencedInside = (await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const f = gs.dumpState().field;
      const w = gs.wolves[0];
      return w.sprite.x > f.x - f.w / 2 && w.sprite.x < f.x + f.w / 2 &&
             w.sprite.y > f.y - f.h / 2 && w.sprite.y < f.y + f.h / 2;
    })()`)) as boolean;
    expect(unfencedInside).toBe(true);

    // With fence: same wolf is pushed out
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 200;
      gs.updateCoinText();
      gs.buyFence();
      const f = gs.dumpState().field;
      gs.wolves[0].sprite.x = f.x;
      gs.wolves[0].sprite.y = f.y;
    })()`);
    await game.advanceTime(500);
    const fencedInside = (await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const f = gs.dumpState().field;
      const w = gs.wolves[0];
      return w.sprite.x > f.x - f.w / 2 && w.sprite.x < f.x + f.w / 2 &&
             w.sprite.y > f.y - f.h / 2 && w.sprite.y < f.y + f.h / 2;
    })()`)) as boolean;
    expect(fencedInside).toBe(false);
  });

  it("field capacity caps sheep at 3 growing at once", async () => {
    await game.startScene("Shepherd");

    const overflowOutside = await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const f = gs.dumpState().field;
      // Fill the field to capacity
      for (let i = 0; i < 3; i++) {
        const s = gs.spawnSheep();
        s.sprite.x = f.x + (i % 5 - 2) * 50;
        s.sprite.y = f.y + (Math.floor(i / 5) - 0.5) * 50;
        s.vx = 0; s.vy = 0;
        s.growthT = 1; // already growing so it counts toward capacity
      }
      // Add one more baby and drop it in the center — should be bounced out
      const extra = gs.spawnSheep();
      extra.sprite.x = f.x;
      extra.sprite.y = f.y;
      extra.vx = 0; extra.vy = 0;
      extra.growthT = 0;
      return extra;
    })()`);

    await game.advanceTime(100);
    const dump = await shepherdState();
    expect(dump.field.growing).toBe(3);
    // The next baby should end up outside the field
    const extra = dump.sheep[dump.sheep.length - 1];
    const f = dump.field;
    const inside =
      extra.x > f.x - f.w / 2 &&
      extra.x < f.x + f.w / 2 &&
      extra.y > f.y - f.h / 2 &&
      extra.y < f.y + f.h / 2;
    expect(inside).toBe(false);
    expect(overflowOutside).toBeDefined();
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

  it("shearing takes time and pays out when the animation completes", async () => {
    await game.startScene("Shepherd");

    const startCoins = (await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const c = gs.coins;
      const sheep = gs.spawnSheep();
      sheep.stage = 'adult';
      sheep.growthT = 999;
      sheep.sprite.setScale(1);
      gs.attachReadyIcon(sheep);
      const sh = gs.dumpState().shear;
      sheep.sprite.x = sh.x;
      sheep.sprite.y = sh.y;
      sheep.vx = 0;
      sheep.vy = 0;
      return c;
    })()`)) as number;

    // Part-way through — still adult, shrinking, no payout yet
    await game.advanceTime(1000);
    const mid = (await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const s = gs.sheep[0];
      return { stage: s.stage, scale: s.sprite.scaleX, coins: gs.coins };
    })()`)) as { stage: string; scale: number; coins: number };
    expect(mid.stage).toBe("adult");
    expect(mid.scale).toBeLessThan(1);
    expect(mid.scale).toBeGreaterThan(0.5);
    expect(mid.coins).toBe(startCoins);

    // Complete the shear
    await game.advanceTime(4000);
    const s = await shepherdState();
    expect(s.coins).toBeGreaterThan(startCoins);
    expect(s.sheep[0].stage).toBe("baby");
    expect(s.sheep[0].growthT).toBe(0);
  });

  it("adults being sheared are confined to the shed until done", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const sheep = gs.spawnSheep();
      sheep.stage = 'adult';
      sheep.growthT = 999;
      sheep.sprite.setScale(1);
      const sh = gs.dumpState().shear;
      sheep.sprite.x = sh.x;
      sheep.sprite.y = sh.y;
      sheep.vx = 0; sheep.vy = 0;
    })()`);

    // Kick shearing off so containment applies, then try to launch the sheep away
    await game.advanceTime(200);
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const s = gs.sheep[0];
      s.vx = 600;
      s.vy = 600;
    })()`);
    await game.advanceTime(600);

    const result = (await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const s = gs.sheep[0];
      const sh = gs.dumpState().shear;
      const inside =
        s.sprite.x > sh.x - sh.w / 2 && s.sprite.x < sh.x + sh.w / 2 &&
        s.sprite.y > sh.y - sh.h / 2 && s.sprite.y < sh.y + sh.h / 2;
      return { inside, shearT: s.shearT };
    })()`)) as { inside: boolean; shearT: number };

    expect(result.inside).toBe(true);
    expect(result.shearT).toBeGreaterThan(0);
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

    // Market sale is delayed 5-10s; wait past the upper bound
    await game.advanceTime(11000);

    const s = await shepherdState();
    expect(s.score).toBeGreaterThanOrEqual(1);
    expect(s.coins).toBeGreaterThan(startCoins);
  });
});
