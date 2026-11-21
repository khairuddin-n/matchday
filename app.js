import * as E from './espn.js';

const VERSION = '1.3.0';
const ICS_URL = 'https://khairuddin-n.github.io/matchday/barca.ics';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

// ---------- format waktu (zona waktu HP; di Indonesia tampil "WIB") ----------
const fDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fDayLong = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const fTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const fZone = new Intl.DateTimeFormat('id-ID', { timeZoneName: 'short' });
const fMonth = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const fDnum = new Intl.DateTimeFormat('en-GB', { day: 'numeric' });
const fWd = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
const zone = (() => { const p = fZone.formatToParts(new Date()).find(x => x.type === 'timeZoneName'); return p ? p.value : ''; })();
const day = t => fDay.format(t);
const time = t => fTime.format(t);

function untilText(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d >= 1) return `${d}d${h ? ' ' + h + 'h' : ''}`;
  if (h >= 1) return `${h}h${mm ? ' ' + mm + 'm' : ''}`;
  return `${mm}m`;
}
const RES = { W: ['W', 'Win'], D: ['D', 'Draw'], L: ['L', 'Loss'] };
const resChip = (r, big) => r ? `<span class="res r-${r}${big ? ' big' : ''}" title="${RES[r][1]}">${RES[r][0]}</span>` : '';
const crest = (t, size = 28) => t.logo
  ? `<img class="crest" src="${esc(t.logo)}" width="${size}" height="${size}" alt="" loading="lazy" decoding="async">`
  : `<span class="crest ph" style="width:${size}px;height:${size}px">${esc((t.abbr || t.name || '?').slice(0, 3))}</span>`;
const opp = m => (m.us === 'home' ? m.away : m.home);
const ours = m => (m.us === 'home' ? m.home : m.away);
const scoreText = m => `${m.home.score ?? '–'}<i>–</i>${m.away.score ?? '–'}`;
const pensText = m => (m.home.pens != null && m.away.pens != null && (m.home.pens || m.away.pens) ? `Penalties ${m.home.pens}–${m.away.pens}` : '');

function snack(msg) {
  const s = $('snack'); s.textContent = msg; s.classList.add('show');
  clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove('show'), 2800);
}

// ---------- state ----------
let M = null;            // semua laga
let loadErr = '';
let liveTimer = 0;
const live = {};         // id laga → summary terbaru (untuk skor live di Beranda)

async function loadMatches(fresh) {
  try { M = await E.matches(fresh); loadErr = ''; }
  catch (e) { loadErr = e.message; }
}
const isLive = m => m.state === 'in';
const nearKickoff = m => m.state === 'pre' && m.date - Date.now() < 15 * 60000 && Date.now() - m.date < 3 * 3600000;

// ---------- router ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [r, a, b] = h.split('/');
  return { r: r || 'home', a, b };
}
function setNav(r) {
  document.querySelectorAll('.nav a').forEach(x => x.classList.toggle('on', x.dataset.r === r));
  document.body.classList.toggle('detail', r === 'laga');
}

let renderSeq = 0;
async function render(opts = {}) {
  const seq = ++renderSeq;
  const { r, a, b } = route();
  setNav(r);
  clearInterval(liveTimer); liveTimer = 0;
  if (r === 'laga') return renderMatch(a, b, seq, opts);
  if (r === 'klasemen') return renderTable(a || 'esp.1', seq, opts);
  if (r === 'skuad') return renderSquad(seq, opts);
  if (!M || opts.fresh) await loadMatches(opts.fresh);
  if (seq !== renderSeq) return;
  if (r === 'jadwal') return renderSchedule(a === 'hasil' ? 'hasil' : 'akan');
  return renderHome(seq);
}

function top(html) { $('top').innerHTML = html; }
function view(html) { $('view').innerHTML = html; }
const errBox = msg => `<div class="empty"><p>${esc(msg || 'Could not load data.')}</p><button class="btn" data-act="retry">Try again</button></div>`;
const loading = () => `<div class="loading"><span class="spin"></span></div>`;
// ---------- tema: Sistem → Terang → Gelap ----------
const THEMES = { system: ['i-auto', 'Theme: system'], light: ['i-sun', 'Theme: light'], dark: ['i-moon', 'Theme: dark'] };
const getTheme = () => { try { const t = localStorage.getItem('md_theme'); return THEMES[t] ? t : 'system'; } catch { return 'system'; } };
function applyTheme(t) {
  if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  try { localStorage.setItem('md_theme', t); } catch { /* abaikan */ }
}
const themeBtn = () => { const [ic, label] = THEMES[getTheme()]; return `<button class="theme-btn" data-act="theme" aria-label="${label}" title="${label}">${icon(ic)}</button>`; };

const brand = sub => `<div class="brand"><span class="mark">${icon('i-ball')}</span><span class="wm">matchday</span>${sub ? `<span class="sub">${sub}</span>` : ''}${themeBtn()}</div>`;

