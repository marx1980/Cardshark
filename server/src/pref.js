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
    const deals = [6, 12].includes(+opts.deals) ? +opts.deals : 6, pool = opts.scoring === 'pool';
    return { game: 'f', n: 3, opts: { players: 3, deals, scoring: pool ? 'pool' : 'simple', pool: pool ? ([6, 10].includes(+opts.pool) ? +opts.pool : 6) : 0, poolEnd: opts.poolEnd === 'three' ? 'three' : 'two', poolCap: opts.poolCap === 'open' ? 'open' : 'cap' }, pl: [0, 0, 0], mt: [0, 0, 0], wh: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], deal: 0, dealer: 0, scores: [0, 0, 0], hands: null, talon: [], phase: 'bid', turn: 0,
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
    for (const k of ['seat', 'winner', 'declarer', 'by']) if (typeof r[k] === 'number' && r[k] >= 0) r[k] = rel(r[k], me);
    if (r.result) {
      const x = { ...r.result };
      for (const k of ['add', 'tricks', 'whist', 'scores', 'pool', 'mount']) if (Array.isArray(x[k])) x[k] = perm(x[k], me);
      if (typeof x.declarer === 'number' && x.declarer >= 0) x.declarer = rel(x.declarer, me);
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
          h.emit({ k: 'act', seat, act: r.act, idx: r.idx === undefined ? null : r.idx, declarer: r.declarer === undefined ? -1 : r.declarer, raspasy: !!r.raspasy });
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

  return { SUITS, BIDS, MIS, bidIdx, value, trumpOf, key, makeDeck, newMatch, newDeal, act, bot, view, rotEvent, run, legalPlays, trickWinner, est, sortCards };
})();
if (typeof module !== 'undefined') module.exports = Pref;
