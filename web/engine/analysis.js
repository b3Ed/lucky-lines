import { GAMES } from './rules.js';

// Every drawn set in the game's current format, oldest first. A Lotto night with two rounds gives two sets.
export function eraSets(gameId, draws) {
  const g = GAMES[gameId];
  const out = [];
  for (const d of draws) {
    if (d.date < g.eraStart) continue;
    for (const s of d.sets) out.push({ date: d.date, m: s.m, x: s.x });
  }
  return out;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function erf(x) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

// Upper-tail p-value for chi-square, Wilson-Hilferty approximation (good for df > 5).
export function chiSquareP(x, df) {
  const z = (Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 0.5 * (1 - erf(z / Math.SQRT2));
}

// Per-number stats for one ball pool.
function poolStats(sets, pick, pool, drawn, window) {
  const n = sets.length;
  const recentFrom = Math.max(0, n - window);
  const nums = [];
  for (let k = 1; k <= pool; k++) nums.push({ n: k, all: 0, recent: 0, lastSeen: null });
  sets.forEach((s, i) => {
    for (const k of pick(s)) {
      const row = nums[k - 1];
      if (!row) continue;
      row.all++;
      if (i >= recentFrom) row.recent++;
      row.lastSeen = i;
    }
  });
  const expectedGap = pool / drawn;
  const recentN = n - recentFrom;
  const expRecent = (recentN * drawn) / pool;
  const sd = Math.sqrt(expRecent * (1 - drawn / pool)) || 1;
  for (const r of nums) {
    r.gap = r.lastSeen === null ? n : n - 1 - r.lastSeen;
    r.gapRatio = r.gap / expectedGap;
    r.z = (r.recent - expRecent) / sd;
    r.expectedAll = (n * drawn) / pool;
  }
  const byHot = [...nums].sort((a, b) => b.recent - a.recent || b.all - a.all || a.n - b.n);
  const byCold = [...nums].sort((a, b) => a.recent - b.recent || a.all - b.all || a.n - b.n);
  const byDue = [...nums].sort((a, b) => b.gapRatio - a.gapRatio || a.n - b.n);
  const chi = nums.reduce((s, r) => s + (r.all - r.expectedAll) ** 2 / (r.expectedAll || 1), 0);
  return {
    nums,
    expRecent,
    hot: byHot.slice(0, 6),
    cold: byCold.slice(0, 6),
    overdue: byDue.slice(0, 6),
    chi,
    chiP: n > 0 ? chiSquareP(chi, pool - 1) : 1,
  };
}

export function analyse(gameId, draws, opts = {}) {
  const g = GAMES[gameId];
  const window = opts.window || 50;
  const sets = eraSets(gameId, draws);
  const { pool, drawn } = g.main;
  const main = poolStats(sets, (s) => s.m, pool, drawn, window);
  const extra = g.extra ? poolStats(sets, (s) => s.x, g.extra.pool, g.extra.drawn, window) : null;

  // Shape of winning lines.
  const sums = [];
  const odd = new Array(drawn + 1).fill(0);
  const high = new Array(drawn + 1).fill(0);
  let withConsec = 0;
  let repeats = 0;
  let lowHeavy = 0;
  const pairs = new Map();
  const half = Math.ceil(pool / 2);
  sets.forEach((s, i) => {
    const m = [...s.m].sort((a, b) => a - b);
    sums.push(m.reduce((a, b) => a + b, 0));
    odd[m.filter((k) => k % 2).length]++;
    high[m.filter((k) => k > half).length]++;
    if (m.some((k, j) => j > 0 && k - m[j - 1] === 1)) withConsec++;
    if (m.filter((k) => k <= 31).length === drawn) lowHeavy++;
    if (i > 0) repeats += m.filter((k) => sets[i - 1].m.includes(k)).length;
    for (let a = 0; a < m.length; a++)
      for (let b = a + 1; b < m.length; b++) {
        const key = `${m[a]}-${m[b]}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
  });
  const sorted = [...sums].sort((a, b) => a - b);
  const mean = sums.reduce((a, b) => a + b, 0) / (sums.length || 1);
  const sd = Math.sqrt(sums.reduce((a, b) => a + (b - mean) ** 2, 0) / (sums.length || 1));
  const n = sets.length || 1;
  const topPairs = [...pairs.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 8)
    .map(([k, c]) => ({ pair: k.split('-').map(Number), count: c }));
  const pairExpected = (sets.length * (drawn * (drawn - 1))) / (pool * (pool - 1));

  // Sum histogram in 12 bins across the observed range.
  const bins = 12;
  const lo = sorted[0] ?? 0;
  const hi = sorted[sorted.length - 1] ?? 1;
  const width = Math.max(1, Math.ceil((hi - lo + 1) / bins));
  const hist = new Array(bins).fill(0);
  for (const s of sums) hist[Math.min(bins - 1, Math.floor((s - lo) / width))]++;

  return {
    game: gameId,
    sets: sets.length,
    draws: draws.filter((d) => d.date >= g.eraStart).length,
    since: g.eraStart,
    window: Math.min(window, sets.length),
    main,
    extra,
    shape: {
      sum: { mean, sd, p10: quantile(sorted, 0.1), p25: quantile(sorted, 0.25), p50: quantile(sorted, 0.5), p75: quantile(sorted, 0.75), p90: quantile(sorted, 0.9), hist, histStart: lo, histWidth: width },
      odd: odd.map((c) => c / n),
      high: high.map((c) => c / n),
      half,
      consecutive: withConsec / n,
      repeatsPerDraw: sets.length > 1 ? repeats / (sets.length - 1) : 0,
      allLow: lowHeavy / n,
    },
    pairs: { top: topPairs, expected: pairExpected },
  };
}