// ---------- Beranda ----------
function heroHTML(m) {
  const s = live[m.id] ? live[m.id].match : m;
  const lv = isLive(s);
  const done = s.state === 'post';
  const where = m.us === 'home' ? 'Home' : 'Away';
  let mid;
  if (lv || done) {
    mid = `<div class="hs num">${scoreText(s)}</div>
      <div class="hst">${lv ? `<span class="live"><b></b>LIVE</span> ${esc(s.clock || s.detail)}` : 'Full time'}</div>`;
  } else {
    mid = `<div class="ht num">${m.tbd ? '––.––' : time(m.date)}</div><div class="hst">${esc(day(m.date))}${m.tbd ? '' : ' · ' + zone}</div>`;
  }
  const goals = live[m.id] ? live[m.id].events.filter(e => /goal|pen|og/.test(e.kind) && e.kind !== 'penmiss' && !e.shootout) : [];
  const gl = sideName => goals.filter(g => g.side === sideName).map(g => `<li>${esc(g.who)} ${esc(g.min)}${g.kind === 'pen' ? ' (p)' : g.kind === 'og' ? ' (og)' : ''}</li>`).join('');
  return `<a class="hero" href="#/laga/${m.league}/${m.id}">
    <div class="h-meta"><span>${esc(m.comp)}</span><span>${where}</span></div>
    <div class="h-row">
      <div class="h-team">${crest(s.home, 56)}<b>${esc(s.home.name)}</b></div>
      <div class="h-mid">${mid}</div>
      <div class="h-team">${crest(s.away, 56)}<b>${esc(s.away.name)}</b></div>
    </div>
    ${goals.length ? `<div class="h-goals"><ul>${gl('home')}</ul><ul class="r">${gl('away')}</ul></div>` : ''}
    ${!lv && !done ? `<div class="h-foot"><span class="cd" data-kick="${m.date}">${m.tbd ? 'Kick-off time TBC' : 'Kick-off in ' + untilText(m.date - Date.now())}</span></div>` : ''}
  </a>`;
}

// kompetisi resmi yang sudah dimainkan Barça musim ini (tanpa uji coba)
const SHORT = { 'esp.1': 'La Liga', 'uefa.champions': 'UCL', 'esp.copa_del_rey': 'Copa', 'esp.super_cup': 'Supercopa' };
const playedComps = () => Object.keys(SHORT).filter(l => (M || []).some(m => m.league === l && m.state === 'post'));
const compsLabel = ls => (ls.length ? ls.map(l => SHORT[l]).join(' + ') : 'La Liga');

const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// skor akhir + pencetak gol (s = summary, boleh null saat belum termuat)
function resultBlock(m, s) {
  const goals = s ? s.events.filter(e => /goal|pen|og/.test(e.kind) && e.kind !== 'penmiss' && !e.shootout) : [];
  const gl = side => goals.filter(g => g.side === side).map(g => `<li>${esc(g.who)} ${esc(g.min)}${g.kind === 'pen' ? ' (p)' : g.kind === 'og' ? ' (og)' : ''}</li>`).join('');
  return `<div class="rb">
    <div class="rb-row">
      <span class="rb-t">${crest(m.home, 36)}<b>${esc(m.home.name)}</b></span>
      <span class="rb-s num">${m.home.score ?? ''}<i>–</i>${m.away.score ?? ''}</span>
      <span class="rb-t r"><b>${esc(m.away.name)}</b>${crest(m.away, 36)}</span>
    </div>
    <div class="rb-meta">${esc(m.comp)} · ${esc(day(m.date))}${resChip(m.result)}</div>
    ${goals.length ? `<div class="rb-goals"><ul>${gl('home')}</ul><ul class="r">${gl('away')}</ul></div>` : ''}
  </div>`;
}

