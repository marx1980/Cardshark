// ===================== TABLIĆ UI (offline vs bots and online, one screen) =====================
const TablicUI = (() => {
  const T = Tablic;
  let api, root = null, cur = null, mode = null, st = null, askRes = null, selC = null, selT = new Set(), chain = Promise.resolve(),
    tok = 0, levels = [], offNames = [], ctx = null, away = false, myReq = false, idleTimer = 0, nextRes = null, lastEnd = null;
  class Abort extends Error {}
  const TX = {
    hr: { name: 'Tablić', players: 'Igrači', target: 'Do', we: 'Mi', they: 'Oni', you: 'Ti', partner: 'Partner', stock: 'Špil', pile: 'Hrpa', take: 'Uzmi', lay: 'Ostavi', clear: 'Poništi',
      yourTurn: 'Tvoj potez', thinking: n => `${n} igra…`, tabla: 'TABLA!', round: 'Runda', cards: 'Karte', pts: 'Bodovi', most: 'Najviše', tablas: 'Table', total: 'Ukupno', next: 'Dalje',
      won: 'Pobjeda!', lost: 'Poraz', again: 'Nova igra', home: 'Početna', n2: '2', n3: '3', n4: '4 · parovi', bad: 'Ne ide', sum: 'Zbroj se ne slaže', roundN: r => `${r}. runda`, level: 'Razina' },
    en: { name: 'Tablić', players: 'Players', target: 'To', we: 'We', they: 'They', you: 'You', partner: 'Partner', stock: 'Stock', pile: 'Pile', take: 'Take', lay: 'Lay down', clear: 'Clear',
      yourTurn: 'Your turn', thinking: n => `${n} is playing…`, tabla: 'TABLA!', round: 'Round', cards: 'Cards', pts: 'Points', most: 'Most', tablas: 'Tablas', total: 'Total', next: 'Next',
      won: 'You won!', lost: 'You lost', again: 'New game', home: 'Home', n2: '2', n3: '3', n4: '4 · pairs', bad: 'Not allowed', sum: 'The sum does not match', roundN: r => `Round ${r}`, level: 'Level' }
  };
  const tx = () => TX[api.S.lang === 'hr' ? 'hr' : 'en'];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const $ = s => root.querySelector(s);
  const mul = () => api.S.speed === 'slow' ? 1.6 : api.S.speed === 'fast' ? 0.55 : 1;
  const sleep = ms => { const t = tok; return new Promise((res, rej) => setTimeout(() => t === tok ? res() : rej(new Abort()), ms * mul())); };
  const face = c => Cards.frFace(T.key(c), api.S.fDeck);
  const cardH = (c, cls = '') => `<div class="tbc ${cls}" data-id="${c.id}">${face(c)}</div>`;
  function init(a) { api = a; }
  const SPOTS = { 2: { 1: [50, 14] }, 3: { 1: [84, 26], 2: [16, 26] }, 4: { 1: [88, 50], 2: [50, 14], 3: [12, 50] } };

  const nameOf = i => i === 0 ? tx().you : mode === 'net' ? api.botName((ctx.names || {})[i] || '') : api.botName(offNames[i] || '');
  function show() {
    root = document.querySelector('#tablic');
    for (const id of ['#home', '#table', '#sol', '#uno', '#poker', '#remi', '#bridge', '#gin']) { const el = document.querySelector(id); if (el) el.hidden = true; }
    root.hidden = false; root.style.setProperty('--rr', Cards.frRatio(api.S.fDeck));
    root.innerHTML = `<header class="ubar"><button class="ib" id="tbHome" aria-label="${api.L().sol.home}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="chip score" id="tbScore"></div>
      <button class="ib" id="tbLast" aria-label="${api.L().lastTrick}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/></svg></button>
      <button class="ib" id="tbOpts" aria-label="${api.L().rules}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg></button>
      <button class="ib" id="tbSet" aria-label="${api.L().settings}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button></header>
      <div class="tbboard"><div class="tbopps" id="tbOpps"></div><div class="tbtable" id="tbTable"></div><div class="tbinfo" id="tbInfo"></div></div>
      <div class="tbstatus" id="tbStatus"></div><div class="tbact" id="tbAct"></div><div class="tbhand" id="tbHand"></div>`;
    $('#tbHome').onclick = leave;
    $('#tbOpts').onclick = () => api.showRules('a');
    $('#tbLast').onclick = lastCapSheet;
    $('#tbSet').onclick = () => api.showOpts('a');
    $('#tbHand').onclick = e => { const el = e.target.closest('.tbc'); if (el) tapHand(el.dataset.id); };
    $('#tbTable').onclick = e => { const el = e.target.closest('.tbc'); if (el) tapTable(el.dataset.id); };
    $('#tbAct').onclick = e => { const b = e.target.closest('button'); if (b) act(b.dataset.a); };
  }
  function leave() {
    tok++; clearTimeout(idleTimer); away = false; const a = document.querySelector('#awayPill'); if (a) a.remove();
    if (root) root.hidden = true;
    if (mode === 'net' && ctx) { ctx.leave(); } else api.showHome();
    mode = null;
  }

  // ---------------------------------------------------------------- selection and moves
  const tapHand = id => { if (!myReq) return; selC = selC === id ? null : id; selT.clear(); render(); };
  const tapTable = id => { if (!myReq || !selC) return; selT.has(id) ? selT.delete(id) : selT.add(id); render(); };
  const handCard = id => cur && cur.hand.find(c => c.id === id);
  function selTake() { return [...selT].map(id => cur.table.find(c => c.id === id)).filter(Boolean); }
  function act(a) {
    if (!myReq || !selC) return;
    if (a === 'clear') { selT.clear(); render(); return; }
    const card = handCard(selC), take = selTake();
    if (!card) return;
    if (a === 'take' && !T.validTake(card, take)) { api.toast(tx().sum); return; }
    submit({ card: card.id, take: a === 'take' ? take.map(c => c.id) : [] });
  }
  function submit(mv) {
    myReq = false; selC = null; selT.clear(); clearTimeout(idleTimer);
    if (mode === 'net') ctx.send({ a: 'move', card: mv.card, take: mv.take });
    else if (askRes) { const r = askRes; askRes = null; r(mv); }
    render();
  }

  // ---------------------------------------------------------------- drawing
  function render() {
    { const s = root && root.querySelector('#tbSet'); if (s) s.style.display = mode === 'net' ? 'none' : ''; }
    { const l = root && root.querySelector('#tbLast'); if (l) l.style.display = api.S['last_a'] === false ? 'none' : ''; }
    if (!cur || !root) return;
    const t = tx(), v = cur, n = v.n;
    // score chip
    if (n === 4) $('#tbScore').innerHTML = `<span>${t.we}</span><b>${v.scores[0]}</b><small>:</small><b>${v.scores[1]}</b><span>${t.they}</span><small>/ ${v.opts.target}</small>`;
    else $('#tbScore').innerHTML = `<span>${t.you}</span><b>${v.scores[0]}</b><small>/ ${v.opts.target}</small>`;
    // opponents
    const opps = $('#tbOpps'); opps.className = `tbopps n${n}`; opps.replaceChildren();
    for (let i = 1; i < n; i++) {
      const [x, y] = SPOTS[n][i], o = document.createElement('div');
      const turnNow = v.turn === i;
      o.className = `tbopp${turnNow ? ' turn' : ''}${n === 4 && i === 2 ? ' partner' : ''}`; o.dataset.s = i; o.style.setProperty('--x', x); o.style.setProperty('--y', y);
      const backs = Array.from({ length: Math.min(v.counts[i], 6) }, () => `<span class="tbback">${Cards.frBack(api.S.fDeck, api.S.fBack)}</span>`).join('');
      const sc = n === 4 ? '' : `<b class="tbsc">${v.scores[i]}</b>`;
      o.innerHTML = `<div class="tbcnt">${backs}</div><b class="tbnm">${esc(nameOf(i))}</b>${n === 4 && i === 2 ? `<small>${t.partner}</small>` : ''}<span class="tbrow"><small class="tbpl"><i class="tbpi"></i>${v.piles[i] || 0}</small>${sc}</span>`;
      opps.append(o);
    }
    // table
    const tb = $('#tbTable'); tb.className = `tbtable n${n}`;
    const card = selC && handCard(selC);
    tb.innerHTML = v.table.map(c => cardH(c, selT.has(c.id) ? 'sel' : '')).join('') || '<span class="tbempty"></span>';
    $('#tbInfo').innerHTML = `<span id="tbStock">${t.stock} <b>${v.stock}</b></span><span id="tbMyPile">${t.pile} <b>${v.piles[0] || 0}</b></span>`;
    // my hand
    const hand = $('#tbHand'), W = root.clientWidth || 360, k = v.hand.length;
    const cw = Math.max(40, Math.min(64, Math.floor((W - 16) / (1 + 0.62 * Math.max(0, k - 1)))));
    hand.style.setProperty('--cw', cw + 'px'); hand.style.height = `calc(var(--cw) * var(--rr) + 18px)`;
    const total = cw + (k - 1) * cw * 0.62, left = (W - total) / 2;
    hand.innerHTML = v.hand.map((c, i) => `<div class="tbc${selC === c.id ? ' sel' : ''}${myReq ? '' : ' wait'}" data-id="${c.id}" style="left:${left + i * cw * 0.62}px">${face(c)}</div>`).join('');
    // status + actions
    const st_ = $('#tbStatus'), mine = v.turn === 0 && myReq;
    st_.className = `tbstatus${mine ? ' yt' : ''}`;
    st_.textContent = v.turn === 0 ? t.yourTurn : v.turn === null || v.turn === undefined ? '' : t.thinking(nameOf(v.turn));
    const bar = $('#tbAct');
    if (myReq && card) {
      const sel = selTake(), ok = sel.length && T.validTake(card, sel);
      const sum = sel.reduce((a, c) => a + (c.r === 1 ? 1 : T.val(c)), 0), aces = sel.filter(c => c.r === 1).length;
      const sumTxt = sel.length ? `<span class="tbsum${ok ? ' ok' : ''}">Σ ${sum}${aces ? ' / ' + (sum + 10 * aces) : ''}</span>` : '';
      bar.innerHTML = `${sumTxt}${sel.length ? `<button class="ubtn" data-a="clear">${t.clear}</button><button class="ubtn pri" data-a="take" ${ok ? '' : 'disabled'}>${t.take}</button>` : `<button class="ubtn pri" data-a="lay">${t.lay}</button>`}`;
    } else bar.innerHTML = '';
  }
  const rectOf = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
  function anchor(rel) {
    const el = rel === 0 ? $('#tbMyPile') : $(`.tbopp[data-s="${rel}"]`);
    const r = el ? rectOf(el) : { left: innerWidth / 2, top: innerHeight / 2, width: 10, height: 10 };
    return { left: r.left + r.width / 2 - 8, top: r.top + r.height / 2 - 12, width: 16, height: 24 };
  }
  function fly(html, from, to, ms) {
    const el = document.createElement('div'); el.className = 'tbfly'; el.innerHTML = html;
    el.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`; document.body.appendChild(el);
    const s = to.width / from.width, dx = to.left - from.left, dy = to.top - from.top;
    const an = el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: .9 }], { duration: ms * mul(), easing: 'ease-in-out', fill: 'forwards' });
    return an.finished.catch(() => { }).then(() => el.remove());
  }
  function bubble(text) {
    const b = document.createElement('div'); b.className = 'tbbub'; b.textContent = text; $('.tbboard').append(b); setTimeout(() => b.remove(), 1500 * mul());
  }

  // ---------------------------------------------------------------- events (queued, so animations never overlap)
  const enqueue = fn => { const t = tok; chain = chain.then(() => t === tok ? fn() : null).catch(e => { if (!(e instanceof Abort)) console.error(e); }); return chain; };
  async function handle(ev, v) {
    if (!root || root.hidden) return;
    if (ev.k === 'deal') { selC = null; selT.clear(); cur = v; render(); return; }
    if (ev.k === 'turn') { cur = v; render(); return; }
    if (ev.k === 'play') return onPlay(ev, v);
    if (ev.k === 'handEnd') { lastEnd = { ev, v }; cur = v; render(); if (!ev.over) await handEndSheet(ev, v); return; }
    if (ev.k === 'matchEnd') return matchEnd(ev, v);
    cur = v; render();
  }
  let lastCap = null;
  function lastCapSheet() {
    const t = tx(), html = lastCap
      ? `<h3>${api.L().lastTrick}</h3><div class="lasttr">${lastCap.cards.map(c => `<div class="tbc">${face(c)}</div>`).join('')}</div><p class="muted">${esc(nameOf(lastCap.by))}</p>`
      : `<h3>${api.L().lastTrick}</h3><p>${api.L().noLast}</p>`;
    api.openSheet(`${html}<div class="btns"><button class="pri" id="lx">${api.L().close}</button></div>`, v => v.querySelector('#lx').onclick = api.closeSheet);
  }
  async function onPlay(ev, v) {
    const before = cur || v, c = ev.card, mine = ev.seat === 0;
    const srcEl = mine ? root.querySelector(`#tbHand [data-id="${c.id}"]`) : null;
    const from = srcEl ? rectOf(srcEl) : (() => { const a = anchor(ev.seat); return { left: a.left, top: a.top, width: 34, height: 34 * (parseFloat(getComputedStyle(root).getPropertyValue('--rr')) || 1.5) }; })();
    selC = null; selT.clear();
    cur = { ...v, table: before.table.concat([c]) }; render();
    const el = root.querySelector(`#tbTable [data-id="${c.id}"]`);
    if (el) { el.style.visibility = 'hidden'; await fly(el.innerHTML, from, rectOf(el), 300); el.style.visibility = ''; }
    if (ev.taken.length) {
      lastCap = { cards: [c, ...before.table.filter(x => ev.taken.includes(x.id))], by: ev.seat };
      const els = [c.id, ...ev.taken].map(id => root.querySelector(`#tbTable [data-id="${id}"]`)).filter(Boolean);
      els.forEach(e => e.classList.add('cap'));
      if (ev.tabla) bubble(tx().tabla);
      await sleep(520);
      const to = anchor(ev.seat), rects = els.map(rectOf), htmls = els.map(e => e.innerHTML);
      els.forEach(e => e.style.visibility = 'hidden');
      await Promise.all(rects.map((r, i) => fly(htmls[i], r, to, 340 + i * 40)));
    }
    cur = v; render();
  }
  function resultHTML(ev, v, over) {
    const t = tx(), n = v.n, labels = n === 4 ? [t.we, t.they] : Array.from({ length: n }, (_, i) => nameOf(i));
    const rows = ev.rows.map((r, i) => `<tr${i === 0 ? ' class="w"' : ''}><td>${esc(labels[i])}</td><td>${r.cards}</td><td>${r.cardPts}${r.most ? ` +${r.most}` : ''}</td><td>${r.tablas || '·'}</td><td><b>${ev.scores[i]}</b></td></tr>`).join('');
    const title = over ? (ev.scores[0] === Math.max(...ev.scores) ? t.won : t.lost) : t.roundN(v.round);
    return `<h3>${title}</h3><table class="pis utab"><thead><tr><th></th><th>${t.cards}</th><th>${t.pts}</th><th>${t.tablas}</th><th>${t.total}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function handEndSheet(ev, v) {
    const t = tx(), html = resultHTML(ev, v, false);
    return new Promise(res => {
      if (mode === 'net') {
        api.openSheet(`${html}<div class="btns"><button class="pri" id="tbNext">${t.next}</button></div>`, s => {
          s.querySelector('#tbNext').onclick = () => { ctx.send({ a: 'next' }); const b = s.querySelector('#tbNext'); b.disabled = true; b.textContent = api.L().waitOthers(Math.max(1, ctx.nextN || 0), ctx.nextOf || 2); };
        });
        res();   // the table carries on when the server says so (the sheet is closed by the next deal)
      } else {
        api.openSheet(`${html}<div class="btns"><button class="pri" id="tbNext">${t.next}</button></div>`, s => { s.querySelector('#tbNext').onclick = () => { api.closeSheet(); if (nextRes) { const r = nextRes; nextRes = null; r(); } }; });
        res();
      }
    });
  }
  async function matchEnd(ev, v) {
    const t = tx(), won = ev.winner === 0;
    const html = lastEnd ? resultHTML(lastEnd.ev, lastEnd.v, true) : `<h3>${won ? t.won : t.lost}</h3>`;
    if (mode === 'net') { if (ctx.matchDone) ctx.matchDone(); }
    else { clearSave(); record(won); }
    await api.fx(won, { cards: won ? [] : [...root.querySelectorAll('#tbTable .tbc')], stats: html });
    const btns = mode === 'net'
      ? `<button class="sec" id="tbX">${t.home}</button><button class="sec" id="tbT">${api.L().tables}</button><button class="pri" id="tbA">${api.L().playAgain}</button>`
      : `<button class="sec" id="tbX">${t.home}</button><button class="pri" id="tbA">${t.again}</button>`;
    api.openSheet(`${html}<p class="muted" id="ratingLine">${ctx && ctx.rating ? `${api.L().rating} ${ctx.rating.r} (${ctx.rating.d >= 0 ? '+' : ''}${ctx.rating.d})` : ''}</p><div class="btns">${btns}</div>`, s => {
      s.querySelector('#tbX').onclick = () => { api.closeSheet(); leave(); };
      const T2 = s.querySelector('#tbT'); if (T2) T2.onclick = () => { api.closeSheet(); leave(); ctx.lobby('a'); };
      s.querySelector('#tbA').onclick = () => {
        if (mode === 'net') { ctx.send({ a: 'again' }); const b = s.querySelector('#tbA'); b.disabled = true; b.textContent = api.L().waitOthers(1, ctx.againOf || 1); }
        else { api.closeSheet(); start(); }
      };
    });
  }

  // ---------------------------------------------------------------- offline match
  const ckpt = at => { if (!st) return; api.S.tablicSave = { st: JSON.stringify(st), at, levels, names: offNames, t: Date.now() }; api.save(); };
  const clearSave = () => { if (api.S.tablicSave) { api.S.tablicSave = null; api.save(); } };
  const hasSaved = () => !!(api && api.S.tablicSave);
  function record(won) { const S = api.S; S.tablicStats = S.tablicStats || {}; const r = S.tablicStats[levels[1]] = S.tablicStats[levels[1]] || [0, 0]; r[won ? 0 : 1]++; api.save(); }
  function makeHost(opts, saved) {
    const h = {
      opts, saved, st: null, turn: null, fromHuman: false,
      io: {
        sleep: ms => sleep(ms), level: s => levels[s], send: (seat, m) => { if (m.t === 'reject') api.toast(tx().bad); },
        waitNext: () => new Promise(res => { nextRes = res; })
      },
      emit(ev) { const v = T.view(h.st, 0); v.turn = h.turn === null ? null : h.turn; const t_ = tok; enqueue(() => handle(ev, v)); },
      checkpoint: async at => ckpt(at),
      async getAction(seat, req, bot) {
        h.fromHuman = false;
        if (seat === 0) {
          await chain;   // the table has caught up with the game
          const tk = (+api.S.takeover || 0) * 1000, my = tok;
          const a = await new Promise(res => {
            askRes = res; myReq = true; selC = null; selT.clear(); render();
            const arm = () => { clearTimeout(idleTimer); if (tk) idleTimer = setTimeout(() => { if (askRes === res) { askRes = null; myReq = false; render(); res(null); } }, tk); };
            arm(); root.onpointerdown = arm;
          });
          if (my !== tok) throw new Abort();
          if (a) { h.fromHuman = true; return a; }
          return bot();
        }
        await sleep(650 + Math.random() * 350);
        return bot();
      }
    };
    return h;
  }
  function begin(saved) {
    api.closeSheet(); show(); mode = 'off'; chain = Promise.resolve(); cur = null; lastEnd = null; tok++; myReq = false;
    const S = api.S;
    if (!saved) {
      clearSave();
      const n = [2, 3, 4].includes(+S.aPlayers) ? +S.aPlayers : 2;
      levels = [null]; for (let i = 1; i < n; i++) levels.push(S.aLevel || 'cardshark');
      if (n === 4) levels[2] = S.aPartner || S.aLevel || 'cardshark';
      levels[0] = n === 4 ? levels[2] : levels[1];
      const pick = {}; for (let i = 1; i < n; i++) pick[i] = levels[i]; const pn = api.pickBotNames(pick); offNames = [null]; for (let i = 1; i < n; i++) offNames.push(pn[i]);
      st = null;
    } else { levels = saved.levels; offNames = saved.names; }
    const opts = saved ? JSON.parse(saved.st).opts : { players: S.aPlayers || 2, target: S.aTarget || 101 };
    const host = makeHost(opts, saved ? { st: saved.st, at: saved.at } : null);
    const my = tok;
    const wrap = { get st() { return host.st; } };
    Object.defineProperty(host, 'st', { get() { return st; }, set(v) { st = v; } });
    T.run(host).catch(e => { if (!(e instanceof Abort)) console.error(e); });
  }
  const start = () => begin(null);
  const resume = () => begin(api.S.tablicSave);

  // ---------------------------------------------------------------- online (messages from the server arrive through onNet)
  function onNet(m, c) {
    ctx = c; mode = 'net';
    if (m.t === 'start') { show(); chain = Promise.resolve(); cur = null; lastEnd = null; myReq = false; tok++; if (m.names) ctx.names = m.names; api.closeSheet(); return; }
    if (!root || root.hidden) { if (m.t === 'state' || m.t === 'ev') show(); else return; }
    if (m.names) ctx.names = m.names;
    if (m.t === 'state') { cur = m.view; selC = null; selT.clear(); render(); return; }
    if (m.t === 'ev') {
      if (m.ev.k === 'deal') { api.closeSheet(); ctx.nextN = 0; }
      const v = m.view; enqueue(() => handle(m.ev, v)); return;
    }
    if (m.t === 'ask') { enqueue(() => { away = false; const a = document.querySelector('#awayPill'); if (a) a.remove(); myReq = true; selC = null; selT.clear(); render(); }); return; }
    if (m.t === 'away') { myReq = false; render(); showAway(); return; }
    if (m.t === 'reject') { api.toast(tx().bad); myReq = true; render(); return; }
    if (m.t === 'bots') { ctx.botSeats = m.seats; return; }
    if (m.t === 'rating') { ctx.rating = m.change; const el = document.querySelector('#ratingLine'); if (el && m.change) el.textContent = `${api.L().rating} ${m.change.r} (${m.change.d >= 0 ? '+' : ''}${m.change.d})`; return; }
    if (m.t === 'next') { ctx.nextN = m.n; ctx.nextOf = m.of; const b = document.querySelector('#tbNext'); if (b && b.disabled) b.textContent = api.L().waitOthers(m.n, m.of); return; }
    if (m.t === 'again') { ctx.againOf = m.of; const b = document.querySelector('#tbA'); if (b && b.disabled) b.textContent = api.L().waitOthers(m.n, m.of); return; }
    if (m.t === 'error') { api.toast(String(m.msg || 'error')); return; }
  }
  function showAway() {
    let el = document.querySelector('#awayPill');
    if (!el) { el = document.createElement('button'); el.id = 'awayPill'; root.appendChild(el); }
    el.innerHTML = `<span class="ap-s">${api.L().botPlays}</span><b>${api.L().takeOver}</b>`;
    el.onclick = () => { ctx.send({ a: 'back' }); el.remove(); };
  }
  return { init, start, resume, hasSaved, onNet, tx, TX, get state() { return st; } };
})();
if (typeof module !== 'undefined') module.exports = TablicUI;
