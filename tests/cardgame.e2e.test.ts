import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CardGameState } from "../tools/game.js";
import * as game from "../tools/game.js";

const URL = process.env.TEST_URL || "http://localhost:5173";

async function cardGameState(): Promise<CardGameState> {
  const dump = await game.dumpState();
  if (!dump.CardGame) throw new Error("CardGame scene not initialized");
  return dump.CardGame;
}

beforeAll(async () => {
  await game.launch(URL);
});

afterAll(async () => {
  await game.close();
});

describe("card game rounds and scoring", () => {
  it("starts a round with AI plays and 1-1 signal mapping", async () => {
    await game.startScene("CardGame");
    await game.advanceTime(50);

    const s = await cardGameState();
    expect(s.round).toBeGreaterThanOrEqual(1);
    expect(s.opponents.length).toBe(2);
    for (const opp of s.opponents) {
      expect(opp.play).toBeGreaterThanOrEqual(1);
      expect(opp.play).toBeLessThanOrEqual(5);
      expect(opp.signal).toBe(opp.play);
    }
  });

  it("scores a correct guess when player reveals matching sum", async () => {
    await game.startScene("CardGame");

    // Force a known scenario: both opponents play 2, you play 3 — sum 7
    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('CardGame');
      gs.opponents[0].play = 2; gs.opponents[0].signal = 2;
      gs.opponents[0].playHand.fingers = 2;
      gs.opponents[0].signalHand.fingers = 2;
      gs.opponents[1].play = 2; gs.opponents[1].signal = 2;
      gs.opponents[1].playHand.fingers = 2;
      gs.opponents[1].signalHand.fingers = 2;
      gs.yourPlay = 3;
      gs.yourGuess = 7;
      gs.phase = 'decide';
      gs.reveal();
    })()`);
    await game.advanceTime(50);

    const s = await cardGameState();
    expect(s.you.actualSum).toBe(7);
    expect(s.lastResult).toBe("correct");
    expect(s.score).toBe(1);
  });

  it("does not score a wrong guess", async () => {
    await game.startScene("CardGame");

    await game.eval_(`(() => {
      const gs = window.game.scene.getScene('CardGame');
      gs.opponents[0].play = 1; gs.opponents[0].signal = 1;
      gs.opponents[1].play = 1; gs.opponents[1].signal = 1;
      gs.yourPlay = 1;
      gs.yourGuess = 10;
      gs.phase = 'decide';
      gs.reveal();
    })()`);
    await game.advanceTime(50);

    const s = await cardGameState();
    expect(s.you.actualSum).toBe(3);
    expect(s.lastResult).toBe("wrong");
    expect(s.score).toBe(0);
  });

  it("ends game on timer expiry", async () => {
    await game.startScene("CardGame");

    const s = await cardGameState();
    await game.advanceTime((s.timeLeft + 1) * 1000);

    const dump = await game.dumpState();
    expect(dump.GameOver?.active).toBe(true);
    expect(typeof dump.GameOver?.finalScore).toBe("number");
  });
});
