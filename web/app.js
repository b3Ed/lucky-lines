import { GAMES, GAME_IDS, tierProbability, oddsText, anyPrizeProbability, checkLine, analyse } from './engine/index.js';
import { DATA_SOURCES, SHARE_BASE, REMOTE_DATA } from './config.js';

const KEY = 'lucky-lines-v1';
const DATA_KEY = 'lucky-lines-data-v1';
const bridge = window.LuckyBridge || null;
const view = document.getElementById('view');
const sheet = document.getElementById('sheet');

// ---------- state ----------
const DEFAULT_STATE = () => ({
  settings: { name: '', friend: '', usual: ['lotto', 'euromillions'], remind: true, remindTime: '18:00', winAlerts: true, theme: 'auto' },
  tickets: [],
  dismissed: {},
  inbox: [],
  startedAt: todayIso(),
});
let S = loadState();
let D = { summary: null, picks: {}, history: {}, source: null, cached: false };
const ui = { page: 'home', game: 'lotto', tab: 'picks', statsWindow: 50, linesTab: 'upcoming', period: 'month' };

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.settings) {
      const base = DEFAULT_STATE();
      return { ...base, ...raw, settings: { ...base.settings, ...raw.settings } };
    }
  } catch (e) { /* first run or storage blocked */ }
  return DEFAULT_STATE();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ }
  syncNative();
}
function syncNative() {
  if (!bridge?.sync) return;
  const cutoff = isoAddDays(todayIso(), -4);
  const payload = {
    dataUrl: REMOTE_DATA,
    settings: { remind: S.settings.remind, remindTime: S.settings.remindTime, winAlerts: S.settings.winAlerts, usual: S.settings.usual },
    tickets: S.tickets.filter((t) => t.drawDate >= cutoff && t.status !== 'skipped').map((t) => ({ id: t.id, game: t.game, drawDate: t.drawDate, main: t.main, extra: t.extra || [], label: t.label, status: t.status })),
    next: D.summary ? Object.fromEntries(Object.entries(D.summary.games).map(([g, s]) => [g, { date: s.next.date, jackpot: s.next.jackpot, jackpotText: s.next.jackpotText || null }])) : {},
  };
  try { bridge.sync(JSON.stringify(payload)); } catch (e) { /* older shell */ }
}

// ---------- helpers ----------
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoAddDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const dateObj = (iso) => new Date(`${iso}T12:00:00`);
function dayLabel(iso, long = false) {
  const t = todayIso();
  if (iso === t) return 'Today';
  if (iso === isoAddDays(t, 1)) return 'Tomorrow';
  if (iso === isoAddDays(t, -1)) return 'Yesterday';
  return dateObj(iso).toLocaleDateString('en-GB', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
}
const shortDate = (iso) => dateObj(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function money(n, opts = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : opts.plus && n > 0 ? '+' : '';
  if (abs >= 1e6) return `${sign}£${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1).replace(/\.0$/, '')}m`;
  if (abs >= 10000) return `${sign}£${Math.round(abs).toLocaleString('en-GB')}`;
  return `${sign}£${abs.toLocaleString('en-GB', { minimumFractionDigits: abs % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
const pence = (n) => (n < 1 ? `${Math.round(n * 100)}p` : money(n));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const sumOf = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const ICON = {
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>',
  trend: '<svg viewBox="0 0 24 24"><path d="M3 17 9 11l4 4 8-8M15 7h6v6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2600);
}

// ---------- data ----------
async function fetchJson(base, path) {
  const bust = base.startsWith('http') ? `?t=${Math.floor(Date.now() / 60000)}` : '';
  const res = await fetch(`${base}${path}${bust}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}
async function loadData() {
  for (const base of DATA_SOURCES) {
    try {
      const [summary, picks, ...hist] = await Promise.all([
        fetchJson(base, 'summary.json'),
        fetchJson(base, 'picks.json'),
        ...GAME_IDS.map((g) => fetchJson(base, `games/${g}.json`)),
      ]);
      D = { summary, picks, history: Object.fromEntries(GAME_IDS.map((g, i) => [g, hist[i].draws])), source: base, cached: false };
      try { localStorage.setItem(DATA_KEY, JSON.stringify({ summary, picks, history: D.history, source: base })); } catch (e) { /* too big or blocked */ }
      return true;
    } catch (e) {
      console.warn('data source failed', base, e.message);
    }
  }
  try {
    const c = JSON.parse(localStorage.getItem(DATA_KEY));
    if (c?.summary) {
      D = { ...c, cached: true };
      return true;
    }
  } catch (e) { /* no cache */ }
  return false;
}
const G = (gid) => D.summary?.games?.[gid];
const drawOn = (gid, date) => D.history[gid]?.find((d) => d.date === date);
const latestDraw = (gid) => D.history[gid]?.[D.history[gid].length - 1];

function upcomingDates(gid, count = 4) {
  const g = GAMES[gid];
  const out = [];
  const now = new Date();
  const [ch, cm] = g.cutoff.split(':').map(Number);
  let iso = todayIso();
  for (let i = 0; i < 21 && out.length < count; i++) {
    const day = dateObj(iso).getDay();
    const isToday = i === 0;
    const beforeCutoff = now.getHours() < ch || (now.getHours() === ch && now.getMinutes() < cm);
    if (g.days.includes(day) && (!isToday || beforeCutoff)) out.push(iso);
    iso = isoAddDays(iso, 1);
  }
  return out;
}
// The draw our picks are for. Uses the published next draw unless the data is behind.
function nextDrawFor(gid) {
  const s = G(gid);
  const t = todayIso();
  if (s?.next?.date && s.next.date >= t) return s.next.date;
  return upcomingDates(gid, 1)[0];
}
function cutoffText(gid, date) {
  const g = GAMES[gid];
  if (date !== todayIso()) return `Sales close ${g.cutoff.replace(':', '.')}pm on the day`.replace('19.30pm', '7.30pm');
  const [h, m] = g.cutoff.split(':').map(Number);
  const end = new Date();
  end.setHours(h, m, 0, 0);
  const mins = Math.round((end - new Date()) / 60000);
  if (mins <= 0) return 'Sales closed for tonight';
  if (mins < 120) return `Sales close in ${mins} min`;
  return `Sales close in ${Math.floor(mins / 60)}h ${mins % 60}m`;
}
function jackpotText(gid) {
  const n = G(gid)?.next;
  if (!n) return '-';
  if (n.jackpot) return money(n.jackpot);
  if (n.jackpotText) return n.jackpotText.replace(' every month for 30 years', '/month for 30 yrs');
  if (gid === 'thunderball') return '£500,000';
  if (gid === 'setforlife') return '£10,000/month for 30 yrs';
  return '-';
}

// ---------- balls ----------
function lineBalls(gid, line, set = null, sm = false) {
  const g = GAMES[gid];
  const c = sm ? ' sm' : '';
  let html = line.main.map((n) => {
    const hit = set && set.m.includes(n);
    const bonus = set && g.bonus && set.x.includes(n) && !set.m.includes(n);
    return `<span class="ball${c}${hit ? ' hit' : ''}${bonus ? ' hit bonus' : ''}${set && !hit && !bonus ? ' dim' : ''}">${n}</span>`;
  }).join('');
  if (line.extra?.length) {
    html += '<span class="plus">+</span>' + line.extra.map((n) => {
      const hit = set && set.x.includes(n);
      return `<span class="ball x${c}${hit ? ' hit' : ''}${set && !hit ? ' dim' : ''}">${n}</span>`;
    }).join('');
  }
  return `<div class="balls" style="--c:${g.colour}">${html}</div>`;
}
function drawBalls(gid, set, sm = false) {
  const g = GAMES[gid];
  const c = sm ? ' sm' : '';
  let html = set.m.map((n) => `<span class="ball${c} hit">${n}</span>`).join('');
  html += '<span class="plus">+</span>';
  html += g.bonus
    ? set.x.map((n) => `<span class="ball${c} bonus" title="Bonus Ball">${n}</span>`).join('')
    : set.x.map((n) => `<span class="ball x${c}">${n}</span>`).join('');
  return `<div class="balls" style="--c:${g.colour}">${html}</div>`;
}
function drawSetsHtml(gid, draw, line = null, sm = true) {
  return draw.sets.map((s, i) => `<div class="row">${draw.sets.length > 1 ? `<span class="round-tag">R${i + 1}</span>` : ''}${line ? lineBalls(gid, line, s, sm) : drawBalls(gid, s, sm)}</div>`).join('');
}

// ---------- tickets and results ----------
function ticketResult(t) {
  const d = drawOn(t.game, t.drawDate);
  if (!d) return null;
  return { draw: d, ...checkLine(t.game, t, d) };
}
const isPlanned = (gid, date, line) =>
  S.tickets.find((t) => t.game === gid && t.drawDate === date && t.status !== 'skipped' && t.main.join() === line.main.join() && (t.extra || []).join() === (line.extra || []).join());

function addTicket(gid, date, line, source, extra = {}) {
  const t = { id: uid(), game: gid, drawDate: date, main: [...line.main], extra: [...(line.extra || [])], label: line.label || '', source, stake: GAMES[gid].price, status: 'planned', createdAt: new Date().toISOString(), ...extra };
  S.tickets.push(t);
  return t;
}

// Things to ask the user: did you play these lines?
function prompts() {
  const out = [];
  const today = todayIso();
  const done = new Set();
  for (const t of S.tickets) {
    if (t.status !== 'planned' || t.drawDate > today) continue;
    if (!drawOn(t.game, t.drawDate) && t.drawDate === today) continue;
    const k = `${t.game}|${t.drawDate}`;
    if (done.has(k)) continue;
    done.add(k);
    out.push({ kind: 'confirm', game: t.game, date: t.drawDate, tickets: S.tickets.filter((x) => x.game === t.game && x.drawDate === t.drawDate && x.status === 'planned') });
  }
  const since = isoAddDays(S.startedAt, -7);
  for (const gid of S.settings.usual) {
    const draws = (D.history[gid] || []).filter((d) => d.date >= since && d.date >= isoAddDays(today, -10));
    for (const d of draws.slice(-2)) {
      const k = `${gid}|${d.date}`;
      if (done.has(k) || S.dismissed[k]) continue;
      const p = D.picks?.[gid]?.[d.date];
      if (!p) continue;
      if (S.tickets.some((t) => t.game === gid && t.drawDate === d.date && t.source === 'pick')) continue;
      out.push({ kind: 'picks', game: gid, date: d.date, lines: p.lines });
    }
  }
  return out;
}

// ---------- navigation ----------
function go(page, extra = {}) {
  Object.assign(ui, { page }, extra);
  render();
  window.scrollTo({ top: 0 });
}
function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.page));
  if (!D.summary) {
    view.innerHTML = `<div class="card empty"><h2>No results yet</h2><p class="muted" style="margin-top:6px">Couldn't reach the results data. Check your connection and try again.</p><div style="margin-top:14px"><button class="btn primary" data-action="reload">Try again</button></div></div>`;
    return;
  }
  const pages = { home: renderHome, game: renderGame, lines: renderLines, money: renderMoney, settings: renderSettings };
  view.className = 'fade-in';
  view.innerHTML = (pages[ui.page] || renderHome)();
  if (ui.page === 'game' && ui.tab === 'stats') drawFreqTooltips();
}

