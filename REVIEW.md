# Phaser 4 Code Review — Soccer Fling

Audit of game source code against official Phaser 4 skill files (`skills/phaser/`).

---

## High Severity

### H1. Test hook uses unsafe SceneManager API

`src/main.ts:66-68`

```ts
window.advanceTime = (ms: number) => {
  game.scene.update(performance.now(), ms);
};
```

`game.scene.update()` drives the full SceneManager step loop (clocks, tweens, render pipeline) in ways not intended for external callers. Can desync `this.time.now`, pointer state, and the render phase relative to the physics step. Works today because `GameScene.update` only uses `delta`, but fragile.

**Recommendation:** Call `update(time, delta)` directly on the target scene, or expose a `GameScene.tick(ms)` method that runs the accumulator without touching other systems. Ref: scenes.md "Scene Lifecycle".

### H2. Input listeners leak on scene restart

`src/scenes/GameScene.ts:200-237`

`pointermove` / `pointerup` handlers are registered in `create()`. On `scene.restart()`, `create()` runs again and registers a second set. Saved today because shutdown rebuilds `this.input`, but if anyone switches to `scene.launch` or pause/resume, duplicate listeners will fire.

**Recommendation:** Unbind via `this.events.once(Phaser.Scenes.Events.SHUTDOWN, ...)`, or convert to Phaser's built-in drag API. Ref: input.md "Scene-level pointer events"; scenes.md "Scene Lifecycle".

---

## Medium Severity

### M1. Custom drag re-invents setDraggable

`src/scenes/GameScene.ts:187-237`

Code manually tracks `dragging`, `lastPointerX/Y`, `lastPointerTime`, clamps ball to field bounds, and computes release velocity. Phaser provides this via `setInteractive({ draggable: true })` + `drag`/`dragend` events. `Phaser.Input.Pointer` exposes a smoothed `velocity: Vector2`.

**Tradeoff:** The custom 100ms stale-drag cutoff (line 228) is domain-specific tuning that built-in drag does not replicate. Keep custom code if you want that exact feel; otherwise this halves the input section.

**Recommendation:** Evaluate switching to built-in drag. Ref: input.md "Drag and Drop", "Pointers".

### M2. Timer and resetDelay driven by custom accumulator unnecessarily

`src/scenes/GameScene.ts:298-335`

The fixed-timestep accumulator is correct for ball physics (determinism + state dumps), but the 1-second countdown (`elapsed`) and ball-reset delay (`resetDelay`) are independent of physics and would be simpler as Phaser time events:

- Countdown: `this.time.addEvent({ delay: 1000, repeat: ROUND_DURATION_SEC-1, callback })` (time.md "Repeating Timer")
- Reset delay: `this.time.delayedCall(500, () => { ... })` (time.md "Delayed Call")

~20 lines simpler, tests still work via `timer.getOverallRemainingSeconds()`.

### M3. Drag velocity uses raw pointer delta, not clamped delta

`src/scenes/GameScene.ts:204-218`

Ball position is clamped to field bounds after applying the pointer delta, but `dragVelX/Y` is computed from the raw `dx/dy` before clamping. Dragging along a wall gives large release velocity with no visual motion.

**Fix:** Compute `dragVelX/Y` from the position delta after clamping, not from the raw pointer delta.

### M4. Bounce sound can stack on same frame

`src/scenes/GameScene.ts` (6 call sites)

`this.sound.play('bounce')` can fire multiple times per frame (e.g. corner bounce). Rapid-fire play with HTML5Audio can stutter.

**Recommendation:** Track last-play timestamp and skip if <50ms, or use `this.sound.add('bounce')` for a reusable instance. Ref: audio.md.

---

## Low Severity

### L1. TEXT_RESOLUTION captured once at module load

`src/fonts.ts:4` — `window.devicePixelRatio` captured at import time. Moving to a different-DPI monitor mid-game leaves text at original DPR. Acceptable for a jam game.

### L2. fontSize as number instead of string

`GameScene.ts`, `MainMenu.ts`, `GameOver.ts` — `fontSize: 48` works via coercion, but Phaser types prefer `fontSize: '48px'`. Pure style nit.

### L3. Score/timer animations are missed opportunities for tweens

On score (line 252), the ball just disappears. A one-liner tween on `scoreText` adds significant game feel:

```ts
this.tweens.add({ targets: this.scoreText, scale: { from: 1.3, to: 1 }, duration: 200 });
```

Same for `tl <= 5` color flip — could be a blink tween. Ref: tweens.md "Basic Tween".

### L4. Menu pointerdown can carry over from previous scene

`MainMenu.ts`, `GameOver.ts` — `this.input.once('pointerdown', ...)` fires immediately if the previous scene was also click-to-dismiss. Safeguard: short delay or listen for `pointerup` instead.

---

## v3 Patterns

**None found.** No deprecated APIs (`setTintFill`, `Geom.Point`, `Math.PI2`, `setPipeline`, `BitmapMask`, `Phaser.Struct.*`, `Mesh`/`Plane`).

Only note: v4's `roundPixels` now defaults to `false` (was `true` in v3). Enable in game config if the ball looks soft.

---

## Things Done Well

- Clean 5-scene architecture with proper `super(key)` and data passing via `scene.start`
- `this.load.setPath('assets')` in Preloader (recommended pattern)
- Fixed-step accumulator for gameplay physics (intentional, correctly implemented)
- Font constants + `TEXT_RESOLUTION` centralization
- Explicit `setOrigin` on every text object
- Typed `dumpState()` per scene with defensive `tryDump` wrapper
- HUD depth separation (100/101) above court
- DOM debug panel in `main.ts`, separate from game code
- Ball can't escape play area (bounds clamping correct)
