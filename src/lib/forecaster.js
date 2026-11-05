// Client-side port of the lol-forecaster Monte Carlo (Python original:
// github/lol-forecaster). The exported model JSON carries team strengths,
// beta, and Platt calibration; the browser runs the bracket simulation.

export function singleGameProb(sa, sb, model) {
  const raw = 1 / (1 + Math.exp(-(sa - sb) / (Math.SQRT2 * model.beta)));
  if (!model.platt) return raw;
  const [a, b] = model.platt;
  const eps = 1e-6;
  const pc = Math.min(Math.max(raw, eps), 1 - eps);
  const logit = Math.log(pc / (1 - pc));
  const p = 1 / (1 + Math.exp(-(a * logit + b)));
  return Math.min(Math.max(p, 0.02), 0.98);
}

// P(win best-of series) given single-game p; gamesToWin: bo5=3, bo3=2, bo1=1
export function seriesProb(p, gamesToWin = 3) {
  if (gamesToWin === 1) return p;
  const comb = (n, k) => {
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return r;
  };
  let total = 0;
  const q = 1 - p;
  for (let k = 0; k < gamesToWin; k++)
    total += comb(gamesToWin - 1 + k, k) * p ** gamesToWin * q ** k;
  return total;
}

export const SLOT_ROUNDS = [
  { name: "Upper Round 1", section: "upper", slots: ["UB_R1_M1", "UB_R1_M2", "UB_R1_M3", "UB_R1_M4"] },
  { name: "Upper Semifinal", section: "upper", slots: ["UB_SF_M1", "UB_SF_M2"] },
  { name: "Upper Final", section: "upper", slots: ["UB_F_M1"] },
  { name: "Grand Final", section: "upper", slots: ["GF_M1"] },
  { name: "Lower Round 1", section: "lower", slots: ["LB_R1_M1", "LB_R1_M2"] },
  { name: "Lower Round 2", section: "lower", slots: ["LB_R2_M1", "LB_R2_M2"] },
  { name: "Lower Semifinal", section: "lower", slots: ["LB_SF_M1"] },
  { name: "Lower Final", section: "lower", slots: ["LB_F_M1"] },
];

const dependencies = {
  UB_R1_M1: [], UB_R1_M2: [], UB_R1_M3: [], UB_R1_M4: [],
  UB_SF_M1: ["UB_R1_M1", "UB_R1_M2"], UB_SF_M2: ["UB_R1_M3", "UB_R1_M4"],
  LB_R1_M1: ["UB_R1_M1", "UB_R1_M2"], LB_R1_M2: ["UB_R1_M3", "UB_R1_M4"],
  LB_R2_M1: ["LB_R1_M1", "UB_SF_M2"], LB_R2_M2: ["LB_R1_M2", "UB_SF_M1"],
  UB_F_M1: ["UB_SF_M1", "UB_SF_M2"], LB_SF_M1: ["LB_R2_M1", "LB_R2_M2"],
  LB_F_M1: ["UB_F_M1", "LB_SF_M1"], GF_M1: ["UB_F_M1", "LB_F_M1"],
};

export const canLock = (slot, locks) => dependencies[slot]?.every((parent) => Boolean(locks[parent])) ?? false;

// A changed result invalidates every downstream pairing, including the lower bracket.
export function updateLocks(locks, slot, team) {
  const next = { ...locks };
  const affected = new Set([slot]);
  let size;
  do {
    size = affected.size;
    for (const [candidate, parents] of Object.entries(dependencies)) {
      if (parents.some((parent) => affected.has(parent))) affected.add(candidate);
    }
  } while (affected.size !== size);
  for (const candidate of affected) delete next[candidate];
  if (team && canLock(slot, next)) next[slot] = team;
  return next;
}