// ---------- home ----------
function renderHome() {
  const s = S.settings;
  const hello = s.name ? `Hi ${esc(s.name)}` : 'Next draws';
  const items = GAME_IDS.map((gid) => ({ gid, date: nextDrawFor(gid) })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : GAME_IDS.indexOf(a.gid) - GAME_IDS.indexOf(b.gid)));
  const usual = items.filter((i) => s.usual.includes(i.gid));
  const others = items.filter((i) => !s.usual.includes(i.gid));
  const parts = [];
  parts.push(`<div class="spread"><div><h1>${hello}</h1><p class="muted small">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>${staleBadge()}</div>`);
  parts.push(...suggestions());
  for (const p of prompts()) parts.push(promptCard(p));
  if (S.inbox.length) parts.push(inboxCard());
  parts.push(`<div class="section-title"><h2>Your games</h2><span class="muted small">${usual.length ? 'Higher confidence pick shown' : ''}</span></div>`);
  if (!usual.length) parts.push(`<div class="card empty">Pick the games you normally play in <a href="#" data-action="nav" data-to="settings">Settings</a>.</div>`);
  for (const i of usual) parts.push(nextCard(i.gid, i.date));
  if (others.length) {
    parts.push(`<div class="section-title"><h2>Other games</h2></div>`);
    for (const i of others) parts.push(nextCard(i.gid, i.date, true));
  }
  parts.push(latestResultsCard());
  parts.push(`<p class="muted tiny" style="text-align:center;padding:4px 12px">Every combination has the same odds of being drawn. Picks here are built to fit past patterns and to avoid numbers most people play, so a win is less likely to be shared. Play for fun, set a limit.</p>`);
  return parts.join('');
}
function staleBadge() {
  if (D.cached) return '<span class="pill warn">Offline copy</span>';
  const gen = D.summary?.generatedAt ? new Date(D.summary.generatedAt) : null;
  if (gen && Date.now() - gen > 3 * 864e5) return '<span class="pill warn">Data is a few days old</span>';
  return '';
}
function suggestions() {
  const out = [];
  for (const gid of GAME_IDS) {
    const v = G(gid)?.value;
    if (!v || v.fixedPrizes) continue;
    const usual = S.settings.usual.includes(gid);
    const g = GAMES[gid];
    if (v.verdict === 'strong' || (!usual && (v.verdict === 'good' || v.verdict === 'better'))) {
      const head = v.verdict === 'strong' ? `${g.name} must be won` : usual ? `Big week for ${g.name}` : `Worth a go: ${g.name}`;
      const why = v.verdict === 'strong'
        ? 'If nobody matches all six, the jackpot rolls down to the smaller prizes. These are the best-value draws there are.'
        : `${jackpotText(gid)} jackpot. Each £1 staked is worth about ${pence(v.perPound)} back this draw against ${pence(v.basePerPound)} in a normal one, ${v.ratio.toFixed(1)}x usual value.`;
      out.push(`<div class="banner" style="--c:${g.colour}">${ICON.trend}<div class="stack" style="gap:8px"><div><h3>${head}</h3><p class="small" style="opacity:.92;margin-top:2px">${why} You don't normally play this one${usual ? '' : ''}, so it might be worth a line this week.</p></div><div class="btns"><button class="btn sm" data-action="open-game" data-game="${gid}">See picks</button></div></div></div>`
        .replace(" You don't normally play this one, so it might be worth a line this week.", usual ? '' : " You don't normally play this one, so it might be worth a line this week."));
    }
  }
  return out;
}
function nextCard(gid, date, compact = false) {
  const g = GAMES[gid];
  const s = G(gid);
  const picks = s?.picks?.drawDate === date ? s.picks.lines : null;
  const top = picks?.find((p) => p.top) || picks?.[0];
  const planned = S.tickets.filter((t) => t.game === gid && t.drawDate === date && t.status !== 'skipped').length;
  const v = s?.value;
  const roll = s?.next?.rollovers ? `<span class="pill" style="--c:${g.colour}">${s.next.rollovers === 1 ? 'Rollover' : `${s.next.rollovers}x rollover`}</span>` : '';
  return `<div class="card game-card" style="--c:${g.colour}" data-action="open-game" data-game="${gid}">
    <div class="spread"><div class="row"><span class="pill solid">${g.name}</span>${roll}${v && v.verdict !== 'normal' && !v.fixedPrizes ? `<span class="pill good">${v.ratio.toFixed(1)}x value</span>` : ''}</div><span class="small muted">${dayLabel(date)}</span></div>
    <div class="spread" style="margin-top:10px;align-items:flex-end"><div><div class="jackpot">${jackpotText(gid)}</div><div class="small muted">${money(g.price)} a line &middot; ${cutoffText(gid, date)}</div></div>
    ${planned ? `<span class="pill good">${ICON.check.replace('<svg', '<svg width="14" height="14" style="fill:none;stroke:currentColor;stroke-width:3"')} ${planned} line${planned > 1 ? 's' : ''} in</span>` : ''}</div>
    ${top && !compact ? `<div style="margin-top:12px" class="stack"><div class="spread"><span class="small"><b>Higher confidence pick</b></span><span class="small muted">Strength ${top.strength}</span></div>${lineBalls(gid, top)}</div>` : ''}
  </div>`;
}
function promptCard(p) {
  const g = GAMES[p.game];
  const d = drawOn(p.game, p.date);
  const lines = p.kind === 'confirm' ? p.tickets : p.lines;
  const body = lines.map((l, i) => {
    const res = d ? checkLine(p.game, l, d) : null;
    const id = p.kind === 'confirm' ? l.id : i;
    return `<div class="ticket"><div class="spread"><span class="small"><b>${esc(l.label || 'My line')}</b></span>${res ? (res.total > 0 ? `<span class="win">Won ${money(res.total)}${res.estimated ? ' est.' : ''}</span>` : '<span class="small muted">No win</span>') : '<span class="small muted">Result due</span>'}</div>
      ${d ? drawSetsHtml(p.game, d, l) : lineBalls(p.game, l, null, true)}
      <div class="btns"><button class="btn sm good" data-action="answer" data-kind="${p.kind}" data-game="${p.game}" data-date="${p.date}" data-id="${id}" data-played="1">${ICON.check} I played it</button><button class="btn sm ghost" data-action="answer" data-kind="${p.kind}" data-game="${p.game}" data-date="${p.date}" data-id="${id}" data-played="0">Didn't play</button></div></div>`;
  }).join('');
  const title = p.kind === 'confirm' ? `Did you play these?` : `Did you play our picks?`;
  return `<div class="card" style="--c:${g.colour};border-left:5px solid var(--c)"><div class="card-head"><div><h3>${title}</h3><p class="small muted">${g.name}, ${dayLabel(p.date, true)}. ${money(g.price)} a line.</p></div>${p.kind === 'picks' ? `<button class="icon-btn" aria-label="Didn't play any" data-action="dismiss" data-key="${p.game}|${p.date}">${ICON.x.replace('<svg', '<svg width="20" height="20" style="fill:none;stroke:currentColor;stroke-width:2"')}</button>` : ''}</div>${body}</div>`;
}
function inboxCard() {
  return `<div class="card"><div class="card-head"><h3>Lines sent to you</h3></div>${S.inbox.map((m) => {
    const g = GAMES[m.game];
    return `<div class="ticket"><div class="spread"><span class="small"><b>${esc(m.from)}</b> sent ${m.lines.length} ${g.name} line${m.lines.length > 1 ? 's' : ''} for ${dayLabel(m.date)}</span></div>${m.lines.map((l) => lineBalls(m.game, l, null, true)).join('')}<div class="btns"><button class="btn sm primary" data-action="inbox-add" data-id="${m.id}">${ICON.plus} Add to my lines</button><button class="btn sm ghost" data-action="inbox-drop" data-id="${m.id}">Ignore</button></div></div>`;
  }).join('')}</div>`;
}
function latestResultsCard() {
  const rows = GAME_IDS.map((gid) => {
    const d = latestDraw(gid);
    if (!d) return '';
    const mine = S.tickets.filter((t) => t.game === gid && t.drawDate === d.date && t.status === 'played');
    const won = sumOf(mine, (t) => checkLine(gid, t, d).total);
    return `<div class="ticket" data-action="open-game" data-game="${gid}" data-tab="results" style="cursor:pointer"><div class="spread"><span class="small"><b>${GAMES[gid].name}</b> <span class="muted">${dayLabel(d.date)}</span></span>${mine.length ? (won > 0 ? `<span class="win small">You won ${money(won)}</span>` : '<span class="small muted">No win this time</span>') : ''}</div>${drawSetsHtml(gid, d)}</div>`;
  }).join('');
  return `<div class="section-title"><h2>Latest results</h2></div><div class="card">${rows}</div>`;
}

