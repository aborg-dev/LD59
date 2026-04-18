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

describe("shepherd wave-based herding", () => {
  it("starts in prep and transitions to active, spawning wave sheep", async () => {
    await game.startScene("Shepherd");
    const initial = await shepherdState();
    expect(initial.wave.phase).toBe("prep");
    expect(initial.wave.number).toBe(1);
    expect(initial.sheep.length).toBe(0);

    // 5s prep + 2s active → some sheep should have spawned
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

  it("bark pushes nearby sheep away from dog", async () => {
    await game.startScene("Shepherd");

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
    expect(after.x).toBeGreaterThan(before.x);
  });

  it("places a whistle tower and pushes sheep toward the pen", async () => {
    await game.startScene("Shepherd");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      for (const s of gs.sheep) s.sprite.destroy();
      gs.sheep = [];
      gs.coins = 10;
      gs.buildMode = true;
      const tx = gs.penX + gs.penR + 60;
      const ty = gs.penY;
      gs.tryPlaceTower(tx, ty);
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
      gs.towers[0].pulseMs = 999999;
    })()`);

    const st0 = await shepherdState();
    expect(st0.towers.length).toBe(1);
    expect(st0.coins).toBe(7);

    const sheepBefore = st0.sheep.at(-1);
    if (!sheepBefore) throw new Error("no sheep");

    await game.advanceTime(100);

    const sheepAfter = (await shepherdState()).sheep.at(-1);
    if (!sheepAfter) throw new Error("no sheep");
    expect(sheepAfter.x).toBeLessThan(sheepBefore.x);
  });

  it("clearing a wave advances wave number and awards coin bonus", async () => {
    await game.startScene("Shepherd");

    // Jump into active phase with a single unpenned sheep inside the pen,
    // so the wave clears on the next physics step.
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
    // 1 coin from penning + 3 wave-clear bonus
    expect(s.coins).toBeGreaterThanOrEqual(4);
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
      gs.spawnSheep();           // one sheep, unpenned, at a random edge
      gs.phaseTimeLeftMs = 40;   // about to expire
    })()`);
    await game.advanceTime(200);

    const dump = await game.dumpState();
    expect(dump.GameOver?.active).toBe(true);
    expect(typeof dump.GameOver?.finalScore).toBe("number");
  });
});
