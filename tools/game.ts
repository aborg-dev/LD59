import fs from "node:fs";
import path from "node:path";
import { type Browser, chromium, type Page } from "playwright";

const SCREENSHOTS_DIR = path.resolve("debug/screenshots");

let browser: Browser | null = null;
let page: Page | null = null;
let currentUrl = "";
let pageErrors: string[] = [];

import type { StateDump } from "../src/main.js";
import type { GameSceneState } from "../src/scenes/GameScene.js";

export type { GameSceneState, StateDump };

async function ensurePage(
  url: string,
  width = 480,
  height = 720,
): Promise<Page> {
  if (!browser?.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }

  const needsNewPage = !page || page.isClosed();
  const needsResize =
    page &&
    !page.isClosed() &&
    (page.viewportSize()?.width !== width ||
      page.viewportSize()?.height !== height);

  if (needsNewPage) {
    page = await browser.newPage({ viewport: { width, height } });
    pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
  } else if (needsResize) {
    await page?.setViewportSize({ width, height });
  }

  if (needsNewPage || currentUrl !== url) {
    await page?.goto(url, { waitUntil: "networkidle" });
    currentUrl = url;
  }

  return page!;
}

async function waitForGame(pg: Page): Promise<void> {
  // Wait for Phaser to initialize, then skip directly to the GameScene
  await pg.waitForFunction(
    () => {
      try {
        if (window.game?.scene?.scenes?.length > 0) {
          window.startScene("GameScene");
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    { timeout: 10000 },
  );
  // Wait for GameScene to be fully created
  await pg.waitForFunction(
    () => {
      try {
        return !!window.gameScene().children;
      } catch {
        return false;
      }
    },
    { timeout: 10000 },
  );
}

export async function launch(
  url: string,
  width = 480,
  height = 720,
): Promise<void> {
  const pg = await ensurePage(url, width, height);
  await waitForGame(pg);
}

export async function close(): Promise<void> {
  if (page && !page.isClosed()) await page.close();
  if (browser) await browser.close();
  page = null;
  browser = null;
  currentUrl = "";
}

export async function reload(): Promise<void> {
  if (page && !page.isClosed()) {
    await page.reload({ waitUntil: "networkidle" });
    await waitForGame(page);
  }
}

export async function dumpState(): Promise<StateDump> {
  return page!.evaluate(() => window.dumpState());
}

const DUMPS_DIR = path.resolve("debug/dumps");

export async function dumpStateToFile(name?: string): Promise<string> {
  const state = await dumpState();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = name ? `${name}-${ts}.json` : `state-${ts}.json`;
  fs.mkdirSync(DUMPS_DIR, { recursive: true });
  const filepath = path.join(DUMPS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(state, null, 2));
  return filepath;
}

export async function resetGame(): Promise<void> {
  await page?.evaluate(() => window.startScene("GameScene"));
  await page?.waitForFunction(
    () => {
      try {
        return !!window.gameScene().children;
      } catch {
        return false;
      }
    },
    { timeout: 5000 },
  );
}

export async function drag(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps = 5,
): Promise<void> {
  await page?.evaluate(`((args) => {
      const canvas = document.querySelector("canvas");
      function dispatch(type, x, y) {
        canvas.dispatchEvent(
          new MouseEvent(type, {
            clientX: x,
            clientY: y,
            bubbles: true,
            button: 0,
            buttons: type === "mouseup" ? 0 : 1,
          }),
        );
      }
      dispatch("mousedown", args.fromX, args.fromY);
      for (let i = 1; i <= args.steps; i++) {
        const t = i / args.steps;
        dispatch(
          "mousemove",
          args.fromX + (args.toX - args.fromX) * t,
          args.fromY + (args.toY - args.fromY) * t,
        );
      }
      dispatch("mouseup", args.toX, args.toY);
    })(${JSON.stringify({ fromX, fromY, toX, toY, steps })})`);
}

export async function setVelocity(vx: number, vy: number): Promise<void> {
  await page?.evaluate(({ vx, vy }) => window.gameScene().setVelocity(vx, vy), {
    vx,
    vy,
  });
}

export async function advanceTime(ms: number): Promise<void> {
  await page?.evaluate((ms) => window.advanceTime(ms), ms);
}

export async function resumeLoop(): Promise<void> {
  await page?.evaluate(() => window.game.loop.wake());
}

export async function hasCanvas(): Promise<boolean> {
  return page?.evaluate(() => document.querySelector("canvas") !== null);
}

export async function isGameRunning(): Promise<boolean> {
  return page?.evaluate(() => window.game?.constructor?.name === "Game");
}

export async function sceneCount(): Promise<number> {
  return page?.evaluate(() => window.game?.scene?.scenes?.length ?? 0);
}

export function errors(): string[] {
  return pageErrors;
}

async function render(): Promise<void> {
  await page?.evaluate(() => {
    const game = window.game;
    const r = game.renderer;
    r.preRender();
    game.scene.render(r);
    r.postRender();
  });
}

export async function screenshot(name = "screenshot"): Promise<string> {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  await render();
  const outputPath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page?.screenshot({ path: outputPath });
  return outputPath;
}

export async function screenshotBuffer(): Promise<Buffer> {
  await render();
  return page?.screenshot();
}

export async function eval_(expression: string): Promise<unknown> {
  return page?.evaluate(expression);
}
