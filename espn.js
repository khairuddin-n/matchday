// Satu-satunya tempat yang tahu bentuk data ESPN (API publik tidak resmi).
// Kalau ESPN mengubah format, perbaiki di file ini saja.

// Path relatif terhadap host; host dicoba berurutan. site.api.espn.com diblokir sebagian
// browser (anti-pelacak), site.web.api.espn.com tidak.
const HOSTS = ['https://site.web.api.espn.com', 'https://site.api.espn.com'];
let hostIdx = 0;
const BASE = '/apis/site/v2/sports/soccer';
const BASE2 = '/apis/v2/sports/soccer';
export const TEAM = '83';               // FC Barcelona di ESPN
export const COMPS = {
  'esp.1': 'La Liga',
  'uefa.champions': 'Champions League',
  'esp.copa_del_rey': 'Copa del Rey',
  'esp.super_cup': 'Supercopa',
  'club.friendly': 'Friendly'
};

// ---------- fetch + cache lokal ----------
const LS = 'md:';
function cacheGet(url) {
  try { const v = JSON.parse(localStorage.getItem(LS + url)); return v || null; } catch { return null; }
}
function cachePut(url, data) {
  try { localStorage.setItem(LS + url, JSON.stringify({ t: Date.now(), data })); } catch { /* penuh: abaikan */ }
}

// maxAge: pakai cache tanpa jaringan kalau masih lebih muda dari ini (ms)
async function fetchJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function get(path, maxAge = 0) {
  const c = cacheGet(path);
  if (c && maxAge && Date.now() - c.t < maxAge) return c.data;
  let err;
  for (let k = 0; k < HOSTS.length; k++) {
    const i = (hostIdx + k) % HOSTS.length;
    try {
      const data = await fetchJson(HOSTS[i] + path);
      hostIdx = i;
      cachePut(path, data);
      return data;
    } catch (e) { err = e; }
  }
  if (c) return c.data;           // offline / ESPN error: pakai data terakhir
  throw err;
}

// ---------- normalisasi ----------
const scoreOf = s => (s == null ? null : typeof s === 'object' ? (s.displayValue ?? s.value) : s);
const logoOf = t => (t && (t.logo || (t.logos && t.logos[0] && t.logos[0].href))) || '';

function side(c) {
  const t = c.team || {};
  const sc = scoreOf(c.score);
  return {
    id: String(t.id || c.id),
    name: t.shortDisplayName || t.displayName || t.name || '',
    full: t.displayName || t.name || '',
    abbr: t.abbreviation || '',
    logo: logoOf(t),
    score: sc === null || sc === undefined || sc === '' ? null : Number(sc),
    pens: c.shootoutScore != null ? Number(scoreOf(c.shootoutScore)) : null,
    winner: !!c.winner
  };
}

export function normEvent(e, league) {
  const c = (e.competitions && e.competitions[0]) || e;
  const st = (c.status || e.status || {}).type || {};
  const cs = c.competitors || [];
  const home = side(cs.find(x => x.homeAway === 'home') || cs[0] || {});
  const away = side(cs.find(x => x.homeAway === 'away') || cs[1] || {});
  const us = home.id === TEAM ? 'home' : 'away';
  const state = st.state || 'pre';
  let result = null;
  if (state === 'post' && home.score != null && away.score != null) {
    const a = us === 'home' ? home : away, b = us === 'home' ? away : home;
    if (a.score !== b.score) result = a.score > b.score ? 'W' : 'L';
    else if (a.pens != null && b.pens != null && a.pens !== b.pens) result = a.pens > b.pens ? 'W' : 'L';
    else result = a.winner ? 'W' : b.winner ? 'L' : 'D';
  }
  const tbd = e.timeValid === false || c.timeValid === false || /TBD/i.test(st.shortDetail || '');
  return {
    id: String(e.id), league, comp: COMPS[league] || (e.league && e.league.name) || '',
    date: Date.parse(e.date || c.date), tbd, state,
    status: st.name || '', detail: st.shortDetail || st.detail || '',
    clock: (c.status || e.status || {}).displayClock || '',
    home, away, us, result,
    venue: (c.venue && c.venue.fullName) || ''
  };
}

// ---------- jadwal & hasil semua kompetisi ----------
export async function matches(fresh) {
  const age = fresh ? 0 : 5 * 60 * 1000;
  const jobs = [];
  Object.keys(COMPS).forEach(l => {
    jobs.push(get(`${BASE}/${l}/teams/${TEAM}/schedule?fixture=true`, age).then(d => [l, d]).catch(() => [l, null]));
    jobs.push(get(`${BASE}/${l}/teams/${TEAM}/schedule`, age).then(d => [l, d]).catch(() => [l, null]));
  });
  const all = new Map();
  let ok = 0;
  (await Promise.all(jobs)).forEach(([l, d]) => {
    if (!d) return;
    ok++;
    (d.events || []).forEach(e => {
      const m = normEvent(e, l);
      if (!isNaN(m.date)) all.set(m.id, m);
    });
  });
  if (!ok) throw new Error('Could not load data');
  return [...all.values()].sort((a, b) => a.date - b.date);
}

// ---------- detail laga ----------
const EVENT_KIND = [
  [/own goal/i, 'og'], [/penalty - scored/i, 'pen'], [/penalty - missed|penalty - saved/i, 'penmiss'],
  [/goal/i, 'goal'], [/red card/i, 'red'], [/yellow card/i, 'yellow'], [/substitution/i, 'sub'], [/var/i, 'var']
];

