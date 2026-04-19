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
  it("starts in prep with 3 deployed dogs and no sheep", async () => {
    await game.startScene("Shepherd");
    const initial = await shepherdState();
    expect(initial.wave.phase).toBe("prep");
    expect(initial.wave.number).toBe(1);
    expect(initial.sheep.length).toBe(0);
    expect(initial.aiDogs.length).toBe(3);
    expect(initial.coins).toBe(0);
    expect(initial.nextDogCost).toBeGreaterThan(0);

    await game.advanceTime(7000);
    const active = await shepherdState();
    expect(active.wave.phase).toBe("active");
    expect(active.sheep.length).toBeGreaterThan(0);
  });

  it("penning a sheep increments score and coins", async () => {
    await game.startScene("Shepherd");

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

  it("whistle pushes nearby sheep away from the click point", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      for (const s of gs.sheep) s.sprite.destroy();
      gs.sheep = [];
      gs.spawnSheep();
      const s = gs.sheep[gs.sheep.length - 1];
      s.sprite.x = 200;
      s.sprite.y = 400;
      s.vx = 0;
      s.vy = 0;
      s.angle = 0;
      s.wanderAngle = 0;
      s.modeT = 999;
      s.grazing = true;
    })()`);

    const before = (await shepherdState()).sheep.at(-1);
    if (!before) throw new Error("no sheep");

    // Bark at (150, 400) — sheep at 200 should be shoved further right.
    await game.eval_(`(() => {
      window.game.scene.getScene('Shepherd').whistle(150, 400);
    })()`);
    await game.advanceTime(50);

    const after = (await shepherdState()).sheep.at(-1);
    if (!after) throw new Error("no sheep");
    expect(after.x).toBeGreaterThan(before.x);
  });

  it("buying a dog costs coins and spawns an AI dog", async () => {
    await game.startScene("Shepherd");

    const result = await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.coins = 50;
      const before = gs.dumpState().nextDogCost;
      const ok = gs.tryBuyDog();
      const after = gs.dumpState();
      return { ok, before, coins: after.coins, dogs: after.aiDogs.length, nextCost: after.nextDogCost };
    })()`);
    const r = result as {
      ok: boolean;
      before: number;
      coins: number;
      dogs: number;
      nextCost: number;
    };
    expect(r.ok).toBe(true);
    // 3 starter dogs + 1 just bought.
    expect(r.dogs).toBe(4);
    expect(r.coins).toBe(50 - r.before);
    // Cost grows once we're past the free starters.
    expect(r.nextCost).toBeGreaterThan(r.before);
  });

  it("an AI dog herds a sheep toward the pen", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      for (const s of gs.sheep) s.sprite.destroy();
      gs.sheep = [];
      // One sheep parked east of the pen.
      gs.spawnSheep();
      const s = gs.sheep[0];
      s.sprite.x = gs.penX + 240;
      s.sprite.y = gs.penY;
      s.vx = 0;
      s.vy = 0;
      s.angle = Math.PI; // facing west, toward the pen
      s.wanderAngle = Math.PI;
      s.modeT = 999;
      s.grazing = true;
      // Park the starter dogs east/north/south of the sheep so flee pushes west.
      gs.aiDogs[0].sprite.x = gs.penX + 380;
      gs.aiDogs[0].sprite.y = gs.penY;
      // Tuck the other starters far away so they don't interfere.
      for (let i = 1; i < gs.aiDogs.length; i++) {
        gs.aiDogs[i].sprite.x = 40;
        gs.aiDogs[i].sprite.y = 40;
      }
    })()`);

    const before = (await shepherdState()).sheep[0];
    await game.advanceTime(1500);
    const after = (await shepherdState()).sheep[0];
    if (!before || !after) throw new Error("sheep missing");
    // Sheep should have moved west (closer to the pen).
    const beforeDist = Math.hypot(before.x - 640, before.y - 295);
    const afterDist = Math.hypot(after.x - 640, after.y - 295);
    expect(afterDist).toBeLessThan(beforeDist);
  });

  it("clearing a wave advances wave number and awards coin bonus", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      for (const s of gs.sheep) s.sprite.destroy();
      gs.sheep = [];
      gs.wavePhase = 'active';
      gs.waveSize = 1;
      gs.sheepToSpawn = 0;
      gs.phaseTimeLeftMs = 30000;
      gs.spawnSheep();
      const s = gs.sheep[gs.sheep.length - 1];
      s.sprite.x = gs.penX;
      s.sprite.y = gs.penY;
      s.vx = 0;
      s.vy = 0;
    })()`);
    await game.advanceTime(50);

    const s = await shepherdState();
    expect(s.wave.number).toBe(2);
    expect(s.wave.phase).toBe("prep");
    expect(s.coins).toBeGreaterThanOrEqual(4);
  });

  it("a wolf eats a sheep when no dogs are nearby", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      // Move the starter dogs far away so they don't scare the wolf.
      for (const d of gs.aiDogs) {
        d.sprite.x = 40;
        d.sprite.y = 40;
      }
      // One sheep parked east of the pen.
      for (const s of gs.sheep) s.sprite.destroy();
      gs.sheep = [];
      gs.spawnSheep();
      const s = gs.sheep[0];
      s.sprite.x = gs.penX + 240;
      s.sprite.y = gs.penY;
      s.vx = 0;
      s.vy = 0;
      s.angle = 0;
      s.modeT = 999;
      s.grazing = true;
      // Spawn a wolf right next to the sheep.
      gs.spawnWolf();
      const w = gs.wolves[gs.wolves.length - 1];
      w.sprite.x = gs.penX + 220;
      w.sprite.y = gs.penY;
      w.retreatMs = 0;
    })()`);

    await game.advanceTime(800);

    const dump = await shepherdState();
    // The sheep should be eaten.
    expect(dump.sheep.length).toBe(0);
    // Wolf is now retreating (or already despawned).
    if (dump.wolves.length > 0) {
      expect(dump.wolves[0].retreating).toBe(true);
    }
  });

  it("a dog scares a wolf away from the flock", async () => {
    await game.startScene("Shepherd");

    const result = await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      // Park a wolf next to a dog. The wolf should be flushed away.
      for (const d of gs.aiDogs) { d.sprite.x = 40; d.sprite.y = 40; }
      gs.aiDogs[0].sprite.x = gs.penX;
      gs.aiDogs[0].sprite.y = gs.penY;
      gs.spawnWolf();
      const w = gs.wolves[gs.wolves.length - 1];
      w.sprite.x = gs.penX + 80;
      w.sprite.y = gs.penY;
      w.retreatMs = 0;
      return { x: w.sprite.x, dogX: gs.aiDogs[0].sprite.x };
    })()`);
    const before = result as { x: number; dogX: number };

    await game.advanceTime(400);

    const dump = await shepherdState();
    // Either the wolf has been pushed eastward (away from the dog) or it has
    // already left the field.
    if (dump.wolves.length > 0) {
      const w = dump.wolves[0];
      expect(w.x).toBeGreaterThan(before.x);
      expect(w.retreating).toBe(true);
    }
  });

  it("ends game when wave timer expires with unpenned sheep", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      for (const s of gs.sheep) s.sprite.destroy();
      gs.sheep = [];
      gs.wavePhase = 'active';
      gs.waveSize = 1;
      gs.sheepToSpawn = 0;
      gs.spawnSheep();
      gs.phaseTimeLeftMs = 40;
    })()`);
    await game.advanceTime(200);

    const dump = await game.dumpState();
    expect(dump.GameOver?.active).toBe(true);
    expect(typeof dump.GameOver?.finalScore).toBe("number");
  });
});
