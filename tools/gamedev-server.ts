import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as game from "./game.js";

const DEFAULT_URL = "http://localhost:5173";

const server = new McpServer({ name: "gamedev", version: "1.0.0" });

server.tool(
  "screenshot",
  "Take a screenshot of the game",
  {
    url: z.string().default(DEFAULT_URL).describe("URL to screenshot"),
    name: z
      .string()
      .default("screenshot")
      .describe("Output filename (without extension)"),
    width: z.number().default(480).describe("Viewport width"),
    height: z.number().default(720).describe("Viewport height"),
  },
  async ({ url, name, width, height }) => {
    await game.launch(url, width, height);
    const outputPath = await game.screenshot(name);
    const { readFileSync } = await import("node:fs");

    return {
      content: [
        { type: "text" as const, text: `Screenshot saved to ${outputPath}` },
        {
          type: "image" as const,
          data: readFileSync(outputPath).toString("base64"),
          mimeType: "image/png" as const,
        },
      ],
    };
  },
);

server.tool(
  "game_eval",
  "Evaluate JavaScript in the game page. The Phaser game instance is at `window.game`. Use this to inspect game state, object positions, FPS, etc.",
  {
    expression: z
      .string()
      .describe("JavaScript expression to evaluate in the browser"),
    url: z.string().default(DEFAULT_URL).describe("URL of the game"),
  },
  async ({ expression, url }) => {
    await game.launch(url);
    try {
      const result = await game.eval_(expression);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Eval error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
);

server.tool(
  "game_interact",
  "Drag the ball to a new position, then return a screenshot.",
  {
    fromX: z.number().describe("Start X"),
    fromY: z.number().describe("Start Y"),
    toX: z.number().describe("End X"),
    toY: z.number().describe("End Y"),
    name: z.string().default("interact").describe("Screenshot filename"),
    url: z.string().default(DEFAULT_URL).describe("URL of the game"),
  },
  async ({ fromX, fromY, toX, toY, name, url }) => {
    await game.launch(url);
    await game.drag(fromX, fromY, toX, toY);
    const outputPath = await game.screenshot(name);
    const { readFileSync } = await import("node:fs");

    return {
      content: [
        {
          type: "text" as const,
          text: `Dragged (${fromX},${fromY}) → (${toX},${toY})\nScreenshot saved to ${outputPath}`,
        },
        {
          type: "image" as const,
          data: readFileSync(outputPath).toString("base64"),
          mimeType: "image/png" as const,
        },
      ],
    };
  },
);

server.tool(
  "game_state",
  "Get the current state of the ball (position, radius, game dimensions).",
  {
    url: z.string().default(DEFAULT_URL).describe("URL of the game"),
  },
  async ({ url }) => {
    await game.launch(url);
    const circle = await game.getCircle();
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(circle, null, 2) },
      ],
    };
  },
);

const transport = new StdioServerTransport();
server.connect(transport);
