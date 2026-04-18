import * as Phaser from "phaser";
import { FONT_BODY, FONT_UI, TEXT_RESOLUTION } from "../fonts.js";

const ROUND_DURATION_SEC = 60;
const HUD_TOP_H = 70;
const HUD_BOTTOM_H = 80;

const SIGNAL_SHOW_MS = 1200;
const REVEAL_MS = 1600;
const NEXT_ROUND_DELAY_MS = 1000;

const SKIN = 0xe7c7a0;
const SKIN_DARK = 0xb88968;
const SKIN_OUTLINE = 0x5a3b22;
const FELT = 0x1d5a38;
const FELT_EDGE = 0x0f3320;

type Phase = "signal" | "decide" | "reveal" | "between";

interface Hand {
  gfx: Phaser.GameObjects.Graphics;
  fingers: number;
  covered: boolean;
}

interface Opponent {
  signalHand: Hand;
  playHand: Hand;
  label: Phaser.GameObjects.Text;
  play: number;
  signal: number;
}

export interface CardGameState {
  active: boolean;
  phase: Phase;
  round: number;
  score: number;
  timeLeft: number;
  opponents: {
    signal: number;
    play: number;
    signalCovered: boolean;
    playCovered: boolean;
  }[];
  you: { play: number; guess: number; actualSum: number };
  lastResult: "correct" | "wrong" | null;
  viewport: { width: number; height: number };
}

export class CardGameScene extends Phaser.Scene {
  private opponents: Opponent[] = [];
  private yourHand!: Hand;

  private phase: Phase = "signal";
  private round = 0;
  private score = 0;
  private timeRemaining = ROUND_DURATION_SEC;
  private gameOver = false;
  private yourPlay = 1;
  private yourGuess = 9;
  private actualSum = 0;
  private lastResult: "correct" | "wrong" | null = null;

  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private sumText!: Phaser.GameObjects.Text;
  private playButtons: Phaser.GameObjects.Text[] = [];
  private guessValueText!: Phaser.GameObjects.Text;
  private guessMinus!: Phaser.GameObjects.Text;
  private guessPlus!: Phaser.GameObjects.Text;
  private commitText!: Phaser.GameObjects.Text;
  private muteText!: Phaser.GameObjects.Text;