async function renderHome(seq) {
  top(brand('FC Barcelona'));
  if (!M) { view(loadErr ? errBox(loadErr) : loading()); return; }
  const now = Date.now();
  const lv = M.find(isLive) || M.find(nearKickoff);
  const next = lv || M.find(m => m.state === 'pre' && m.date > now - 3 * 3600000);
  const past = M.filter(m => m.state === 'post').sort((a, b) => b.date - a.date);
  const last = past[0];
  const form = past.slice(0, 5).reverse();   // lama → baru, terbaru paling kanan
  const upNext = M.filter(m => m.state === 'pre' && m.date > now && (!next || m.id !== next.id)).slice(0, 3);
  const skel = (id, title) => `<section class="card" id="${id}"><div class="card-h"><h2>${title}</h2></div><div class="sk"></div></section>`;
  const tableLeague = 'esp.1';
  const standingsFor = l => (/^(esp\.1|uefa\.champions)$/.test(l) ? E.standings(l).catch(() => null) : Promise.resolve(null));
  const rowsOf = g => (g ? g.flatMap(x => x.rows) : []);

  // rekap musim (semua kompetisi) dihitung dari hasil yang sudah ada
  const season = past.reduce((a, m) => {
    const us = ours(m).score, them = opp(m).score;
    if (us == null || them == null) return a;
    a.p++; a[m.result]++; a.gf += us; a.ga += them; if (them === 0) a.cs++;
    return a;
  }, { p: 0, W: 0, D: 0, L: 0, gf: 0, ga: 0, cs: 0 });

  view(`
    ${next ? heroHTML(next) : `<div class="hero empty-hero"><p>No upcoming matches yet.</p></div>`}
    ${next && next.state === 'pre' ? skel('preview', 'Match preview') : ''}
    ${upNext.length ? `<section class="card"><a class="card-h" href="#/jadwal"><h2>Next up</h2>${icon('i-right', 'chev')}</a>${upNext.map(m => matchRow(m)).join('')}</section>` : ''}
    ${last ? `<section class="card" id="last"><a class="card-h" href="#/laga/${last.league}/${last.id}"><h2>Last result</h2>${icon('i-right', 'chev')}</a>${resultBlock(last, null)}</section>` : ''}
    ${season.p ? `<section class="card">
      <a class="card-h" href="#/jadwal/hasil"><h2>Season so far <small>All comps</small></h2>${icon('i-right', 'chev')}</a>
      <div class="kpis">
        <div><b class="num">${season.p}</b><small>Played</small></div>
        <div><b class="num">${season.W}-${season.D}-${season.L}</b><small>W-D-L</small></div>
        <div><b class="num">${season.gf}:${season.ga}</b><small>Goals</small></div>
        <div><b class="num">${season.cs}</b><small>Clean sheets</small></div>
      </div>
      <div class="form-row"><small>Last 5</small><span class="form">${form.map(m => resChip(m.result)).join('')}</span></div>
    </section>` : ''}
    ${skel('table', 'La Liga')}
    ${skel('scorers', 'Top scorers')}
  `);
  tickCountdown();

  // preview laga berikutnya: posisi + form kedua tim
  if (next && next.state === 'pre') {
    Promise.all([E.summary(next.league, next.id).catch(() => null), standingsFor(next.league)]).then(([s, g]) => {
      if (seq !== renderSeq) return;
      const el = $('preview'); if (!el) return;
      const rows = rowsOf(g);
      const line = side => {
        const t = next[side];
        const st = rows.find(r => r.id === t.id);
        const f = s && s.form.find(x => x.side === side);
        const chips = f ? f.games.slice().reverse().map(x => resChip(x.res)).join('') : '';
        return `<div class="row">${crest(t, 30)}<span class="grow"><b>${esc(t.name)}</b><small>${st ? `${ordinal(st.rank)} in ${esc(next.comp)} · ${st.pts} pts` : esc(next.comp)}</small></span><span class="form">${chips}</span></div>`;
      };
      if (!rows.length && !(s && s.form.length)) { el.remove(); return; }
      el.innerHTML = `<a class="card-h" href="#/laga/${next.league}/${next.id}"><h2>Match preview</h2>${icon('i-right', 'chev')}</a><div class="rows">${line('home')}${line('away')}</div>`;
    });
  }

  // hasil terakhir: tambah pencetak gol
  if (last) {
    E.summary(last.league, last.id).then(s => {
      if (seq !== renderSeq) return;
      const el = $('last'); if (el) el.querySelector('.rb').outerHTML = resultBlock(last, s);
    }).catch(() => {});
  }

  // mini klasemen La Liga + posisi di Liga Champions
  Promise.all([E.standings(tableLeague), standingsFor('uefa.champions')]).then(([g, ucl]) => {
    if (seq !== renderSeq) return;
    const el = $('table'); if (!el) return;
    const rows = (g[0] || { rows: [] }).rows;
    const i = rows.findIndex(r => r.id === E.TEAM);
    if (i < 0) { el.remove(); return; }
    const from = Math.max(0, Math.min(i - 2, rows.length - 5));
    const win = rows.slice(from, from + 5);
    const cl = rowsOf(ucl).find(r => r.id === E.TEAM);
    el.innerHTML = `<a class="card-h" href="#/klasemen"><h2>La Liga</h2>${icon('i-right', 'chev')}</a>
      <div class="mini">${win.map(r => `<div class="tr${r.id === E.TEAM ? ' me' : ''}"><span class="c-r num">${r.rank}</span><span class="c-t">${crest(r, 20)}<b>${esc(r.name)}</b></span><span class="c-n num">${esc(r.played)}</span><span class="c-n num">${esc(r.gd)}</span><span class="c-p num">${r.pts}</span></div>`).join('')}</div>
      ${cl ? `<a class="sub-line" href="#/klasemen/uefa.champions">Champions League <b>${ordinal(cl.rank)}</b> of ${rowsOf(ucl).length} · ${cl.pts} pts${icon('i-right', 'chev')}</a>` : ''}`;
  }).catch(() => { const el = $('table'); el && el.remove(); });

  // pencetak gol Barça: jumlah semua kompetisi resmi yang sudah dimainkan musim ini
  const comps = playedComps();
  Promise.all([E.squad(false, comps.length ? comps : ['esp.1']), E.leaders('esp.1').catch(() => null)]).then(([sq, lead]) => {
    if (seq !== renderSeq) return;
    const el = $('scorers'); if (!el) return;
    const top5 = sq.filter(p => p.goals > 0 || p.assists > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 5);
    if (!top5.length) { el.remove(); return; }
    const ligaRank = p => { const i = lead ? lead.goals.findIndex(x => x.id === p.id || x.name === p.name) : -1; return i < 0 ? 0 : i + 1; };
    const sub = p => {
      const parts = comps.length > 1 ? comps.filter(l => p.by[l] && p.by[l].goals).map(l => `${p.by[l].goals} ${SHORT[l]}`) : [];
      return parts.join(' · ');
    };
    // peringkat di daftar top skor La Liga (semua klub), hanya 5 besar
    const tag = p => { const r = ligaRank(p); return r && r <= 5 ? `<span class="tag" title="Rank among all La Liga scorers">#${r} in La Liga</span>` : ''; };
    el.innerHTML = `<a class="card-h" href="#/skuad"><h2>Barça scorers <small>${esc(compsLabel(comps))}</small></h2>${icon('i-right', 'chev')}</a>
      <div class="sq th"><span></span><span class="grow"></span><span class="c">Goals</span><span class="c">Ast</span></div>
      ${top5.map(p => `<div class="sq"><span class="numdot">${esc(p.num)}</span><span class="grow"><b class="nm">${esc(p.name)}${tag(p)}</b>${sub(p) ? `<small>${esc(sub(p))}</small>` : ''}</span><span class="c num strong">${p.goals}</span><span class="c num${p.assists ? '' : ' dim'}">${p.assists}</span></div>`).join('')}`;
  }).catch(() => { const el = $('scorers'); el && el.remove(); });

  // skor live: perbarui tiap 30 detik
  if (next && (isLive(next) || nearKickoff(next))) {
    const poll = async () => {
      try {
        live[next.id] = await E.summary(next.league, next.id, true);
        if (seq !== renderSeq) return;
        const h = document.querySelector('.hero'); if (h) h.outerHTML = heroHTML(next);
        if (live[next.id].match.state === 'post') { clearInterval(liveTimer); loadMatches(true); }
      } catch { /* coba lagi nanti */ }
    };
    poll(); liveTimer = setInterval(poll, 30000);
  }
}

