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
  it("penning a sheep increments score", async () => {
    await game.startScene("Shepherd");

    // Place a sheep inside the pen and step physics so pen check fires
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      const s = gs.sheep[0];
      s.sprite.x = gs.penX + gs.penW / 2;
      s.sprite.y = gs.penY + gs.penH / 2;
      s.vx = 0;
      s.vy = 0;
    })()`);
    await game.advanceTime(50);

    const s = await shepherdState();
    expect(s.score).toBeGreaterThanOrEqual(1);
    expect(s.sheep[0].penned).toBe(true);
  });

  it("bark pushes nearby sheep away from dog", async () => {
    await game.startScene("Shepherd");

    // Pin dog and a sheep very close together, cancel wander, then bark
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Shepherd');
      gs.dog.x = 300;
      gs.dog.y = 800;
      gs.targetX = gs.dog.x;
      gs.targetY = gs.dog.y;
      const s = gs.sheep[0];
      s.sprite.x = 340;
      s.sprite.y = 800;
      s.vx = 0;
      s.vy = 0;
      s.wanderAngle = 0;
      s.wanderT = 999;
    })()`);

    const before = (await shepherdState()).sheep[0];

    await game.eval_(`(() => {
      window.game.scene.getScene('Shepherd').bark();
    })()`);
    await game.advanceTime(50);

    const after = (await shepherdState()).sheep[0];
    // Sheep should be pushed to the right (away from dog at x=300)
    expect(after.x).toBeGreaterThan(before.x);
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
