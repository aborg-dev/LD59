import { describe, it, expect, afterAll } from 'vitest';
import * as browser from '../tools/browser.js';

const URL = 'http://localhost:5173';

afterAll(async () => {
  await browser.closeBrowser();
});

describe('ball stays within bounds', () => {
  it('does not go past the bottom edge when dragged down', async () => {
    const pg = await browser.getPage(URL, 480, 720);
    await pg.waitForTimeout(2000);

    // Get circle position and game dimensions
    const before = await pg.evaluate(() => {
      const scene = (window as any).game.scene.scenes[0];
      const circle = scene.children.list.find((o: any) => o.type === 'Arc');
      return {
        x: circle.x,
        y: circle.y,
        radius: circle.radius,
        gameWidth: scene.scale.width,
        gameHeight: scene.scale.height,
      };
    });

    // Drag the circle to the very bottom of the screen
    await browser.interact([
      { type: 'drag', x: before.x, y: before.y, toX: before.x, toY: before.gameHeight + 100, duration: 300 },
    ], { url: URL, delay: 500 });

    const after = await pg.evaluate(() => {
      const scene = (window as any).game.scene.scenes[0];
      const circle = scene.children.list.find((o: any) => o.type === 'Arc');
      return {
        x: circle.x,
        y: circle.y,
        radius: circle.radius,
        gameHeight: scene.scale.height,
      };
    });

    expect(after.y + after.radius).toBeLessThanOrEqual(after.gameHeight);
  });

  it('does not go past the right edge when dragged right', async () => {
    const before = await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); return { x: c.x, y: c.y, radius: c.radius, gameWidth: s.scale.width }; })()',
      { url: URL, delay: 500 },
    );

    await browser.interact([
      { type: 'drag', x: before.x, y: before.y, toX: before.gameWidth + 100, toY: before.y, duration: 300 },
    ], { url: URL, delay: 500 });

    const after = await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); return { x: c.x, radius: c.radius, gameWidth: s.scale.width }; })()',
      { url: URL, delay: 500 },
    );

    expect(after.x + after.radius).toBeLessThanOrEqual(after.gameWidth);
  });

  it('does not go past the top edge when dragged up', async () => {
    // Reset to center first
    await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); c.x = s.scale.width / 2; c.y = s.scale.height / 2; })()',
      { url: URL, delay: 500 },
    );

    const before = await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); return { x: c.x, y: c.y, radius: c.radius }; })()',
      { url: URL, delay: 200 },
    );

    await browser.interact([
      { type: 'drag', x: before.x, y: before.y, toX: before.x, toY: -100, duration: 300 },
    ], { url: URL, delay: 500 });

    const after = await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); return { y: c.y, radius: c.radius }; })()',
      { url: URL, delay: 500 },
    );

    expect(after.y - after.radius).toBeGreaterThanOrEqual(0);
  });

  it('does not go past the left edge when dragged left', async () => {
    await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); c.x = s.scale.width / 2; c.y = s.scale.height / 2; })()',
      { url: URL, delay: 500 },
    );

    const before = await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); return { x: c.x, y: c.y, radius: c.radius }; })()',
      { url: URL, delay: 200 },
    );

    await browser.interact([
      { type: 'drag', x: before.x, y: before.y, toX: -100, toY: before.y, duration: 300 },
    ], { url: URL, delay: 500 });

    const after = await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); return { x: c.x, radius: c.radius }; })()',
      { url: URL, delay: 500 },
    );

    expect(after.x - after.radius).toBeGreaterThanOrEqual(0);
  });

  it('stays in bounds after fast fling into wall', async () => {
    await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); c.x = s.scale.width / 2; c.y = s.scale.height / 2; })()',
      { url: URL, delay: 500 },
    );

    const center = await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); return { x: c.x, y: c.y, radius: c.radius, gameWidth: s.scale.width, gameHeight: s.scale.height }; })()',
      { url: URL, delay: 200 },
    );

    // Fast fling toward bottom-right
    await browser.interact([
      { type: 'drag', x: center.x, y: center.y, toX: center.x + 150, toY: center.y + 150, duration: 50 },
      { type: 'wait', duration: 2000 },
    ], { url: URL, delay: 500 });

    const after = await browser.evaluate(
      '(() => { const s = window.game.scene.scenes[0]; const c = s.children.list.find(o => o.type === "Arc"); return { x: c.x, y: c.y, radius: c.radius, gameWidth: s.scale.width, gameHeight: s.scale.height }; })()',
      { url: URL, delay: 200 },
    );

    expect(after.x - after.radius).toBeGreaterThanOrEqual(0);
    expect(after.y - after.radius).toBeGreaterThanOrEqual(0);
    expect(after.x + after.radius).toBeLessThanOrEqual(after.gameWidth);
    expect(after.y + after.radius).toBeLessThanOrEqual(after.gameHeight);
  });
});
