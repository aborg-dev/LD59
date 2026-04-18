import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as game from "../tools/game.js";

const URL = process.env.TEST_URL || "http://localhost:5173";

beforeAll(async () => {
  await game.launch(URL);
});

afterAll(async () => {
  await game.close();
});

describe("boot e2e", () => {
  it("dev mode loads straight into the shepherd game", async () => {
    expect(game.errors()).toEqual([]);
    const dump = await game.dumpState();
    expect(dump.Shepherd?.active).toBe(true);
  });
});
