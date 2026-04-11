# LD59 - Phaser 4 Game

## Quick commands

- `just dev` - start dev server (vite on 0.0.0.0:5173)
- `just lint` / `just lint-fix` - biome linter
- `just test` - start dev server, run e2e tests, cleanup

## Debugging the game

Write throwaway scripts to `debug/` (gitignored) and run with `npx tsx`.
The dev server is assumed to be running.

```ts
// debug/check-drag.ts — run with: npx tsx debug/check-drag.ts
import path from "node:path";
import * as game from "../tools/game.js";

const prefix = path.basename(process.argv[1], ".ts");

(async () => {
  await game.launch(process.env.TEST_URL || "http://localhost:5173");
  await game.drag(200, 300, 400, 500);
  console.log(await game.getCircle());
  await game.screenshot(`${prefix}-result`);
  await game.close();
})();
```

`tools/game.ts` is the Playwright-based API — read it for the full list of helpers.