function tickCountdown() {
  document.querySelectorAll('.cd[data-kick]').forEach(el => {
    const k = Number(el.dataset.kick);
    if (/TBC/.test(el.textContent)) return;
    el.textContent = k > Date.now() ? 'Kick-off in ' + untilText(k - Date.now()) : 'Kick-off soon';
  });
}
setInterval(tickCountdown, 30000);

// ---------- baris laga ----------
function matchRow(m, compact) {
  const o = opp(m);
  const right = m.state === 'post'
    ? `<span class="sc num">${ours(m).score ?? ''}–${o.score ?? ''}</span>${resChip(m.result)}`
    : m.state === 'in' ? `<span class="live sm"><b></b>LIVE</span>`
    : `<span class="tm num">${m.tbd ? 'TBD' : time(m.date)}</span>`;
  return `<a class="mrow${compact ? ' compact' : ''}" href="#/laga/${m.league}/${m.id}">
    <span class="dt"><b class="num">${fDnum.format(m.date)}</b><small>${esc(fWd.format(m.date))}</small></span>
    ${crest(o, 30)}
    <span class="grow"><b>${esc(o.name)}</b><small>${esc(m.comp)} · ${m.us === 'home' ? 'Home' : 'Away'}</small></span>
    <span class="rt">${right}</span>
  </a>`;
}

// ---------- Jadwal ----------
function seg(items, cur, attr) {
  return `<div class="seg" role="tablist">${items.map(([k, label]) => `<button role="tab" aria-selected="${k === cur}" class="${k === cur ? 'on' : ''}" ${attr}="${k}">${label}</button>`).join('')}</div>`;
}

