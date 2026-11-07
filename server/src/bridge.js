// ===================== CONTRACT BRIDGE (rubber) =====================
// Four players, two partnerships (seats 0+2 against 1+3), 52 cards, 13 each. Play goes clockwise: the next seat
// sits on your left (like Poker and Rummy here). An auction picks the contract (level 1–7 and a trump suit or no
// trump, possibly doubled); the declarer's partner is the dummy: after the opening lead the dummy's hand goes
// face up and the declarer plays it. The side to the declarer's left leads. Rubber scoring: the first side to win
// two games wins the rubber. Trick points go below the line (100 below = a game), bonuses above. No honours.
// Pure module (no I/O): the server and the app both run it. Cards: { id, s: 'S'|'H'|'D'|'C', r: 1..13 } (ace = 1).
const Bridge = (() => {
  const SUITS = ['C', 'D', 'H', 'S'];          // denominations 0..3; 4 = no trump
  const DENS = ['C', 'D', 'H', 'S', 'NT'];
  const RN = { 1: 'a', 11: 'j', 12: 'q', 13: 'k' };
  const key = c => c.s + (RN[c.r] || c.r);
  const rk = c => c.r === 1 ? 14 : c.r;
  const sidx = s => SUITS.indexOf(s);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const makeDeck = () => { const d = []; for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ id: s + r, s, r }); return d; };
  const sortHand = h => h.slice().sort((a, b) => sidx(b.s) - sidx(a.s) || rk(b) - rk(a));
  const team = s => s % 2;
  const left = s => (s + 1) % 4;
  const hcp = h => h.reduce((a, c) => a + (rk(c) >= 11 ? rk(c) - 10 : 0), 0);
  const lens = h => SUITS.map(s => h.filter(c => c.s === s).length);   // by denomination index

  // ---------------------------------------------------------------- auction
  const callStr = c => c.t === 'pass' ? 'P' : c.t === 'x' ? 'X' : c.t === 'xx' ? 'XX' : c.level + DENS[c.den];
  const bidRank = c => c.level * 5 + c.den;
  function auction(calls, dealer) {
    let last = null, dbl = 0, dblSeat = -1, trailing = 0;
    calls.forEach(x => {
      if (x.call.t === 'pass') { trailing++; return; }
      trailing = 0;
      if (x.call.t === 'bid') { last = { level: x.call.level, den: x.call.den, seat: x.seat }; dbl = 0; dblSeat = -1; }
      else if (x.call.t === 'x') { dbl = 1; dblSeat = x.seat; }
      else if (x.call.t === 'xx') { dbl = 2; dblSeat = x.seat; }
    });
    const passedOut = calls.length === 4 && !last && trailing === 4;
    const over = passedOut || (!!last && trailing >= 3 && calls.length >= 4);
    return { last, dbl, dblSeat, over, passedOut, turn: (dealer + calls.length) % 4 };
  }
  function legalCalls(st, seat) {
    const a = auction(st.calls, st.dealer), out = [{ t: 'pass' }];
    for (let level = 1; level <= 7; level++) for (let den = 0; den < 5; den++) if (!a.last || bidRank({ level, den }) > bidRank(a.last)) out.push({ t: 'bid', level, den });
    if (a.last && team(a.last.seat) !== team(seat) && a.dbl === 0) out.push({ t: 'x' });
    if (a.last && a.dbl === 1 && team(a.dblSeat) !== team(seat)) out.push({ t: 'xx' });
    return out;
  }
  const sameCall = (a, b) => a.t === b.t && (a.t !== 'bid' || (a.level === b.level && a.den === b.den));
  function makeCall(st, seat, call) {
    if (st.phase !== 'bid' || seat !== st.turn) throw Object.assign(Error('turn'), { rule: 'turn' });
    const c = call && call.t === 'bid' ? { t: 'bid', level: +call.level, den: +call.den } : { t: call && call.t };
    if (!legalCalls(st, seat).some(x => sameCall(x, c))) throw Object.assign(Error('call'), { rule: 'call' });
    st.calls.push({ seat, call: c });
    const a = auction(st.calls, st.dealer);
    if (!a.over) { st.turn = left(seat); return { over: false }; }
    if (a.passedOut) { st.phase = 'done'; st.passedOut = true; return { over: true, passedOut: true }; }
    // the declarer is the first of the declaring side to have bid that denomination
    const decl = st.calls.find(x => x.call.t === 'bid' && x.call.den === a.last.den && team(x.seat) === team(a.last.seat)).seat;
    st.contract = { level: a.last.level, den: a.last.den, decl, dbl: a.dbl };
    st.dummy = (decl + 2) % 4; st.phase = 'play'; st.leader = left(decl); st.turn = st.leader; st.trick = []; st.dummyShown = false;
    return { over: true, contract: st.contract };
  }

  // ---------------------------------------------------------------- play
  const legalPlays = (hand, trick) => {
    if (!trick.length) return hand.slice();
    const f = hand.filter(c => c.s === trick[0].card.s);
    return f.length ? f : hand.slice();
  };
  function trickWinner(trick, den) {
    const trump = den < 4 ? SUITS[den] : null, led = trick[0].card.s;
    let best = trick[0];
    for (const t of trick.slice(1)) {
      const a = t.card, b = best.card;
      if (a.s === b.s ? rk(a) > rk(b) : (a.s === trump)) best = t;
    }
    return best.seat;
  }
  function playCard(st, seat, cardId) {
    if (st.phase !== 'play' || seat !== st.turn) throw Object.assign(Error('turn'), { rule: 'turn' });
    const hand = st.hands[seat], c = hand.find(x => x.id === cardId);
    if (!c) throw Object.assign(Error('card'), { rule: 'card' });
    if (!legalPlays(hand, st.trick).some(x => x.id === cardId)) throw Object.assign(Error('follow'), { rule: 'follow' });
    if (st.trick.length && c.s !== st.trick[0].card.s) st.voids[seat][st.trick[0].card.s] = true;
    hand.splice(hand.indexOf(c), 1); st.trick.push({ seat, card: c });
    const first = !st.dummyShown && st.tricks.length === 0 && st.trick.length === 1;
    if (first) st.dummyShown = true;
    let done = null;
    if (st.trick.length === 4) {
      const w = trickWinner(st.trick, st.contract.den);
      st.tricks.push({ trick: st.trick, winner: w }); st.won[team(w)]++; st.lastTrick = { trick: st.trick, winner: w };
      st.trick = []; st.leader = w; st.turn = w; done = w;
    } else st.turn = left(seat);
    return { card: c, firstLead: first, winner: done, over: st.tricks.length === 13 };
  }

  // ---------------------------------------------------------------- scoring (rubber)
  const trickVal = (den, n) => den === 4 ? (n === 0 ? 0 : 40 + 30 * (n - 1)) : n * (den >= 2 ? 30 : 20);
  function scoreDeal(st) {
    const ct = st.contract, dt = team(ct.decl), ot = 1 - dt, need = 6 + ct.level, made = st.won[dt];
    const R = st.rubber, vul = R.games.map(g => g >= 1), mult = ct.dbl === 2 ? 4 : ct.dbl === 1 ? 2 : 1;
    const above = [0, 0], below = [0, 0], lines = [];
    if (made >= need) {
      below[dt] = trickVal(ct.den, ct.level) * mult; lines.push(['contract', below[dt]]);
      const over = made - need, unit = ct.den >= 2 && ct.den < 4 ? 30 : ct.den === 4 ? 30 : 20;
      if (over) { const v = ct.dbl === 0 ? over * unit : over * (vul[dt] ? 200 : 100) * (ct.dbl === 2 ? 2 : 1); above[dt] += v; lines.push(['over', v]); }
      if (ct.dbl) { const v = ct.dbl === 2 ? 100 : 50; above[dt] += v; lines.push(['insult', v]); }
      if (ct.level === 6) { const v = vul[dt] ? 750 : 500; above[dt] += v; lines.push(['slam', v]); }
      if (ct.level === 7) { const v = vul[dt] ? 1500 : 1000; above[dt] += v; lines.push(['grand', v]); }
    } else {
      const u = need - made; let v = 0;
      if (ct.dbl === 0) v = u * (vul[dt] ? 100 : 50);
      else {
        for (let i = 1; i <= u; i++) v += vul[dt] ? (i === 1 ? 200 : 300) : (i === 1 ? 100 : i <= 3 ? 200 : 300);
        if (ct.dbl === 2) v *= 2;
      }
      above[ot] += v; lines.push(['under', v]);
    }
    for (let t = 0; t < 2; t++) { R.above[t] += above[t]; R.below[t] += below[t]; R.belowAll[t] += below[t]; }
    let gameWon = -1, rubberOver = false;
    for (let t = 0; t < 2; t++) if (R.below[t] >= 100) gameWon = t;
    if (gameWon >= 0) {
      R.games[gameWon]++; R.gameLog.push(gameWon); R.below = [0, 0];
      if (R.games[gameWon] === 2) { const b = R.games[1 - gameWon] === 0 ? 700 : 500; R.above[gameWon] += b; lines.push(['rubber', b]); rubberOver = true; }
    }
    const total = [R.above[0] + R.belowAll[0], R.above[1] + R.belowAll[1]];
    const res = { contract: { ...ct }, made, need, declTeam: dt, above, below, lines, gameWon, rubberOver, total, games: R.games.slice(), partial: R.below.slice(), vulBefore: vul };
    st.rows.push(res); st.result = res; st.phase = 'done';
    return res;
  }

  // ---------------------------------------------------------------- match state
  function newMatch(opts = {}) {
    return { game: 'c', n: 4, opts: {}, deal: 0, dealer: 0, turn: 0, phase: 'new', calls: [], contract: null, dummy: -1, dummyShown: false,
      hands: [[], [], [], []], trick: [], tricks: [], won: [0, 0], leader: 0, voids: [{}, {}, {}, {}], lastTrick: null, passedOut: false, result: null,
      rubber: { games: [0, 0], above: [0, 0], below: [0, 0], belowAll: [0, 0], gameLog: [] }, rows: [] };
  }
  function newDeal(st) {
    st.deal++; st.dealer = left(st.dealer);
    const d = shuffle(makeDeck());
    st.hands = [0, 1, 2, 3].map(i => sortHand(d.slice(i * 13, i * 13 + 13)));
    st.calls = []; st.contract = null; st.dummy = -1; st.dummyShown = false; st.trick = []; st.tricks = []; st.won = [0, 0];
    st.voids = [{}, {}, {}, {}]; st.lastTrick = null; st.passedOut = false; st.result = null; st.phase = 'bid'; st.turn = st.dealer;
  }
  // who controls a seat's cards: the declarer plays the dummy
  const controller = (st, seat) => st.contract && seat === st.dummy ? st.contract.decl : seat;

  // ---------------------------------------------------------------- bidding bots
  // Natural bidding in a simple form: a rule for the first bid of each side, then the "ladder": work out how many
  // points the partnership holds from what partner has shown, aim for part-score / game / slam, and bid the best
  // denomination at the lowest level.
  const balancedShape = L => { const s = L.slice().sort((a, b) => b - a).join(''); return s === '4333' || s === '4432' || s === '5332'; };
  function lengthPts(L) { return L.reduce((a, n) => a + (n >= 7 ? 3 : n === 6 ? 2 : n === 5 ? 1 : 0), 0); }
  const ownCalls = (st, seat) => st.calls.filter(x => x.seat === seat && x.call.t === 'bid');
  const sideBids = (st, t) => st.calls.filter(x => team(x.seat) === t && x.call.t === 'bid');
  const minLevel = (prev, den) => !prev ? 1 : (den > prev.den ? prev.level : prev.level + 1);
  // every bid of the auction with its "jump" (levels above the cheapest way of bidding that denomination)
  function bidInfos(st) {
    const out = []; let prev = null;
    for (const x of st.calls) if (x.call.t === 'bid') { out.push({ seat: x.seat, level: x.call.level, den: x.call.den, jump: x.call.level - minLevel(prev, x.call.den), first: !prev, prev }); prev = x.call; }
    return out;
  }
  // what partner's bidding says: a range of high-card points, the suit he showed and how long it is
  function partnerInfo(st, seat) {
    const p = (seat + 2) % 4, infos = bidInfos(st), pb = infos.filter(x => x.seat === p);
    if (!pb.length) return { lo: 0, hi: st.calls.some(x => x.seat === p) ? 11 : 21, suit: -1, len: 0, last: null };
    const f = pb[0], l = pb[pb.length - 1], opener = f.first, mineBid = infos.find(x => x.seat === seat && x.prev === null);
    let lo, hi, suit = -1, len = 0;
    if (opener) {
      if (f.den === 4) { lo = f.level === 1 ? 15 : f.level === 2 ? 20 : 25; hi = f.level === 1 ? 17 : f.level === 2 ? 21 : 27; }
      else if (f.level === 2 && f.den === 0) { lo = 22; hi = 30; }
      else if (f.level >= 3) { lo = 5; hi = 10; suit = f.den; len = f.level >= 4 ? 8 : 7; }
      else if (f.level === 2) { lo = 6; hi = 10; suit = f.den; len = 6; }
      else { lo = 12; hi = 21; suit = f.den; len = f.den >= 2 ? 5 : 4; }
    } else if (infos.some(x => x.seat === seat && x.seat !== p && x.first)) {   // I opened: partner responded
      if (f.den === 4) { lo = f.level === 1 ? 6 : f.level === 2 ? 11 : 13; hi = f.level === 1 ? 10 : f.level === 2 ? 12 : 15; }
      else if (f.den === infos.find(x => x.seat === seat).den) { lo = f.jump >= 2 ? 13 : f.jump === 1 ? 10 : 6; hi = f.jump >= 2 ? 17 : f.jump === 1 ? 12 : 9; suit = f.den; len = 3; }
      else { lo = f.jump >= 1 ? 13 : f.level >= 2 ? 10 : 6; hi = f.jump >= 1 ? 17 : 15; suit = f.den; len = f.level >= 2 ? 5 : 4; }
    } else { lo = f.jump >= 1 ? 5 : 8; hi = f.jump >= 1 ? 10 : 16; suit = f.den < 4 ? f.den : -1; len = f.jump >= 1 ? 6 : 5; }   // an overcall
    if (pb.length > 1) { if (l.jump >= 1) { lo += 3; hi += 2; } if (l.den === suit) len = Math.max(len, 6); else if (l.den < 4) { suit = l.den; len = Math.max(len, 4); } if (l.level >= 4 && l.jump >= 1) { lo = Math.max(lo, 15); hi = Math.max(hi, 19); } }
    return { lo, hi, suit, len, last: l };
  }
  // the first call: opening, response to an opening, overcall
  function firstCall(st, seat, h, L, hp, tp, legal, level) {
    const a = auction(st.calls, st.dealer), bidOf = (lv, den) => legal.find(x => x.t === 'bid' && x.level === lv && x.den === den);
    const passC = { t: 'pass' };
    const best = Math.max(...L), longest = den => L[den];
    const longestSuit = () => { let b = 0; for (let d = 1; d < 4; d++) if (L[d] > L[b] || (L[d] === L[b] && d > b)) b = d; return b; };
    const bal = balancedShape(L);
    const firstBid = st.calls.find(x => x.call.t === 'bid');
    const partnerOpened = !!firstBid && firstBid.seat === (seat + 2) % 4;
    if (!a.last) {   // opening
      if (hp >= 22 || tp >= 25) return bidOf(2, 0) || passC;
      if (bal && hp >= 20 && hp <= 21) return bidOf(2, 4) || passC;
      if (bal && hp >= 15 && hp <= 17) return bidOf(1, 4) || passC;
      if (hp >= 12 || (hp >= 11 && tp >= 13)) {
        const maj = [3, 2].filter(d => L[d] >= 5).sort((x, y) => L[y] - L[x] || y - x)[0];
        if (maj !== undefined) return bidOf(1, maj) || passC;
        const mn = L[1] > L[0] ? 1 : L[1] === L[0] ? (L[1] >= 4 ? 1 : 0) : 0;
        return bidOf(1, L[0] === 3 && L[1] === 3 ? 0 : mn) || passC;
      }
      if (hp >= 5 && hp <= 10) {
        const s = longestSuit();
        if (L[s] >= 7) return bidOf(L[s] >= 8 ? 4 : 3, s) || passC;
        if (L[s] === 6 && s >= 1 && hp >= 6) return bidOf(2, s) || passC;
      }
      return passC;
    }
    if (partnerOpened) {   // response (the caller only asks for a first call)
      const o = firstBid.call, d = o.den;
      if (o.level === 1 && d === 4) {
        if (hp <= 7 && !(L.some(n => n >= 6))) return passC;
        const maj = [3, 2].filter(m => L[m] >= 5)[0];
        if (hp >= 10 && maj !== undefined) return bidOf(4, maj) || bidOf(3, 4) || passC;
        if (hp >= 8 && hp <= 9) return bidOf(2, 4) || passC;
        if (hp >= 10) return bidOf(3, 4) || passC;
        if (maj !== undefined && L[maj] >= 6) return bidOf(4, maj) || passC;
        return passC;
      }
      if (o.level === 2 && o.den === 0) return hp >= 8 ? (bidOf(2, longestSuit()) || bidOf(3, longestSuit()) || bidOf(2, 4)) : (bidOf(2, 1) || passC);
      if (o.level >= 2 && o.level <= 3 && o.den !== 4 && o.den !== 0 && hp < 14) return L[o.den] >= 3 && tp >= 13 ? (bidOf(4, o.den) || passC) : passC;
      if (tp < 6) return passC;
      const support = L[d] >= 3 || (d >= 2 && L[d] >= 3);
      if (d >= 2 && L[d] >= 3) { if (tp >= 13) return bidOf(4, d) || bidOf(3, d) || passC; if (tp >= 10) return bidOf(3, d) || passC; return bidOf(2, d) || passC; }
      const maj4 = [3, 2].filter(m => L[m] >= 4 && m > d && hp >= 6)[0];
      if (o.level === 1 && maj4 !== undefined && hp >= 6) return bidOf(1, maj4) || bidOf(2, maj4) || passC;
      if (d < 2 && L[d] >= 5 && tp >= 6) { if (tp >= 13) return bidOf(3, d) || passC; if (tp >= 10) return bidOf(3, d) || passC; return bidOf(2, d) || passC; }
      if (hp >= 13) return bidOf(2, 4) || bidOf(3, 4) || passC;
      const s = longestSuit();
      if (hp >= 10 && L[s] >= 5) return bidOf(2, s) || bidOf(3, s) || passC;
      return bidOf(1, 4) || bidOf(2, 4) || passC;
    }
    // an overcall: the opponents have opened
    if (a.last && team(a.last.seat) !== team(seat) && !sideBids(st, team(seat)).length) {
      const s = longestSuit();
      if (bal && hp >= 15 && hp <= 18 && a.last.level === 1 && a.last.den !== 4) return bidOf(1, 4) || passC;
      if (hp >= 10 && L[s] >= 5 && bidOf(1, s)) return bidOf(1, s);
      if (hp >= 12 && L[s] >= 5 && bidOf(2, s) && a.last.level === 1) return bidOf(2, s);
      if (hp >= 5 && hp <= 10 && L[s] >= 6 && a.last.level <= 1) return bidOf(L[s] >= 7 ? 3 : 2, s) || passC;
      return passC;
    }
    return null;
  }
  function bid(st, seat, level) {
    const h = st.hands[seat], L = lens(h), hp = hcp(h), tp = hp + lengthPts(L), legal = legalCalls(st, seat), a = auction(st.calls, st.dealer);
    const passC = { t: 'pass' }, pick = (lv, den) => legal.find(x => x.t === 'bid' && x.level === lv && x.den === den);
    if (level === 'novice') {
      // a beginner opens with decent hands, raises sometimes and otherwise passes
      if (!a.last && hp >= 13) { const s = L.indexOf(Math.max(...L)); return pick(1, s) || passC; }
      if (a.last && team(a.last.seat) === team(seat) && hp >= 9 && a.last.level < 3 && a.last.den !== 4 && L[a.last.den] >= 3) return pick(a.last.level + 1, a.last.den) || passC;
      return passC;
    }
    const mineBids = st.calls.filter(x => x.seat === seat && x.call.t === 'bid').length;
    if (!mineBids) { const fc = firstCall(st, seat, h, L, hp, tp, legal, level); if (fc) return fc; }
    return ladder(st, seat, L, hp, legal, a, level);
  }
  function ladder(st, seat, L, hp, legal, a, level) {
    const passC = { t: 'pass' }, p = partnerInfo(st, seat);
    const oppLast = a.last && team(a.last.seat) !== team(seat), mine = a.last && team(a.last.seat) === team(seat) ? a.last : null;
    const fit = p.suit >= 0 && L[p.suit] + p.len >= 8;
    const dist = L.reduce((x, n) => x + (n === 0 ? 3 : n === 1 ? 2 : n === 2 ? 1 : 0), 0);
    const comb = hp + Math.round((p.lo + p.hi) / 2) + (fit ? dist : lengthPts(L));
    // the trump suit: partner's suit with a fit, else my own six-card suit, else no trump
    let den = 4;
    if (fit) den = p.suit;
    else { let b = -1; for (let d = 0; d < 4; d++) if (L[d] >= 6 && (b < 0 || L[d] > L[b])) b = d; if (b >= 0) den = b; }
    const gameLevel = d => d === 4 ? 3 : d >= 2 ? 4 : 5;
    if (den < 2 && comb < 29 && comb >= 26) den = 4;   // a minor game is hard: try no trump
    let want = comb >= 37 ? 7 : comb >= 33 ? 6 : comb >= 26 ? gameLevel(den) : comb >= 23 ? 3 : comb >= 20 ? 2 : 1;
    if (den >= 2 && comb < 26 && want > 3) want = 3;
    if (den === 4 && comb < 26 && want > 2) want = 2;
    if (oppLast) {
      // a double: the opponents are in a high contract and I hold a lot
      if (a.dbl === 0 && legal.some(x => x.t === 'x') && level !== 'average') {
        const od = a.last.den, tr = od < 4 ? L[od] : 0;
        if ((a.last.level >= 4 && hp + (p.lo + p.hi) / 2 >= 24) || (a.last.level >= 5 && hp >= 11 && tr >= 3)) return { t: 'x' };
        if (a.last.level >= 3 && od < 4 && tr >= 4 && hp >= 12 && level === 'cardshark') return { t: 'x' };
      }
      if (a.dbl === 1 && legal.some(x => x.t === 'xx') && hp >= 17) return { t: 'xx' };
      const c = legal.find(x => x.t === 'bid' && x.den === den);
      const pts = hp + Math.round((p.lo + p.hi) / 2);
      if (c && c.level <= want && c.level <= 3 + (comb >= 26 ? 2 : 0) && pts >= 8 + (c.level - 1) * 3 && (den !== 4 || bal2(L))) return c;
      return passC;
    }
    if (mine) {
      if (mine.level >= want) return passC;
      // keep the denomination my side is in unless the other one is the game I want
      const keep = mine.den === 4 || (mine.den >= 2 && L[mine.den] >= 2);
      if (keep && den !== mine.den && want < gameLevel(den)) den = mine.den;
      const c = legal.find(x => x.t === 'bid' && x.den === den);
      return c && c.level <= want ? c : passC;
    }
    return passC;
  }
  const bal2 = L => balancedShape(L) || L.some(n => n >= 5);

  // ---------------------------------------------------------------- card play bots
  // A simple policy used for the quick bots and inside the simulations.
  function policy(hand, trick, den, seat, hands) {
    const legal = legalPlays(hand, trick), trump = den < 4 ? SUITS[den] : null;
    if (legal.length === 1) return legal[0];
    const low = a => a.slice().sort((x, y) => rk(x) - rk(y))[0];
    const high = a => a.slice().sort((x, y) => rk(y) - rk(x))[0];
    if (!trick.length) {   // lead
      const bySuit = s => legal.filter(c => c.s === s);
      const aces = legal.filter(c => c.r === 1 && c.s !== trump);
      if (aces.length) return aces[0];
      const sides = SUITS.filter(s => s !== trump && bySuit(s).length);
      if (sides.length) {
        // top of a sequence (K with Q, Q with J …), else the fourth best / lowest of the longest side suit
        const s = sides.sort((a, b) => bySuit(b).length - bySuit(a).length)[0], cs = bySuit(s).sort((a, b) => rk(b) - rk(a));
        if (cs.length >= 2 && rk(cs[0]) >= 11 && rk(cs[0]) - rk(cs[1]) === 1) return cs[0];
        return cs.length >= 4 ? cs[3] : cs[cs.length - 1];
      }
      return low(legal);
    }
    const led = trick[0].card.s, pos = trick.length;
    const winning = trick.reduce((b, t) => { const a = t.card, bb = b.card; return a.s === bb.s ? (rk(a) > rk(bb) ? t : b) : (a.s === trump ? t : b); });
    const partnerWinning = team(winning.seat) === team(seat);
    const follow = legal.filter(c => c.s === led);
    const beats = c => c.s === winning.card.s ? rk(c) > rk(winning.card) : c.s === trump;
    if (follow.length) {
      if (partnerWinning && (pos === 3 || rk(winning.card) >= 12 || (winning.card.s === trump))) return low(follow);
      const win = follow.filter(beats).sort((x, y) => rk(x) - rk(y));
      if (win.length) return pos === 3 ? win[0] : (pos === 1 ? high(follow) === win[win.length - 1] && rk(win[win.length - 1]) >= 13 ? win[win.length - 1] : low(follow) : win[0]);
      return low(follow);
    }
    // void in the suit led
    if (partnerWinning) return low(legal.filter(c => c.s !== trump).length ? legal.filter(c => c.s !== trump) : legal);
    const tr = legal.filter(c => c.s === trump && beats(c)).sort((x, y) => rk(x) - rk(y));
    if (tr.length) return tr[0];
    const off = legal.filter(c => c.s !== trump);
    return low(off.length ? off : legal);
  }
  // what a player can see: his own hand, and the dummy once it is shown
  function knownHands(st, viewer) {
    const known = {}; known[viewer] = st.hands[viewer];
    if (st.dummyShown && st.dummy >= 0) known[st.dummy] = st.hands[st.dummy];
    return known;
  }
  // deal the unseen cards to the hidden hands, respecting their sizes and the suits they have shown void
  function sampleWorld(st, viewer, known) {
    const seen = new Set();
    for (const s in known) known[s].forEach(c => seen.add(c.id));
    st.tricks.forEach(t => t.trick.forEach(x => seen.add(x.card.id))); st.trick.forEach(x => seen.add(x.card.id));
    const unseen = makeDeck().filter(c => !seen.has(c.id)), hidden = [0, 1, 2, 3].filter(s => !known[s]);
    for (let attempt = 0; attempt < 25; attempt++) {
      const need = {}; hidden.forEach(s => need[s] = st.hands[s].length);
      const hands = {}; hidden.forEach(s => hands[s] = []);
      const cards = shuffle(unseen.slice()), ok = attempt < 20;
      const elig = c => hidden.filter(s => !(ok && st.voids[s][c.s]));
      cards.sort((a, b) => elig(a).length - elig(b).length);
      let fail = false;
      for (const c of cards) {
        const e = elig(c).filter(s => hands[s].length < need[s]);
        if (!e.length) { fail = true; break; }
        // weight by the room each hand has left, so the hands fill evenly
        const tot = e.reduce((x, s) => x + (need[s] - hands[s].length), 0); let r = Math.random() * tot, pickS = e[0];
        for (const s of e) { r -= need[s] - hands[s].length; if (r <= 0) { pickS = s; break; } }
        hands[pickS].push(c);
      }
      if (!fail) { const out = {}; for (const s in known) out[s] = known[s].slice(); hidden.forEach(s => out[s] = hands[s]); return out; }
    }
    return null;
  }
  // play out the rest of the hand from a world (all hands known) with the simple policy; returns tricks won by the viewer's side
  function rollout(hands0, trick0, leader0, turn0, den, viewerTeam) {
    const hands = {}; for (const s in hands0) hands[s] = hands0[s].slice();
    let trick = trick0.slice(), turn = turn0, won = 0;
    while (true) {
      const hand = hands[turn];
      if (!hand.length && !trick.length) break;
      const c = policy(hand, trick, den, turn, hands);
      hand.splice(hand.indexOf(c), 1); trick.push({ seat: turn, card: c });
      if (trick.length === 4) { const w = trickWinner(trick, den); if (team(w) === viewerTeam) won++; trick = []; turn = w; if (!hands[turn].length) break; }
      else turn = left(turn);
    }
    return won;
  }
  function chooseCard(st, seat, level) {
    const viewer = controller(st, seat), hand = st.hands[seat], legal = legalPlays(hand, st.trick), den = st.contract.den;
    if (legal.length === 1) return legal[0];
    if (level === 'novice') { const f = legal.slice().sort((a, b) => rk(a) - rk(b)); return Math.random() < 0.5 ? f[0] : legal[Math.floor(Math.random() * legal.length)]; }
    if (level === 'average') return policy(hand, st.trick, den, seat, null);
    const n = level === 'pro' ? 8 : 40, known = knownHands(st, viewer), vt = team(seat);
    const score = new Map(legal.map(c => [c.id, 0]));
    let worlds = 0;
    for (let i = 0; i < n; i++) {
      const w = sampleWorld(st, viewer, known); if (!w) continue; worlds++;
      for (const c of legal) {
        const hands = {}; for (const s in w) hands[s] = w[s].slice();
        const hh = hands[seat]; hh.splice(hh.findIndex(x => x.id === c.id), 1);
        const trick = st.trick.concat([{ seat, card: c }]);
        let turn = left(seat), won = 0;
        if (trick.length === 4) { const wn = trickWinner(trick, den); if (team(wn) === vt) won++; turn = wn; hands2(); }
        function hands2() { }
        const rest = trick.length === 4 ? [] : trick;
        const r = rollout(hands, rest, st.leader, turn, den, vt);
        score.set(c.id, score.get(c.id) + r + won);
      }
    }
    if (!worlds) return policy(hand, st.trick, den, seat, null);
    let best = legal[0], bs = -1;
    for (const c of legal.slice().sort((a, b) => rk(a) - rk(b))) { const v = score.get(c.id); if (v > bs + 1e-9) { bs = v; best = c; } }
    return best;
  }

  // ---------------------------------------------------------------- views and events
  const rotSeat = (s, me) => s === null || s === undefined || s < 0 ? s : ((s - me) % 4 + 4) % 4;
  const tOrder = me => me % 2 === 0 ? [0, 1] : [1, 0];
  const permute = (a, me) => Array.isArray(a) ? tOrder(me).map(t => a[t]) : a;
  function view(st, me) {
    const rel = s => rotSeat(s, me), hidden = { id: 'x', hidden: true };
    const hands = {}; [0, 1, 2, 3].forEach(s => {
      const r = rel(s), show = s === me || (st.dummyShown && s === st.dummy);
      hands[r] = show ? st.hands[s].slice() : st.hands[s].map(() => hidden);
    });
    const R = st.rubber;
    return {
      game: 'c', n: 4, phase: st.phase, deal: st.deal, dealer: rel(st.dealer), calls: st.calls.map(x => ({ seat: rel(x.seat), call: x.call })),
      contract: st.contract ? { ...st.contract, decl: rel(st.contract.decl) } : null, dummy: rel(st.dummy), dummyShown: st.dummyShown,
      hands, trick: st.trick.map(x => ({ seat: rel(x.seat), card: x.card })), won: permute(st.won, me), tricksPlayed: st.tricks.length,
      lastTrick: st.lastTrick ? { winner: rel(st.lastTrick.winner), trick: st.lastTrick.trick.map(x => ({ seat: rel(x.seat), card: x.card })) } : null,
      leader: rel(st.leader), passedOut: st.passedOut,
      vul: R.games.map(g => g >= 1).map((v, t, a) => permute(a, me)[t]), games: permute(R.games, me), above: permute(R.above, me), below: permute(R.below, me), total: permute([R.above[0] + R.belowAll[0], R.above[1] + R.belowAll[1]], me),
      rows: st.rows.length,
    };
  }
  function rotEvent(ev, me, st) {
    const r = { ...ev };
    for (const k of ['seat', 'dummy', 'dealer', 'by']) if (typeof r[k] === 'number' && r[k] >= 0) r[k] = rotSeat(r[k], me);
    if (typeof r.winner === 'number' && r.winner >= 0) r.winner = r.k === 'matchEnd' ? tOrder(me).indexOf(r.winner) : rotSeat(r.winner, me);
    if (r.contract) r.contract = { ...r.contract, decl: rotSeat(r.contract.decl, me) };
    if (r.result) {
      const x = { ...r.result };
      for (const k of ['above', 'below', 'total', 'games', 'partial', 'vulBefore']) x[k] = permute(x[k], me);
      x.declTeam = tOrder(me).indexOf(x.declTeam); if (x.gameWon >= 0) x.gameWon = tOrder(me).indexOf(x.gameWon);
      x.contract = { ...x.contract, decl: rotSeat(x.contract.decl, me) };
      r.result = x;
    }
    if (typeof r.team === 'number' && r.team >= 0) r.team = tOrder(me).indexOf(r.team);
    if (r.dummyHand) { /* the dummy's cards are public once shown; nothing to hide */ }
    return r;
  }

  // ---------------------------------------------------------------- the match loop (same flow offline and online)
  async function run(h) {
    let st, cont = null;
    if (h.saved) { st = h.st = JSON.parse(h.saved.st); cont = h.saved.at === 'bid' || h.saved.at === 'play' ? h.saved.at : null; h.saved = null; }
    else { st = h.st = newMatch(h.opts); st.dealer = Math.floor(Math.random() * 4); }
    while (true) {
      if (cont === null) { newDeal(st); h.turn = null; h.emit({ k: 'deal', deal: st.deal, dealer: st.dealer }); await h.io.sleep(900); }
      // ---- auction
      while (st.phase === 'bid') {
        const seat = st.turn; h.turn = seat; h.emit({ k: 'turn', seat, bid: true }); await h.checkpoint('bid');
        const bot = () => ({ call: bid(st, seat, h.io.level(seat) || 'average') });
        let a = await h.getAction(seat, { kind: 'bid' }, bot), r;
        try { r = makeCall(st, seat, a.call); }
        catch (e) {
          if (h.fromHuman) { h.io.send(seat, { t: 'reject', rule: String(e && e.rule || 'bad') }); continue; }
          a = { call: { t: 'pass' } }; r = makeCall(st, seat, a.call);
        }
        h.emit({ k: 'call', seat, call: st.calls[st.calls.length - 1].call }); await h.io.sleep(500);
        if (r.over && r.passedOut) { h.turn = null; h.emit({ k: 'passedOut' }); await h.io.sleep(1600); break; }
        if (r.over) { h.turn = null; h.emit({ k: 'contract', contract: st.contract, dummy: st.dummy }); await h.io.sleep(1500); }
      }
      cont = null;
      if (st.passedOut) continue;
      // ---- play
      while (st.phase === 'play') {
        const seat = st.turn, ctl = controller(st, seat); h.turn = seat;
        h.emit({ k: 'turn', seat }); await h.checkpoint('play');
        const bot = () => ({ card: chooseCard(st, seat, h.io.level(ctl) || 'average').id });
        let a = await h.getAction(ctl, { kind: 'play', for: seat === ctl ? undefined : 2 }, bot), r;
        try { r = playCard(st, seat, a.card); }
        catch (e) {
          if (h.fromHuman) { h.io.send(ctl, { t: 'reject', rule: String(e && e.rule || 'bad') }); continue; }
          a = bot(); r = playCard(st, seat, a.card);
        }
        h.emit({ k: 'play', seat, card: r.card, firstLead: r.firstLead });
        await h.io.sleep(r.firstLead ? 1500 : 420);
        if (r.winner !== null) { h.turn = null; h.emit({ k: 'trick', winner: r.winner }); await h.io.sleep(1100); }
        if (r.over) break;
      }
      h.turn = null;
      const res = scoreDeal(st);
      h.emit({ k: 'handEnd', result: res, over: res.rubberOver });
      if (res.rubberOver) { h.emit({ k: 'matchEnd', team: res.gameWon, winner: res.gameWon }); return res.gameWon; }
      await h.checkpoint('handEnd');
      await h.io.waitNext(20000);
    }
  }

  return { SUITS, DENS, key, rk, makeDeck, sortHand, team, left, hcp, lens, callStr, auction, legalCalls, makeCall, legalPlays, trickWinner, playCard, scoreDeal,
    newMatch, newDeal, controller, bid, chooseCard, policy, view, rotEvent, run, bidRank };
})();
if (typeof module !== 'undefined') module.exports = Bridge;
