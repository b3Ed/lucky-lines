// Rebuilds summary/picks/rules from stored history without fetching anything.
import { buildOutputs } from './store.js';

const s = await buildOutputs();
for (const [id, g] of Object.entries(s.games)) {
  console.log(`${id} ${g.picks.drawDate}: ${g.picks.lines.map((l) => `${l.label} ${l.strength} [${l.main.join(' ')}${l.extra.length ? ` + ${l.extra.join(' ')}` : ''}]`).join(' | ')}`);
}
