// ===================== BRIDGE UI (offline vs bots and online, one screen) =====================
const BridgeUI = (() => {
  const B = Bridge;
  let api, root = null, cur = null, mode = null, st = null, askRes = null, chain = Promise.resolve(), tok = 0, levels = [], offNames = [], ctx = null,
    myReq = null, idleTimer = 0, nextRes = null, lastEnd = null, selLevel = 0, shownTrick = null;
  class Abort extends Error {}
  const TX = {
    hr: { name: 'Bridž', we: 'Mi', they: 'Oni', you: 'Ti', partner: 'Partner', pass: 'Pas', x: 'Kontra', xx: 'Rekontra', dummy: 'Dummy', decl: 'Igrač', contract: 'Ugovor', vul: 'Zona', games: 'Igre', above: 'Iznad', below: 'Ispod', total: 'Ukupno',
      yourBid: 'Tvoja licitacija', yourTurn: 'Tvoj potez', bidding: n => `${n} licitira…`, playing: n => `${n} igra…`, dummyTurn: 'Igraš iz dummyja', next: 'Dalje', won: 'Pobjeda!', lost: 'Poraz', again: 'Nova igra', home: 'Početna',
      passedOut: 'Svi pas', made: 'Ispunjeno', down: 'Pad', tricks: 'Štihovi', deal: n => `${n}. dijeljenje`, nt: 'BA', bad: 'Ne ide', score: 'Rezultat', lead: 'Izlaz', rubber: 'Rubber', over: 'Preko', under: 'Pad', slam: 'Slem', grand: 'Veliki slem', insult: 'Bonus', contractPts: 'Ugovor', rubberB: 'Rubber bonus', level: 'Razina', trick: 'Štih' },
    en: { name: 'Bridge', we: 'We', they: 'They', you: 'You', partner: 'Partner', pass: 'Pass', x: 'Double', xx: 'Redouble', dummy: 'Dummy', decl: 'Declarer', contract: 'Contract', vul: 'Vul', games: 'Games', above: 'Above', below: 'Below', total: 'Total',
      yourBid: 'Your bid', yourTurn: 'Your turn', bidding: n => `${n} is bidding…`, playing: n => `${n} is playing…`, dummyTurn: 'Play from the dummy', next: 'Next', won: 'You won!', lost: 'You lost', again: 'New game', home: 'Home',
      passedOut: 'Passed out', made: 'Made', down: 'Down', tricks: 'Tricks', deal: n => `Deal ${n}`, nt: 'NT', bad: 'Not allowed', score: 'Score', lead: 'Lead', rubber: 'Rubber', over: 'Overtricks', under: 'Undertricks', slam: 'Slam', grand: 'Grand slam', insult: 'Bonus', contractPts: 'Contract', rubberB: 'Rubber bonus', level: 'Level', trick: 'Trick' }
  };
  const tx = () => TX[api.S.lang === 'hr' ? 'hr' : 'en'];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const $ = s => root.querySelector(s);
  const mul = () => api.S.speed === 'slow' ? 1.6 : api.S.speed === 'fast' ? 0.55 : 1;
  const sleep = ms => { const t = tok; return new Promise((res, rej) => setTimeout(() => t === tok ? res() : rej(new Abort()), ms * mul())); };
  const face = c => Cards.frFace(B.key(c), api.S.fDeck);
  const GL = { C: '♣', D: '♦', H: '♥', S: '♠' }, RED = { D: 1, H: 1 };
  const denH = d => d === 4 ? `<b>${tx().nt}</b>` : `<b class="${d === 1 || d === 2 ? 'red' : ''}">${'♣♦♥♠'[d]}</b>`;
  const callH = c => c.t === 'pass' ? tx().pass : c.t === 'x' ? 'X' : c.t === 'xx' ? 'XX' : `${c.level}${denH(c.den)}`;
  function init(a) { api = a; }
  const nameOf = i => i === 0 ? tx().you : mode === 'net' ? api.botName((ctx.names || {})[i] || '') : api.botName(offNames[i] || '');
  const POS = { 1: 'left', 2: 'top', 3: 'right' };

  function show() {
    root = document.querySelector('#bridge');
    for (const id of ['#home', '#table', '#sol', '#uno', '#poker', '#remi', '#tablic']) { const el = document.querySelector(id); if (el) el.hidden = true; }
    root.hidden = false; root.style.setProperty('--rr', Cards.frRatio(api.S.fDeck));
    root.innerHTML = `<header class="ubar"><button class="ib" id="brHome" aria-label="${api.L().sol.home}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="chip score" id="brScore"></div>
      <button class="ib" id="brLast" aria-label="${api.L().lastTrick}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/></svg></button>
      <button class="ib" id="brRules" aria-label="${api.L().rules}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg></button>
      <button class="ib" id="brSet" aria-label="${api.L().settings}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button></header>
      <div class="brctr" id="brCtr"></div>
      <div class="brauc" id="brAuc" hidden></div>
      <div class="brdummy" id="brDummy" hidden></div>
      <div class="brboard"><div class="brseats" id="brSeats"></div><div class="brtrick" id="brTrick"></div></div>
      <div class="tbstatus" id="brStatus"></div><div class="brbox" id="brBox"></div><div class="brhand" id="brHand"></div>`;
    $('#brHome').onclick = leave; $('#brRules').onclick = () => api.showRules('c'); $('#brLast').onclick = lastTrickSheet; $('#brSet').onclick = () => api.showOpts('c'); $('#brScore').onclick = scoreSheet;
    $('#brHand').onclick = e => { const el = e.target.closest('.tbc'); if (el) playTap(el.dataset.id, 0); };
    $('#brDummy').onclick = e => { const el = e.target.closest('.tbc'); if (el) playTap(el.dataset.id, cur.dummy); };
    $('#brBox').onclick = e => { const b = e.target.closest('button'); if (b) boxTap(b); };
  }
  function leave() {
    tok++; clearTimeout(idleTimer); const a = document.querySelector('#awayPill'); if (a) a.remove();
    if (root) root.hidden = true;
    if (mode === 'net' && ctx) ctx.leave(); else api.showHome();
    mode = null;
  }

  // ---------------------------------------------------------------- moves
  const shim = v => ({ calls: v.calls, dealer: v.dealer });
  function legalForMe() { return B.legalCalls(shim(cur), 0); }
  function boxTap(b) {
    if (!myReq || myReq.kind !== 'bid') return;
    const a = b.dataset.a;
    if (a === 'lv') { selLevel = +b.dataset.v === selLevel ? 0 : +b.dataset.v; render(); return; }
    let call = null;
    if (a === 'den') { if (!selLevel) return; call = { t: 'bid', level: selLevel, den: +b.dataset.v }; }
    else if (a === 'pass') call = { t: 'pass' }; else if (a === 'x') call = { t: 'x' }; else if (a === 'xx') call = { t: 'xx' };
    if (call && legalForMe().some(x => x.t === call.t && (x.t !== 'bid' || (x.level === call.level && x.den === call.den)))) submit({ call });
  }
  function playTap(id, seat) {
    if (!myReq || myReq.kind !== 'play') return;
    const forSeat = myReq.for === undefined ? 0 : myReq.for;
    if (seat !== forSeat) return;
    const hand = cur.hands[seat] || [];
    if (!B.legalPlays(hand, cur.trick).some(c => c.id === id)) { api.toast(tx().bad); return; }
    submit({ card: id });
  }
  function submit(mv) {
    myReq = null; selLevel = 0; clearTimeout(idleTimer);
    if (mode === 'net') ctx.send({ a: 'move', ...mv });
    else if (askRes) { const r = askRes; askRes = null; r(mv); }
    render();
  }

  // ---------------------------------------------------------------- drawing
  function render() {
    { const s = root && root.querySelector('#brSet'); if (s) s.style.display = mode === 'net' ? 'none' : ''; }
    if (!cur || !root) return;
    const t = tx(), v = cur;
    $('#brScore').innerHTML = `<span>${t.we}</span><b>${v.total[0]}</b><small>:</small><b>${v.total[1]}</b><span>${t.they}</span>`;
    // contract strip
    const ctr = $('#brCtr');
    if (v.contract) {
      const c = v.contract;
      ctr.innerHTML = `<span class="brct">${c.level}${denH(c.den)}${c.dbl === 2 ? ' XX' : c.dbl === 1 ? ' X' : ''}</span><span>${t.decl}: <b>${esc(nameOf(c.decl))}</b></span><span class="brwon">${t.we} <b>${v.won[0]}</b> · ${t.they} <b>${v.won[1]}</b></span>`;
    } else ctr.innerHTML = `<span>${t.deal(v.deal)}</span><span>${t.vul}: ${v.vul[0] ? t.we : ''}${v.vul[0] && v.vul[1] ? ' · ' : ''}${v.vul[1] ? t.they : ''}${!v.vul[0] && !v.vul[1] ? '–' : ''}</span>`;
    // seats
    const seats = $('#brSeats'); seats.replaceChildren();
    for (let i = 1; i < 4; i++) {
      const cards = v.hands[i] || [], showDummy = v.dummyShown && v.dummy === i;
      const o = document.createElement('div');
      o.className = `brseat ${POS[i]}${v.turn === i ? ' turn' : ''}${i === 2 ? ' partner' : ''}${showDummy ? ' isdummy' : ''}`;
      const backs = showDummy ? '' : Array.from({ length: Math.min(cards.length, 7) }, () => `<span class="tbback">${Cards.frBack(api.S.fDeck, api.S.fBack)}</span>`).join('');
      o.dataset.s = i;
      o.innerHTML = `<div class="tbcnt">${backs}</div><b class="tbnm">${esc(nameOf(i))}</b><small>${i === 2 ? t.partner : ''}${showDummy ? (i === 2 ? ' · ' : '') + t.dummy : ''}${v.dealer === i && !v.contract ? ' · D' : ''}${!showDummy ? ` · ${cards.length}` : ''}</small>`;
      seats.append(o);
    }
    // dummy panel
    const dm = $('#brDummy'), dummyShownFor = v.dummyShown && v.dummy !== 0 && v.contract;
    dm.hidden = !dummyShownFor;
    if (dummyShownFor) {
      const dh = v.hands[v.dummy] || [], k = dh.length, W = root.clientWidth || 360, cw = Math.max(28, Math.min(46, Math.floor((W - 16) / (1 + 0.55 * Math.max(0, k - 1)))));
      const total = cw + (k - 1) * cw * 0.55, left = (W - total) / 2, mine = myReq && myReq.kind === 'play' && myReq.for === v.dummy;
      const legal = mine ? B.legalPlays(dh, v.trick).map(c => c.id) : null;
      dm.style.height = `calc(${cw}px * var(--rr) + 6px)`;
      dm.innerHTML = dh.map((c, i) => `<div class="tbc${mine && !legal.includes(c.id) ? ' dim' : ''}${mine && legal.includes(c.id) ? ' ok' : ''}" data-id="${c.id}" style="left:${left + i * cw * 0.55}px;width:${cw}px;height:calc(${cw}px * var(--rr))">${face(c)}</div>`).join('');
    }
    // trick
    const tr = $('#brTrick'); const trick = shownTrick || v.trick;
    tr.innerHTML = trick.map(x => `<div class="brt ${['b', 'l', 't', 'r'][x.seat]}"><div class="tbc" data-id="${x.card.id}">${face(x.card)}</div></div>`).join('');
    // auction table (during bidding)
    const au = $('#brAuc');
    if (v.phase === 'bid' || (v.phase === 'new')) {
      const order = [1, 2, 3, 0], head = ['W', 'N', 'E', 'S'];
      const cells = []; for (let i = 0; i < ((v.dealer - 1) % 4 + 4) % 4; i++) cells.push('');
      v.calls.forEach(c => cells.push(callH(c.call)));
      au.innerHTML = `<div class="brgrid">${order.map(s => `<b class="${s === 0 ? 'me' : ''}">${s === 0 ? t.you : esc(nameOf(s))}</b>`).join('')}${cells.map(c => `<span>${c || ''}</span>`).join('')}</div>`; au.hidden = false;
    } else au.hidden = true;
    // my hand
    const hand = $('#brHand'), mh = v.hands[0] || [], W2 = root.clientWidth || 360, k2 = mh.length;
    const cw2 = Math.max(34, Math.min(62, Math.floor((W2 - 16) / (1 + 0.55 * Math.max(0, k2 - 1)))));
    hand.style.setProperty('--cw', cw2 + 'px'); hand.style.height = `calc(var(--cw) * var(--rr) + 16px)`;
    const total2 = cw2 + (k2 - 1) * cw2 * 0.55, left2 = (W2 - total2) / 2, mineP = myReq && myReq.kind === 'play' && (myReq.for === undefined || myReq.for === 0);
    const legal2 = mineP ? B.legalPlays(mh, v.trick).map(c => c.id) : null;
    hand.innerHTML = mh.map((c, i) => `<div class="tbc${mineP && !legal2.includes(c.id) ? ' dim' : ''}${mineP && legal2.includes(c.id) ? ' ok' : ''}" data-id="${c.id}" style="left:${left2 + i * cw2 * 0.55}px">${face(c)}</div>`).join('');
    // status
    const sEl = $('#brStatus');
    let msg = '';
    if (myReq && myReq.kind === 'bid') msg = t.yourBid;
    else if (myReq && myReq.kind === 'play') msg = myReq.for !== undefined && myReq.for !== 0 ? t.dummyTurn : t.yourTurn;
    else if (v.turn !== null && v.turn !== undefined) { const ctl = v.contract && v.turn === v.dummy ? v.contract.decl : v.turn; msg = v.phase === 'bid' ? (v.turn === 0 ? '' : t.bidding(nameOf(v.turn))) : (ctl === 0 ? '' : t.playing(nameOf(ctl))); }
    sEl.className = `tbstatus${myReq ? ' yt' : ''}`; sEl.textContent = msg;
    // bid box
    const box = $('#brBox');
    if (myReq && myReq.kind === 'bid') {
      const legal = legalForMe(), canBid = (l, d) => legal.some(x => x.t === 'bid' && x.level === l && x.den === d), lvOk = l => [0, 1, 2, 3, 4].some(d => canBid(l, d));
      box.innerHTML = `<div class="brlv">${[1, 2, 3, 4, 5, 6, 7].map(l => `<button class="ubtn${selLevel === l ? ' pri' : ''}" data-a="lv" data-v="${l}" ${lvOk(l) ? '' : 'disabled'}>${l}</button>`).join('')}</div>
        <div class="brdn">${[0, 1, 2, 3, 4].map(d => `<button class="ubtn" data-a="den" data-v="${d}" ${selLevel && canBid(selLevel, d) ? '' : 'disabled'}>${d === 4 ? t.nt : `<b class="${d === 1 || d === 2 ? 'red' : ''}">${'♣♦♥♠'[d]}</b>`}</button>`).join('')}</div>
        <div class="brpx"><button class="ubtn" data-a="pass">${t.pass}</button><button class="ubtn" data-a="x" ${legal.some(x => x.t === 'x') ? '' : 'disabled'}>${t.x}</button><button class="ubtn" data-a="xx" ${legal.some(x => x.t === 'xx') ? '' : 'disabled'}>${t.xx}</button></div>`;
      box.hidden = false;
    } else { box.innerHTML = ''; box.hidden = true; }
  }
  function scoreSheet() {
    if (!cur) return; const t = tx(), v = cur;
    api.openSheet(`<h3>${t.score}</h3><table class="pis utab"><thead><tr><th></th><th>${t.we}</th><th>${t.they}</th></tr></thead><tbody>
      <tr><td>${t.games}</td><td>${v.games[0]}</td><td>${v.games[1]}</td></tr><tr><td>${t.below}</td><td>${v.below[0]}</td><td>${v.below[1]}</td></tr>
      <tr><td>${t.above}</td><td>${v.above[0]}</td><td>${v.above[1]}</td></tr><tr class="w"><td>${t.total}</td><td><b>${v.total[0]}</b></td><td><b>${v.total[1]}</b></td></tr></tbody></table>
      <div class="btns"><button class="pri" id="brX">${api.L().close}</button></div>`, s => { s.querySelector('#brX').onclick = api.closeSheet; });
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
    const el = root.querySelector(seat === 0 ? '#brHand' : `.brseat[data-s="${seat}"]`); const b = document.createElement('div'); b.className = 'brbub'; b.innerHTML = html;
    const r = el ? rectOf(el) : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    b.style.left = r.left + r.width / 2 + 'px'; b.style.top = (seat === 0 ? r.top - 18 : r.top + r.height + 4) + 'px'; document.body.appendChild(b);
    setTimeout(() => b.remove(), ms * mul());
  }

  // ---------------------------------------------------------------- events (queued)
  const enqueue = fn => { const t = tok; chain = chain.then(() => t === tok ? fn() : null).catch(e => { if (!(e instanceof Abort)) console.error(e); }); return chain; };
  async function handle(ev, v) {
    if (!root || root.hidden) return;
    if (ev.k === 'deal') { shownTrick = null; myReq = null; selLevel = 0; cur = v; render(); return; }
    if (ev.k === 'turn') { cur = v; render(); return; }
    if (ev.k === 'call') { cur = v; render(); bubble(ev.seat, callH(ev.call), 1400); return; }
    if (ev.k === 'contract') { cur = v; render(); return; }
    if (ev.k === 'passedOut') { cur = v; render(); bubble(2, tx().passedOut, 1500); return; }
    if (ev.k === 'play') return onPlay(ev, v);
    if (ev.k === 'trick') return onTrick(ev, v);
    if (ev.k === 'handEnd') { lastEnd = { ev, v }; cur = v; shownTrick = null; render(); if (!ev.over) await handEndSheet(ev, v); return; }
    if (ev.k === 'matchEnd') return matchEnd(ev, v);
    cur = v; render();
  }
  async function onPlay(ev, v) {
    const before = cur || v, c = ev.card, pos = ['b', 'l', 't', 'r'][ev.seat];
    const srcEl = ev.seat === 0 ? root.querySelector(`#brHand [data-id="${c.id}"]`) : (before.dummyShown && before.dummy === ev.seat ? root.querySelector(`#brDummy [data-id="${c.id}"]`) : root.querySelector(`.brseat[data-s="${ev.seat}"]`));
    const from = srcEl ? rectOf(srcEl) : { left: innerWidth / 2, top: 100, width: 30, height: 45 };
    shownTrick = before.trick.concat([{ seat: ev.seat, card: c }]);
    cur = v; render();
    const el = root.querySelector(`#brTrick .brt.${pos} .tbc`);
    if (el) { el.style.visibility = 'hidden'; await fly(el.innerHTML, from, rectOf(el), 300); el.style.visibility = ''; }
    if (v.trick.length === 0) { /* the trick completed: onTrick keeps showing it */ } else shownTrick = null;
  }
  let lastTr = null;
  function lastTrickSheet() {
    const html = lastTr
      ? `<h3>${api.L().lastTrick}</h3><div class="lasttr">${lastTr.trick.map(x => `<div class="tbc">${face(x.card)}</div>`).join('')}</div><p class="muted">${esc(nameOf(lastTr.winner))}</p>`
      : `<h3>${api.L().lastTrick}</h3><p>${api.L().noLast}</p>`;
    api.openSheet(`${html}<div class="btns"><button class="pri" id="lx">${api.L().close}</button></div>`, v => v.querySelector('#lx').onclick = api.closeSheet);
  }
  async function onTrick(ev, v) {
    lastTr = { trick: (shownTrick || v.trick).slice(), winner: ev.winner };
    await sleep(500);
    const els = [...root.querySelectorAll('#brTrick .tbc')], to = ev.winner === 0 ? rectOf($('#brHand')) : rectOf(root.querySelector(`.brseat[data-s="${ev.winner}"]`) || $('#brHand'));
    const rects = els.map(rectOf), htmls = els.map(e => e.innerHTML); els.forEach(e => e.style.visibility = 'hidden');
    await Promise.all(rects.map((r, i) => fly(htmls[i], r, { left: to.left + to.width / 2 - 8, top: to.top + to.height / 2 - 12, width: 16, height: 24 }, 320 + i * 30)));
    shownTrick = null; cur = v; render();
  }
  const ptsLine = (res, t) => res.lines.map(([k, n]) => `<span>${({ contract: t.contractPts, over: t.over, under: t.under, slam: t.slam, grand: t.grand, insult: t.insult, rubber: t.rubberB })[k]} <b>${n}</b></span>`).join('');
  function resultHTML(ev, over) {
    const t = tx(), r = ev.result, c = r.contract, made = r.made >= r.need, cs = `${c.level}${denH(c.den)}${c.dbl === 2 ? ' XX' : c.dbl === 1 ? ' X' : ''}`;
    const diff = r.made - r.need, we = r.declTeam === 0;
    const title = over ? (r.gameWon === 0 ? t.won : t.lost) : `${cs} · ${made ? (diff > 0 ? `+${diff}` : '=') : `−${-diff}`}`;
    return `<h3>${title}</h3><div class="brres">${ptsLine(r, t)}</div><table class="pis utab"><thead><tr><th></th><th>${t.we}</th><th>${t.they}</th></tr></thead><tbody>
      <tr><td>${t.games}</td><td>${r.games[0]}</td><td>${r.games[1]}</td></tr><tr><td>${t.below}</td><td>${r.partial[0]}</td><td>${r.partial[1]}</td></tr>
      <tr class="w"><td>${t.total}</td><td><b>${r.total[0]}</b></td><td><b>${r.total[1]}</b></td></tr></tbody></table>`;
  }
  function handEndSheet(ev, v) {
    const t = tx(), html = resultHTML(ev, false);
    api.openSheet(`${html}<div class="btns"><button class="pri" id="brNext">${t.next}</button></div>`, s => {
      s.querySelector('#brNext').onclick = () => {
        if (mode === 'net') { ctx.send({ a: 'next' }); const b = s.querySelector('#brNext'); b.disabled = true; b.textContent = api.L().waitOthers(Math.max(1, ctx.nextN || 0), ctx.nextOf || 2); }
        else { api.closeSheet(); if (nextRes) { const r = nextRes; nextRes = null; r(); } }
      };
    });
  }
  async function matchEnd(ev, v) {
    const t = tx(), won = ev.winner === 0;
    const html = lastEnd ? resultHTML(lastEnd.ev, true) : `<h3>${won ? t.won : t.lost}</h3>`;
    if (mode === 'net') { if (ctx.matchDone) ctx.matchDone(); } else { clearSave(); record(won); }
    await api.fx(won, { cards: won ? [] : [...root.querySelectorAll('#brHand .tbc')], stats: html });
    const btns = mode === 'net'
      ? `<button class="sec" id="brX">${t.home}</button><button class="sec" id="brT">${api.L().tables}</button><button class="pri" id="brA">${api.L().playAgain}</button>`
      : `<button class="sec" id="brX">${t.home}</button><button class="pri" id="brA">${t.again}</button>`;
    api.openSheet(`${html}<p class="muted" id="ratingLine">${ctx && ctx.rating ? `${api.L().rating} ${ctx.rating.r} (${ctx.rating.d >= 0 ? '+' : ''}${ctx.rating.d})` : ''}</p><div class="btns">${btns}</div>`, s => {
      s.querySelector('#brX').onclick = () => { api.closeSheet(); leave(); };
      const T2 = s.querySelector('#brT'); if (T2) T2.onclick = () => { api.closeSheet(); leave(); ctx.lobby('c'); };
      s.querySelector('#brA').onclick = () => {
        if (mode === 'net') { ctx.send({ a: 'again' }); const b = s.querySelector('#brA'); b.disabled = true; b.textContent = api.L().waitOthers(1, ctx.againOf || 1); }
        else { api.closeSheet(); start(); }
      };
    });
  }

  // ---------------------------------------------------------------- offline match
  const ckpt = at => { if (!st) return; api.S.bridgeSave = { st: JSON.stringify(st), at, levels, names: offNames, t: Date.now() }; api.save(); };
  const clearSave = () => { if (api.S.bridgeSave) { api.S.bridgeSave = null; api.save(); } };
  const hasSaved = () => !!(api && api.S.bridgeSave);
  function record(won) { const S = api.S; S.bridgeStats = S.bridgeStats || {}; const r = S.bridgeStats[levels[1]] = S.bridgeStats[levels[1]] || [0, 0]; r[won ? 0 : 1]++; api.save(); }
  function makeHost(saved) {
    const h = {
      opts: {}, saved, st: null, turn: null, fromHuman: false,
      io: { sleep: ms => sleep(ms), level: s => levels[s], send: (seat, m) => { if (m.t === 'reject') api.toast(tx().bad); }, waitNext: () => new Promise(res => { nextRes = res; }) },
      emit(ev) { const v = B.view(h.st, 0); v.turn = h.turn === null ? null : h.turn; enqueue(() => handle(ev, v)); },
      checkpoint: async at => ckpt(at),
      async getAction(seat, req, bot) {
        h.fromHuman = false;
        if (seat === 0) {
          await chain;
          const tk = (+api.S.takeover || 0) * 1000, my = tok;
          const a = await new Promise(res => {
            askRes = res; myReq = req; selLevel = 0; render();
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
    api.closeSheet(); show(); mode = 'off'; chain = Promise.resolve(); cur = null; lastEnd = null; tok++; myReq = null; shownTrick = null;
    const S = api.S;
    if (!saved) {
      clearSave();
      levels = [null, S.cOpp || 'cardshark', S.cPartner || 'cardshark', S.cOpp || 'cardshark']; levels[0] = levels[2];
      const pick = { 1: levels[1], 2: levels[2], 3: levels[3] }; const pn = api.pickBotNames(pick); offNames = [null, pn[1], pn[2], pn[3]];
      st = null;
    } else { levels = saved.levels; offNames = saved.names; }
    T_run(makeHost(saved ? { st: saved.st, at: saved.at } : null));
  }
  const T_run = h => B.run(h).catch(e => { if (!(e instanceof Abort)) console.error(e); });
  const start = () => begin(null);
  const resume = () => begin(api.S.bridgeSave);

  // ---------------------------------------------------------------- online
  function onNet(m, c) {
    ctx = c; mode = 'net';
    if (m.t === 'start') { show(); chain = Promise.resolve(); cur = null; lastEnd = null; myReq = null; shownTrick = null; tok++; if (m.names) ctx.names = m.names; api.closeSheet(); return; }
    if (!root || root.hidden) { if (m.t === 'state' || m.t === 'ev') show(); else return; }
    if (m.names) ctx.names = m.names;
    if (m.t === 'state') { cur = m.view; shownTrick = null; render(); return; }
    if (m.t === 'ev') { if (m.ev.k === 'deal') { api.closeSheet(); ctx.nextN = 0; } const v = m.view; enqueue(() => handle(m.ev, v)); return; }
    if (m.t === 'ask') { const req = m.req; enqueue(() => { const a = document.querySelector('#awayPill'); if (a) a.remove(); myReq = req; selLevel = 0; render(); }); return; }
    if (m.t === 'away') { myReq = null; render(); showAway(); return; }
    if (m.t === 'reject') { api.toast(tx().bad); return; }
    if (m.t === 'bots') { ctx.botSeats = m.seats; return; }
    if (m.t === 'rating') { ctx.rating = m.change; const el = document.querySelector('#ratingLine'); if (el && m.change) el.textContent = `${api.L().rating} ${m.change.r} (${m.change.d >= 0 ? '+' : ''}${m.change.d})`; return; }
    if (m.t === 'next') { ctx.nextN = m.n; ctx.nextOf = m.of; const b = document.querySelector('#brNext'); if (b && b.disabled) b.textContent = api.L().waitOthers(m.n, m.of); return; }
    if (m.t === 'again') { ctx.againOf = m.of; const b = document.querySelector('#brA'); if (b && b.disabled) b.textContent = api.L().waitOthers(m.n, m.of); return; }
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
if (typeof module !== 'undefined') module.exports = BridgeUI;