function renderSchedule(tab) {
  top(`<h1>Fixtures</h1>`);
  if (!M) { view(errBox(loadErr)); return; }
  const now = Date.now();
  const list = tab === 'hasil'
    ? M.filter(m => m.state === 'post').sort((a, b) => b.date - a.date)
    : M.filter(m => m.state !== 'post' && m.date > now - 3 * 3600000);
  const groups = [];
  list.forEach(m => {
    const k = fMonth.format(m.date);
    let g = groups[groups.length - 1];
    if (!g || g.k !== k) { g = { k, items: [] }; groups.push(g); }
    g.items.push(m);
  });
  const cal = `<div class="cal">
    <a class="btn ghost" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(ICS_URL.replace(/^https:/, 'webcal:'))}" target="_blank" rel="noopener">${icon('i-plus-cal')}Add to Google Calendar</a>
    <button class="icon-btn" data-act="copy-ics" aria-label="Copy calendar link">${icon('i-copy')}</button>
  </div>`;
  view(`${seg([['akan', 'Upcoming'], ['hasil', 'Results']], tab, 'data-tab')}
    ${groups.length ? groups.map(g => `<h3 class="month">${esc(g.k)}</h3><section class="card list">${g.items.map(m => matchRow(m)).join('')}</section>`).join('')
      : `<div class="empty"><p>${tab === 'hasil' ? 'No results this season yet.' : 'No upcoming matches.'}</p></div>`}
    ${tab === 'akan' ? cal : ''}`);
}

// ---------- Klasemen ----------
async function renderTable(league, seq, opts) {
  if (!E.COMPS[league] || !/^(esp\.1|uefa\.champions)$/.test(league)) league = 'esp.1';
  top(`<h1>Standings</h1>`);
  const head = seg([['esp.1', 'La Liga'], ['uefa.champions', 'Champions League']], league, 'data-league');
  view(head + loading());
  let groups, lead;
  try { [groups, lead] = await Promise.all([E.standings(league, opts.fresh), E.leaders(league, opts.fresh).catch(() => null)]); }
  catch (e) { if (seq === renderSeq) view(head + errBox(e.message)); return; }
  if (seq !== renderSeq) return;

  const zones = [];
  const table = g => `<section class="card tbl">
    ${groups.length > 1 ? `<h3 class="tbl-name">${esc(g.name)}</h3>` : ''}
    <div class="tr th"><span class="c-r">#</span><span class="c-t">Team</span><span class="c-n">P</span><span class="c-n hide-s">W-D-L</span><span class="c-n">GD</span><span class="c-p">Pts</span></div>
    ${g.rows.map(r => {
      if (r.zone && !zones.find(z => z.label === r.zone.label)) zones.push(r.zone);
      return `<div class="tr${r.id === E.TEAM ? ' me' : ''}" ${r.zone ? `style="--zone:${esc(r.zone.color)}"` : ''}>
        <span class="c-r num${r.zone ? ' z' : ''}">${r.rank}</span>
        <span class="c-t">${crest(r, 20)}<b>${esc(r.name)}</b></span>
        <span class="c-n num">${esc(r.played)}</span>
        <span class="c-n num hide-s">${esc(r.w)}-${esc(r.d)}-${esc(r.l)}</span>
        <span class="c-n num">${esc(r.gd)}</span>
        <span class="c-p num">${r.pts}</span></div>`;
    }).join('')}
  </section>`;
  const tables = groups.map(table).join('');
  const legend = zones.length ? `<div class="legend">${zones.map(z => `<span><i style="background:${esc(z.color)}"></i>${esc(z.label)}</span>`).join('')}</div>` : '';
  const scorers = lead && lead.goals.length ? `<section class="card">
    <div class="card-h"><h2>${esc(E.COMPS[league])} top scorers</h2></div>
    <div class="rows">${lead.goals.slice(0, 10).map((p, i) => `<div class="row${p.teamId === E.TEAM ? ' me' : ''}">
      <span class="rk num">${i + 1}</span><span class="grow"><b>${esc(p.name)}</b><small>${esc(p.team)} · ${esc(p.apps)} apps · ${esc(p.assists || 0)} assists</small></span><b class="num big">${p.value}</b></div>`).join('')}</div>
  </section>` : '';
  view(head + tables + legend + scorers);
}

// ---------- Skuad: satu tabel, bisa di-sort dan difilter ----------
const POS_F = [['all', 'All'], ['G', 'GK'], ['D', 'DEF'], ['M', 'MID'], ['F', 'FWD']];
const POS_NAME = { G: 'GK', D: 'DEF', M: 'MID', F: 'FWD' };
const SQ_COLS = [['age', 'Age'], ['apps', 'Apps'], ['goals', 'Goals'], ['assists', 'Ast']];
let SQ = null;
const sqState = (() => {
  const d = { comp: 'all', pos: 'all', sort: 'goals', dir: -1 };
  try { return Object.assign(d, JSON.parse(localStorage.getItem('md_sq')) || {}); } catch { return d; }
})();
const saveSq = () => { try { localStorage.setItem('md_sq', JSON.stringify(sqState)); } catch { /* abaikan */ } };

