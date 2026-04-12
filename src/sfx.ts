let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/** Resume audio context after a user gesture (required by browsers). */
export function resume(): void {
  const c = getCtx();
  if (c.state === "suspended") c.resume();
}

/** Short percussive bounce — pitched by how hard the hit was. */
export function bounce(intensity = 0.5): void {
  const c = getCtx();
  const t = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);

  const freq = 200 + intensity * 400;
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);

  const vol = 0.15 + intensity * 0.15;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

  osc.start(t);
  osc.stop(t + 0.15);
}

/** Soft whoosh for fling release. */
export function whoosh(): void {
  const c = getCtx();
  const t = c.currentTime;

  // Filtered noise burst
  const buf = c.createBuffer(1, c.sampleRate * 0.12, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const src = c.createBufferSource();
  src.buffer = buf;

  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1000, t);
  filter.frequency.exponentialRampToValueAtTime(3000, t + 0.06);
  filter.frequency.exponentialRampToValueAtTime(500, t + 0.12);
  filter.Q.value = 1.5;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);

  src.start(t);
  src.stop(t + 0.12);
}

/** Short click/pop for UI interactions. */
export function pop(): void {
  const c = getCtx();
  const t = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(800, t);
  osc.frequency.exponentialRampToValueAtTime(400, t + 0.06);

  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

  osc.start(t);
  osc.stop(t + 0.06);
}
