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

  it("connects two terminals on level 0 with a midpoint relay", async () => {
    await game.startScene("Tower");
    await game.advanceTime(50);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      const [a, b] = gs.levels[0].terminals;
      gs.onFieldTap((a.x + b.x) / 2, (a.y + b.y) / 2);
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.towers.length).toBe(1);
    expect(s.terminalCount).toBe(2);
    expect(s.connected).toBe(true);
  });

  it("blocks connection when a single relay can't see past the obstacle", async () => {
    await game.startScene("Tower");
    await game.advanceTime(50);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      gs.loadLevel(1);
    })()`);
    await game.advanceTime(50);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      const [a, b] = gs.levels[1].terminals;
      const mx = (a.x + b.x) / 2;
      let my = (a.y + b.y) / 2;
      for (const o of gs.levels[1].obstacles) {
        if (mx >= o.x && mx <= o.x + o.w && my >= o.y && my <= o.y + o.h) {
          my = o.y - 20;
        }
      }
      gs.onFieldTap(mx, my);
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.towers.length).toBe(1);
    expect(s.connected).toBe(false);
  });

  it("requires all three terminals linked on a 3-terminal level", async () => {
    await game.startScene("Tower");
    await game.advanceTime(50);

    // Level 5 is the first 3-terminal level (index 5).
    await game.eval_(`(() => {
      window.game.scene.getScene('Tower').loadLevel(5);
    })()`);
    await game.advanceTime(50);

    let s = await towerState();
    expect(s.terminalCount).toBe(3);
    expect(s.connected).toBe(false);

    // Place a single relay at the centroid of the three terminals
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      const ts = gs.levels[5].terminals;
      const cx = (ts[0].x + ts[1].x + ts[2].x) / 3;
      const cy = (ts[0].y + ts[1].y + ts[2].y) / 3;
      gs.onFieldTap(cx, cy);
    })()`);
    await game.advanceTime(50);

    s = await towerState();
    expect(s.towers.length).toBe(1);
    expect(s.connected).toBe(true);
  });

  it("allows placing many towers (unbounded budget)", async () => {
    // Start at level 0 (no obstacles) to ensure every tap lands in open space.
    await game.eval_(`(() => {
      window.game.scene.start('Tower', { startLevel: 0 });
    })()`);
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

  it("level select launches Tower at the chosen level", async () => {
    await game.startScene("TowerLevelSelect");
    await game.advanceTime(50);

    await game.eval_(`(() => {
      window.game.scene.start('Tower', { startLevel: 3 });
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.levelIndex).toBe(3);
    expect(s.towers.length).toBe(0);
  });
});
