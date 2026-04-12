import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { GameSceneState } from "../tools/game.js";
import * as game from "../tools/game.js";

const URL = process.env.TEST_URL || "http://localhost:5173";

async function gameState(): Promise<GameSceneState> {
  return (await game.dumpState()).GameScene;
}

beforeAll(async () => {
  await game.launch(URL);
});

afterAll(async () => {
  await game.close();
});

beforeEach(async () => {
  await game.resetGame();
});

describe("game e2e", () => {
  it("loads and renders correctly", async () => {
    expect(game.errors()).toEqual([]);
    expect(await game.hasCanvas()).toBe(true);
    expect(await game.isGameRunning()).toBe(true);
    expect(await game.sceneCount()).toBeGreaterThan(0);
  });

  it("ball is draggable", async () => {
    const before = await gameState();
    await game.drag(
      before.ball.x,
      before.ball.y,
      before.ball.x + 100,
      before.ball.y + 100,
    );
    const after = await gameState();

    expect(after.ball.x).toBeGreaterThan(before.ball.x);
    expect(after.ball.y).toBeGreaterThan(before.ball.y);
  });
});

describe("ball stays within bounds", () => {
  it("does not go past the bottom edge when dragged down", async () => {
    const before = await gameState();
    await game.drag(
      before.ball.x,
      before.ball.y,
      before.ball.x,
      before.viewport.height + 100,
    );
    const after = await gameState();
    expect(after.ball.y + after.ball.radius).toBeLessThanOrEqual(
      after.viewport.height,
    );
  });

  it("does not go past the right edge when dragged right", async () => {
    const before = await gameState();
    await game.drag(
      before.ball.x,
      before.ball.y,
      before.viewport.width + 100,
      before.ball.y,
    );
    const after = await gameState();
    expect(after.ball.x + after.ball.radius).toBeLessThanOrEqual(
      after.viewport.width,
    );
  });

  it("does not go past the top edge when dragged up", async () => {
    const before = await gameState();
    await game.drag(before.ball.x, before.ball.y, before.ball.x, -100);
    const after = await gameState();
    expect(after.ball.y - after.ball.radius).toBeGreaterThanOrEqual(0);
  });

  it("does not go past the left edge when dragged left", async () => {
    const before = await gameState();
    await game.drag(before.ball.x, before.ball.y, -100, before.ball.y);
    const after = await gameState();
    expect(after.ball.x - after.ball.radius).toBeGreaterThanOrEqual(0);
  });

  it("stays in bounds after fast fling into wall", async () => {
    const c = await gameState();
    await game.drag(c.ball.x, c.ball.y, c.ball.x + 150, c.ball.y + 150, 50);
    await game.advanceTime(167);

    const after = await gameState();
    expect(after.ball.x - after.ball.radius).toBeGreaterThanOrEqual(0);
    expect(after.ball.y - after.ball.radius).toBeGreaterThanOrEqual(0);
    expect(after.ball.x + after.ball.radius).toBeLessThanOrEqual(
      after.viewport.width,
    );
    expect(after.ball.y + after.ball.radius).toBeLessThanOrEqual(
      after.viewport.height,
    );
  });

  it("stays in bounds after high-velocity fling", async () => {
    await game.setVelocity(5000, 5000);
    await game.advanceTime(1000);

    const s = await gameState();
    expect(s.ball.x - s.ball.radius).toBeGreaterThanOrEqual(0);
    expect(s.ball.y - s.ball.radius).toBeGreaterThanOrEqual(0);
    expect(s.ball.x + s.ball.radius).toBeLessThanOrEqual(s.viewport.width);
    expect(s.ball.y + s.ball.radius).toBeLessThanOrEqual(s.viewport.height);
  });

  it("velocity decays with friction", async () => {
    await game.setVelocity(1000, 1000);
    await game.advanceTime(5000);

    const s = await gameState();
    expect(Math.abs(s.velocity.x)).toBeLessThan(5);
    expect(Math.abs(s.velocity.y)).toBeLessThan(5);
  });
});

describe("scoring and game end", () => {
  it("scores when ball passes through hoop", async () => {
    // Place ball just below the hoop and fling upward
    await game.eval_(`(() => {
      const gs = window.gameScene();
      gs.ball.x = gs.hoop.x;
      gs.ball.y = gs.hoop.y + 80;
      gs.ball.setVisible(true);
    })()`);
    await game.setVelocity(0, -500);
    await game.advanceTime(300);

    const s = await gameState();
    expect(s.score).toBeGreaterThanOrEqual(1);
  });

  it("shows correct score on game end screen", async () => {
    // Set a known score and expire the timer
    await game.eval_("window.gameScene().score = 5");
    await game.eval_("window.gameScene().timeLeft = 1");
    await game.advanceTime(1100);

    const dump = await game.dumpState();
    expect(dump.GameOver.active).toBe(true);
    expect(dump.GameOver.finalScore).toBe(5);
  });
});
