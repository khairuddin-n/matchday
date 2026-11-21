import * as E from './espn.js';

const VERSION = '1.0.1';
const ICS_URL = 'https://khairuddin-n.github.io/matchday/barca.ics';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;

// ---------- format waktu (zona waktu HP; di Indonesia tampil "WIB") ----------
const fDay = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
const fDayLong = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
const fTime = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });
const fZone = new Intl.DateTimeFormat('id-ID', { timeZoneName: 'short' });
const fMonth = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });
const fDnum = new Intl.DateTimeFormat('id-ID', { day: 'numeric' });
const fWd = new Intl.DateTimeFormat('id-ID', { weekday: 'short' });
const zone = (() => { const p = fZone.formatToParts(new Date()).find(x => x.type === 'timeZoneName'); return p ? p.value : ''; })();
const day = t => fDay.format(t);
const time = t => fTime.format(t).replace(':', '.');

function untilText(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d >= 1) return `${d} hari${h ? ' ' + h + ' jam' : ''}`;
  if (h >= 1) return `${h} jam${mm ? ' ' + mm + ' mnt' : ''}`;
  return `${mm} mnt`;
}
const RES = { W: ['M', 'Menang'], D: ['S', 'Seri'], L: ['K', 'Kalah'] };
const resChip = (r, big) => r ? `<span class="res r-${r}${big ? ' big' : ''}" title="${RES[r][1]}">${RES[r][0]}</span>` : '';
const crest = (t, size = 28) => t.logo
  ? `<img class="crest" src="${esc(t.logo)}" width="${size}" height="${size}" alt="" loading="lazy" decoding="async">`
  : `<span class="crest ph" style="width:${size}px;height:${size}px">${esc((t.abbr || t.name || '?').slice(0, 3))}</span>`;