// ---------- game page ----------
function renderGame() {
  const gid = ui.game;
  const g = GAMES[gid];
  const seg = `<div class="seg games">${GAME_IDS.map((id) => `<button style="--c:${GAMES[id].colour}" class="${id === gid ? 'on' : ''}" data-action="pick-game" data-game="${id}">${GAMES[id].name}</button>`).join('')}</div>`;
  const tabs = [['picks', 'Picks'], ['prizes', 'Prizes'], ['stats', 'Analysis'], ['results', 'Results']];
  const sub = `<div class="seg">${tabs.map(([k, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-action="tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
  const body = { picks: gamePicks, prizes: gamePrizes, stats: gameStats, results: gameResults }[ui.tab](gid);
  return `${seg}<div class="spread" style="--c:${g.colour}"><h1>${g.name}</h1><span class="pill solid">${money(g.price)} a line</span></div><p class="muted small" style="margin-top:-8px">${g.blurb}</p>${sub}${body}`;
}
function gamePicks(gid) {
  const g = GAMES[gid];
  const s = G(gid);
  const date = nextDrawFor(gid);
  const picks = s?.picks?.drawDate === date ? s.picks.lines : null;
  const v = s?.value;
  const parts = [];
  parts.push(`<div class="card" style="--c:${g.colour}"><div class="spread"><div><span class="small muted">${dayLabel(date, true)}</span><div class="jackpot">${jackpotText(gid)}</div><span class="small muted">${cutoffText(gid, date)}</span></div>${s?.next?.mustBeWon ? '<span class="pill warn">Must be won</span>' : ''}</div>
    ${v ? `<div class="kv" style="margin-top:12px"><div><b>${pence(v.perPound)}</b><span>back per £1, this draw</span></div><div><b>${pence(v.basePerPound)}</b><span>in a normal draw</span></div><div><b>${oddsText(anyPrizeProbability(gid))}</b><span>chance of any prize</span></div></div>` : ''}
  </div>`);
  if (!picks) {
    parts.push(`<div class="card empty">Picks for this draw appear once the last result is in.</div>`);
    return parts.join('');
  }
  picks.forEach((p) => {
    const planned = isPlanned(gid, date, p);
    parts.push(`<div class="card pick${p.top ? ' top' : ''}" style="--c:${g.colour}">
      <div class="spread"><div class="row"><h3>${esc(p.label)}</h3>${p.top ? `<span class="pill solid">Higher confidence</span>` : ''}</div><span class="small muted num">Strength ${p.strength}</span></div>
      <div class="meter" style="margin:8px 0 12px"><i style="--w:${p.strength}%"></i></div>
      ${lineBalls(gid, p)}
      <p class="small muted" style="margin-top:10px">${esc(p.about)}</p>
      ${p.tags?.length ? `<div class="tags" style="margin-top:8px">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="btns" style="margin-top:12px"><button class="btn sm ${planned ? 'on' : 'primary'}" data-action="toggle-plan" data-game="${gid}" data-date="${date}" data-key="${p.key}">${planned ? `${ICON.check} Playing this` : `${ICON.plus} I'm playing this`}</button><button class="btn sm ghost" data-action="share-pick" data-game="${gid}" data-date="${date}" data-key="${p.key}">${ICON.share} Send</button></div>
    </div>`);
  });
  parts.push(`<div class="btns"><button class="btn block ghost" data-action="share-all" data-game="${gid}" data-date="${date}">${ICON.share} Send all three to ${esc(S.settings.friend || 'a friend')}</button><button class="btn block ghost" data-action="add-line" data-game="${gid}">${ICON.plus} Add my own line</button></div>`);
  parts.push(`<p class="note">Strength scores how well a line fits the shape of past winning lines (sum, odd/even, spread) and how few birthday or pattern numbers it carries. It does not change the odds. It makes a shared jackpot less likely.</p>`);
  const last = s?.lastPicksResult;
  if (last) {
    const won = sumOf(last, (r) => r.total);
    parts.push(`<div class="note ${won > 0 ? 'good' : ''}">Last draw (${dayLabel(s.latest.date)}), our three picks ${won > 0 ? `won ${money(won)} between them` : 'won nothing'}. Full record on the Results tab.</div>`);
  }
  return parts.join('');
}
function gamePrizes(gid) {
  const g = GAMES[gid];
  const s = G(gid);
  const d = latestDraw(gid);
  const bd = d?.breakdown || null;
  const rows = g.tiers.map((t, i) => {
    const p = tierProbability(gid, t);
    const prize = t.jackpot ? jackpotText(gid) : t.prizeText ? esc(t.prizeText) : t.prize !== undefined ? money(t.prize) : `~${money(t.avgPrize)}`;
    const last = bd ? g.tiers.length && [0, 1].slice(0, g.rounds).map((r) => bd.tiers.find((x) => x.level === i + 1 + r * g.tiers.length)).filter(Boolean) : [];
    const lastTxt = last && last.length ? last.map((x) => `${(x.winners || 0).toLocaleString('en-GB')}${x.prize && !t.prize ? ` @ ${money(x.prize)}` : ''}`).join(' / ') : '-';
    return `<tr><td><b>${t.label}</b></td><td class="r num">${prize}</td><td class="r num muted small">${oddsText(p * g.rounds)}</td>${bd ? `<td class="r num small">${lastTxt}</td>` : ''}</tr>`;
  }).join('');
  const parts = [];
  parts.push(`<div class="card"><div class="card-head"><h3>Stake</h3></div><div class="kv"><div><b>${money(g.price)}</b><span>per line</span></div><div><b>${oddsText(anyPrizeProbability(gid))}</b><span>any prize</span></div><div><b>${g.days.map((x) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][x]).join(', ')}</b><span>draw days</span></div></div>${g.rounds > 1 ? '<p class="note" style="margin-top:10px">Your £2 buys one line in both rounds. You can win in each round, but you cannot add matches across rounds.</p>' : ''}${g.raffle ? `<p class="note" style="margin-top:10px">Each line also gets a ${g.raffle.label} code. One UK code wins £1 million every draw.</p>` : ''}</div>`);
  parts.push(`<div class="card"><div class="card-head"><h3>Prize breakdown</h3>${bd ? `<span class="small muted">Last draw ${dayLabel(d.date)}</span>` : ''}</div><div style="overflow-x:auto"><table><thead><tr><th>Match</th><th class="r">Prize</th><th class="r">Odds</th>${bd ? `<th class="r">Winners${g.rounds > 1 ? ' R1/R2' : ''}</th>` : ''}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small muted" style="margin-top:10px">${g.tiers.some((t) => t.avgPrize) ? '~ marks prizes that depend on ticket sales and winner numbers, shown as the long-run average. ' : ''}${gid === 'lotto' ? 'Match 2 wins a free Lucky Dip, counted here as £2. ' : ''}${gid === 'setforlife' ? 'Top two prizes are monthly payments, shown at their full value. ' : ''}Odds are per line${g.rounds > 1 ? ' across both rounds' : ''}.</p></div>`);
  if (bd?.raffles?.length) parts.push(`<div class="card tight small"><b>${g.raffle?.label || 'Raffle'} last draw:</b> <span class="num">${bd.raffles.map(esc).join(', ')}</span></div>`);
  if (s?.value && !s.value.fixedPrizes) {
    const v = s.value;
    parts.push(`<div class="card"><div class="card-head"><h3>Is this a good draw to play?</h3><span class="pill ${v.verdict === 'normal' ? '' : 'good'}">${{ normal: 'Normal week', better: 'Better than usual', good: 'Good value', strong: 'Best value' }[v.verdict]}</span></div><p class="small">About ${v.linesEstimate.toLocaleString('en-GB')} lines were sold in the last draw${v.linesMeasured ? ' (worked out from the number of bottom-tier winners)' : ''}. With a ${money(v.jackpot)} jackpot, each £1 is worth about ${pence(v.perPound)} back on average, against ${pence(v.basePerPound)} when the jackpot sits near its usual ${money(v.baseJackpot)}. Bigger jackpots also bring more players, so the chance of sharing goes up too, and that is built in.</p></div>`);
  }
  return parts.join('');
}
function gameStats(gid) {
  const g = GAMES[gid];
  const draws = D.history[gid] || [];
  const windows = [[25, 'Last 25'], [50, 'Last 50'], [100, 'Last 100'], [100000, 'All']];
  const a = analyse(gid, draws, { window: ui.statsWindow });
  const parts = [];
  parts.push(`<div class="seg">${windows.map(([w, l]) => `<button class="${ui.statsWindow === w ? 'on' : ''}" data-action="window" data-w="${w}">${l}</button>`).join('')}</div>`);
  parts.push(`<p class="small muted" style="margin-top:-6px">${a.sets.toLocaleString('en-GB')} draws${g.rounds > 1 ? ' (each Lotto round counts once)' : ''} since ${shortDate(a.since)}, when the current ${g.main.pool}-ball format started. Hot and cold use the last ${a.window.toLocaleString('en-GB')}.</p>`);
  const chip = (r, label, xball = false) => `<div class="chip-num"><span class="ball${xball ? ' x' : ''}">${r.n}</span><small>${label(r)}</small></div>`;
  const hotLabel = (r) => `${r.recent}x`;
  const dueLabel = (r) => `${r.gap} ago`;
  parts.push(`<div class="card" style="--c:${g.colour}"><div class="card-head"><h3>Hot numbers</h3><span class="small muted">most drawn</span></div><div class="chips" style="--c:${g.colour}">${a.main.hot.map((r) => chip(r, hotLabel)).join('')}</div>
    <div class="card-head" style="margin-top:16px"><h3>Cold numbers</h3><span class="small muted">least drawn</span></div><div class="chips" style="--c:${g.colour}">${a.main.cold.map((r) => chip(r, hotLabel)).join('')}</div>
    <div class="card-head" style="margin-top:16px"><h3>Longest absent</h3><span class="small muted">draws since last seen</span></div><div class="chips" style="--c:${g.colour}">${a.main.overdue.map((r) => chip(r, dueLabel)).join('')}</div>
    ${a.extra ? `<div class="card-head" style="margin-top:16px"><h3>${g.extra.label}</h3><span class="small muted">hot / cold</span></div><div class="chips">${a.extra.hot.slice(0, 3).map((r) => chip(r, hotLabel, true)).join('')}<span class="plus" style="align-self:center">|</span>${a.extra.cold.slice(0, 3).map((r) => chip(r, hotLabel, true)).join('')}</div>` : ''}
  </div>`);
  parts.push(`<div class="card" style="--c:${g.colour}"><div class="card-head"><h3>How often each number came up</h3><span class="small muted">last ${a.window}</span></div>${freqChart(a, g)}<p class="tiny muted" style="margin-top:6px">Dashed line is what pure chance would give. Tap a bar for the number.</p><p id="freq-tip" class="small" style="min-height:20px;margin-top:4px"></p></div>`);
  const sh = a.shape;
  const oddRows = sh.odd.map((p, k) => ({ k, p })).filter((r) => r.p > 0.005);
  const maxOdd = Math.max(...sh.odd);
  parts.push(`<div class="card" style="--c:${g.colour}"><div class="card-head"><h3>Shape of winning lines</h3></div>
    <div class="kv"><div><b class="num">${Math.round(sh.sum.p25)}-${Math.round(sh.sum.p75)}</b><span>middle half of sums</span></div><div><b>${Math.round(sh.consecutive * 100)}%</b><span>have a consecutive pair</span></div><div><b>${sh.repeatsPerDraw.toFixed(2)}</b><span>numbers repeat from last draw</span></div></div>
    <h3 style="margin:14px 0 8px" class="small">Odd numbers per draw</h3>
    <div class="stack" style="gap:6px">${oddRows.map((r) => `<div class="hbar"><span>${r.k} odd</span><div class="track"><i style="--w:${(r.p / maxOdd) * 100}%"></i></div><span class="r num">${Math.round(r.p * 100)}%</span></div>`).join('')}</div>
    <h3 style="margin:14px 0 8px" class="small">Sum of the main numbers</h3>${sumChart(sh)}
  </div>`);
  parts.push(`<div class="card"><div class="card-head"><h3>Pairs drawn together most</h3><span class="small muted">chance alone: ${a.pairs.expected.toFixed(1)} each</span></div><div class="stack" style="gap:8px">${a.pairs.top.slice(0, 6).map((p) => `<div class="spread">${lineBalls(gid, { main: p.pair }, null, true)}<span class="num small">${p.count} times</span></div>`).join('')}</div></div>`);
  const fair = a.main.chiP > 0.01;
  parts.push(`<div class="card"><div class="card-head"><h3>Is the machine fair?</h3><span class="pill ${fair ? 'good' : 'warn'}">${fair ? 'Looks random' : 'Worth a look'}</span></div><p class="small">A chi-square test across all ${a.sets.toLocaleString('en-GB')} draws ${fair ? `finds nothing unusual (p = ${a.main.chiP.toFixed(2)}). The gaps between hot and cold numbers are the size chance produces, so they say nothing about the next draw.` : `shows more spread than chance usually gives (p = ${a.main.chiP.toFixed(3)}). Even so, with this many numbers, one result like this turns up by luck now and then.`}</p></div>`);
  return parts.join('');
}
function freqChart(a, g) {
  const nums = a.main.nums;
  const max = Math.max(...nums.map((r) => r.recent), a.main.expRecent * 1.3, 1);
  const w = 10;
  const H = 130;
  const hot = new Set(a.main.hot.map((r) => r.n));
  const cold = new Set(a.main.cold.map((r) => r.n));
  const bars = nums.map((r, i) => {
    const h = (r.recent / max) * (H - 12);
    return `<rect class="bar${hot.has(r.n) ? ' hot' : cold.has(r.n) ? ' cold' : ''}" data-n="${r.n}" data-c="${r.recent}" data-all="${r.all}" data-gap="${r.gap}" x="${i * w + 1}" y="${H - h}" width="${w - 2}" height="${Math.max(1, h)}" rx="2"></rect>`;
  }).join('');
  const ey = H - (a.main.expRecent / max) * (H - 12);
  const labels = nums.filter((r) => r.n === 1 || r.n % 10 === 0).map((r) => `<text x="${(r.n - 1) * w + w / 2}" y="${H + 11}" text-anchor="middle">${r.n}</text>`).join('');
  return `<svg class="freq" viewBox="0 0 ${nums.length * w} ${H + 14}" preserveAspectRatio="none" style="--c:${g.colour}">${bars}<line class="exp" x1="0" x2="${nums.length * w}" y1="${ey}" y2="${ey}"></line>${labels}</svg>`;
}
function drawFreqTooltips() {
  const tip = document.getElementById('freq-tip');
  document.querySelectorAll('.freq .bar').forEach((b) =>
    b.addEventListener('click', () => {
      tip.innerHTML = `<b>${b.dataset.n}</b>: drawn ${b.dataset.c} times in this window, ${b.dataset.all} times in all, last seen ${b.dataset.gap} draw${b.dataset.gap === '1' ? '' : 's'} ago.`;
    })
  );
}
function sumChart(sh) {
  const s = sh.sum;
  const max = Math.max(...s.hist, 1);
  const n = s.hist.length;
  const W = 300;
  const H = 70;
  const bw = W / n;
  const bars = s.hist.map((c, i) => {
    const lo = s.histStart + i * s.histWidth;
    const inBand = lo + s.histWidth > s.p25 && lo <= s.p75;
    const h = (c / max) * (H - 4);
    return `<rect x="${i * bw + 1}" y="${H - h}" width="${bw - 2}" height="${h}" rx="3" class="bar${inBand ? ' hot' : ' cold'}"></rect>`;
  }).join('');
  return `<svg class="freq" style="height:90px" viewBox="0 0 ${W} ${H + 14}" preserveAspectRatio="none">${bars}<text x="0" y="${H + 12}">${s.histStart}</text><text x="${W}" y="${H + 12}" text-anchor="end">${s.histStart + n * s.histWidth}</text></svg><p class="tiny muted">Darker bars are the middle half (${Math.round(s.p25)} to ${Math.round(s.p75)}). Our picks aim for this band.</p>`;
}
function gameResults(gid) {
  const g = GAMES[gid];
  const draws = (D.history[gid] || []).slice(-20).reverse();
  const log = D.picks?.[gid] || {};
  const parts = [];
  // How our picks have done, honestly.
  const scored = Object.keys(log).sort().filter((date) => drawOn(gid, date)).map((date) => {
    const d = drawOn(gid, date);
    const lines = log[date].lines;
    const res = lines.map((l) => checkLine(gid, l, d));
    return { date, won: sumOf(res, (r) => r.total), cost: lines.length * g.price, best: res.reduce((b, r) => Math.max(b, r.total), 0) };
  });
  if (scored.length) {
    const won = sumOf(scored, (r) => r.won);
    const cost = sumOf(scored, (r) => r.cost);
    parts.push(`<div class="card"><div class="card-head"><h3>How our picks have done</h3><span class="small muted">${scored.length} draw${scored.length > 1 ? 's' : ''}</span></div><div class="kv"><div><b>${money(cost)}</b><span>to play all three</span></div><div><b class="${won > 0 ? 'pos' : ''}">${money(won)}</b><span>won</span></div><div><b class="${won - cost >= 0 ? 'pos' : 'neg'}">${money(won - cost, { plus: true })}</b><span>net</span></div></div></div>`);
  }
  parts.push(`<div class="card">${draws.map((d) => {
    const p = log[d.date];
    const pw = p ? sumOf(p.lines, (l) => checkLine(gid, l, d).total) : null;
    const jp = d.jp ? `${money(d.jp)}${d.rolled ? ' rolled' : ''}` : '';
    return `<div class="ticket"><div class="spread"><span class="small"><b>${dayLabel(d.date)}</b> <span class="muted">${shortDate(d.date)}</span></span><span class="small muted">${jp}</span></div>${drawSetsHtml(gid, d)}${pw !== null ? `<span class="tiny ${pw > 0 ? 'win' : 'muted'}">Our picks: ${pw > 0 ? `won ${money(pw)}` : 'no win'}</span>` : ''}</div>`;
  }).join('')}</div>`);
  return parts.join('');
}

