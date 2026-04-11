import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import * as browser from './browser.js';

const server = new McpServer({ name: 'gamedev', version: '1.0.0' });

server.tool(
  'screenshot',
  'Take a screenshot of the game',
  {
    url: z.string().default('http://localhost:5173').describe('URL to screenshot'),
    name: z.string().default('screenshot').describe('Output filename (without extension)'),
    width: z.number().default(480).describe('Viewport width'),
    height: z.number().default(720).describe('Viewport height'),
    delay: z.number().default(2000).describe('Delay in ms before capturing'),
  },
  async (opts) => {
    const result = await browser.screenshot(opts);
    const text = [
      `Screenshot saved to ${result.path}`,
      browser.formatLogs(result.errors, result.logs),
    ].filter(Boolean).join('\n\n');

    return {
      content: [
        { type: 'text' as const, text },
        {
          type: 'image' as const,
          data: fs.readFileSync(result.path).toString('base64'),
          mimeType: 'image/png' as const,
        },
      ],
    };
  },
);

server.tool(
  'game_eval',
  'Evaluate JavaScript in the game page. The Phaser game instance is at `window.game`. Use this to inspect game state, object positions, FPS, etc.',
  {
    expression: z.string().describe('JavaScript expression to evaluate in the browser'),
    url: z.string().default('http://localhost:5173').describe('URL of the game'),
    delay: z.number().default(1000).describe('Delay in ms before evaluating'),
  },
  async ({ expression, url, delay }) => {
    try {
      const result = await browser.evaluate(expression, { url, delay });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text' as const, text: `Eval error: ${err.message}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  'game_interact',
  'Simulate user interactions (click, drag, wait) on the game, then return a screenshot.',
  {
    actions: z.array(z.object({
      type: z.enum(['click', 'drag', 'wait']).describe('Action type'),
      x: z.number().optional().describe('X coordinate'),
      y: z.number().optional().describe('Y coordinate'),
      toX: z.number().optional().describe('Drag destination X'),
      toY: z.number().optional().describe('Drag destination Y'),
      duration: z.number().optional().describe('Duration in ms'),
    })).describe('Sequence of actions to perform'),
    url: z.string().default('http://localhost:5173').describe('URL of the game'),
    name: z.string().default('interact').describe('Screenshot filename'),
    delay: z.number().default(1000).describe('Delay in ms before starting actions'),
  },
  async ({ actions, url, name, delay }) => {
    const result = await browser.interact(actions, { url, name, delay });
    return {
      content: [
        { type: 'text' as const, text: `Actions: ${result.actionLog.join(' → ')}\nScreenshot saved to ${result.path}` },
        {
          type: 'image' as const,
          data: fs.readFileSync(result.path).toString('base64'),
          mimeType: 'image/png' as const,
        },
      ],
    };
  },
);

server.tool(
  'game_console',
  'Capture browser console output (logs, warnings, errors).',
  {
    url: z.string().default('http://localhost:5173').describe('URL of the game'),
    delay: z.number().default(2000).describe('How long to collect logs'),
    reload: z.boolean().default(false).describe('Force reload the page'),
  },
  async (opts) => {
    const { logs, errors } = await browser.consoleLogs(opts);
    const output = browser.formatLogs(errors, logs) || 'No console output captured.';
    return {
      content: [{ type: 'text' as const, text: output }],
    };
  },
);

const transport = new StdioServerTransport();
server.connect(transport);
