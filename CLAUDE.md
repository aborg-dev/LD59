# LD59 - Phaser 4 Game

## Quick commands

- `just dev` - start dev server (vite on 0.0.0.0:5173)
- `just lint` / `just lint-fix` - biome linter
- `just test` - start dev server, run e2e tests, cleanup

## Debugging the game

Write throwaway scripts to `debug/` (gitignored) and run with `npx tsx`.
The dev server is assumed to be running.

### State dumps

`game.dumpState()` returns all per-scene state as a keyed JSON object.
`game.dumpStateToFile(name?)` writes the dump to `debug/dumps/<name>-<timestamp>.json`
for offline analysis with `jq`.

### Incremental exploration

Keep the browser alive between steps — no need for one-shot launch/close sessions.

```ts
// debug/explore.ts — run with: npx tsx debug/explore.ts
import * as game from "../tools/game.js";

const url = process.env.TEST_URL || "http://localhost:5173";

(async () => {
  await game.launch(url);

  // dump initial state
  await game.dumpStateToFile("initial");

  // interact and dump again
  await game.drag(200, 300, 400, 500);
  await game.dumpStateToFile("after-drag");

  // let physics run, dump a third time
  await game.advanceTime(500);
  await game.dumpStateToFile("after-physics");

  await game.screenshot("explore-result");
  await game.close();
})();
// Then: jq '.GameScene.circle' debug/dumps/after-drag-*.json
// Or:   jq 'to_entries[] | select(.value.active) | .key' debug/dumps/initial-*.json
```

`tools/game.ts` is the Playwright-based API — read it for the full list of helpers.
