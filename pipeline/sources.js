import { GAMES } from '../web/engine/rules.js';

const UA = 'Mozilla/5.0 (compatible; personal lottery results reader)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (e) {
      last = e;
      await sleep(2000 * (i + 1));
    }
  }
  throw last;
}

export const archiveUrl = (gameId, year) => `https://www.lottery.co.uk/${GAMES[gameId].site}/results/archive-${year}`;
export const feedUrl = (gameId) => `https://www.national-lottery.co.uk/results/${GAMES[gameId].feed}/draw-history/xml`;

const CLASSES = {
  lotto: { main: /^lotto-ball/, extra: /^lotto-bonus-ball/ },
  euromillions: { main: /^euromillions-ball/, extra: /^euromillions-lucky-star/ },
  thunderball: { main: /^thunderball-ball/, extra: /^thunderball-thunderball/ },
  setforlife: { main: /^setForLife-ball/, extra: /^setForLife-life-ball/ },
};

const money = (s) => Number(String(s).replace(/[^0-9.]/g, '')) || 0;

// Parses one lottery.co.uk year archive into draws, oldest first.
export function parseArchive(gameId, html) {
  const g = GAMES[gameId];
  const cls = CLASSES[gameId];
  const out = [];
  const rejected = [];
  for (const row of html.split('<tr').slice(1)) {
    const dm = row.match(/results-(\d{2})-(\d{2})-(\d{4})/);
    if (!dm) continue;
    const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    const balls = [...row.matchAll(/class="result small ([A-Za-z0-9-]+)[^"]*">\s*(\d+)\s*</g)].map((x) => ({ c: x[1], n: +x[2] }));
    const rounds = new Map();
    for (const b of balls) {
      const r = (b.c.match(/round-(\d)/) || [, '1'])[1];
      if (!rounds.has(r)) rounds.set(r, { m: [], x: [] });
      if (cls.extra.test(b.c)) rounds.get(r).x.push(b.n);
      else if (cls.main.test(b.c)) rounds.get(r).m.push(b.n);
    }
    const sets = [...rounds.keys()].sort().map((k) => {
      const s = rounds.get(k);
      return { m: s.m.sort((a, b) => a - b), x: s.x.sort((a, b) => a - b) };
    });
    const extraCount = g.bonus ? 1 : g.extra.drawn;
    const ok = sets.length >= 1 && sets.every((s) => s.m.length === g.main.drawn && s.x.length === extraCount);
    if (!ok) {
      rejected.push(date);
      continue;
    }
    const jpMatch = [...row.matchAll(/&pound;([\d,]+)/g)].pop();
    out.push({ date, sets, jp: jpMatch ? money(jpMatch[1]) : null, rolled: /Rolled/i.test(row) });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { draws: out, rejected };
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : null;
};

function parseTiers(block) {
  return [...block.matchAll(/<prize-tier level="(\d+)">([\s\S]*?)<\/prize-tier>/g)].map((t) => {
    const winners = Number(tag(t[2], 'number-of-winners') || 0);
    const value = tag(t[2], 'win-value');
    const text = tag(t[2], 'nonCashText');
    return { level: +t[1], winners, total: value === null ? null : money(value), text };
  });
}

// Parses the official National Lottery draw-history XML (latest draw only).
export function parseFeed(gameId, xml) {
  const date = tag(xml, 'draw-date');
  if (!date) return null;
  const sets = [...xml.matchAll(/<balls>([\s\S]*?)<\/balls>/g)].map((b) => ({
    m: [...b[1].matchAll(/<ball number="\d+">(\d+)<\/ball>/g)].map((x) => +x[1]).sort((a, c) => a - c),
    x: [...b[1].matchAll(/<bonus-ball[^>]*>(\d+)<\/bonus-ball>/g)].map((x) => +x[1]).sort((a, c) => a - c),
  }));
  let tiers;
  const uk = xml.match(/<prize-tiers country="UK">([\s\S]*?)<\/prize-tiers>/);
  const all = xml.match(/<prize-tiers country="All">([\s\S]*?)<\/prize-tiers>/);
  if (uk) {
    const ukT = parseTiers(uk[1]);
    const allT = all ? parseTiers(all[1]) : [];
    tiers = ukT.map((t) => {
      const a = allT.find((x) => x.level === t.level);
      return { level: t.level, winners: a ? a.winners : t.winners, ukWinners: t.winners, prize: t.winners && t.total ? round2(t.total / t.winners) : null, text: t.text };
    });
  } else {
    const block = xml.match(/<prize-tiers>([\s\S]*?)<\/prize-tiers>/);
    tiers = block ? parseTiers(block[1]).map((t) => ({ level: t.level, winners: t.winners, prize: t.winners && t.total ? round2(t.total / t.winners) : null, text: t.text })) : [];
  }
  const raffles = [...xml.matchAll(/<raffle number="\d+">([^<]+)<\/raffle>/g)].map((x) => x[1]);
  const nextJpRaw = tag(xml, 'next-estimated-jackpot');
  const nextJp = nextJpRaw && /^[£\d,.\s]+$/.test(nextJpRaw) ? money(nextJpRaw) : null;
  return {
    draw: {
      date,
      no: Number(tag(xml, 'draw-number')) || null,
      sets,
      breakdown: { confirmed: tag(xml, 'confirmed') === 'Y', tiers, raffles },
      jp: money(tag(xml, 'jackpot-amount') || '') || null,
      rolled: tag(xml, 'rollover') === 'Y',
    },
    next: {
      date: tag(xml, 'next-draw-date'),
      jackpot: nextJp,
      jackpotText: nextJp ? null : nextJpRaw,
      rollovers: Number(tag(xml, 'rollover-count') || 0),
      mustBeWon: tag(xml, 'next-estimated-jackpot-roll-down') === 'Y',
    },
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

// Merge new draws into history by date. Later sources win field by field, nothing is dropped.
export function mergeDraws(history, incoming) {
  const byDate = new Map(history.map((d) => [d.date, d]));
  for (const d of incoming) {
    const prev = byDate.get(d.date) || {};
    const merged = { ...prev };
    for (const [k, v] of Object.entries(d)) if (v !== null && v !== undefined) merged[k] = v;
    byDate.set(d.date, merged);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export { sleep };
