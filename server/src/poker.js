// Server-owned Poker rules. Actions refer to server-held cards only by index or
// action parameters; card objects supplied by clients are never accepted.
const SUITS = ['S', 'H', 'D', 'C'];
const CAT = ['high', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'];
const BLINDS = [[10, 20], [15, 30], [25, 50], [40, 80], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [500, 1000], [750, 1500], [1000, 2000], [1500, 3000], [2000, 4000]];
const B = 1048576;
const enc = (cat, ks) => { let v = cat * B, m = 65536; for (let i = 0; i < 5; i++) { v += (ks[i] || 0) * m; m /= 16; } return v; };
function deck() { const d = []; for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ s, r }); return d; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function straightTop(mask) {
  if (mask & (1 << 14)) mask |= 2;
  for (let top = 14; top >= 5; top--) { const need = 0b11111 << (top - 4); if ((mask & need) === need) return top; }
  return 0;
}
function evaluate(cards) {
  const cnt = Array(15).fill(0), sc = { S: 0, H: 0, D: 0, C: 0 }, sm = { S: 0, H: 0, D: 0, C: 0 };
  let mask = 0;
  for (const c of cards) { cnt[c.r]++; sc[c.s]++; sm[c.s] |= 1 << c.r; mask |= 1 << c.r; }
  let fs = SUITS.find(s => sc[s] >= 5) || null;
  if (fs) { const t = straightTop(sm[fs]); if (t) return enc(8, [t]); }
  const quads = [], trips = [], pairs = [], singles = [];
  for (let r = 14; r >= 2; r--) { if (cnt[r] === 4) quads.push(r); else if (cnt[r] === 3) trips.push(r); else if (cnt[r] === 2) pairs.push(r); else if (cnt[r] === 1) singles.push(r); }
  if (quads.length) return enc(7, [quads[0], [...trips, ...pairs, ...singles].sort((a, b) => b - a)[0]]);
  if (trips.length >= 2 || (trips.length && pairs.length)) return enc(6, [trips[0], [trips[1] || 0, pairs[0] || 0].sort((a, b) => b - a)[0]]);
  if (fs) { const ks = []; for (let r = 14; r >= 2 && ks.length < 5; r--) if (sm[fs] & (1 << r)) ks.push(r); return enc(5, ks); }
  const st = straightTop(mask); if (st) return enc(4, [st]);
  if (trips.length) return enc(3, [trips[0], ...singles.slice(0, 2)]);
  if (pairs.length >= 2) return enc(2, [pairs[0], pairs[1], [...pairs.slice(2), ...singles].sort((a, b) => b - a)[0]]);
  if (pairs.length) return enc(1, [pairs[0], ...singles.slice(0, 3)]);
  return enc(0, singles.slice(0, 5));
}
const category = score => Math.floor(score / B);
const alive = st => st.seats.map((s, i) => i).filter(i => !st.seats[i].out);
const nextAlive = (st, i) => { for (let k = 1; k <= st.n; k++) { const j = (i + k) % st.n; if (!st.seats[j].out) return j; } return i; };
const inHand = (st, i) => !st.seats[i].out && !st.seats[i].folded;
const canAct = (st, i) => inHand(st, i) && !st.seats[i].allin;
const nextIn = (st, i, pred) => { for (let k = 1; k <= st.n; k++) { const j = (i + k) % st.n; if (pred(st, j)) return j; } return -1; };
const order = (st, from) => { const o = []; let i = from; for (let k = 0; k < st.n; k++) { if (!st.seats[i].out) o.push(i); i = (i + 1) % st.n; } return o; };
function put(st, i, amt) { const s = st.seats[i]; amt = Math.min(amt, s.chips); s.chips -= amt; s.bet += amt; s.total += amt; if (!s.chips) s.allin = true; }
const pot = st => st.seats.reduce((a, s) => a + s.total, 0);
const toCall = (st, i) => Math.max(0, st.currentBet - st.seats[i].bet);
function options(st, i) {
  const s = st.seats[i], c = toCall(st, i), o = { fold: c > 0, check: c === 0, call: c > 0 ? Math.min(c, s.chips) : 0 };
  const maxTo = s.bet + s.chips, others = st.seats.some((x, j) => j !== i && canAct(st, j));
  if (maxTo > st.currentBet && others) { o.minTo = Math.min(maxTo, st.currentBet + st.minRaise); o.maxTo = maxTo; }
  return o;
}
function newMatch(opts = {}) {
  const n = Math.max(2, Math.min(6, opts.players | 0 || 6));
  return { game: 'p', variant: opts.variant === 'draw' ? 'draw' : 'holdem', n, opts: { ...opts, chips: 1000, every: opts.blinds === 'fast' ? 5 : 10 }, seats: Array.from({ length: n }, () => ({ chips: 1000, hand: [], out: false })), dealer: Math.floor(Math.random() * n), handNo: 0, level: 0, board: [], log: [] };
}
function finish(st) {
  st.street = 'show'; st.toAct = -1;
  const live = st.seats.map((s, i) => i).filter(i => inHand(st, i));
  if (st.variant === 'holdem' && live.length > 1) while (st.board.length < 5) { st.deck.pop(); st.board.push(st.deck.pop()); }
  const scores = {}; if (live.length > 1) for (const i of live) { scores[i] = evaluate(st.variant === 'holdem' ? st.seats[i].hand.concat(st.board) : st.seats[i].hand); st.seats[i].shown = true; }
  const levels = [...new Set(st.seats.map(s => s.total).filter(x => x > 0))].sort((a, b) => a - b), pots = []; let prev = 0;
  for (const L of levels) {
    let amt = 0; const elig = [];
    st.seats.forEach((s, i) => { amt += Math.max(0, Math.min(s.total, L) - prev); if (s.total >= L && inHand(st, i)) elig.push(i); });
    if (amt) { const last = pots[pots.length - 1]; if (elig.length && last && last.elig.join() === elig.join()) last.amt += amt; else if (elig.length) pots.push({ amt, elig }); else if (last) last.amt += amt; }
    prev = L;
  }
  const won = Array(st.n).fill(0);
  for (const p of pots) {
    const top = p.elig.length === 1 ? null : Math.max(...p.elig.map(i => scores[i]));
    p.winners = p.elig.length === 1 ? p.elig : p.elig.filter(i => scores[i] === top);
    const share = Math.floor(p.amt / p.winners.length); let rest = p.amt - share * p.winners.length;
    for (const i of order(st, (st.dealer + 1) % st.n).filter(i => p.winners.includes(i))) { won[i] += share + (rest > 0 ? 1 : 0); rest--; }
  }
  won.forEach((x, i) => st.seats[i].chips += x);
  st.pots = pots; st.won = won; st.scores = scores;
  for (const s of st.seats) if (!s.out && s.chips === 0) { s.out = true; s.outAt = st.handNo; }
  const left = alive(st); if (left.length === 1) st.champion = left[0];
  st.result = { won, pots, scores, showdown: live.length > 1 };
}
function endRound(st) {
  for (const s of st.seats) { s.bet = 0; s.acted = false; }
  st.currentBet = 0; st.minRaise = st.bb;
  const live = st.seats.map((s, i) => i).filter(i => inHand(st, i));
  if (live.length <= 1) { finish(st); return; }
  const actors = live.filter(i => !st.seats[i].allin);
  if (st.variant === 'holdem') {
    const nxt = { pre: 'flop', flop: 'turn', turn: 'river', river: 'show' }[st.street];
    if (nxt === 'show') { finish(st); return; }
    st.street = nxt; st.deck.pop(); for (let k = 0; k < (nxt === 'flop' ? 3 : 1); k++) st.board.push(st.deck.pop());
    if (actors.length <= 1) { st.toAct = -1; return endRound(st); }
    st.toAct = nextIn(st, st.dealer, canAct);
  } else {
    if (st.street === 'bet1') { st.street = 'draw'; st.toAct = nextIn(st, st.dealer, (S, j) => inHand(S, j) && S.seats[j].drew === null); return; }
    if (st.street === 'bet2') { finish(st); return; }
  }
}
function roundOver(st) {
  const live = st.seats.map((s, i) => i).filter(i => inHand(st, i));
  if (live.length <= 1) return true;
  return live.every(i => st.seats[i].allin || (st.seats[i].acted && st.seats[i].bet >= st.currentBet));
}
function advance(st, i) {
  if (!roundOver(st)) { st.toAct = nextIn(st, i, (S, j) => canAct(S, j) && (!S.seats[j].acted || S.seats[j].bet < S.currentBet)); return; }
  endRound(st);
}
function startHand(st) {
  if (alive(st).length <= 1) { st.champion = alive(st)[0]; return st; }
  st.handNo++; st.level = Math.min(BLINDS.length - 1, Math.floor((st.handNo - 1) / st.opts.every));
  const [sb, bb] = BLINDS[st.level]; st.sb = sb; st.bb = bb;
  if (st.handNo > 1) st.dealer = nextAlive(st, st.dealer); else if (st.seats[st.dealer].out) st.dealer = nextAlive(st, st.dealer);
  st.deck = shuffle(deck()); st.board = []; st.pots = null; st.winners = null; st.result = null; st.muck = [];
  for (const s of st.seats) { s.hand = []; s.folded = s.out; s.allin = false; s.bet = 0; s.total = 0; s.acted = false; s.drew = null; s.shown = false; s.last = null; s.history = []; s.post = []; }
  const heads = alive(st).length === 2;
  st.sbSeat = heads ? st.dealer : nextAlive(st, st.dealer); st.bbSeat = nextAlive(st, st.sbSeat);
  put(st, st.sbSeat, Math.min(sb, st.seats[st.sbSeat].chips)); st.seats[st.sbSeat].last = { a: 'sb', amt: st.seats[st.sbSeat].bet };
  put(st, st.bbSeat, Math.min(bb, st.seats[st.bbSeat].chips)); st.seats[st.bbSeat].last = { a: 'bb', amt: st.seats[st.bbSeat].bet };
  const count = st.variant === 'holdem' ? 2 : 5;
  for (let r = 0; r < count; r++) for (const i of order(st, nextAlive(st, st.dealer))) st.seats[i].hand.push(st.deck.pop());
  st.street = st.variant === 'holdem' ? 'pre' : 'bet1'; st.currentBet = bb; st.minRaise = bb; st.lastRaiser = st.bbSeat;
  st.toAct = nextIn(st, st.bbSeat, canAct); st.turn = st.toAct;
  const actors = alive(st).filter(i => !st.seats[i].allin);
  if (!actors.length || (actors.length === 1 && st.seats[actors[0]].bet >= st.currentBet)) {
    if (st.variant === 'holdem') { st.street = 'river'; while (st.board.length < 5) { st.deck.pop(); st.board.push(st.deck.pop()); } }
    finish(st);
  }
  return st;
}
function act(st, i, input) {
  if (i !== st.toAct || st.street === 'show') throw Error('turn');
  const s = st.seats[i], c = toCall(st, i), a = input && input.action;
  if (a === 'fold') { if (!options(st, i).fold) throw Error('action'); s.folded = true; s.last = { a: 'fold' }; }
  else if (a === 'check') { if (c) throw Error('action'); s.last = { a: 'check' }; }
  else if (a === 'call') { if (!c) throw Error('action'); put(st, i, c); s.last = { a: s.allin ? 'allin' : 'call', amt: s.bet }; }
  else if (a === 'raise') {
    const o = options(st, i);
    if (o.maxTo === undefined || !Number.isFinite(input.to)) throw Error('action');
    const to = Math.round(input.to);
    if (to < o.minTo || to > o.maxTo) throw Error('raise');
    const inc = to - st.currentBet; put(st, i, to - s.bet);
    if (inc >= st.minRaise) st.minRaise = inc;
    if (to > st.currentBet) { st.currentBet = to; st.lastRaiser = i; for (let j = 0; j < st.n; j++) if (j !== i) st.seats[j].acted = false; }
    s.last = { a: s.allin ? 'allin' : st.currentBet === st.bb ? 'bet' : 'raise', amt: s.bet };
  } else throw Error('action');
  s.acted = true; s.history.push(s.last.a);
  if (st.street !== 'pre' && st.street !== 'bet1') s.post.push(s.last.a);
  advance(st, i); st.turn = st.toAct;
}
const maxDraw = hand => hand.some(c => c.r === 14) ? 4 : 3;
function discard(st, i, ids) {
  if (st.street !== 'draw' || i !== st.toAct || !Array.isArray(ids) || ids.length > 5) throw Error('draw');
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length || unique.some(id => !Number.isInteger(id) || id < 0 || id >= 5)) throw Error('draw');
  const keepAce = st.seats[i].hand.some((c, k) => c.r === 14 && !unique.includes(k));
  if (unique.length > (keepAce ? 4 : 3)) throw Error('draw');
  for (const k of unique.slice().sort((a, b) => b - a)) st.muck.push(st.seats[i].hand.splice(k, 1)[0]);
  for (let k = 0; k < unique.length; k++) { if (!st.deck.length) st.deck = shuffle(st.muck.splice(0)); st.seats[i].hand.push(st.deck.pop()); }
  st.seats[i].drew = unique.length;
  const nxt = nextIn(st, i, (S, j) => inHand(S, j) && S.seats[j].drew === null);
  if (nxt >= 0 && nxt !== i) { st.toAct = nxt; }
  else {
    st.street = 'bet2'; for (const x of st.seats) x.last = x.folded ? x.last : null;
    const actors = st.seats.map((x, j) => j).filter(j => canAct(st, j));
    if (actors.length <= 1) finish(st); else st.toAct = nextIn(st, st.dealer, canAct);
  }
  st.turn = st.toAct;
}
function bot(st, i) {
  if (st.street === 'draw') {
    const h = st.seats[i].hand, counts = {};
    h.forEach(c => counts[c.r] = (counts[c.r] || 0) + 1);
    const keep = h.map((c, k) => k).filter(k => counts[h[k].r] >= 2);
    if (keep.length >= 2) return { draw: h.map((_, k) => k).filter(k => !keep.includes(k)) };
    const idx = h.map((_, k) => k).sort((a, b) => h[b].r - h[a].r);
    return { draw: h[idx[0]].r === 14 ? idx.slice(1) : idx.slice(2) };
  }
  const o = options(st, i), call = o.call || 0, strength = st.variant === 'holdem'
    ? (st.street === 'pre' ? ((st.seats[i].hand[0].r + st.seats[i].hand[1].r) / 28 + (st.seats[i].hand[0].r === st.seats[i].hand[1].r ? .3 : 0)) : category(evaluate(st.seats[i].hand.concat(st.board))) / 8)
    : category(evaluate(st.seats[i].hand)) / 8;
  if (o.minTo !== undefined && strength > .72 && Math.random() < .35) return { action: 'raise', to: o.maxTo > o.minTo ? o.minTo : o.maxTo };
  if (call && strength < .22 && call > pot(st) * .25) return { action: 'fold' };
  return { action: call ? 'call' : 'check' };
}
function view(st, me) {
  const rot = i => (i - me + st.n) % st.n;
  const rotate = a => Array.isArray(a) ? Array.from({ length: st.n }, (_, k) => a[(me + k) % st.n]) : a;
  const seats = Array.from({ length: st.n }, (_, k) => st.seats[(me + k) % st.n]).map((s, k) => ({ ...s, hand: k === 0 || s.shown ? s.hand.map(c => ({ ...c })) : s.hand.map(() => ({ id: 'x', hidden: true })) }));
  const pots = st.pots && st.pots.map(p => ({ ...p, elig: p.elig.map(rot), winners: p.winners && p.winners.map(rot) }));
  const scores = st.scores && Object.fromEntries(Object.entries(st.scores).map(([s, v]) => [rot(+s), v]));
  const out = { ...st, seats, dealer: rot(st.dealer), sbSeat: rot(st.sbSeat), bbSeat: rot(st.bbSeat),
    toAct: st.toAct < 0 ? st.toAct : rot(st.toAct), turn: st.turn < 0 ? st.turn : rot(st.turn),
    lastRaiser: st.lastRaiser === undefined ? undefined : rot(st.lastRaiser), champion: st.champion === undefined ? undefined : rot(st.champion),
    board: st.board.map(c => ({ ...c })), pots, won: rotate(st.won), scores,
    result: st.result && { ...st.result, won: rotate(st.result.won), pots, scores },
    deck: undefined, muck: undefined };
  return out;
}
module.exports = { newMatch, startHand, act, discard, options, toCall, pot, alive, bot, view, evaluate, category, maxDraw, finish };
