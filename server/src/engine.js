// ===================== ENGINE (pure game logic + AI) =====================
const Engine = (() => {
  const shuffle = (a, rng = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // dealing can use its own random source, so simulations can replay identical decks for two versions of a player
  let DEAL_RNG = Math.random;
  const setDealRng = f => { DEAL_RNG = f || Math.random; };
  const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);

  // ---------- shared seat helpers ----------
  function teamOf(st, seat) { return st.teams > 2 ? st.seats.indexOf(seat) : st.seats.length === 2 ? (seat === 0 ? 0 : 1) : seat % 2; }
  function nextSeat(st, s) { const i = st.seats.indexOf(s); return st.seats[(i + 1) % st.seats.length]; }
  function roundFrom(st, s) { const o = []; for (let i = 0; i < st.seats.length; i++) { o.push(s); s = nextSeat(st, s); } return o; }

  // =============================== BRIŠKULA ===============================
  // Triestine 40-card deck. Rank order A,3,K(re),C(cavallo/konj),F(fante),7,6,5,4,2
  const B_RANKS = [
    { k: 'A', n: 1, st: 10, p: 11 }, { k: '3', n: 3, st: 9, p: 10 }, { k: 'K', n: 13, st: 8, p: 4 },
    { k: 'C', n: 12, st: 7, p: 3 }, { k: 'F', n: 11, st: 6, p: 2 }, { k: '7', n: 7, st: 5, p: 0 },
    { k: '6', n: 6, st: 4, p: 0 }, { k: '5', n: 5, st: 3, p: 0 }, { k: '4', n: 4, st: 2, p: 0 }, { k: '2', n: 2, st: 1, p: 0 }];
  function bDeck() { const d = []; for (let s = 0; s < 4; s++) for (const r of B_RANKS) d.push({ id: 'b' + s + r.k, s, r: r.k, n: r.n, st: r.st, p: r.p }); return d; }
  const B_ALL = bDeck();   // read-only copy for card counting

  function bNew(opts) {
    // 4 players: two pairs; 3 players: each for themselves (one 2 removed, 39 cards); 2 players: double hand
    const seats = opts.players === 4 ? [0, 1, 2, 3] : opts.players === 3 ? [0, 1, 3] : [0, 2];
    const teams = opts.players === 3 ? 3 : (opts.players === 4 && opts.solo) ? 4 : 2; // solo: four players, each for themselves
    return { game: 'b', opts, seats, teams, dealer: seats[seats.length - 1], wins: Array(teams).fill(0), history: [] };
  }
  function bDeal(st) {
    st.removed = st.seats.length === 3 ? 'b02' : null;
    const deck = shuffle(bDeck().filter(c => c.id !== st.removed), DEAL_RNG);
    const hs = st.opts.double ? 4 : 3;
    st.hands = {}; st.seats.forEach(s => st.hands[s] = []);
    let s = nextSeat(st, st.dealer);
    for (let i = 0; i < hs * st.seats.length; i++) { st.hands[s].push(deck.pop()); s = nextSeat(st, s); }
    st.stock = deck;               // drawn with pop(); stock[0] is the face-up trump card (drawn last)
    st.trumpCard = deck[0]; st.trump = deck[0].s;
    st.leader = nextSeat(st, st.dealer);
    st.trick = []; st.won = Array.from({ length: st.teams }, () => []); st.seen = new Set(); st.lastTrick = null; st.trickNo = 0;
  }
  function bOrder(st) { const o = roundFrom(st, st.leader); return st.opts.double ? o.concat(o) : o; }
  function bToPlay(st) { return bOrder(st)[st.trick.length]; }
  function bBeats(a, b, T) { return a.s === b.s ? a.st > b.st : a.s === T; }
  function bWinnerIdx(trick, T) { let w = 0; for (let i = 1; i < trick.length; i++) if (bBeats(trick[i].card, trick[w].card, T)) w = i; return w; }
  function bPlay(st, seat, card) {
    const h = st.hands[seat]; h.splice(h.findIndex(c => c.id === card.id), 1);
    st.trick.push({ seat, card }); st.seen.add(card.id);
    return st.trick.length === bOrder(st).length;
  }
  function bFinishTrick(st) {
    const w = st.trick[bWinnerIdx(st.trick, st.trump)].seat;
    st.won[teamOf(st, w)].push(...st.trick.map(t => t.card));
    st.lastTrick = { trick: st.trick, winner: w, pts: sum(st.trick, t => t.card.p) };
    st.trick = []; st.leader = w; st.trickNo++;
    const draws = [];
    if (st.stock.length) {
      const rounds = st.opts.double ? 2 : 1;
      for (let r = 0; r < rounds; r++) for (const s of roundFrom(st, w)) { const c = st.stock.pop(); st.hands[s].push(c); draws.push({ seat: s, card: c }); }
    }
    return { winner: w, draws };
  }
  function bHandOver(st) { return st.trick.length === 0 && st.seats.every(s => st.hands[s].length === 0); }
  function bPoints(st) { return st.won.map(cs => sum(cs, c => c.p)); }

  function bAI(st, seat) {
    const hand = st.hands[seat], T = st.trump, order = bOrder(st), pos = st.trick.length;
    const after = order.slice(pos + 1), me = teamOf(st, seat);
    const oppAfter = after.filter(s => teamOf(st, s) !== me).length;
    const partnerAfter = after.some(s => s !== seat && teamOf(st, s) === me);
    const known = new Set([...st.seen, ...hand.map(c => c.id)]);
    if (st.removed) known.add(st.removed);
    const unk = B_ALL.filter(c => !known.has(c.id));
    const unkT = unk.filter(c => c.s === T);
    const tablePts = sum(st.trick, t => t.card.p);
    const curW = pos ? st.trick[bWinnerIdx(st.trick, T)] : null;
    const late = st.stock.length === 0;
    const pHold = (card) => {
      if (!oppAfter) return 1;
      let one;
      if (card.s === T) { const u = unkT.filter(c => c.st > card.st).length; one = u === 0 ? 1 : Math.max(0.1, Math.pow(0.74, u)); }
      else {
        const h = unk.filter(c => c.s === card.s && c.st > card.st).length;
        one = Math.pow(0.86, h) * (unkT.length ? Math.max(0.3, 1 - 0.1 * Math.min(unkT.length, 7)) : 1);
      }
      return Math.pow(one, oppAfter);
    };
    let best = null;
    for (const c of hand) {
      const iWin = !curW || bBeats(c, curW.card, T);
      let pWin;
      if (iWin) { const ph = pHold(c); pWin = ph + (1 - ph) * (partnerAfter ? 0.25 : 0); }
      else if (teamOf(st, curW.seat) === me) pWin = pHold(curW.card);
      else pWin = partnerAfter ? 0.3 : 0;
      let ev = (2 * pWin - 1) * (tablePts + c.p + after.length * 1.6);
      if (c.s === T) ev -= (late ? 0.35 : 1) * (2 + c.st * 0.9 + (c.p >= 10 ? 7 : 0));
      // keep the trump ace/three while the stock lasts: don't lead it, don't spend it on a small trick or over partner
      if (!late && c.s === T && c.p >= 10 && (!pos || tablePts < 10 || teamOf(st, curW.seat) === me)) ev -= 20;
      // load an ace/three on partner's trick only when it is safe
      if (pos && !iWin && teamOf(st, curW.seat) === me && c.p >= 10 && oppAfter && pHold(curW.card) < 0.9) ev -= 8;
      ev += Math.random() * 0.25;
      if (!best || ev > best.ev) best = { c, ev };
    }
    return best.c;
  }

  // ================================= BELA =================================
  // Mađarice (German-suited, William Tell). Suits: 0 Herc, 1 Bundeva(zvono), 2 Zeleni(list), 3 Žir
  const H_KEYS = ['7', '8', '9', '10', 'U', 'O', 'K', 'A'];
  const T_STR = { '7': 1, '8': 2, 'O': 3, 'K': 4, '10': 5, 'A': 6, '9': 7, 'U': 8 };
  const N_STR = { '7': 1, '8': 2, '9': 3, 'U': 4, 'O': 5, 'K': 6, '10': 7, 'A': 8 };
  const T_PTS = { 'U': 20, '9': 14, 'A': 11, '10': 10, 'K': 4, 'O': 3 };
  const N_PTS = { 'A': 11, '10': 10, 'K': 4, 'O': 3, 'U': 2 };
  function hDeck() { const d = []; for (let s = 0; s < 4; s++) H_KEYS.forEach((k, q) => d.push({ id: 'h' + s + k, s, r: k, q })); return d; }
  const H_ALL = hDeck();   // read-only copy for card counting
  const hStr = (c, T) => c.s === T ? 100 + T_STR[c.r] : N_STR[c.r];
  const hPts = (c, T) => (c.s === T ? T_PTS : N_PTS)[c.r] || 0;

  function hNew(opts) { return { game: 'h', opts, seats: [0, 1, 2, 3], dealer: 3, score: [0, 0], hang: 0, rows: [] }; }
  function hDeal(st) {
    const deck = shuffle(hDeck(), DEAL_RNG);
    st.hands = {}; st.talon = {};
    for (const s of st.seats) { st.hands[s] = deck.splice(0, 6); st.talon[s] = deck.splice(0, 2); }
    st.trump = null; st.caller = null; st.bidder = nextSeat(st, st.dealer); st.bids = [];
    st.trick = []; st.won = [[], []]; st.tricks = [0, 0]; st.seen = new Set(); st.lastTrick = null; st.trickNo = 0;
    st.void = { 0: {}, 1: {}, 2: {}, 3: {} }; st.belaSeat = null; st.belaCalled = false; st.belaSkipped = false; st.decls = null;
  }
  function hBidValue(hand, s) {
    let v = 0; const tr = hand.filter(c => c.s === s);
    const tv = { 'U': 16, '9': 12, 'A': 8, '10': 6, 'K': 4, 'O': 4, '8': 3, '7': 3 };
    for (const c of tr) v += tv[c.r];
    for (const c of hand) if (c.s !== s) {
      if (c.r === 'A') v += 7;
      else if (c.r === '10') v += hand.some(x => x.s === c.s && x.r === 'A') ? 4 : 1.5;
      else if (c.r === 'K') v += 1;
    }
    if (tr.length >= 3) v += 4;
    if (tr.some(c => c.r === 'U') && tr.some(c => c.r === '9')) v += 4;
    if (tr.some(c => c.r === 'K') && tr.some(c => c.r === 'O')) v += 4;
    return v;
  }
  // returns suit index, or -1 to pass
  function hAIBid(st, seat, thr = 38) {
    const hand = st.hands[seat]; let best = 0, bv = -1;
    for (let s = 0; s < 4; s++) { const v = hBidValue(hand, s); if (v > bv) { bv = v; best = s; } }
    const forced = seat === st.dealer;
    return (forced || bv >= thr) ? best : -1;
  }
  function hBid(st, seat, suit) {
    st.bids.push({ seat, suit });
    if (suit >= 0) {
      st.trump = suit; st.caller = seat;
      for (const s of st.seats) st.hands[s].push(...st.talon[s]);
      st.leader = nextSeat(st, st.dealer);
      for (const s of st.seats) {
        const h = st.hands[s];
        if (h.some(c => c.s === suit && c.r === 'K') && h.some(c => c.s === suit && c.r === 'O')) st.belaSeat = s;
      }
      st.decls = hResolveDecls(st);
      return true;
    }
    st.bidder = nextSeat(st, seat);
    return false;
  }
  function hFindDecls(hand) {
    const out = [];
    for (let s = 0; s < 4; s++) {
      const qs = hand.filter(c => c.s === s).map(c => c.q).sort((a, b) => a - b);
      let i = 0;
      while (i < qs.length) {
        let j = i; while (j + 1 < qs.length && qs[j + 1] === qs[j] + 1) j++;
        const L = j - i + 1;
        if (L >= 3) out.push({ type: L === 8 ? 'belot' : 'seq', s, len: L, top: qs[j], low: qs[i], val: L === 8 ? 1001 : L === 3 ? 20 : L === 4 ? 50 : 100 });
        i = j + 1;
      }
    }
    for (const r of ['U', '9', 'A', '10', 'K', 'O']) {
      if (hand.filter(c => c.r === r).length === 4) out.push({ type: 'quad', r, val: r === 'U' ? 200 : r === '9' ? 150 : 100, len: 4, top: H_KEYS.indexOf(r) });
    }
    return out;
  }
  const declKey = d => [d.type === 'belot' ? 1 : 0, d.val, d.type === 'quad' ? 1 : 0, d.len, d.top];
  function cmpKey(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
  function hResolveDecls(st) {
    const order = roundFrom(st, nextSeat(st, st.dealer));
    const per = {}; let bestSeat = null, bestKey = null;
    for (const s of order) {
      per[s] = hFindDecls(st.hands[s]);
      for (const d of per[s]) { const k = declKey(d); if (!bestKey || cmpKey(k, bestKey) > 0) { bestKey = k; bestSeat = s; } }
    }
    const team = bestSeat === null ? -1 : bestSeat % 2;
    const belot = order.find(s => per[s].some(d => d.type === 'belot'));
    let total = 0;
    if (team >= 0) for (const s of order) if (s % 2 === team) total += sum(per[s].filter(d => d.type !== 'belot'), d => d.val);
    return { per, order, team, total, belotSeat: belot === undefined ? null : belot };
  }
  function hTrickMaxStr(trick, T, suitFilter) { let m = 0; for (const t of trick) if (suitFilter(t.card)) m = Math.max(m, hStr(t.card, T)); return m; }
  function hLegal(st, seat) {
    const hand = st.hands[seat], T = st.trump, trick = st.trick;
    if (!trick.length) return hand.slice();
    const led = trick[0].card.s;
    const follow = hand.filter(c => c.s === led);
    if (follow.length) {
      if (led !== T && trick.some(t => t.card.s === T)) return follow;
      const mx = hTrickMaxStr(trick, T, c => c.s === led);
      const higher = follow.filter(c => hStr(c, T) > mx);
      return higher.length ? higher : follow;
    }
    const trumps = hand.filter(c => c.s === T);
    if (trumps.length) {
      const mx = hTrickMaxStr(trick, T, c => c.s === T);
      const higher = trumps.filter(c => hStr(c, T) > mx);
      return higher.length ? higher : trumps;
    }
    return hand.slice();
  }
  function hWinnerIdx(trick, T) {
    let w = 0;
    for (let i = 1; i < trick.length; i++) {
      const a = trick[i].card, b = trick[w].card;
      if ((a.s === b.s && hStr(a, T) > hStr(b, T)) || (a.s === T && b.s !== T)) w = i;
    }
    return w;
  }
  function hToPlay(st) { return roundFrom(st, st.leader)[st.trick.length]; }
  // returns {done, bela}
  // bela is optional: the holder may stay quiet (e.g. when the callers are going to fall anyway)
  function hBelaEligible(st, seat, card) {
    return seat === st.belaSeat && !st.belaCalled && !st.belaSkipped && card.s === st.trump && (card.r === 'K' || card.r === 'O');
  }
  function hAIBela(st, seat) {
    const me = seat % 2;
    if (me !== st.caller % 2) return true;                // defenders always gain from bela
    const D = st.decls, zOpp = D.team === 1 - me ? D.total : 0, zOur = D.team === me ? D.total : 0;
    if (zOpp < 120) return true;                           // e.g. 150+, or four aces with another 20/40
    const won = sum(st.won[me], c => hPts(c, st.trump));
    return won + zOur + 20 > (162 + zOpp + zOur + 20) / 2; // only call if passing is already certain
  }
  function hPlay(st, seat, card, callBela = true) {
    const T = st.trump, h = st.hands[seat];
    if (st.trick.length) {
      const led = st.trick[0].card.s;
      if (card.s !== led) { st.void[seat][led] = true; if (card.s !== T) st.void[seat][T] = true; }
    }
    let bela = false;
    if (hBelaEligible(st, seat, card)) { if (callBela) { st.belaCalled = true; bela = true; } else st.belaSkipped = true; }
    h.splice(h.findIndex(c => c.id === card.id), 1);
    st.trick.push({ seat, card }); st.seen.add(card.id);
    return { done: st.trick.length === 4, bela };
  }
  function hFinishTrick(st) {
    const w = st.trick[hWinnerIdx(st.trick, st.trump)].seat;
    const tm = w % 2;
    st.won[tm].push(...st.trick.map(t => t.card)); st.tricks[tm]++;
    st.lastTrick = { trick: st.trick, winner: w, pts: sum(st.trick, t => hPts(t.card, st.trump)) };
    st.trick = []; st.leader = w; st.trickNo++;
    if (st.trickNo === 8) st.lastWinner = w;
    return { winner: w };
  }
  function hHandOver(st) { return st.trickNo === 8; }
  function hScoreHand(st) {
    const T = st.trump, c = st.caller % 2, o = 1 - c;
    const cardPts = st.won.map(cs => sum(cs, x => hPts(x, T)));
    const pts = cardPts.slice(); pts[st.lastWinner % 2] += 10;
    const declPts = [0, 0];
    if (st.decls.team >= 0 && st.tricks[st.decls.team] > 0) declPts[st.decls.team] += st.decls.total;
    const belaTeam = st.belaSeat === null ? -1 : st.belaSeat % 2;
    if (belaTeam >= 0 && st.belaCalled && st.tricks[belaTeam] > 0) declPts[belaTeam] += 20;
    let stiglja = -1;
    for (const t of [0, 1]) if (st.tricks[t] === 8) { pts[t] += 90; stiglja = t; }
    const tot = [pts[0] + declPts[0], pts[1] + declPts[1]];
    const all = tot[0] + tot[1];
    let result, add = [0, 0], hangUse = st.hang;
    if (tot[c] > tot[o]) { result = 'pass'; add = tot.slice(); add[c] += st.hang; st.hang = 0; }
    else if (tot[c] < tot[o]) { result = 'fall'; add[o] = all + st.hang; st.hang = 0; }
    else { result = 'hang'; add[o] = tot[o]; st.hang += tot[c]; hangUse = 0; }
    st.score[0] += add[0]; st.score[1] += add[1];
    const row = { caller: st.caller, trump: T, cardPts, pts, declPts, tot, add, result, stiglja, hangUse, score: st.score.slice() };
    st.rows.push(row);
    return row;
  }
  function hMatchWinner(st) {
    const t = st.opts.target;
    if (st.score[0] >= t || st.score[1] >= t) { if (st.score[0] !== st.score[1]) return st.score[0] > st.score[1] ? 0 : 1; }
    return -1;
  }

  function hAI(st, seat) {
    const legal = hLegal(st, seat);
    if (legal.length === 1) return legal[0];
    const T = st.trump, hand = st.hands[seat], pos = st.trick.length;
    const order = roundFrom(st, st.leader), after = order.slice(pos + 1), me = seat % 2;
    const opps = after.filter(s => s % 2 !== me);
    const partnerAfter = after.some(s => s % 2 === me);
    const known = new Set([...st.seen, ...hand.map(c => c.id)]);
    const unk = H_ALL.filter(c => !known.has(c.id));
    const unkT = unk.filter(c => c.s === T);
    const tablePts = sum(st.trick, t => hPts(t.card, T));
    const curW = pos ? st.trick[hWinnerIdx(st.trick, T)] : null;
    const led = pos ? st.trick[0].card.s : null;
    const tricksLeft = 8 - st.trickNo;
    const holdVs = (card, opp) => {
      const v = st.void[opp];
      if (card.s === T) {
        if (v[T]) return 1;
        const u = unkT.filter(c => hStr(c, T) > hStr(card, T)).length;
        return Math.pow(2 / 3, u);
      }
      const h = unk.filter(c => c.s === card.s && hStr(c, T) > hStr(card, T)).length;
      const k = unk.filter(c => c.s === card.s).length;
      const pT = v[T] ? 0 : 1 - Math.pow(2 / 3, unkT.length);
      if (v[card.s]) return 1 - pT;
      const pVoid = Math.pow(2 / 3, k);
      return Math.pow(2 / 3, h) * (1 - pVoid * pT);
    };
    const pHold = card => opps.reduce((p, o) => p * holdVs(card, o), 1);
    const isMaster = c => !unk.some(x => x.s === c.s && hStr(x, T) > hStr(c, T)) && (c.s === T || true);
    const myTrumps = hand.filter(c => c.s === T).length;
    const callerTeam = st.caller % 2 === me;
    // card counting: can either opponent still hold a trump?
    const oppSeats = st.seats.filter(s => s % 2 !== me);
    const oppsMayTrump = unkT.length > 0 && oppSeats.some(o => !st.void[o][T]);
    const jackOut = st.seen.has('h' + T + 'U');
    const iHaveJack = hand.some(x => x.s === T && x.r === 'U');
    // "na mus": the dealer was forced to call after three passes, so the call says little about their hand
    const naMus = st.caller === st.dealer && st.bids.filter(b => b.suit < 0).length === 3;
    const partnerCalled = st.caller !== seat && st.caller % 2 === me;
    const pullForJack = partnerCalled && !naMus && !jackOut && !iHaveJack && oppsMayTrump;
    // with no trumps left against us, keep leading trumps only if every card we hold is a winner
    const allMasters = hand.every(x => !unk.some(y => (y.s === x.s && hStr(y, T) > hStr(x, T)) || (x.s !== T && y.s === T && oppsMayTrump)));
    // pulling for the caller's jack: king or ober first (the next opponent has to beat it, often with the ace or 10,
    // which the caller then takes); the 9 is never a pull card, it backs up the caller's jack
    const PULL = { K: 14, O: 13, '8': 9, '7': 9, '10': 5, A: 5, '9': -6 };
    const partnerSeat = (seat + 2) % 4;
    // leading with no plain ace to cash, not pulling trumps for partner, and not the calling side with 3+ trumps:
    // lead the cheapest plain card rather than a 10 or a king that the opponents can take
    if (pos === 0 && !(pullForJack && myTrumps > 0) && !legal.some(c => c.s !== T && c.r === 'A') && !(callerTeam && myTrumps >= 3)) {
      const low = legal.reduce((x, y) => (hPts(y, T) * 10 + hStr(y, T)) < (hPts(x, T) * 10 + hStr(x, T)) ? y : x);
      if (low.s !== T) return low;
    }
    let best = null;
    for (const c of legal) {
      let pts = tablePts + hPts(c, T) + after.length * 3;
      if (st.trickNo === 7) pts += 10;
      const iWin = !curW || (c.s === curW.card.s ? hStr(c, T) > hStr(curW.card, T) : c.s === T);
      let pWin;
      if (iWin) { const ph = pHold(c); pWin = ph + (1 - ph) * (partnerAfter ? 0.3 : 0); }
      else if (curW.seat % 2 === me) pWin = pHold(curW.card);
      else pWin = partnerAfter ? 0.3 : 0;
      let ev = (2 * pWin - 1) * pts;
      if (c.s === T) ev -= (tricksLeft / 8) * (1.5 + T_STR[c.r] * 0.9);
      // padding: partner's non-trump ace is winning, so drop my 10 of that suit on it
      // (as defenders especially: the callers would trump that 10 later)
      const partnerAce = curW && curW.seat === partnerSeat && curW.card.s !== T && curW.card.r === 'A' && c.s === curW.card.s && c.r === '10';
      // banking: partner has this trick won, and I hold the top cards of a suit (e.g. A, 10, K) – drop the top one now;
      // my next card becomes the new master, so I still control the suit, and the points are safe from a later trump
      const trickSafe = curW && curW.seat === partnerSeat && (pos === 3 || pHold(curW.card) >= 0.85);
      const nextTop = c.s !== T && hand.filter(x => x.s === c.s && x.id !== c.id).sort((x, y) => hStr(y, T) - hStr(x, T))[0];
      const bank = trickSafe && c.s !== T && hPts(c, T) >= 10 && isMaster(c) && nextTop && !unk.some(y => y.s === c.s && hStr(y, T) > hStr(nextTop, T));
      if (partnerAce) ev += callerTeam ? 4 : 9;
      else if (bank) ev += 2 + hPts(c, T) * (callerTeam ? 0.4 : 0.7);
      else if (!iWin && isMaster(c) && c.s !== T && hPts(c, T) >= 10) ev -= 4;
      // the caller's partner keeps the trump 9 to back up the caller's jack
      if (partnerCalled && c.s === T && c.r === '9' && !jackOut && legal.length > 1 && !(iWin && pos === 3 && tablePts >= 20)) ev -= 7;
      if (pos === 0) {
        if (c.s === T && isMaster(c) && oppsMayTrump && (callerTeam || myTrumps >= 3)) ev += 8 + unkT.length;
        // caller's partner leads a fairly high trump: the next opponent must overtrump if they can, then the caller's jack takes it
        if (pullForJack && c.s === T) ev += PULL[c.r];
        if (c.s === T && !oppsMayTrump && !allMasters) ev -= 8;
        if (c.s !== T && isMaster(c) && unk.some(x => x.s === c.s)) ev += 3;
        if (c.s === T && !isMaster(c) && !callerTeam) ev -= 4;
      }
      if (seat === st.belaSeat && !st.belaCalled && c.s === T && (c.r === 'K' || c.r === 'O')) ev += 1;
      // ruff with the smallest trump that does the job, not the jack or 9
      if (pos && iWin && c.s === T && curW.card.s !== T && (c.r === 'U' || c.r === '9') && legal.some(x => x.s === T && x.r !== 'U' && x.r !== '9')) ev -= 8;
      ev += Math.random() * 0.2;
      if (!best || ev > best.ev) best = { c, ev };
    }
    return best.c;
  }

  // ================================= TREŠETA =================================
  // Same 40-card Italian deck as briškula. No trumps, must follow suit.
  // Rank 3 > 2 > A > K > C > F > 7 > 6 > 5 > 4. Ace = 1 point, 3/2/K/C/F ("bele") = 1/3 point, last trick = 1 point.
  const T_ORDER = { '3': 10, '2': 9, 'A': 8, 'K': 7, 'C': 6, 'F': 5, '7': 4, '6': 3, '5': 2, '4': 1 };
  const tStr = c => T_ORDER[c.r];
  const tThirds = c => c.r === 'A' ? 3 : (c.r === '3' || c.r === '2' || c.r === 'K' || c.r === 'C' || c.r === 'F') ? 1 : 0;
  function tNew(opts) {
    // local rules (opts): akuze, longNap, thirdsToLast, signals, clockwise
    const seats = opts.players === 2 ? [0, 2] : opts.clockwise ? [0, 3, 2, 1] : [0, 1, 2, 3];
    return { game: 't', opts, seats, teams: 2, dealer: seats[seats.length - 1], score: [0, 0], rows: [] };
  }
  const T_SEQ = ['3', '2', 'A', 'K', 'C', 'F', '7', '6', '5', '4'];
  function tFindAkuze(hand, opts = {}) {
    const out = [];
    for (const r of ['3', '2', 'A']) {
      const n = hand.filter(c => c.r === r).length;
      if (n >= 3) out.push({ type: n === 4 ? 'four' : 'three', r, val: n });
    }
    for (let s = 0; s < 4; s++) {
      if (!['A', '2', '3'].every(r => hand.some(c => c.s === s && c.r === r))) continue;
      // long napolitana: every further card in sequence (K, konj, fanat, 7...) adds a point
      let len = 3;
      if (opts.longNap) while (len < T_SEQ.length && hand.some(c => c.s === s && c.r === T_SEQ[len])) len++;
      out.push({ type: 'napolitana', s, len, val: len });
    }
    return out;
  }
  function tDeal(st) {
    const deck = shuffle(bDeck(), DEAL_RNG);
    st.hands = {}; st.seats.forEach(s => st.hands[s] = []);
    let s = nextSeat(st, st.dealer);
    for (let i = 0; i < 10 * st.seats.length; i++) { st.hands[s].push(deck.pop()); s = nextSeat(st, s); }
    st.stock = deck; // empty with 4 players, 20 cards with 2
    st.leader = nextSeat(st, st.dealer);
    st.trick = []; st.won = [[], []]; st.tricks = [0, 0]; st.seen = new Set(); st.lastTrick = null; st.trickNo = 0;
    st.void = {}; st.seats.forEach(x => st.void[x] = {});
    st.akuze = {}; st.seats.forEach(x => st.akuze[x] = st.opts.akuze === false ? [] : tFindAkuze(st.hands[x], st.opts));
    st.signals = []; st.knock = null; st.returnSuit = null;
  }
  function tToPlay(st) { return roundFrom(st, st.leader)[st.trick.length]; }
  function tLegal(st, seat) {
    const hand = st.hands[seat];
    if (!st.trick.length) return hand.slice();
    const led = st.trick[0].card.s, f = hand.filter(c => c.s === led);
    return f.length ? f : hand.slice();
  }
  function tWinnerIdx(trick) {
    const led = trick[0].card.s; let w = 0;
    for (let i = 1; i < trick.length; i++) if (trick[i].card.s === led && tStr(trick[i].card) > tStr(trick[w].card)) w = i;
    return w;
  }
  // signals (4 players only): 'kucam' (leader asks partner to take with their best card and return the suit),
  // 'strisco' (I hold many of this suit), 'volo' (this was my last card of the suit)
  function tPlay(st, seat, card, sig) {
    if (sig && st.opts.signals && st.seats.length === 4) {
      st.signals.push({ seat, s: card.s, type: sig });
      if (sig === 'kucam' && !st.trick.length) st.knock = { seat, s: card.s };
      if (sig === 'volo') st.void[seat][card.s] = true;
    }
    if (st.trick.length && card.s !== st.trick[0].card.s) st.void[seat][st.trick[0].card.s] = true;
    const h = st.hands[seat]; h.splice(h.findIndex(c => c.id === card.id), 1);
    st.trick.push({ seat, card }); st.seen.add(card.id);
    return st.trick.length === st.seats.length;
  }
  function tFinishTrick(st) {
    const w = st.trick[tWinnerIdx(st.trick)].seat, tm = teamOf(st, w);
    st.won[tm].push(...st.trick.map(t => t.card)); st.tricks[tm]++;
    st.lastTrick = { trick: st.trick, winner: w, pts: sum(st.trick, t => tThirds(t.card)) / 3 };
    st.returnSuit = st.knock && teamOf(st, w) === teamOf(st, st.knock.seat) && w !== st.knock.seat ? { seat: w, s: st.knock.s } : null;
    st.knock = null;
    st.trick = []; st.leader = w; st.trickNo++; st.lastWinner = w;
    const draws = [];
    if (st.stock.length) for (const s of roundFrom(st, w)) { const c = st.stock.pop(); st.hands[s].push(c); draws.push({ seat: s, card: c }); }
    // in 2-player trešeta every drawn card is shown, so it is public
    draws.forEach(d => (st.public = st.public || new Set()).add(d.card.id));
    return { winner: w, draws };
  }
  function tAISignal(st, seat, card) {
    if (!st.opts.signals || st.seats.length !== 4) return null;
    const hand = st.hands[seat], same = hand.filter(c => c.s === card.s && c.id !== card.id);
    if (!st.trick.length) {
      const has = r => hand.some(c => c.s === card.s && c.r === r);
      if (has('2') && !has('3') && !st.seen.has('b' + card.s + '3') && card.r !== '2') return 'kucam';
      if (same.length >= 3 && tStr(card) <= 4) return 'strisco';
    }
    if (st.trick.length && card.s === st.trick[0].card.s && same.length === 0 && hand.length > 1) return 'volo';
    return null;
  }
  function tHandOver(st) { return st.trick.length === 0 && st.seats.every(s => st.hands[s].length === 0); }
  function tScoreHand(st) {
    const thirds = st.won.map(cs => sum(cs, tThirds));
    const cardPts = thirds.map(t => Math.floor(t / 3));
    const lt = teamOf(st, st.lastWinner);
    // either leftover thirds are dropped (+1 for last trick), or the last-trick side takes the rest of the 11 points
    if (st.opts.thirdsToLast) cardPts[lt] = 11 - cardPts[1 - lt]; else cardPts[lt] += 1;
    const akuze = [0, 0];
    for (const s of st.seats) akuze[teamOf(st, s)] += sum(st.akuze[s], d => d.val);
    const add = [cardPts[0] + akuze[0], cardPts[1] + akuze[1]];
    st.score[0] += add[0]; st.score[1] += add[1];
    const row = { thirds, cardPts, akuze, add, score: st.score.slice() };
    st.rows.push(row);
    return row;
  }
  function tMatchWinner(st) {
    const t = st.opts.target;
    if ((st.score[0] >= t || st.score[1] >= t) && st.score[0] !== st.score[1]) return st.score[0] > st.score[1] ? 0 : 1;
    return -1;
  }
  function tAI(st, seat) {
    const legal = tLegal(st, seat);
    if (legal.length === 1) return legal[0];
    const hand = st.hands[seat], pos = st.trick.length, me = teamOf(st, seat);
    const after = roundFrom(st, st.leader).slice(pos + 1);
    const opps = after.filter(s => teamOf(st, s) !== me);
    const partnerAfter = after.some(s => teamOf(st, s) === me);
    const known = new Set([...st.seen, ...hand.map(c => c.id)]);
    const unk = B_ALL.filter(c => !known.has(c.id));
    const others = st.seats.filter(s => s !== seat);
    const pool = sum(others, s => st.hands[s].length) + st.stock.length;
    const curW = pos ? st.trick[tWinnerIdx(st.trick)] : null;
    const led = pos ? st.trick[0].card.s : null;
    const table = sum(st.trick, t => tThirds(t.card));
    const lastTrick = hand.length === 1 && st.stock.length === 0;
    const higher = c => unk.filter(x => x.s === c.s && tStr(x) > tStr(c)).length;
    // chance that one opponent holds none of the cards that beat c (no trumps, so a void player can never beat it)
    const holdVs = (c, o) => st.void[o][c.s] ? 1 : Math.pow(1 - Math.min(0.95, st.hands[o].length / Math.max(1, pool)), higher(c));
    const pHold = c => opps.reduce((p, o) => p * holdVs(c, o), 1);
    const isMaster = c => higher(c) === 0;
    const partner = st.seats.find(s => s !== seat && teamOf(st, s) === me && st.seats.length === 4);
    // partner knocked on this suit: take with the best card I have
    if (st.knock && st.knock.seat === partner && pos && legal[0].s === st.knock.s) return legal.reduce((x, y) => tStr(y) > tStr(x) ? y : x);
    const pSig = (s, type) => st.signals.some(g => g.seat === partner && g.s === s && g.type === type);
    let best = null;
    for (const c of legal) {
      const follows = !pos || c.s === led;
      const iWin = !curW || (follows && tStr(c) > tStr(curW.card));
      let pWin;
      if (iWin) { const ph = pHold(c); pWin = ph + (1 - ph) * (partnerAfter ? 0.25 : 0); }
      else if (teamOf(st, curW.seat) === me) pWin = pHold(curW.card);
      else pWin = partnerAfter ? 0.25 : 0;
      const pts = table + tThirds(c) + after.length * 0.55 + (lastTrick ? 3 : 0);
      let ev = (2 * pWin - 1) * pts;
      // spending a master card or the 2 behind a 3 costs future tricks
      const keep = isMaster(c) ? 2.4 : tStr(c) >= 9 ? 1.2 : tStr(c) === 8 ? 0.4 : 0;
      if (!iWin) ev -= keep; else ev -= keep * 0.25 + tStr(c) * 0.04;
      // an off-suit discard: keep guards, dump plain low cards from short suits
      if (!follows) ev += tThirds(c) === 0 ? 0.6 - 0.1 * hand.filter(x => x.s === c.s).length : 0;
      if (!pos) ev += 0.08 * hand.filter(x => x.s === c.s).length; // lead from long suits
      if (!pos && st.returnSuit && st.returnSuit.seat === seat && c.s === st.returnSuit.s) ev += 2.5; // return the knocked suit
      if (!pos && partner !== undefined && pSig(c.s, 'strisco')) ev += 0.8;  // partner is long here
      if (!pos && partner !== undefined && pSig(c.s, 'volo')) ev -= 0.8;     // partner has none left
      // don't lead a 3 or 2 from a short suit unless holding both; don't win the opponents' cheap tricks with a 3 or 2
      const both32 = hand.some(x => x.s === c.s && x.r === '3') && hand.some(x => x.s === c.s && x.r === '2');
      if (!pos && tStr(c) >= 9 && hand.filter(x => x.s === c.s).length <= 3 && !both32) ev -= 3;
      if (pos && iWin && teamOf(st, curW.seat) !== me && tStr(c) >= 9 && table < 3 && !lastTrick) ev -= 2;
      ev += Math.random() * 0.15;
      if (!best || ev > best.ev) best = { c, ev };
    }
    return best.c;
  }

  return {
    shuffle, setDealRng, teamOf, nextSeat, roundFrom,
    B_RANKS, bDeck, bNew, bDeal, bOrder, bToPlay, bBeats, bWinnerIdx, bPlay, bFinishTrick, bHandOver, bPoints, bAI,
    H_KEYS, hDeck, hStr, hPts, hNew, hDeal, hAIBid, hBid, hFindDecls, hLegal, hWinnerIdx, hToPlay, hPlay, hFinishTrick, hHandOver, hScoreHand, hMatchWinner, hAI, hBidValue, hBelaEligible, hAIBela,
    tStr, tThirds, tNew, tDeal, tToPlay, tLegal, tWinnerIdx, tPlay, tFinishTrick, tHandOver, tScoreHand, tMatchWinner, tAI, tFindAkuze, tAISignal
  };
})();
if (typeof module !== 'undefined') module.exports = Engine;