// Simulate the 8-team double-elimination bracket (MSI layout: LB R2 crossed).
// locks: { slotId: winnerName }. Returns per-slot most likely pairs and odds.
export function simulate(model, locks, iters = 20000) {
  if (!Number.isInteger(iters) || iters < 1) throw new Error("Simulation count must be a positive integer.");
  for (const slot of Object.keys(locks)) {
    if (!canLock(slot, locks)) throw new Error("Resolve earlier rounds before locking this match.");
  }
  const s = model.seeding;
  const gtw = { bo1: 1, bo3: 2, bo5: 3 }[model.seriesFormat] ?? 3;
  const str = (t) => model.teams[t]?.strength ?? 25;

  const pCache = new Map();
  const sp = (a, b) => {
    const key = a + "|" + b;
    if (!pCache.has(key)) pCache.set(key, seriesProb(singleGameProb(str(a), str(b), model), gtw));
    return pCache.get(key);
  };

  const pairCounts = {}; // slot -> Map("A|B" sorted -> count)
  const champCounts = new Map();
  const gfCounts = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  const notePair = (slot, a, b) => {
    (pairCounts[slot] ??= new Map());
    bump(pairCounts[slot], [a, b].sort().join("|"));
  };

  const play = (a, b, slot) => {
    notePair(slot, a, b);
    if (locks[slot]) {
      if (locks[slot] !== a && locks[slot] !== b) throw new Error("Locked winner is not in this matchup.");
      return locks[slot];
    }
    return Math.random() < sp(a, b) ? a : b;
  };
  const loserOf = (a, b, w) => (w === a ? b : a);

  for (let i = 0; i < iters; i++) {
    // UB R1: seeds 1v8, 4v5, 2v7, 3v6 (config seeding is pre-ordered)
    const r1 = [
      [s[0], s[7]],
      [s[3], s[4]],
      [s[1], s[6]],
      [s[2], s[5]],
    ];
    const ubW = [], ubL = [];
    r1.forEach(([a, b], j) => {
      const w = play(a, b, `UB_R1_M${j + 1}`);
      ubW.push(w);
      ubL.push(loserOf(a, b, w));
    });

    const lb1w = [0, 1].map((j) => {
      const [a, b] = [ubL[2 * j], ubL[2 * j + 1]];
      return play(a, b, `LB_R1_M${j + 1}`);
    });

    const sfW = [], sfL = [];
    [0, 1].forEach((j) => {
      const [a, b] = [ubW[2 * j], ubW[2 * j + 1]];
      const w = play(a, b, `UB_SF_M${j + 1}`);
      sfW.push(w);
      sfL.push(loserOf(a, b, w));
    });

    // LB R2 crossed: LB_R1_M1 winner vs UB_SF_M2 loser
    const lb2w = [0, 1].map((j) => {
      const [a, b] = [lb1w[j], sfL[1 - j]];
      return play(a, b, `LB_R2_M${j + 1}`);
    });

    const ubFin = play(sfW[0], sfW[1], "UB_F_M1");
    const ubFinL = loserOf(sfW[0], sfW[1], ubFin);
    const lbSemi = play(lb2w[0], lb2w[1], "LB_SF_M1");
    const lbFin = play(ubFinL, lbSemi, "LB_F_M1");
    const champ = play(ubFin, lbFin, "GF_M1");

    bump(gfCounts, ubFin);
    bump(gfCounts, lbFin);
    bump(champCounts, champ);
  }

  const slots = {};
  for (const [slot, counts] of Object.entries(pairCounts)) {
    let best = null, bestN = 0, total = 0;
    for (const [k, n] of counts) {
      total += n;
      if (n > bestN) { bestN = n; best = k; }
    }
    let [a, b] = best.split("|");
    const pA0 = sp(a, b);
    if (pA0 < 0.5) [a, b] = [b, a];
    slots[slot] = {
      a, b,
      pA: sp(a, b),
      freq: bestN / total,
      locked: locks[slot] ?? null,
    };
  }

  const teams = Object.keys(model.teams);
  const odds = teams
    .map((t) => ({
      team: t,
      region: model.teams[t].region,
      strength: model.teams[t].strength,
      grandFinal: (gfCounts.get(t) ?? 0) / iters,
      champion: (champCounts.get(t) ?? 0) / iters,
    }))
    .sort((x, y) => y.champion - x.champion);

  return { slots, odds };
}
