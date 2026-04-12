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

describe("game e2e", () => {
  it("loads without errors", () => {
    expect(game.errors()).toEqual([]);
  });

  it("renders the game canvas", async () => {
    expect(await game.hasCanvas()).toBe(true);
  });

  it("creates a Phaser game instance", async () => {
    expect(await game.isGameRunning()).toBe(true);
  });

  it("has an active scene", async () => {
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
  beforeEach(async () => {
    await game.resetBall();
  });

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
