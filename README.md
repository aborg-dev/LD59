# Tennis Fling

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

## Deployment

Pushes to `main` automatically build and deploy to GitHub Pages via GitHub Actions.
