import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, GAME_IDS, tierProbability, anyPrizeProbability, tierIndexFor } from '../web/engine/rules.js';
import { checkLine } from '../web/engine/match.js';
import { analyse, chiSquareP } from '../web/engine/analysis.js';
import { makePicks } from '../web/engine/predict.js';
import { expectedValue } from '../web/engine/value.js';
import { parseFeed, parseArchive, mergeDraws } from '../pipeline/sources.js';

const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('tier probabilities sum to the any-prize chance and match published odds', () => {
  close(1 / tierProbability('lotto', GAMES.lotto.tiers[0]), 45057474, 1);
  close(1 / tierProbability('euromillions', GAMES.euromillions.tiers[0]), 139838160, 1);
  close(1 / tierProbability('thunderball', GAMES.thunderball.tiers[0]), 8060598, 1);
  close(1 / tierProbability('setforlife', GAMES.setforlife.tiers[0]), 15339390, 1);
  // Lotto: one round about 1 in 9.3, both rounds about 1 in 4.9.
  const perRound = GAMES.lotto.tiers.reduce((s, t) => s + tierProbability('lotto', t), 0);
  close(1 / perRound, 9.3, 0.1);
  close(1 / anyPrizeProbability('lotto'), 4.9, 0.1);
  close(1 / anyPrizeProbability('thunderball'), 13, 0.7);
  close(1 / tierProbability('thunderball', GAMES.thunderball.tiers[8]), 29, 0.5);
  close(1 / anyPrizeProbability('euromillions'), 13, 0.5);
});

test('every tier is reachable and unique', () => {
  for (const id of GAME_IDS) {
    const g = GAMES[id];
    g.tiers.forEach((t, i) => {
      const x = g.bonus ? (t.bonus ?? false) : t.extra;
      assert.equal(tierIndexFor(id, t.main, x), i, `${id} ${t.key}`);
    });
  }
});

test('lotto two rounds: each round checked separately, bonus only for match 5', () => {
  const draw = { date: '2026-11-07', sets: [{ m: [4, 19, 30, 45, 49, 51], x: [40] }, { m: [5, 20, 22, 31, 35, 57], x: [11] }] };
  const r = checkLine('lotto', { main: [4, 19, 30, 45, 49, 40] }, draw);
  assert.equal(r.wins.length, 1);
  assert.equal(r.wins[0].tier.key, '5B');
  assert.equal(r.total, 1000000);
  const both = checkLine('lotto', { main: [4, 19, 5, 20, 22, 1] }, draw);
  assert.deepEqual(both.wins.map((w) => [w.round, w.tier.key]), [[0, '2'], [1, '3']]);
  assert.equal(both.total, 12);
  const none = checkLine('lotto', { main: [1, 2, 3, 6, 7, 8] }, draw);
  assert.equal(none.total, 0);
});

test('euromillions uses the real UK prize when the breakdown has it, average otherwise', () => {
  const draw = { date: 'x', sets: [{ m: [15, 18, 31, 37, 41], x: [1, 5] }], breakdown: { tiers: [{ level: 10, winners: 9, ukWinners: 9, prize: 7.1 }] } };
  const r = checkLine('euromillions', { main: [15, 18, 31, 2, 3], extra: [9, 10] }, draw);
  assert.equal(r.wins[0].tier.key, '3');
  assert.equal(r.total, 7.1);
  assert.equal(r.estimated, false);
  const r2 = checkLine('euromillions', { main: [15, 18, 2, 3, 4], extra: [1, 5] }, draw);
  assert.equal(r2.wins[0].tier.key, '2+2');
  assert.equal(r2.estimated, true);
});

test('thunderball 0 + thunderball wins £3', () => {
  const draw = { date: 'x', sets: [{ m: [3, 11, 23, 26, 27], x: [11] }] };
  assert.equal(checkLine('thunderball', { main: [1, 2, 4, 5, 6], extra: [11] }, draw).total, 3);
});

function fakeHistory(id, n, seed = 7) {
  const g = GAMES[id];
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (pool, k) => { const set = new Set(); while (set.size < k) set.add(1 + Math.floor(rnd() * pool)); return [...set].sort((a, b) => a - b); };
  const out = [];
  const d = new Date('2020-01-01T12:00:00Z');
  for (let i = 0; i < n; i++) {
    d.setUTCDate(d.getUTCDate() + 3);
    const m = pick(g.main.pool, g.main.drawn);
    const x = g.bonus ? [pick(g.main.pool, 7).find((k) => !m.includes(k))] : pick(g.extra.pool, g.extra.drawn);
    out.push({ date: d.toISOString().slice(0, 10), sets: [{ m, x }] });
  }
  return out;
}

