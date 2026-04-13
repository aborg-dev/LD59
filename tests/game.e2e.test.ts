import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GameSceneState } from "../tools/game.js";
import * as game from "../tools/game.js";

const URL = process.env.TEST_URL || "http://localhost:5173";

async function gameState(): Promise<GameSceneState> {
  const dump = await game.dumpState();
  if (!dump.GameScene) throw new Error("GameScene not initialized");
  return dump.GameScene;
}

beforeAll(async () => {
  await game.launch(URL);
});

afterAll(async () => {
  await game.close();
});

describe("game e2e", () => {
  it("loads without errors", async () => {
    expect(game.errors()).toEqual([]);
    const dump = await game.dumpState();
    expect(dump.MainMenu?.active).toBe(true);
  });
});

describe("scoring and game end", () => {
  it("scores and shows correct score on game end", async () => {
    await game.startScene("GameScene");

    // Kick ball upward toward the goal
    await game.eval_("window.gameScene().velocityY = -1500");
    await game.advanceTime(2000);

    const s = await gameState();
    expect(s.score).toBeGreaterThanOrEqual(1);

    // Expire the timer
    await game.advanceTime(s.timeLeft * 1000);

    const dump = await game.dumpState();
    expect(dump.GameOver?.active).toBe(true);
    expect(dump.GameOver?.finalScore).toBe(s.score);
  });

  it("scores on a high-speed fling into the goal", async () => {
    await game.startScene("GameScene");

    // Set high upward velocity directly to test that fast-moving ball
    // still registers a goal (swept collision detection)
    await game.eval_(`(() => {
      const gs = window.gameScene();
      gs.velocityY = -5000;
    })()`);
    await game.advanceTime(2000);

    const s = await gameState();
    expect(s.score).toBeGreaterThanOrEqual(1);
  });
});
