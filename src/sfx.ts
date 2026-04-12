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

/** Tennis ball "thock" — short noise impact + low thump. */
export function bounce(intensity = 0.5): void {
  const c = getCtx();
  const t = c.currentTime;
  const vol = 0.1 + intensity * 0.15;
  const dur = 0.08;

  // Impact noise — filtered burst for the "thock" character
  const noiseBuf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const noise = noiseBuf.getChannelData(0);
  for (let i = 0; i < noise.length; i++) {
    noise[i] = Math.random() * 2 - 1;
  }
  const noiseSrc = c.createBufferSource();
  noiseSrc.buffer = noiseBuf;

  const bandpass = c.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.setValueAtTime(3000 + intensity * 1500, t);
  bandpass.Q.value = 1.2;

  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(vol, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  noiseSrc.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(c.destination);
  noiseSrc.start(t);
  noiseSrc.stop(t + dur);

  // Low thump — very short sine for body
  const osc = c.createOscillator();
  const oscGain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120 + intensity * 60, t);
  osc.frequency.exponentialRampToValueAtTime(50, t + dur);
  oscGain.gain.setValueAtTime(vol * 0.6, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(oscGain);
  oscGain.connect(c.destination);
  osc.start(t);
  osc.stop(t + dur);
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