test('picks are deterministic, valid and the top pick scores highest', () => {
  for (const id of GAME_IDS) {
    const g = GAMES[id];
    const h = fakeHistory(id, 400);
    const a = makePicks(id, h, '2026-12-01', { candidates: 400 });
    const b = makePicks(id, h, '2026-12-01', { candidates: 400 });
    assert.deepEqual(a.lines, b.lines, `${id} not deterministic`);
    assert.equal(a.lines.length, 3);
    assert.ok(a.lines[0].top);
    for (const l of a.lines) {
      assert.equal(new Set(l.main).size, g.main.drawn);
      assert.ok(l.main.every((k) => k >= 1 && k <= g.main.pool));
      assert.equal(l.extra.length, g.bonus ? 0 : g.extra.drawn);
      assert.ok(l.strength <= a.lines[0].strength);
    }
    const c = makePicks(id, h, '2026-12-04', { candidates: 400 });
    assert.notDeepEqual(c.lines.map((l) => l.main), a.lines.map((l) => l.main));
  }
});

test('analysis counts every ball once and random data passes the fairness test', () => {
  const h = fakeHistory('thunderball', 3000);
  const a = analyse('thunderball', h, { window: 50 });
  assert.equal(a.main.nums.reduce((s, r) => s + r.all, 0), 3000 * 5);
  assert.ok(a.main.chiP > 0.001);
  close(chiSquareP(38, 38), 0.47, 0.03);
});

test('bigger jackpot means bigger expected value, must-be-won bigger again', () => {
  const lo = expectedValue('lotto', { jackpot: 2e6 });
  const hi = expectedValue('lotto', { jackpot: 10e6 });
  const mbw = expectedValue('lotto', { jackpot: 10e6, mustBeWon: true });
  assert.ok(hi > lo && mbw > hi);
  assert.ok(lo < GAMES.lotto.price);
});

test('feed parser reads lotto rounds, prize tiers and next jackpot', () => {
  const xml = `<draw-results><game type="lotto"><draw><draw-number>3222</draw-number><draw-date>2026-11-07</draw-date></draw><balls><set>L9</set><ball number="1">4</ball><ball number="2">19</ball><ball number="3">30</ball><ball number="4">45</ball><ball number="5">49</ball><ball number="6">51</ball><bonus-ball type="bonusball" number="1">40</bonus-ball></balls><balls><set>L10</set><ball number="1">5</ball><ball number="2">20</ball><ball number="3">22</ball><ball number="4">31</ball><ball number="5">35</ball><ball number="6">57</ball><bonus-ball type="bonusball" number="1">11</bonus-ball></balls><winners><confirmed>Y</confirmed><prize-tiers><prize-tier level="3"><number-of-winners>37</number-of-winners><win-value>37000.00</win-value></prize-tier></prize-tiers></winners><rollover>Y</rollover><rollover-count>3</rollover-count><next-estimated-jackpot>5,161,856</next-estimated-jackpot><next-estimated-jackpot-roll-down>N</next-estimated-jackpot-roll-down><next-draw-date>2026-11-11</next-draw-date></game></draw-results>`;
  const f = parseFeed('lotto', xml);
  assert.equal(f.draw.sets.length, 2);
  assert.deepEqual(f.draw.sets[1], { m: [5, 20, 22, 31, 35, 57], x: [11] });
  assert.equal(f.draw.breakdown.tiers[0].prize, 1000);
  assert.equal(f.next.jackpot, 5161856);
  assert.equal(f.next.rollovers, 3);
  assert.equal(f.next.mustBeWon, false);
});

test('archive parser and merge keep every field', () => {
  const html = `<table><tr><th>x</th></tr><tr><td><a href="/thunderball/results-10-11-2026">Tue</a></td><td><div class="result small thunderball-ball">3</div><div class="result small thunderball-ball">11</div><div class="result small thunderball-ball">23</div><div class="result small thunderball-ball">26</div><div class="result small thunderball-ball">27</div><div class="result small thunderball-thunderball">11</div></td><td><strong>&pound;500,000</strong></td></tr></table>`;
  const { draws } = parseArchive('thunderball', html);
  assert.deepEqual(draws, [{ date: '2026-11-10', sets: [{ m: [3, 11, 23, 26, 27], x: [11] }], jp: 500000, rolled: false }]);
  const merged = mergeDraws(draws, [{ date: '2026-11-10', no: 4006, breakdown: { tiers: [] }, jp: null }]);
  assert.equal(merged[0].no, 4006);
  assert.equal(merged[0].jp, 500000);
});
