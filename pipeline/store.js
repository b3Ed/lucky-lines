import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES, GAME_IDS, rulesJson } from '../web/engine/rules.js';
import { analyse } from '../web/engine/analysis.js';
import { makePicks } from '../web/engine/predict.js';
import { drawValue } from '../web/engine/value.js';
import { checkLine } from '../web/engine/match.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = join(ROOT, 'docs', 'data');

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(path, obj, pretty = false) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(obj, null, pretty ? 1 : 0) + '\n', 'utf8');
}

export const loadHistory = (id) => readJson(join(DATA, 'games', `${id}.json`), { game: id, draws: [] }).then((h) => h.draws);
// Only touch the file when the draws changed, so scheduled runs with no new draw make no commit.
export async function saveHistory(id, draws) {
  const path = join(DATA, 'games', `${id}.json`);
  const prev = await readJson(path, null);
  if (prev && JSON.stringify(prev.draws) === JSON.stringify(draws)) return false;
  await writeJson(path, { game: id, updated: new Date().toISOString(), draws });
  return true;
}
export const loadMeta = () => readJson(join(DATA, 'meta.json'), {});
export const saveMeta = (m) => writeJson(join(DATA, 'meta.json'), m, true);
export const loadPicksLog = () => readJson(join(DATA, 'picks.json'), {});

const iso = (d) => d.toISOString().slice(0, 10);

export function nextDrawDate(id, afterDate) {
  const g = GAMES[id];
  const d = new Date(`${afterDate}T12:00:00Z`);
  for (let i = 1; i <= 8; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (g.days.includes(d.getUTCDay())) return iso(d);
  }
  return null;
}

// Rebuilds summary.json, picks.json and rules.json from the stored history.
export async function buildOutputs() {
  const meta = await loadMeta();
  const picksLog = await loadPicksLog();
  const summary = { generatedAt: new Date().toISOString(), games: {} };
  for (const id of GAME_IDS) {
    const draws = await loadHistory(id);
    if (!draws.length) continue;
    const latest = draws[draws.length - 1];
    const m = meta[id] || {};
    let next = m.next && m.next.date > latest.date ? m.next : { date: nextDrawDate(id, latest.date), jackpot: null, mustBeWon: false };
    const a = analyse(id, draws);
    picksLog[id] = picksLog[id] || {};
    // Picks for a draw are frozen once published, so both phones and any played lines stay in step.
    if (!picksLog[id][next.date]) {
      const p = makePicks(id, draws, next.date, { analysis: a });
      picksLog[id][next.date] = { lines: p.lines, basedOn: latest.date, createdAt: summary.generatedAt };
    }
    const lastPicks = picksLog[id][latest.date];
    const lastPicksResult = lastPicks
      ? lastPicks.lines.map((l) => {
          const r = checkLine(id, l, latest);
          return { key: l.key, total: r.total, wins: r.wins.map((w) => ({ round: w.round, tier: w.tier.label, amount: w.amount })) };
        })
      : null;
    // Keep only recent picks in the log.
    const keep = Object.keys(picksLog[id]).sort().slice(-40);
    picksLog[id] = Object.fromEntries(keep.map((k) => [k, picksLog[id][k]]));
    summary.games[id] = {
      next,
      latest,
      picks: { drawDate: next.date, ...picksLog[id][next.date] },
      lastPicksResult,
      value: drawValue(id, next, latest.breakdown || draws.findLast((d) => d.breakdown)?.breakdown, draws),
      historyCount: draws.length,
      eraDraws: a.draws,
    };
  }
  const prevSummary = await readJson(join(DATA, 'summary.json'), null);
  const same = prevSummary && JSON.stringify({ ...prevSummary, generatedAt: 0 }) === JSON.stringify({ ...summary, generatedAt: 0 });
  if (same) summary.generatedAt = prevSummary.generatedAt;
  else await writeJson(join(DATA, 'summary.json'), summary, true);
  await writeJson(join(DATA, 'picks.json'), picksLog);
  await writeJson(join(DATA, 'rules.json'), rulesJson(), true);
  return summary;
}
