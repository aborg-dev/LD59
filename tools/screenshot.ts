import { chromium } from 'playwright';
import path from 'path';

const url = process.argv[2] || 'http://localhost:5173';
const outputName = process.argv[3] || `screenshot-${Date.now()}`;
const width = parseInt(process.argv[4] || '480', 10);
const height = parseInt(process.argv[5] || '720', 10);
const delay = parseInt(process.argv[6] || '3000', 10);

async function takeScreenshot() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height } });

  const errors: string[] = [];
  const logs: string[] = [];

  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    errors.push(err.message);
  });

  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });

  console.log(`Waiting ${delay}ms for game to render...`);
  await page.waitForTimeout(delay);

  if (logs.length > 0) {
    console.log('\nBrowser console:');
    logs.forEach(l => console.log(`  ${l}`));
  }

  if (errors.length > 0) {
    console.log('\nBrowser errors:');
    errors.forEach(e => console.log(`  ERROR: ${e}`));
  }

  const outputPath = path.resolve('screenshots', `${outputName}.png`);
  await page.screenshot({ path: outputPath });
  console.log(`\nScreenshot saved to ${outputPath}`);

  await browser.close();
}

takeScreenshot().catch(console.error);
