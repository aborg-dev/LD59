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

The Nix dev shell provides Node.js, just, Playwright browsers, and Claude Code.

## Development

```sh
just dev
```

Starts the Vite dev server on `0.0.0.0:5173`.

## Linting

```sh
just lint       # Check for issues
just lint-fix   # Auto-fix issues
```

Uses [Biome](https://biomejs.dev/) for linting and formatting.

## Testing

```sh
just test
```

Starts a dev server, runs all e2e tests, and cleans up. No manual server needed.

A pre-commit git hook runs `just lint` and a pre-push hook runs both `just lint` and `just test`.

## Project structure

```
src/
  main.ts              # Game entry point (Phaser 4)
tools/
  game.ts              # Game test helper (Playwright)
  gamedev-server.ts    # MCP server for Claude Code
tests/
  game.e2e.test.ts     # E2E tests
.github/
  workflows/deploy.yml # GitHub Pages deployment
.githooks/
  pre-commit           # Runs linter
  pre-push             # Runs linter + tests
justfile               # Task runner
biome.json             # Linter/formatter config
```

## MCP server

The `gamedev` MCP server provides browser-based tools for Claude Code:

| Tool | Description |
|------|-------------|
| `screenshot` | Take a screenshot of the game |
| `game_eval` | Evaluate JavaScript in the browser (access game state via `window.game`) |
| `game_interact` | Drag the ball and screenshot the result |
| `game_state` | Get the ball's position, radius, and game dimensions |

Configured in `.claude/settings.json`. Restart Claude Code after changes.

## Deployment

Pushes to `main` automatically build and deploy to GitHub Pages via GitHub Actions.

```sh
just build   # Local build to dist/
```
