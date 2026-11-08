// The Reel's soundtrack, ported from the tutorials' audio.py so the server needs no Python: a light D-major bed at
// 100 BPM, and on top of it the events (a swish, a chime as each side is revealed, a tap, the end card's chord).
// Returns a 16-bit stereo WAV.
const SR = 48000, BEAT = 60 / 100, BAR = 4 * BEAT;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
// D major: Dmaj9, Bm9, Gmaj9, A6sus, as [bass, voicing] in MIDI notes
const CHORDS = [[50, [62, 66, 69, 73, 76]], [47, [62, 66, 69, 71, 73]], [43, [62, 66, 67, 71, 74]], [45, [62, 64, 66, 69, 73]]];
const PENT = [74, 76, 78, 81, 83, 86];      // D pentatonic, high: the tap

export function soundtrack(events, duration, endAt, seed = 7) {
  const n = Math.round(duration * SR), L = new Float64Array(n), R = new Float64Array(n);
  let s = seed >>> 0;
  const rand = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
  const hiss = (len) => { let a = gauss(); return Float64Array.from({ length: len }, () => -a + (a = gauss())); };      // noise, differenced
  // f(i) for i in 0..len, at time t, with a gain and a pan (-1 left .. 1 right)
  const add = (t, len, gain, pan, f) => {
    const i0 = Math.round(t * SR), gl = gain * Math.sqrt(0.5 * (1 - pan)), gr = gain * Math.sqrt(0.5 * (1 + pan));
    for (let i = Math.max(0, -i0); i < len && i0 + i < n; i++) { const v = f(i); L[i0 + i] += v * gl; R[i0 + i] += v * gr; }
  };
  const tone = (f, harm, detune = 0) => (i) => {
    let v = 0;
    for (let k = 0; k < harm.length; k++) v += harm[k] * Math.sin(2 * Math.PI * f * (k + 1) * (1 + detune) * (i / SR) + k + 1);
    return v;
  };
  const env = (len, a, d, rel) => (i) => {
    const t = i / SR;
    let e = Math.min(1, t / Math.max(a, 1e-4));
    if (d != null) e *= Math.exp(-t / d);
    if (rel) e *= Math.min(Math.max((len / SR - t) / rel, 0), 1);
    return e;
  };
  const shaped = (sig, e) => (i) => sig(i) * e(i);
  const len = (sec) => Math.round(sec * SR);

  const pattern = [1, 0, 1, 1, 0, 1, 0, 1];
  for (let b = 0; b * BAR < duration; b++) {
    const t0 = b * BAR, last = t0 + BAR >= endAt;
    const [root, notes] = t0 >= endAt - 0.01 ? CHORDS[0] : CHORDS[b % 4];
    const pad = len(BAR + 1.2);      // slow, wide, soft
    for (const m of notes) for (const [pan, dt] of [[-0.6, -0.0025], [0.6, 0.0025]]) add(t0, pad, 0.02, pan, shaped(tone(hz(m), [1, 0.18, 0.05], dt), env(pad, 0.5, null, 1)));
    for (const [bt, g] of [[0, 1], [2.5, 0.55]]) add(t0 + bt * BEAT, len(1.6), 0.11 * g, 0, shaped(tone(hz(root), [1, 0.35, 0.1]), env(len(1.6), 0.01, 0.55)));      // bass
    pattern.forEach((on, k) => {      // mallet arpeggio on the eighths
      if (!on || (last && t0 + (k * BEAT) / 2 >= endAt)) return;
      const m = notes[(k * 2 + b) % notes.length] + 12;
      add(t0 + (k * BEAT) / 2, len(0.7), 0.045 * (k % 4 === 0 ? 1 : 0.7), k % 2 ? 0.35 : -0.35, shaped(tone(hz(m), [1, 0, 0.12]), env(len(0.7), 0.004, 0.16)));
    });
    for (let k = 1; k < 8; k += 2) { const h = hiss(len(0.05)); add(t0 + (k * BEAT) / 2, h.length, 0.01, 0.3, shaped((i) => h[i], env(h.length, 0.002, 0.012))); }      // shaker
    for (const bt of [0, 2]) {      // soft kick on 1 and 3
      if (t0 + bt * BEAT >= endAt) continue;
      add(t0 + bt * BEAT, len(0.3), 0.1, 0, (i) => { const t = i / SR; return Math.sin(2 * Math.PI * (48 * t + (70 * (1 - Math.exp(-t * 30))) / 30)) * Math.exp(-t * 14); });
    }
  }

  for (const e of events) {
    if (e.type === "tap") {
      const m = PENT[1 + Math.floor(rand() * 3)], click = hiss(len(0.006));
      add(e.t, len(0.25), 0.1, 0, shaped(tone(hz(m), [1, 0, 0.05]), env(len(0.25), 0.002, 0.045)));
      add(e.t, click.length, 0.035, 0, shaped((i) => click[i], env(click.length, 0.0005, 0.0015)));
    } else if (e.type === "swipe") {
      // a rising band of noise: smoothed less as it goes, minus its own slow average
      const ln = len(0.32), sw = new Float64Array(ln);
      for (let i = 0, acc = 0; i < ln; i++) sw[i] = acc += (0.06 + (0.34 * i) / (ln - 1)) * (gauss() - acc);
      const sum = [0];
      for (const v of sw) sum.push(sum.at(-1) + v);
      const avg = (i) => (sum[Math.min(ln, i + 20)] - sum[Math.max(0, i - 20)]) / 40;
      add(e.t, ln, 0.09, 0, (i) => (sw[i] - avg(i)) * Math.sin((Math.PI * i) / ln) ** 2);
    } else if (e.type === "arc") {
      add(e.t, len(1.6), 0.07, [-0.3, 0, 0.3][e.i], shaped(tone(hz([74, 78, 81][e.i]), [1, 0.2, 0.06]), env(len(1.6), 0.003, 0.5)));
    } else if (e.type === "end") {
      const ln = len(duration - e.t);
      for (const m of [50, 62, 66, 69, 73, 76]) add(e.t, ln, m > 55 ? 0.028 : 0.09, 0, shaped(tone(hz(m), [1, 0.15]), env(ln, 0.25, null, 1.4)));
    }
  }

  // fades, a gentle limiter, then -3 dBFS peak
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = Math.min(t / 0.04, 1) * Math.min(Math.max((duration - t) / 1.2, 0), 1);
    L[i] = Math.tanh(L[i] * f * 1.6) / 1.6; R[i] = Math.tanh(R[i] * f * 1.6) / 1.6;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const k = 10 ** (-3 / 20) / peak, wav = Buffer.alloc(44 + n * 4);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + n * 4, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28);
  wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { wav.writeInt16LE(Math.round(L[i] * k * 32767), 44 + i * 4); wav.writeInt16LE(Math.round(R[i] * k * 32767), 46 + i * 4); }
  return wav;
}
