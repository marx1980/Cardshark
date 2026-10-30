// ===================== REMI (Croatian rummy, "51") =====================
// Two French-suited decks and four jokers (108 cards), 2–6 players. Everyone gets 14 cards, the player after the
// dealer 15 – that player starts by discarding. A turn: draw from the stock (or take the top discard, which must be
// used in the same turn), lay down / lay off if allowed, then discard. The first lay-down (opening) must be worth at
// least 51 in one turn. Melds: 3–4 of a rank in different suits, or 3+ in a row of one suit (ace low or high, no
// wrapping); at most one joker in a meld. Once open, cards may be laid off on any meld, and a joker may be taken back
// by giving the card it stands for (it must then be used in the same turn). Going out = discarding the last card.
// Scoring: winner -40 (-100 for going out in one go without having opened before – "remi", which also doubles the
// others' points); others: the cards left in hand (A, 10, J, Q, K = 10, joker 25), or 100 if they never opened.
const Remi = (() => {
  const SUITS = ['S', 'H', 'D', 'C'];
  const RN = { 1: 'a', 11: 'j', 12: 'q', 13: 'k' };
  const key = c => c.s + (RN[c.r] || c.r);
  const isJ = c => c.s === 'X';
  // value of a card left in hand
  const handVal = c => isJ(c) ? 25 : c.r === 1 || c.r >= 10 ? 10 : c.r;
  // value of a position in a meld (ace low 1, ace high 10)
  const posVal = p => p === 1 ? 1 : p >= 10 ? 10 : p;
  function shuffle(a, rng = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function makeDeck() {
    const d = [];
    for (const copy of ['a', 'b']) for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ id: s + r + copy, s, r });
    for (let k = 1; k <= 4; k++) d.push({ id: 'X' + k, s: 'X', r: 0, joker: k % 2 ? 'B' : 'R' });
    return d;
  }

  // ---------------------------------------------------------------- melds
  // analyse a group of cards: { type: 'set'|'run', value, slots: [{ id, r, s }] in order } or null
  function analyze(cards) {
    if (!cards || cards.length < 3) return null;
    const jok = cards.filter(isJ), nat = cards.filter(c => !isJ(c));
    if (jok.length > 1 || nat.length < 2) return null;
    // a set: one rank, different suits, at most four
    if (nat.every(c => c.r === nat[0].r)) {
      const suits = new Set(nat.map(c => c.s));
      if (suits.size === nat.length && cards.length <= 4) {
        const r = nat[0].r, v = (r === 1 ? 10 : posVal(r)) * cards.length;
        const slots = nat.map(c => ({ id: c.id, r, s: c.s }));
        if (jok.length) slots.push({ id: jok[0].id, r, s: null, joker: true, miss: SUITS.filter(s => !suits.has(s)) });
        return { type: 'set', value: v, slots };
      }
      if (nat.length > 1) return null;
    }
    // a run: one suit, consecutive, ace either end
    const s = nat[0].s; if (!nat.every(c => c.s === s)) return null;
    let best = null;
    for (const aceHigh of [false, true]) {
      const pos = nat.map(c => c.r === 1 && aceHigh ? 14 : c.r).sort((a, b) => a - b);
      if (new Set(pos).size !== pos.length) continue;
      let lo = pos[0], hi = pos[pos.length - 1];
      const gaps = hi - lo + 1 - pos.length;
      if (gaps > jok.length) continue;
      let jPos = null;
      if (gaps === 1) { for (let p = lo; p <= hi; p++) if (!pos.includes(p)) jPos = p; }
      else if (jok.length) { if (hi < 14) jPos = ++hi; else if (lo > 1) jPos = --lo; else continue; }
      if (hi - lo + 1 > 13) continue;                       // the ace is either low or high, never both
      const slots = [];
      for (let p = lo; p <= hi; p++) {
        if (p === jPos) slots.push({ id: jok[0].id, r: p === 14 ? 1 : p, s, joker: true, pos: p });
        else { const c = nat.find(x => (x.r === 1 && aceHigh ? 14 : x.r) === p); slots.push({ id: c.id, r: c.r, s, pos: p }); }
      }
      const value = slots.reduce((a, x) => a + posVal(x.pos), 0);
      if (!best || value > best.value) best = { type: 'run', value, slots };
    }
    return best;
  }
  const meldValue = cards => { const a = analyze(cards); return a ? a.value : 0; };

  // ---------------------------------------------------------------- game state
  function newMatch(o) {
    const n = Math.max(2, Math.min(6, (o.players | 0) || 4)), target = [0, 501, 1001].includes(+o.target) ? +o.target : 501;
    return { game: 'r', n, opts: { ...o, target }, scores: Array(n).fill(0), dealer: Math.floor(Math.random() * n), round: 0 };
  }
  function newRound(st, rng = Math.random) {
    st.round++;
    st.dealer = (st.dealer + 1) % st.n;
    st.stock = shuffle(makeDeck(), rng);
    st.hands = Array.from({ length: st.n }, () => []);
    for (let k = 0; k < 14; k++) for (let p = 0; p < st.n; p++) st.hands[p].push(st.stock.pop());
    st.turn = (st.dealer + 1) % st.n;
    st.hands[st.turn].push(st.stock.pop());
    st.discard = []; st.melds = []; st.opened = Array(st.n).fill(false);
    st.phase = 'play'; st.staged = []; st.mustUse = null; st.swapped = null; st.turnStartOpened = false;
    st.winner = null; st.remi = false; st.result = null; st.nextMeld = 1; st.log = []; st.took = Array.from({ length: st.n }, () => []);
    st.firstTurn = true; st.reshuffles = 0;
    return st;
  }
  const hand = (st, p) => st.hands[p];
  const find = (st, p, id) => st.hands[p].find(c => c.id === id);
  const take = (st, p, ids) => { const out = []; for (const id of ids) { const i = st.hands[p].findIndex(c => c.id === id); if (i < 0) throw new Error('not in hand'); out.push(st.hands[p].splice(i, 1)[0]); } return out; };
  const err = m => { const e = new Error(m); e.rule = m; throw e; };
  // the stock runs out: the discards (all but the top one) are shuffled into a new stock – once.
  // The second time it runs out the round ends without a winner.
  function refill(st) {
    if (st.stock.length) return true;
    if ((st.reshuffles || 0) >= 1) { endRound(st, -1); return false; }
    st.reshuffles = (st.reshuffles || 0) + 1;
    const top = st.discard.pop();
    st.stock = shuffle(st.discard); st.discard = top ? [top] : [];
    return st.stock.length > 0;
  }
  // ---- actions (all throw on illegal moves; the screen and the bots only offer legal ones)
  function drawStock(st, p) {
    if (st.turn !== p || st.phase !== 'draw') err('turn');
    if (!refill(st)) return null;
    const c = st.stock.pop(); st.hands[p].push(c); st.phase = 'play'; st.turnStartOpened = st.opened[p];
    return c;
  }
  function takeDiscard(st, p) {
    if (st.turn !== p || st.phase !== 'draw' || !st.discard.length) err('turn');
    const c = st.discard.pop(); st.hands[p].push(c); st.phase = 'play'; st.mustUse = c.id; st.turnStartOpened = st.opened[p];
    st.took[p].push(c);
    return c;
  }
  // give the discard back (only while nothing else was done this turn)
  function undoTake(st, p) {
    if (st.turn !== p || !st.mustUse || st.staged.length) err('turn');
    const i = st.hands[p].findIndex(c => c.id === st.mustUse); if (i < 0) err('used');
    st.discard.push(st.hands[p].splice(i, 1)[0]); st.took[p].pop(); st.mustUse = null; st.phase = 'draw';
  }
  const stagedValue = st => st.staged.reduce((a, m) => a + meldValue(m), 0);
  // before opening: put a meld aside for the opening
  function stage(st, p, ids) {
    if (st.turn !== p || st.phase !== 'play' || st.opened[p]) err('turn');
    const cards = ids.map(id => find(st, p, id)); if (cards.some(c => !c)) err('not in hand');
    if (!analyze(cards)) err('meld');
    if (st.hands[p].length - ids.length < 1) err('keep');
    st.staged.push(take(st, p, ids));
  }
  function unstage(st, p, i) {
    if (st.turn !== p || !st.staged[i]) err('turn');
    st.hands[p].push(...st.staged.splice(i, 1)[0]);
  }
  function addMeld(st, p, cards) { const a = analyze(cards); const m = { id: st.nextMeld++, owner: p, cards: a.slots.map(x => cards.find(c => c.id === x.id)), a }; st.melds.push(m); return m; }
  // open: the put-aside melds go to the table (51 or more)
  function open(st, p) {
    if (st.turn !== p || st.opened[p] || !st.staged.length) err('turn');
    if (stagedValue(st) < 51) err('51');
    for (const m of st.staged) addMeld(st, p, m);
    st.staged = []; st.opened[p] = true;
  }
  // after opening: a new meld from the hand
  function meld(st, p, ids) {
    if (st.turn !== p || st.phase !== 'play' || !st.opened[p]) err('turn');
    const cards = ids.map(id => find(st, p, id)); if (cards.some(c => !c)) err('not in hand');
    if (!analyze(cards)) err('meld');
    if (st.hands[p].length - ids.length < 1) err('keep');
    take(st, p, ids); return addMeld(st, p, cards);
  }
  const meldById = (st, id) => st.melds.find(m => m.id === id);
  function canLayOff(st, card, m) { return !!analyze(m.cards.concat([card])); }
  function layOff(st, p, id, meldId) {
    if (st.turn !== p || st.phase !== 'play' || !st.opened[p]) err('turn');
    const c = find(st, p, id), m = meldById(st, meldId); if (!c || !m) err('bad');
    if (st.hands[p].length < 2) err('keep');
    const all = m.cards.concat([c]), a = analyze(all); if (!a) err('meld');
    take(st, p, [id]); m.cards = a.slots.map(x => all.find(y => y.id === x.id)); m.a = a;
  }
  // which card a joker in a meld stands for (null if none)
  function jokerSlot(m) { return m.a.slots.find(x => x.joker) || null; }
  function canSwap(st, card, m) {
    const j = jokerSlot(m); if (!j || isJ(card)) return false;
    if (m.a.type === 'run') return card.s === j.s && card.r === j.r;
    return card.r === j.r && j.miss.includes(card.s);
  }
  function swapJoker(st, p, id, meldId) {
    if (st.turn !== p || st.phase !== 'play' || !st.opened[p]) err('turn');
    const c = find(st, p, id), m = meldById(st, meldId); if (!c || !m || !canSwap(st, c, m)) err('swap');
    const j = jokerSlot(m), jc = m.cards.find(x => x.id === j.id);
    const all = m.cards.filter(x => x.id !== j.id).concat([c]), a = analyze(all); if (!a) err('meld');
    take(st, p, [id]); m.cards = a.slots.map(x => all.find(y => y.id === x.id)); m.a = a;
    st.hands[p].push(jc); st.swapped = jc.id;
    return jc;
  }
  // end the turn
  function discard(st, p, id) {
    if (st.turn !== p || st.phase !== 'play') err('turn');
    if (st.staged.length) { if (stagedValue(st) >= 51 && !st.opened[p]) open(st, p); else err('51'); }
    if (st.mustUse && st.hands[p].some(c => c.id === st.mustUse)) err('mustUse');
    if (st.swapped && st.hands[p].some(c => c.id === st.swapped)) err('joker');
    const i = st.hands[p].findIndex(c => c.id === id); if (i < 0) err('not in hand');
    const c = st.hands[p].splice(i, 1)[0]; st.discard.push(c);
    st.mustUse = null; st.swapped = null; st.firstTurn = false;
    if (!st.hands[p].length) { endRound(st, p); return { out: true }; }
    st.turn = (p + 1) % st.n; st.phase = 'draw';
    return {};
  }
  function endRound(st, w) {
    st.winner = w;
    st.remi = w >= 0 && !st.turnStartOpened && st.opened[w];
    const mult = st.remi ? 2 : 1, pts = Array(st.n).fill(0);
    for (let q = 0; q < st.n; q++) {
      if (q === w) { pts[q] = st.remi ? -100 : -40; continue; }
      pts[q] = (st.opened[q] ? st.hands[q].reduce((a, c) => a + handVal(c), 0) : 100) * mult;
    }
    pts.forEach((x, q) => st.scores[q] += x);
    st.result = { winner: w, remi: st.remi, pts };
    st.matchOver = st.opts.target === 0 || st.scores.some(x => x >= st.opts.target);
  }
  const champion = st => st.scores.indexOf(Math.min(...st.scores));
  const handPoints = (st, p) => st.hands[p].reduce((a, c) => a + handVal(c), 0);

  return { SUITS, key, isJ, handVal, posVal, makeDeck, shuffle, analyze, meldValue, newMatch, newRound, drawStock, takeDiscard, undoTake, stage, unstage, open, meld, layOff, canLayOff, swapJoker, canSwap, jokerSlot, discard, stagedValue, meldById, champion, handPoints };
})();