async function renderSquad(seq, opts) {
  top(`<h1>Squad</h1>`);
  view(loading());
  if (!M) await loadMatches();
  const comps = playedComps();
  try { SQ = { comps, list: await E.squad(opts.fresh, comps.length ? comps : ['esp.1']) }; }
  catch (e) { if (seq === renderSeq) view(errBox(e.message)); return; }
  if (seq !== renderSeq) return;
  if (sqState.comp !== 'all' && !comps.includes(sqState.comp)) sqState.comp = 'all';
  view(`<div id="sqf"></div><section class="card sqt" id="sqt"></section>`);
  drawSquad();
}

function drawSquad() {
  if (!SQ) return;
  const { comps, list } = SQ;
  const st = sqState;
  const compTabs = [['all', 'All comps']].concat(comps.map(l => [l, SHORT[l]]));
  $('sqf').innerHTML = (comps.length > 1 ? seg(compTabs, st.comp, 'data-sqcomp') : '') +
    `<div class="chips">${POS_F.map(([k, l]) => `<button class="chip${st.pos === k ? ' on' : ''}" data-sqpos="${k}">${l}</button>`).join('')}</div>`;

  const val = p => {
    const s = st.comp === 'all' ? p : (p.by[st.comp] || { apps: 0, goals: 0, assists: 0 });
    return { apps: s.apps, goals: s.goals, assists: s.assists, age: Number(p.age) || 0 };
  };
  const rows = list.filter(p => st.pos === 'all' || p.pos === st.pos || (st.pos === 'F' && !POS_NAME[p.pos]))
    .map(p => ({ p, v: val(p) }));
  const k = st.sort, dir = st.dir;
  rows.sort((a, b) => {
    if (k === 'name') return dir * a.p.name.localeCompare(b.p.name);
    if (k === 'num') return dir * ((Number(a.p.num) || 999) - (Number(b.p.num) || 999));
    return dir * (a.v[k] - b.v[k]) || (b.v.goals - a.v.goals) || (b.v.apps - a.v.apps) || a.p.name.localeCompare(b.p.name);
  });
  const th = (key, label, cls) => `<button class="${cls}${k === key ? ' on' : ''}" data-sqsort="${key}">${label}${k === key ? (dir < 0 ? ' ↓' : ' ↑') : ''}</button>`;
  $('sqt').innerHTML = `<div class="sq th">${th('name', 'Player', 'grow')}${SQ_COLS.map(([c, l]) => th(c, l, 'c')).join('')}</div>
    ${rows.map(({ p, v }) => `<div class="sq">
      <span class="grow"><b class="ell">${esc(p.name)}</b><small class="ell">${p.num ? '#' + esc(p.num) + ' · ' : ''}${POS_NAME[p.pos] || esc(p.pos)} · ${esc(p.nat)}${p.injured ? ' · <em>injured</em>' : ''}</small></span>
      <span class="c num dim2">${v.age || '–'}</span>
      <span class="c num${v.apps ? '' : ' dim'}">${v.apps}</span><span class="c num${v.goals ? ' strong' : ' dim'}">${v.goals}</span><span class="c num${v.assists ? '' : ' dim'}">${v.assists}</span></div>`).join('')
      || `<div class="empty"><p>No players.</p></div>`}`;
}

// ---------- Detail laga ----------
const STATS = [
  ['possessionPct', 'Possession', v => v + '%'], ['totalShots', 'Shots'], ['shotsOnTarget', 'On target'],
  ['wonCorners', 'Corners'], ['foulsCommitted', 'Fouls'], ['offsides', 'Offsides'],
  ['yellowCards', 'Yellow cards'], ['redCards', 'Red cards'], ['saves', 'Saves'],
  ['totalPasses', 'Passes'], ['passPct', 'Pass accuracy', v => Math.round(Number(v) * 100) + '%']
];
const KIND = {
  goal: ['i-ball', 'Goal'], pen: ['i-ball', 'Penalty'], og: ['i-ball', 'Own goal'], penmiss: ['i-ball', 'Penalty missed'],
  yellow: ['', 'Yellow card'], red: ['', 'Red card'], sub: ['i-sub', 'Substitution'], var: ['i-whistle', 'VAR']
};
let detailTab = 'momen';

