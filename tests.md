# Testing

## Quick reference

```bash
npm test          # Fast headless tests (~5s, no browser needed)
npm run test:e2e  # Full browser-based e2e tests (requires dev server)
npm run test:all  # Run everything
```

## Test types

### Headless tests (`tests/game.headless.test.ts`)

Fast unit/integration tests that run Phaser in `Phaser.HEADLESS` mode inside
jsdom. No browser, no dev server, no rendering. The full Phaser game lifecycle
runs (scene creation, update loop, game objects) but nothing is drawn to a
canvas.

These tests cover:

- Game instance creation and scene boot
- Game object existence and initial state
- Boundary collision on all four edges
- Velocity/friction decay over time
- Bounds enforcement after high-velocity flings

**How it works:**

1. Vitest runs with `@vitest-environment jsdom` (per-file comment).
2. `tests/setup-headless.ts` is imported before Phaser to patch jsdom:
   - **Canvas stub**: Phaser calls `getContext('2d')` at import time to detect
     features like inverse alpha. jsdom has no canvas implementation, so the
     setup provides a minimal `CanvasRenderingContext2D` stub.
   - **Image stub**: Phaser's `TextureManager.addBase64` loads three default
     textures (`__DEFAULT`, `__MISSING`, `__WHITE`) via `new Image()`. jsdom's
     `Image` doesn't fire `onload` for data URLs, so the setup patches
     `HTMLImageElement.prototype.src` to trigger `onload` asynchronously.
3. A `Phaser.Game` is created with `type: Phaser.HEADLESS` in `beforeAll`.
4. Since jsdom's `requestAnimationFrame` never fires, the test manually calls
   `game.headlessStep(time, delta)` to advance the game loop.
5. Tests read and manipulate game objects directly via `scene.children.list`.

**Advancing the game loop:**

```ts
// Step one frame (~16.6ms at 60fps)
game.headlessStep(performance.now(), 16.666);

// Step multiple frames via the helper
function stepFrames(n: number): void {
  for (let i = 0; i < n; i++) {
    game.headlessStep(performance.now(), 16.666);
  }
}
```

**Accessing game objects:**

```ts
const scene = game.scene.scenes[0] as GameScene;
const circle = scene.children.list.find(o => o.type === "Arc");
```

### E2E tests (`tests/game.e2e.test.ts`)

Full browser-based tests using Playwright. These launch headless Chromium,
navigate to the running dev server, and interact with the real rendered game.

**Prerequisites:** The Vite dev server must be running (`npm run dev`).

The test helper at `tools/game.ts` provides:

- `launch(url)` / `close()` - Browser lifecycle
- `getCircle()` / `resetCircle()` - Game state inspection and reset
- `drag(fromX, fromY, toX, toY)` - Simulated mouse interaction
- `stepFrames(n)` - Manual scene update ticks
- `screenshot(name)` - Capture after render

## Architecture notes

`GameScene` lives in `src/GameScene.ts` (not `src/main.ts`) so that tests can
import the scene class without triggering the side effect of creating a
`Phaser.Game` on `window`. `src/main.ts` re-imports and wires it up for the
browser entry point.

The jsdom stubs in `tests/setup-headless.ts` are specifically tailored to what
Phaser 4 needs during boot. If Phaser is upgraded and headless tests break
during initialization, check those two stubs first:

1. Does Phaser call new canvas methods at import time? -> extend the canvas stub
2. Does the TextureManager load images differently? -> check the Image.src patch

## Adding new headless tests

```ts
// @vitest-environment jsdom
import "./setup-headless.js";
import * as Phaser from "phaser";
import { GameScene } from "../src/GameScene.js";

// Create game in beforeAll, destroy in afterAll
// Use game.headlessStep() to advance frames
// Access scene objects via scene.children.list
```

The `// @vitest-environment jsdom` comment is required at the top of each
headless test file. Without it, vitest uses the default Node environment which
has no DOM APIs.
