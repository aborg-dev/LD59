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

describe("tower level editor", () => {
  it("enters editor mode and exposes a draft cloned from the level", async () => {
    await game.eval_(`(() => {
      window.game.scene.start('Tower', { startLevel: 0 });
    })()`);
    await game.advanceTime(50);

    await game.eval_(`(() => {
      window.game.scene.getScene('Tower').toggleEditor();
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.editor?.active).toBe(true);
    expect(s.editor?.dirty).toBe(false);
    expect(s.editor?.draft?.terminals.length).toBe(2);
    expect(s.editor?.draft?.range).toBeGreaterThan(0);
  });

  it("dragging a terminal handle updates the draft and marks dirty", async () => {
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      const h = gs.terminalHandles[0].body;
      gs.onEditorDrag(h, 500, 250);
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.editor?.dirty).toBe(true);
    expect(s.editor?.draft?.terminals[0]).toMatchObject({ x: 500, y: 250 });
  });

  it("dragging an obstacle corner resizes it", async () => {
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      gs.placeMode = "obstacle";
      gs.onEditorFieldTap({ x: 600, y: 400, rightButtonDown: () => false });
    })()`);
    await game.advanceTime(50);

    let s = await towerState();
    const obstaclesAfterPlace = s.editor?.draft?.obstacles.length ?? 0;
    expect(obstaclesAfterPlace).toBe(1);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      const corner = gs.obstacleHandles[0].corner;
      const o = gs.draft.obstacles[0];
      gs.onEditorDrag(corner, o.x + 300, o.y + 200);
    })()`);
    await game.advanceTime(50);

    s = await towerState();
    const o = s.editor?.draft?.obstacles[0];
    expect(o?.w).toBe(300);
    expect(o?.h).toBe(200);
  });

  it("dragging an inhibitor radius handle resizes the field", async () => {
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      gs.placeMode = "inhibitor";
      // Place clear of the obstacle from the previous test (520-820 x 350-550)
      gs.onEditorFieldTap({ x: 200, y: 600, rightButtonDown: () => false });
    })()`);
    await game.advanceTime(50);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      const j = gs.draft.inhibitors[0];
      const radiusHandle = gs.inhibitorHandles[0].radius;
      gs.onEditorDrag(radiusHandle, j.x + 180, j.y);
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    const last = s.editor?.draft?.inhibitors?.at(-1);
    expect(last?.radius).toBe(180);
  });

  it("right-click on a handle deletes the element", async () => {
    const before = (await towerState()).editor?.draft?.obstacles.length ?? 0;
    expect(before).toBeGreaterThan(0);

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      const handle = gs.obstacleHandles[0].body;
      gs.deleteHandleTarget([handle]);
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.editor?.draft?.obstacles.length).toBe(before - 1);
  });

  it("delete-mode tap on a handle removes it (touch-friendly)", async () => {
    // Place a fresh inhibitor so we have a handle to delete.
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      gs.placeMode = "inhibitor";
      gs.onEditorFieldTap({ x: 400, y: 400, rightButtonDown: () => false });
    })()`);
    await game.advanceTime(50);

    const before = (await towerState()).editor?.draft?.inhibitors?.length ?? 0;
    expect(before).toBeGreaterThan(0);

    // Toggle delete mode and simulate a left-click that hits the handle.
    // We stub hitTestPointer because the test pointer isn't a real Phaser
    // pointer that Phaser's input plugin can hit-test against.
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      gs.setPlaceMode("delete");
      const handle = gs.inhibitorHandles[0].body;
      const orig = gs.input.hitTestPointer.bind(gs.input);
      gs.input.hitTestPointer = () => [handle];
      try {
        gs.onEditorFieldTap({
          x: handle.x, y: handle.y, rightButtonDown: () => false,
        });
      } finally {
        gs.input.hitTestPointer = orig;
      }
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.editor?.draft?.inhibitors?.length ?? 0).toBe(before - 1);
    expect(s.editor?.placeMode).toBe("delete");
  });

  it("range stepper updates draft.range", async () => {
    const before = (await towerState()).editor?.draft?.range ?? 0;
    await game.eval_(`(() => {
      window.game.scene.getScene('Tower').adjustRange(20);
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.editor?.draft?.range).toBe(before + 20);
  });

  it("PLAY exits editor and keeps the edited level live for gameplay", async () => {
    const before = (await towerState()).editor?.draft;
    expect(before).not.toBeNull();
    const editedRange = before?.range ?? 0;
    const editedTerminalCount = before?.terminals.length ?? 0;

    await game.eval_(`(() => {
      window.game.scene.getScene('Tower').toggleEditor();
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.editor?.active).toBe(false);
    // Draft persists post-exit so gameplay uses the edited geometry.
    expect(s.editor?.draft).not.toBeNull();
    expect(s.editor?.draft?.range).toBe(editedRange);
    expect(s.editor?.draft?.terminals.length).toBe(editedTerminalCount);
    expect(s.terminalCount).toBe(editedTerminalCount);
  });

  it("re-entering editor resumes the same draft (UNSAVED preserved)", async () => {
    await game.eval_(`(() => {
      window.game.scene.getScene('Tower').toggleEditor();
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.editor?.active).toBe(true);
    // dirty stays true because we haven't saved to disk
    expect(s.editor?.dirty).toBe(true);
  });

  it("switching levels drops the draft", async () => {
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('Tower');
      gs.toggleEditor(); // exit back to play
      gs.loadLevel(1);
    })()`);
    await game.advanceTime(50);

    const s = await towerState();
    expect(s.levelIndex).toBe(1);
    expect(s.editor?.draft).toBeNull();
    expect(s.editor?.dirty).toBe(false);
  });
});
