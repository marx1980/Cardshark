// ===================== ULTI (Hungarian, 3 players) =====================
// 32-card Hungarian pack (Piros hearts, Tök bells, Zöld leaves, Makk acorns; 7 8 9 X Alsó Felső Király Ász), 10 cards each and a 2-card talon.
// Rank with a trump suit (every suit): A X K O U 9 8 7. Without trumps (betli, colourless durchmars): A K O U X 9 8 7.
// Card points: aces and tens 10 each, last trick 10; a king + over (felső) pair "marriage" announced with the first card is worth 20, or 40 in trumps.
// Bidding: the player after the dealer takes the talon, discards two cards and bids. The next player may pass or take the talon (the
// discards), put two cards back and bid higher. Two passes in a row end it. Bids are made of components that are won or lost on their own:
//   P Parti (more points than the defenders) 1, F 40-100 4, T 20-100 8, U Ulti (last trick with the trump seven) 4, A Four aces 4,
//   D Durchmars (all ten tricks) 6, B Betli (no trick, no trumps) 5; open (terített) durchmars 12, open betli (rebetli) 10;
//   a trump contract in hearts (Piros) counts double. Ulti and four aces alone carry a Parti (+1). A failed Ulti costs double.
//   Bids are ranked by total value, then fewer components, and must be strictly higher than the one before.
// Play: the declarer leads. Follow suit and beat the highest card if you can, else trump (and overtrump) if you can, else anything.
// Score per component: the declarer wins its value from each defender, or loses it. Kontra (x2), rekontra (x4)... apply per component.
// Silent bonuses (optional): an unbid ulti, 100, durchmars or four aces scores extra; defenders can score a silent ulti or 100.
// Pure module (no I/O): the server and the app both run it.
const Ulti = (() => {
  const RANKS = ['7', '8', '9', '10', 'U', 'O', 'K', 'A'];
  const TRK = { A: 7, '10': 6, K: 5, O: 4, U: 3, '9': 2, '8': 1, '7': 0 };
  const NTK = { A: 7, K: 6, O: 5, U: 4, '10': 3, '9': 2, '8': 1, '7': 0 };
  const PTS = { A: 10, '10': 10 };
  const next = s => (s + 1) % 3;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const makeDeck = () => { const d = []; for (let s = 0; s < 4; s++) for (const r of RANKS) d.push({ id: s + r, s, r }); return d; };
  const CARD = {}; for (const c of makeDeck()) CARD[c.id] = c;
  const fail = rule => { const e = new Error(rule); e.rule = rule; throw e; };
  const sortCards = (a, b) => a.s - b.s || TRK[a.r] - TRK[b.r];
  const key = c => c.id;

  // ---------------------------------------------------------------- options
  const SCHEMA = [
    { k: 'deals', vals: [3, 6, 9, 12], def: 6 },
    { k: 'kontra', vals: ['off', 'one', 'full'], def: 'one' },
    { k: 'red', bool: true, def: true },
    { k: 'aces', bool: true, def: true },
    { k: 'silent', bool: true, def: true },
    { k: 'open', bool: true, def: true },
    { k: 'overtake', bool: true, def: true },
    { k: 'hold7', bool: true, def: true },
  ];
  function cleanOpts(raw) {
    raw = raw && typeof raw === 'object' ? raw : {}; const o = {};
    for (const f of SCHEMA) {
      const v = raw[f.k];
      if (f.bool) o[f.k] = v === undefined || v === null ? f.def : (v === true || v === 'on' || v === 'true' || v === 1);
      else { const m = f.vals.find(x => String(x) === String(v)); o[f.k] = m === undefined ? f.def : m; }
    }
    return o;
  }

  // ---------------------------------------------------------------- bids
  const BV = { P: 1, F: 4, T: 8, U: 4, A: 4, D: 6, B: 5 };
  const compValue = (b, c) => { let v = BV[c]; if (c === 'D' && b.open) v = 12; if (c === 'B' && b.open) v = 10; return b.red ? v * 2 : v; };
  // sel: { nt: 'B'|'D'|undefined, open, red, F, T, U, A, D } -> bid id and components
  function compose(s) {
    if (s.nt === 'B') return { id: s.open ? 'Bo' : 'B', comps: ['B'] };
    if (s.nt === 'D') return { id: s.open ? 'nDo' : 'nD', comps: ['D'] };
    const ft = s.F ? 'F' : s.T ? 'T' : '';
    let comps = [...(ft ? [ft] : []), ...(s.U ? ['U'] : []), ...(s.A ? ['A'] : []), ...(s.D ? ['D'] : [])];
    if (!comps.length) comps = ['P']; else if (!ft && !s.D) comps.unshift('P');
    return { id: (s.red ? 'r' : 't') + comps.join('') + (s.D && s.open ? 'o' : ''), comps };
  }
  const bidCache = {};
  function bidsFor(o) {
    const k = [o.red, o.aces, o.open].map(x => x ? 1 : 0).join('');
    if (bidCache[k]) return bidCache[k];
    const list = [], by = {};
    const push = (sel, red, nt) => {
      const { id, comps } = compose(sel); if (by[id]) return;
      const b = { id, comps, red, nt, open: !!sel.open && (comps.includes('D') || comps.includes('B')), nc: comps.length };
      b.value = comps.reduce((a, c) => a + compValue(b, c), 0); b.rank = b.value * 10 + (9 - b.nc);
      list.push(b); by[id] = b;
    };
    for (const red of o.red ? [false, true] : [false])
      for (const ft of ['', 'F', 'T']) for (const U of [0, 1]) for (const A of o.aces ? [0, 1] : [0]) for (const D of [0, 1]) for (const open of D && o.open ? [false, true] : [false]) {
        if (D && A) continue;
        push({ red, F: ft === 'F', T: ft === 'T', U, A, D, open }, red, false);
      }
    push({ nt: 'D' }, false, true); push({ nt: 'B' }, false, true);
    if (o.open) { push({ nt: 'D', open: true }, false, true); push({ nt: 'B', open: true }, false, true); }
    list.sort((a, b) => a.rank - b.rank);
    list.by = by; bidCache[k] = list; return list;
  }
  const bidOf = st => bidsFor(st.opts).by[st.bidId];
  const trumpChoices = o => o.red ? [1, 2, 3] : [0, 1, 2, 3];

  // ---------------------------------------------------------------- state
  function newMatch(opts) {
    const o = cleanOpts(opts);
    return { game: 'i', n: 3, opts: o, deal: 0, dealer: 0, scores: [0, 0, 0], matchOver: false, winner: -1, result: null, phase: 'bid', turn: 0, hands: null };
  }
  function newDeal(st) {
    st.deal++; if (st.deal > 1) st.dealer = next(st.dealer);
    const d = shuffle(makeDeck());
    st.hands = [d.splice(0, 10), d.splice(0, 10), d.splice(0, 10)];
    const first = next(st.dealer);
    st.hands[first].push(...d.splice(0, 2)); st.talon = [];
    for (const h of st.hands) h.sort(sortCards);
    Object.assign(st, { phase: 'bid', turn: first, took: first, high: null, passes: 0, log: [], declarer: -1, bidId: null, trump: null, plan: null, kon: null,
      trick: [], trickNo: 0, leader: -1, won: [0, 0, 0], pts: [0, 0, 0], mpts: [0, 0, 0], decl: [], aceBy: [], first: [false, false, false], last: null, lastWin: null,
      played: [], voids: [{}, {}, {}], result: null });
  }

  // ---------------------------------------------------------------- play rules
  const kOf = T => T === null || T === undefined ? NTK : TRK;
  const ctxOf = (st, me) => {
    const b = bidOf(st);
    return { trump: st.trump, over: st.opts.overtake, keep7: me === st.declarer && st.opts.hold7 && st.trump !== null && b.comps.includes('U') && st.trickNo < 9 ? st.trump + '7' : null };
  };
  function legalPlays(hand, trick, x) {
    const T = x.trump, K = kOf(T); let L;
    if (!trick.length) L = hand.slice();
    else {
      const lead = trick[0].card.s, same = hand.filter(c => c.s === lead);
      if (same.length) {
        L = same;
        if (x.over && !(T !== null && lead !== T && trick.some(t => t.card.s === T))) {
          const top = Math.max(...trick.filter(t => t.card.s === lead).map(t => K[t.card.r])), hi = same.filter(c => K[c.r] > top);
          if (hi.length) L = hi;
        }
      } else if (T !== null && hand.some(c => c.s === T)) {
        L = hand.filter(c => c.s === T);
        const tt = trick.filter(t => t.card.s === T);
        if (x.over && tt.length) { const top = Math.max(...tt.map(t => K[t.card.r])), hi = L.filter(c => K[c.r] > top); if (hi.length) L = hi; }
      } else L = hand.slice();
    }
    if (x.keep7 && L.length > 1) { const f = L.filter(c => c.id !== x.keep7); if (f.length) L = f; }
    return L;
  }
  function trickWinner(trick, T) {
    const K = kOf(T); let b = trick[0];
    for (const x of trick.slice(1)) { const a = x.card, c = b.card; if (a.s === c.s ? K[a.r] > K[c.r] : (T !== null && a.s === T)) b = x; }
    return b.seat;
  }
  const marriages = (hand, T) => T === null ? [] : [0, 1, 2, 3].filter(s => hand.some(c => c.s === s && c.r === 'K') && hand.some(c => c.s === s && c.r === 'O')).map(s => ({ suit: s, pts: s === T ? 40 : 20 }));
  const defendersOf = st => [next(st.declarer), next(next(st.declarer))];

  // play one card into the state (shared by the real game and by the bots' simulations)
  function applyPlay(st, seat, card) {
    const T = st.trump, hand = st.hands[seat]; let decl = [];
    if (!st.first[seat]) {
      st.first[seat] = true;
      decl = marriages(hand, T).map(m => ({ seat, suit: m.suit, pts: m.pts }));
      for (const m of decl) { st.decl.push(m); st.mpts[seat] += m.pts; }
    }
    hand.splice(hand.findIndex(c => c.id === card.id), 1);
    if (st.trick.length) {
      const lead = st.trick[0].card.s;
      if (card.s !== lead) { st.voids[seat][lead] = true; if (T !== null && card.s !== T) st.voids[seat][T] = true; }
    }
    st.trick.push({ seat, card }); st.played.push(card.id);
    if (st.trick.length < 3) { st.turn = next(seat); return { decl, trick: null }; }
    const w = trickWinner(st.trick, T), tr = st.trick, last = st.trickNo === 9;
    st.won[w]++;
    for (const x of tr) { st.pts[w] += PTS[x.card.r] || 0; if (x.card.r === 'A') st.aceBy.push(w); }
    if (last) { st.pts[w] += 10; st.lastWin = { seat: w, card: tr.find(x => x.seat === w).card }; }
    st.last = { winner: w, trick: tr.map(x => ({ seat: x.seat, card: x.card })) };
    st.trick = []; st.trickNo++; st.leader = w; st.turn = w;
    return { decl, trick: { winner: w } };
  }

  // ---------------------------------------------------------------- scoring
  function outcomes(st) {
    const b = bidOf(st), d = st.declarer, T = st.trump, [e1, e2] = defendersOf(st);
    const D = st.pts[d] + st.mpts[d], E = st.pts[e1] + st.pts[e2] + st.mpts[e1] + st.mpts[e2] + st.talon.reduce((a, c) => a + (PTS[c.r] || 0), 0);
    const has = n => st.decl.some(m => m.seat === d && m.pts === n);
    const lw = st.lastWin, seven = lw && T !== null && lw.card.s === T && lw.card.r === '7';
    return { D, E, made: {
      P: D > E, F: has(40) && D >= 100, T: has(20) && D >= 100,
      U: !!seven && lw.seat === d, A: st.aceBy.length === 4 && st.aceBy.every(x => x === d),
      D: st.won[d] === 10, B: st.won[d] === 0 }, defSeven: !!seven && lw.seat !== d };
  }
  function settle(st) {
    const o = st.opts, b = bidOf(st), d = st.declarer, T = st.trump, oc = outcomes(st), comps = [];
    let n = 0;
    for (const c of b.comps) {
      const lv = (st.kon && st.kon.lv[c]) || 0, made = oc.made[c], v = compValue(b, c);
      let amt = v * 2 ** lv; if (!made && c === 'U') amt *= 2;
      n += made ? amt : -amt; comps.push({ c, v, lv, made });
    }
    const silent = []; let sd = 0, se = 0;
    if (o.silent && !b.nt) {
      const m = o.red && T === 0 ? 2 : 1, has = c => b.comps.includes(c);
      const add = (k, who, v) => { silent.push({ k, who, v: v * m }); if (who === 'd') sd += v * m; else se += v * m; };
      if (!has('U') && oc.made.U) add('U', 'd', 2);
      if (!has('U') && oc.defSeven) add('U', 'e', 2);
      if (!has('D') && oc.made.D) add('D', 'd', 3);
      if (!has('A') && o.aces && oc.made.A) add('A', 'd', 2);
      if (!has('F') && !has('T') && !has('D')) { if (oc.D >= 100) add('H', 'd', 2); if (oc.E >= 100) add('H', 'e', 2); }
    }
    const net = n + sd - se, add = [0, 0, 0];
    for (const s of [0, 1, 2]) add[s] = s === d ? 2 * net : -net;
    return { declarer: d, bidId: st.bidId, trump: T, comps, silent, D: oc.D, E: oc.E, add, tricks: st.won.slice() };
  }
  function endDeal(st) {
    const r = settle(st); st.phase = 'done'; st.turn = -1;
    r.talon = st.talon.slice(); r.decl = st.decl.slice();
    for (let s = 0; s < 3; s++) st.scores[s] += r.add[s];
    st.result = r;
    if (st.deal >= st.opts.deals && st.deal % 3 === 0) {
      const mx = Math.max(...st.scores);
      if (st.scores.filter(x => x === mx).length === 1) { st.matchOver = true; st.winner = st.scores.indexOf(mx); }
    }
  }

  // ---------------------------------------------------------------- one action
  const konEligible = st => {
    const k = st.kon, b = bidOf(st);
    return b.comps.filter(c => (k.lv[c] || 0) === k.round - 1);
  };
  const konSeats = st => st.kon.round % 2 === 1 ? defendersOf(st) : [st.declarer];
  function startPlay(st) { st.phase = 'play'; st.kon = st.kon || { lv: {} }; st.leader = st.declarer; st.turn = st.declarer; }
  function startKontra(st) {
    if (st.opts.kontra === 'off') return startPlay(st);
    st.kon = { lv: {}, round: 1, idx: 0, raised: false, cap: st.opts.kontra === 'full' ? 6 : 2 };
    st.phase = 'kontra'; st.turn = konSeats(st)[0];
  }
  function endBid(st) {
    const h = st.high, b = bidsFor(st.opts).by[h.id];
    st.declarer = h.seat; st.bidId = h.id;
    if (b.nt) { st.trump = null; return startKontra(st); }
    if (b.red) { st.trump = 0; return startKontra(st); }
    st.phase = 'declare'; st.turn = st.declarer;
  }
  function konNext(st) {
    const k = st.kon, seats = konSeats(st);
    if (k.round % 2 === 1 && k.idx + 1 < seats.length) { k.idx++; st.turn = seats[k.idx]; return; }
    if (!k.raised || k.round >= k.cap) return startPlay(st);
    k.round++; k.idx = 0; k.raised = false;
    if (!konEligible(st).length) return startPlay(st);
    st.turn = konSeats(st)[0];
  }
  function act(st, seat, a) {
    if (st.result || seat !== st.turn) fail('turn');
    const kind = a.act || a.action, B = bidsFor(st.opts);
    if (st.phase === 'bid') {
      if (kind === 'take') {
        if (st.took !== null || !st.high) fail('bad');
        st.hands[seat].push(...st.talon); st.hands[seat].sort(sortCards); st.talon = []; st.took = seat; st.log.push({ seat, act: 'take' });
        return { act: 'take' };
      }
      if (kind === 'pass') {
        if (st.took !== null || !st.high) fail('bad');
        st.passes++; st.log.push({ seat, act: 'pass' });
        if (st.passes >= 2) endBid(st); else st.turn = next(seat);
        return { act: 'pass' };
      }
      if (kind === 'bid') {
        if (st.took !== seat) fail('take');
        const b = B.by[a.id]; if (!b) fail('bid');
        if (st.high && b.rank <= B.by[st.high.id].rank) fail('bid');
        const ids = Array.isArray(a.discard) ? a.discard : [];
        if (ids.length !== 2 || ids[0] === ids[1]) fail('discard');
        const cs = ids.map(id => st.hands[seat].find(c => c.id === id)); if (cs.some(c => !c)) fail('discard');
        st.hands[seat] = st.hands[seat].filter(c => !ids.includes(c.id));
        st.talon = cs; st.took = null; st.high = { id: b.id, seat }; st.passes = 0;
        st.plan = Number.isInteger(a.trump) && a.trump >= 0 && a.trump <= 3 ? a.trump : null;
        st.log.push({ seat, act: 'bid', id: b.id }); st.turn = next(seat);
        return { act: 'bid', id: b.id };
      }
      fail('bad');
    }
    if (st.phase === 'declare') {
      if (kind !== 'declare' || !trumpChoices(st.opts).includes(a.trump)) fail('bad');
      st.trump = a.trump; startKontra(st);
      return { act: 'declare', trump: a.trump };
    }
    if (st.phase === 'kontra') {
      if (kind === 'pass') { konNext(st); return { act: 'pass', kon: true }; }
      if (kind !== 'kontra') fail('bad');
      const el = konEligible(st), cs = Array.isArray(a.comps) ? a.comps.filter((c, i, x) => x.indexOf(c) === i) : [];
      if (!cs.length || cs.some(c => !el.includes(c))) fail('bad');
      for (const c of cs) st.kon.lv[c] = st.kon.round; st.kon.raised = true;
      const lvl = st.kon.round; konNext(st);
      return { act: 'kontra', comps: cs, lvl };
    }
    if (st.phase === 'play') {
      if (kind !== 'play') fail('bad');
      const card = st.hands[seat].find(c => c.id === a.card); if (!card) fail('bad');
      if (!legalPlays(st.hands[seat], st.trick, ctxOf(st, seat)).some(c => c.id === card.id)) fail('follow');
      const r = applyPlay(st, seat, card);
      if (st.trickNo === 10) endDeal(st);
      return { act: 'play', card, decl: r.decl, trick: r.trick };
    }
    fail('bad');
  }

  // ---------------------------------------------------------------- bots
  const LV = { novice: { n: 2, w: 0, rnd: 0.35 }, average: { n: 6, w: 0, rnd: 0 }, pro: { n: 12, w: 8, rnd: 0 }, cardshark: { n: 22, w: 18, rnd: 0 } };
  const lvOf = lv => LV[lv] || LV.average;
  const pts = c => PTS[c.r] || 0;

  // heuristic card choice; reads only my own hand and what is public
  function hPlay(st, me) {
    const T = st.trump, K = kOf(T), hand = st.hands[me], b = bidOf(st), d = st.declarer, isD = me === d, tr = st.trick;
    const L = legalPlays(hand, tr, ctxOf(st, me)); if (L.length === 1) return L[0];
    const isT = c => T !== null && c.s === T, k = c => K[c.r];
    const beats = (a, c) => a.s === c.s ? K[a.r] > K[c.r] : (T !== null && a.s === T);
    const cur = tr.length ? tr.reduce((a, x) => beats(x.card, a.card) ? x : a) : null;
    const wins = c => !cur || beats(c, cur.card), last = tr.length === 2;
    const val = c => (isT(c) ? 20 : 0) + k(c) + pts(c) * 0.5;
    const minBy = (a, f) => a.reduce((x, y) => f(y) < f(x) ? y : x);
    const low = a => minBy(a, val), top = a => minBy(a, c => -val(c));
    const winners = L.filter(wins), losers = L.filter(c => !wins(c));
    const betli = b.comps[0] === 'B', dur = b.comps.includes('D'), ulti = b.comps.includes('U');
    const aceGone = s => st.played.includes(s + 'A') || hand.some(c => c.s === s && c.r === 'A');
    if (betli) {
      if (isD) { if (!cur) return low(L); return losers.length ? minBy(losers, c => -k(c)) : low(winners); }
      if (cur && cur.seat === d && losers.length) return minBy(losers, c => -k(c));
      return low(L);
    }
    if (dur) {
      if (isD) { if (!cur) return minBy(L, c => -((isT(c) ? 100 : 0) + k(c))); return winners.length ? low(winners) : low(L); }
      if (!cur) { const non = L.filter(c => !isT(c)); return minBy(non.length ? non : L, c => -k(c)); }
      if (cur.seat !== d && last) return low(L);
      return winners.length ? low(winners) : low(L);
    }
    const keep7 = c => ulti && isD && isT(c) && c.r === '7';
    const LL = L.filter(c => !keep7(c)).length ? L.filter(c => !keep7(c)) : L;
    if (isD) {
      if (!cur) {
        const trumps = LL.filter(isT), out = 8 - hand.filter(isT).length - st.played.filter(id => +id[0] === T).length;
        if (trumps.length && hand.filter(isT).length >= 3 && trumps.some(c => k(c) >= 5) && out > 0) return minBy(trumps, c => -k(c));
        const aces = LL.filter(c => c.r === 'A' && !isT(c)); if (aces.length) return aces[0];
        const tens = LL.filter(c => c.r === '10' && !isT(c) && aceGone(c.s)); if (tens.length) return tens[0];
        const non = LL.filter(c => !isT(c)); return low(non.length ? non : LL);
      }
      const w = winners.filter(c => !keep7(c)); if (winners.length) return low(w.length ? w : winners);
      return low(LL);
    }
    if (!cur) {
      const trumps = L.filter(isT);
      if (ulti && trumps.length) return trumps.some(c => k(c) >= 6) ? minBy(trumps, c => -k(c)) : low(trumps);
      const aces = L.filter(c => c.r === 'A' && !isT(c)); if (aces.length) return aces[0];
      const tens = L.filter(c => c.r === '10' && !isT(c) && aceGone(c.s)); if (tens.length) return tens[0];
      const non = L.filter(c => !isT(c)); return low(non.length ? non : L);
    }
    if (cur.seat !== d) {
      if (last) return minBy(L, c => -pts(c) * 10 + k(c));
      return low(L);
    }
    return winners.length ? low(winners) : low(L);
  }

  const fork = st => ({ ...st, hands: st.hands.map(h => h.slice()), trick: st.trick.slice(), won: st.won.slice(), pts: st.pts.slice(), mpts: st.mpts.slice(),
    decl: st.decl.slice(), aceBy: st.aceBy.slice(), first: st.first.slice(), played: st.played.slice(), voids: st.voids.map(v => ({ ...v })) });
  const finish = sim => { while (sim.trickNo < 10) { const s = sim.turn; applyPlay(sim, s, hPlay(sim, s)); } return sim; };

  // cards a defender may assume the declarer holds (from the bid) and announced marriages
  function reqFor(st, me, known) {
    const out = [], d = st.declarer, T = st.trump; if (T === null || T === undefined) return out;
    const b = bidOf(st);
    if (me !== d) {
      if (b.comps.includes('F')) { out.push({ seat: d, id: T + 'K' }, { seat: d, id: T + 'O' }); }
      if (b.comps.includes('U')) out.push({ seat: d, id: T + '7' });
      if (b.comps.includes('A')) for (let s = 0; s < 4; s++) out.push({ seat: d, id: s + 'A' });
    }
    for (const m of st.decl) if (m.seat !== me) out.push({ seat: m.seat, id: m.suit + 'K' }, { seat: m.seat, id: m.suit + 'O' });
    return out.filter(r => !known.has(r.id));
  }
  // a complete deal consistent with what `me` has seen: hidden hands (and a defender's unknown talon) dealt at random
  function makeWorld(st, me) {
    const known = new Set(st.hands[me].map(c => c.id).concat(st.played)), d = st.declarer, b = bidOf(st);
    const w = fork(st);
    if (me === d) for (const c of st.talon) known.add(c.id);
    let seats = [0, 1, 2].filter(s => s !== me);
    const openKnown = b.open && st.trickNo >= 1 && me !== d;
    if (openKnown) { seats = seats.filter(s => s !== d); for (const c of st.hands[d]) known.add(c.id); }
    const pool = makeDeck().filter(c => !known.has(c.id)), need = {}; for (const s of seats) need[s] = st.hands[s].length;
    const req = reqFor(st, me, known), talonN = me === d || openKnown ? 0 : 2;
    for (let att = 0; att < 30; att++) {
      const strict = att < 29, hs = {}, used = new Set(); for (const s of seats) hs[s] = [];
      for (const r of req) if (!used.has(r.id) && hs[r.seat] && hs[r.seat].length < need[r.seat]) { hs[r.seat].push(CARD[r.id]); used.add(r.id); }
      let rest = shuffle(pool.filter(c => !used.has(c.id)));
      const talon = [];
      if (talonN) for (let i = 0; i < rest.length && talon.length < talonN; i++) if (!pts(rest[i])) { talon.push(rest[i]); rest[i] = null; }
      rest = rest.filter(Boolean);
      const allow = c => seats.filter(s => hs[s].length < need[s] && !(strict && st.voids[s][c.s]));
      rest.sort((x, y) => allow(x).length - allow(y).length);
      let ok = true;
      for (const c of rest) { const a = allow(c); if (!a.length) { ok = false; break; } hs[a[Math.floor(Math.random() * a.length)]].push(c); }
      if (!ok || seats.some(s => hs[s].length !== need[s])) continue;
      for (const s of seats) w.hands[s] = hs[s].sort(sortCards);
      if (talonN) w.talon = talon;
      return w;
    }
    for (const s of seats) w.hands[s] = shuffle(pool.slice()).splice(0, need[s]);
    return w;
  }

  // card choice by sampling complete deals and playing each candidate out
  function mcPlay(st, me, W) {
    const L = legalPlays(st.hands[me], st.trick, ctxOf(st, me)); if (L.length === 1) return L[0];
    const sc = L.map(() => 0);
    for (let i = 0; i < W; i++) {
      const w = makeWorld(st, me);
      L.forEach((c, j) => { const s = fork(w); applyPlay(s, me, s.hands[me].find(x => x.id === c.id)); sc[j] += settle(finish(s)).add[me]; });
    }
    const h = hPlay(st, me); let bi = L.findIndex(c => c.id === h.id);
    L.forEach((c, j) => { if (sc[j] > sc[bi] + 1e-9) bi = j; });
    return L[bi];
  }

  // two cards to put down: trump contracts keep trumps, aces, tens and marriages; betli sheds its highest cards; a colourless durchmars its lowest
  function pickDiscard(hand, T, mode) {
    const keep = c => {
      if (mode === 'high') return -NTK[c.r];
      if (mode === 'low') return NTK[c.r];
      let v = TRK[c.r] + pts(c) * 0.6;
      if (T !== null && c.s === T) v += 20 + (c.r === '7' ? 30 : 0);
      if (c.r === 'A') v += 6;
      if ((c.r === 'K' || c.r === 'O') && hand.some(x => x.s === c.s && x.r === (c.r === 'K' ? 'O' : 'K'))) v += 18;
      if (c.r === '10' && hand.some(x => x.s === c.s && x.r === 'A')) v += 4;
      return v;
    };
    return hand.slice().sort((a, b) => keep(a) - keep(b) || a.s - b.s).slice(0, 2);
  }
  function feasible(b, h, T) {
    const tr = T === null ? [] : h.filter(c => c.s === T), mar = marriages(h, T);
    for (const c of b.comps) {
      if (c === 'F' && !mar.some(m => m.pts === 40)) return false;
      if (c === 'T' && !mar.some(m => m.pts === 20)) return false;
      if (c === 'U' && !(tr.some(c => c.r === '7') && tr.length >= 3)) return false;
      if (c === 'A' && h.filter(c => c.r === 'A').length < 4) return false;
      if (c === 'D' && !(h.filter(c => c.r === 'A' || c.r === '10').length >= 5 || (tr.length >= 6 && tr.filter(c => TRK[c.r] >= 5).length >= 2))) return false;
    }
    return true;
  }
  const simFor = (st, me, hand, talon, b, T, opp) => {
    const hands = []; hands[me] = hand.slice(); hands[next(me)] = opp[0].slice(); hands[next(next(me))] = opp[1].slice();
    return { game: 'i', opts: st.opts, declarer: me, bidId: b.id, trump: T, hands, talon, trick: [], trickNo: 0, leader: me, turn: me, won: [0, 0, 0], pts: [0, 0, 0], mpts: [0, 0, 0],
      decl: [], aceBy: [], first: [false, false, false], voids: [{}, {}, {}], played: [], kon: { lv: {} }, lastWin: null, phase: 'play' };
  };
  // best contract (bid, trump, discards) for a 12-card hand: simulated games against random deals of the other 20 cards
  function plan(st, me, lv, h12, minRank) {
    const P = lvOf(lv), o = st.opts, B = bidsFor(o), have = new Set(h12.map(c => c.id));
    const pool = makeDeck().filter(c => !have.has(c.id)), spl = [];
    for (let i = 0; i < P.n; i++) { const p = shuffle(pool.slice()); spl.push([p.slice(0, 10), p.slice(10)]); }
    let best = null;
    const tryBids = (T, dis, bids) => {
      const h10 = h12.filter(c => !dis.includes(c)), cs = bids.filter(b => b.rank > minRank && feasible(b, h10, T));
      for (const b of cs) {
        let ev = 0; for (const opp of spl) ev += settle(finish(simFor(st, me, h10, dis, b, T, opp))).add[me];
        ev /= spl.length; if (!best || ev > best.ev) best = { ev, id: b.id, trump: T, discard: dis.map(c => c.id) };
      }
    };
    for (let T = 0; T < 4; T++) tryBids(T, pickDiscard(h12, T, 'pts'), B.filter(b => !b.nt && (b.red ? T === 0 : (!o.red || T !== 0))));
    tryBids(null, pickDiscard(h12, null, 'high'), B.filter(b => b.nt && b.comps[0] === 'B'));
    tryBids(null, pickDiscard(h12, null, 'low'), B.filter(b => b.nt && b.comps[0] === 'D'));
    return best;
  }
  function cheapest(st, me, h12, minRank) {
    const B = bidsFor(st.opts), b = B.find(x => x.rank > minRank) || B[B.length - 1];
    const cnt = [0, 1, 2, 3].map(s => h12.filter(c => c.s === s).length);
    let T = b.nt ? null : b.red ? 0 : trumpChoices(st.opts).filter(t => b.red ? t === 0 : t !== 0 || !st.opts.red).sort((x, y) => cnt[y] - cnt[x])[0];
    if (T === undefined) T = 1;
    const dis = pickDiscard(h12, T, b.nt ? (b.comps[0] === 'B' ? 'high' : 'low') : 'pts');
    return { id: b.id, trump: T, discard: dis.map(c => c.id), ev: -9 };
  }
  function botBid(st, me, lv) {
    const cur = st.high ? bidsFor(st.opts).by[st.high.id] : null, min = cur ? cur.rank : -1;
    if (st.took === me) {
      const p = plan(st, me, lv, st.hands[me], min) || cheapest(st, me, st.hands[me], min);
      return { act: 'bid', id: p.id, trump: p.trump, discard: p.discard };
    }
    const h10 = st.hands[me], unseen = makeDeck().filter(c => !h10.some(x => x.id === c.id));
    let tot = 0; const reps = lv === 'pro' || lv === 'cardshark' ? 2 : 1;
    for (let r = 0; r < reps; r++) { const p = plan(st, me, lv, h10.concat(shuffle(unseen.slice()).slice(0, 2)), min); tot += p ? p.ev : -9; }
    const noise = lv === 'novice' ? (Math.random() - 0.4) * 5 : 0;
    return { act: tot / reps + noise >= 0.4 ? 'take' : 'pass' };
  }
  function botDeclare(st, me) {
    const ok = trumpChoices(st.opts);
    if (ok.includes(st.plan)) return { act: 'declare', trump: st.plan };
    const h = st.hands[me], sc = t => h.filter(c => c.s === t).reduce((a, c) => a + 1 + TRK[c.r] / 8, 0);
    return { act: 'declare', trump: ok.slice().sort((a, b) => sc(b) - sc(a))[0] };
  }
  function botKontra(st, me, lv) {
    const P = lvOf(lv), el = konEligible(st); if (lv === 'novice' || !el.length) return { act: 'pass' };
    const W = Math.max(10, P.n), isDef = me !== st.declarer, thr = lv === 'cardshark' ? 0.82 : 0.88, win = {};
    for (const c of el) win[c] = 0;
    for (let i = 0; i < W; i++) { const m = outcomes(finish(makeWorld(st, me))).made; for (const c of el) if (m[c]) win[c]++; }
    const pick = el.filter(c => isDef ? 1 - win[c] / W >= thr : win[c] / W >= thr + 0.04);
    return pick.length ? { act: 'kontra', comps: pick } : { act: 'pass' };
  }
  function botPlay(st, me, lv) {
    const P = lvOf(lv);
    if (P.rnd && Math.random() < P.rnd) { const L = legalPlays(st.hands[me], st.trick, ctxOf(st, me)); return { act: 'play', card: L[Math.floor(Math.random() * L.length)].id }; }
    const c = P.w ? mcPlay(st, me, P.w) : hPlay(st, me);
    return { act: 'play', card: c.id };
  }
  function bot(st, me, lv) {
    lv = lv || 'average';
    if (st.phase === 'bid') return botBid(st, me, lv);
    if (st.phase === 'declare') return botDeclare(st, me);
    if (st.phase === 'kontra') return botKontra(st, me, lv);
    return botPlay(st, me, lv);
  }

  // ---------------------------------------------------------------- views (every player sits at seat 0 on their own screen)
  const rel = (s, me) => s === null || s === undefined || s < 0 ? s : ((s - me) % 3 + 3) % 3;
  const perm = (a, me) => Array.isArray(a) ? [0, 1, 2].map(r => a[(me + r) % 3]) : a;
  function view(st, me) {
    const b = st.bidId ? bidOf(st) : null, d = st.declarer;
    return {
      game: 'i', n: 3, opts: st.opts, deal: st.deal, deals: st.opts.deals, dealer: rel(st.dealer, me), phase: st.phase,
      took: st.took === me, high: st.high ? { id: st.high.id, seat: rel(st.high.seat, me) } : null, passes: st.passes,
      log: (st.log || []).map(x => ({ ...x, seat: rel(x.seat, me) })), declarer: rel(d, me), bidId: st.bidId, trump: st.trump,
      kon: st.kon ? { lv: st.kon.lv, round: st.kon.round || 0, cap: st.kon.cap || 0, el: st.phase === 'kontra' && st.turn === me ? konEligible(st) : [] } : null,
      hand: st.hands && st.hands[me] ? st.hands[me].slice() : [], counts: st.hands ? perm(st.hands.map(h => h.length), me) : [0, 0, 0],
      talon: st.talon && st.took === null && st.hands && st.high && st.high.seat === me ? st.talon.slice() : [],
      trick: (st.trick || []).map(x => ({ seat: rel(x.seat, me), card: x.card })), trickNo: st.trickNo, won: perm(st.won, me), scores: perm(st.scores, me), leader: rel(st.leader, me),
      decl: (st.decl || []).map(m => ({ ...m, seat: rel(m.seat, me) })),
      open: b && b.open && st.trickNo >= 1 && d !== me && st.hands[d] ? st.hands[d].slice() : [],
      last: st.last ? { winner: rel(st.last.winner, me), trick: st.last.trick.map(x => ({ seat: rel(x.seat, me), card: x.card })) } : null,
    };
  }
  function rotEvent(ev, me) {
    const r = { ...ev };
    for (const k of ['seat', 'winner', 'declarer']) if (typeof r[k] === 'number' && r[k] >= 0) r[k] = rel(r[k], me);
    if (Array.isArray(r.decl)) r.decl = r.decl.map(m => ({ ...m, seat: rel(m.seat, me) }));
    if (r.result) { const x = { ...r.result }; for (const k of ['add', 'tricks']) if (Array.isArray(x[k])) x[k] = perm(x[k], me); x.declarer = rel(x.declarer, me); if (x.decl) x.decl = x.decl.map(m => ({ ...m, seat: rel(m.seat, me) })); r.result = x; }
    if (Array.isArray(r.scores)) r.scores = perm(r.scores, me);
    return r;
  }

  // ---------------------------------------------------------------- the match loop (same flow offline and online)
  async function run(h) {
    let st, cont = null;
    if (h.saved) { st = h.st = JSON.parse(h.saved.st); cont = h.saved.at === 'turn' ? 'turn' : null; h.saved = null; }
    else { st = h.st = newMatch(h.opts); st.dealer = Math.floor(Math.random() * 3); st.deal = 0; }
    while (true) {
      if (cont === null) { newDeal(st); h.turn = null; h.emit({ k: 'deal', deal: st.deal }); await h.io.sleep(800); }
      cont = null;
      while (!st.result) {
        const seat = st.turn; h.turn = seat;
        h.emit({ k: 'turn', seat }); await h.checkpoint('turn');
        const req = { kind: st.phase }; if (st.phase === 'kontra') req.comps = konEligible(st);
        const botMove = () => bot(st, seat, h.io.level(seat) || 'average');
        let a = await h.getAction(seat, req, botMove), r;
        try { r = act(st, seat, a); }
        catch (e) {
          if (h.fromHuman) { h.io.send(seat, { t: 'reject', rule: String(e && e.rule || 'bad') }); continue; }
          a = botMove(); r = act(st, seat, a);
        }
        if (r.act === 'play') {
          h.emit({ k: 'play', seat, card: r.card, decl: r.decl });
          if (r.trick) { await h.io.sleep(900); h.emit({ k: 'trick', winner: r.trick.winner }); }
          else await h.io.sleep(350);
        } else {
          h.emit({ k: 'act', seat, act: r.act, id: r.id || null, trump: r.trump === undefined ? null : r.trump, comps: r.comps || null, lvl: r.lvl || 0, kon: !!r.kon });
          await h.io.sleep(r.act === 'bid' || r.act === 'pass' ? 600 : 450);
        }
      }
      h.turn = null;
      h.emit({ k: 'handEnd', result: st.result, scores: st.scores.slice(), deal: st.deal, over: st.matchOver });
      if (st.matchOver) { h.emit({ k: 'matchEnd', winner: st.winner, scores: st.scores.slice() }); return st.winner; }
      await h.checkpoint('handEnd');
      await h.io.waitNext(15000);
    }
  }

  return { SCHEMA, cleanOpts, bidsFor, compose, compValue, trumpChoices, makeDeck, key, sortCards, newMatch, newDeal, act, bot, view, rotEvent, run, legalPlays, ctxOf, trickWinner, marriages, settle, outcomes, konEligible, hPlay, TRK, NTK };
})();
if (typeof module !== 'undefined') module.exports = Ulti;
