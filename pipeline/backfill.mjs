// One-off: loads every year of history from the lottery.co.uk archives. Polite pace, about 2 minutes.
// node pipeline/backfill.mjs [gameId]
import { GAME_IDS, GAMES } from '../web/engine/rules.js';
import { fetchText, archiveUrl, parseArchive, mergeDraws, sleep } from './sources.js';
import { loadHistory, saveHistory } from './store.js';

const only = process.argv[2];
const thisYear = new Date().getUTCFullYear();
for (const id of GAME_IDS.filter((g) => !only || g === only)) {
  let draws = await loadHistory(id);
  for (let y = GAMES[id].archiveFrom; y <= thisYear; y++) {
    const html = await fetchText(archiveUrl(id, y));
    if (!html) {
      console.log(`${id} ${y}: no page`);
      continue;
    }
    const { draws: got, rejected } = parseArchive(id, html);
    draws = mergeDraws(draws, got);
    console.log(`${id} ${y}: ${got.length} draws${rejected.length ? `, skipped ${rejected.length}: ${rejected.join(' ')}` : ''}`);
    await sleep(1500);
  }
  await saveHistory(id, draws);
  console.log(`${id}: ${draws.length} draws saved`);
}
