// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "./setup-headless.js";
import * as Phaser from "phaser";
import { GameScene } from "../src/GameScene.js";

// Access private scene fields for testing
type SceneInternals = {
  velocityX: number;
  velocityY: number;
  dragging: boolean;
};

let game: Phaser.Game;
let scene: GameScene;

function internals(): SceneInternals {
  return scene as unknown as SceneInternals;
}

function getCircle(): Phaser.GameObjects.Arc {
  return scene.children.list.find(
    (o) => o.type === "Arc",
  ) as Phaser.GameObjects.Arc;
}

function stepFrames(n: number): void {
  for (let i = 0; i < n; i++) {
    game.headlessStep(performance.now(), 16.666);
  }
}

function resetCircle(): void {
  const c = getCircle();
  const { width, height } = scene.scale;
  c.x = width / 2;
  c.y = height / 2;
  internals().velocityX = 0;
  internals().velocityY = 0;
  internals().dragging = false;
}

beforeAll(async () => {
  game = new Phaser.Game({
    type: Phaser.HEADLESS,
    width: 480,
    height: 720,
    scene: GameScene,
    banner: false,
    autoFocus: false,
  });

  // Wait for Phaser to boot and the scene to create.
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Scene did not boot. isBooted=${game.isBooted}, scenes=${game.scene?.scenes?.length}, readyState=${document.readyState}`,
        ),
      );
    }, 8000);

    const check = () => {
      if (game.isBooted) {
        game.headlessStep(performance.now(), 16.666);
      }
      const s = game.scene.scenes[0];
      if (s?.children?.list?.length > 0) {
        clearTimeout(timeout);
        scene = s as GameScene;
        resolve();
      } else {
        setTimeout(check, 16);
      }
    };
    setTimeout(check, 50);
  });
});

afterAll(() => {
  game.destroy(true);
});

describe("game headless", () => {
  it("creates a Phaser game instance", () => {
    expect(game).toBeInstanceOf(Phaser.Game);
  });

  it("has an active scene", () => {
    expect(game.scene.scenes.length).toBeGreaterThan(0);
  });

  it("has a circle game object", () => {
    const c = getCircle();
    expect(c).toBeDefined();
    expect(c.type).toBe("Arc");
  });

  it("circle starts at center", () => {
    const c = getCircle();
    expect(c.x).toBe(240);
    expect(c.y).toBe(360);
  });
});

describe("ball stays within bounds (headless)", () => {
  beforeEach(() => {
    resetCircle();
  });

  it("does not go past the bottom edge", () => {
    const c = getCircle();
    c.y = 720 + 100;
    stepFrames(1);
    expect(c.y + c.radius).toBeLessThanOrEqual(720);
  });

  it("does not go past the right edge", () => {
    const c = getCircle();
    c.x = 480 + 100;
    stepFrames(1);
    expect(c.x + c.radius).toBeLessThanOrEqual(480);
  });

  it("does not go past the top edge", () => {
    const c = getCircle();
    c.y = -100;
    stepFrames(1);
    expect(c.y - c.radius).toBeGreaterThanOrEqual(0);
  });

  it("does not go past the left edge", () => {
    const c = getCircle();
    c.x = -100;
    stepFrames(1);
    expect(c.x - c.radius).toBeGreaterThanOrEqual(0);
  });

  it("stays in bounds after velocity fling", () => {
    const c = getCircle();
    internals().velocityX = 5000;
    internals().velocityY = 5000;
    stepFrames(60);

    expect(c.x - c.radius).toBeGreaterThanOrEqual(0);
    expect(c.y - c.radius).toBeGreaterThanOrEqual(0);
    expect(c.x + c.radius).toBeLessThanOrEqual(480);
    expect(c.y + c.radius).toBeLessThanOrEqual(720);
  });

  it("velocity decays with friction", () => {
    internals().velocityX = 1000;
    internals().velocityY = 1000;
    stepFrames(300);

    // Velocity should decay to near-zero (bouncing off walls slows decay)
    expect(Math.abs(internals().velocityX)).toBeLessThan(5);
    expect(Math.abs(internals().velocityY)).toBeLessThan(5);
  });
});
