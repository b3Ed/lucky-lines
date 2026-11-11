import { GAMES } from './rules.js';
import { analyse } from './analysis.js';

// Deterministic: same game, same draw date and same history always give the same lines,
// so two phones reading the same data see the same picks.
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedSample(rng, weights, k) {
  const pool = weights.map((w, i) => ({ n: i + 1, w: Math.max(0.0001, w) }));
  const out = [];
  for (let j = 0; j < k; j++) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = rng() * total;
    let idx = 0;
    while (idx < pool.length - 1 && r >= pool[idx].w) {
      r -= pool[idx].w;
      idx++;
    }
    out.push(pool[idx].n);
    pool.splice(idx, 1);
  }
  return out.sort((a, b) => a - b);
}

const STRATEGIES = {
  top: { label: 'Top pick', hot: 0.35, due: 0.25, about: 'Balanced line built to fit how winning lines usually look, with numbers other players tend to avoid.' },
  hot: { label: 'Hot run', hot: 1.0, due: 0, about: 'Leans on the numbers drawn most often in recent draws.' },
  due: { label: 'Due a turn', hot: -0.2, due: 1.0, about: 'Leans on numbers that have gone longest without being drawn.' },
};

function weightsFor(stats, strat) {
  return stats.nums.map((r) => 1 + strat.hot * Math.max(-0.9, r.z * 0.5) + strat.due * Math.min(r.gapRatio, 4) / 2);
}

function isProgression(m) {
  if (m.length < 4) return false;
  const d = m[1] - m[0];
  let run = 1;
  for (let i = 1; i < m.length; i++) {
    if (m[i] - m[i - 1] === d) {
      run++;
      if (run >= 4) return true;
    } else run = 1;
  }
  return false;
}

// Scores a line 0..1 on fit-to-history and on how unlikely other players are to share it.
// It does not, and cannot, change the odds of the line winning.
export function scoreLine(gameId, line, a, trend, lastDrawNums) {
  const g = GAMES[gameId];
  const m = line.main;
  const { drawn, pool } = g.main;
  const sh = a.shape;
  const tags = [];

  const sum = m.reduce((s, k) => s + k, 0);
  let sSum = 0.1;
  if (sum >= sh.sum.p25 && sum <= sh.sum.p75) { sSum = 1; tags.push('Sum in the middle band'); }
  else if (sum >= sh.sum.p10 && sum <= sh.sum.p90) sSum = 0.6;

  const odds = m.filter((k) => k % 2).length;
  const sOdd = sh.odd[odds] / Math.max(...sh.odd);
  if (sOdd > 0.8) tags.push(`${odds} odd, ${drawn - odds} even`);

  const highs = m.filter((k) => k > sh.half).length;
  const sHigh = sh.high[highs] / Math.max(...sh.high);
  if (sHigh > 0.8) tags.push('High/low balanced');

  const consec = m.filter((k, i) => i > 0 && k - m[i - 1] === 1).length;
  const sConsec = consec <= 1 ? 1 : 0.3;

  const decades = new Set(m.map((k) => Math.floor((k - 1) / 10))).size;
  const sSpread = Math.min(1, decades / Math.min(drawn, Math.ceil(pool / 10)) + 0.2);
  if (decades >= Math.min(drawn, 4)) tags.push('Spread across the range');

  // Popularity: birthdays (1-31) are over-picked, as are patterns and last week's numbers.
  const over31 = m.filter((k) => k > 31).length;
  const expectOver31 = (drawn * Math.max(0, pool - 31)) / pool;
  let sUnpop = Math.min(1, 0.4 + (0.6 * over31) / Math.max(1, Math.max(expectOver31, drawn * 0.4)));
  const fromLast = m.filter((k) => lastDrawNums.has(k)).length;
  if (fromLast >= 2) sUnpop *= 0.6;
  if (isProgression(m)) sUnpop *= 0.3;
  if (m.filter((k) => k % 7 === 0).length >= 3) sUnpop *= 0.7;
  if (over31 >= Math.max(1, Math.round(expectOver31))) tags.push('Fewer birthday numbers, less jackpot sharing');

  const sTrend = Math.max(0, Math.min(1, trend));

  const base = (0.2 * sSum + 0.1 * sOdd + 0.1 * sHigh + 0.1 * sConsec + 0.1 * sSpread + 0.25 * sUnpop) / 0.85;
  const score = 0.85 * base + 0.15 * sTrend;
  return { score, base, tags, sum, odds, highs };
}

