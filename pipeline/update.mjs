// Fetches the latest results for every game, fills any gaps, then rebuilds the app's data files.
// Run after each draw (GitHub Actions does this on a schedule): node pipeline/update.mjs
import { GAME_IDS, GAMES } from '../web/engine/rules.js';
import { fetchText, archiveUrl, feedUrl, parseArchive, parseFeed, mergeDraws, sleep } from './sources.js';
import { loadHistory, saveHistory, loadMeta, saveMeta, buildOutputs } from './store.js';

const now = new Date();
const years = [now.getUTCFullYear()];
if (now.getUTCMonth() === 0) years.unshift(now.getUTCFullYear() - 1);

const meta = await loadMeta();
let problems = 0;
for (const id of GAME_IDS) {
  let draws = await loadHistory(id);
  const before = draws.length;
  for (const y of years) {
    try {
      const html = await fetchText(archiveUrl(id, y));
      if (html) {
        const { draws: got, rejected } = parseArchive(id, html);
        if (rejected.length) console.warn(`${id} ${y}: skipped ${rejected.length} rows (${rejected.slice(0, 3).join(', ')})`);
        draws = mergeDraws(draws, got);
      }
    } catch (e) {
      problems++;
      console.warn(`${id} archive ${y} failed: ${e.message}`);
    }
    await sleep(1500);
  }
  try {
    const xml = await fetchText(feedUrl(id));
    const feed = xml && parseFeed(id, xml);
    const g = GAMES[id];
    const valid = feed && feed.draw.sets.length && feed.draw.sets.every((s) => s.m.length === g.main.drawn);
    if (valid) {
      draws = mergeDraws(draws, [feed.draw]);
      meta[id] = { next: feed.next, feedDate: feed.draw.date, fetchedAt: now.toISOString() };
    } else {
      problems++;
      console.warn(`${id}: official feed returned nothing usable`);
    }
  } catch (e) {
    problems++;
    console.warn(`${id} feed failed: ${e.message}`);
  }
  await saveHistory(id, draws);
  console.log(`${GAMES[id].name}: ${draws.length} draws (+${draws.length - before}), latest ${draws.at(-1)?.date}`);
  await sleep(1000);
}
await saveMeta(meta);
const summary = await buildOutputs();
for (const [id, s] of Object.entries(summary.games)) {
  console.log(`${id}: next ${s.next.date} jackpot ${s.next.jackpot ?? s.next.jackpotText ?? '-'} value ${s.value.ratio.toFixed(2)}x (${s.value.verdict})`);
}
if (problems) console.warn(`${problems} source problem(s), see warnings above`);
