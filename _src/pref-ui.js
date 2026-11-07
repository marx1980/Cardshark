// ===================== PREFERANS UI (offline vs bots and online, one screen) =====================
const PrefUI = (() => {
  const P = Pref;
  let api, root = null, cur = null, mode = null, st = null, askRes = null, chain = Promise.resolve(), tok = 0, levels = [], offNames = [], ctx = null,
    myReq = null, idleTimer = 0, nextRes = null, lastEnd = null, selLevel = 0, selD = new Set(), shownTrick = null, selHand = false;
  class Abort extends Error {}
  const TX = {
    hr: { name: 'Preferans', deals: 'Dijeljenja', poolEnd: 'Kraj igre', endTwo: 'Dvije pule', endThree: 'Sve tri pule', poolCap: 'Ograničenje pule', capOn: 'Do cilja', capOff: 'Bez ograničenja', scoring: 'Bodovanje', simple: 'Jednostavno', poolMt: 'Pula i gora', poolTo: 'Pula', pl: 'Pula', mt: 'Gora', dealN: n => `Igra ${n}`, you: 'Ti', pass: 'Pas', whist: 'Vist', misere: 'Misère', raspasy: 'Raspasy', decl: 'Igrač', deal: (n, m) => `Igra ${n}/${m}`, yourBid: 'Tvoja licitacija',
      yourTurn: 'Tvoj potez', bidding: n => `${n} licitira…`, playing: n => `${n} igra…`, discard: 'Odbaci 2 karte', declare: 'Ugovor', whistQ: 'Vist?', waitingFor: n => `${n} odlučuje…`,
      next: 'Dalje', won: 'Pobjeda!', lost: 'Poraz', again: 'Nova igra', home: 'Početna', made: 'Ispunjeno', down: 'Pad', noPlay: 'Bez igre', tricks: 'Štihovi', points: 'Bodovi', total: 'Ukupno',
      confirm: 'Odbaci', nt: 'BA', bad: 'Ne ide', err: { bad: 'Ne ide', follow: 'Moraš slijediti boju', bid: 'Ta licitacija nije moguća', turn: 'Nisi na redu', discard: 'Odaberi 2 karte' } },
    en: { name: 'Preference', deals: 'Deals', poolEnd: 'Match ends', endTwo: 'Two pools', endThree: 'All three pools', poolCap: 'Pool limit', capOn: 'Stops at target', capOff: 'No limit', scoring: 'Scoring', simple: 'Simple', poolMt: 'Pool & mountain', poolTo: 'Pool', pl: 'Pool', mt: 'Mountain', dealN: n => `Deal ${n}`, you: 'You', pass: 'Pass', whist: 'Whist', misere: 'Misère', raspasy: 'Raspasy', decl: 'Declarer', deal: (n, m) => `Deal ${n}/${m}`, yourBid: 'Your bid',
      yourTurn: 'Your turn', bidding: n => `${n} is bidding…`, playing: n => `${n} is playing…`, discard: 'Discard 2 cards', declare: 'Contract', whistQ: 'Whist?', waitingFor: n => `${n} is deciding…`,
      next: 'Next', won: 'You won!', lost: 'You lost', again: 'New game', home: 'Home', made: 'Made', down: 'Down', noPlay: 'No play', tricks: 'Tricks', points: 'Points', total: 'Total',
      confirm: 'Discard', nt: 'NT', bad: 'Not allowed', err: { bad: 'Not allowed', follow: 'You must follow suit', bid: 'That bid is not possible', turn: 'Not your turn', discard: 'Pick 2 cards' } }
  };
  Object.assign(TX.hr, {
    ver: { russian: 'Ruski', austrian: 'Austrijski', balkan: 'Balkanski' }, version: 'Verzija',
    kinds: { mis: 'Misère', slam: 'Slem', omis: 'Otvoreni misère', oslam: 'Otvoreni slem', sans: 'BA', uno: 'Uno', pref: 'Pref' }, handTag: 'Ruka', igra: 'Igra',
    playOn: 'Igraj', dropOut: 'Odustani', kontraL: ['Kontra', 'Rekontra', 'Sukontra', 'Mortkontra'], invite: 'Pozovi', announce: 'Bez asova', skip: 'Preskoči', same: 'Moje',
    out: 'Vani', invited: 'Pozvan', bula: 'Bula', refa: 'Refa', passout: 'Svi pas', unscored: 'Bez bodova', dropped: 'Odustao', pot: 'Pot', hand: 'Ruka',
    f: { hand: 'Ruka (bez talona)', open: 'Otvoreni misère i slem', nt: 'Bez aduta', drop: 'Obrana može odustati', invite: 'Pozovi odustalog', mult: 'Isplate × broj licitacije', prefGame: 'Preferans igra (ruka ♥)', aces4: 'Bonus četiri asa', aces0: 'Najava bez asova', deals: 'Dijeljenja',
      scoring: 'Bodovanje', bula: 'Veličina bule', top: 'Najviše igre', pref: 'Igra Preferans (8)', igra: 'Igra (ruka)', step: 'Licitacija korak po korak', same: 'Moje (isto)', refa: 'Refa', kontra: 'Kontra', two: 'Obična dvojka', lead: 'Izlaz kod sansa' },
    v: { on: 'Da', off: 'Ne', bula: 'Bula', pot: 'Pot', swabian: 'Podunavski', sans: 'Sans', sansUno: 'Sans, Uno, Slem', slam: 'Slem', two: 'Do Re', four: 'Do Mort', normal: 'Normalno', kontra: 'Treba kontru', serbia: 'Srpska', slovenia: 'Slovenska', left: 'Lijevo', right: 'Desno' } });
  Object.assign(TX.en, {
    ver: { russian: 'Russian', austrian: 'Austrian', balkan: 'Balkan' }, version: 'Version',
    kinds: { mis: 'Misère', slam: 'Slam', omis: 'Open misère', oslam: 'Open slam', sans: 'NT', uno: 'Uno', pref: 'Pref' }, handTag: 'Hand', igra: 'Game',
    playOn: 'Play', dropOut: 'Drop out', kontraL: ['Kontra', 'Rekontra', 'Sukontra', 'Mortkontra'], invite: 'Invite', announce: 'No aces', skip: 'Skip', same: 'Same',
    out: 'Out', invited: 'Invited', bula: 'Bula', refa: 'Refa', passout: 'All pass', unscored: 'No score', dropped: 'Dropped', pot: 'Pot', hand: 'Hand',
    f: { hand: 'Hand contracts (no talon)', open: 'Open misère & slam', nt: 'No-trump contract', drop: 'Defenders may drop out', invite: 'Invite a dropped defender', mult: 'Payments × bid number', prefGame: 'Preference game (hand ♥)', aces4: 'Four aces bonus', aces0: 'No-aces announcement', deals: 'Deals',
      scoring: 'Scoring', bula: 'Bula size', top: 'Top contracts', pref: 'Preferans contract (8)', igra: 'Game (hand) bids', step: 'Bids rise one step', same: '“Same” (moje) bids', refa: 'Refa', kontra: 'Kontra', two: 'Plain Two', lead: 'Sans lead' },
    v: { on: 'On', off: 'Off', bula: 'Bula', pot: 'Pot', swabian: 'Swabian', sans: 'Sans', sansUno: 'Sans, Uno, Slam', slam: 'Slam', two: 'To Re', four: 'To Mort', normal: 'Normal', kontra: 'Needs kontra', serbia: 'Serbian', slovenia: 'Slovenian', left: 'Left', right: 'Right' } });
  const tx = () => TX[api.S.lang === 'hr' ? 'hr' : 'en'];
  const PFX = { austrian: 'fa_', balkan: 'fb_' };
  // settings rows for a version: [{k, label, vals:[[value,label]]}], honouring which options apply together
  function rows(version, get, pfx) {
    const t = tx(), raw = { version };
    for (const f of P.SCHEMA[version] || []) raw[f.k] = get(pfx + f.k);
    const c = P.cleanOpts(raw);
    return (P.SCHEMA[version] || []).filter(f => !f.vis || f.vis(c)).map(f => ({ k: pfx + f.k, label: t.f[f.k], vals: f.vals.map(x => [x, f.k === 'bula' || f.k === 'deals' ? String(x) : t.v[x]]), cur: c[f.k] }));
  }
  const optsFrom = (version, get, pfx) => { const raw = { version }; for (const f of P.SCHEMA[version] || []) raw[f.k] = get(pfx + f.k); return P.cleanOpts(raw); };
  const gen = () => !!(cur && cur.opts && cur.opts.version && cur.opts.version !== 'russian');
  const BL = () => P.bidsFor(cur ? cur.opts : null);
  const rulesKey = () => { const v = (cur && root && !root.hidden && cur.opts && cur.opts.version) || api.S.fVersion || 'russian'; return v === 'austrian' ? 'fa' : v === 'balkan' ? 'fb' : 'f'; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const $ = s => root.querySelector(s);
  const mul = () => api.S.speed === 'slow' ? 1.6 : api.S.speed === 'fast' ? 0.55 : 1;
  const sleep = ms => { const t = tok; return new Promise((res, rej) => setTimeout(() => t === tok ? res() : rej(new Abort()), ms * mul())); };
  const face = c => Cards.frFace(P.key(c), api.S.fDeck);
  const SG = { S: '♠', D: '♦', C: '♣', H: '♥' };
  const suitH = s => s === 'N' ? `<b>${tx().nt}</b>` : `<b class="${s === 'D' || s === 'H' ? 'red' : ''}">${SG[s]}</b>`;
  const bidHG = b => { const t = tx(), bal = cur && cur.opts.version === 'balkan', main = b.k === 'suit' || b.k === 'sans' ? (bal ? b.n : '') + suitH(b.suit) : `<b>${t.kinds[b.k]}</b>`; return main + (b.hand ? `<sup>${bal ? t.igra : t.handTag}</sup>` : ''); };
  const bidH = idx => { if (gen()) return bidHG(BL()[idx]); const b = P.BIDS[idx]; return b.mis ? tx().misere : `${b.level}${suitH(b.suit)}`; };
  function init(a) { api = a; }
  const nameOf = i => i === 0 ? tx().you : mode === 'net' ? api.botName((ctx.names || {})[i] || '') : api.botName(offNames[i] || '');
  const POS = { 1: 'left', 2: 'right' }, TPOS = ['b', 'l', 'r'];

  function show() {
    root = document.querySelector('#pref');
    for (const id of ['#home', '#table', '#sol', '#uno', '#poker', '#remi', '#tablic', '#gin', '#bridge']) { const el = document.querySelector(id); if (el) el.hidden = true; }
    root.hidden = false; root.style.setProperty('--rr', Cards.frRatio(api.S.fDeck));
    root.innerHTML = `<header class="ubar"><button class="ib" id="prHome" aria-label="${api.L().sol.home}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="chip score" id="prScore"></div>
      <button class="ib" id="prLast" aria-label="${api.L().lastTrick}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/></svg></button>
      <button class="ib" id="prRules" aria-label="${api.L().rules}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg></button>
      <button class="ib" id="prSet" aria-label="${api.L().settings}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button></header>
      <div class="brctr" id="prCtr"></div>
      <div class="brauc prauc" id="prAuc" hidden></div><div class="propen" id="prOpen" hidden></div>
      <div class="brboard"><div class="brseats" id="prSeats"></div><div class="brtrick" id="prTrick"></div></div>
      <div class="tbstatus" id="prStatus"></div><div class="brbox" id="prBox"></div><div class="brhand" id="prHand"></div>`;
    $('#prHome').onclick = leave; $('#prRules').onclick = () => api.showRules(rulesKey()); $('#prLast').onclick = lastTrickSheet; $('#prSet').onclick = () => api.showOpts('f');
    $('#prHand').onclick = e => { const el = e.target.closest('.tbc'); if (el) handTap(el.dataset.id); };
    $('#prBox').onclick = e => { const b = e.target.closest('button'); if (b) boxTap(b); };
  }
  function leave() {
    tok++; clearTimeout(idleTimer); const a = document.querySelector('#awayPill'); if (a) a.remove();
    if (root) root.hidden = true;
    if (mode === 'net' && ctx) ctx.leave(); else api.showHome();
    mode = null;
  }

  // ---------------------------------------------------------------- moves
  const bidOk = idx => !cur.high || idx > cur.high.idx;
  const declOk = idx => idx >= cur.high.idx && !P.BIDS[idx].mis;
  const okFor = idx => myReq && myReq.kind === 'declare' ? declOk(idx) : bidOk(idx);
  function boxTap(b) {
    if (!myReq) return;
    const a = b.dataset.a, k = myReq.kind;
    if (gen() && k !== 'talon') {
      if (a === 'gbid') return submit({ act: 'bid', idx: +b.dataset.v });
      if (a === 'same') return submit({ act: 'same' });
      if (a === 'hand') { selHand = !selHand; render(); return; }
      if (a === 'gdecl') return submit({ act: 'declare', idx: +b.dataset.v });
      if (a === 'pass' && k === 'bid') return submit({ act: 'pass' });
      if (a === 'act') return submit({ act: b.dataset.v });
      return;
    }
    if (k === 'whist') { if (a === 'whist' || a === 'pass') submit({ act: a }); return; }
    if (k === 'talon') { if (a === 'confirm' && selD.size === 2) submit({ act: 'discard', ids: [...selD] }); return; }
    if (k !== 'bid' && k !== 'declare') return;
    if (a === 'pass' && k === 'bid') return submit({ act: 'pass' });
    if (a === 'lv') { selLevel = +b.dataset.v === selLevel ? 0 : +b.dataset.v; render(); return; }
    let idx = -1;
    if (a === 'mis') idx = P.MIS; else if (a === 'den' && selLevel) idx = P.bidIdx(selLevel, b.dataset.v);
    if (idx < 0 || !okFor(idx)) return;
    submit(k === 'bid' ? { act: 'bid', idx } : { act: 'declare', idx });
  }
  function handTap(id) {
    if (!myReq) return;
    if (myReq.kind === 'talon') { selD.has(id) ? selD.delete(id) : (selD.size < 2 && selD.add(id)); render(); return; }
    if (myReq.kind !== 'play') return;
    if (!P.legalPlays(cur.hand, cur.trick, trumpNow()).some(c => c.id === id)) { api.toast(tx().err.follow); return; }
    submit({ act: 'play', card: id });
  }
  const trumpNow = () => cur.raspasy ? null : (cur.contract === null || cur.contract === undefined ? null : P.trumpFor(cur.opts, cur.contract));
  function submit(mv) {
    myReq = null; selLevel = 0; selHand = false; selD = new Set(); clearTimeout(idleTimer);
    if (mode === 'net') ctx.send({ a: 'move', ...mv });
    else if (askRes) { const r = askRes; askRes = null; r(mv); }
    render();
  }

  // ---------------------------------------------------------------- drawing
  function render() {
    { const s = root && root.querySelector('#prSet'); if (s) s.style.display = mode === 'net' ? 'none' : ''; }
    { const l = root && root.querySelector('#prLast'); if (l) l.style.display = api.S['last_f'] === false ? 'none' : ''; }
    if (!cur || !root) return;
    const t = tx(), v = cur;
    $('#prScore').innerHTML = `<span>${t.you}</span><b>${v.scores[0]}</b><small>${v.opts.scoring === 'pool' ? `${v.pool[0]}/${v.opts.pool}` : v.opts.scoring === 'bula' ? `${t.bula} ${v.w[0]}` : `${v.deal}/${v.deals}`}</small>`;
    // strip
    const ctr = $('#prCtr'), tr3 = `${[0, 1, 2].map(i => `<span>${i === 0 ? t.you : esc(nameOf(i))} <b>${v.won[i]}</b></span>`).join('')}`;
    if (v.phase === 'play' || v.phase === 'done') {
      ctr.innerHTML = `${v.raspasy ? `<span class="brct">${t.raspasy}</span>` : v.contract === null || v.contract === undefined ? `<span class="brct">${t.passout}</span>` : `<span class="brct">${bidH(v.contract)}</span>${v.kon ? `<span class="brct">×${2 ** v.kon}</span>` : ''}<span>${t.decl}: <b>${esc(nameOf(v.declarer))}</b></span>`}${tr3}`;
    } else if (v.phase === 'whist' || v.phase === 'declare' || v.phase === 'talon') {
      ctr.innerHTML = `<span class="brct">${bidH(v.contract !== null && v.contract !== undefined ? v.contract : v.high.idx)}</span><span>${t.decl}: <b>${esc(nameOf(v.declarer))}</b></span>`;
    } else ctr.innerHTML = `<span>${v.opts.scoring === 'pool' || !v.deals ? t.dealN(v.deal) : t.deal(v.deal, v.deals)}</span>${v.high ? `<span class="brct">${bidH(v.high.idx)}</span><span><b>${esc(nameOf(v.high.seat))}</b></span>` : ''}`;
    // other seats
    const seats = $('#prSeats'); seats.replaceChildren();
    for (let i = 1; i < 3; i++) {
      const o = document.createElement('div'), n = v.counts[i];
      const turn = v.turn === i;
      o.className = `brseat ${POS[i]}${turn ? ' turn' : ''}`; o.dataset.s = i;
      const backs = Array.from({ length: Math.min(n, 7) }, () => `<span class="tbback">${Cards.frBack(api.S.fDeck, api.S.fBack)}</span>`).join('');
      const g = gen(), tag = v.declarer === i && v.phase !== 'bid' ? t.decl : g ? (v.whist[i] === 'p' ? t.out : v.whist[i] === 'i' ? t.invited : v.whist[i] === 'k' ? t.kontraL[0] : '') : (v.whist[i] === 'w' ? t.whist : '');
      o.innerHTML = `<div class="tbcnt">${backs}</div><b class="tbnm">${esc(nameOf(i))}</b><small>${v.scores[i]}${v.opts.scoring === 'pool' ? ` · ${v.pool[i]}/${v.opts.pool}` : v.opts.scoring === 'bula' ? ` · ${v.w[i]}${v.refa[i] ? ' · R' + v.refa[i] : ''}` : ''}${tag ? ' · ' + tag : ''}</small>`;
      seats.append(o);
    }
    // trick
    const tr = $('#prTrick'); const trick = shownTrick || v.trick;
    if (v.talon && v.talon.length && !trick.length) tr.innerHTML = v.talon.map((c, i) => `<div class="brt ${i ? 'r' : 'l'}"><div class="tbc">${face(c)}</div></div>`).join(''); else
    tr.innerHTML = trick.map(x => `<div class="brt ${TPOS[x.seat]}"><div class="tbc" data-id="${x.card.id}">${face(x.card)}</div></div>`).join('');
    // bids so far
    const au = $('#prAuc');
    if (v.phase === 'bid') {
      const last = {}, sm = {}; v.log.forEach(x => { last[x.seat] = x.idx; sm[x.seat] = !!x.same; });
      au.innerHTML = `<div class="brgrid prgrid">${[1, 2, 0].map(s => `<b class="${s === 0 ? 'me' : ''}">${s === 0 ? t.you : esc(nameOf(s))}</b>`).join('')}${[1, 2, 0].map(s => `<span>${s in last ? (last[s] === null ? t.pass : (sm[s] ? '= ' : '') + bidH(last[s])) : ''}</span>`).join('')}</div>`; au.hidden = false;
    } else au.hidden = true;
    // my hand
    const hand = $('#prHand'), mh = v.hand, W = root.clientWidth || 360, k = mh.length;
    const cw = Math.max(30, Math.min(60, Math.floor((W - 16) / (1 + 0.55 * Math.max(0, k - 1)))));
    hand.style.setProperty('--cw', cw + 'px'); hand.style.height = `calc(var(--cw) * var(--rr) + 16px)`;
    const total = cw + Math.max(0, k - 1) * cw * 0.55, left = (W - total) / 2, play = myReq && myReq.kind === 'play';
    const legal = play ? P.legalPlays(mh, v.trick, trumpNow()).map(c => c.id) : null;
    hand.innerHTML = mh.map((c, i) => `<div class="tbc${play && !legal.includes(c.id) ? ' dim' : ''}${play && legal.includes(c.id) ? ' ok' : ''}${selD.has(c.id) ? ' sel' : ''}" data-id="${c.id}" style="left:${left + i * cw * 0.55}px">${face(c)}</div>`).join('');
    { const op = $('#prOpen'); if (v.open && v.open.length) { op.innerHTML = v.open.map(c => `<div class="tbc">${face(c)}</div>`).join(''); op.hidden = false; } else { op.innerHTML = ''; op.hidden = true; } }
    // status
    const sEl = $('#prStatus'); let msg = '';
    if (myReq) msg = myReq.kind === 'bid' ? t.yourBid : myReq.kind === 'talon' ? t.discard : myReq.kind === 'declare' ? t.declare : myReq.kind === 'whist' ? (gen() ? t.yourTurn : t.whistQ) : t.yourTurn;
    else if (v.turn !== null && v.turn !== undefined && v.turn !== 0) msg = v.phase === 'bid' ? t.bidding(nameOf(v.turn)) : v.phase === 'play' ? t.playing(nameOf(v.turn)) : t.waitingFor(nameOf(v.turn));
    sEl.className = `tbstatus${myReq ? ' yt' : ''}`; sEl.textContent = msg;
    // box
    const box = $('#prBox'), k2 = myReq && myReq.kind;
    if (gen() && k2 && k2 !== 'play' && k2 !== 'talon') { box.innerHTML = genBox(k2, v); box.hidden = false; }
    else if (k2 === 'bid' || k2 === 'declare') {
      const lvOk = l => ['S', 'D', 'C', 'H', 'N'].some(s => okFor(P.bidIdx(l, s)));
      box.innerHTML = `<div class="brlv">${[6, 7, 8, 9, 10].map(l => `<button class="ubtn${selLevel === l ? ' pri' : ''}" data-a="lv" data-v="${l}" ${lvOk(l) ? '' : 'disabled'}>${l}</button>`).join('')}</div>
        <div class="brdn">${['S', 'D', 'C', 'H', 'N'].map(s => `<button class="ubtn" data-a="den" data-v="${s}" ${selLevel && okFor(P.bidIdx(selLevel, s)) ? '' : 'disabled'}>${s === 'N' ? t.nt : suitH(s)}</button>`).join('')}</div>
        <div class="brpx">${k2 === 'bid' ? `<button class="ubtn" data-a="mis" ${okFor(P.MIS) ? '' : 'disabled'}>${t.misere}</button><button class="ubtn" data-a="pass">${t.pass}</button>` : ''}</div>`;
      box.hidden = false;
    } else if (k2 === 'whist') {
      box.innerHTML = `<div class="brpx"><button class="ubtn" data-a="pass">${t.pass}</button><button class="ubtn pri" data-a="whist">${t.whist}</button></div>`; box.hidden = false;
    } else if (k2 === 'talon') {
      box.innerHTML = `<div class="brpx"><button class="ubtn pri" data-a="confirm" ${selD.size === 2 ? '' : 'disabled'}>${t.confirm}</button></div>`; box.hidden = false;
    } else { box.innerHTML = ''; box.hidden = true; }
  }
  function genBox(k, v) {
    const t = tx(), BLs = BL(), btn = (a, label, extra = '', cls = '') => `<button class="ubtn${cls ? ' ' + cls : ''}" data-a="${a}" ${extra}>${label}</button>`;
    if (k === 'bid') {
      const legal = new Set(v.legalBids || []), hasHand = BLs.some(b => b.hand), bal = v.opts.version === 'balkan';
      const btns = BLs.map((b, i) => [b, i]).filter(([b]) => !b.hand).map(([b, i]) => {
        const j = selHand ? BLs.findIndex(x => x.hand && x.k === b.k && x.suit === b.suit && x.n === b.n) : i;
        return btn('gbid', bidHG(BLs[j >= 0 ? j : i]), `data-v="${j}" ${j >= 0 && legal.has(j) ? '' : 'disabled'}`);
      }).join('');
      return `<div class="brgb">${btns}</div><div class="brpx">${hasHand ? btn('hand', bal ? t.igra : t.handTag, '', selHand ? 'pri' : '') : ''}${v.canSame ? btn('same', t.same) : ''}${btn('pass', t.pass)}</div>`;
    }
    if (k === 'declare') return `<div class="brgb">${(v.declOpts || []).map(i => btn('gdecl', bidHG(BLs[i]), `data-v="${i}"`)).join('')}</div>`;
    const lab = { whist: t.playOn, go: t.playOn, pass: k === 'whist' ? t.dropOut : t.pass, drop: t.dropOut, kontra: k === 'kontra' ? t.kontraL[Math.min(3, v.kon)] : t.kontraL[0], invite: t.invite, announce: t.announce, skip: t.skip };
    const acts = k === 'whist' ? v.acts : k === 'kontra' ? ['pass', 'kontra'] : k === 'invite' ? ['pass', 'invite'] : k === 'solo' ? ['drop', 'go'] : ['skip', 'announce'];
    return `<div class="brpx">${acts.map(a => btn('act', lab[a], `data-v="${a}"`, a === 'whist' || a === 'go' || a === 'kontra' || a === 'invite' || a === 'announce' ? 'pri' : '')).join('')}</div>`;
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
    const el = root.querySelector(seat === 0 ? '#prHand' : `.brseat[data-s="${seat}"]`); const b = document.createElement('div'); b.className = 'brbub'; b.innerHTML = html;
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
    if (ev.k === 'deal') { shownTrick = null; myReq = null; selLevel = 0; selD = new Set(); cur = v; render(); return; }
    if (ev.k === 'turn') { cur = v; render(); return; }
    if (ev.k === 'act') {
      cur = v; render();
      const t = tx();
      if (ev.act === 'bid') bubble(ev.seat, bidH(ev.idx), 1300);
      else if (ev.act === 'pass') bubble(ev.seat, gen() && v.whist[ev.seat] === 'p' ? t.dropOut : t.pass, 1100);
      else if (ev.act === 'whist') bubble(ev.seat, gen() ? t.playOn : t.whist, 1100);
      else if (ev.act === 'declare') bubble(ev.seat, bidH(ev.idx), 1300);
      else if (ev.act === 'same') bubble(ev.seat, `= ${bidH(ev.idx)}`, 1300);
      else if (ev.act === 'kontra') bubble(ev.seat, t.kontraL[Math.max(0, Math.min(3, (ev.lvl || 1) - 1))], 1300);
      else if (ev.act === 'invite') bubble(ev.seat, t.invite, 1100);
      else if (ev.act === 'go') bubble(ev.seat, t.playOn, 1100);
      else if (ev.act === 'drop') bubble(ev.seat, t.dropOut, 1100);
      else if (ev.act === 'announce') bubble(ev.seat, t.announce, 1300);
      if (ev.raspasy) bubble(2, t.raspasy, 1500);
      if (ev.passout) bubble(2, t.passout, 1500);
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
    const srcEl = ev.seat === 0 ? root.querySelector(`#prHand [data-id="${c.id}"]`) : root.querySelector(`.brseat[data-s="${ev.seat}"]`);
    const from = srcEl ? rectOf(srcEl) : { left: innerWidth / 2, top: 100, width: 30, height: 45 };
    shownTrick = before.trick.concat([{ seat: ev.seat, card: c }]);
    cur = v; render();
    const el = root.querySelector(`#prTrick .brt.${pos} .tbc`);
    if (el) { el.style.visibility = 'hidden'; await fly(el.innerHTML, from, rectOf(el), 300); el.style.visibility = ''; }
    if (v.trick.length !== 0) shownTrick = null;
  }
  async function onTrick(ev, v) {
    await sleep(450);
    const els = [...root.querySelectorAll('#prTrick .tbc')], to = ev.winner === 0 ? rectOf($('#prHand')) : rectOf(root.querySelector(`.brseat[data-s="${ev.winner}"]`) || $('#prHand'));
    const rects = els.map(rectOf), htmls = els.map(e => e.innerHTML); els.forEach(e => e.style.visibility = 'hidden');
    await Promise.all(rects.map((r, i) => fly(htmls[i], r, { left: to.left + to.width / 2 - 8, top: to.top + to.height / 2 - 12, width: 16, height: 24 }, 320 + i * 30)));
    shownTrick = null; cur = v; render();
  }
  function resultHTML(ev, over) {
    const t = tx(), r = ev.result, v = ev.scores, g = r.bula !== undefined || (r.m !== undefined) || r.passout || r.dropDecl !== undefined;
    const sign = n => n > 0 ? '+' + n : String(n);
    const what = r.passout ? t.passout : r.raspasy ? t.raspasy : `${bidH(r.contract)}${r.kon ? ' ×' + 2 ** r.kon : ''} · ${esc(nameOf(r.declarer))} · ${r.unscored ? t.unscored : r.dropDecl ? t.dropped : r.noPlay ? t.noPlay : r.made ? t.made : t.down}`;
    const title = over ? (ev.over && lastEnd && ev.scores[0] === Math.max(...ev.scores) ? t.won : t.lost) : what;
    const tag = i => g ? (r.whist[i] === 'p' ? ' · ' + t.out : r.whist[i] === 'i' ? ' · ' + t.invited : r.whist[i] === 'k' ? ' · ' + t.kontraL[0] : '') : (r.whist[i] === 'w' ? ' · ' + t.whist : '');
    const ext = r.pool ? [[t.pl, r.pool], [t.mt, r.mount]] : r.bula ? [[t.bula, r.bula]] : [], delta = ext.length > 0;
    const rows = [0, 1, 2].map(i => `<tr${i === r.declarer ? ' class="w"' : ''}><td>${i === 0 ? t.you : esc(nameOf(i))}${tag(i)}</td><td>${r.noPlay || r.passout ? '·' : r.tricks[i]}</td>${delta ? '' : `<td>${sign(r.add[i])}</td>`}${ext.map(e => `<td>${e[1][i]}</td>`).join('')}<td><b>${v[i]}</b>${delta ? `<small> ${sign(r.add[i])}</small>` : ''}</td></tr>`).join('');
    return `<h3>${title}</h3><table class="pis utab"><thead><tr><th></th><th>${t.tricks}</th>${delta ? '' : `<th>${t.points}</th>`}${ext.map(e => `<th>${e[0]}</th>`).join('')}<th>${t.total}</th></tr></thead><tbody>${rows}</tbody></table>${r.passout && r.refa ? `<p class="muted">${t.refa}: ${[0, 1, 2].map(i => r.refa[i]).join(' / ')}</p>` : ''}`;
  }
  function handEndSheet(ev, v) {
    const t = tx(), html = resultHTML(ev, false);
    api.openSheet(`${html}<div class="btns"><button class="pri" id="prNext">${t.next}</button></div>`, s => {
      s.querySelector('#prNext').onclick = () => {
        if (mode === 'net') { ctx.send({ a: 'next' }); const b = s.querySelector('#prNext'); b.disabled = true; b.textContent = api.L().waitOthers(Math.max(1, ctx.nextN || 0), ctx.nextOf || 3); }
        else { api.closeSheet(); if (nextRes) { const r = nextRes; nextRes = null; r(); } }
      };
    });
  }
  async function matchEnd(ev, v) {
    const t = tx(), won = ev.winner === 0, sc = ev.scores;
    const order = [0, 1, 2].sort((a, b) => sc[b] - sc[a]);
    const html = `<h3>${won ? t.won : t.lost}</h3><table class="pis utab"><thead><tr><th></th><th>${t.total}</th></tr></thead><tbody>${order.map(i => `<tr${i === ev.winner ? ' class="w"' : ''}><td>${i === 0 ? t.you : esc(nameOf(i))}</td><td><b>${sc[i]}</b></td></tr>`).join('')}</tbody></table>`;
    if (mode === 'net') { if (ctx.matchDone) ctx.matchDone(); } else { clearSave(); record(won); }
    await api.fx(won, { cards: won ? [] : [...root.querySelectorAll('#prHand .tbc')], stats: html });
    const btns = mode === 'net'
      ? `<button class="sec" id="prX">${t.home}</button><button class="sec" id="prT">${api.L().tables}</button><button class="pri" id="prA">${api.L().playAgain}</button>`
      : `<button class="sec" id="prX">${t.home}</button><button class="pri" id="prA">${t.again}</button>`;
    api.openSheet(`${html}<p class="muted" id="ratingLine">${ctx && ctx.rating ? `${api.L().rating} ${ctx.rating.r} (${ctx.rating.d >= 0 ? '+' : ''}${ctx.rating.d})` : ''}</p><div class="btns">${btns}</div>`, s => {
      s.querySelector('#prX').onclick = () => { api.closeSheet(); leave(); };
      const T2 = s.querySelector('#prT'); if (T2) T2.onclick = () => { api.closeSheet(); leave(); ctx.lobby('f'); };
      s.querySelector('#prA').onclick = () => {
        if (mode === 'net') { ctx.send({ a: 'again' }); const b = s.querySelector('#prA'); b.disabled = true; b.textContent = api.L().waitOthers(1, ctx.againOf || 1); }
        else { api.closeSheet(); start(); }
      };
    });
  }

  // ---------------------------------------------------------------- offline match
  const ckpt = at => { if (!st) return; api.S.prefSave = { st: JSON.stringify(st), at, levels, names: offNames, t: Date.now() }; api.save(); };
  const clearSave = () => { if (api.S.prefSave) { api.S.prefSave = null; api.save(); } };
  const hasSaved = () => !!(api && api.S.prefSave);
  function record(won) { const S = api.S; S.prefStats = S.prefStats || {}; const r = S.prefStats[levels[1]] = S.prefStats[levels[1]] || [0, 0]; r[won ? 0 : 1]++; api.save(); }
  function makeHost(opts, saved) {
    const h = {
      opts, saved, st: null, turn: null, fromHuman: false,
      io: { sleep: ms => sleep(ms), level: s => levels[s], send: (seat, m) => { if (m.t === 'reject') api.toast(tx().err[m.rule] || tx().bad); }, waitNext: () => new Promise(res => { nextRes = res; }) },
      emit(ev) { const v = P.view(h.st, 0); v.turn = h.turn === null ? null : h.turn; enqueue(() => handle(ev, v)); },
      checkpoint: async at => ckpt(at),
      async getAction(seat, req, bot) {
        h.fromHuman = false;
        if (seat === 0) {
          await chain;
          const tk = (+api.S.takeover || 0) * 1000, my = tok;
          const a = await new Promise(res => {
            askRes = res; myReq = req; selLevel = 0; selD = new Set(); cur = P.view(h.st, 0); cur.turn = 0; render();
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
    api.closeSheet(); show(); mode = 'off'; chain = Promise.resolve(); cur = null; lastEnd = null; tok++; myReq = null; shownTrick = null; selD = new Set();
    const S = api.S;
    if (!saved) {
      clearSave();
      levels = [null, S.fLevel || 'cardshark', S.fLevel || 'cardshark']; levels[0] = levels[1];
      const pn = api.pickBotNames({ 1: levels[1], 2: levels[2] }); offNames = [null, pn[1], pn[2]];
      st = null;
    } else { levels = saved.levels; offNames = saved.names; }
    const ver = S.fVersion || 'russian';
    const opts = saved ? JSON.parse(saved.st).opts : ver === 'russian' ? { version: 'russian', players: 3, deals: S.fDeals || 6, scoring: S.fScoring === 'pool' ? 'pool' : 'simple', pool: S.fPool || 6, poolEnd: S.fPoolEnd, poolCap: S.fPoolCap } : optsFrom(ver, k => S[k], PFX[ver]);
    P.run(makeHost(opts, saved ? { st: saved.st, at: saved.at } : null)).catch(e => { if (!(e instanceof Abort)) console.error(e); });
  }
  const start = () => begin(null);
  const resume = () => begin(api.S.prefSave);

  // ---------------------------------------------------------------- online
  function onNet(m, c) {
    ctx = c; mode = 'net';
    if (m.t === 'start') { show(); chain = Promise.resolve(); cur = null; lastEnd = null; myReq = null; shownTrick = null; selD = new Set(); tok++; if (m.names) ctx.names = m.names; api.closeSheet(); return; }
    if (!root || root.hidden) { if (m.t === 'state' || m.t === 'ev') show(); else return; }
    if (m.names) ctx.names = m.names;
    if (m.t === 'state') { cur = m.view; shownTrick = null; render(); return; }
    if (m.t === 'ev') { if (m.ev.k === 'deal') { api.closeSheet(); ctx.nextN = 0; } const v = m.view; enqueue(() => handle(m.ev, v)); return; }
    if (m.t === 'ask') { const req = m.req; enqueue(() => { const a = document.querySelector('#awayPill'); if (a) a.remove(); myReq = req; selLevel = 0; selHand = false; selD = new Set(); render(); }); return; }
    if (m.t === 'away') { myReq = null; render(); showAway(); return; }
    if (m.t === 'reject') { api.toast(tx().err[m.rule] || tx().bad); return; }
    if (m.t === 'bots') { ctx.botSeats = m.seats; return; }
    if (m.t === 'rating') { ctx.rating = m.change; const el = document.querySelector('#ratingLine'); if (el && m.change) el.textContent = `${api.L().rating} ${m.change.r} (${m.change.d >= 0 ? '+' : ''}${m.change.d})`; return; }
    if (m.t === 'next') { ctx.nextN = m.n; ctx.nextOf = m.of; const b = document.querySelector('#prNext'); if (b && b.disabled) b.textContent = api.L().waitOthers(m.n, m.of); return; }
    if (m.t === 'again') { ctx.againOf = m.of; const b = document.querySelector('#prA'); if (b && b.disabled) b.textContent = api.L().waitOthers(m.n, m.of); return; }
    if (m.t === 'error') { api.toast(String(m.msg || 'error')); return; }
  }
  function showAway() {
    let el = document.querySelector('#awayPill');
    if (!el) { el = document.createElement('button'); el.id = 'awayPill'; root.appendChild(el); }
    el.innerHTML = `<span class="ap-s">${api.L().botPlays}</span><b>${api.L().takeOver}</b>`;
    el.onclick = () => { ctx.send({ a: 'back' }); el.remove(); };
  }
  return { init, start, resume, hasSaved, onNet, tx, TX, rows, optsFrom, PFX,  get state() { return st; } };
})();
if (typeof module !== 'undefined') module.exports = PrefUI;
