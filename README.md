# LD59

Phaser 4 game project with browser-based tooling for screenshots, game state inspection, and e2e testing.

**Play it:** https://aborg-dev.github.io/LD59/

## Prerequisites

- [Nix](https://nixos.org/download/) with flakes enabled

## Setup

```sh
nix develop
npm install
```

The Nix dev shell provides Node.js, Playwright browsers, and Claude Code.

### Playwright version pinning

The npm `playwright` package version must match the `playwright-driver` version in nixpkgs. Check with:

```sh
nix eval nixpkgs#playwright-driver.version
```

If it differs from what's in `package.json`, pin it:

```sh
npm install playwright@<version>
```

## Development

```sh
npm run dev
```

Starts the Vite dev server on `0.0.0.0:5173`.

## Project structure

```
src/
  main.ts              # Game entry point (Phaser 4)
tools/
  browser.ts           # Shared browser automation library (Playwright)
  gamedev-server.ts    # MCP server wrapping browser.ts
  screenshot.ts        # Standalone screenshot CLI
tests/
  game.e2e.test.ts     # E2E tests using browser.ts
  bounds.e2e.test.ts   # Ball bounds e2e tests
.github/
  workflows/deploy.yml # GitHub Pages deployment
```

## Testing

E2E tests require the dev server to be running.

```sh
# Terminal 1
npm run dev

# Terminal 2
npm test
```

## MCP server

The `gamedev` MCP server provides browser-based tools for Claude Code:

| Tool | Description |
|------|-------------|
| `screenshot` | Take a screenshot of the game |
| `game_eval` | Evaluate JavaScript in the browser (access game state via `window.game`) |
| `game_interact` | Simulate click/drag/wait sequences, then screenshot |
| `game_console` | Capture browser console logs and errors |

Configured in `.claude/settings.json`. Restart Claude Code after changes.

## Browser automation library

`tools/browser.ts` is shared between the MCP server and e2e tests. It provides:

- `getPage(url, width, height)` - get or reuse a Playwright browser page
- `screenshot(opts)` - take a screenshot
- `evaluate(expression, opts)` - run JS in the browser
- `interact(actions, opts)` - simulate user interactions
- `consoleLogs(opts)` - capture console output
- `closeBrowser()` - clean up

## Deployment

Pushes to `main` automatically build and deploy to GitHub Pages via the workflow in `.github/workflows/deploy.yml`.

```sh
npm run build   # Local build to dist/
```
