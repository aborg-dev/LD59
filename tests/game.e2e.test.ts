import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as game from '../tools/game.js';

const URL = process.env.TEST_URL || 'http://localhost:5173';

beforeAll(async () => {
  await game.launch(URL);
});

afterAll(async () => {
  await game.close();
});

describe('game e2e', () => {
  it('loads without errors', () => {
    expect(game.errors()).toEqual([]);
  });

  it('renders the game canvas', async () => {
    expect(await game.hasCanvas()).toBe(true);
  });

  it('creates a Phaser game instance', async () => {
    expect(await game.isGameRunning()).toBe(true);
  });

  it('has an active scene', async () => {
    expect(await game.sceneCount()).toBeGreaterThan(0);
  });

  it('circle is draggable', async () => {
    const before = await game.getCircle();
    await game.drag(before.x, before.y, before.x + 100, before.y + 100);
    const after = await game.getCircle();

    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
  });
});

describe('ball stays within bounds', () => {
  beforeEach(async () => {
    await game.resetCircle();
  });

  it('does not go past the bottom edge when dragged down', async () => {
    const before = await game.getCircle();
    await game.drag(before.x, before.y, before.x, before.gameHeight + 100);
    const after = await game.getCircle();
    expect(after.y + after.radius).toBeLessThanOrEqual(after.gameHeight);
  });

  it('does not go past the right edge when dragged right', async () => {
    const before = await game.getCircle();
    await game.drag(before.x, before.y, before.gameWidth + 100, before.y);
    const after = await game.getCircle();
    expect(after.x + after.radius).toBeLessThanOrEqual(after.gameWidth);
  });

  it('does not go past the top edge when dragged up', async () => {
    const before = await game.getCircle();
    await game.drag(before.x, before.y, before.x, -100);
    const after = await game.getCircle();
    expect(after.y - after.radius).toBeGreaterThanOrEqual(0);
  });

  it('does not go past the left edge when dragged left', async () => {
    const before = await game.getCircle();
    await game.drag(before.x, before.y, -100, before.y);
    const after = await game.getCircle();
    expect(after.x - after.radius).toBeGreaterThanOrEqual(0);
  });

  it('stays in bounds after fast fling into wall', async () => {
    const c = await game.getCircle();
    await game.drag(c.x, c.y, c.x + 150, c.y + 150, 50);
    await game.stepFrames(10);

    const after = await game.getCircle();
    expect(after.x - after.radius).toBeGreaterThanOrEqual(0);
    expect(after.y - after.radius).toBeGreaterThanOrEqual(0);
    expect(after.x + after.radius).toBeLessThanOrEqual(after.gameWidth);
    expect(after.y + after.radius).toBeLessThanOrEqual(after.gameHeight);
  });
});
