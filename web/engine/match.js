import { GAMES, tierIndexFor } from './rules.js';

// A line is { main: [..], extra: [..] }. A draw is { date, sets: [{ m: [..], x: [..] }], breakdown? }.
// Returns every prize the line won across the draw's rounds, plus a total.
export function checkLine(gameId, line, draw) {
  const g = GAMES[gameId];
  const wins = [];
  const rounds = [];
  draw.sets.forEach((set, round) => {
    const mainHits = line.main.filter((n) => set.m.includes(n));
    let xHit;
    let extraHits = [];
    if (g.bonus) {
      const b = set.x[0];
      xHit = line.main.includes(b) && !set.m.includes(b);
      if (xHit) extraHits = [b];
    } else {
      extraHits = (line.extra || []).filter((n) => set.x.includes(n));
      xHit = extraHits.length;
    }
    const idx = tierIndexFor(gameId, mainHits.length, xHit);
    rounds.push({ round, mainHits, extraHits, tierIndex: idx });
    if (idx >= 0) wins.push({ round, tierIndex: idx, tier: g.tiers[idx], ...prizeFor(gameId, idx, round, draw.breakdown) });
  });
  const total = wins.reduce((s, w) => s + (w.amount || 0), 0);
  const estimated = wins.some((w) => w.estimated);
  const jackpot = wins.some((w) => w.tier.jackpot);
  return { rounds, wins, total, estimated, jackpot };
}

// Prize for one tier in one round. Uses the draw's actual breakdown when we have it,
// otherwise the fixed prize, otherwise the long-run average for that tier.
export function prizeFor(gameId, tierIndex, round = 0, breakdown = null) {
  const g = GAMES[gameId];
  const tier = g.tiers[tierIndex];
  const level = tierIndex + 1 + round * g.tiers.length;
  const row = breakdown?.tiers?.find((t) => t.level === level);
  if (tier.prize !== undefined) {
    return { amount: tier.prize, text: tier.prizeText || null, estimated: false };
  }
  if (row && row.prize > 0) return { amount: row.prize, text: row.text || null, estimated: false };
  if (tier.avgPrize) return { amount: tier.avgPrize, text: null, estimated: true };
  return { amount: 0, text: 'Jackpot share', estimated: true };
}