// what one player may see, from their own chair (they are seat 0)
function view(st, me) {
  const rotate = a => Array.from({ length: st.n }, (_, k) => a[(me + k) % st.n]);
  const hands = rotate(st.hands).map((h, i) => i === 0 ? h.map(c => ({ ...c })) : h.map(() => ({ id: 'x', hidden: true })));
  return { game: 'r', n: st.n, opts: st.opts, scores: rotate(st.scores), dealer: (st.dealer - me + st.n) % st.n, turn: (st.turn - me + st.n) % st.n,
    hands, handCounts: rotate(st.hands).map(h => h.length), stock: st.stock.map(() => ({ id: 'x', hidden: true })), discard: st.discard.map(c => ({ ...c })),
    melds: st.melds.map(m => ({ ...m, owner: (m.owner - me + st.n) % st.n, cards: m.cards.map(c => ({ ...c })) })),
    opened: rotate(st.opened), phase: st.phase, staged: me === st.turn ? st.staged.map(ms => ms.map(c => ({ ...c }))) : [], mustUse: me === st.turn ? st.mustUse : null, swapped: me === st.turn ? st.swapped : null,
    winner: st.winner === null ? null : st.winner < 0 ? st.winner : (st.winner - me + st.n) % st.n,
    remi: st.remi, result: st.result && { ...st.result, winner: st.result.winner < 0 ? st.result.winner : (st.result.winner - me + st.n) % st.n, pts: rotate(st.result.pts) },
    round: st.round, matchOver: st.matchOver, nextMeld: st.nextMeld };
}
Remi.view = view;
module.exports = Remi;
