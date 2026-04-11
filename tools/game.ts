import fs from "node:fs";
import path from "node:path";
import { type Browser, chromium, type Page } from "playwright";

const SCREENSHOTS_DIR = path.resolve("screenshots");

let browser: Browser | null = null;
let page: Page | null = null;
let currentUrl = "";
let pageErrors: string[] = [];

export interface CircleState {
  x: number;
  y: number;
  radius: number;
  gameWidth: number;
  gameHeight: number;
}

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
  await pg.waitForFunction(
    () => {
      const g = (window as any).game;
      return g?.scene?.scenes?.length > 0 && g.scene.scenes[0].children;
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

export async function getCircle(): Promise<CircleState> {
  return page?.evaluate(() => {
    const s = (window as any).game.scene.scenes[0];
    const c = s.children.list.find((o: { type: string }) => o.type === "Arc");
    return {
      x: c.x,
      y: c.y,
      radius: c.radius,
      gameWidth: s.scale.width,
      gameHeight: s.scale.height,
    };
  });
}

export async function resetCircle(): Promise<void> {
  await page?.evaluate(() => {
    const s = (window as any).game.scene.scenes[0];
    const c = s.children.list.find((o: { type: string }) => o.type === "Arc");
    c.x = s.scale.width / 2;
    c.y = s.scale.height / 2;
    s.velocityX = 0;
    s.velocityY = 0;
    s.dragging = false;
  });
}

export async function drag(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps = 5,
): Promise<void> {
  await page?.evaluate(
    ({ fromX, fromY, toX, toY, steps }) => {
      const canvas = document.querySelector("canvas")!;
      const dispatch = (type: string, x: number, y: number) => {
        canvas.dispatchEvent(
          new MouseEvent(type, {
            clientX: x,
            clientY: y,
            bubbles: true,
            button: 0,
            buttons: type === "mouseup" ? 0 : 1,
          }),
        );
      };
      dispatch("mousedown", fromX, fromY);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        dispatch(
          "mousemove",
          fromX + (toX - fromX) * t,
          fromY + (toY - fromY) * t,
        );
      }
      dispatch("mouseup", toX, toY);
    },
    { fromX, fromY, toX, toY, steps },
  );
}

export async function stepFrames(frames: number): Promise<void> {
  await page?.evaluate((n) => {
    const game = (window as any).game;
    const scene = game.scene.scenes[0];
    for (let i = 0; i < n; i++) {
      scene.update(performance.now(), 16.666);
    }
  }, frames);
}

export async function resumeLoop(): Promise<void> {
  await page?.evaluate(() => (window as any).game.loop.wake());
}

export async function hasCanvas(): Promise<boolean> {
  return page?.evaluate(() => document.querySelector("canvas") !== null);
}

export async function isGameRunning(): Promise<boolean> {
  return page?.evaluate(
    () => (window as any).game?.constructor?.name === "Game",
  );
}

export async function sceneCount(): Promise<number> {
  return page?.evaluate(() => (window as any).game?.scene?.scenes?.length ?? 0);
}

export function errors(): string[] {
  return pageErrors;
}

async function render(): Promise<void> {
  await page?.evaluate(() => {
    const game = (window as any).game;
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