export async function summary(league, id, fresh) {
  const d = await get(`${BASE}/${league}/summary?event=${id}`, fresh ? 0 : 20000);
  const hc = (d.header && d.header.competitions && d.header.competitions[0]) || {};
  const m = normEvent({ id, date: hc.date, competitions: [hc], timeValid: hc.timeValid }, league);
  const ids = { [m.home.id]: 'home', [m.away.id]: 'away' };

  const events = (d.keyEvents || []).map(k => {
    const text = (k.type && k.type.text) || '';
    const kind = (EVENT_KIND.find(([re]) => re.test(text)) || [])[1];
    if (!kind) return null;
    const ps = (k.participants || []).map(p => p.athlete && p.athlete.displayName).filter(Boolean);
    return {
      kind, min: (k.clock && k.clock.displayValue) || '', side: ids[k.team && String(k.team.id)] || 'home',
      who: ps[0] || k.shortText || text, extra: ps[1] || '', shootout: !!k.shootout
    };
  }).filter(Boolean);

  const lineups = (d.rosters || []).map(r => ({
    side: ids[String(r.team && r.team.id)] || (r.homeAway === 'home' ? 'home' : 'away'),
    formation: r.formation || '',
    players: (r.roster || []).map(p => ({
      name: (p.athlete && (p.athlete.displayName || p.athlete.fullName)) || '',
      num: p.jersey || '', pos: (p.position && p.position.abbreviation) || '',
      starter: !!p.starter, place: Number(p.formationPlace) || 99,
      inn: !!p.subbedIn, out: !!p.subbedOut
    }))
  })).filter(r => r.players.length);

  const statMap = t => Object.fromEntries((t.statistics || []).map(s => [s.name, s.displayValue]));
  const box = (d.boxscore && d.boxscore.teams) || [];
  const stats = {};
  box.forEach(t => { const s = ids[String(t.team && t.team.id)]; if (s) stats[s] = statMap(t); });

  const form = (d.lastFiveGames || []).map(t => ({
    side: ids[String(t.team && t.team.id)] || '',
    name: (t.team && t.team.displayName) || '',
    games: (t.events || []).slice().sort((a, b) => Date.parse(b.gameDate) - Date.parse(a.gameDate)).map(g => ({
      date: Date.parse(g.gameDate), res: g.gameResult || '', score: g.score || '',
      opp: (g.opponent && (g.opponent.displayName || g.opponent.abbreviation)) || '', at: g.atVs || 'vs',
      comp: g.leagueAbbreviation || ''
    }))
  })).filter(t => t.side);

  const gi = d.gameInfo || {};
  return {
    match: m, events, lineups, stats, form,
    venue: (gi.venue && gi.venue.fullName) || m.venue,
    city: (gi.venue && gi.venue.address && gi.venue.address.city) || '',
    attendance: gi.attendance || 0,
    referee: ((gi.officials || [])[0] || {}).fullName || ''
  };
}

// ---------- klasemen ----------
export async function standings(league, fresh) {
  const d = await get(`${BASE2}/${league}/standings`, fresh ? 0 : 10 * 60 * 1000);
  const groups = (d.children || [{ name: d.name, standings: d.standings }]).map(ch => ({
    name: ch.name || '',
    rows: ((ch.standings && ch.standings.entries) || []).map(e => {
      const s = Object.fromEntries((e.stats || []).map(x => [x.name, x.displayValue]));
      return {
        id: String(e.team.id), name: e.team.shortDisplayName || e.team.displayName, logo: logoOf(e.team),
        rank: Number(s.rank) || 0, played: s.gamesPlayed, w: s.wins, d: s.ties, l: s.losses,
        gd: s.pointDifferential, pts: Number(s.points) || 0,
        zone: e.note ? { color: e.note.color, label: e.note.description } : null
      };
    }).sort((a, b) => a.rank - b.rank)
  }));
  return groups;
}

// ---------- top skor liga ----------
export async function leaders(league, fresh) {
  const d = await get(`${BASE}/${league}/statistics`, fresh ? 0 : 30 * 60 * 1000);
  const pick = n => ((d.stats || []).find(s => s.name === n) || { leaders: [] }).leaders.slice(0, 15).map(l => {
    const a = l.athlete || {};
    const st = Object.fromEntries((a.statistics || []).map(s => [s.name, s.displayValue]));
    const team = a.team && typeof a.team === 'object' ? a.team : {};
    return {
      name: a.displayName || '', team: team.abbreviation || team.displayName || '', teamId: String(team.id || ''),
      value: Number(l.value) || 0, apps: st.appearances || '', goals: st.totalGoals || '', assists: st.goalAssists || ''
    };
  });
  return { goals: pick('goalsLeaders'), assists: pick('assistsLeaders') };
}

// ---------- skuad ----------
export async function squad(fresh) {
  const d = await get(`${BASE}/esp.1/teams/${TEAM}/roster`, fresh ? 0 : 6 * 60 * 60 * 1000);
  return (d.athletes || []).map(a => {
    const cats = {};
    (((a.statistics || {}).splits || {}).categories || []).forEach(c => (c.stats || []).forEach(s => { cats[s.name] = s.displayValue; }));
    return {
      name: a.displayName || a.fullName || '', num: a.jersey || '', age: a.age || '',
      pos: (a.position && a.position.abbreviation) || '', nat: (a.flag && a.flag.alt) || a.citizenship || '',
      apps: Number(cats.appearances) || 0, goals: Number(cats.totalGoals) || 0, assists: Number(cats.goalAssists) || 0,
      injured: (a.injuries || []).length > 0
    };
  });
}
