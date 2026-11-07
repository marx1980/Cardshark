// ===================== PREFERANS (3 players) =====================
// 32 cards (7–A), 10 each and a 2-card talon. Bidding: 6–10 tricks in a suit (♠ < ♦ < ♣ < ♥ < no trump), misère sits between 9 and 10.
// Forehand (left of the dealer) bids first; a pass is final. If everyone passes the deal is played "raspasy": no trump, every trick
// taken costs a point. The highest bidder takes the talon, discards two cards and names the final contract (not below the bid).
// Each defender then says whist or pass; if both pass the declarer scores the contract without playing. Defenders must win
// 11 – level tricks together to set the contract. Follow suit, otherwise trump if you can.
// Scoring: contract value v = 2 × (level − 5) (misère 10). Made: declarer +v. Down: −v for every missing trick, and each whisting
// defender +v for every missing trick. Every whisting defender also gets v per trick he took. Misère: +10, or −10 per trick taken.
// The match is a fixed number of deals (every player deals equally often); highest total wins.
// Pool & mountain (optional): a made contract fills the declarer's pool (up to the pool target), a failed one adds to his mountain,
// whist points are written against the declarer, and raspasy tricks go to the mountain. Options: the match ends when two pools are
// full (default) or all three (poolEnd 'three'); a closed pool stops at the target (default) or keeps growing (poolCap 'open').
// Everyone's total settles against the table average: pool − average pool, minus mountain − average mountain, plus whists won minus whists lost.
// Pure module (no I/O): the server and the app both run it.
const Pref = (() => {
  const SUITS = ['S', 'D', 'C', 'H'];             // low to high; 'N' = no trump
  const RN = { 11: 'j', 12: 'q', 13: 'k', 14: 'a' };
  const key = c => c.s + (RN[c.r] || c.r);
  const rk = c => c.r;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const makeDeck = () => { const d = []; for (const s of SUITS) for (let r = 7; r <= 14; r++) d.push({ id: s + r, s, r }); return d; };
  const fail = rule => { const e = new Error(rule); e.rule = rule; throw e; };
  // all bids, low to high
  const BIDS = [];
  for (let l = 6; l <= 9; l++) for (const s of [...SUITS, 'N']) BIDS.push({ level: l, suit: s });
  BIDS.push({ level: 10, suit: 'M', mis: true });
  for (const s of [...SUITS, 'N']) BIDS.push({ level: 10, suit: s });
  const bidIdx = (level, suit) => BIDS.findIndex(b => b.level === level && b.suit === suit && !b.mis);
  const MIS = BIDS.findIndex(b => b.mis);
  const value = b => b.mis ? 10 : 2 * (b.level - 5);
  const trumpOf = idx => idx === null || idx === undefined || idx < 0 ? null : (BIDS[idx].suit === 'N' || BIDS[idx].mis ? null : BIDS[idx].suit);
  const next = s => (s + 1) % 3;

  // ---------------------------------------------------------------- state
  function newMatch(opts) {
    const o = cleanOpts(opts); if (o.version !== 'russian') return newMatchG(o);
    return { game: 'f', n: 3, opts: o, pl: [0, 0, 0], mt: [0, 0, 0], wh: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], deal: 0, dealer: 0, scores: [0, 0, 0], hands: null, talon: [], phase: 'bid', turn: 0,
      log: [], passed: [false, false, false], high: null, declarer: -1, contract: null, whist: [null, null, null], trick: [], won: [0, 0, 0],
      leader: 0, last: null, raspasy: false, result: null, matchOver: false, winner: -1, played: 0 };
  }
  function newDeal(st) {
    st.deal++; if (st.deal > 1) st.dealer = next(st.dealer);
    const d = shuffle(makeDeck());
    st.hands = [d.splice(0, 10), d.splice(0, 10), d.splice(0, 10)]; st.talon = d;
    for (const h of st.hands) h.sort(sortCards);
    st.phase = 'bid'; st.turn = next(st.dealer); st.log = []; st.passed = [false, false, false]; st.high = null; st.declarer = -1; st.contract = null;
    st.whist = [null, null, null]; st.trick = []; st.won = [0, 0, 0]; st.last = null; st.raspasy = false; st.result = null; st.played = 0;
    if (isG(st)) resetG(st);
  }
  const sortCards = (a, b) => SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || a.r - b.r;
  const defenders = st => [next(st.declarer), next(next(st.declarer))];

  // ---------------------------------------------------------------- play rules
  function legalPlays(hand, trick, trump) {
    if (!trick.length) return hand.slice();
    const lead = trick[0].card.s, same = hand.filter(c => c.s === lead);
    if (same.length) return same;
    if (trump) { const t = hand.filter(c => c.s === trump); if (t.length) return t; }
    return hand.slice();
  }
  function trickWinner(trick, trump) {
    let best = trick[0];
    for (const x of trick.slice(1)) {
      const a = x.card, b = best.card;
      if (a.s === b.s ? a.r > b.r : (trump && a.s === trump)) best = x;
    }
    return best.seat;
  }
  const curTrump = st => st.raspasy ? null : trumpOf(st.contract);

  // ---------------------------------------------------------------- one action
  function act(st, seat, a) {
    if (isG(st)) return actG(st, seat, a);
    if (st.result || seat !== st.turn) fail('turn');
    const kind = a.act || a.action;
    if (st.phase === 'bid') {
      if (kind === 'pass') {
        st.passed[seat] = true; st.log.push({ seat, idx: null });
        return advanceBid(st, { act: 'pass' });
      }
      if (kind === 'bid') {
        const idx = +a.idx;
        if (!Number.isInteger(idx) || idx < 0 || idx >= BIDS.length || (st.high && idx <= st.high.idx)) fail('bid');
        st.high = { idx, seat }; st.log.push({ seat, idx });
        return advanceBid(st, { act: 'bid', idx });
      }
      fail('phase');
    }
    if (st.phase === 'talon') {
      if (kind !== 'discard' || !Array.isArray(a.ids) || a.ids.length !== 2 || a.ids[0] === a.ids[1]) fail('discard');
      const h = st.hands[seat];
      if (!a.ids.every(id => h.some(c => c.id === id))) fail('card');
      st.hands[seat] = h.filter(c => !a.ids.includes(c.id)); st.phase = 'declare';
      return { act: 'discard' };
    }
    if (st.phase === 'declare') {
      const idx = +a.idx;
      if (kind !== 'declare' || !Number.isInteger(idx) || idx < st.high.idx || idx >= BIDS.length || BIDS[idx].mis) fail('bid');
      st.contract = idx; st.phase = 'whist'; st.turn = defenders(st)[0];
      return { act: 'declare', idx };
    }
    if (st.phase === 'whist') {
      if (kind !== 'whist' && kind !== 'pass') fail('phase');
      st.whist[seat] = kind === 'whist' ? 'w' : 'p';
      const [d1, d2] = defenders(st);
      if (seat === d1) { st.turn = d2; return { act: kind }; }
      if (st.whist[d1] === 'p' && st.whist[d2] === 'p') return endDeal(st, { act: kind });
      startPlay(st); return { act: kind };
    }
    if (st.phase === 'play') {
      if (kind !== 'play') fail('phase');
      const h = st.hands[seat], card = h.find(c => c.id === a.card);
      if (!card) fail('card');
      if (!legalPlays(h, st.trick, curTrump(st)).some(c => c.id === card.id)) fail('follow');
      st.hands[seat] = h.filter(c => c !== card); st.trick.push({ seat, card });
      if (st.trick.length < 3) { st.turn = next(seat); return { act: 'play', card }; }
      const winner = trickWinner(st.trick, curTrump(st));
      st.won[winner]++; st.last = { winner, trick: st.trick.slice() }; st.trick = []; st.leader = winner; st.turn = winner; st.played++;
      const r = { act: 'play', card, trick: { winner } };
      if (st.played === 10) endDeal(st, r);
      return r;
    }
    fail('phase');
  }
  function advanceBid(st, r) {
    const active = [0, 1, 2].filter(s => !st.passed[s]);
    if (active.length === 0) { st.raspasy = true; startPlay(st); return { ...r, raspasy: true }; }
    if (active.length === 1 && st.high) {
      st.declarer = st.high.seat;
      if (BIDS[st.high.idx].mis) { st.contract = st.high.idx; st.phase = 'whist'; st.turn = defenders(st)[0]; st.whist = [null, null, null]; startPlay(st, true); return { ...r, declarer: st.declarer }; }
      st.hands[st.declarer] = st.hands[st.declarer].concat(st.talon).sort(sortCards); st.phase = 'talon'; st.turn = st.declarer;
      return { ...r, declarer: st.declarer };
    }
    let s = next(st.turn); while (st.passed[s]) s = next(s);
    st.turn = s; return r;
  }
  function startPlay(st, mis) {
    st.phase = 'play'; st.trick = [];
    st.leader = st.raspasy ? next(st.dealer) : st.declarer; st.turn = st.leader;
  }
  function settle(st) {
    const avgP = st.pl.reduce((a, b) => a + b, 0) / 3, avgM = st.mt.reduce((a, b) => a + b, 0) / 3;
    return [0, 1, 2].map(i => {
      let w = 0; for (const j of [0, 1, 2]) if (j !== i) w += st.wh[i][j] - st.wh[j][i];
      return Math.round((st.pl[i] - avgP) - (st.mt[i] - avgM) + w);
    });
  }
  function endDeal(st, r) {
    const add = [0, 0, 0], c = st.contract, res = { k: 'deal', add, tricks: st.won.slice(), declarer: st.declarer, contract: c, whist: st.whist.slice(), raspasy: st.raspasy, made: null, noPlay: false };
    if (st.raspasy) { for (let s = 0; s < 3; s++) add[s] = -st.won[s]; res.k = 'raspasy'; }
    else {
      const b = BIDS[c], v = value(b), d = st.declarer, [d1, d2] = defenders(st);
      if (b.mis) {
        const t = st.won[d]; res.made = t === 0; add[d] = t === 0 ? v : -v * t;
      } else if (st.whist[d1] === 'p' && st.whist[d2] === 'p') { res.noPlay = true; res.made = true; add[d] = v; }
      else {
        const t = st.won[d], under = Math.max(0, b.level - t); res.made = t >= b.level;
        add[d] = res.made ? v : -v * under;
        for (const w of [d1, d2]) if (st.whist[w] === 'w') add[w] = v * st.won[w] + (res.made ? 0 : v * under);
      }
    }
    if (st.opts.scoring === 'pool') {
      const T = st.opts.pool, before = st.scores.slice();
      if (st.raspasy) for (let s = 0; s < 3; s++) st.mt[s] += st.won[s];
      else {
        const d = st.declarer;
        if (add[d] > 0) st.pl[d] = st.opts.poolCap === 'open' ? st.pl[d] + add[d] : Math.min(T, st.pl[d] + add[d]); else st.mt[d] += -add[d];
        for (const w of defenders(st)) if (add[w] > 0) st.wh[w][d] += add[w];
      }
      st.scores = settle(st);
      for (let s = 0; s < 3; s++) add[s] = st.scores[s] - before[s];
      res.pool = st.pl.slice(); res.mount = st.mt.slice();
    } else for (let s = 0; s < 3; s++) st.scores[s] += add[s];
    res.scores = st.scores.slice(); st.result = res; st.phase = 'done';
    if (st.opts.scoring === 'pool' ? (st.pl.filter(x => x >= st.opts.pool).length >= (st.opts.poolEnd === 'three' ? 3 : 2) || st.deal >= 30) : st.deal >= st.opts.deals) {
      st.matchOver = true; const m = Math.max(...st.scores); st.winner = st.scores.indexOf(m);
    }
    return { ...r, ended: true };
  }

  // ================================================================ versions: Austrian and Balkan (Russian is the code above)
  const VERSIONS = ['russian', 'austrian', 'balkan'];
  const OO = ['on', 'off'];
  // every option of the two versions; `vis` says when an option applies (the settings screens hide the others)
  const SCHEMA = {
    austrian: [
      { k: 'hand', def: 'on', vals: OO }, { k: 'open', def: 'on', vals: OO }, { k: 'nt', def: 'off', vals: OO },
      { k: 'drop', def: 'on', vals: OO }, { k: 'invite', def: 'off', vals: OO, vis: o => o.drop === 'on' },
      { k: 'mult', def: 'off', vals: OO }, { k: 'prefGame', def: 'off', vals: OO, vis: o => o.hand === 'on' },
      { k: 'aces4', def: 'off', vals: OO }, { k: 'aces0', def: 'off', vals: OO }, { k: 'deals', def: 6, vals: [6, 12] }],
    balkan: [
      { k: 'scoring', def: 'bula', vals: ['bula', 'pot', 'swabian'] },
      { k: 'bula', def: 30, vals: [30, 50], vis: o => o.scoring === 'bula' },
      { k: 'deals', def: 6, vals: [6, 12], vis: o => o.scoring !== 'bula' },
      { k: 'top', def: 'sans', vals: ['sans', 'sansUno', 'slam'] },
      { k: 'pref', def: 'off', vals: OO }, { k: 'igra', def: 'on', vals: OO }, { k: 'step', def: 'on', vals: OO }, { k: 'same', def: 'on', vals: OO },
      { k: 'refa', def: 'on', vals: OO, vis: o => o.scoring === 'bula' },
      { k: 'drop', def: 'on', vals: OO, vis: o => o.scoring !== 'swabian' },
      { k: 'invite', def: 'on', vals: OO, vis: o => o.scoring !== 'swabian' && o.drop === 'on' },
      { k: 'kontra', def: 'two', vals: ['off', 'two', 'four'] },
      { k: 'two', def: 'kontra', vals: ['normal', 'kontra', 'serbia', 'slovenia'], vis: o => o.kontra !== 'off' && o.scoring !== 'swabian' },
      { k: 'lead', def: 'left', vals: ['left', 'right'], vis: o => o.top !== 'slam' }],
  };
  function cleanOpts(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const v = VERSIONS.includes(raw.version) ? raw.version : 'russian';
    if (v === 'russian') {
      const pool = raw.scoring === 'pool';
      return { version: 'russian', players: 3, deals: [6, 12].includes(+raw.deals) ? +raw.deals : 6, scoring: pool ? 'pool' : 'simple', pool: pool ? ([6, 10].includes(+raw.pool) ? +raw.pool : 6) : 0, poolEnd: raw.poolEnd === 'three' ? 'three' : 'two', poolCap: raw.poolCap === 'open' ? 'open' : 'cap' };
    }
    const o = { version: v, players: 3 };
    for (const f of SCHEMA[v]) { const x = raw[f.k], hit = f.vals.find(y => String(y) === String(x)); o[f.k] = hit !== undefined ? hit : f.def; }
    if (v === 'balkan') {
      if (o.scoring === 'swabian') { o.drop = 'off'; o.kontra = o.kontra === 'four' ? 'two' : o.kontra; }
      if (o.scoring !== 'bula') o.refa = 'off';
      if (o.kontra === 'off' || o.scoring === 'swabian') o.two = 'normal';
      if (o.top === 'slam') o.lead = 'left';
    }
    if (o.drop === 'off') o.invite = 'off';
    if (v === 'austrian' && o.hand === 'off') o.prefGame = 'off';
    return o;
  }
  function bidsFor(o) {
    if (!o || !o.version || o.version === 'russian') return BIDS;
    const base = []; let n = 0;
    if (o.version === 'austrian') {
      for (const s of ['C', 'S', 'D', 'H']) base.push({ k: 'suit', suit: s, n: ++n });
      if (o.nt === 'on') base.push({ k: 'sans', suit: 'N', n: ++n });
      base.push({ k: 'mis', n: ++n, v: 10 }, { k: 'slam', n: ++n, v: 20 });
      if (o.open === 'on') base.push({ k: 'omis', n: ++n, v: 30 }, { k: 'oslam', n: ++n, v: 40 });
      const out = base.map(b => ({ ...b, hand: false }));
      if (o.hand === 'on') out.push(...base.map(b => ({ ...b, hand: true })));
      return out;
    }
    n = 1;
    for (const s of ['S', 'D', 'H', 'C']) base.push({ k: 'suit', suit: s, n: ++n });
    base.push({ k: 'mis', n: ++n });
    if (o.top === 'sans') base.push({ k: 'sans', suit: 'N', n: ++n });
    else if (o.top === 'sansUno') base.push({ k: 'sans', suit: 'N', n: ++n }, { k: 'uno', n: ++n }, { k: 'slam', n: ++n });
    else base.push({ k: 'slam', n: ++n });
    if (o.pref === 'on') base.push({ k: 'pref', n: ++n });
    const out = base.map(b => ({ ...b, hand: false }));
    if (o.igra === 'on') out.push(...base.filter(b => b.k === 'suit').map(b => ({ ...b, hand: true })));
    return out;
  }
  const isG = st => !!(st.opts && st.opts.version && st.opts.version !== 'russian');
  const gb = st => st.bids || (st.bids = bidsFor(st.opts));
  const isMis = b => b.k === 'mis' || b.k === 'omis', isAll = b => b.k === 'slam' || b.k === 'oslam' || b.k === 'pref', isOpen = b => b.k === 'omis' || b.k === 'oslam';
  const plainK = b => b.k === 'suit' || b.k === 'sans';
  const trumpG = b => b && b.k === 'suit' ? b.suit : null;
  const trumpFor = (o, idx) => idx === null || idx === undefined || idx < 0 ? null : (o && o.version && o.version !== 'russian' ? trumpG(bidsFor(o)[idx]) : trumpOf(idx));
  const nextActive = (st, seat) => { let s = next(seat); while (!st.active.includes(s)) s = next(s); return s; };
  const refaMax = o => o.bula === 50 ? 3 : 1;

  function newMatchG(o) {
    const T = o.bula || 30, F = false;
    return { game: 'f', n: 3, opts: o, pl: [0, 0, 0], mt: [0, 0, 0], wh: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], deal: 0, dealer: 0, scores: [0, 0, 0], hands: null, talon: [], phase: 'bid', turn: 0,
      log: [], passed: [F, F, F], high: null, declarer: -1, contract: null, whist: [null, null, null], trick: [], won: [0, 0, 0],
      leader: 0, last: null, raspasy: false, result: null, matchOver: false, winner: -1, played: 0,
      bids: bidsFor(o), w: [T, T, T], juha: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], refa: [0, 0, 0], pot: o.version === 'austrian' ? 60 : 600, numBid: [F, F, F], active: [0, 1, 2], host: -1, inv: -1, kon: 0, noAces: false, noAcesOk: false, aces4: false, noPlay: false, dropDecl: false, refaUsed: false, talonShown: false, discarded: [] };
  }
  function resetG(st) {
    st.numBid = [false, false, false]; st.active = [0, 1, 2]; st.host = -1; st.inv = -1; st.kon = 0; st.noAces = false; st.noAcesOk = false; st.aces4 = false;
    st.noPlay = false; st.dropDecl = false; st.refaUsed = false; st.talonShown = false; st.discarded = [];
  }
  function declOptions(st) {
    const B = gb(st), hi = B[st.high.idx], out = [];
    B.forEach((b, i) => {
      if (b.hand || i < st.high.idx) return;
      if (st.opts.version === 'austrian') { if (plainK(hi) ? plainK(b) : i === st.high.idx) out.push(i); }
      else out.push(i);
    });
    return out;
  }
  function legalBidG(st, seat, idx) {
    const B = gb(st), b = B[idx]; if (!b) return false;
    if (st.high && idx <= st.high.idx) return false;
    if (st.opts.version === 'balkan') {
      if (b.hand) return !st.numBid[seat];
      if (st.opts.step === 'on') return idx === (st.high ? st.high.idx + 1 : 0);
    }
    return true;
  }
  const canSame = (st, seat) => st.opts.version === 'balkan' && st.opts.same === 'on' && st.phase === 'bid' && !!st.high && st.high.seat !== seat && !st.high.matched && !st.passed[seat] && st.log.some(x => x.seat === seat && x.idx !== null);
  const twoSpecial = (st, b) => st.opts.version === 'balkan' && st.opts.two !== 'normal' && b.k === 'suit' && !b.hand && b.n === 2;
  function defActs(st) {
    const o = st.opts, b = gb(st)[st.contract], two = twoSpecial(st, b), acts = [];
    if (!two) acts.push('whist');
    if ((o.drop === 'on' && plainK(b)) || two) acts.push('pass');
    if (o.version === 'balkan' && o.kontra !== 'off' && plainK(b)) acts.push('kontra');
    return acts;
  }
  const needT = (st, b) => {
    if (plainK(b)) { let n = 6; if (st.opts.scoring === 'swabian') { if (b.suit === 'S') n++; if (b.hand) n++; } return n; }
    return isAll(b) ? 10 : 0;
  };
  const madeG = (st, b, t) => b.k === 'uno' ? t === 1 : isMis(b) ? t === 0 : t >= needT(st, b);

  function actG(st, seat, a) {
    if (st.result || seat !== st.turn) fail('turn');
    const kind = a.act || a.action, o = st.opts, B = gb(st), bk = o.version === 'balkan';
    const [d1, d2] = st.declarer >= 0 ? defenders(st) : [-1, -1];
    switch (st.phase) {
      case 'bid': {
        if (kind === 'pass') { st.passed[seat] = true; st.log.push({ seat, idx: null }); return advanceG(st, { act: 'pass' }); }
        if (kind === 'same') {
          if (!canSame(st, seat)) fail('bid');
          st.high = { idx: st.high.idx, seat, matched: true }; st.log.push({ seat, idx: st.high.idx, same: true });
          return advanceG(st, { act: 'same', idx: st.high.idx });
        }
        if (kind === 'bid') {
          const idx = +a.idx; if (!Number.isInteger(idx) || !legalBidG(st, seat, idx)) fail('bid');
          st.high = { idx, seat }; if (!B[idx].hand) st.numBid[seat] = true; st.log.push({ seat, idx });
          return advanceG(st, { act: 'bid', idx });
        }
        fail('phase');
      }
      case 'talon': {
        if (kind !== 'discard' || !Array.isArray(a.ids) || a.ids.length !== 2 || a.ids[0] === a.ids[1]) fail('discard');
        const h = st.hands[seat];
        if (!a.ids.every(id => h.some(c => c.id === id))) fail('card');
        st.discarded = h.filter(c => a.ids.includes(c.id)); st.hands[seat] = h.filter(c => !a.ids.includes(c.id));
        const opts = declOptions(st);
        if (opts.length === 1) { st.contract = opts[0]; return toDef(st, { act: 'discard' }); }
        st.phase = 'declare'; return { act: 'discard' };
      }
      case 'declare': {
        const idx = +a.idx;
        if (kind !== 'declare' || !declOptions(st).includes(idx)) fail('bid');
        st.contract = idx; return toDef(st, { act: 'declare', idx });
      }
      case 'whist': {
        if (!defActs(st).includes(kind)) fail('phase');
        if (kind === 'kontra') {
          st.whist[seat] = 'k'; st.whist[seat === d1 ? d2 : d1] = 'i'; st.host = seat; st.kon = 1;
          st.phase = 'kontra'; st.turn = st.declarer; return { act: 'kontra', lvl: 1 };
        }
        st.whist[seat] = kind === 'whist' ? 'w' : 'p';
        if (seat === d1) { st.turn = d2; return { act: kind }; }
        return afterDef(st, { act: kind });
      }
      case 'kontra': {
        const max = o.kontra === 'four' ? 4 : 2;
        if (kind === 'kontra') {
          st.kon++;
          if (st.kon >= max) return afterInv(st, { act: 'kontra', lvl: st.kon });
          st.turn = st.kon % 2 === 1 ? st.declarer : st.host; return { act: 'kontra', lvl: st.kon };
        }
        if (kind === 'pass') return afterInv(st, { act: 'pass' });
        fail('phase');
      }
      case 'invite': {
        if (kind === 'invite') st.whist[defenders(st).find(x => x !== st.host)] = 'i';
        else if (kind !== 'pass') fail('phase');
        return afterInv(st, { act: kind });
      }
      case 'solo': {
        if (kind === 'drop') { st.dropDecl = true; return endDealG(st, { act: 'drop' }); }
        if (kind !== 'go') fail('phase');
        return toPlay(st, { act: 'go' });
      }
      case 'noaces': {
        if (kind === 'announce') st.noAces = true; else if (kind !== 'skip') fail('phase');
        return startPlayG(st, { act: kind });
      }
      case 'play': {
        if (kind !== 'play') fail('phase');
        const h = st.hands[seat], card = h.find(c => c.id === a.card), b = B[st.contract];
        if (!card) fail('card');
        if (!legalPlays(h, st.trick, trumpG(b)).some(c => c.id === card.id)) fail('follow');
        st.hands[seat] = h.filter(c => c !== card); st.trick.push({ seat, card });
        if (st.trick.length < st.active.length) { st.turn = nextActive(st, seat); return { act: 'play', card }; }
        const winner = trickWinner(st.trick, trumpG(b)), d = st.declarer;
        st.won[winner]++; st.last = { winner, trick: st.trick.slice() }; st.trick = []; st.leader = winner; st.turn = winner; st.played++;
        const r = { act: 'play', card, trick: { winner } };
        const defT = [0, 1, 2].reduce((x, s) => s === d ? x : x + st.won[s], 0);
        let stop = st.played === 10;
        if (isMis(b)) stop = stop || winner === d;
        else if (isAll(b)) stop = stop || winner !== d;
        else if (b.k === 'uno') stop = stop || st.won[d] > 1;
        else if (bk && plainK(b)) stop = stop || defT > 10 - needT(st, b);
        if (stop) endDealG(st, r);
        return r;
      }
    }
    fail('phase');
  }
  function advanceG(st, r) {
    const o = st.opts, bk = o.version === 'balkan', B = gb(st);
    const active = [0, 1, 2].filter(s => !st.passed[s]);
    if (!active.length) return endDealG(st, { ...r, passout: true });
    if (!bk && !st.high && active.length === 1) st.high = { idx: 0, seat: active[0] };    // Austrian: the dealer has to play
    if (active.length === 1 && st.high && st.high.seat === active[0]) {
      const d = st.declarer = st.high.seat;
      if (B[st.high.idx].hand) { st.contract = st.high.idx; return toDef(st, { ...r, declarer: d }); }
      st.hands[d] = st.hands[d].concat(st.talon).sort(sortCards); st.talonShown = bk; st.phase = 'talon'; st.turn = d;
      return { ...r, declarer: d };
    }
    let s = next(st.turn); while (st.passed[s]) s = next(s);
    st.turn = s; return r;
  }
  function toDef(st, r) {
    const o = st.opts, d = st.declarer;
    st.whist = [null, null, null]; st.host = -1; st.inv = -1; st.kon = 0;
    if (o.version === 'balkan' && o.scoring === 'bula' && st.refa[d] > 0) { st.refa[d]--; st.refaUsed = true; } else st.refaUsed = false;
    const [d1, d2] = defenders(st);
    if (defActs(st).length === 1) { st.whist[d1] = 'w'; st.whist[d2] = 'w'; return afterDef(st, r); }
    st.phase = 'whist'; st.turn = d1; return r;
  }
  function afterDef(st, r) {
    const o = st.opts, [d1, d2] = defenders(st), pl = [d1, d2].filter(x => st.whist[x] === 'w');
    if (!pl.length) { st.noPlay = true; return endDealG(st, r); }
    if (pl.length === 1) {
      st.host = pl[0];
      if (o.invite === 'on') { st.phase = 'invite'; st.turn = pl[0]; return r; }
    }
    return afterInv(st, r);
  }
  function afterInv(st, r) {
    const o = st.opts, b = gb(st)[st.contract];
    if (o.version === 'austrian' && o.drop === 'on' && plainK(b)) { st.phase = 'solo'; st.turn = st.declarer; return r; }
    return toPlay(st, r);
  }
  function toPlay(st, r) {
    const o = st.opts, b = gb(st)[st.contract], h = st.hands[st.declarer];
    st.aces4 = h.filter(c => c.r === 14).length === 4;
    st.noAcesOk = !h.some(c => c.r === 14) && !st.discarded.some(c => c.r === 14);
    if (o.version === 'austrian' && o.aces0 === 'on' && b.k === 'suit' && st.noAcesOk) { st.phase = 'noaces'; st.turn = st.declarer; return r; }
    return startPlayG(st, r);
  }
  function startPlayG(st, r) {
    const o = st.opts, b = gb(st)[st.contract], d = st.declarer;
    st.active = [0, 1, 2].filter(s => s === d || ['w', 'k', 'i'].includes(st.whist[s]));
    st.phase = 'play'; st.trick = []; st.won = [0, 0, 0]; st.played = 0;
    let lead = d;
    if (o.version === 'balkan') {
      lead = next(st.dealer); while (!st.active.includes(lead)) lead = next(lead);
      if (b.k === 'sans' && lead === d) {
        if (o.lead === 'right') { lead = (d + 2) % 3; while (!st.active.includes(lead)) lead = (lead + 2) % 3; }
        else lead = nextActive(st, d);
      }
    }
    st.leader = lead; st.turn = lead; return r;
  }

  function endDealG(st, r) {
    const o = st.opts, B = gb(st), bk = o.version === 'balkan', add = [0, 0, 0], before = st.scores.slice();
    const res = { k: 'deal', add, tricks: st.won.slice(), declarer: st.declarer, contract: st.contract, whist: st.whist.slice(), host: st.host, kon: st.kon, made: null, noPlay: !!st.noPlay, dropDecl: !!st.dropDecl, refaUsed: !!st.refaUsed, unscored: false, passout: false, noAces: !!st.noAces };
    if (r && r.passout) {
      res.k = 'passout'; res.passout = true; res.declarer = -1;
      if (bk && o.scoring === 'bula') for (let s = 0; s < 3; s++) if (st.refa[s] < refaMax(o) && st.w[s] > 0) st.refa[s]++;
    } else {
      const d = st.declarer, b = B[st.contract], defs = defenders(st), t = st.won[d];
      const made = st.noPlay ? true : madeG(st, b, t); res.made = st.dropDecl ? false : made;
      let scored = true;
      if (bk && st.noPlay && st.kon === 0 && twoSpecial(st, b)) {
        if (o.two === 'slovenia') scored = false;
        else if (o.two === 'serbia' && o.scoring === 'bula' && st.w[d] > 0) {
          scored = false;
          if (st.w.every(x => x > 0)) for (let s = 0; s < 3; s++) if (st.refa[s] < refaMax(o)) st.refa[s]++;
        }
      }
      if (!scored) res.unscored = true;
      else if (!bk) scoreA(st, b, made, defs, add, res);
      else scoreB(st, b, made, defs, add, res);
    }
    if (bk && o.scoring === 'bula') {
      const avg = st.w.reduce((a, b) => a + b, 0) / 3;
      st.scores = [0, 1, 2].map(i => { let x = 0; for (const j of [0, 1, 2]) if (j !== i) x += st.juha[i][j] - st.juha[j][i]; return Math.round(x - 10 * (st.w[i] - avg)); });
      for (let s = 0; s < 3; s++) add[s] = st.scores[s] - before[s];
      res.bula = st.w.slice(); res.refa = st.refa.slice();
    } else for (let s = 0; s < 3; s++) st.scores[s] += add[s];
    res.scores = st.scores.slice(); res.pot = st.pot; st.result = res; st.phase = 'done';
    const over = bk && o.scoring === 'bula' ? (st.w.reduce((a, b) => a + b, 0) <= 0 || st.deal >= 30) : st.deal >= o.deals;
    if (over) { st.matchOver = true; const m = Math.max(...st.scores); st.winner = st.scores.indexOf(m); }
    return { ...r, ended: true };
  }
  function scoreA(st, b, made, defs, add, res) {
    const o = st.opts, d = st.declarer, m = o.mult === 'on' ? b.n : 1, dealer = st.dealer;
    const pay = (from, to, x) => { add[from] -= x; add[to] += x; };
    const fromPot = x => { while (st.pot < x) st.pot += 60; st.pot -= x; add[d] += x; };
    const toPot = (p, x) => { add[p] -= x; st.pot += x; };
    res.m = m;
    if (st.dropDecl) {
      const pl = defs.filter(x => st.whist[x] === 'w');
      for (const x of pl) pay(d, x, (pl.length === 1 ? 5 : 3) * m);
      return;
    }
    if (!plainK(b)) { const V = b.v * (b.hand ? 2 : 1) * m; for (const x of defs) made ? pay(x, d, V) : pay(d, x, V); return; }
    if (b.hand && b.suit === 'H' && o.prefGame === 'on') { for (const x of defs) made ? pay(x, d, 10 * m) : pay(d, x, 10 * m); }
    else {
      if (made) fromPot(10 * m); else toPot(d, 20 * m);
      if (!st.noPlay) {
        const inv = defs.find(x => st.whist[x] === 'i');
        if (inv !== undefined) { const host = defs.find(x => x !== inv); if (st.won[host] + st.won[inv] < 4) toPot(host, m); }
        else for (const x of defs) if (st.whist[x] === 'w') { if (st.won[x] < 2) toPot(x, 10 * m); else if (x !== dealer) pay(dealer, x, m); }
      }
    }
    if (o.aces4 === 'on' && st.aces4 && made) for (const x of defs) pay(x, d, 10 * m);
    if (st.noAces) for (const x of defs) made ? pay(x, d, 10 * m) : pay(d, x, 10 * m);
  }
  function scoreB(st, b, made, defs, add, res) {
    const o = st.opts, d = st.declarer, t = st.won[d], quota = plainK(b), kon = 1 << st.kon, m = (st.refaUsed ? 2 : 1) * kon, sc = o.scoring;
    const pay = (from, to, x) => { add[from] -= x; add[to] += x; };
    const fromPot = x => { while (st.pot < x) st.pot += 600; st.pot -= x; add[d] += x; };
    const toPot = (p, x) => { add[p] -= x; st.pot += x; };
    const plays = defs.filter(x => st.whist[x] === 'w' || st.whist[x] === 'k'), inv = defs.find(x => st.whist[x] === 'i');
    const dT = defs.reduce((a, x) => a + st.won[x], 0);
    const host = st.kon > 0 ? st.host : plays.length === 1 ? plays[0] : -1;
    const combined = st.kon > 0 || inv !== undefined;
    res.m = m;
    // who has to answer for the defence (the quota table) and how much he is short
    const unsafe = [];
    if (!st.noPlay && quota) {
      if (st.kon > 0) { if (dT < 5) unsafe.push(host); }
      else if (inv !== undefined) { if (dT < 4) unsafe.push(host); }
      else if (plays.length === 1) { if (st.won[host] < 2) unsafe.push(host); }
      else for (const x of plays) if (!(dT >= 4 || st.won[x] >= 2)) unsafe.push(x);
    }
    if (sc === 'bula') {
      const B0 = 2 * (b.n + (b.hand ? 1 : 0)) * m;
      if (made) st.w[d] -= Math.min(B0, st.w.reduce((a, x) => a + x, 0)); else st.w[d] += B0;
      if (!st.noPlay) {
        if (b.k === 'mis') { if (!made) for (const x of defs) st.juha[x][d] += 5 * B0; }
        else if (host >= 0) st.juha[host][d] += B0 * (combined ? dT : st.won[host]);
        else for (const x of plays) st.juha[x][d] += B0 * st.won[x];
        for (const x of unsafe) st.w[x] += B0;
      }
    } else if (sc === 'pot') {
      const unit = (b.n + (b.hand ? 1 : 0)) * m;
      if (made) fromPot(20 * unit); else toPot(d, 20 * unit);
      if (!st.noPlay && quota) {
        if (host >= 0) pay(d, host, 2 * unit * (combined ? dT : st.won[host]));
        else for (const x of plays) pay(d, x, 2 * unit * st.won[x]);
        for (const x of unsafe) toPot(x, 10 * unit);
      }
    } else {
      const base = b.n + (b.hand ? 1 : 0), need = needT(st, b);
      const diff = made ? (plainK(b) ? t - need : 0) : (plainK(b) ? need - t : isMis(b) ? t : b.k === 'uno' ? Math.abs(t - 1) : 10 - t);
      const unit = (base + Math.max(0, diff)) * m;
      for (const x of defs) made ? pay(x, d, unit) : pay(d, x, unit);
      if (st.talon.length === 2 && st.talon[0].r === st.talon[1].r && d !== st.dealer) pay(d, st.dealer, 2);
    }
  }

  // ---------------------------------------------------------------- bots (Austrian / Balkan)
  function wantG(st, me, b, nz, e, lv) {
    const o = st.opts;
    if (b.hand) {
      if (b.k !== 'suit') return false;
      return e[b.suit] + nz >= 5.7;
    }
    if (b.k === 'suit') { let best = 0; for (const x of gb(st)) if (x.k === 'suit' && !x.hand && e[x.suit] + 2.6 + nz >= 6) best = Math.max(best, x.n); return b.n <= best; }
    if (b.k === 'sans') return e.N + 2.6 + nz >= 6.6;
    if (b.k === 'mis') return miserGood(st.hands[me], lv);
    if (b.k === 'slam') return Math.max(...[...SUITS, 'N'].map(s => e[s])) + 2.0 >= 9.4;
    return false;
  }
  function botBidG(st, me, lv) {
    const B = gb(st), h = st.hands[me], e = {};
    for (const s of [...SUITS, 'N']) e[s] = est(h, s === 'N' ? null : s);
    const nz = noise(lv);
    const legal = B.map((b, i) => i).filter(i => legalBidG(st, me, i));
    const hb = legal.find(i => B[i].hand && wantG(st, me, B[i], nz, e, lv)); if (hb !== undefined) return { act: 'bid', idx: hb };
    const nb = legal.find(i => !B[i].hand && wantG(st, me, B[i], nz, e, lv));
    if (nb !== undefined) return { act: 'bid', idx: nb };
    if (canSame(st, me) && wantG(st, me, B[st.high.idx], nz, e, lv)) return { act: 'same' };
    return { act: 'pass' };
  }
  function botDeclareG(st, me, lv) {
    const B = gb(st), h = st.hands[me], opts = declOptions(st), ev = i => est(h, trumpG(B[i])) + noise(lv) * 0.3;
    let best = opts[0], bestE = -1;
    for (const i of opts) { const e = ev(i); if (e > bestE + 0.001) { best = i; bestE = e; } }
    if (st.opts.version === 'balkan') {
      const cur = opts.includes(st.high.idx) ? st.high.idx : opts[0], ce = ev(cur);
      if (!(bestE > ce + 0.8)) best = cur;
    }
    return { act: 'declare', idx: best };
  }
  function botDefG(st, me, lv) {
    const B = gb(st), b = B[st.contract], acts = defActs(st), e = est(st.hands[me], trumpG(b)) + noise(lv);
    if (twoSpecial(st, b)) return { act: acts.includes('kontra') && e >= 2.8 ? 'kontra' : 'pass' };
    if (acts.includes('kontra') && e >= 3.6) return { act: 'kontra' };
    if (e >= 1.5 || !acts.includes('pass')) return { act: 'whist' };
    return { act: 'pass' };
  }
  function botG(st, me, lv) {
    const B = gb(st), b = B[st.contract], h = st.hands[me];
    switch (st.phase) {
      case 'bid': return botBidG(st, me, lv);
      case 'talon': return botTalon(st, me, lv);
      case 'declare': return botDeclareG(st, me, lv);
      case 'whist': return botDefG(st, me, lv);
      case 'kontra': {
        const e = est(h, trumpG(b)) + noise(lv);
        if (me === st.declarer) return { act: e >= (st.kon >= 2 ? 8.2 : 7.4) ? 'kontra' : 'pass' };
        return { act: e >= 4.0 ? 'kontra' : 'pass' };
      }
      case 'invite': return { act: est(h, trumpG(b)) + noise(lv) < 2.4 ? 'invite' : 'pass' };
      case 'solo': return { act: est(h, trumpG(b)) + noise(lv) < 3.0 ? 'drop' : 'go' };
      case 'noaces': return { act: est(h, trumpG(b)) + noise(lv) >= 6.3 ? 'announce' : 'skip' };
      default: return botPlayG(st, me, lv);
    }
  }
  function botPlayG(st, me, lv) {
    const b = gb(st)[st.contract], h = st.hands[me], trump = trumpG(b), L = legalPlays(h, st.trick, trump), d = st.declarer, isD = me === d;
    if (lv === 'novice' && Math.random() < 0.3) return { act: 'play', card: L[Math.floor(Math.random() * L.length)].id };
    const avoid = (isD && isMis(b)) || (isD && b.k === 'uno' && (st.won[d] >= 1 || st.played < 5)), defMis = !isD && isMis(b);
    const lowest = a => a.slice().sort((x, y) => x.r - y.r || (trump && x.s === trump ? 1 : 0) - (trump && y.s === trump ? 1 : 0))[0];
    const hiest = a => a.slice().sort((x, y) => y.r - x.r)[0];
    const pick = c => ({ act: 'play', card: c.id });
    const beats = (a, w) => a.s === w.s ? a.r > w.r : !!(trump && a.s === trump);
    if (!st.trick.length) {
      if (avoid || defMis) return pick(lowest(L));
      const aces = L.filter(c => c.r === 14 && c.s !== trump);
      if (aces.length) return pick(aces[0]);
      const tr = trump ? L.filter(c => c.s === trump) : [];
      if (isD && tr.length >= 3 && tr.some(c => c.r >= 12)) return pick(hiest(tr));
      const ks = L.filter(c => c.r === 13 && c.s !== trump && h.some(x => x.s === c.s && x.r === 12));
      if (ks.length) return pick(ks[0]);
      const non = L.filter(c => c.s !== trump);
      return pick(lowest(non.length ? non : L));
    }
    const wI = trickWinner(st.trick, trump), wc = st.trick.find(x => x.seat === wI).card;
    const winners = L.filter(c => beats(c, wc)), last = st.trick.length === st.active.length - 1;
    if (avoid) { const losers = L.filter(c => !beats(c, wc)); return pick(losers.length ? hiest(losers) : lowest(L)); }
    if (defMis) return pick(lowest(L));
    const partnerWins = !isD && wI !== d;
    if (partnerWins && (last || wc.r >= 13)) { const non = L.filter(c => c.s !== trump); return pick(lowest(non.length ? non : L)); }
    if (winners.length) {
      const sorted = winners.slice().sort((x, y) => (x.s === trump ? 1 : 0) - (y.s === trump ? 1 : 0) || x.r - y.r);
      return pick(last ? sorted[0] : (sorted[0].r >= 11 || sorted[0].s === trump ? sorted[0] : sorted[Math.min(1, sorted.length - 1)]));
    }
    const non = L.filter(c => c.s !== trump);
    return pick(lowest(non.length ? non : L));
  }

  // ---------------------------------------------------------------- bots
  const SD = { novice: 0.9, average: 0.5, pro: 0.25, cardshark: 0.08 };
  const noise = lv => (Math.random() + Math.random() + Math.random() - 1.5) * 2 * (SD[lv] ?? 0.5);
  // expected tricks for a hand with this trump ('N' or null = none)
  function est(hand, trump) {
    const bySuit = {}; for (const c of hand) (bySuit[c.s] = bySuit[c.s] || []).push(c.r);
    let t = 0; const tl = trump ? (bySuit[trump] || []).length : 0;
    for (const s of SUITS) {
      const r = (bySuit[s] || []).slice().sort((a, b) => b - a), len = r.length; if (!len) continue;
      if (s === trump) {
        let run = 0; for (let k = 0; k < len && r[k] === 14 - k; k++) run++;
        t += run + (run < 3 && r.includes(14 - run - 1) && len > run + 1 ? 0.4 : 0) + Math.max(0, len - 3) * 0.75 * (len >= 4 && r[0] >= 12 ? 1 : 0.7);
      } else {
        let run = 0; for (let k = 0; k < len && r[k] === 14 - k; k++) run++;
        if (run) t += run * 0.95; else if (r[0] === 13 && len >= 2) t += 0.65; else if (r[0] === 12 && len >= 3 && r.includes(13)) t += 0.4;
        if (!trump && len >= 5) t += (len - 4) * 0.55;
        if (trump && tl >= 3) t += len === 0 ? 0 : len === 1 ? 0.35 : 0;
      }
    }
    if (trump && tl >= 2) for (const s of SUITS) if (s !== trump && !(bySuit[s] || []).length) t += 0.7;
    return t;
  }
  const maxLevelFor = (hand, suit, lv, extra) => Math.floor(est(hand, suit === 'N' ? null : suit) + extra + noise(lv));
  const miserGood = (hand, lv) => {
    const hi = hand.filter(c => c.r >= 12).length, top = hand.filter(c => c.r >= 13).length, j = hand.filter(c => c.r === 11).length;
    return top === 0 && hi + j <= 2 && hand.filter(c => c.r <= 9).length >= 6 && Math.random() < (lv === 'novice' ? 0.35 : 0.9);
  };
  function botBid(st, me, lv) {
    const hand = st.hands[me], floor = st.high ? st.high.idx + 1 : 0;
    const cap = {}; for (const s of [...SUITS, 'N']) cap[s] = maxLevelFor(hand, s, lv, 2.0);
    const mis = miserGood(hand, lv);
    for (let i = floor; i < BIDS.length; i++) {
      const b = BIDS[i];
      if (b.mis ? mis : (b.level <= cap[b.suit])) return { act: 'bid', idx: i };
    }
    return { act: 'pass' };
  }
  function pickTalon(hand12, lv, minIdx) {
    let best = null;
    for (let i = 0; i < hand12.length; i++) for (let j = i + 1; j < hand12.length; j++) {
      const rest = hand12.filter((_, k) => k !== i && k !== j);
      for (const s of [...SUITS, 'N']) {
        const e = est(rest, s === 'N' ? null : s);
        if (!best || e > best.e) best = { e, i, j, s };
      }
    }
    return best;
  }
  function botTalon(st, me, lv) {
    const h = st.hands[me], b = pickTalon(h, lv);
    return { act: 'discard', ids: [h[b.i].id, h[b.j].id] };
  }
  function botDeclare(st, me, lv) {
    const h = st.hands[me], hi = st.high.idx, cur = BIDS[hi];
    let best = hi, bestE = est(h, cur.suit === 'N' ? null : cur.suit);
    for (const s of [...SUITS, 'N']) {
      const e = est(h, s === 'N' ? null : s) + noise(lv) * 0.3;
      for (let i = hi; i < BIDS.length; i++) {
        const b = BIDS[i]; if (b.mis || b.suit !== s) continue;
        if (b.level <= Math.floor(e + 0.1) && e > bestE + 0.5 && b.level >= cur.level) { best = i; bestE = e; }
        break;
      }
    }
    return { act: 'declare', idx: best };
  }
  function botWhist(st, me, lv) {
    const b = BIDS[st.contract], h = st.hands[me];
    const e = est(h, b.suit === 'N' ? null : b.suit) + noise(lv);
    return { act: e >= (11 - b.level) / 2 - 1.0 ? 'whist' : 'pass' };
  }
  function botPlay(st, me, lv) {
    const h = st.hands[me], trump = curTrump(st), L = legalPlays(h, st.trick, trump);
    if (lv === 'novice' && Math.random() < 0.3) return { act: 'play', card: L[Math.floor(Math.random() * L.length)].id };
    const b = st.contract !== null ? BIDS[st.contract] : null, mis = !!(b && b.mis), avoid = st.raspasy || (mis && st.declarer === me);
    const lowest = a => a.slice().sort((x, y) => x.r - y.r || (trump && x.s === trump ? 1 : 0) - (trump && y.s === trump ? 1 : 0))[0];
    const hiest = a => a.slice().sort((x, y) => y.r - x.r)[0];
    const pick = c => ({ act: 'play', card: c.id });
    const beats = (a, w) => a.s === w.s ? a.r > w.r : !!(trump && a.s === trump);
    if (!st.trick.length) {
      if (avoid) return pick(lowest(L));
      if (mis) return pick(lowest(L));
      const aces = L.filter(c => c.r === 14 && c.s !== trump);
      if (aces.length) return pick(aces[0]);
      const tr = trump ? L.filter(c => c.s === trump) : [];
      if (st.declarer === me && tr.length >= 3 && tr.some(c => c.r >= 12)) return pick(hiest(tr));
      const ks = L.filter(c => c.r === 13 && c.s !== trump && h.some(x => x.s === c.s && x.r === 12));
      if (ks.length) return pick(ks[0]);
      const non = L.filter(c => c.s !== trump);
      return pick(lowest(non.length ? non : L));
    }
    const wI = trickWinner(st.trick, trump), wc = st.trick.find(x => x.seat === wI).card;
    const winners = L.filter(c => beats(c, wc));
    const last = st.trick.length === 2;
    if (avoid) {
      const losers = L.filter(c => !beats(c, wc));
      if (losers.length) return pick(hiest(losers));
      return pick(lowest(L));   // forced to win: win as cheaply as possible
    }
    if (mis) return pick(lowest(L));   // a defender in a misère: stay low and let the declarer take the trick
    const partnerWins = st.declarer !== me && wI !== st.declarer;
    if (partnerWins && (last || wc.r >= 13)) return pick(lowest(L.filter(c => c.s !== trump).length ? L.filter(c => c.s !== trump) : L));
    if (winners.length) {
      const sorted = winners.slice().sort((x, y) => (x.s === trump ? 1 : 0) - (y.s === trump ? 1 : 0) || x.r - y.r);
      return pick(last ? sorted[0] : (sorted[0].r >= 11 || sorted[0].s === trump ? sorted[0] : sorted[Math.min(1, sorted.length - 1)]));
    }
    const non = L.filter(c => c.s !== trump);
    return pick(lowest(non.length ? non : L));
  }
  function bot(st, me, lv) {
    lv = lv || 'average';
    if (isG(st)) return botG(st, me, lv);
    if (st.phase === 'bid') return botBid(st, me, lv);
    if (st.phase === 'talon') return botTalon(st, me, lv);
    if (st.phase === 'declare') return botDeclare(st, me, lv);
    if (st.phase === 'whist') return botWhist(st, me, lv);
    return botPlay(st, me, lv);
  }

  // ---------------------------------------------------------------- views
  const rel = (s, me) => s === null || s === undefined || s < 0 ? s : ((s - me) % 3 + 3) % 3;
  const perm = (a, me) => Array.isArray(a) ? [0, 1, 2].map(r => a[(me + r) % 3]) : a;
  function view(st, me) {
    const v = viewR(st, me);
    if (!isG(st)) return v;
    const B = gb(st), d = st.declarer, cb = st.contract !== null && st.contract !== undefined ? B[st.contract] : null;
    return Object.assign(v, {
      deals: st.opts.deals || 0, w: perm(st.w, me), pot: st.pot, refa: perm(st.refa, me), host: rel(st.host, me), inv: rel(st.inv, me), kon: st.kon, noAces: st.noAces,
      active: st.active.map(s => rel(s, me)), dropDecl: st.dropDecl, refaUsed: st.refaUsed,
      talon: st.talonShown && st.phase === 'talon' ? st.talon.slice() : [],
      declOpts: st.phase === 'declare' && st.turn === me ? declOptions(st) : [],
      acts: st.phase === 'whist' && st.turn === me ? defActs(st) : [],
      legalBids: st.phase === 'bid' && st.turn === me ? B.map((b, i) => i).filter(i => legalBidG(st, me, i)) : [],
      canSame: st.phase === 'bid' && st.turn === me && canSame(st, me),
      open: cb && isOpen(cb) && st.phase === 'play' && d !== me && st.hands[d] ? st.hands[d].slice() : [],
      pool: perm(st.pl, me),
    });
  }
  function viewR(st, me) {
    return {
      game: 'f', n: 3, opts: st.opts, deal: st.deal, deals: st.opts.deals, pool: perm(st.pl, me), mount: perm(st.mt, me), dealer: rel(st.dealer, me), phase: st.phase,
      log: st.log.map(x => ({ seat: rel(x.seat, me), idx: x.idx })), passed: perm(st.passed, me), high: st.high ? { idx: st.high.idx, seat: rel(st.high.seat, me) } : null,
      declarer: rel(st.declarer, me), contract: st.contract, whist: perm(st.whist, me), raspasy: st.raspasy,
      hand: st.hands && st.hands[me] ? st.hands[me].slice() : [], counts: st.hands ? perm(st.hands.map(h => h.length), me) : [0, 0, 0],
      trick: st.trick.map(x => ({ seat: rel(x.seat, me), card: x.card })), won: perm(st.won, me), scores: perm(st.scores, me), leader: rel(st.leader, me),
      last: st.last ? { winner: rel(st.last.winner, me), trick: st.last.trick.map(x => ({ seat: rel(x.seat, me), card: x.card })) } : null,
    };
  }
  function rotEvent(ev, me, st) {
    const r = { ...ev };
    for (const k of ['seat', 'winner', 'declarer', 'by', 'host']) if (typeof r[k] === 'number' && r[k] >= 0) r[k] = rel(r[k], me);
    if (r.result) {
      const x = { ...r.result };
      for (const k of ['add', 'tricks', 'whist', 'scores', 'pool', 'mount', 'bula', 'refa']) if (Array.isArray(x[k])) x[k] = perm(x[k], me);
      for (const k of ['declarer', 'host']) if (typeof x[k] === 'number' && x[k] >= 0) x[k] = rel(x[k], me);
      r.result = x;
    }
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
        const botMove = () => bot(st, seat, h.io.level(seat) || 'average');
        let a = await h.getAction(seat, { kind: st.phase }, botMove), r;
        try { r = act(st, seat, a); }
        catch (e) {
          if (h.fromHuman) { h.io.send(seat, { t: 'reject', rule: String(e && e.rule || 'bad') }); continue; }
          a = botMove(); r = act(st, seat, a);
        }
        if (r.act === 'play') {
          h.emit({ k: 'play', seat, card: r.card });
          if (r.trick) { await h.io.sleep(900); h.emit({ k: 'trick', winner: r.trick.winner }); }
          else await h.io.sleep(350);
        } else {
          h.emit({ k: 'act', seat, act: r.act, idx: r.idx === undefined ? null : r.idx, declarer: r.declarer === undefined ? -1 : r.declarer, raspasy: !!r.raspasy, lvl: r.lvl || 0, passout: !!r.passout });
          await h.io.sleep(r.act === 'bid' || r.act === 'pass' ? 600 : 400);
        }
      }
      h.turn = null;
      h.emit({ k: 'handEnd', result: st.result, scores: st.scores.slice(), deal: st.deal, over: st.matchOver });
      if (st.matchOver) { h.emit({ k: 'matchEnd', winner: st.winner, scores: st.scores.slice() }); return st.winner; }
      await h.checkpoint('handEnd');
      await h.io.waitNext(15000);
    }
  }

  return { VERSIONS, SCHEMA, cleanOpts, bidsFor, trumpFor, isG, SUITS, BIDS, MIS, bidIdx, value, trumpOf, key, makeDeck, newMatch, newDeal, act, bot, view, rotEvent, run, legalPlays, trickWinner, est, sortCards };
})();
if (typeof module !== 'undefined') module.exports = Pref;