async function renderMatch(league, id, seq, opts) {
  top(`<a class="back" href="#/" data-act="back" aria-label="Back">${icon('i-back')}</a><h1 class="sm">${esc(E.COMPS[league] || 'Match')}</h1>`);
  if (!document.querySelector('.md-band')) view(loading());
  let s;
  try { s = await E.summary(league, id, opts.fresh); } catch (e) { if (seq === renderSeq) view(errBox(e.message)); return; }
  if (seq !== renderSeq) return;
  const m = s.match;
  const pre = m.state === 'pre';
  const tabs = pre
    ? [['lineup', 'Line-ups'], ['form', 'Form']]
    : [['momen', 'Events'], ['lineup', 'Line-ups'], ['stat', 'Stats'], ['form', 'Form']];
  if (!tabs.some(([k]) => k === detailTab)) detailTab = tabs[0][0];

  const goals = s.events.filter(e => /goal|pen|og/.test(e.kind) && e.kind !== 'penmiss' && !e.shootout);
  const gl = side => goals.filter(g => g.side === side).map(g => `<li>${esc(g.who)} ${esc(g.min)}${g.kind === 'pen' ? ' (p)' : g.kind === 'og' ? ' (og)' : ''}</li>`).join('');
  const mid = pre
    ? `<div class="ht num">${m.tbd ? '––.––' : time(m.date)}</div><div class="hst">${esc(fDayLong.format(m.date))}</div>`
    : `<div class="hs num">${scoreText(m)}</div><div class="hst">${m.state === 'in' ? `<span class="live"><b></b>LIVE</span> ${esc(m.clock || m.detail)}` : esc(m.detail === 'FT' ? 'Full time' : m.detail)}</div>${pensText(m) ? `<div class="hst">${pensText(m)}</div>` : ''}`;

  const info = [s.venue && `${icon('i-pin')}${esc(s.venue)}${s.city ? ', ' + esc(s.city) : ''}`,
    s.referee && `${icon('i-whistle')}${esc(s.referee)}`,
    s.attendance && `Attendance ${Number(s.attendance).toLocaleString('en-GB')}`].filter(Boolean);

  view(`<section class="md-band">
      <div class="h-row">
        <div class="h-team">${crest(m.home, 60)}<b>${esc(m.home.name)}</b></div>
        <div class="h-mid">${mid}</div>
        <div class="h-team">${crest(m.away, 60)}<b>${esc(m.away.name)}</b></div>
      </div>
      ${goals.length ? `<div class="h-goals"><ul>${gl('home')}</ul><ul class="r">${gl('away')}</ul></div>` : ''}
    </section>
    ${seg(tabs, detailTab, 'data-dtab')}
    <div id="dbody">${detailBody(s)}</div>
    ${info.length ? `<div class="info">${info.map(x => `<span>${x}</span>`).join('')}</div>` : ''}`);

  if (m.state === 'in' || nearKickoff(m)) {
    liveTimer = setInterval(() => { if (seq === renderSeq) render({ fresh: true }); }, 30000);
  }
  renderMatch.last = s;
}

function detailBody(s) {
  const m = s.match;
  if (detailTab === 'momen') {
    const ev = s.events.filter(e => !e.shootout || /goal|pen|penmiss/.test(e.kind));
    if (!ev.length) return `<div class="empty"><p>No key events yet.</p></div>`;
    return `<section class="card tl">${ev.map(e => {
      const [ic, label] = KIND[e.kind];
      const mark = e.kind === 'yellow' || e.kind === 'red' ? `<span class="cardk ${e.kind}"></span>` : icon(ic, e.kind === 'penmiss' ? 'miss' : '');
      const sub = e.kind === 'sub'
        ? `<b>${esc(e.who)}</b><small>on for ${esc(e.extra)}</small>`
        : `<b>${esc(e.who)}</b><small>${label}${e.extra && /goal|pen/.test(e.kind) ? ' · assist ' + esc(e.extra) : ''}</small>`;
      return `<div class="ev ${e.side}${/goal|pen|og/.test(e.kind) && e.kind !== 'penmiss' ? ' is-goal' : ''}">
        <span class="min num">${esc(e.min)}</span><span class="mk">${mark}</span><span class="who">${sub}</span></div>`;
    }).join('')}</section>`;
  }
  if (detailTab === 'lineup') {
    if (!s.lineups.length || !s.lineups.some(l => l.players.some(p => p.starter))) {
      return `<div class="empty"><p>Line-ups usually appear about an hour before kick-off.</p></div>`;
    }
    const order = s.lineups.slice().sort((a, b) => (a.side === m.us ? -1 : 1) - (b.side === m.us ? -1 : 1));
    return order.map(l => {
      const t = l.side === 'home' ? m.home : m.away;
      const st = l.players.filter(p => p.starter).sort((a, b) => a.place - b.place);
      const bench = l.players.filter(p => !p.starter).sort((a, b) => (b.inn - a.inn) || (Number(a.num) - Number(b.num)));
      const row = p => `<div class="lp"><span class="numdot">${esc(p.num)}</span><span class="grow">${esc(p.name)}</span>${p.starter ? `<small class="pos">${esc(p.pos)}</small>` : ''}${p.out ? `<span class="subk out" title="Subbed off">${icon('i-sub')}</span>` : p.inn ? `<span class="subk in" title="Subbed on">${icon('i-sub')}</span>` : ''}</div>`;
      return `<section class="card">
        <div class="card-h">${crest(t, 24)}<h2>${esc(t.name)}</h2><span class="fm num">${esc(l.formation)}</span></div>
        ${st.map(row).join('')}
        ${bench.length ? `<h4 class="bench">Substitutes</h4>${bench.map(row).join('')}` : ''}
      </section>`;
    }).join('');
  }
  if (detailTab === 'stat') {
    const h = s.stats.home, a = s.stats.away;
    if (!h || !a) return `<div class="empty"><p>Stats not available yet.</p></div>`;
    const rows = STATS.filter(([k]) => h[k] != null && a[k] != null && h[k] !== '' ).map(([k, label, f]) => {
      const hv = Number(h[k]) || 0, av = Number(a[k]) || 0, tot = hv + av || 1;
      const fmt = f || (v => v);
      return `<div class="st"><div class="st-v"><b class="num">${esc(fmt(h[k]))}</b><span>${label}</span><b class="num">${esc(fmt(a[k]))}</b></div>
        <div class="st-b"><i class="${hv >= av ? 'lead' : ''} ${m.us === 'home' ? 'us' : ''}" style="width:${(hv / tot) * 100}%"></i><i class="${av >= hv ? 'lead' : ''} ${m.us === 'away' ? 'us' : ''}" style="width:${(av / tot) * 100}%"></i></div></div>`;
    }).join('');
    return `<section class="card stats"><div class="st-h">${crest(m.home, 22)}<span></span>${crest(m.away, 22)}</div>${rows}</section>`;
  }
  // form
  if (!s.form.length) return `<div class="empty"><p>Form not available yet.</p></div>`;
  const order = s.form.slice().sort((x, y) => (x.side === m.us ? -1 : 1) - (y.side === m.us ? -1 : 1));
  return order.map(t => {
    const team = t.side === 'home' ? m.home : m.away;
    return `<section class="card">
      <div class="card-h">${crest(team, 24)}<h2>${esc(team.name)}</h2><span class="form">${t.games.slice().reverse().map(g => resChip(g.res)).join('')}</span></div>
      ${t.games.map(g => `<div class="row"><span class="dt sm"><b class="num">${fDnum.format(g.date)}</b><small>${esc(new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(g.date))}</small></span>
        <span class="grow"><b>${g.at === '@' ? '@ ' : 'vs '}${esc(g.opp)}</b><small>${esc(g.comp)}</small></span><span class="sc num">${esc(g.score)}</span>${resChip(g.res)}</div>`).join('')}
    </section>`;
  }).join('');
}

