import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ShepherdSceneState } from "../tools/game.js";
import * as game from "../tools/game.js";

const URL = process.env.TEST_URL || "http://localhost:5173";

async function shepherdState(): Promise<ShepherdSceneState> {
  const dump = await game.dumpState();
  if (!dump.Shepherd) throw new Error("Shepherd scene not initialized");
  return dump.Shepherd;
}

async function resetScene(): Promise<void> {
  // Stop any prior GameOver or Shepherd instance so state doesn't leak
  // between tests (particularly the init() data).
  await game.eval_(`(() => {
    const sm = window.game.scene;
    try { sm.stop('GameOver'); } catch {}
    try { sm.stop('Shepherd'); } catch {}
    sm.start('Shepherd');
  })()`);
  // Give the SceneManager enough ticks to process stop→start and run create.
  await game.advanceTime(50);
}

beforeAll(async () => {
  await game.launch(URL);
});

afterAll(async () => {
  await game.close();
});

describe("shepherd journey", () => {
  it("boots with 12 sheep at the farm", async () => {
    await resetScene();
    const s = await shepherdState();
    expect(s.sheep.length).toBe(12);
    for (const sh of s.sheep) {
      expect(sh.x).toBeLessThan(200);
      expect(sh.home).toBe(false);
      expect(sh.falling).toBe(false);
    }
    expect(s.sheepHome).toBe(0);
    expect(s.sheepLost).toBe(0);
  });

  it("dog movement advances the herd out of the farm", async () => {
    await resetScene();

    // Put the dog west of the flock, target far to the east, so flee pushes
    // every sheep eastward out of the farm rather than splitting the herd.
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.dogObj.x = 10;
      gs.dogObj.y = 360;
      gs.targetX = 800;
      gs.targetY = 360;
    })()`);
    await game.advanceTime(5000);

    const s = await shepherdState();
    const advanced = s.sheep.filter((sh) => sh.x > 180).length;
    expect(advanced).toBeGreaterThanOrEqual(6);
  });

  it("whistle pushes a nearby sheep away from the whistle point", async () => {
    await resetScene();

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      // Remove all but one sheep, and park it at a known spot.
      while (gs.sheep.length > 1) {
        const s = gs.sheep.pop();
        s.sprite.destroy();
      }
      const s = gs.sheep[0];
      s.sprite.x = 400;
      s.sprite.y = 400;
      s.vx = 0;
      s.vy = 0;
      s.angle = 0;
      s.modeT = 999;
      s.grazing = true;
      s.scaredMs = 0;
      s.home = false;
      s.falling = false;
    })()`);

    const before = (await shepherdState()).sheep[0];

    await game.eval_(`(() => {
      window.game.scene.getScene('Shepherd').whistle(350, 400);
    })()`);
    await game.advanceTime(80);

    const after = (await shepherdState()).sheep[0];
    expect(after.x).toBeGreaterThan(before.x + 2);
  });

  it("bridge teeter zone slows a sheep below plank speed", async () => {
    await resetScene();

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      while (gs.sheep.length > 1) {
        const s = gs.sheep.pop();
        s.sprite.destroy();
      }
      const s = gs.sheep[0];
      s.sprite.x = 2700;  // mid-bridge
      s.sprite.y = 280;   // teeter zone top
      s.vx = 80;
      s.vy = 0;
      s.angle = 0;
      s.modeT = 999;
      s.grazing = true;
      s.home = false;
      s.falling = false;
      s.teeterMs = 0;
    })()`);

    await game.advanceTime(200);

    const s = (await shepherdState()).sheep[0];
    const spd = Math.hypot(
      // The dump doesn't expose vx/vy; speed is approximated by the clamp
      // the bridge section enforces, so we verify position hasn't drifted far.
      s.x - 2700,
      0,
    );
    // Teeter clamp is 14 px/s, so after 0.2s the sheep moved at most ~3 px.
    expect(spd).toBeLessThan(15);
  });

  it("bridge fall zone removes the sheep and increments sheepLost", async () => {
    await resetScene();

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      while (gs.sheep.length > 1) {
        const s = gs.sheep.pop();
        s.sprite.destroy();
      }
      const s = gs.sheep[0];
      s.sprite.x = 2700;
      s.sprite.y = 250;  // fall zone (< 265)
      s.vx = 0;
      s.vy = 0;
      s.angle = 0;
      s.modeT = 999;
      s.grazing = true;
      s.home = false;
      s.falling = false;
    })()`);

    await game.advanceTime(1500);

    const s = await shepherdState();
    expect(s.sheepLost).toBeGreaterThanOrEqual(1);
  });

  it("barking on the bridge scatters non-targeted neighbours laterally", async () => {
    await resetScene();

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      while (gs.sheep.length > 0) {
        const s = gs.sheep.pop();
        s.sprite.destroy();
      }
      // spawn two sheep on the plank centre
      gs.spawnSheep(2600, 360, null);
      gs.spawnSheep(2700, 360, null);
      for (const s of gs.sheep) {
        s.vx = 0;
        s.vy = 0;
        s.angle = 0;
        s.modeT = 999;
        s.grazing = true;
      }
    })()`);

    // Whistle slightly east of sheep1 so sheep1 is the nearest (targeted).
    await game.eval_(`(() => {
      window.game.scene.getScene('Shepherd').whistle(2580, 360);
    })()`);
    await game.advanceTime(300);

    const dump = await shepherdState();
    // Sheep were pushed in order: sheep1 at 2600, sheep2 at 2700. Index 1 is
    // the non-targeted one that should have been scattered.
    expect(dump.sheep.length).toBe(2);
    const sheep2 = dump.sheep[1];
    expect(Math.abs(sheep2.y - 360)).toBeGreaterThan(6);
  });

  it("reaching the barn triggers GameOver with the right medal", async () => {
    await resetScene();

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const gx = gs.dumpState().goalX;
      for (const s of gs.sheep) {
        s.sprite.x = gx + 40;
        s.sprite.y = 360;
        s.vx = 0;
        s.vy = 0;
        s.angle = 0;
        s.wanderAngle = 0;
        s.grazing = true;
        s.modeT = 999;
      }
    })()`);
    await game.advanceTime(200);

    const dump = await game.dumpState();
    expect(dump.GameOver?.active).toBe(true);
    expect(dump.GameOver?.finalScore).toBe(12);
    expect(dump.GameOver?.medal).toBe("perfect");
  });
});
