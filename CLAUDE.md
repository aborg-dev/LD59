# Game Jam Prototypes - Phaser 4

Multi-game prototype repo. Each game is a self-contained scene with its own
test file. The MainMenu acts as a game selector.

## Quick commands

- `just dev` - start dev server (vite on 0.0.0.0:5173)
- `just lint` / `just lint-fix` - biome linter
- `just test` - start dev server, run all e2e tests, cleanup

## Project structure

```
src/scenes/
  Boot.ts          — init, transitions to Preloader
  Preloader.ts     — loads shared assets
  MainMenu.ts      — game selector (GAMES array defines the list)
  GameOver.ts       — shared end screen, returns to the originating game
  SoccerScene.ts   — "Soccer Fling" prototype
tests/
  soccer.e2e.test.ts — e2e tests for Soccer
tools/
  game.ts          — Playwright helpers (launch, advanceTime, dumpState, etc.)
```

## Adding a new game prototype

1. **Create the scene** — add `src/scenes/MyGameScene.ts`:
   - Extend `Phaser.Scene`, use a short key: `super("MyGame")`
   - Add a `dumpState()` method returning a typed state object
   - End the game with `this.scene.start("GameOver", { score, returnScene: "MyGame" })`

2. **Register in MainMenu** — edit `src/scenes/MainMenu.ts`:
   - Add to the `GAMES` array: `["MyGame", "My Game Label"]`

3. **Register in main.ts**:
   - Import the scene class and state type
   - Add it to the `scene` array in the Phaser config
   - Add its state to the `StateDump` interface and `dumpState()` function

4. **Add tests** — create `tests/mygame.e2e.test.ts`:
   - Use `game.startScene("MyGame")` to enter
   - Access state via `game.dumpState().MyGame`
   - Use `game.eval_()` to reach into scene internals for test setup

5. **Add assets** — put new assets in `public/assets/` and load in `Preloader.ts`

## Debugging

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
// Then: jq '.Soccer.ball' debug/dumps/after-drag-*.json
// Or:   jq 'to_entries[] | select(.value.active) | .key' debug/dumps/initial-*.json
```

`tools/game.ts` is the Playwright-based API — read it for the full list of helpers.

## Phaser 4 reference

Official Phaser 4 skill files live in `skills/phaser/` (sourced from phaserjs/phaser repo).
Read them when working with unfamiliar Phaser APIs — they cover v4-specific usage, not v3.
28 files covering all subsystems: scenes, input, sprites, audio, text, physics, tweens,
cameras, particles, tilemaps, filters, animations, and more. Start with
`v3-to-v4-migration.md` for breaking changes from v3.
