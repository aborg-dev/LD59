import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RoverSceneState } from "../tools/game.js";
import * as game from "../tools/game.js";

const URL = process.env.TEST_URL || "http://localhost:5173";

async function roverState(): Promise<RoverSceneState> {
  const dump = await game.dumpState();
  if (!dump.Rover) throw new Error("Rover scene not initialized");
  return dump.Rover;
}

describe("RoverScene", () => {
  beforeAll(async () => {
    await game.launch(URL);
  });

  afterAll(async () => {
    await game.close();
  });

  it("loads with correct initial state", async () => {
    await game.startScene("Rover");
    await game.advanceTime(50);

    const s = await roverState();
    expect(s.active).toBe(true);
    expect(s.battery).toBe(6);
    expect(s.batteryMax).toBe(6);
    expect(s.turn).toBe(0);
    expect(s.phase).toBe("select_action");
    expect(s.probeCount).toBe(0);
    expect(s.roverFound).toBe(false);
    expect(s.atmoUsesLeft).toBe(2);
    expect(s.rockQueryUsesLeft).toBe(2);
  });

  it("probe costs battery and advances turn", async () => {
    await game.startScene("Rover");
    await game.advanceTime(50);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Rover');
      gs.onProbeButtonDown();
      const cell = gs.cells.flat().find(c => !c.hasRover);
      gs.executeProbe(cell);
    })()`);
    await game.advanceTime(50);

    const s = await roverState();
    expect(s.battery).toBeLessThan(6);
    expect(s.probeCount).toBe(1);
    expect(s.turn).toBe(1);
    expect(s.phase).toBe("select_action");
    expect(s.roverFound).toBe(false);
  });

  it("passive drain applies on each endTurn call", async () => {
    await game.startScene("Rover");
    await game.advanceTime(50);

    const before = (await roverState()).battery;

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Rover');
      gs.endTurn();
      gs.endTurn();
    })()`);
    await game.advanceTime(50);

    const after = (await roverState()).battery;
    expect(after).toBe(before - 2); // PASSIVE_DRAIN * 2
  });

  it("probing the rover cell triggers win", async () => {
    await game.startScene("Rover");
    await game.advanceTime(50);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Rover');
      gs.onProbeButtonDown();
      const roverCell = gs.cells.flat().find(c => c.hasRover);
      gs.executeProbe(roverCell);
    })()`);
    await game.advanceTime(50);

    const s = await roverState();
    expect(s.roverFound).toBe(true);
    expect(s.phase).toBe("won");
  });

  it("battery reaching 0 triggers lost", async () => {
    await game.startScene("Rover");
    await game.advanceTime(50);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Rover');
      gs.battery = 1; // equal to PASSIVE_DRAIN (1), drains to 0
      gs.endTurn();
    })()`);
    await game.advanceTime(50);

    const s = await roverState();
    expect(s.battery).toBe(0);
    expect(s.phase).toBe("lost");
  });
});
