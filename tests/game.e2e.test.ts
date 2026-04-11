import { describe, it, expect, afterAll } from 'vitest';
import * as browser from '../tools/browser.js';

const URL = 'http://localhost:5173';

afterAll(async () => {
  await browser.closeBrowser();
});

describe('game e2e', () => {
  it('loads without errors', async () => {
    const { errors } = await browser.consoleLogs({ url: URL, delay: 2000, reload: true });
    expect(errors).toEqual([]);
  });

  it('renders the game canvas', async () => {
    const hasCanvas = await browser.evaluate(
      'document.querySelector("canvas") !== null',
      { url: URL },
    );
    expect(hasCanvas).toBe(true);
  });

  it('creates a Phaser game instance', async () => {
    const isPhaser = await browser.evaluate(
      'window.game?.constructor?.name === "Game"',
      { url: URL },
    );
    expect(isPhaser).toBe(true);
  });

  it('has an active scene', async () => {
    const sceneCount = await browser.evaluate(
      'window.game?.scene?.scenes?.length',
      { url: URL },
    );
    expect(sceneCount).toBeGreaterThan(0);
  });

  it('circle is draggable', async () => {
    const before = await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); return { x: c.x, y: c.y }; })()',
      { url: URL },
    );

    await browser.interact([
      { type: 'drag', x: before.x, y: before.y, toX: before.x + 100, toY: before.y + 100, duration: 300 },
    ], { url: URL });

    const after = await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); return { x: c.x, y: c.y }; })()',
      { url: URL, delay: 500 },
    );

    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
  });
});