// ---------- event ----------
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-league],[data-dtab],[data-act],[data-sqcomp],[data-sqpos],[data-sqsort]');
  if (!t) return;
  if (t.dataset.tab) { location.replace('#/jadwal' + (t.dataset.tab === 'hasil' ? '/hasil' : '')); return; }
  if (t.dataset.league) { location.replace('#/klasemen/' + t.dataset.league); return; }
  if (t.dataset.sqcomp) { sqState.comp = t.dataset.sqcomp; saveSq(); drawSquad(); return; }
  if (t.dataset.sqpos) { sqState.pos = t.dataset.sqpos; saveSq(); drawSquad(); return; }
  if (t.dataset.sqsort) {
    const key = t.dataset.sqsort;
    if (sqState.sort === key) sqState.dir = -sqState.dir;
    else { sqState.sort = key; sqState.dir = key === 'name' || key === 'num' ? 1 : -1; }
    saveSq(); drawSquad(); return;
  }
  if (t.dataset.dtab) {
    detailTab = t.dataset.dtab;
    document.querySelectorAll('[data-dtab]').forEach(b => { const on = b.dataset.dtab === detailTab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    if (renderMatch.last) $('dbody').innerHTML = detailBody(renderMatch.last);
    return;
  }
  const act = t.dataset.act;
  if (act === 'retry') { render({ fresh: true }); }
  if (act === 'theme') {
    const order = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(getTheme()) + 1) % 3];
    applyTheme(next);
    t.outerHTML = themeBtn();
    snack(THEMES[next][1]);
  }
  if (act === 'back') { e.preventDefault(); if (history.length > 1 && sessionStorage.getItem('md_nav')) history.back(); else location.replace('#/'); }
  if (act === 'copy-ics') {
    navigator.clipboard.writeText(ICS_URL).then(() => snack('Calendar link copied'), () => snack(ICS_URL));
  }
});

window.addEventListener('hashchange', () => {
  try { sessionStorage.setItem('md_nav', '1'); } catch { /* abaikan */ }
  if (!route().r.startsWith('laga')) detailTab = 'momen';
  window.scrollTo(0, 0);
  render();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render({ fresh: true });
});

// ---------- mulai ----------
render().then(() => {
  // muat ulang di belakang layar kalau data dari cache sudah agak lama
  if (route().r === 'home' || route().r === 'jadwal') loadMatches(true).then(() => { if (/^(home|jadwal)$/.test(route().r)) render(); });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) snack('New version ready, reopen the app');
      });
    });
  }).catch(() => {});
}
console.log('Matchday v' + VERSION);