const opp = m => (m.us === 'home' ? m.away : m.home);
const ours = m => (m.us === 'home' ? m.home : m.away);
const scoreText = m => `${m.home.score ?? '–'}<i>–</i>${m.away.score ?? '–'}`;
const pensText = m => (m.home.pens != null && m.away.pens != null && (m.home.pens || m.away.pens) ? `Adu penalti ${m.home.pens}–${m.away.pens}` : '');

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
const errBox = msg => `<div class="empty"><p>${esc(msg || 'Data belum bisa diambil.')}</p><button class="btn" data-act="retry">Coba lagi</button></div>`;
const loading = () => `<div class="loading"><span class="spin"></span></div>`;
const brand = sub => `<div class="brand"><span class="mark">${icon('i-ball')}</span><span class="wm">matchday</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;

// ---------- Beranda ----------
function heroHTML(m) {
  const s = live[m.id] ? live[m.id].match : m;
  const lv = isLive(s);
  const done = s.state === 'post';
  const where = m.us === 'home' ? 'Kandang' : 'Tandang';
  let mid;
  if (lv || done) {
    mid = `<div class="hs num">${scoreText(s)}</div>
      <div class="hst">${lv ? `<span class="live"><b></b>LIVE</span> ${esc(s.clock || s.detail)}` : 'Selesai'}</div>`;
  } else {
    mid = `<div class="ht num">${m.tbd ? '––.––' : time(m.date)}</div><div class="hst">${esc(day(m.date))}${m.tbd ? '' : ' · ' + zone}</div>`;
  }
  const goals = live[m.id] ? live[m.id].events.filter(e => /goal|pen|og/.test(e.kind) && e.kind !== 'penmiss' && !e.shootout) : [];
  const gl = sideName => goals.filter(g => g.side === sideName).map(g => `<li>${esc(g.who)} ${esc(g.min)}${g.kind === 'pen' ? ' (p)' : g.kind === 'og' ? ' (bd)' : ''}</li>`).join('');
  return `<a class="hero" href="#/laga/${m.league}/${m.id}">
    <div class="h-meta"><span>${esc(m.comp)}</span><span>${where}</span></div>
    <div class="h-row">
      <div class="h-team">${crest(s.home, 56)}<b>${esc(s.home.name)}</b></div>
      <div class="h-mid">${mid}</div>
      <div class="h-team">${crest(s.away, 56)}<b>${esc(s.away.name)}</b></div>
    </div>
    ${goals.length ? `<div class="h-goals"><ul>${gl('home')}</ul><ul class="r">${gl('away')}</ul></div>` : ''}
    ${!lv && !done ? `<div class="h-foot"><span class="cd" data-kick="${m.date}">${m.tbd ? 'Jam kick-off belum pasti' : 'Kick-off ' + untilText(m.date - Date.now()) + ' lagi'}</span></div>` : ''}
  </a>`;
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

  view(`
    ${next ? heroHTML(next) : `<div class="hero empty-hero"><p>Belum ada jadwal berikutnya.</p></div>`}
    ${last ? `<section class="card">
      <a class="card-h" href="#/jadwal/hasil"><h2>Form</h2><span class="form">${form.map(m => resChip(m.result)).join('')}</span>${icon('i-right', 'chev')}</a>
      ${matchRow(last, true)}
    </section>` : ''}
    <section class="card" id="pos"><div class="card-h"><h2>La Liga</h2></div><div class="sk"></div></section>
    <section class="card" id="scorers"><div class="card-h"><h2>Pencetak gol</h2></div><div class="sk"></div></section>
  `);
  tickCountdown();

  // posisi liga + pencetak gol (tidak menghambat hero)
  E.standings('esp.1').then(g => {
    if (seq !== renderSeq) return;
    const rows = (g[0] || { rows: [] }).rows;
    const i = rows.findIndex(r => r.id === E.TEAM);
    const el = $('pos'); if (!el || i < 0) { el && el.remove(); return; }
    const me = rows[i], other = i === 0 ? rows[1] : rows[0];
    const diff = other ? me.pts - other.pts : 0;
    const gap = !other ? '' : i === 0 ? `unggul ${diff} poin dari ${esc(other.name)}` : `${-diff} poin di belakang ${esc(other.name)}`;
    el.outerHTML = `<a class="card pos" href="#/klasemen">
      <span class="rank num">${me.rank}</span>
      <span class="pos-t"><b>${me.pts} poin <small>· ${me.played} laga</small></b><small>${gap}</small></span>${icon('i-right', 'chev')}</a>`;
  }).catch(() => { const el = $('pos'); el && el.remove(); });

  E.squad().then(sq => {
    if (seq !== renderSeq) return;
    const el = $('scorers'); if (!el) return;
    const top3 = sq.filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 3);
    if (!top3.length) { el.remove(); return; }
    el.innerHTML = `<a class="card-h" href="#/skuad"><h2>Pencetak gol <small>La Liga</small></h2>${icon('i-right', 'chev')}</a>
      <div class="rows">${top3.map(p => `<div class="row"><span class="numdot">${esc(p.num)}</span><span class="grow">${esc(p.name)}</span><b class="num">${p.goals}</b></div>`).join('')}</div>`;
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
    if (/belum pasti/.test(el.textContent)) return;
    el.textContent = k > Date.now() ? 'Kick-off ' + untilText(k - Date.now()) + ' lagi' : 'Sebentar lagi kick-off';
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
    <span class="grow"><b>${esc(o.name)}</b><small>${esc(m.comp)} · ${m.us === 'home' ? 'Kandang' : 'Tandang'}</small></span>
    <span class="rt">${right}</span>
  </a>`;
}

// ---------- Jadwal ----------
function seg(items, cur, attr) {
  return `<div class="seg" role="tablist">${items.map(([k, label]) => `<button role="tab" aria-selected="${k === cur}" class="${k === cur ? 'on' : ''}" ${attr}="${k}">${label}</button>`).join('')}</div>`;
}

