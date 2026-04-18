import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as game from "../tools/game.js";

const URL = process.env.TEST_URL || "http://localhost:5173";

beforeAll(async () => {
  await game.launch(URL);
});

afterAll(async () => {
  await game.close();
});

describe("main menu e2e", () => {
  it("loads without errors", async () => {
    expect(game.errors()).toEqual([]);
    const dump = await game.dumpState();
    expect(dump.MainMenu?.active).toBe(true);
  });
});
