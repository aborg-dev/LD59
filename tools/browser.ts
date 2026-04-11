import { chromium, type Browser, type Page } from 'playwright';
import path from 'path';
import fs from 'fs';

const DEFAULT_URL = 'http://localhost:5173';
const SCREENSHOTS_DIR = path.resolve('screenshots');

let browser: Browser | null = null;
let page: Page | null = null;
let currentUrl = '';

export async function getPage(url = DEFAULT_URL, width = 480, height = 720): Promise<Page> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }

  const needsNewPage = !page || page.isClosed();
  const needsResize = page && !page.isClosed() && (
    page.viewportSize()?.width !== width || page.viewportSize()?.height !== height
  );
  const needsNavigate = currentUrl !== url;

  if (needsNewPage) {
    page = await browser.newPage({ viewport: { width, height } });
  } else if (needsResize) {
    await page!.setViewportSize({ width, height });
  }

  if (needsNewPage || needsNavigate) {
    await page!.goto(url, { waitUntil: 'networkidle' });
    currentUrl = url;
  }

  return page!;
}

export async function closeBrowser(): Promise<void> {
  if (page && !page.isClosed()) await page.close();
  if (browser) await browser.close();
  page = null;
  browser = null;
  currentUrl = '';
}

export async function screenshot(
  opts: { url?: string; name?: string; width?: number; height?: number; delay?: number } = {},
): Promise<{ path: string; logs: string[]; errors: string[] }> {
  const { url = DEFAULT_URL, name = 'screenshot', width = 480, height = 720, delay = 2000 } = opts;
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const pg = await getPage(url, width, height);
  const { errors, logs } = collectLogs(pg);
  await pg.waitForTimeout(delay);

  const outputPath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await pg.screenshot({ path: outputPath });

  return { path: outputPath, logs, errors };
}

export async function evaluate(expression: string, opts: { url?: string; delay?: number } = {}): Promise<any> {
  const { url = DEFAULT_URL, delay = 1000 } = opts;
  const pg = await getPage(url);
  await pg.waitForTimeout(delay);
  return pg.evaluate(expression);
}

export interface Action {
  type: 'click' | 'drag' | 'wait';
  x?: number;
  y?: number;
  toX?: number;
  toY?: number;
  duration?: number;
}

export async function interact(
  actions: Action[],
  opts: { url?: string; name?: string; delay?: number } = {},
): Promise<{ path: string; actionLog: string[] }> {
  const { url = DEFAULT_URL, name = 'interact', delay = 1000 } = opts;
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const pg = await getPage(url);
  await pg.waitForTimeout(delay);

  const actionLog: string[] = [];

  for (const action of actions) {
    switch (action.type) {
      case 'click':
        await pg.mouse.click(action.x ?? 240, action.y ?? 360);
        actionLog.push(`click(${action.x}, ${action.y})`);
        break;
      case 'drag': {
        const startX = action.x ?? 240;
        const startY = action.y ?? 360;
        const endX = action.toX ?? startX;
        const endY = action.toY ?? startY;
        const steps = Math.max(5, Math.round((action.duration ?? 300) / 16));
        await pg.mouse.move(startX, startY);
        await pg.mouse.down();
        await pg.mouse.move(endX, endY, { steps });
        await pg.mouse.up();
        actionLog.push(`drag(${startX},${startY} -> ${endX},${endY})`);
        break;
      }
      case 'wait':
        await pg.waitForTimeout(action.duration ?? 500);
        actionLog.push(`wait(${action.duration ?? 500}ms)`);
        break;
    }
  }

  const outputPath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await pg.screenshot({ path: outputPath });

  return { path: outputPath, actionLog };
}

export async function consoleLogs(
  opts: { url?: string; delay?: number; reload?: boolean } = {},
): Promise<{ logs: string[]; errors: string[] }> {
  const { url = DEFAULT_URL, delay = 2000, reload = false } = opts;
  const pg = await getPage(url);
  const { errors, logs } = collectLogs(pg);

  if (reload) {
    await pg.reload({ waitUntil: 'networkidle' });
  }

  await pg.waitForTimeout(delay);
  return { logs, errors };
}

export function collectLogs(page: Page): { errors: string[]; logs: string[] } {
  const errors: string[] = [];
  const logs: string[] = [];

  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning' || type === 'log') {
      logs.push(`[${type}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => errors.push(err.message));

  return { errors, logs };
}

export function formatLogs(errors: string[], logs: string[]): string {
  const parts: string[] = [];
  if (logs.length > 0) {
    parts.push('Browser console:\n' + logs.map(l => `  ${l}`).join('\n'));
  }
  if (errors.length > 0) {
    parts.push('Browser errors:\n' + errors.map(e => `  ERROR: ${e}`).join('\n'));
  }
  return parts.join('\n');
}
