// Game rules for the four UK National Lottery draw games.
// Single source of truth: used by the browser app, the data pipeline and (as rules.json) the Android worker.

export const GAMES = {
  lotto: {
    id: 'lotto',
    name: 'Lotto',
    price: 2,
    colour: '#e0355d',
    main: { pool: 59, drawn: 6 },
    extra: null,
    bonus: { label: 'Bonus Ball' },
    rounds: 2,
    days: [3, 6],
    cutoff: '19:30',
    drawTime: '20:00',
    eraStart: '2015-10-10',
    archiveFrom: 1994,
    feed: 'lotto',
    site: 'lotto',
    blurb: 'Pick 6 from 1-59. Every line plays Round 1 and Round 2 on the same night.',
    tiers: [
      { key: '6', main: 6, label: 'Match 6', jackpot: true },
      { key: '5B', main: 5, bonus: true, label: 'Match 5 + Bonus', prize: 1000000 },
      { key: '5', main: 5, bonus: false, label: 'Match 5', prize: 1000 },
      { key: '4', main: 4, label: 'Match 4', prize: 50 },
      { key: '3', main: 3, label: 'Match 3', prize: 10 },
      { key: '2', main: 2, label: 'Match 2', prize: 2, prizeText: 'Free Lucky Dip' },
    ],
  },
  euromillions: {
    id: 'euromillions',
    name: 'EuroMillions',
    price: 2.5,
    colour: '#2f6fe4',
    main: { pool: 50, drawn: 5 },
    extra: { pool: 12, drawn: 2, label: 'Lucky Stars', one: 'Lucky Star' },
    rounds: 1,
    days: [2, 5],
    cutoff: '19:30',
    drawTime: '21:00',
    eraStart: '2016-09-27',
    archiveFrom: 2004,
    feed: 'euromillions',
    site: 'euromillions',
    raffle: { label: 'UK Millionaire Maker', prize: 1000000 },
    blurb: 'Pick 5 from 1-50 and 2 Lucky Stars from 1-12. Includes a UK Millionaire Maker code.',
    tiers: [
      { key: '5+2', main: 5, extra: 2, label: '5 + 2 Stars', jackpot: true },
      { key: '5+1', main: 5, extra: 1, label: '5 + 1 Star', avgPrize: 262583 },
      { key: '5', main: 5, extra: 0, label: 'Match 5', avgPrize: 25436 },
      { key: '4+2', main: 4, extra: 2, label: '4 + 2 Stars', avgPrize: 1348 },
      { key: '4+1', main: 4, extra: 1, label: '4 + 1 Star', avgPrize: 92.61 },
      { key: '3+2', main: 3, extra: 2, label: '3 + 2 Stars', avgPrize: 48.68 },
      { key: '4', main: 4, extra: 0, label: 'Match 4', avgPrize: 30.89 },
      { key: '2+2', main: 2, extra: 2, label: '2 + 2 Stars', avgPrize: 10.64 },
      { key: '3+1', main: 3, extra: 1, label: '3 + 1 Star', avgPrize: 8.23 },
      { key: '3', main: 3, extra: 0, label: 'Match 3', avgPrize: 6.78 },
      { key: '1+2', main: 1, extra: 2, label: '1 + 2 Stars', avgPrize: 5.21 },
      { key: '2+1', main: 2, extra: 1, label: '2 + 1 Star', avgPrize: 4.13 },
      { key: '2', main: 2, extra: 0, label: 'Match 2', avgPrize: 2.72 },
    ],
  },
  thunderball: {
    id: 'thunderball',
    name: 'Thunderball',
    price: 1,
    colour: '#7b4ae2',
    main: { pool: 39, drawn: 5 },
    extra: { pool: 14, drawn: 1, label: 'Thunderball', one: 'Thunderball' },
    rounds: 1,
    days: [2, 3, 5, 6],
    cutoff: '19:30',
    drawTime: '20:15',
    eraStart: '2010-05-10',
    archiveFrom: 1999,
    feed: 'thunderball',
    site: 'thunderball',
    blurb: 'Pick 5 from 1-39 and a Thunderball from 1-14. Fixed prizes, £500,000 top prize every draw.',
    tiers: [
      { key: '5+T', main: 5, extra: 1, label: '5 + Thunderball', prize: 500000 },
      { key: '5', main: 5, extra: 0, label: 'Match 5', prize: 5000 },
      { key: '4+T', main: 4, extra: 1, label: '4 + Thunderball', prize: 250 },
      { key: '4', main: 4, extra: 0, label: 'Match 4', prize: 100 },
      { key: '3+T', main: 3, extra: 1, label: '3 + Thunderball', prize: 20 },
      { key: '3', main: 3, extra: 0, label: 'Match 3', prize: 10 },
      { key: '2+T', main: 2, extra: 1, label: '2 + Thunderball', prize: 10 },
      { key: '1+T', main: 1, extra: 1, label: '1 + Thunderball', prize: 5 },
      { key: '0+T', main: 0, extra: 1, label: 'Thunderball only', prize: 3 },
    ],
  },
  setforlife: {
    id: 'setforlife',
    name: 'Set For Life',
    price: 1.5,
    colour: '#109c8a',
    main: { pool: 47, drawn: 5 },
    extra: { pool: 10, drawn: 1, label: 'Life Ball', one: 'Life Ball' },
    rounds: 1,
    days: [1, 4],
    cutoff: '19:30',
    drawTime: '20:00',
    eraStart: '2019-03-18',
    archiveFrom: 2019,
    feed: 'set-for-life',
    site: 'set-for-life',
    blurb: 'Pick 5 from 1-47 and a Life Ball from 1-10. Top prize £10,000 a month for 30 years.',
    tiers: [
      { key: '5+L', main: 5, extra: 1, label: '5 + Life Ball', prize: 3600000, prizeText: '£10,000 a month for 30 years' },
      { key: '5', main: 5, extra: 0, label: 'Match 5', prize: 120000, prizeText: '£10,000 a month for 1 year' },
      { key: '4+L', main: 4, extra: 1, label: '4 + Life Ball', prize: 250 },
      { key: '4', main: 4, extra: 0, label: 'Match 4', prize: 50 },
      { key: '3+L', main: 3, extra: 1, label: '3 + Life Ball', prize: 30 },
      { key: '3', main: 3, extra: 0, label: 'Match 3', prize: 20 },
      { key: '2+L', main: 2, extra: 1, label: '2 + Life Ball', prize: 10 },
      { key: '2', main: 2, extra: 0, label: 'Match 2', prize: 5 },
    ],
  },
};

