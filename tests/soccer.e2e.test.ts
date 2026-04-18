import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SoccerSceneState } from "../tools/game.js";
import * as game from "../tools/game.js";

const URL = process.env.TEST_URL || "http://localhost:5173";

async function soccerState(): Promise<SoccerSceneState> {
  const dump = await game.dumpState();
  if (!dump.Soccer) throw new Error("Soccer scene not initialized");
  return dump.Soccer;
}

beforeAll(async () => {
  await game.launch(URL);
});

afterAll(async () => {
  await game.close();
});

describe("soccer scoring and game end", () => {
  it("scores and shows correct score on game end", async () => {
    await game.startScene("Soccer");

    // Place ball above the keeper and push it through the goal zone
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Soccer');
      gs.ball.y = gs.goalY + gs.goalH * 0.5;
      gs.velocityY = -300;
    })()`);
    await game.advanceTime(2000);

    const s = await soccerState();
    expect(s.score).toBeGreaterThanOrEqual(1);

    // Expire the timer
    await game.advanceTime(s.timeLeft * 1000);

    const dump = await game.dumpState();
    expect(dump.GameOver?.active).toBe(true);
    expect(dump.GameOver?.finalScore).toBe(s.score);
  });

  it("scores on a high-speed fling into the goal", async () => {
    await game.startScene("Soccer");

    // Set high upward velocity with angle to beat keeper and test that
    // fast-moving ball still registers a goal (swept collision detection)
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Soccer');
      gs.velocityX = 600;
      gs.velocityY = -5000;
    })()`);
    await game.advanceTime(2000);

    const s = await soccerState();
    expect(s.score).toBeGreaterThanOrEqual(1);
  });
});