  private phaseTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super("CardGame");
  }

  create(): void {
    const { width, height } = this.scale;
    const fieldTop = HUD_TOP_H;
    const fieldBottom = height - HUD_BOTTOM_H;

    this.opponents = [];
    this.playButtons = [];
    this.round = 0;
    this.score = 0;
    this.timeRemaining = ROUND_DURATION_SEC;
    this.gameOver = false;
    this.yourPlay = 1;
    this.yourGuess = 9;
    this.actualSum = 0;
    this.lastResult = null;

    // Table felt
    this.add
      .rectangle(
        width / 2,
        fieldTop + (fieldBottom - fieldTop) / 2,
        width,
        fieldBottom - fieldTop,
        FELT,
      )
      .setDepth(0);

    const tablePad = 24;
    const table = this.add
      .rectangle(
        width / 2,
        fieldTop + (fieldBottom - fieldTop) / 2,
        width - tablePad * 2,
        fieldBottom - fieldTop - tablePad * 2,
        FELT,
      )
      .setDepth(1);
    table.setStrokeStyle(6, FELT_EDGE);

    // Opponents, side-by-side at top
    const opponentY = fieldTop + 230;
    this.opponents.push(
      this.buildOpponent("Alice", 180, opponentY, true),
      this.buildOpponent("Bob", width - 180, opponentY, true),
    );

    // Your row, near bottom of field
    const yourY = fieldBottom - 360;
    this.add
      .text(width / 2, yourY - 110, "You", {
        fontFamily: FONT_UI,
        fontSize: 26,
        color: "#ffe099",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(3);
    this.yourHand = this.makeHand(width / 2, yourY, false);
    this.yourHand.fingers = this.yourPlay;
    this.yourHand.covered = false;
    this.redrawHand(this.yourHand, false);

    // Status / sum display in middle
    const statusY = fieldTop + 500;
    this.statusText = this.add
      .text(width / 2, statusY, "", {
        fontFamily: FONT_UI,
        fontSize: 30,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 5,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.sumText = this.add
      .text(width / 2, statusY + 50, "", {
        fontFamily: FONT_UI,
        fontSize: 44,
        color: "#ffe099",
        stroke: "#000000",
        strokeThickness: 6,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(5);

    // Controls area
    this.buildControls(width, fieldBottom);

    // Top HUD
    this.add
      .rectangle(width / 2, 0, width, HUD_TOP_H, 0x111122)
      .setOrigin(0.5, 0)
      .setDepth(100);

    this.timerText = this.add
      .text(24, HUD_TOP_H / 2, String(ROUND_DURATION_SEC), {
        fontFamily: FONT_UI,
        fontSize: 36,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0, 0.5)
      .setDepth(101);

    this.scoreText = this.add
      .text(width - 24, HUD_TOP_H / 2, "0", {
        fontFamily: FONT_UI,
        fontSize: 36,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(1, 0.5)
      .setDepth(101);

    this.time.addEvent({
      delay: 1000,
      repeat: ROUND_DURATION_SEC - 1,
      callback: () => {
        if (this.gameOver) return;
        this.timeRemaining--;
        this.timerText.setText(String(this.timeRemaining));
        if (this.timeRemaining <= 5) this.timerText.setColor("#ff4444");
        if (this.timeRemaining <= 0) this.endGame();
      },
    });

    // Bottom HUD
    this.add
      .rectangle(width / 2, height, width, HUD_BOTTOM_H, 0x111122)
      .setOrigin(0.5, 1)
      .setDepth(100);

    const btnY = fieldBottom + HUD_BOTTOM_H / 2;
    const btnStyle = {
      fontFamily: FONT_BODY,
      fontSize: 22,
      color: "#ffffff",
      backgroundColor: "#333344",
      padding: { left: 18, right: 18, top: 10, bottom: 10 },
      resolution: TEXT_RESOLUTION,
    };

    const restartText = this.add
      .text(width / 2 - 200, btnY, "RESTART", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    restartText.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.restart();
    });

    const menuText = this.add
      .text(width / 2, btnY, "MENU", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    menuText.on("pointerdown", () => {
      this.sound.play("pop");
      this.scene.start("MainMenu");
    });

    const muted = this.game.sound.mute;
    this.muteText = this.add
      .text(width / 2 + 200, btnY, muted ? "UNMUTE" : "MUTE", btnStyle)
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    this.muteText.on("pointerdown", () => {
      this.game.sound.mute = !this.game.sound.mute;
      this.muteText.setText(this.game.sound.mute ? "UNMUTE" : "MUTE");
    });

    this.updateYourHand();
    this.updateGuessText();
    this.updatePlayButtonStyles();
    this.startRound();
  }

  private buildOpponent(
    name: string,
    cx: number,
    cy: number,
    flipped: boolean,
  ): Opponent {
    const label = this.add
      .text(cx, cy - 110, name, {
        fontFamily: FONT_UI,
        fontSize: 24,
        color: "#ffe099",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(3);

    const signalHand = this.makeHand(cx - 70, cy, flipped);
    const playHand = this.makeHand(cx + 70, cy, flipped);

    return {
      label,
      signalHand,
      playHand,
      signal: 1,
      play: 1,
    };
  }

  private makeHand(x: number, y: number, flipped: boolean): Hand {
    const g = this.add.graphics().setPosition(x, y).setDepth(4);
    if (flipped) g.setAngle(180);
    const hand: Hand = { gfx: g, fingers: 1, covered: true };
    this.redrawHand(hand, false);
    return hand;
  }

  private redrawHand(hand: Hand, accent: boolean): void {
    const g = hand.gfx;
    g.clear();

    // Wrist
    g.fillStyle(SKIN_DARK);
    g.lineStyle(3, SKIN_OUTLINE);
    g.fillRoundedRect(-28, 40, 56, 36, 6);
    g.strokeRoundedRect(-28, 40, 56, 36, 6);

    if (hand.covered) {
      // Fist — palm with curled knuckles
      g.fillStyle(SKIN);
      g.lineStyle(3, SKIN_OUTLINE);
      g.fillRoundedRect(-50, -35, 100, 80, 22);
      g.strokeRoundedRect(-50, -35, 100, 80, 22);
      g.fillStyle(SKIN_DARK);
      for (let i = 0; i < 4; i++) {
        const x = -36 + i * 24;
        g.fillCircle(x, -32, 8);
        g.lineStyle(2, SKIN_OUTLINE);
        g.strokeCircle(x, -32, 8);
      }
      // thumb stub wrapping over knuckles
      g.fillStyle(SKIN);
      g.lineStyle(3, SKIN_OUTLINE);
      g.fillRoundedRect(-58, -12, 36, 22, 10);
      g.strokeRoundedRect(-58, -12, 36, 22, 10);
      if (accent) this.drawHandAccent(g);
      return;
    }

    // Open hand
    // Fingers (index, middle, ring, pinky) pointing up
    const fingerPositions: Array<[number, number, number, number]> = [
      [-33, -10, 18, 55],
      [-11, -10, 18, 68],
      [11, -10, 18, 62],
      [32, -10, 16, 48],
    ];

    const extendedCount = Math.min(hand.fingers, 4);
    for (let i = 0; i < 4; i++) {
      const [x, y, w, h] = fingerPositions[i];
      g.fillStyle(SKIN);
      g.lineStyle(3, SKIN_OUTLINE);
      if (i < extendedCount) {
        g.fillRoundedRect(x - w / 2, y - h, w, h, w / 2.5);
        g.strokeRoundedRect(x - w / 2, y - h, w, h, w / 2.5);
      } else {
        g.fillRoundedRect(x - w / 2, y - 14, w, 14, w / 3);
        g.strokeRoundedRect(x - w / 2, y - 14, w, 14, w / 3);
      }
    }

    // Palm
    g.fillStyle(SKIN);
    g.lineStyle(3, SKIN_OUTLINE);
    g.fillRoundedRect(-50, -12, 100, 58, 18);
    g.strokeRoundedRect(-50, -12, 100, 58, 18);

    // Thumb
    g.fillStyle(SKIN);
    g.lineStyle(3, SKIN_OUTLINE);
    if (hand.fingers >= 5) {
      g.fillRoundedRect(-80, 0, 40, 22, 10);
      g.strokeRoundedRect(-80, 0, 40, 22, 10);
    } else {
      g.fillRoundedRect(-62, 8, 28, 20, 9);
      g.strokeRoundedRect(-62, 8, 28, 20, 9);
    }

    if (accent) this.drawHandAccent(g);
  }

  private drawHandAccent(g: Phaser.GameObjects.Graphics): void {
    g.lineStyle(4, 0xffe066);
    g.strokeRoundedRect(-65, -80, 130, 170, 18);
  }

  private buildControls(width: number, fieldBottom: number): void {
    const ctrlTop = fieldBottom - 230;

    const playLabel = this.add
      .text(width / 2, ctrlTop, "Your play", {
        fontFamily: FONT_BODY,
        fontSize: 20,
        color: "#dddddd",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(5);
    void playLabel;

    const spacing = 80;
    const startX = width / 2 - spacing * 2;
    for (let i = 1; i <= 5; i++) {
      const btn = this.add
        .text(startX + (i - 1) * spacing, ctrlTop + 40, String(i), {
          fontFamily: FONT_UI,
          fontSize: 28,
          color: "#ffffff",
          backgroundColor: "#333344",
          padding: { left: 16, right: 16, top: 10, bottom: 10 },
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0.5)
        .setDepth(5)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerdown", () => {
        if (this.phase !== "decide") return;
        this.yourPlay = i;
        this.sound.play("pop");
        this.updateYourHand();
        this.updatePlayButtonStyles();
      });
      this.playButtons.push(btn);
    }

    // Guess stepper
    this.add
      .text(width / 2, ctrlTop + 100, "Guess total sum", {
        fontFamily: FONT_BODY,
        fontSize: 20,
        color: "#dddddd",
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.guessMinus = this.add
      .text(width / 2 - 90, ctrlTop + 150, "−", {
        fontFamily: FONT_UI,
        fontSize: 32,
        color: "#ffffff",
        backgroundColor: "#333344",
        padding: { left: 18, right: 18, top: 6, bottom: 6 },
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    this.guessMinus.on("pointerdown", () => {
      if (this.phase !== "decide") return;
      this.yourGuess = Math.max(3, this.yourGuess - 1);
      this.sound.play("pop");
      this.updateGuessText();
    });

    this.guessValueText = this.add
      .text(width / 2, ctrlTop + 150, String(this.yourGuess), {
        fontFamily: FONT_UI,
        fontSize: 36,
        color: "#ffe099",
        stroke: "#000",
        strokeThickness: 4,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.guessPlus = this.add
      .text(width / 2 + 90, ctrlTop + 150, "+", {
        fontFamily: FONT_UI,
        fontSize: 32,
        color: "#ffffff",
        backgroundColor: "#333344",
        padding: { left: 18, right: 18, top: 6, bottom: 6 },
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    this.guessPlus.on("pointerdown", () => {
      if (this.phase !== "decide") return;
      this.yourGuess = Math.min(15, this.yourGuess + 1);
      this.sound.play("pop");
      this.updateGuessText();
    });

    this.commitText = this.add
      .text(width / 2, ctrlTop + 210, "COMMIT", {
        fontFamily: FONT_UI,
        fontSize: 26,
        color: "#ffffff",
        backgroundColor: "#804020",
        padding: { left: 28, right: 28, top: 12, bottom: 12 },
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    this.commitText.on("pointerdown", () => {
      if (this.phase !== "decide") return;
      this.reveal();
    });
  }

  private updatePlayButtonStyles(): void {
    for (let i = 0; i < this.playButtons.length; i++) {
      const btn = this.playButtons[i];
      const selected = i + 1 === this.yourPlay;
      btn.setStyle({
        fontFamily: FONT_UI,
        fontSize: 28,
        color: selected ? "#111111" : "#ffffff",
        backgroundColor: selected ? "#ffe099" : "#333344",
      });
    }
  }

  private updateYourHand(): void {
    this.yourHand.fingers = this.yourPlay;
    this.yourHand.covered = false;
    this.redrawHand(this.yourHand, false);
  }

  private updateGuessText(): void {
    this.guessValueText.setText(String(this.yourGuess));
  }

  private startRound(): void {
    if (this.gameOver) return;
    this.round++;
    this.lastResult = null;
    this.sumText.setText("");
    this.statusText.setText("Watch the signals…");

    for (const opp of this.opponents) {
      opp.play = Phaser.Math.Between(1, 5);
      opp.signal = opp.play; // 1-1 mapping
      opp.signalHand.fingers = opp.signal;
      opp.signalHand.covered = false;
      opp.playHand.fingers = opp.play;
      opp.playHand.covered = true;
      this.redrawHand(opp.signalHand, false);
      this.redrawHand(opp.playHand, false);
    }

    this.phase = "signal";
    this.phaseTimer?.remove();
    this.phaseTimer = this.time.delayedCall(SIGNAL_SHOW_MS, () =>
      this.enterDecide(),
    );
  }

  private enterDecide(): void {
    if (this.gameOver) return;
    this.phase = "decide";
    this.statusText.setText("Pick your play and guess the total");
  }

  private reveal(): void {
    if (this.gameOver) return;
    this.phase = "reveal";
    this.sound.play("bounce");

    let sum = this.yourPlay;
    for (const opp of this.opponents) {
      opp.playHand.covered = false;
      opp.signalHand.covered = false;
      this.redrawHand(opp.playHand, false);
      this.redrawHand(opp.signalHand, false);
      sum += opp.play;
    }

    this.actualSum = sum;
    const correct = this.yourGuess === sum;
    this.lastResult = correct ? "correct" : "wrong";

    if (correct) {
      this.score++;
      this.scoreText.setText(String(this.score));
      this.sound.play("score");
      this.statusText.setText("Correct!");
      this.statusText.setColor("#88ff88");
    } else {
      this.statusText.setText("Wrong.");
      this.statusText.setColor("#ff6666");
    }
    this.sumText.setText(
      `${this.opponents[0].play} + ${this.opponents[1].play} + ${this.yourPlay} = ${sum}`,
    );

    this.phaseTimer?.remove();
    this.phaseTimer = this.time.delayedCall(REVEAL_MS, () => {
      this.statusText.setColor("#ffffff");
      this.phase = "between";
      this.time.delayedCall(NEXT_ROUND_DELAY_MS, () => {
        if (!this.gameOver) this.startRound();
      });
    });
  }

  private endGame(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.phaseTimer?.remove();
    this.scene.start("GameOver", {
      score: this.score,
      returnScene: "CardGame",
    });
  }

  dumpState(): CardGameState {
    return {
      active: this.scene.isActive(),
      phase: this.phase,
      round: this.round,
      score: this.score,
      timeLeft: this.timeRemaining,
      opponents: this.opponents.map((o) => ({
        signal: o.signal,
        play: o.play,
        signalCovered: o.signalHand.covered,
        playCovered: o.playHand.covered,
      })),
      you: {
        play: this.yourPlay,
        guess: this.yourGuess,
        actualSum: this.actualSum,
      },
      lastResult: this.lastResult,
      viewport: { width: this.scale.width, height: this.scale.height },
    };
  }
}
