import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TowerSceneState } from "../tools/game.js";
import * as game from "../tools/game.js";

const URL = process.env.TEST_URL || "http://localhost:5173";

async function towerState(): Promise<TowerSceneState> {
  const dump = await game.dumpState();
  if (!dump.Tower) throw new Error("Tower scene not initialized");
  return dump.Tower;
}

beforeAll(async () => {
  await game.launch(URL);
});

afterAll(async () => {
  await game.close();
});

describe("tower puzzle placement and connectivity", () => {
  it("loads level 0 with no towers and no connection", async () => {
    await game.startScene("Tower");
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.levelIndex).toBe(0);
    expect(s.levelCount).toBeGreaterThanOrEqual(1);
    expect(s.towers.length).toBe(0);
    expect(s.connected).toBe(false);
  });

  it("places a relay tower via field tap handler", async () => {
    await game.startScene("Tower");
    await game.advanceTime(50);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      gs.onFieldTap(gs.scale.width / 2, gs.scale.height / 2);
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.towers.length).toBe(1);
  });

  it("removes a tower when tapping on it again", async () => {
    await game.startScene("Tower");
    await game.advanceTime(50);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      gs.onFieldTap(400, 600);
      gs.onFieldTap(400, 600); // second tap removes
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.towers.length).toBe(0);
  });

  it("connects source to destination on level 0 with a midpoint relay", async () => {
    await game.startScene("Tower");
    await game.advanceTime(50);

    // Force place a tower in the middle via scene internals
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      const lvl = gs.levels[0];
      const mx = (lvl.source.x + lvl.dest.x) / 2;
      const my = (lvl.source.y + lvl.dest.y) / 2;
      gs.onFieldTap(mx, my);
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.towers.length).toBe(1);
    expect(s.connected).toBe(true);
    // Path must traverse the relay: source → relay → dest
    expect(s.path[0]).toBe(0);
    expect(s.path[s.path.length - 1]).toBe(1);
    expect(s.path.length).toBe(3);
  });

  it("blocks connection when a tower sits on a naive straight line across an obstacle", async () => {
    await game.startScene("Tower");
    await game.advanceTime(50);

    // Jump to level 1 (has an obstacle between source and dest)
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      gs.loadLevel(1);
    })()`);
    await game.advanceTime(50);

    // Try placing a single tower at the midpoint — still blocked by obstacle
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      const lvl = gs.levels[1];
      const mx = (lvl.source.x + lvl.dest.x) / 2;
      const my = (lvl.source.y + lvl.dest.y) / 2;
      // Nudge above the obstacle if midpoint is inside one
      let y = my;
      for (const o of lvl.obstacles) {
        if (mx >= o.x && mx <= o.x + o.w && y >= o.y && y <= o.y + o.h) {
          y = o.y - 20;
        }
      }
      gs.onFieldTap(mx, y);
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.towers.length).toBe(1);
    // Single mid tower shouldn't connect through an obstacle-blocked diagonal
    // (source/dest are offset vertically and obstacle blocks direct LOS)
    expect(s.connected).toBe(false);
  });

  it("allows placing many towers (unbounded budget)", async () => {
    await game.startScene("Tower");
    await game.advanceTime(50);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      for (let i = 0; i < 8; i++) {
        gs.onFieldTap(200 + i * 50, 300 + i * 40);
      }
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.towers.length).toBe(8);
  });
});