export const GAME_IDS = Object.keys(GAMES);

export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

// Probability that one line lands exactly in this tier in one round.
export function tierProbability(gameId, tier) {
  const g = GAMES[gameId];
  const { pool, drawn } = g.main;
  const pm = (choose(drawn, tier.main) * choose(pool - drawn, drawn - tier.main)) / choose(pool, drawn);
  if (g.bonus) {
    // Bonus ball comes from the balls left after the main draw. Only Match 5 splits on it.
    const pBonus = (drawn - tier.main) / (pool - drawn);
    if (tier.bonus === true) return pm * pBonus;
    if (tier.bonus === false) return pm * (1 - pBonus);
    return pm;
  }
  if (g.extra) {
    const e = g.extra;
    return pm * (choose(e.drawn, tier.extra) * choose(e.pool - e.drawn, e.drawn - tier.extra)) / choose(e.pool, e.drawn);
  }
  return pm;
}

export function oddsText(p) {
  if (!p) return '-';
  const inv = 1 / p;
  if (inv < 100) return `1 in ${inv.toFixed(1)}`;
  return `1 in ${Math.round(inv).toLocaleString('en-GB')}`;
}

// Chance of any prize on one line across every round it plays in.
export function anyPrizeProbability(gameId) {
  const g = GAMES[gameId];
  const perRound = g.tiers.reduce((s, t) => s + tierProbability(gameId, t), 0);
  return 1 - Math.pow(1 - perRound, g.rounds);
}

// Index into g.tiers for a result, or -1 for no prize.
// For Lotto, xHit is whether the line holds the bonus ball; otherwise it is the count of extra balls matched.
export function tierIndexFor(gameId, mainHits, xHit) {
  const g = GAMES[gameId];
  return g.tiers.findIndex((t) =>
    t.main === mainHits && (g.bonus ? t.bonus === undefined || t.bonus === xHit : t.extra === xHit)
  );
}

// Plain JSON export of the rules, for the Android worker.
export function rulesJson() {
  const out = {};
  for (const id of GAME_IDS) {
    const g = GAMES[id];
    out[id] = {
      id, name: g.name, price: g.price, rounds: g.rounds, days: g.days, cutoff: g.cutoff, drawTime: g.drawTime,
      hasBonus: !!g.bonus,
      tiers: g.tiers.map((t) => ({
        key: t.key, label: t.label, main: t.main,
        bonus: t.bonus === undefined ? null : t.bonus,
        extra: t.extra === undefined ? null : t.extra,
        prize: t.prize ?? t.avgPrize ?? null,
        estimated: t.prize === undefined && !t.jackpot,
        jackpot: !!t.jackpot,
        prizeText: t.prizeText ?? null,
      })),
    };
  }
  return out;
}
