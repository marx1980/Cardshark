// ===================== AI TIERS (Novice, Average, Pro, Cardshark) =====================
// Cardshark = the hand-tuned players in engine.js (bAI / tAI / hAI).
// Average  = simple table rules, no card counting.
// Novice   = half the time a random legal card, otherwise Average.
// Pro      = Monte-Carlo search: deals the unseen cards many ways that fit everything it knows,
//            plays each candidate card out to the end of the hand, keeps the best average.
const AI = (() => {
  const E = (typeof Engine !== 'undefined') ? Engine : require('./engine.js');
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
  const minBy = (a, f) => a.reduce((x, y) => f(y) < f(x) ? y : x);
  const maxBy = (a, f) => a.reduce((x, y) => f(y) > f(x) ? y : x);

  // ---------------------------------------------------------------- legal moves per game
  const legalOf = (g, st, seat) => g === 'h' ? E.hLegal(st, seat) : g === 't' ? E.tLegal(st, seat) : st.hands[seat].slice();
  const toPlay = (g, st) => g === 'h' ? E.hToPlay(st) : g === 't' ? E.tToPlay(st) : E.bToPlay(st);

  // ================================================================ AVERAGE players
  // Briškula: win a trick with points cheaply, never waste trumps on nothing, dump zero-point cards
  function bAverage(st, seat) {
    const hand = st.hands[seat], T = st.trump, me = E.teamOf(st, seat);
    const cheap = cs => minBy(cs, c => c.p * 10 + c.st + (c.s === T ? 50 : 0));
    if (!st.trick.length) return cheap(hand);
    const w = st.trick[E.bWinnerIdx(st.trick, T)];
    const table = sum(st.trick, t => t.card.p);
    const last = st.trick.length === E.bOrder(st).length - 1;
    if (E.teamOf(st, w.seat) === me && st.teams === 2) {
      const pts = hand.filter(c => c.s !== T && c.p > 0);
      return last && pts.length ? maxBy(pts, c => c.p) : cheap(hand);
    }
    const win = hand.filter(c => E.bBeats(c, w.card, T));
    const plain = win.filter(c => c.s !== T);
    if (plain.length) return minBy(plain, c => c.st);
    if (win.length && table >= 10) return minBy(win, c => c.st);
    return cheap(hand);
  }
  // Briškula, Marko's face-up card habit: in the trick before the last draw, the side that LOSES the trick draws the
  // face-up trump card and also plays last in the next trick. With two sides (pairs or 2-player double) take that trick
  // only if what lies on the table is worth more than the face-up card plus the last position.
  function faceUpStake(st) {
    if (!st.stock || !st.stock.length || st.teams !== 2 || st.seats.length !== 4) return 0;   // tested: helps in pairs, not in 2-player double
    const perRound = st.seats.length * (st.opts.double ? 2 : 1);
    if (st.stock.length !== perRound) return 0;
    return st.stock[0].p + 2 + st.stock[0].st * 0.4;
  }
  function bAverageFU(st, seat) {
    const V = faceUpStake(st); if (!V || !st.trick.length) return bAverage(st, seat);
    const hand = st.hands[seat], T = st.trump, me = E.teamOf(st, seat);
    const w = st.trick[E.bWinnerIdx(st.trick, T)];
    if (E.teamOf(st, w.seat) === me) return bAverage(st, seat);
    const table = sum(st.trick, t => t.card.p);
    const lose = hand.filter(c => !E.bBeats(c, w.card, T));
    const win = hand.filter(c => E.bBeats(c, w.card, T));
    // taking it gains the table and my card's points, but hands the opponents the face-up card and the last position
    const bestTake = win.length ? minBy(win, c => c.st + (c.s === T ? 20 : 0)) : null;
    if (bestTake && table + bestTake.p > V * 1.5) return bestTake;
    if (lose.length) return minBy(lose, c => c.p * 10 + c.st + (c.s === T ? 50 : 0));
    return bAverage(st, seat);
  }
  // Bela: lead aces, take tricks worth taking, give partner points when he wins, otherwise cheapest legal card
  function hAverage(st, seat) {
    const legal = E.hLegal(st, seat); if (legal.length === 1) return legal[0];
    const T = st.trump, pts = c => E.hPts(c, T), str = c => E.hStr(c, T);
    const cheap = cs => minBy(cs, c => pts(c) * 10 + str(c));
    if (!st.trick.length) {
      // the caller holding the jack leads it to draw the trumps
      if (st.caller === seat) { const j = legal.find(c => c.s === T && c.r === 'U'); if (j) return j; }
      const aces = legal.filter(c => c.s !== T && c.r === 'A');
      if (aces.length) return aces[0];
      if (st.caller % 2 === seat % 2) { const tr = legal.filter(c => c.s === T); if (tr.length >= 3) return maxBy(tr, str); }
      return cheap(legal);
    }
    const w = st.trick[E.hWinnerIdx(st.trick, T)];
    const beats = c => (c.s === w.card.s ? str(c) > str(w.card) : c.s === T);
    if (w.seat % 2 === seat % 2) {
      const giv = legal.filter(c => !beats(c) && c.s !== T && pts(c) >= 10);
      return st.trick.length === 3 && giv.length ? maxBy(giv, pts) : cheap(legal);
    }
    const win = legal.filter(beats);
    const table = sum(st.trick, t => pts(t.card));
    if (win.length && (table >= 10 || st.trickNo === 7 || st.trick.length === 3)) return minBy(win, str);
    return cheap(legal);
  }
  function hAverageBid(st, seat) {
    let best = 0, bv = -1;
    for (let s = 0; s < 4; s++) { const v = E.hBidValue(st.hands[seat], s); if (v > bv) { bv = v; best = s; } }
    return (seat === st.dealer || bv >= 44) ? best : -1;
  }
  function hNoviceBid(st, seat) {
    const h = st.hands[seat]; let best = 0, bn = -1;
    for (let s = 0; s < 4; s++) { const n = h.filter(c => c.s === s).length + (h.some(c => c.s === s && c.r === 'U') ? 1 : 0); if (n > bn) { bn = n; best = s; } }
    return (seat === st.dealer || bn >= 4) ? best : -1;
  }
  // Trešeta: follow suit, take tricks with an ace in them, feed partner, otherwise lowest card
  function tAverage(st, seat) {
    const legal = E.tLegal(st, seat); if (legal.length === 1) return legal[0];
    const cheap = cs => minBy(cs, c => E.tThirds(c) * 10 + E.tStr(c));
    if (!st.trick.length) {
      for (const c of legal) if (c.r === '3' && legal.some(x => x.s === c.s && x.r === '2')) return c;
      const bySuit = s => legal.filter(c => c.s === s).length;
      return minBy(legal, c => -bySuit(c.s) * 20 + E.tThirds(c) * 10 + E.tStr(c));
    }
    const w = st.trick[E.tWinnerIdx(st.trick)], led = st.trick[0].card.s;
    const win = legal.filter(c => c.s === led && E.tStr(c) > E.tStr(w.card));
    const table = sum(st.trick, t => E.tThirds(t.card));
    const last = st.trick.length === st.seats.length - 1;
    if (E.teamOf(st, w.seat) === E.teamOf(st, seat)) {
      const give = legal.filter(c => E.tThirds(c) > 0 && !win.includes(c));
      return last && give.length ? maxBy(give, E.tThirds) : cheap(legal);
    }
    if (win.length && (table >= 3 || last || st.hands[seat].length === 1)) return minBy(win, E.tStr);
    return cheap(legal);
  }
  // Bela's follow-suit / overtrump rules already narrow the choice, so the Bela novice picks at random more often
  const NOVICE_P = { b: 0.25, t: 0.6, h: 0.9 };     // share of random cards (calibrated: Average beats Novice ~65-74%)
  const novice = (f, legal, p = 0.5) => Math.random() < p ? rnd(legal) : f();

  // ================================================================ PRO (determinized Monte-Carlo)
  function clone(st) {
    const w = Object.assign({}, st);
    w.hands = {}; for (const s of st.seats) w.hands[s] = st.hands[s].slice();
    w.trick = st.trick.slice(); w.won = st.won.map(a => a.slice());
    if (st.stock) w.stock = st.stock.slice();
    w.seen = new Set(st.seen);
    if (st.void) { w.void = {}; for (const k in st.void) w.void[k] = Object.assign({}, st.void[k]); }
    if (st.tricks) w.tricks = st.tricks.slice();
    if (st.score) w.score = st.score.slice();
    if (st.wins) w.wins = st.wins.slice();
    if (st.signals) w.signals = st.signals.slice();
    if (st.public) w.public = new Set(st.public);
    w.rows = []; w.history = [];
    return w;
  }
  // rollout copy with a fixed shape (much faster than copying every field); rollout players never read 'seen'
  const SINK = { add() { }, has() { return false; } };
  const hcopy = (st) => { const h = {}; for (const s of st.seats) h[s] = st.hands[s].slice(); return h; };
  const vcopy = v => { const o = {}; for (const k in v) o[k] = Object.assign({}, v[k]); return o; };
  function cloneLite(st) {
    const won = st.won.map(x => x.slice());
    if (st.game === 'b') return { game: 'b', opts: st.opts, seats: st.seats, teams: st.teams, trump: st.trump, hands: hcopy(st), trick: st.trick.slice(), won, stock: st.stock.slice(), seen: SINK, leader: st.leader, trickNo: st.trickNo, lastTrick: null };
    if (st.game === 't') return { game: 't', opts: st.opts, seats: st.seats, teams: 2, hands: hcopy(st), trick: st.trick.slice(), won, tricks: st.tricks.slice(), stock: st.stock.slice(), seen: SINK, public: SINK, void: vcopy(st.void), leader: st.leader, trickNo: st.trickNo, lastWinner: st.lastWinner, lastTrick: null, akuze: st.akuze, score: st.score.slice(), rows: [], signals: [], knock: null, returnSuit: null, dealer: st.dealer };
    return { game: 'h', opts: st.opts, seats: st.seats, trump: st.trump, caller: st.caller, dealer: st.dealer, decls: st.decls, belaSeat: st.belaSeat, belaCalled: st.belaCalled, belaSkipped: st.belaSkipped, hang: st.hang, hands: hcopy(st), trick: st.trick.slice(), won, tricks: st.tricks.slice(), seen: SINK, void: vcopy(st.void), leader: st.leader, trickNo: st.trickNo, lastWinner: st.lastWinner, lastTrick: null, score: st.score.slice(), rows: [] };
  }
  const DECKS = { h: E.hDeck(), b: E.bDeck() };
  const deckOf = g => g === 'h' ? DECKS.h : DECKS.b;
  // deal every card the viewer cannot see to the other hands / the stock, respecting known voids and revealed cards
  function determinize(g, st, viewer) {
    const w = cloneLite(st), mine = new Set(st.hands[viewer].map(c => c.id));
    const fixed = {};                       // card id -> seat known to hold it
    if (g === 'h' && st.decls && st.decls.team >= 0) {
      for (const s of st.decls.order) if (s % 2 === st.decls.team && s !== viewer)
        for (const d of st.decls.per[s]) {
          const ids = d.type === 'quad' ? [0, 1, 2, 3].map(x => 'h' + x + d.r) : d.type === 'seq' ? E.H_KEYS.slice(d.low, d.top + 1).map(r => 'h' + d.s + r) : [];
          ids.forEach(id => { fixed[id] = s; });
        }
      if (st.belaCalled && st.belaSeat !== viewer) ['K', 'O'].forEach(r => { fixed['h' + st.trump + r] = st.belaSeat; });
    }
    if (g === 't' && st.akuze) for (const s of st.seats) if (s !== viewer) for (const d of st.akuze[s]) {
      if (d.type === 'napolitana') ['A', '2', '3'].forEach(r => { fixed['b' + d.s + r] = s; });
      if (d.type === 'four') [0, 1, 2, 3].forEach(x => { fixed['b' + x + d.r] = s; });
    }
    if (g === 't' && st.public) for (const id of st.public) if (!fixed[id]) { const s = st.seats.find(x => x !== viewer); fixed[id] = s; }
    const stockFixed = (g === 'b' && st.stock && st.stock.length) ? st.stock[0] : null; // the face-up briškula
    const all = deckOf(g).filter(c => !mine.has(c.id) && !st.seen.has(c.id) && c.id !== st.removed && (!stockFixed || c.id !== stockFixed.id));
    const others = st.seats.filter(s => s !== viewer);
    for (let attempt = 0; attempt < 30; attempt++) {
      const need = {}; others.forEach(s => need[s] = st.hands[s].length);
      let stockNeed = st.stock ? st.stock.length - (stockFixed ? 1 : 0) : 0;
      const hands = {}; others.forEach(s => hands[s] = []);
      const free = [];
      for (const c of all) {
        const f = fixed[c.id];
        if (f !== undefined && need[f] > 0) { hands[f].push(c); need[f]--; } else free.push(c);
      }
      E.shuffle(free);
      let ok = true; const stock = [];
      for (const c of free) {
        const opts = others.filter(s => need[s] > 0 && !(st.void && st.void[s] && st.void[s][c.s] && attempt < 25));
        const cap = sum(opts, s => need[s]) + stockNeed;
        if (!cap) { ok = false; break; }
        let r = Math.random() * cap, pick = null;
        for (const s of opts) { r -= need[s]; if (r < 0) { pick = s; break; } }
        if (pick === null) { stock.push(c); stockNeed--; } else { hands[pick].push(c); need[pick]--; }
      }
      if (!ok) continue;
      others.forEach(s => { w.hands[s] = hands[s]; });
      if (st.stock) { w.stock = stockFixed ? [stockFixed, ...E.shuffle(stock)] : E.shuffle(stock); }
      return w;
    }
    return cloneLite(st);
  }
  // play one card on a world, finish tricks as needed
  function step(g, w, seat, card) {
    if (g === 'b') { if (E.bPlay(w, seat, card)) E.bFinishTrick(w); }
    else if (g === 't') { if (E.tPlay(w, seat, card)) E.tFinishTrick(w); }
    else { if (E.hPlay(w, seat, card, true).done) E.hFinishTrick(w); }
  }
  const over = (g, w) => g === 'b' ? E.bHandOver(w) : g === 't' ? E.tHandOver(w) : E.hHandOver(w);
  function value(g, w, seat) {
    const me = E.teamOf(w, seat);
    if (g === 'b') { const p = E.bPoints(w); const others = p.filter((_, i) => i !== me); return p[me] - Math.max(...others); }
    const r = g === 't' ? E.tScoreHand(w) : E.hScoreHand(w);
    return r.add[me] - r.add[1 - me];
  }
  const ROLL = { b: (w, s) => bAverage(w, s), t: (w, s) => tAverage(w, s), h: (w, s) => hAverage(w, s) };
  const SAMPLES = { b: 24, t: 6, h: 12 };           // Pro (calibrated: beats Average ~65-72%)
  // a dealt world with the full game state (card memory, voids, bids, signals) for playouts by the Cardshark rules
  function determinizeFull(g, st, seat) {
    const lite = determinize(g, st, seat), w = clone(st);
    for (const s of st.seats) w.hands[s] = lite.hands[s].slice();
    if (lite.stock) w.stock = lite.stock.slice();
    return w;
  }
  const CS_ROLL = { b: (w, s) => E.bAI(w, s), t: (w, s) => E.tAI(w, s), h: (w, s) => E.hAI(w, s) };
  // exact endgame for briškula in pairs once the stock is empty: best play for both sides on a fully dealt world.
  // returns my pair's points minus the other pair's from here to the end of the hand
  function ddB(w, seat) {
    const T = w.trump, me = E.teamOf(w, seat), hands = {};
    for (const s of w.seats) hands[s] = w.hands[s].slice();
    function solve(leader, trick, alpha, beta) {
      const order = E.roundFrom(w, leader), s = order[trick.length], h = hands[s];
      if (!h.length) return 0;
      const max = E.teamOf(w, s) === me;
      let best = max ? -1e9 : 1e9;
      for (let i = 0; i < h.length; i++) {
        const c = h[i]; h.splice(i, 1); trick.push({ seat: s, card: c });
        let v;
        if (trick.length === order.length) {
          const win = trick[E.bWinnerIdx(trick, T)].seat; let pts = 0; for (const t of trick) pts += t.card.p;
          const done = trick; trick = [];
          v = (E.teamOf(w, win) === me ? pts : -pts) + solve(win, [], alpha, beta);
          trick = done;
        } else v = solve(leader, trick, alpha, beta);
        trick.pop(); h.splice(i, 0, c);
        if (max) { if (v > best) best = v; if (best > alpha) alpha = best; } else { if (v < best) best = v; if (best < beta) beta = best; }
        if (alpha >= beta) break;
      }
      return best;
    }
    return solve(w.trick.length ? w.trick[0].seat : w.leader, w.trick.slice(), -1e9, 1e9);
  }
  // briškula hands are won or lost, not scored by margin: value winning the hand, with the margin only as a tie-breaker
  const winValue = d => (d > 0 ? 40 : d < 0 ? -40 : 0) + d * 0.2;
  const ddReady = (g, w) => g === 'b' && w.teams === 2 && w.seats.length === 4 && !w.opts.double && w.stock.length === 0;
  function hSane(st, seat, legal) {
    if (st.trick.length || st.caller % 2 === seat % 2) return legal;
    const T = st.trump, mine = new Set(st.hands[seat].map(c => c.id));
    const beatable = c => DECKS.h.some(x => x.s === T && !mine.has(x.id) && !st.seen.has(x.id) && E.hStr(x, T) > E.hStr(c, T));
    const f = legal.filter(c => c.s !== T || !beatable(c));
    return f.length ? f : legal;
  }
  function pro(g, st, seat, opts = {}) {
    let legal = opts.legal || legalOf(g, st, seat);
    if (g === 'h' && !opts.noSane) legal = hSane(st, seat, legal);
    if (legal.length === 1) return legal[0];
    const n = opts.samples || SAMPLES[g];
    // optional per-seat models: imagine each other seat playing like its real level
    const base = opts.rollout || ROLL[g], M = opts.models;
    if (M && !opts.full && Object.values(M).includes(CS_ROLL[g])) opts = { ...opts, full: true };
    const roll = M ? (w, s) => (M[s] || base)(w, s) : base;
    const deal = opts.full ? determinizeFull : determinize, copy = opts.full ? clone : cloneLite;
    const vals = legal.map(() => []), t0 = Date.now();
    for (let k = 0; k < n; k++) {
      if (opts.timeMs && k >= 6 && Date.now() - t0 > opts.timeMs) break;   // keep the phone responsive
      const world = deal(g, st, seat);
      legal.forEach((c, i) => {
        const w = copy(world);
        step(g, w, seat, c);
        if (opts.dd && ddReady(g, w)) {
          const p = E.bPoints(w), me = E.teamOf(w, seat);
          const d = p[me] - p[1 - me] + ddB(w, seat); vals[i].push(opts.winObj ? winValue(d) : d); return;
        }
        let guard = 0;
        while (!over(g, w) && guard++ < 200) { const s = toPlay(g, w); step(g, w, s, roll(w, s)); }
        vals[i].push(opts.winObj ? winValue(value(g, w, seat)) : value(g, w, seat));
      });
      // stop early once the leader is clearly ahead of the runner-up (paired samples, ~3 standard errors)
      if (k >= 7 && k % 4 === 3) {
        const means = vals.map(v => v.reduce((x, y) => x + y, 0) / v.length);
        const order = means.map((m, i) => i).sort((x, y) => means[y] - means[x]);
        const d = vals[order[0]].map((v, j) => v - vals[order[1]][j]);
        const md = d.reduce((x, y) => x + y, 0) / d.length;
        const sd = Math.sqrt(d.reduce((x, y) => x + (y - md) * (y - md), 0) / (d.length - 1)) || 1e-9;
        if (md / (sd / Math.sqrt(d.length)) > 3) break;
      }
    }
    const means = vals.map(v => v.reduce((x, y) => x + y, 0) / v.length);
    if (opts.withValues) return { legal, means };
    return legal[means.indexOf(Math.max(...means))];
  }

  // ================================================================ Bela bidding by simulation
  // deal the hidden cards many ways, and for each option (each suit, or pass) play the hand out with the Cardshark rules;
  // pick the option with the best average result for my pair
  function hSimBid(st, seat, n = 24) {
    const mine = new Set(st.hands[seat].map(c => c.id));
    const forced = seat === st.dealer;
    const opts = forced ? [0, 1, 2, 3] : [-1, 0, 1, 2, 3];
    const vals = opts.map(() => 0), me = seat % 2;
    for (let k = 0; k < n; k++) {
      const pool = E.shuffle(DECKS.h.filter(c => !mine.has(c.id)));
      const world = clone(st); world.talon = {};
      for (const s of st.seats) { if (s !== seat) world.hands[s] = pool.splice(0, st.hands[s].length); }
      for (const s of st.seats) world.talon[s] = pool.splice(0, 2);
      world.bids = st.bids.slice();
      opts.forEach((o, i) => {
        const w = clone(world); w.bids = world.bids.slice(); w.talon = world.talon;
        let done = E.hBid(w, seat, o), guard = 0;
        while (!done && guard++ < 8) { const b = w.bidder; done = E.hBid(w, b, E.hAIBid(w, b)); }
        if (w.decls.belotSeat !== null) { vals[i] += w.decls.belotSeat % 2 === me ? 400 : -400; return; }
        while (!E.hHandOver(w)) { const s = E.hToPlay(w); if (E.hPlay(w, s, E.hAI(w, s), true).done) E.hFinishTrick(w); }
        const r = E.hScoreHand(w); vals[i] += r.add[me] - r.add[1 - me];
      });
    }
    return opts[vals.indexOf(Math.max(...vals))];
  }

  // playout policy that imitates a level (Pro and Cardshark are too slow to imagine, so the closest fast player stands in)
  // (Cardshark's lookahead in Briškula and Bela behaves like the Average-style playouts it uses; in Trešeta like its own rules)
  const MODELS = {};
  function modelOf(g, level) {
    const k = g + level;
    if (!MODELS[k]) MODELS[k] = level === 'novice' ? (w, s) => novice(() => ROLL[g](w, s), legalOf(g, w, s), NOVICE_P[g])
      : level === 'cardshark' && g === 't' ? CS_ROLL.t : ROLL[g];
    return MODELS[k];
  }
  // models for every seat given each seat's level (null = default)
  function modelsFor(g, levels) {
    const m = {}; for (const s in levels) m[s] = modelOf(g, levels[s]); return m;
  }

  // ================================================================ CARDSHARK
  // Lookahead like Pro but much deeper, plus Marko's Bela rules where they apply.
  // Briškula and Bela imagine Average-style players (tested best); Trešeta imagines Cardshark's own rules (tested best).
  const CS_SAMPLES = { b: 192, t: 16, h: 96 };      // Cardshark (beats Pro ~60-68%)
  let CS_FACEUP = true;                               // Briškula pairs: Marko's face-up card habit in Cardshark's imagined players (tested: 56% vs without)
  const setFaceUp = v => { CS_FACEUP = v; };
  // Marko's Bela rules: some pick the card outright, some rule cards out and leave the choice to the lookahead
  function hRules(st, seat, legal) {
    const T = st.trump, hand = st.hands[seat], pos = st.trick.length, me = seat % 2;
    const known = new Set([...st.seen, ...hand.map(c => c.id)]);
    const unk = DECKS.h.filter(c => !known.has(c.id)), unkT = unk.filter(c => c.s === T);
    const str = c => E.hStr(c, T), pts = c => E.hPts(c, T);
    const oppsMayTrump = unkT.length > 0 && [0, 1, 2, 3].filter(s => s % 2 !== me).some(o => !st.void[o][T]);
    const jackOut = st.seen.has('h' + T + 'U'), iHaveJack = hand.some(x => x.s === T && x.r === 'U');
    const naMus = st.caller === st.dealer && st.bids.filter(b => b.suit < 0).length === 3;
    const partnerCalled = st.caller !== seat && st.caller % 2 === me;
    const isMaster = c => !unk.some(x => x.s === c.s && str(x) > str(c));
    const partnerSeat = (seat + 2) % 4;
    const curW = pos ? st.trick[E.hWinnerIdx(st.trick, T)] : null;
    const tablePts = sum(st.trick, t => pts(t.card));
    // trump pull: the caller's partner leads the king or ober of trumps so the caller's jack can take the next opponent's trump
    if (pos === 0 && partnerCalled && !naMus && !jackOut && !iHaveJack && oppsMayTrump) {
      const kq = legal.filter(c => c.s === T && (c.r === 'K' || c.r === 'O'));
      if (kq.length) return { pick: kq.find(c => c.r === 'K') || kq[0] };
    }
    // pad: partner's plain ace is winning, drop my 10 of that suit on it
    if (curW && curW.seat === partnerSeat && curW.card.s !== T && curW.card.r === 'A') {
      const ten = legal.find(c => c.s === curW.card.s && c.r === '10');
      if (ten) return { pick: ten };
    }
    // bank: partner's trick is safe and I hold the top two of a suit, drop the top one
    if (curW && curW.seat === partnerSeat) {
      const opps = [0, 1, 2, 3].filter(s => s % 2 !== me && !st.trick.some(t => t.seat === s));
      const safe = !opps.length || (isMaster(curW.card) && (curW.card.s === T || !unkT.length || opps.every(o => st.void[o][T])));
      if (safe) for (const c of legal) {
        if (c.s === T || pts(c) < 10 || !isMaster(c)) continue;
        const next = hand.filter(x => x.s === c.s && x.id !== c.id).sort((x, y) => str(y) - str(x))[0];
        if (next && !unk.some(y => y.s === c.s && str(y) > str(next))) return { pick: c };
      }
    }
    let cand = legal;
    // keep the trump 9 to back up the caller's jack
    if (partnerCalled && !jackOut && !(pos === 3 && tablePts >= 20)) { const f = cand.filter(c => !(c.s === T && c.r === '9')); if (f.length) cand = f; }
    // trump counting: opponents are out of trumps, stop leading trumps unless every card I hold is a winner
    if (pos === 0 && !oppsMayTrump && !hand.every(x => !unk.some(y => y.s === x.s && str(y) > str(x)))) { const f = cand.filter(c => c.s !== T); if (f.length) cand = f; }
    return { cand };
  }
  function cardshark(g, st, seat, opts = {}) {
    let legal = legalOf(g, st, seat);
    if (legal.length === 1) return legal[0];
    if (g === 'h') { const r = hRules(st, seat, legal); if (r.pick) return r.pick; legal = r.cand; if (legal.length === 1) return legal[0]; }
    const o = { ...opts, legal, samples: CS_SAMPLES[g] };
    if (g === 't') { o.full = true; o.rollout = CS_ROLL.t; }
    if (g === 'b' && CS_FACEUP) o.rollout = bAverageFU;
    return pro(g, st, seat, o);
  }

  // ================================================================ dispatch
  const LEVELS = ['novice', 'average', 'pro', 'cardshark'];
  const EXTRA = {};   // experimental players for the simulations (not shown in the app)
  function play(g, st, seat, level, opts = {}) {
    if (EXTRA[level]) return EXTRA[level](g, st, seat);
    if (level === 'cardshark') return cardshark(g, st, seat, opts);
    if (level === 'pro') return pro(g, st, seat, opts);
    const avg = () => g === 'b' ? bAverage(st, seat) : g === 't' ? tAverage(st, seat) : hAverage(st, seat);
    if (level === 'novice') return novice(avg, legalOf(g, st, seat), NOVICE_P[g]);
    return avg();
  }
  function bid(st, seat, level) {
    if (EXTRA[level] && EXTRA[level].bid) return EXTRA[level].bid(st, seat);
    if (level === 'novice') return hNoviceBid(st, seat);
    if (level === 'average') return hAverageBid(st, seat);
    if (level === 'cardshark') return E.hAIBid(st, seat, 33);   // tested: calling a little more often pays
    return E.hAIBid(st, seat);
  }
  const callBela = (st, seat, level) => { const x = EXTRA[level]; if (x && x.bela === false) return true; return level === 'cardshark' || level === 'pro' || x ? E.hAIBela(st, seat) : true; };
  return { LEVELS, EXTRA, CS_ROLL, CS_SAMPLES, setFaceUp, bAverageFU, faceUpStake, modelOf, modelsFor, cardshark, hRules, determinizeFull, hSimBid, play, bid, callBela, pro, determinize, clone, cloneLite, bAverage, hAverage, tAverage, SAMPLES, ROLL };
})();
if (typeof module !== 'undefined') module.exports = AI;