// ---------- my lines ----------
function renderLines() {
  const today = todayIso();
  const tabs = `<div class="seg"><button class="${ui.linesTab === 'upcoming' ? 'on' : ''}" data-action="lines-tab" data-t="upcoming">Coming up</button><button class="${ui.linesTab === 'past' ? 'on' : ''}" data-action="lines-tab" data-t="past">Results</button></div>`;
  const parts = [`<div class="spread"><h1>My lines</h1><button class="btn sm primary" data-action="add-line" data-game="${ui.game}">${ICON.plus} Add line</button></div>`, tabs];
  if (S.inbox.length) parts.push(inboxCard());
  const groups = new Map();
  const list = S.tickets.filter((t) => t.status !== 'skipped' && (ui.linesTab === 'upcoming' ? !drawOn(t.game, t.drawDate) && t.drawDate >= today : drawOn(t.game, t.drawDate) || t.drawDate < today));
  list.sort((a, b) => (ui.linesTab === 'upcoming' ? (a.drawDate < b.drawDate ? -1 : 1) : a.drawDate > b.drawDate ? -1 : 1));
  for (const t of list) {
    const k = `${t.game}|${t.drawDate}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  if (!groups.size) {
    parts.push(`<div class="card empty">${ui.linesTab === 'upcoming' ? 'Nothing lined up. Tap "I\'m playing this" on a pick, or add your own line.' : 'No results yet. Lines you play show up here after the draw.'}</div>`);
  }
  for (const [k, ts] of groups) {
    const [gid, date] = k.split('|');
    const g = GAMES[gid];
    const d = drawOn(gid, date);
    const body = ts.map((t) => {
      const r = d ? checkLine(gid, t, d) : null;
      const status = t.status === 'planned' ? (d ? '<span class="pill warn">Confirm played</span>' : '<span class="pill">Planned</span>') : '<span class="pill good">Played</span>';
      const src = t.source === 'friend' ? `from ${esc(t.from || 'friend')}` : t.source === 'pick' ? 'our pick' : 'my numbers';
      return `<div class="ticket"><div class="spread"><span class="small"><b>${esc(t.label || 'My line')}</b> <span class="muted">${src}</span></span>${status}</div>${d ? drawSetsHtml(gid, d, t) : lineBalls(gid, t, null, true)}
        ${r ? `<div class="spread"><span class="small">${r.wins.length ? r.wins.map((w) => `${w.tier.label}${g.rounds > 1 ? ` (R${w.round + 1})` : ''}`).join(', ') : 'No match'}</span><span class="${r.total > 0 ? 'win' : 'muted small'}">${r.total > 0 ? `${money(r.total)}${r.estimated ? ' est.' : ''}` : '£0'}</span></div>` : ''}
        <div class="btns">${t.status === 'planned' && d ? `<button class="btn sm good" data-action="answer" data-kind="confirm" data-id="${t.id}" data-played="1">${ICON.check} Played</button><button class="btn sm ghost" data-action="answer" data-kind="confirm" data-id="${t.id}" data-played="0">Didn't play</button>` : ''}${!d ? `<button class="btn sm ghost" data-action="share-ticket" data-id="${t.id}">${ICON.share} Send</button>` : ''}<button class="btn sm ghost" data-action="remove-ticket" data-id="${t.id}">Remove</button></div></div>`;
    }).join('');
    parts.push(`<div class="card" style="--c:${g.colour};border-left:5px solid var(--c)"><div class="card-head"><div class="row"><span class="pill solid">${g.name}</span><span class="small muted">${dayLabel(date, true)}</span></div><span class="small muted">${money(ts.length * g.price)}</span></div>${body}</div>`);
  }
  parts.push(`<div class="card tight"><div class="spread"><span class="small">Got a link from ${esc(S.settings.friend || 'a friend')}?</span><button class="btn sm ghost" data-action="paste-import">Paste link</button></div></div>`);
  return parts.join('');
}

// ---------- money ----------
function ledgerRows() {
  return S.tickets.filter((t) => t.status === 'played').map((t) => {
    const r = ticketResult(t);
    return { t, settled: !!r, won: r ? r.total : 0, estimated: r?.estimated, stake: t.stake ?? GAMES[t.game].price };
  });
}
function periodStart(p) {
  const t = dateObj(todayIso());
  if (p === 'week') { const day = (t.getDay() + 6) % 7; t.setDate(t.getDate() - day); }
  else if (p === 'month') t.setDate(1);
  else if (p === 'year') { t.setMonth(0); t.setDate(1); }
  else return '0000-00-00';
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function renderMoney() {
  const periods = [['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['all', 'All time']];
  const start = periodStart(ui.period);
  const all = ledgerRows();
  const rows = all.filter((r) => r.t.drawDate >= start);
  const settled = rows.filter((r) => r.settled);
  const staked = sumOf(rows, (r) => r.stake);
  const won = sumOf(settled, (r) => r.won);
  const pending = sumOf(rows.filter((r) => !r.settled), (r) => r.stake);
  const net = won - sumOf(settled, (r) => r.stake);
  const wins = settled.filter((r) => r.won > 0);
  const best = wins.reduce((b, r) => (r.won > (b?.won || 0) ? r : b), null);
  const parts = [`<h1>Money</h1>`, `<div class="seg">${periods.map(([k, l]) => `<button class="${ui.period === k ? 'on' : ''}" data-action="period" data-p="${k}">${l}</button>`).join('')}</div>`];
  parts.push(`<div class="big-stats"><div class="stat"><span>Played</span><b class="num">${money(staked)}</b><span>${rows.length} line${rows.length === 1 ? '' : 's'}</span></div><div class="stat"><span>Won</span><b class="num pos">${money(won)}</b><span>${wins.length} winning line${wins.length === 1 ? '' : 's'}</span></div><div class="stat"><span>Net</span><b class="num ${net >= 0 ? 'pos' : 'neg'}">${money(net, { plus: true })}</b><span>settled draws</span></div><div class="stat"><span>Return</span><b class="num">${staked - pending > 0 ? Math.round((won / (staked - pending)) * 100) : 0}%</b><span>${pending ? `${money(pending)} awaiting results` : 'of stake'}</span></div></div>`);
  if (best) parts.push(`<div class="note good">Best win: ${money(best.won)}${best.estimated ? ' (est.)' : ''} on ${GAMES[best.t.game].name}, ${shortDate(best.t.drawDate)}.</div>`);
  parts.push(`<div class="card"><div class="card-head"><h3>Last 12 months</h3><span class="small muted">net per month</span></div>${monthChart(all)}</div>`);
  const byGame = GAME_IDS.map((gid) => {
    const rs = rows.filter((r) => r.t.game === gid);
    if (!rs.length) return '';
    const st = sumOf(rs, (r) => r.stake);
    const w = sumOf(rs, (r) => r.won);
    return `<tr><td><span class="pill solid" style="--c:${GAMES[gid].colour}">${GAMES[gid].name}</span></td><td class="r num">${rs.length}</td><td class="r num">${money(st)}</td><td class="r num">${money(w)}</td><td class="r num ${w - st >= 0 ? 'pos' : 'neg'}">${money(w - st, { plus: true })}</td></tr>`;
  }).join('');
  parts.push(`<div class="card"><div class="card-head"><h3>By game</h3></div>${byGame ? `<table><thead><tr><th>Game</th><th class="r">Lines</th><th class="r">Played</th><th class="r">Won</th><th class="r">Net</th></tr></thead><tbody>${byGame}</tbody></table>` : '<p class="empty">Nothing played in this period yet.</p>'}</div>`);
  parts.push(`<p class="tiny muted" style="text-align:center">Counts lines you confirmed you played. Free Lucky Dips count as £2. Prizes marked est. use the average for that tier until the real figure is known.</p>`);
  return parts.join('');
}
function monthChart(rows) {
  const months = [];
  const t = dateObj(todayIso());
  t.setDate(1);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-GB', { month: 'short' }).slice(0, 1) });
  }
  for (const m of months) {
    const rs = rows.filter((r) => r.settled && r.t.drawDate.startsWith(m.key));
    m.net = sumOf(rs, (r) => r.won - r.stake);
  }
  const max = Math.max(1, ...months.map((m) => Math.abs(m.net)));
  const W = 300, H = 110, mid = H / 2, bw = W / 12;
  const bars = months.map((m, i) => {
    const h = (Math.abs(m.net) / max) * (mid - 6);
    return `<rect class="${m.net >= 0 ? 'up' : 'down'}" x="${i * bw + 4}" y="${m.net >= 0 ? mid - h : mid}" width="${bw - 8}" height="${Math.max(m.net ? 2 : 0, h)}" rx="3"><title>${m.key}: ${money(m.net, { plus: true })}</title></rect><text x="${i * bw + bw / 2}" y="${H + 12}" text-anchor="middle">${m.label}</text>`;
  }).join('');
  return `<svg class="months" viewBox="0 0 ${W} ${H + 16}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${mid}" y2="${mid}"></line>${bars}</svg>`;
}

// ---------- settings ----------
function renderSettings() {
  const s = S.settings;
  const gen = D.summary?.generatedAt ? new Date(D.summary.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
  return `<h1>Settings</h1>
  <div class="card stack"><label class="field">Your name (shown when you send lines)<input type="text" maxlength="24" data-set="name" value="${esc(s.name)}" placeholder="e.g. Ashley"></label><label class="field">Your friend's name<input type="text" maxlength="24" data-set="friend" value="${esc(s.friend)}" placeholder="Who you share lines with"></label></div>
  <div class="card"><h3>Games I normally play</h3><p class="small muted" style="margin:4px 0 10px">These get reminders and "did you play" checks. Others only show up when they're worth a go.</p><div class="check-row">${GAME_IDS.map((id) => `<label style="--c:${GAMES[id].colour}"><input type="checkbox" data-usual="${id}" ${s.usual.includes(id) ? 'checked' : ''}>${GAMES[id].name}</label>`).join('')}</div></div>
  <div class="card"><div class="switch"><div><b>Draw-day reminders</b><p class="small muted">On draw days for your games</p></div><input type="checkbox" class="toggle" data-set="remind" ${s.remind ? 'checked' : ''}></div>
    <div class="switch"><span>Reminder time</span><input type="time" data-set="remindTime" value="${esc(s.remindTime)}" style="width:auto"></div>
    <div class="switch"><div><b>Win alerts</b><p class="small muted">Checks your lines once results are in</p></div><input type="checkbox" class="toggle" data-set="winAlerts" ${s.winAlerts ? 'checked' : ''}></div>
    ${bridge ? '' : '<p class="note" style="margin-top:8px">Notifications work in the Android app. In a browser these settings are saved but nothing fires.</p>'}</div>
  <div class="card"><div class="switch"><b>Theme</b><select data-set="theme" style="width:auto">${['auto', 'light', 'dark'].map((t) => `<option value="${t}" ${s.theme === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></div></div>
  <div class="card stack"><h3>Backup</h3><p class="small muted">Your lines and money record live on this phone only. Back them up before reinstalling the app.</p><div class="btns"><button class="btn sm" data-action="export">Save backup</button><button class="btn sm ghost" data-action="import-backup">Restore backup</button></div></div>
  <div class="card stack"><h3>About the numbers</h3><p class="small">Results come from the official National Lottery feed after each draw, with full history from public archives. Picks are worked out once per draw on the results server, so you and ${esc(s.friend || 'your friend')} always see the same lines.</p><p class="small">Every combination has the same chance. Hot and cold numbers describe the past. What a pick can do is avoid the numbers most players choose, so if it wins you are less likely to share, and steer you to draws where the jackpot gives better value.</p><p class="small muted">Results updated ${gen}${D.cached ? ' (offline copy)' : ''}.</p><button class="btn sm ghost" data-action="reload">Refresh results</button></div>
  <div class="card"><button class="btn sm ghost" data-action="reset" style="color:var(--bad)">Clear all my data</button></div>`;
}
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('lucky-lines-theme', t); } catch (e) { /* blocked */ }
}

// ---------- sharing ----------
function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
function shareLines(gid, date, lines) {
  const g = GAMES[gid];
  const from = S.settings.name || 'A friend';
  const payload = { v: 1, f: from.slice(0, 24), g: gid, d: date, l: lines.map((l) => ({ m: l.main, x: l.extra || [], n: (l.label || '').slice(0, 24) })) };
  const url = `${SHARE_BASE}share.html?p=${b64url(JSON.stringify(payload))}`;
  const text = `${from}'s ${g.name} line${lines.length > 1 ? 's' : ''} for ${dayLabel(date, true)}:\n${lines.map((l) => `${l.main.join(' ')}${l.extra?.length ? ` + ${l.extra.join(' ')}` : ''}`).join('\n')}\n\nOpen in Lucky Lines: ${url}`;
  if (bridge?.share) bridge.share(text);
  else if (navigator.share) navigator.share({ text }).catch(() => {});
  else navigator.clipboard?.writeText(text).then(() => toast('Copied. Paste it into WhatsApp.'), () => toast('Could not copy'));
}
// Untrusted input: validate everything.
function parseShare(input) {
  const m = String(input).match(/[?&#]p=([A-Za-z0-9_-]+)/) || String(input).trim().match(/^([A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  let p;
  try { p = JSON.parse(unb64url(m[1])); } catch (e) { return null; }
  const g = GAMES[p?.g];
  if (!g || !/^\d{4}-\d{2}-\d{2}$/.test(p.d) || !Array.isArray(p.l) || !p.l.length || p.l.length > 10) return null;
  const xCount = g.bonus ? 0 : g.extra.drawn;
  const okNums = (arr, n, max) => Array.isArray(arr) && arr.length === n && new Set(arr).size === n && arr.every((k) => Number.isInteger(k) && k >= 1 && k <= max);
  const lines = [];
  for (const l of p.l) {
    if (!okNums(l.m, g.main.drawn, g.main.pool)) return null;
    if (xCount && !okNums(l.x, xCount, g.extra.pool)) return null;
    lines.push({ main: [...l.m].sort((a, b) => a - b), extra: xCount ? [...l.x].sort((a, b) => a - b) : [], label: String(l.n || '').slice(0, 24) });
  }
  const from = String(p.f || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 24) || 'A friend';
  return { id: uid(), from, game: p.g, date: p.d, lines, receivedAt: new Date().toISOString() };
}
function handleImport(input) {
  const msg = parseShare(input);
  if (!msg) { toast("That link didn't contain valid lines"); return; }
  S.inbox = S.inbox.filter((m) => !(m.game === msg.game && m.date === msg.date && m.from === msg.from && JSON.stringify(m.lines) === JSON.stringify(msg.lines)));
  S.inbox.unshift(msg);
  save();
  go('home');
  toast(`${msg.from} sent you ${msg.lines.length} line${msg.lines.length > 1 ? 's' : ''}`);
}
window.onLuckyImport = (s) => handleImport(s);
// Android back button: close a sheet, then go home, then leave the app.
window.onLuckyBack = () => {
  if (!sheet.hidden) { closeSheet(); lineEditor.state = null; return true; }
  if (ui.page !== 'home') { go('home'); return true; }
  return false;
};

// ---------- sheets ----------
function openSheet(html) {
  sheet.innerHTML = `<div class="sheet-body"><div class="sheet-grip"></div>${html}</div>`;
  sheet.hidden = false;
}
function closeSheet() { sheet.hidden = true; sheet.innerHTML = ''; }
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

function lineEditor(gid) {
  const g = GAMES[gid];
  const st = { gid, main: new Set(), extra: new Set(), date: upcomingDates(gid, 1)[0] };
  const drawSel = () => upcomingDates(gid, 6).map((d) => `<option value="${d}" ${d === st.date ? 'selected' : ''}>${dayLabel(d, true)}</option>`).join('');
  const paint = () => {
    const xNeed = g.extra ? g.extra.drawn : 0;
    const ready = st.main.size === g.main.drawn && st.extra.size === xNeed;
    openSheet(`<div class="spread"><h2>Add a ${g.name} line</h2><button class="icon-btn" data-action="close-sheet" aria-label="Close">${ICON.x.replace('<svg', '<svg width="20" height="20" style="fill:none;stroke:currentColor;stroke-width:2"')}</button></div>
      <div class="seg games">${GAME_IDS.map((id) => `<button style="--c:${GAMES[id].colour}" class="${id === gid ? 'on' : ''}" data-action="editor-game" data-game="${id}">${GAMES[id].name}</button>`).join('')}</div>
      <label class="field">Draw<select data-editor="date">${drawSel()}</select></label>
      <div class="spread"><b>Pick ${g.main.drawn} from 1-${g.main.pool}</b><span class="small muted">${st.main.size}/${g.main.drawn}</span></div>
      <div class="grid-nums" style="--c:${g.colour}">${Array.from({ length: g.main.pool }, (_, i) => i + 1).map((n) => `<button class="${st.main.has(n) ? 'on' : ''}" data-editor="m" data-n="${n}">${n}</button>`).join('')}</div>
      ${g.extra ? `<div class="spread"><b>Pick ${g.extra.drawn} ${g.extra.drawn > 1 ? g.extra.label : g.extra.one} from 1-${g.extra.pool}</b><span class="small muted">${st.extra.size}/${g.extra.drawn}</span></div><div class="grid-nums x">${Array.from({ length: g.extra.pool }, (_, i) => i + 1).map((n) => `<button class="${st.extra.has(n) ? 'on' : ''}" data-editor="x" data-n="${n}">${n}</button>`).join('')}</div>` : ''}
      <div class="btns"><button class="btn ghost" data-editor="dip">Lucky dip</button><button class="btn ghost" data-editor="clear">Clear</button><button class="btn primary" style="flex:1" data-editor="save" ${ready ? '' : 'disabled style="flex:1;opacity:.5"'}>Add line, ${money(g.price)}</button></div>`);
  };
  lineEditor.state = st;
  lineEditor.paint = paint;
  paint();
}
sheet.addEventListener('click', (e) => {
  const b = e.target.closest('[data-editor]');
  if (!b || !lineEditor.state) return;
  const st = lineEditor.state;
  const g = GAMES[st.gid];
  const k = b.dataset.editor;
  if (k === 'm' || k === 'x') {
    const set = k === 'm' ? st.main : st.extra;
    const lim = k === 'm' ? g.main.drawn : g.extra.drawn;
    const n = +b.dataset.n;
    if (set.has(n)) set.delete(n);
    else if (set.size < lim) set.add(n);
    else { toast(`That's ${lim} already. Tap one to remove it.`); return; }
  } else if (k === 'dip') {
    const pick = (pool, count) => { const s = new Set(); while (s.size < count) s.add(1 + Math.floor(Math.random() * pool)); return s; };
    st.main = pick(g.main.pool, g.main.drawn);
    st.extra = g.extra ? pick(g.extra.pool, g.extra.drawn) : new Set();
  } else if (k === 'clear') {
    st.main.clear();
    st.extra.clear();
  } else if (k === 'save') {
    const line = { main: [...st.main].sort((a, b) => a - b), extra: [...st.extra].sort((a, b) => a - b), label: 'My numbers' };
    addTicket(st.gid, st.date, line, 'mine');
    save();
    closeSheet();
    lineEditor.state = null;
    go('lines', { linesTab: 'upcoming' });
    toast('Line added');
    return;
  } else return;
  lineEditor.paint();
});
sheet.addEventListener('change', (e) => {
  if (e.target.dataset.editor === 'date' && lineEditor.state) lineEditor.state.date = e.target.value;
});

// ---------- actions ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const gid = el.dataset.game;
  if (el.tagName === 'A') e.preventDefault();
  switch (a) {
    case 'nav': go(el.dataset.to); break;
    case 'open-game': go('game', { game: gid, tab: el.dataset.tab || 'picks' }); break;
    case 'pick-game': go('game', { game: gid }); break;
    case 'tab': ui.tab = el.dataset.tab; render(); break;
    case 'window': ui.statsWindow = +el.dataset.w; render(); break;
    case 'lines-tab': ui.linesTab = el.dataset.t; render(); break;
    case 'period': ui.period = el.dataset.p; render(); break;
    case 'close-sheet': closeSheet(); lineEditor.state = null; break;
    case 'reload': view.innerHTML = '<div class="loading"><span></span><span></span><span></span></div>'; loadData().then(() => { render(); syncNative(); toast(D.cached ? 'Offline, showing saved copy' : 'Results up to date'); }); break;
    case 'toggle-plan': {
      const p = G(gid).picks.lines.find((x) => x.key === el.dataset.key);
      const ex = isPlanned(gid, el.dataset.date, p);
      if (ex) S.tickets = S.tickets.filter((t) => t !== ex);
      else {
        addTicket(gid, el.dataset.date, p, 'pick');
        if (S.settings.remind || S.settings.winAlerts) bridge?.requestNotifications?.();
      }
      save();
      render();
      toast(ex ? 'Removed from your lines' : `Added. We'll check it after the draw.`);
      break;
    }
    case 'share-pick': shareLines(gid, el.dataset.date, [G(gid).picks.lines.find((x) => x.key === el.dataset.key)]); break;
    case 'share-all': shareLines(gid, el.dataset.date, G(gid).picks.lines); break;
    case 'share-ticket': { const t = S.tickets.find((x) => x.id === el.dataset.id); if (t) shareLines(t.game, t.drawDate, [t]); break; }
    case 'remove-ticket': S.tickets = S.tickets.filter((t) => t.id !== el.dataset.id); save(); render(); break;
    case 'add-line': lineEditor(gid || 'lotto'); break;
    case 'editor-game': lineEditor(gid); break;
    case 'answer': {
      const played = el.dataset.played === '1';
      if (el.dataset.kind === 'confirm') {
        const t = S.tickets.find((x) => x.id === el.dataset.id);
        if (t) t.status = played ? 'played' : 'skipped';
      } else {
        const p = D.picks[gid][el.dataset.date].lines[+el.dataset.id];
        const t = addTicket(gid, el.dataset.date, p, 'pick');
        t.status = played ? 'played' : 'skipped';
      }
      save();
      render();
      if (played) toast('Logged in your money record');
      break;
    }
    case 'dismiss': S.dismissed[el.dataset.key] = true; save(); render(); break;
    case 'inbox-add': {
      const m = S.inbox.find((x) => x.id === el.dataset.id);
      if (!m) break;
      const date = m.date >= todayIso() ? m.date : upcomingDates(m.game, 1)[0];
      for (const l of m.lines) if (!isPlanned(m.game, date, l)) addTicket(m.game, date, { ...l, label: l.label || `${m.from}'s line` }, 'friend', { from: m.from });
      S.inbox = S.inbox.filter((x) => x !== m);
      save();
      go('lines', { linesTab: 'upcoming' });
      toast(date === m.date ? 'Added to your lines' : `That draw has gone, added for ${dayLabel(date)}`);
      break;
    }
    case 'inbox-drop': S.inbox = S.inbox.filter((x) => x.id !== el.dataset.id); save(); render(); break;
    case 'paste-import':
      openSheet(`<h2>Paste a shared link</h2><textarea id="imp" placeholder="Paste the message or link here"></textarea><div class="btns"><button class="btn ghost" data-action="close-sheet">Cancel</button><button class="btn primary" style="flex:1" data-action="do-import">Add lines</button></div>`);
      break;
    case 'do-import': { const v = document.getElementById('imp').value; closeSheet(); handleImport(v); break; }
    case 'export': {
      const text = JSON.stringify({ app: 'lucky-lines', v: 1, savedAt: new Date().toISOString(), state: S });
      if (bridge?.exportBackup) bridge.exportBackup(text);
      else {
        const aEl = document.createElement('a');
        aEl.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        aEl.download = `lucky-lines-backup-${todayIso()}.json`;
        aEl.click();
      }
      break;
    }
    case 'import-backup':
      openSheet(`<h2>Restore a backup</h2><p class="small muted">Paste the backup text. This replaces what's on this phone.</p><textarea id="bk"></textarea><div class="btns"><button class="btn ghost" data-action="close-sheet">Cancel</button><button class="btn primary" style="flex:1" data-action="do-restore">Restore</button></div>`);
      break;
    case 'do-restore': {
      try {
        const obj = JSON.parse(document.getElementById('bk').value);
        if (obj.app !== 'lucky-lines' || !obj.state?.settings || !Array.isArray(obj.state.tickets)) throw new Error('bad');
        S = { ...DEFAULT_STATE(), ...obj.state, settings: { ...DEFAULT_STATE().settings, ...obj.state.settings } };
        save();
        closeSheet();
        applyTheme();
        go('money');
        toast(`Restored ${S.tickets.length} lines`);
      } catch (err) { toast("That isn't a Lucky Lines backup"); }
      break;
    }
    case 'reset':
      if (confirm('Delete all your lines, money record and settings from this phone?')) { S = DEFAULT_STATE(); save(); applyTheme(); go('home'); }
      break;
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.usual) {
    const id = el.dataset.usual;
    S.settings.usual = el.checked ? [...new Set([...S.settings.usual, id])] : S.settings.usual.filter((x) => x !== id);
    S.settings.usual.sort((a, b) => GAME_IDS.indexOf(a) - GAME_IDS.indexOf(b));
    save();
  } else if (el.dataset.set) {
    const k = el.dataset.set;
    S.settings[k] = el.type === 'checkbox' ? el.checked : el.value.trim();
    if (k === 'theme') applyTheme();
    if ((k === 'remind' || k === 'winAlerts') && el.checked) bridge?.requestNotifications?.();
    save();
  }
});

// ---------- boot ----------
(async function boot() {
  applyTheme();
  await loadData();
  const pending = bridge?.getPendingImport?.() || (/[?&#]p=/.test(location.href) ? location.href : null);
  render();
  syncNative();
  if (pending) handleImport(pending);
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const age = D.summary?.generatedAt ? Date.now() - new Date(D.summary.generatedAt) : Infinity;
    if (age > 30 * 60000) { await loadData(); render(); syncNative(); }
  });
})();
