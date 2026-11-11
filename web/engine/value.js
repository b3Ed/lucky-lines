import { GAMES, tierProbability } from './rules.js';

const DEFAULT_LINES = { lotto: 7.5e6, euromillions: 30e6, thunderball: 1.5e6, setforlife: 2.5e6 };
const DEFAULT_UK_LINES = { euromillions: 8e6 };

// Lines sold, worked back from how many people won the bottom tier.
export function estimateLines(gameId, breakdown) {
  const g = GAMES[gameId];
  const lowest = g.tiers.length - 1;
  const p = tierProbability(gameId, g.tiers[lowest]);
  const row = breakdown?.tiers?.find((t) => t.level === lowest + 1);
  const all = row?.winners ? row.winners / p : DEFAULT_LINES[gameId];
  const uk = row?.ukWinners ? row.ukWinners / p : DEFAULT_UK_LINES[gameId] || all;
  return { all, uk, measured: !!row?.winners };
}

// Expected return of one line, in pounds. Still well under the stake in almost every draw.
export function expectedValue(gameId, { jackpot = 0, mustBeWon = false, lines, ukLines } = {}) {
  const g = GAMES[gameId];
  let ev = 0;
  let pJack = 0;
  for (const t of g.tiers) {
    const p = tierProbability(gameId, t);
    if (t.jackpot) {
      pJack = p;
      const lambda = Math.max(1e-9, p * g.rounds * (lines || DEFAULT_LINES[gameId]));
      const shareFactor = (1 - Math.exp(-lambda)) / lambda;
      ev += g.rounds * p * jackpot * shareFactor;
    } else {
      ev += g.rounds * p * (t.prize ?? t.avgPrize ?? 0);
    }
  }
  if (g.raffle) ev += g.raffle.prize / (ukLines || DEFAULT_UK_LINES[gameId] || 8e6);
  if (mustBeWon && jackpot > 0) {
    // If nobody hits the jackpot it rolls down to the lower tiers: roughly one share per line sold.
    const pNobody = Math.exp(-pJack * g.rounds * (lines || DEFAULT_LINES[gameId]));
    ev += (pNobody * jackpot) / (lines || DEFAULT_LINES[gameId]);
  }
  return ev;
}

// How this draw compares with an ordinary draw of the same game.
export function drawValue(gameId, next, latestBreakdown, history) {
  const g = GAMES[gameId];
  const est = estimateLines(gameId, latestBreakdown);
  const jackpot = next?.jackpot || 0;
  const ev = expectedValue(gameId, { jackpot, mustBeWon: !!next?.mustBeWon, lines: est.all, ukLines: est.uk });
  const jps = (history || [])
    .filter((d) => d.date >= g.eraStart && d.jp > 0)
    .slice(-150)
    .map((d) => d.jp)
    .sort((a, b) => a - b);
  const baseJackpot = jps.length ? jps[Math.floor(jps.length * 0.2)] : jackpot;
  const baseEv = expectedValue(gameId, { jackpot: baseJackpot, lines: est.all, ukLines: est.uk });
  const ratio = baseEv > 0 ? ev / baseEv : 1;
  let verdict = 'normal';
  if (next?.mustBeWon) verdict = 'strong';
  else if (ratio >= 1.5) verdict = 'good';
  else if (ratio >= 1.2) verdict = 'better';
  return {
    perLine: ev,
    perPound: ev / g.price,
    basePerPound: baseEv / g.price,
    ratio,
    verdict,
    jackpot,
    baseJackpot,
    linesEstimate: Math.round(est.all),
    linesMeasured: est.measured,
    fixedPrizes: !g.tiers.some((t) => t.jackpot),
  };
}
