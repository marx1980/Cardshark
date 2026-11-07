// ===================== GIN RUMMY (a variant of Rummy: 2 players) =====================
// 52 cards, 10 each. Ace is low (A-2-3 is a run, Q-K-A is not); A = 1, J Q K = 10. Melds: 3-4 of a rank, or 3+ in a suit run.
// Each turn: draw (stock or top discard), then discard one card, or knock. You may knock when your unmatched cards (deadwood)
// total 10 or less after the discard; the opponent then lays off onto your melds. Gin (no deadwood) scores 25 + the opponent's
// deadwood, big gin (all 11 cards in melds, no discard) 31 + deadwood, an undercut (opponent's deadwood is not higher) 25 + the
// difference. When the stock is down to 2 cards after a discard the hand is void. First to the target wins and gets a game bonus
// plus a bonus for every hand won.
// Pure module (no I/O): the server and the app both run it.
const Gin = (() => {
  const SUITS = ['S', 'H', 'D', 'C'];
  const RN = { 1: 'a', 11: 'j', 12: 'q', 13: 'k' };
  const key = c => c.s + (RN[c.r] || c.r);
  const dv = c => c.r >= 10 ? 10 : c.r;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const makeDeck = () => { const d = []; for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ id: s + r, s, r }); return d; };
  const BONUS = { game: t => t, box: t => t >= 100 ? 25 : 10, gin: 25, big: 31, under: 25 };
  const fail = rule => { const e = new Error(rule); e.rule = rule; throw e; };

  // ---------------------------------------------------------------- melds and deadwood
  const bits = m => { const o = []; for (let i = 0; m >> i; i++) if (m >> i & 1) o.push(i); return o; };
  function allMelds(cards) {
    const out = [], n = cards.length;
    const byR = {}, byS = {};
    cards.forEach((c, i) => { (byR[c.r] = byR[c.r] || []).push(i); (byS[c.s] = byS[c.s] || []).push(i); });
    for (const r in byR) {
      const g = byR[r]; if (g.length < 3) continue;
      out.push(g.reduce((a, i) => a | 1 << i, 0));
      if (g.length === 4) for (let skip = 0; skip < 4; skip++) out.push(g.filter((_, k) => k !== skip).reduce((a, i) => a | 1 << i, 0));
    }
    for (const s in byS) {
      const g = byS[s].slice().sort((a, b) => cards[a].r - cards[b].r);
      for (let i = 0; i < g.length; i++) {
        let m = 1 << g[i], last = cards[g[i]].r;
        for (let j = i + 1; j < g.length; j++) {
          if (cards[g[j]].r !== last + 1) break;
          m |= 1 << g[j]; last = cards[g[j]].r;
          if (j - i >= 2) out.push(m);
        }
      }
    }
    return out;
  }
  // best split of the cards into melds + deadwood (lowest deadwood; ties keep more cards in melds)
  function analyze(cards) {
    const n = cards.length, ms = allMelds(cards), memo = new Map();
    const f = mask => {
      if (!mask) return { dw: 0, pick: 0 };
      if (memo.has(mask)) return memo.get(mask);
      const i = Math.log2(mask & -mask) | 0, rest = mask & ~(1 << i);
      let best = { dw: f(rest).dw + dv(cards[i]), pick: 0 };
      for (const m of ms) if ((m & 1 << i) && (m & mask) === m) { const d = f(mask & ~m).dw; if (d < best.dw) best = { dw: d, pick: m }; }
      memo.set(mask, best); return best;
    };
    let mask = (1 << n) - 1; const melds = []; let dead = [];
    const total = f(mask).dw;
    while (mask) {
      const b = f(mask), i = Math.log2(mask & -mask) | 0;
      if (b.pick) { melds.push(bits(b.pick).map(k => cards[k]).sort((x, y) => x.r - y.r)); mask &= ~b.pick; }
      else { dead.push(cards[i]); mask &= ~(1 << i); }
    }
    const order = (a, b) => SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || a.r - b.r;
    melds.sort((a, b) => order(a[0], b[0])); dead.sort(order);
    return { melds, dead, dw: total };
  }
  const dwOf = cards => analyze(cards).dw;
  // can this card join a meld on the table?
  function fits(meld, c) {
    const same = meld.every(x => x.r === meld[0].r);
    if (same) return meld.length < 4 && c.r === meld[0].r && !meld.some(x => x.s === c.s);
    if (c.s !== meld[0].s) return false;
    const lo = Math.min(...meld.map(x => x.r)), hi = Math.max(...meld.map(x => x.r));
    return c.r === lo - 1 || c.r === hi + 1;
  }
  function layOff(melds, dead) {
    melds = melds.map(m => m.slice()); dead = dead.slice(); const laid = [];
    for (let again = true; again;) {
      again = false;
      for (let i = 0; i < dead.length; i++) {
        const m = melds.find(x => fits(x, dead[i]));
        if (m) { m.push(dead[i]); m.sort((a, b) => a.r - b.r); laid.push(dead[i]); dead.splice(i, 1); again = true; break; }
      }
    }
    return { melds, dead, laid };
  }

  // ---------------------------------------------------------------- match state
  function newMatch(opts) {
    const target = [50, 100].includes(+opts.target) ? +opts.target : 100;
    return { game: 'r', n: 2, opts: { players: 2, variant: 'gin', target }, scores: [0, 0], boxes: [0, 0], round: 0, dealer: 0, hands: null, stock: [], discard: [],
      turn: 0, phase: 'offer', offers: 0, noTake: false, drew: null, result: null, matchOver: false, final: null, winner: -1, seen: [[], []] };
  }
  function newRound(st) {
    st.round++; if (st.round > 1) st.dealer = 1 - st.dealer;
    const d = shuffle(makeDeck());
    st.hands = [d.splice(0, 10), d.splice(0, 10)]; st.discard = [d.pop()]; st.stock = d;
    st.turn = 1 - st.dealer; st.phase = 'offer'; st.offers = 0; st.noTake = false; st.drew = null; st.result = null; st.seen = [[], []];
  }
  const top = st => st.discard[st.discard.length - 1];
  const take = (st, seat, id) => { const h = st.hands[seat], i = h.findIndex(c => c.id === id); if (i < 0) fail('card'); return h.splice(i, 1)[0]; };

  // one action; returns what the table shows
  function act(st, seat, a) {
    if (st.result || seat !== st.turn) fail('turn');
    const kind = a.act || a.action, h = st.hands[seat];
    if (st.phase === 'offer') {
      if (kind === 'take') { const c = st.discard.pop(); h.push(c); st.drew = c.id; st.phase = 'discard'; st.seen[seat].push(c.id); return { act: 'take', card: c }; }
      if (kind === 'pass') {
        st.offers++; st.turn = 1 - st.turn;
        if (st.offers >= 2) { st.turn = 1 - st.dealer; st.phase = 'draw'; st.noTake = true; }
        return { act: 'pass' };
      }
      fail('phase');
    }
    if (st.phase === 'draw') {
      if (kind === 'stock') { const c = st.stock.pop(); h.push(c); st.drew = null; st.noTake = false; st.phase = 'discard'; return { act: 'stock' }; }
      if (kind === 'take') { if (st.noTake) fail('first'); const c = st.discard.pop(); h.push(c); st.drew = c.id; st.phase = 'discard'; st.seen[seat].push(c.id); return { act: 'take', card: c }; }
      fail('phase');
    }
    // discard phase
    if (kind === 'big') {
      if (analyze(h).dw !== 0) fail('gin');
      return finish(st, seat, 'big', null);
    }
    if (kind === 'discard' || kind === 'knock') {
      if (a.id === st.drew) fail('same');
      if (!h.some(c => c.id === a.id)) fail('card');
      if (kind === 'knock') {
        const rest = h.filter(c => c.id !== a.id);
        if (analyze(rest).dw > 10) fail('knock');
        const c = take(st, seat, a.id); st.discard.push(c); st.drew = null;
        return finish(st, seat, analyze(h).dw === 0 ? 'gin' : 'knock', c);
      }
      const c = take(st, seat, a.id); st.discard.push(c); st.drew = null;
      if (st.stock.length <= 2) {
        st.result = { k: 'void', by: -1, winner: -1, add: [0, 0] }; st.phase = 'done';
        return { act: 'discard', card: c, ended: true };
      }
      st.turn = 1 - seat; st.phase = 'draw';
      return { act: 'discard', card: c };
    }
    fail('phase');
  }
  function finish(st, seat, how, discarded) {
    const opp = 1 - seat, kh = st.hands[seat], oh = st.hands[opp];
    const ka = analyze(kh), oa = analyze(oh);
    let oMelds = oa.melds, oDead = oa.dead, laid = [];
    if (how === 'knock') { const l = layOff(ka.melds, oa.dead); ka.melds = l.melds; oDead = l.dead; laid = l.laid; }
    const kdw = ka.dw, odw = oDead.reduce((s, c) => s + dv(c), 0);
    let add = [0, 0], winner, under = false;
    if (how === 'big') { winner = seat; add[seat] = BONUS.big + odw; }
    else if (how === 'gin') { winner = seat; add[seat] = BONUS.gin + odw; }
    else if (kdw < odw) { winner = seat; add[seat] = odw - kdw; }
    else { winner = opp; under = true; add[opp] = kdw - odw + BONUS.under; }
    st.scores[0] += add[0]; st.scores[1] += add[1]; st.boxes[winner]++;
    const res = { k: how, by: seat, winner, under, add, dw: seat === 0 ? [kdw, odw] : [odw, kdw],
      melds: seat === 0 ? [ka.melds, oMelds] : [oMelds, ka.melds], dead: seat === 0 ? [ka.dead, oDead] : [oDead, ka.dead], laid };
    st.result = res; st.phase = 'done';
    const t = st.opts.target;
    if (st.scores.some(s => s >= t)) {
      const w = st.scores[0] === st.scores[1] ? winner : st.scores[0] > st.scores[1] ? 0 : 1;
      st.matchOver = true; st.winner = w;
      const bx = BONUS.box(t), gb = BONUS.game(t);
      st.final = [0, 1].map(s => ({ score: st.scores[s], boxes: st.boxes[s], box: st.boxes[s] * bx, game: s === w ? gb : 0, total: st.scores[s] + st.boxes[s] * bx + (s === w ? gb : 0) }));
    }
    return { act: how, card: discarded };
  }

  // ---------------------------------------------------------------- bots
  const rnd = () => Math.random();
  // the discard that leaves the lowest deadwood (ties: the card least connected to the rest, then the highest)
  function bestDiscard(hand, banId, level, danger) {
    let best = null;
    for (const c of hand) {
      if (c.id === banId) continue;
      const rest = hand.filter(x => x !== c), dw = dwOf(rest);
      const link = rest.reduce((s, x) => s + (x.r === c.r ? 1 : (x.s === c.s && Math.abs(x.r - c.r) <= 2 ? 1 : 0)), 0);
      const risk = danger ? danger(c) : 0;
      const score = dw * 100 + link * 6 + risk * 9 - dv(c);
      if (!best || score < best.score) best = { c, dw, score };
    }
    return best;
  }
  function dangerFn(st, me, level) {
    if (level !== 'cardshark' && level !== 'pro') return null;
    const taken = st.seen[1 - me].map(id => ({ s: id[0], r: +id.slice(1) }));
    return c => taken.reduce((s, t) => s + (t.r === c.r ? 1 : (t.s === c.s && Math.abs(t.r - c.r) <= 1 ? 1 : 0)), 0);
  }
  function chooseOffer(st, me, level) {
    const h = st.hands[me], up = top(st), cur = dwOf(h), b = bestDiscard(h.concat(up), up.id, level, null);
    const inMeld = analyze(h.concat(up)).melds.some(m => m.some(x => x.id === up.id));
    if (level === 'novice') return rnd() < (inMeld ? 0.6 : 0.12) ? 'take' : (st.phase === 'offer' ? 'pass' : 'stock');
    const gain = cur - b.dw;
    const yes = level === 'average' ? inMeld : (inMeld || gain >= 4);
    return yes ? 'take' : (st.phase === 'offer' ? 'pass' : 'stock');
  }
  function knockWanted(st, me, level, dw) {
    if (dw === 0) return true;
    if (dw > 10) return false;
    if (level === 'novice') return dw <= 4 && rnd() < 0.6;
    const turns = st.discard.length - 1;
    if (st.stock.length <= 5) return true;
    if (level === 'average') return dw <= 6;
    const est = Math.max(5, 36 - 3 * turns);
    if (dw <= 2) return true;
    return level === 'pro' ? dw <= Math.min(8, est - 4) : dw <= est - 5;
  }
  function bot(st, me, level) {
    level = level || 'average';
    const h = st.hands[me];
    if (st.phase === 'offer') return { act: chooseOffer(st, me, level) };
    if (st.phase === 'draw') {
      const c = chooseOffer(st, me, level);
      return { act: st.noTake ? 'stock' : (c === 'take' ? 'take' : 'stock') };
    }
    if (analyze(h).dw === 0) return { act: 'big' };
    const danger = dangerFn(st, me, level);
    let b = bestDiscard(h, st.drew, level, danger);
    if (level === 'novice' && rnd() < 0.25) { const dead = analyze(h).dead.filter(c => c.id !== st.drew); const pick = (dead.length ? dead : h.filter(c => c.id !== st.drew)).slice().sort((x, y) => dv(y) - dv(x))[0]; b = { c: pick, dw: dwOf(h.filter(x => x !== pick)) }; }
    return { act: knockWanted(st, me, level, b.dw) ? 'knock' : 'discard', id: b.c.id };
  }

  // ---------------------------------------------------------------- views
  const swap = (a, me) => Array.isArray(a) ? (me === 0 ? a : [a[1], a[0]]) : a;
  const rel = (s, me) => s === null || s === undefined || s < 0 ? s : (s === me ? 0 : 1);
  function view(st, me) {
    return {
      game: 'r', variant: 'gin', opts: st.opts, n: 2, round: st.round, dealer: rel(st.dealer, me),
      hand: st.hands && st.hands[me] ? st.hands[me].slice() : [], counts: st.hands ? swap(st.hands.map(h => h.length), me) : [0, 0],
      stock: st.stock.length, discard: st.discard.slice(-3), discLen: st.discard.length, phase: st.phase, noTake: st.noTake,
      drew: st.turn === me ? st.drew : null, scores: swap(st.scores, me), boxes: swap(st.boxes, me), offerTurn: st.phase === 'offer' ? rel(st.turn, me) : null,
    };
  }
  function rotEvent(ev, me, st) {
    const r = { ...ev };
    for (const k of ['seat', 'by', 'winner']) if (typeof r[k] === 'number' && r[k] >= 0) r[k] = rel(r[k], me);
    for (const k of ['scores', 'add', 'boxes']) if (Array.isArray(r[k])) r[k] = swap(r[k], me);
    if (r.result) {
      const x = { ...r.result };
      for (const k of ['by', 'winner']) if (typeof x[k] === 'number' && x[k] >= 0) x[k] = rel(x[k], me);
      for (const k of ['add', 'dw', 'melds', 'dead']) if (Array.isArray(x[k])) x[k] = swap(x[k], me);
      r.result = x;
    }
    if (Array.isArray(r.final)) r.final = swap(r.final, me);
    return r;
  }

  // ---------------------------------------------------------------- the match loop (same flow offline and online)
  async function run(h) {
    let st, cont = null;
    if (h.saved) { st = h.st = JSON.parse(h.saved.st); cont = h.saved.at === 'turn' ? 'turn' : null; h.saved = null; }
    else { st = h.st = newMatch(h.opts); st.dealer = Math.floor(Math.random() * 2); }
    while (true) {
      if (cont === null) { newRound(st); h.turn = null; h.emit({ k: 'deal', round: st.round }); await h.io.sleep(900); }
      cont = null;
      while (!st.result) {
        const seat = st.turn; h.turn = seat;
        h.emit({ k: 'turn', seat }); await h.checkpoint('turn');
        const botMove = () => bot(st, seat, h.io.level(seat) || 'average');
        let a = await h.getAction(seat, { kind: 'gin', phase: st.phase }, botMove), r;
        try { r = act(st, seat, a); }
        catch (e) {
          if (h.fromHuman) { h.io.send(seat, { t: 'reject', rule: String(e && e.rule || 'bad') }); continue; }
          a = botMove(); r = act(st, seat, a);
        }
        h.emit({ k: 'act', seat, act: r.act, card: r.card || null });
        await h.io.sleep(r.act === 'stock' || r.act === 'take' ? 350 : 500);
      }
      h.turn = null;
      const res = st.result;
      h.emit({ k: 'handEnd', result: res, scores: st.scores.slice(), boxes: st.boxes.slice(), over: st.matchOver, round: st.round });
      if (st.matchOver) { h.emit({ k: 'matchEnd', winner: st.winner, scores: st.scores.slice(), final: st.final }); return st.winner; }
      await h.checkpoint('handEnd');
      await h.io.waitNext(20000);
    }
  }

  return { SUITS, key, dv, makeDeck, newMatch, newRound, act, bot, view, rotEvent, run, analyze, dwOf, fits, layOff, BONUS };
})();
if (typeof module !== 'undefined') module.exports = Gin;
