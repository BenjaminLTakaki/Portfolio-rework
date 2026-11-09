// The Reel's sound: quiet effects on the cuts and nothing else, as in the Reel template (certior-reel-template v5):
// a soft thud as it opens and on the end card, air rising into the map's landing and under the sheet, a tick as the
// pin lands, a tap as each headline lands. Nothing pitched (synthesised music sounded like a ringtone) and no voice.
// Peaks at -7 dBFS, about -24 LUFS, so a song added from Instagram's library sits on top. Returns a 16-bit stereo WAV.
const SR = 48000;

/** A 2nd-order filter (RBJ's cookbook, Butterworth Q): low- or high-pass at f Hz, or f(i) Hz changing over time. */
function biquad(x, type, f) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0, b1, b2, a1, a2;
  for (let i = 0; i < x.length; i++) {
    if (i % 256 === 0 || i === 0) {
      const w = (2 * Math.PI * Math.min(typeof f === "function" ? f(i) : f, SR * 0.45)) / SR, cos = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al;
      [b0, b1, b2] = type === "low" ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
      [b0, b1, b2, a1, a2] = [b0 / a0, b1 / a0, b2 / a0, (-2 * cos) / a0, (1 - al) / a0];
    }
    y[i] = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    [x2, x1, y2, y1] = [x1, x[i], y1, y[i]];
  }
  return y;
}

export function effects({ duration, land, reveals, transition, endHit, seed = 11 }) {
  const n = Math.round(duration * SR), L = new Float32Array(n), R = new Float32Array(n), sendL = new Float32Array(n), sendR = new Float32Array(n);
  let s = seed >>> 0;
  const rand = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const noise = (len) => Float64Array.from({ length: len }, () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand()));
  const add = (x, at, gain, pan = 0, send = 0) => {
    const i0 = Math.round(at * SR), gl = Math.sqrt(1 - pan), gr = Math.sqrt(1 + pan);
    for (let i = 0; i < x.length && i0 + i < n; i++) {
      if (i0 + i < 0) continue;
      L[i0 + i] += x[i] * gain * gl; R[i0 + i] += x[i] * gain * gr;
      sendL[i0 + i] += x[i] * gain * gl * send; sendR[i0 + i] += x[i] * gain * gr * send;
    }
  };
  // air: noise opening up from lo to hi Hz, loudest at `peak` of its length
  const whoosh = (len, lo, hi, peak) => {
    const m = Math.round(len * SR), x = biquad(biquad(noise(m), "high", lo * 0.5), "low", (i) => lo * (hi / lo) ** Math.min(1, i / m / peak));
    return x.map((v, i) => { const t = i / (m - 1); return v * (t < peak ? (t / peak) ** 2.2 : ((1 - t) / (1 - peak)) ** 1.6); });
  };
  // a soft low hit: a falling sine, felt more than heard on a phone, with a breath of noise on its attack
  const thud = (len, f0, f1) => {
    const m = Math.round(len * SR), air = biquad(noise(m), "low", 1800), x = new Float64Array(m);
    for (let i = 0, ph = 0; i < m; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (f1 + (f0 - f1) * Math.exp(-t * 18))) / SR;
      x[i] = Math.sin(ph) * Math.exp(-t * 6) + air[i] * Math.exp(-t * 40) * 0.3;
    }
    return x;
  };
  // a light tap, like a card set down: a click of filtered noise over a very short knock
  const tap = (bright = 1) => {
    const m = Math.round(0.12 * SR), click = biquad(biquad(noise(m), "high", 1400 * bright), "low", 4800 * bright);
    return click.map((v, i) => { const t = i / SR; return v * Math.exp(-t * 260) * 0.5 + Math.sin(2 * Math.PI * 150 * t) * Math.exp(-t * 60) * 0.5; });
  };

  add(thud(0.9, 120, 40), 0, 0.7, 0, 0.15);
  add(whoosh(land + 0.02, 250, 6000, 0.92), 0, 0.3);
  add(tap(1.6), land, 0.4, -0.1, 0.3);
  reveals.forEach((at, i) => add(tap(), at, 0.55, [-0.25, 0, 0.25][i], 0.25));
  add(whoosh(0.45, 200, 5000, 0.35), transition - 0.05, 0.3);      // loudest as the sheet rises fastest
  add(thud(1.4, 100, 38), endHit, 0.65, 0, 0.25);

  // a small room for the sends: four damped combs and two all-passes a side (Freeverb's, ~1 s)
  const room = (x, spread) => {
    const y = new Float32Array(n);
    for (const d0 of [1214, 1293, 1390, 1476]) {
      const d = d0 + spread, buf = new Float64Array(d), g = 10 ** ((-3 * d) / SR / 1.0);
      for (let i = 0, j = 0, lp = 0; i < n; i++, j = (j + 1) % d) {
        const out = buf[j];
        lp = out * 0.7 + lp * 0.3;
        buf[j] = x[i] + lp * g;
        y[i] += out / 4;
      }
    }
    for (const d of [605 + spread, 480 + spread]) {
      const buf = new Float64Array(d);
      for (let i = 0, j = 0; i < n; i++, j = (j + 1) % d) { const b = buf[j], v = y[i] + b * 0.5; buf[j] = v; y[i] = b - v * 0.5; }
    }
    return y;
  };
  const wl = room(sendL, 0), wr = room(sendR, 23);
  const outL = biquad(L.map((v, i) => v + 0.6 * wl[i]), "high", 30), outR = biquad(R.map((v, i) => v + 0.6 * wr[i]), "high", 30);

  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
  const k = 10 ** (-7 / 20) / peak, fade = Math.round(0.4 * SR), wav = Buffer.alloc(44 + n * 4);      // peaks at -7 dBFS
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + n * 4, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28);
  wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const f = Math.min(1, (n - i) / fade) ** 2;
    wav.writeInt16LE(Math.round(outL[i] * k * f * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(outR[i] * k * f * 32767), 46 + i * 4);
  }
  return wav;
}
