// The Reel's sound: a voice reading the story over a soft D-major pad at 100 BPM, a swish on each swipe, and the end
// card's chord. The pad is what is left of the tutorials' audio.py once the mallets and chimes that made it sound like
// a ringtone are gone. soundtrack() returns a 16-bit stereo WAV.
// The voice is Kokoro (82M parameters, Apache-2.0), run on this machine, so it costs nothing: speak() below.
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const SR = 48000, BEAT = 60 / 100, BAR = 4 * BEAT;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
// D major: Dmaj9, Bm9, Gmaj9, A6sus, as [bass, voicing] in MIDI notes
const CHORDS = [[50, [62, 66, 69, 73, 76]], [47, [62, 66, 69, 71, 73]], [43, [62, 66, 67, 71, 74]], [45, [62, 64, 66, 69, 73]]];

/** events: { t, type: "swipe" | "end" } or { t, type: "voice", pcm: Float32Array, sr }. */
export function soundtrack(events, duration, endAt, seed = 7) {
  const n = Math.round(duration * SR), L = new Float64Array(n), R = new Float64Array(n);
  let s = seed >>> 0;
  const rand = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
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

  for (let b = 0; b * BAR < duration; b++) {      // the bed, quiet under the voice
    const t0 = b * BAR, [root, notes] = t0 >= endAt - 0.01 ? CHORDS[0] : CHORDS[b % 4];
    const pad = len(BAR + 1.2);      // slow, wide, soft
    for (const m of notes) for (const [pan, dt] of [[-0.6, -0.0025], [0.6, 0.0025]]) add(t0, pad, 0.012, pan, shaped(tone(hz(m), [1, 0.18, 0.05], dt), env(pad, 0.5, null, 1)));
    for (const [bt, g] of [[0, 1], [2.5, 0.55]]) add(t0 + bt * BEAT, len(1.6), 0.06 * g, 0, shaped(tone(hz(root), [1, 0.35, 0.1]), env(len(1.6), 0.01, 0.55)));      // bass
  }

  let vpeak = 1e-9;      // every line at the loudest line's level
  for (const e of events) if (e.type === "voice") for (const v of e.pcm) vpeak = Math.max(vpeak, Math.abs(v));
  for (const e of events) {
    if (e.type === "voice") {      // brought from the voice's rate to ours
      const p = e.pcm, r = e.sr / SR;
      add(e.t, Math.floor((p.length - 1) / r), 0.9 / vpeak, 0, (i) => { const x = i * r, j = Math.floor(x), f = x - j; return p[j] * (1 - f) + p[j + 1] * f; });
    } else if (e.type === "swipe") {
      // a rising band of noise: smoothed less as it goes, minus its own slow average
      const ln = len(0.32), sw = new Float64Array(ln);
      for (let i = 0, acc = 0; i < ln; i++) sw[i] = acc += (0.06 + (0.34 * i) / (ln - 1)) * (gauss() - acc);
      const sum = [0];
      for (const v of sw) sum.push(sum.at(-1) + v);
      const avg = (i) => (sum[Math.min(ln, i + 20)] - sum[Math.max(0, i - 20)]) / 40;
      add(e.t, ln, 0.09, 0, (i) => (sw[i] - avg(i)) * Math.sin((Math.PI * i) / ln) ** 2);
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

export const VOICE_RATE = 24000;

/** The lines read aloud: a Float32Array of VOICE_RATE samples per line. Kokoro takes ~240 MB, so it runs in a child
 *  process that gives the memory back when it exits; a crash there costs the Reel its voice, not the server. */
export function speak(lines, timeoutMs = 180e3) {
  return new Promise((ok, fail) => {
    const child = fork(fileURLToPath(import.meta.url), ["--speak", JSON.stringify(lines)], { serialization: "advanced" });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.once("message", ok);
    child.once("error", fail);
    child.once("exit", (code, signal) => { clearTimeout(timer); fail(new Error(`the voice stopped (${signal || code})`)); });
  });
}

if (process.argv[2] === "--speak") {      // the child: the model (~90 MB, fetched once into node_modules), then each line
  const [{ StyleTextToSpeech2Model, AutoTokenizer }, { KokoroTTS }] = await Promise.all([import("@huggingface/transformers"), import("kokoro-js")]);
  // one thread and no memory arena: ~240 MB at its peak against ~360 MB by default, for a few seconds more
  const id = "onnx-community/Kokoro-82M-v1.0-ONNX", session_options = { enableCpuMemArena: false, intraOpNumThreads: 1, interOpNumThreads: 1 };
  const tts = new KokoroTTS(...await Promise.all([StyleTextToSpeech2Model.from_pretrained(id, { dtype: "q8", device: "cpu", session_options }), AutoTokenizer.from_pretrained(id)]));
  const out = [];
  for (const text of JSON.parse(process.argv[3])) out.push((await tts.generate(text, { voice: "af_heart", speed: 1.1 })).audio);
  process.send(out, () => process.exit(0));
}
