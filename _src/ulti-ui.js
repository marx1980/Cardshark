// ===================== ULTI UI (offline vs bots and online, one screen) =====================
const UltiUI = (() => {
  const U = Ulti;
  let api, root = null, cur = null, mode = null, st = null, askRes = null, chain = Promise.resolve(), tok = 0, levels = [], offNames = [], ctx = null,
    myReq = null, idleTimer = 0, nextRes = null, lastEnd = null, selD = new Set(), selK = new Set(), selB = {}, shownTrick = null;
  class Abort extends Error {}
  const TX = {
    hr: { name: 'Ulti', you: 'Ti', pass: 'Pas', take: 'Uzmi talon', bid: 'Licitiraj', deal: (n, m) => `Igra ${n}/${m}`, yourTurn: 'Tvoj potez', bidding: n => `${n} licitira…`, playing: n => `${n} igra…`, waitingFor: n => `${n} odlučuje…`,
      pickDis: 'Odaberi 2 karte za odbaciti i licitaciju', takeQ: 'Uzmi talon ili pas?', declareT: 'Odaberi adut', kontraQ: 'Kontra?', next: 'Dalje', won: 'Pobjeda!', lost: 'Poraz', again: 'Nova igra', home: 'Početna',
      made: 'Ispunjeno', down: 'Pad', total: 'Ukupno', declarer: 'Igrač', tricks: 'Štihovi', points: 'Bodovi', def: 'Obrana', silent: 'Tihi bonus', talonL: 'Talon', noTrump: 'Bez aduta', value: 'Vrijednost', open: 'Otvoreno',
      comp: { P: 'Parti', F: '40-100', T: '20-100', U: 'Ulti', A: '4 asa', D: 'Durchmars', B: 'Betli' }, red: 'Piros ♥', openL: 'Terített', ntD: 'Durchmars bez aduta', ntB: 'Betli', kontraL: ['Kontra', 'Rekontra', 'Subkontra', 'Hirskontra', 'Mordkontra', 'Mordrekontra'], kontra: 'Kontra',
      sil: { U: 'Ulti', D: 'Durchmars', A: '4 asa', H: '100' }, err: { bad: 'Ne ide', follow: 'Ne smiješ ovu kartu', bid: 'Ta licitacija nije moguća', turn: 'Nisi na redu', discard: 'Odaberi 2 karte', take: 'Prvo uzmi talon' },
      f: { deals: 'Dijeljenja', kontra: 'Kontra', red: 'Piros (♥) duplo', aces: 'Licitacija 4 asa', silent: 'Tihi bonusi', open: 'Otvoreni betli i durchmars', overtake: 'Obvezno nadbiti', hold7: 'Zadrži adutsku 7 za ulti' },
      v: { on: 'Da', off: 'Ne', one: 'Kontra + rekontra', full: 'Do kraja' } },
    en: { name: 'Ulti', you: 'You', pass: 'Pass', take: 'Take talon', bid: 'Bid', deal: (n, m) => `Deal ${n}/${m}`, yourTurn: 'Your turn', bidding: n => `${n} is bidding…`, playing: n => `${n} is playing…`, waitingFor: n => `${n} is deciding…`,
      pickDis: 'Pick 2 cards to discard and a bid', takeQ: 'Take the talon or pass?', declareT: 'Choose trumps', kontraQ: 'Double?', next: 'Next', won: 'You won!', lost: 'You lost', again: 'New game', home: 'Home',
      made: 'Made', down: 'Down', total: 'Total', declarer: 'Declarer', tricks: 'Tricks', points: 'Points', def: 'Defence', silent: 'Silent bonus', talonL: 'Talon', noTrump: 'No trumps', value: 'Value', open: 'Open',
      comp: { P: 'Parti', F: '40-100', T: '20-100', U: 'Ulti', A: 'Four aces', D: 'Durchmars', B: 'Betli' }, red: 'Piros ♥', openL: 'Open', ntD: 'Durchmars (no trumps)', ntB: 'Betli', kontraL: ['Kontra', 'Rekontra', 'Subkontra', 'Hirskontra', 'Mordkontra', 'Mordrekontra'], kontra: 'Double',
      sil: { U: 'Ulti', D: 'Durchmars', A: 'Four aces', H: '100' }, err: { bad: 'Not allowed', follow: 'You can’t play that card', bid: 'That bid is not possible', turn: 'Not your turn', discard: 'Pick 2 cards', take: 'Take the talon first' },
      f: { deals: 'Deals', kontra: 'Kontra', red: 'Piros (♥) counts double', aces: 'Four-aces bid', silent: 'Silent bonuses', open: 'Open betli & durchmars', overtake: 'Must beat the trick', hold7: 'Hold the trump 7 for ulti' },
      v: { on: 'On', off: 'Off', one: 'Kontra + rekontra', full: 'Up to the end' } }
  };
  const tx = () => TX[api.S.lang === 'hr' ? 'hr' : 'en'];
  const PFX = 'ul_';
  // settings rows: [{k, label, vals:[[value,label]], cur}]; booleans are stored as 'on' / 'off'
  function rows(get) {
    const t = tx(), raw = {}; for (const f of U.SCHEMA) raw[f.k] = get(PFX + f.k);
    const c = U.cleanOpts(raw);
    return U.SCHEMA.map(f => f.bool
      ? { k: PFX + f.k, label: t.f[f.k], vals: [['on', t.v.on], ['off', t.v.off]], cur: c[f.k] ? 'on' : 'off' }
      : { k: PFX + f.k, label: t.f[f.k], vals: f.vals.map(x => [x, f.k === 'deals' ? String(x) : t.v[x]]), cur: c[f.k] });
  }
  const optsFrom = get => { const raw = {}; for (const f of U.SCHEMA) raw[f.k] = get(PFX + f.k); return U.cleanOpts(raw); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const $ = s => root.querySelector(s);
  const mul = () => api.S.speed === 'slow' ? 1.6 : api.S.speed === 'fast' ? 0.55 : 1;
  const sleep = ms => { const t = tok; return new Promise((res, rej) => setTimeout(() => t === tok ? res() : rej(new Abort()), ms * mul())); };
  const face = c => Cards.face('h', c);
  const suitI = (s, n = 16) => s === null || s === undefined ? '' : `<span class="ulsu">${Cards.suitIcon('h', s, n)}</span>`;
  const bidOf = (id, o) => U.bidsFor(o || (cur && cur.opts) || U.cleanOpts({})).by[id];
  function bidName(b) {
    const t = tx(); if (!b) return '';
    if (b.nt) return b.comps[0] === 'B' ? (b.open ? `${t.openL} ` : '') + t.ntB : (b.open ? `${t.openL} ` : '') + t.ntD;
    const names = b.comps.map(c => t.comp[c]);
    return (b.red ? '♥ ' : '') + (b.open ? `${t.openL} ` : '') + names.join(' + ');
  }
  const bidTag = id => { const b = bidOf(id); return b ? `${bidName(b)} <small>${b.value}</small>` : ''; };
  function init(a) { api = a; }
  const nameOf = i => i === 0 ? tx().you : mode === 'net' ? api.botName((ctx.names || {})[i] || '') : api.botName(offNames[i] || '');
  const POS = { 1: 'left', 2: 'right' }, TPOS = ['b', 'l', 'r'];

  function show() {
    root = document.querySelector('#ulti');
    for (const id of ['#home', '#table', '#sol', '#uno', '#poker', '#remi', '#tablic', '#gin', '#bridge', '#pref']) { const el = document.querySelector(id); if (el) el.hidden = true; }
    root.hidden = false; root.style.setProperty('--rr', Cards.ratio('h'));
    root.innerHTML = `<header class="ubar"><button class="ib" id="ulHome" aria-label="${api.L().sol.home}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="chip score" id="ulScore"></div>
      <button class="ib" id="ulLast" aria-label="${api.L().lastTrick}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/></svg></button>
      <button class="ib" id="ulRules" aria-label="${api.L().rules}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg></button>
      <button class="ib" id="ulSet" aria-label="${api.L().settings}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button></header>
      <div class="brctr" id="ulCtr"></div>
      <div class="brauc prauc" id="ulAuc" hidden></div><div class="propen" id="ulOpen" hidden></div>
      <div class="brboard"><div class="brseats" id="ulSeats"></div><div class="brtrick" id="ulTrick"></div></div>
      <div class="tbstatus" id="ulStatus"></div><div class="brbox" id="ulBox"></div><div class="brhand" id="ulHand"></div>`;
    $('#ulHome').onclick = leave; $('#ulRules').onclick = () => api.showRules('i'); $('#ulLast').onclick = lastTrickSheet; $('#ulSet').onclick = () => api.showOpts('i');
    $('#ulHand').onclick = e => { const el = e.target.closest('.tbc'); if (el) handTap(el.dataset.id); };
    $('#ulBox').onclick = e => { const b = e.target.closest('button'); if (b) boxTap(b); };
  }
  function leave() {
    tok++; clearTimeout(idleTimer); const a = document.querySelector('#awayPill'); if (a) a.remove();
    if (root) root.hidden = true;
    if (mode === 'net' && ctx) ctx.leave(); else api.showHome();
    mode = null;
  }

  // ---------------------------------------------------------------- moves
  const curBid = () => { const o = (cur && cur.opts) || U.cleanOpts({}); return U.bidsFor(o).by[U.compose(selB).id]; };
  const bidLegal = () => { const b = curBid(); return !!b && selD.size === 2 && (!cur.high || b.rank > bidOf(cur.high.id).rank); };
  function toggle(k) {
    const s = selB;
    if (k === 'B' || k === 'D0') { const n = k === 'B' ? 'B' : 'D'; if (s.nt === n) s.nt = undefined; else { Object.assign(s, { nt: n, red: false, F: false, T: false, U: false, A: false, D: false }); } return; }
    if (k === 'open') { s.open = !s.open; return; }
    s.nt = undefined; s[k] = !s[k];
    if (s[k] && k === 'F') s.T = false; if (s[k] && k === 'T') s.F = false;
    if (s[k] && k === 'D') s.A = false; if (s[k] && k === 'A') s.D = false;
  }
  function boxTap(b) {
    if (!myReq) return;
    const a = b.dataset.a, k = myReq.kind;
    if (k === 'bid') {
      if (a === 'take') return submit({ act: 'take' });
      if (a === 'pass') return submit({ act: 'pass' });
      if (a === 'tg') { toggle(b.dataset.v); render(); return; }
      if (a === 'bid') { if (bidLegal()) submit({ act: 'bid', id: curBid().id, discard: [...selD] }); else api.toast(tx().err.bid); return; }
    }
    if (k === 'declare' && a === 'trump') return submit({ act: 'declare', trump: +b.dataset.v });
    if (k === 'kontra') {
      if (a === 'pass') return submit({ act: 'pass' });
      if (a === 'kc') { const c = b.dataset.v; selK.has(c) ? selK.delete(c) : selK.add(c); render(); return; }
      if (a === 'kontra' && selK.size) return submit({ act: 'kontra', comps: [...selK] });
    }
  }
  function handTap(id) {
    if (!myReq) return;
    if (myReq.kind === 'bid' && cur.took) { selD.has(id) ? selD.delete(id) : (selD.size < 2 && selD.add(id)); render(); return; }
    if (myReq.kind !== 'play') return;
    const x = U.ctxOf({ ...cur, declarer: cur.declarer === 0 ? 0 : -1, bidId: cur.bidId, opts: cur.opts, trump: cur.trump, trickNo: cur.trickNo }, 0);
    if (!U.legalPlays(cur.hand, cur.trick, x).some(c => c.id === id)) { api.toast(tx().err.follow); return; }
    submit({ act: 'play', card: id });
  }
  function submit(mv) {
    myReq = null; selD = new Set(); selK = new Set(); clearTimeout(idleTimer);
    if (mode === 'net') ctx.send({ a: 'move', ...mv });
    else if (askRes) { const r = askRes; askRes = null; r(mv); }
    render();
  }

  // ---------------------------------------------------------------- drawing
  function render() {
    { const s = root && root.querySelector('#ulSet'); if (s) s.style.display = mode === 'net' ? 'none' : ''; }
    { const l = root && root.querySelector('#ulLast'); if (l) l.style.display = api.S['last_i'] === false ? 'none' : ''; }
    if (!cur || !root) return;
    const t = tx(), v = cur, b = v.bidId ? bidOf(v.bidId) : null;
    $('#ulScore').innerHTML = `<span>${t.you}</span><b>${v.scores[0]}</b><small>${v.deal}/${v.deals}</small>`;
    const ctr = $('#ulCtr'), won = [0, 1, 2].map(i => `<span>${i === 0 ? t.you : esc(nameOf(i))} <b>${v.won[i]}</b></span>`).join('');
    if (b && v.phase !== 'bid') ctr.innerHTML = `<span class="brct">${bidName(b)}</span>${b.nt ? '' : suitI(v.trump, 18)}${v.kon && Object.keys(v.kon.lv).length ? `<span class="brct">${Object.entries(v.kon.lv).map(([c, l]) => `${t.comp[c]} ×${2 ** l}`).join(' ')}</span>` : ''}<span>${t.declarer}: <b>${esc(nameOf(v.declarer))}</b></span>${v.phase === 'play' || v.phase === 'done' ? won : ''}`;
    else ctr.innerHTML = `<span>${t.deal(v.deal, v.deals)}</span>${v.high ? `<span class="brct">${bidName(bidOf(v.high.id))}</span><span><b>${esc(nameOf(v.high.seat))}</b></span>` : ''}`;
    const seats = $('#ulSeats'); seats.replaceChildren();
    for (let i = 1; i < 3; i++) {
      const o = document.createElement('div'), n = v.counts[i];
      o.className = `brseat ${POS[i]}${v.turn === i ? ' turn' : ''}`; o.dataset.s = i;
      const backs = Array.from({ length: Math.min(n, 7) }, () => `<span class="tbback">${Cards.back('h')}</span>`).join('');
      const tag = v.declarer === i && v.phase !== 'bid' ? t.declarer : '';
      o.innerHTML = `<div class="tbcnt">${backs}</div><b class="tbnm">${esc(nameOf(i))}</b><small>${v.scores[i]}${tag ? ' · ' + tag : ''}</small>`;
      seats.append(o);
    }
    const tr = $('#ulTrick'), trick = shownTrick || v.trick;
    if (v.talon && v.talon.length && v.phase === 'bid' && !trick.length) tr.innerHTML = v.talon.map((c, i) => `<div class="brt ${i ? 'r' : 'l'}"><div class="tbc">${face(c)}</div></div>`).join('');
    else tr.innerHTML = trick.map(x => `<div class="brt ${TPOS[x.seat]}"><div class="tbc" data-id="${x.card.id}">${face(x.card)}</div></div>`).join('');
    const au = $('#ulAuc');
    if (v.phase === 'bid') {
      const last = {}; v.log.forEach(x => { last[x.seat] = x; });
      const cell = s => { const x = last[s]; return !x ? '' : x.act === 'bid' ? bidTag(x.id) : x.act === 'take' ? t.take : t.pass; };
      au.innerHTML = `<div class="brgrid prgrid">${[1, 2, 0].map(s => `<b class="${s === 0 ? 'me' : ''}">${s === 0 ? t.you : esc(nameOf(s))}</b>`).join('')}${[1, 2, 0].map(s => `<span>${cell(s)}</span>`).join('')}</div>`; au.hidden = false;
    } else au.hidden = true;
    const hand = $('#ulHand'), mh = v.hand, W = root.clientWidth || 360, k = mh.length;
    const cw = Math.max(26, Math.min(60, Math.floor((W - 16) / (1 + 0.55 * Math.max(0, k - 1)))));
    hand.style.setProperty('--cw', cw + 'px'); hand.style.height = `calc(var(--cw) * var(--rr) + 16px)`;
    const total = cw + Math.max(0, k - 1) * cw * 0.55, left = (W - total) / 2, play = myReq && myReq.kind === 'play';
    let legal = null;
    if (play) legal = U.legalPlays(mh, v.trick, U.ctxOf({ opts: v.opts, bidId: v.bidId, trump: v.trump, trickNo: v.trickNo, declarer: v.declarer === 0 ? 0 : -1 }, 0)).map(c => c.id);
    hand.innerHTML = mh.map((c, i) => `<div class="tbc${play && !legal.includes(c.id) ? ' dim' : ''}${play && legal.includes(c.id) ? ' ok' : ''}${selD.has(c.id) ? ' sel' : ''}" data-id="${c.id}" style="left:${left + i * cw * 0.55}px">${face(c)}</div>`).join('');
    { const op = $('#ulOpen'); if (v.open && v.open.length) { op.innerHTML = v.open.map(c => `<div class="tbc">${face(c)}</div>`).join(''); op.hidden = false; } else { op.innerHTML = ''; op.hidden = true; } }
    const sEl = $('#ulStatus'); let msg = '';
    if (myReq) msg = myReq.kind === 'bid' ? (v.took ? t.pickDis : t.takeQ) : myReq.kind === 'declare' ? t.declareT : myReq.kind === 'kontra' ? t.kontraQ : t.yourTurn;
    else if (v.turn !== null && v.turn !== undefined && v.turn !== 0) msg = v.phase === 'bid' ? t.bidding(nameOf(v.turn)) : v.phase === 'play' ? t.playing(nameOf(v.turn)) : t.waitingFor(nameOf(v.turn));
    sEl.className = `tbstatus${myReq ? ' yt' : ''}`; sEl.textContent = msg;
    const box = $('#ulBox'), k2 = myReq && myReq.kind;
    if (k2 === 'bid') {
      if (!v.took) box.innerHTML = `<div class="brpx"><button class="ubtn" data-a="pass">${t.pass}</button><button class="ubtn pri" data-a="take">${t.take}</button></div>`;
      else {
        const o = v.opts, s = selB, tg = (k, label, on) => `<button class="ubtn${on ? ' pri' : ''}" data-a="tg" data-v="${k}">${label}</button>`, nt = !!s.nt;
        const cb = curBid(), ok = bidLegal();
        box.innerHTML = `<div class="brgb">${[o.red ? tg('red', t.red, s.red) : '', tg('U', t.comp.U, s.U), tg('F', t.comp.F, s.F), tg('T', t.comp.T, s.T), o.aces ? tg('A', t.comp.A, s.A) : '', tg('D', t.comp.D, s.D)].join('')}</div>
          <div class="brgb">${tg('B', t.ntB, s.nt === 'B')}${tg('D0', t.ntD, s.nt === 'D')}${o.open && (s.D || nt) ? tg('open', t.openL, s.open) : ''}</div>
          <div class="brpx"><button class="ubtn pri" data-a="bid" ${ok ? '' : 'disabled'}>${t.bid}${cb ? ` · ${cb.value}` : ''}</button></div>`;
      }
      box.hidden = false;
    } else if (k2 === 'declare') {
      box.innerHTML = `<div class="brgb">${U.trumpChoices(v.opts).map(s => `<button class="ubtn" data-a="trump" data-v="${s}">${suitI(s, 28)}</button>`).join('')}</div>`; box.hidden = false;
    } else if (k2 === 'kontra') {
      const el = (myReq.comps && myReq.comps.length ? myReq.comps : v.kon.el), lvl = Math.min(5, v.kon.round - 1);
      box.innerHTML = `<div class="brgb">${el.map(c => `<button class="ubtn${selK.has(c) ? ' pri' : ''}" data-a="kc" data-v="${c}">${t.comp[c]}</button>`).join('')}</div>
        <div class="brpx"><button class="ubtn" data-a="pass">${t.pass}</button><button class="ubtn pri" data-a="kontra" ${selK.size ? '' : 'disabled'}>${t.kontraL[Math.min(5, v.kon.round - 1)]}</button></div>`; box.hidden = false;
    } else { box.innerHTML = ''; box.hidden = true; }
  }
  const rectOf = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
  function fly(html, from, to, ms) {
    const el = document.createElement('div'); el.className = 'tbfly'; el.innerHTML = html;
    el.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`; document.body.appendChild(el);
    const s = to.width / from.width, dx = to.left - from.left, dy = to.top - from.top;
    const an = el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: .95 }], { duration: ms * mul(), easing: 'ease-in-out', fill: 'forwards' });
    return an.finished.catch(() => { }).then(() => el.remove());
  }
  function bubble(seat, html, ms = 1500) {
    const el = root.querySelector(seat === 0 ? '#ulHand' : `.brseat[data-s="${seat}"]`); const b = document.createElement('div'); b.className = 'brbub'; b.innerHTML = html;
    const r = el ? rectOf(el) : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    b.style.left = r.left + r.width / 2 + 'px'; b.style.top = (seat === 0 ? r.top - 18 : r.top + r.height + 4) + 'px'; document.body.appendChild(b);
    setTimeout(() => b.remove(), ms * mul());
  }
  function lastTrickSheet() {
    const l = cur && cur.last, html = l
      ? `<h3>${api.L().lastTrick}</h3><div class="lasttr">${l.trick.map(x => `<div class="tbc">${face(x.card)}</div>`).join('')}</div><p class="muted">${esc(nameOf(l.winner))}</p>`
      : `<h3>${api.L().lastTrick}</h3><p>${api.L().noLast}</p>`;
    api.openSheet(`${html}<div class="btns"><button class="pri" id="lx">${api.L().close}</button></div>`, v => v.querySelector('#lx').onclick = api.closeSheet);
  }

  // ---------------------------------------------------------------- events (queued)
  const enqueue = fn => { const t = tok; chain = chain.then(() => t === tok ? fn() : null).catch(e => { if (!(e instanceof Abort)) console.error(e); }); return chain; };
  async function handle(ev, v) {
    if (!root || root.hidden) return;
    if (ev.k === 'deal') { shownTrick = null; myReq = null; selD = new Set(); selK = new Set(); selB = {}; cur = v; render(); return; }
    if (ev.k === 'turn') { cur = v; render(); return; }
    if (ev.k === 'act') {
      cur = v; render();
      const t = tx();
      if (ev.act === 'bid') bubble(ev.seat, bidTag(ev.id), 1500);
      else if (ev.act === 'pass') bubble(ev.seat, t.pass, 1100);
      else if (ev.act === 'take') bubble(ev.seat, t.take, 1100);
      else if (ev.act === 'declare') bubble(ev.seat, suitI(ev.trump, 26), 1300);
      else if (ev.act === 'kontra') bubble(ev.seat, `${t.kontraL[Math.max(0, Math.min(5, (ev.lvl || 1) - 1))]}: ${(ev.comps || []).map(c => t.comp[c]).join(', ')}`, 1500);
      return;
    }
    if (ev.k === 'play') return onPlay(ev, v);
    if (ev.k === 'trick') return onTrick(ev, v);
    if (ev.k === 'handEnd') { lastEnd = { ev, v }; cur = v; shownTrick = null; render(); if (!ev.over) await handEndSheet(ev, v); return; }
    if (ev.k === 'matchEnd') return matchEnd(ev, v);
    cur = v; render();
  }
  async function onPlay(ev, v) {
    const before = cur || v, c = ev.card, pos = TPOS[ev.seat];
    const srcEl = ev.seat === 0 ? root.querySelector(`#ulHand [data-id="${c.id}"]`) : root.querySelector(`.brseat[data-s="${ev.seat}"]`);
    const from = srcEl ? rectOf(srcEl) : { left: innerWidth / 2, top: 100, width: 30, height: 45 };
    shownTrick = before.trick.concat([{ seat: ev.seat, card: c }]);
    cur = v; render();
    for (const m of ev.decl || []) bubble(ev.seat, `${suitI(m.suit, 16)} ${m.pts}`, 1600);
    const el = root.querySelector(`#ulTrick .brt.${pos} .tbc`);
    if (el) { el.style.visibility = 'hidden'; await fly(el.innerHTML, from, rectOf(el), 300); el.style.visibility = ''; }
    if (v.trick.length !== 0) shownTrick = null;
  }
  async function onTrick(ev, v) {
    await sleep(450);
    const els = [...root.querySelectorAll('#ulTrick .tbc')], to = ev.winner === 0 ? rectOf($('#ulHand')) : rectOf(root.querySelector(`.brseat[data-s="${ev.winner}"]`) || $('#ulHand'));
    const rects = els.map(rectOf), htmls = els.map(e => e.innerHTML); els.forEach(e => e.style.visibility = 'hidden');
    await Promise.all(rects.map((r, i) => fly(htmls[i], r, { left: to.left + to.width / 2 - 8, top: to.top + to.height / 2 - 12, width: 16, height: 24 }, 320 + i * 30)));
    shownTrick = null; cur = v; render();
  }
  function resultHTML(ev) {
    const t = tx(), r = ev.result, sign = n => n > 0 ? '+' + n : String(n), b = bidOf(r.bidId, cur && cur.opts);
    const ok = x => x ? '✓' : '✗';
    const comps = r.comps.map(c => `<tr><td>${t.comp[c.c]}${c.lv ? ` ×${2 ** c.lv}` : ''}</td><td>${c.v}</td><td class="${c.made ? '' : 'red'}">${ok(c.made)}</td></tr>`).join('');
    const sil = r.silent.map(s => `<tr><td>${t.silent}: ${t.sil[s.k]} (${s.who === 'd' ? t.declarer : t.def})</td><td>${s.v}</td><td></td></tr>`).join('');
    const talon = r.talon && r.talon.length ? `<div class="lasttr">${r.talon.map(c => `<div class="tbc">${face(c)}</div>`).join('')}</div>` : '';
    const body = [0, 1, 2].map(i => `<tr${i === r.declarer ? ' class="w"' : ''}><td>${i === 0 ? t.you : esc(nameOf(i))}</td><td>${r.tricks[i]}</td><td>${sign(r.add[i])}</td><td><b>${ev.scores[i]}</b></td></tr>`).join('');
    return `<h3>${bidName(b)} · ${esc(nameOf(r.declarer))} ${r.comps.every(c => c.made) ? '✓' : ''}</h3>
      <p class="muted">${t.declarer} ${r.D} · ${t.def} ${r.E}</p>
      <table class="pis utab"><thead><tr><th></th><th>${t.value}</th><th></th></tr></thead><tbody>${comps}${sil}</tbody></table>
      <table class="pis utab"><thead><tr><th></th><th>${t.tricks}</th><th>${t.points}</th><th>${t.total}</th></tr></thead><tbody>${body}</tbody></table>${talon ? `<p class="muted">${t.talonL}</p>${talon}` : ''}`;
  }
  function handEndSheet(ev) {
    const t = tx(), html = resultHTML(ev);
    api.openSheet(`${html}<div class="btns"><button class="pri" id="ulNext">${t.next}</button></div>`, s => {
      s.querySelector('#ulNext').onclick = () => {
        if (mode === 'net') { ctx.send({ a: 'next' }); const b = s.querySelector('#ulNext'); b.disabled = true; b.textContent = api.L().waitOthers(Math.max(1, ctx.nextN || 0), ctx.nextOf || 3); }
        else { api.closeSheet(); if (nextRes) { const r = nextRes; nextRes = null; r(); } }
      };
    });
  }
  async function matchEnd(ev) {
    const t = tx(), won = ev.winner === 0, sc = ev.scores, order = [0, 1, 2].sort((a, b) => sc[b] - sc[a]);
    const html = `<h3>${won ? t.won : t.lost}</h3><table class="pis utab"><thead><tr><th></th><th>${t.total}</th></tr></thead><tbody>${order.map(i => `<tr${i === ev.winner ? ' class="w"' : ''}><td>${i === 0 ? t.you : esc(nameOf(i))}</td><td><b>${sc[i]}</b></td></tr>`).join('')}</tbody></table>`;
    if (mode === 'net') { if (ctx.matchDone) ctx.matchDone(); } else { clearSave(); record(won); }
    await api.fx(won, { cards: won ? [] : [...root.querySelectorAll('#ulHand .tbc')], stats: html });
    const btns = mode === 'net'
      ? `<button class="sec" id="ulX">${t.home}</button><button class="sec" id="ulT">${api.L().tables}</button><button class="pri" id="ulA">${api.L().playAgain}</button>`
      : `<button class="sec" id="ulX">${t.home}</button><button class="pri" id="ulA">${t.again}</button>`;
    api.openSheet(`${html}<p class="muted" id="ratingLine">${ctx && ctx.rating ? `${api.L().rating} ${ctx.rating.r} (${ctx.rating.d >= 0 ? '+' : ''}${ctx.rating.d})` : ''}</p><div class="btns">${btns}</div>`, s => {
      s.querySelector('#ulX').onclick = () => { api.closeSheet(); leave(); };
      const T2 = s.querySelector('#ulT'); if (T2) T2.onclick = () => { api.closeSheet(); leave(); ctx.lobby('i'); };
      s.querySelector('#ulA').onclick = () => {
        if (mode === 'net') { ctx.send({ a: 'again' }); const b = s.querySelector('#ulA'); b.disabled = true; b.textContent = api.L().waitOthers(1, ctx.againOf || 1); }
        else { api.closeSheet(); start(); }
      };
    });
  }

  // ---------------------------------------------------------------- offline match
  const ckpt = at => { if (!st) return; api.S.ultiSave = { st: JSON.stringify(st), at, levels, names: offNames, t: Date.now() }; api.save(); };
  const clearSave = () => { if (api.S.ultiSave) { api.S.ultiSave = null; api.save(); } };
  const hasSaved = () => !!(api && api.S.ultiSave);
  function record(won) { const S = api.S; S.ultiStats = S.ultiStats || {}; const r = S.ultiStats[levels[1]] = S.ultiStats[levels[1]] || [0, 0]; r[won ? 0 : 1]++; api.save(); }
  function makeHost(opts, saved) {
    const h = {
      opts, saved, st: null, turn: null, fromHuman: false,
      io: { sleep: ms => sleep(ms), level: s => levels[s], send: (seat, m) => { if (m.t === 'reject') api.toast(tx().err[m.rule] || tx().bad); }, waitNext: () => new Promise(res => { nextRes = res; }) },
      emit(ev) { const v = U.view(h.st, 0); v.turn = h.turn === null ? null : h.turn; enqueue(() => handle(ev, v)); },
      checkpoint: async at => ckpt(at),
      async getAction(seat, req, bot) {
        h.fromHuman = false;
        if (seat === 0) {
          await chain;
          const tk = (+api.S.takeover || 0) * 1000, my = tok;
          const a = await new Promise(res => {
            askRes = res; myReq = req; selD = new Set(); selK = new Set(); cur = U.view(h.st, 0); cur.turn = 0; render();
            const arm = () => { clearTimeout(idleTimer); if (tk) idleTimer = setTimeout(() => { if (askRes === res) { askRes = null; myReq = null; render(); res(null); } }, tk); };
            arm(); root.onpointerdown = arm;
          });
          if (my !== tok) throw new Abort();
          if (a) { h.fromHuman = true; return a; }
          return bot();
        }
        await sleep(600 + Math.random() * 400);
        return bot();
      }
    };
    Object.defineProperty(h, 'st', { get() { return st; }, set(v) { st = v; } });
    return h;
  }
  function begin(saved) {
    api.closeSheet(); show(); mode = 'off'; chain = Promise.resolve(); cur = null; lastEnd = null; tok++; myReq = null; shownTrick = null; selD = new Set(); selK = new Set(); selB = {};
    const S = api.S;
    if (!saved) {
      clearSave();
      levels = [null, S.iLevel || 'cardshark', S.iLevel || 'cardshark']; levels[0] = levels[1];
      const pn = api.pickBotNames({ 1: levels[1], 2: levels[2] }); offNames = [null, pn[1], pn[2]];
      st = null;
    } else { levels = saved.levels; offNames = saved.names; }
    const opts = saved ? JSON.parse(saved.st).opts : optsFrom(k => S[k]);
    U.run(makeHost(opts, saved ? { st: saved.st, at: saved.at } : null)).catch(e => { if (!(e instanceof Abort)) console.error(e); });
  }
  const start = () => begin(null);
  const resume = () => begin(api.S.ultiSave);

  // ---------------------------------------------------------------- online
  function onNet(m, c) {
    ctx = c; mode = 'net';
    if (m.t === 'start') { show(); chain = Promise.resolve(); cur = null; lastEnd = null; myReq = null; shownTrick = null; selD = new Set(); selK = new Set(); selB = {}; tok++; if (m.names) ctx.names = m.names; api.closeSheet(); return; }
    if (!root || root.hidden) { if (m.t === 'state' || m.t === 'ev') show(); else return; }
    if (m.names) ctx.names = m.names;
    if (m.t === 'state') { cur = m.view; shownTrick = null; render(); return; }
    if (m.t === 'ev') { if (m.ev.k === 'deal') { api.closeSheet(); ctx.nextN = 0; } const v = m.view; enqueue(() => handle(m.ev, v)); return; }
    if (m.t === 'ask') { const req = m.req; enqueue(() => { const a = document.querySelector('#awayPill'); if (a) a.remove(); myReq = req; selD = new Set(); selK = new Set(); render(); }); return; }
    if (m.t === 'away') { myReq = null; render(); showAway(); return; }
    if (m.t === 'reject') { api.toast(tx().err[m.rule] || tx().bad); return; }
    if (m.t === 'bots') { ctx.botSeats = m.seats; return; }
    if (m.t === 'rating') { ctx.rating = m.change; const el = document.querySelector('#ratingLine'); if (el && m.change) el.textContent = `${api.L().rating} ${m.change.r} (${m.change.d >= 0 ? '+' : ''}${m.change.d})`; return; }
    if (m.t === 'next') { ctx.nextN = m.n; ctx.nextOf = m.of; const b = document.querySelector('#ulNext'); if (b && b.disabled) b.textContent = api.L().waitOthers(m.n, m.of); return; }
    if (m.t === 'again') { ctx.againOf = m.of; const b = document.querySelector('#ulA'); if (b && b.disabled) b.textContent = api.L().waitOthers(m.n, m.of); return; }
    if (m.t === 'error') { api.toast(String(m.msg || 'error')); return; }
  }
  function showAway() {
    let el = document.querySelector('#awayPill');
    if (!el) { el = document.createElement('button'); el.id = 'awayPill'; root.appendChild(el); }
    el.innerHTML = `<span class="ap-s">${api.L().botPlays}</span><b>${api.L().takeOver}</b>`;
    el.onclick = () => { ctx.send({ a: 'back' }); el.remove(); };
  }
  return { init, start, resume, hasSaved, onNet, tx, TX, rows, optsFrom, PFX, get state() { return st; } };
})();
if (typeof module !== 'undefined') module.exports = UltiUI;