function renderSchedule(tab) {
  top(`<h1>Jadwal</h1>`);
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
    <a class="btn ghost" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(ICS_URL.replace(/^https:/, 'webcal:'))}" target="_blank" rel="noopener">${icon('i-plus-cal')}Tambah ke Google Calendar</a>
    <button class="icon-btn" data-act="copy-ics" aria-label="Salin link kalender">${icon('i-copy')}</button>
  </div>`;
  view(`${seg([['akan', 'Akan datang'], ['hasil', 'Hasil']], tab, 'data-tab')}
    ${groups.length ? groups.map(g => `<h3 class="month">${esc(g.k)}</h3><section class="card list">${g.items.map(m => matchRow(m)).join('')}</section>`).join('')
      : `<div class="empty"><p>${tab === 'hasil' ? 'Belum ada hasil musim ini.' : 'Belum ada jadwal.'}</p></div>`}
    ${tab === 'akan' ? cal : ''}`);
}

// ---------- Klasemen ----------
async function renderTable(league, seq, opts) {
  if (!E.COMPS[league] || !/^(esp\.1|uefa\.champions)$/.test(league)) league = 'esp.1';
  top(`<h1>Klasemen</h1>`);
  const head = seg([['esp.1', 'La Liga'], ['uefa.champions', 'Liga Champions']], league, 'data-league');
  view(head + loading());
  let groups, lead;
  try { [groups, lead] = await Promise.all([E.standings(league, opts.fresh), E.leaders(league, opts.fresh).catch(() => null)]); }
  catch (e) { if (seq === renderSeq) view(head + errBox(e.message)); return; }
  if (seq !== renderSeq) return;

  const zones = [];
  const table = g => `<section class="card tbl">
    ${groups.length > 1 ? `<h3 class="tbl-name">${esc(g.name)}</h3>` : ''}
    <div class="tr th"><span class="c-r">#</span><span class="c-t">Tim</span><span class="c-n">M</span><span class="c-n hide-s">M-S-K</span><span class="c-n">SG</span><span class="c-p">Poin</span></div>
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
    <div class="card-h"><h2>Top skor</h2></div>
    <div class="rows">${lead.goals.slice(0, 10).map((p, i) => `<div class="row${p.teamId === E.TEAM ? ' me' : ''}">
      <span class="rk num">${i + 1}</span><span class="grow"><b>${esc(p.name)}</b><small>${esc(p.team)} · ${esc(p.apps)} laga · ${esc(p.assists || 0)} assist</small></span><b class="num big">${p.value}</b></div>`).join('')}</div>
  </section>` : '';
  view(head + tables + legend + scorers);
}

// ---------- Skuad ----------
const POS = [['G', 'Kiper'], ['D', 'Belakang'], ['M', 'Tengah'], ['F', 'Depan']];
async function renderSquad(seq, opts) {
  top(`<h1>Skuad</h1>`);
  view(loading());
  let sq;
  try { sq = await E.squad(opts.fresh); } catch (e) { if (seq === renderSeq) view(errBox(e.message)); return; }
  if (seq !== renderSeq) return;
  const rest = sq.filter(p => !POS.some(([k]) => k === p.pos));
  view(`<p class="note">Statistik La Liga musim ini</p>` + POS.map(([k, label]) => {
    const ps = sq.filter(p => p.pos === k).concat(k === 'F' ? rest : []).sort((a, b) => (Number(a.num) || 99) - (Number(b.num) || 99));
    if (!ps.length) return '';
    return `<h3 class="month">${label}</h3><section class="card">
      <div class="sq th"><span></span><span class="grow"></span><span class="c">Main</span><span class="c">Gol</span><span class="c">Assist</span></div>
      ${ps.map(p => `<div class="sq"><span class="numdot">${esc(p.num || '–')}</span>
        <span class="grow"><b>${esc(p.name)}</b><small>${esc(p.nat)}${p.age ? ' · ' + p.age + ' th' : ''}${p.injured ? ' · <em>cedera</em>' : ''}</small></span>
        <span class="c num${p.apps ? '' : ' dim'}">${p.apps}</span><span class="c num${p.goals ? ' strong' : ' dim'}">${p.goals}</span><span class="c num${p.assists ? '' : ' dim'}">${p.assists}</span></div>`).join('')}
    </section>`;
  }).join(''));
}

// ---------- Detail laga ----------
const STATS = [
  ['possessionPct', 'Penguasaan bola', v => v + '%'], ['totalShots', 'Tembakan'], ['shotsOnTarget', 'Tepat sasaran'],
  ['wonCorners', 'Sepak pojok'], ['foulsCommitted', 'Pelanggaran'], ['offsides', 'Offside'],
  ['yellowCards', 'Kartu kuning'], ['redCards', 'Kartu merah'], ['saves', 'Penyelamatan'],
  ['totalPasses', 'Umpan'], ['passPct', 'Akurasi umpan', v => Math.round(Number(v) * 100) + '%']
];
const KIND = {
  goal: ['i-ball', 'Gol'], pen: ['i-ball', 'Penalti'], og: ['i-ball', 'Bunuh diri'], penmiss: ['i-ball', 'Penalti gagal'],
  yellow: ['', 'Kartu kuning'], red: ['', 'Kartu merah'], sub: ['i-sub', 'Pergantian'], var: ['i-whistle', 'VAR']
};
let detailTab = 'momen';

async function renderMatch(league, id, seq, opts) {
  top(`<a class="back" href="#/" data-act="back" aria-label="Kembali">${icon('i-back')}</a><h1 class="sm">${esc(E.COMPS[league] || 'Laga')}</h1>`);
  if (!document.querySelector('.md-band')) view(loading());
  let s;
  try { s = await E.summary(league, id, opts.fresh); } catch (e) { if (seq === renderSeq) view(errBox(e.message)); return; }
  if (seq !== renderSeq) return;
  const m = s.match;
  const pre = m.state === 'pre';
  const tabs = pre
    ? [['lineup', 'Line-up'], ['form', 'Form']]
    : [['momen', 'Momen'], ['lineup', 'Line-up'], ['stat', 'Statistik'], ['form', 'Form']];
  if (!tabs.some(([k]) => k === detailTab)) detailTab = tabs[0][0];

  const goals = s.events.filter(e => /goal|pen|og/.test(e.kind) && e.kind !== 'penmiss' && !e.shootout);
  const gl = side => goals.filter(g => g.side === side).map(g => `<li>${esc(g.who)} ${esc(g.min)}${g.kind === 'pen' ? ' (p)' : g.kind === 'og' ? ' (bd)' : ''}</li>`).join('');
  const mid = pre
    ? `<div class="ht num">${m.tbd ? '––.––' : time(m.date)}</div><div class="hst">${esc(fDayLong.format(m.date))}</div>`
    : `<div class="hs num">${scoreText(m)}</div><div class="hst">${m.state === 'in' ? `<span class="live"><b></b>LIVE</span> ${esc(m.clock || m.detail)}` : esc(m.detail === 'FT' ? 'Selesai' : m.detail)}</div>${pensText(m) ? `<div class="hst">${pensText(m)}</div>` : ''}`;

  const info = [s.venue && `${icon('i-pin')}${esc(s.venue)}${s.city ? ', ' + esc(s.city) : ''}`,
    s.referee && `${icon('i-whistle')}${esc(s.referee)}`,
    s.attendance && `${Number(s.attendance).toLocaleString('id-ID')} penonton`].filter(Boolean);

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
    if (!ev.length) return `<div class="empty"><p>Belum ada momen penting.</p></div>`;
    return `<section class="card tl">${ev.map(e => {
      const [ic, label] = KIND[e.kind];
      const mark = e.kind === 'yellow' || e.kind === 'red' ? `<span class="cardk ${e.kind}"></span>` : icon(ic, e.kind === 'penmiss' ? 'miss' : '');
      const sub = e.kind === 'sub'
        ? `<b>${esc(e.who)}</b><small>masuk, ganti ${esc(e.extra)}</small>`
        : `<b>${esc(e.who)}</b><small>${label}${e.extra && /goal|pen/.test(e.kind) ? ' · assist ' + esc(e.extra) : ''}</small>`;
      return `<div class="ev ${e.side}${/goal|pen|og/.test(e.kind) && e.kind !== 'penmiss' ? ' is-goal' : ''}">
        <span class="min num">${esc(e.min)}</span><span class="mk">${mark}</span><span class="who">${sub}</span></div>`;
    }).join('')}</section>`;
  }
  if (detailTab === 'lineup') {
    if (!s.lineups.length || !s.lineups.some(l => l.players.some(p => p.starter))) {
      return `<div class="empty"><p>Line-up biasanya muncul sekitar 1 jam sebelum kick-off.</p></div>`;
    }
    const order = s.lineups.slice().sort((a, b) => (a.side === m.us ? -1 : 1) - (b.side === m.us ? -1 : 1));
    return order.map(l => {
      const t = l.side === 'home' ? m.home : m.away;
      const st = l.players.filter(p => p.starter).sort((a, b) => a.place - b.place);
      const bench = l.players.filter(p => !p.starter).sort((a, b) => (b.inn - a.inn) || (Number(a.num) - Number(b.num)));
      const row = p => `<div class="lp"><span class="numdot">${esc(p.num)}</span><span class="grow">${esc(p.name)}</span>${p.starter ? `<small class="pos">${esc(p.pos)}</small>` : ''}${p.out ? `<span class="subk out" title="Diganti">${icon('i-sub')}</span>` : p.inn ? `<span class="subk in" title="Masuk">${icon('i-sub')}</span>` : ''}</div>`;
      return `<section class="card">
        <div class="card-h">${crest(t, 24)}<h2>${esc(t.name)}</h2><span class="fm num">${esc(l.formation)}</span></div>
        ${st.map(row).join('')}
        ${bench.length ? `<h4 class="bench">Cadangan</h4>${bench.map(row).join('')}` : ''}
      </section>`;
    }).join('');
  }
  if (detailTab === 'stat') {
    const h = s.stats.home, a = s.stats.away;
    if (!h || !a) return `<div class="empty"><p>Statistik belum tersedia.</p></div>`;
    const rows = STATS.filter(([k]) => h[k] != null && a[k] != null && h[k] !== '' ).map(([k, label, f]) => {
      const hv = Number(h[k]) || 0, av = Number(a[k]) || 0, tot = hv + av || 1;
      const fmt = f || (v => v);
      return `<div class="st"><div class="st-v"><b class="num">${esc(fmt(h[k]))}</b><span>${label}</span><b class="num">${esc(fmt(a[k]))}</b></div>
        <div class="st-b"><i class="${hv >= av ? 'lead' : ''} ${m.us === 'home' ? 'us' : ''}" style="width:${(hv / tot) * 100}%"></i><i class="${av >= hv ? 'lead' : ''} ${m.us === 'away' ? 'us' : ''}" style="width:${(av / tot) * 100}%"></i></div></div>`;
    }).join('');
    return `<section class="card stats"><div class="st-h">${crest(m.home, 22)}<span></span>${crest(m.away, 22)}</div>${rows}</section>`;
  }
  // form
  if (!s.form.length) return `<div class="empty"><p>Data form belum tersedia.</p></div>`;
  const order = s.form.slice().sort((x, y) => (x.side === m.us ? -1 : 1) - (y.side === m.us ? -1 : 1));
  return order.map(t => {
    const team = t.side === 'home' ? m.home : m.away;
    return `<section class="card">
      <div class="card-h">${crest(team, 24)}<h2>${esc(team.name)}</h2><span class="form">${t.games.slice().reverse().map(g => resChip(g.res)).join('')}</span></div>
      ${t.games.map(g => `<div class="row"><span class="dt sm"><b class="num">${fDnum.format(g.date)}</b><small>${esc(new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(g.date))}</small></span>
        <span class="grow"><b>${g.at === '@' ? '@ ' : 'vs '}${esc(g.opp)}</b><small>${esc(g.comp)}</small></span><span class="sc num">${esc(g.score)}</span>${resChip(g.res)}</div>`).join('')}
    </section>`;
  }).join('');
}

// ---------- event ----------
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-league],[data-dtab],[data-act]');
  if (!t) return;
  if (t.dataset.tab) { location.replace('#/jadwal' + (t.dataset.tab === 'hasil' ? '/hasil' : '')); return; }
  if (t.dataset.league) { location.replace('#/klasemen/' + t.dataset.league); return; }
  if (t.dataset.dtab) {
    detailTab = t.dataset.dtab;
    document.querySelectorAll('[data-dtab]').forEach(b => { const on = b.dataset.dtab === detailTab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    if (renderMatch.last) $('dbody').innerHTML = detailBody(renderMatch.last);
    return;
  }
  const act = t.dataset.act;
  if (act === 'retry') { render({ fresh: true }); }
  if (act === 'back') { e.preventDefault(); if (history.length > 1 && sessionStorage.getItem('md_nav')) history.back(); else location.replace('#/'); }
  if (act === 'copy-ics') {
    navigator.clipboard.writeText(ICS_URL).then(() => snack('Link kalender disalin'), () => snack(ICS_URL));
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
        if (w.state === 'installed' && navigator.serviceWorker.controller) snack('Versi baru siap, buka ulang aplikasi');
      });
    });
  }).catch(() => {});
}
console.log('Matchday v' + VERSION);