function uniformLine(rng, pool, k) {
  const s = new Set();
  while (s.size < k) s.add(1 + Math.floor(rng() * pool));
  return [...s].sort((a, b) => a - b);
}

export function makePicks(gameId, draws, drawDate, opts = {}) {
  const g = GAMES[gameId];
  const a = opts.analysis || analyse(gameId, draws);
  const rng = mulberry32(hashString(`${gameId}|${drawDate}`));
  const last = draws[draws.length - 1];
  const lastDrawNums = new Set(last ? last.sets.flatMap((s) => s.m) : []);
  const chosen = [];

  // Strength = percentile against random Lucky Dip lines, so 80 means "fits better than 80% of lucky dips".
  const ref = [];
  for (let i = 0; i < 3000; i++) ref.push(scoreLine(gameId, { main: uniformLine(rng, g.main.pool, g.main.drawn) }, a, 0.5, lastDrawNums).base);
  ref.sort((x, y) => x - y);
  const percentile = (b) => {
    let lo = 0;
    let hi = ref.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ref[mid] <= b) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(99, Math.round((lo / ref.length) * 100));
  };

  for (const key of ['top', 'hot', 'due']) {
    const strat = STRATEGIES[key];
    // The top pick gets a thorough search. The other two follow their strategy first, so they score lower.
    const candidates = key === 'top' ? opts.candidates || 2500 : 12;
    const w = weightsFor(a.main, strat);
    const wMax = Math.max(...w);
    const xw = a.extra ? weightsFor(a.extra, strat) : null;
    let best = null;
    for (let c = 0; c < candidates; c++) {
      const main = weightedSample(rng, w, g.main.drawn);
      const trend = main.reduce((s, k) => s + w[k - 1], 0) / (main.length * wMax);
      const sc = scoreLine(gameId, { main }, a, trend, lastDrawNums);
      // Spread the three lines: heavy penalty for sharing more than one number with an earlier line.
      let overlapPenalty = 0;
      for (const p of chosen) {
        const shared = main.filter((k) => p.main.includes(k)).length;
        if (shared > 1) overlapPenalty += 0.08 * (shared - 1);
      }
      const total = (key === 'top' ? sc.score : 0.5 * sc.base + 0.5 * trend) - overlapPenalty;
      if (!best || total > best.total) best = { main, sc, total };
    }
    let extra = [];
    if (xw) {
      extra = weightedSample(rng, xw, g.extra.drawn);
      // Different extras across lines where the pool allows it.
      for (let tries = 0; tries < 20 && chosen.some((p) => p.extra.join() === extra.join()); tries++) {
        extra = weightedSample(rng, xw, g.extra.drawn);
      }
    }
    chosen.push({
      key,
      label: strat.label,
      about: strat.about,
      main: best.main,
      extra,
      strength: percentile(best.sc.base),
      tags: best.sc.tags.slice(0, 4),
    });
  }
  // The highest-scoring line is the higher confidence pick.
  const topIdx = chosen.reduce((bi, p, i) => (p.strength > chosen[bi].strength ? i : bi), 0);
  chosen.forEach((p, i) => (p.top = i === topIdx));
  if (topIdx !== 0) {
    const [t] = chosen.splice(topIdx, 1);
    chosen.unshift(t);
  }
  return { game: gameId, drawDate, lines: chosen, generatedFrom: a.draws };
}
