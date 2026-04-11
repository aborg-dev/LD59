# LD59 - Phaser 4 Game

## Quick commands

- `just dev` - start dev server (vite on 0.0.0.0:5173)
- `just lint` / `just lint-fix` - biome linter
- `just test` - start dev server, run e2e tests, cleanup

## Inspecting the game

`tools/game.ts` is a Playwright-based helper for interacting with the running game
in headless Chromium. The test suite (`tests/game.e2e.test.ts`) demonstrates usage.

Example usage (from `tests/game.e2e.test.ts`):

```ts
await game.drag(200, 300, 400, 500);
const state = await game.getCircle(); // { x, y, radius, gameWidth, gameHeight }
await game.screenshot("after-drag");  // saves to screenshots/after-drag.png
```

Run tests with `just test`.
