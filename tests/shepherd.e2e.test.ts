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
      s.angle = 0; // already facing +x so the turn-rate limit doesn't block
      s.wanderAngle = 0;
      s.modeT = 999;
      s.grazing = true;
    })()`);

    const before = (await shepherdState()).sheep.at(-1);
    if (!before) throw new Error("no sheep");

    // Whistle at (150, 400) — sheep at 200 should be shoved further right.
    await game.eval_(`(() => {
      window.game.scene.getScene('Shepherd').whistle(150, 400);
    })()`);
    await game.advanceTime(50);

    const after = (await shepherdState()).sheep.at(-1);
    if (!after) throw new Error("no sheep");
    expect(after.x).toBeGreaterThan(before.x);
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
