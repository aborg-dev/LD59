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

    await game.loadTowerLevel(1);
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

    // Level 5 is the first 3-terminal level (index 5). The two top terminals
    // are too far apart for any single relay to reach all three within range,
    // so two relays are needed: one between the top pair, one toward the
    // bottom terminal.
    await game.loadTowerLevel(5);
    await game.advanceTime(50);

    let s = await towerState();
    expect(s.terminalCount).toBe(3);
    expect(s.connected).toBe(false);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      const [a, b, c] = gs.levels[5].terminals;
      // Place a relay at the midpoint of each top-terminal-to-bottom segment;
      // both midpoints are inside range of their two endpoints, so the spanning
      // tree A—M1—C—M2—B forms.
      gs.onFieldTap((a.x + c.x) / 2, (a.y + c.y) / 2);
      gs.onFieldTap((b.x + c.x) / 2, (b.y + c.y) / 2);
    })()`);
    await game.advanceTime(50);

    s = await towerState();
    expect(s.towers.length).toBe(2);
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

  it("loads every level cleanly with structurally valid data", async () => {
    await game.startScene("Tower");
    await game.advanceTime(50);

    const { levelCount } = await towerState();
    expect(levelCount).toBe(12);

    interface LevelShape {
      terminals: { x: number; y: number }[];
      obstacles: { x: number; y: number; w: number; h: number }[];
      inhibitors?: { x: number; y: number; radius: number }[];
      range: number;
      hint?: string;
    }

    for (let i = 0; i < levelCount; i++) {
      await game.loadTowerLevel(i);
      await game.advanceTime(20);

      const s = await towerState();
      expect(s.levelIndex, `level ${i} index`).toBe(i);
      expect(s.terminalCount, `level ${i} terminals`).toBeGreaterThanOrEqual(2);
      expect(s.towers.length, `level ${i} towers reset`).toBe(0);
      expect(s.connected, `level ${i} starts unconnected`).toBe(false);

      const level = (await game.eval_(`(() => {
        return JSON.parse(JSON.stringify(
          window.game.scene.getScene('Tower').levels[${i}]
        ));
      })()`)) as LevelShape;

      expect(level.range, `level ${i} range`).toBeGreaterThan(0);
      expect(level.terminals.length, `level ${i} terminals shape`).toBe(
        s.terminalCount,
      );
      for (const [ti, t] of level.terminals.entries()) {
        expect(
          Number.isFinite(t.x) && Number.isFinite(t.y),
          `level ${i} terminal ${ti} finite`,
        ).toBe(true);
      }
      for (const [oi, o] of level.obstacles.entries()) {
        expect(o.w, `level ${i} obstacle ${oi} width`).toBeGreaterThan(0);
        expect(o.h, `level ${i} obstacle ${oi} height`).toBeGreaterThan(0);
      }
      for (const [ji, j] of (level.inhibitors ?? []).entries()) {
        expect(j.radius, `level ${i} inhibitor ${ji} radius`).toBeGreaterThan(
          0,
        );
      }
    }

    expect(game.errors(), "no runtime errors during level loads").toEqual([]);
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
