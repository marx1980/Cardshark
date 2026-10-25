// Server-owned L’Unico! rules, including classic/Flip decks and house options.
const COLORS = { L: ['r', 'y', 'g', 'b'], D: ['p', 't', 'o', 'v'] };
const POINTS = { skip: 20, rev: 20, d2: 20, wild: 50, wd4: 50, d1: 10, flip: 20, wd2: 50, d5: 20, skipall: 30, wdc: 60 };
const DRAWS = { d2: 2, d1: 1, d5: 5, wd4: 4, wd2: 2 };
const isWild = f => f.c === null;
const isDrawWild = f => ['wd4', 'wd2', 'wdc'].includes(f.k);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function makeDeck(variant) {
  const out = []; let id = 0;
  if (variant === 'classic') {
    for (const c of COLORS.L) {
      out.push({ id: id++, L: { c, k: 'n', n: 0 } });
      for (let n = 1; n <= 9; n++) for (let x = 0; x < 2; x++) out.push({ id: id++, L: { c, k: 'n', n } });
      for (const k of ['skip', 'rev', 'd2']) for (let x = 0; x < 2; x++) out.push({ id: id++, L: { c, k } });
    }
    for (let x = 0; x < 4; x++) { out.push({ id: id++, L: { c: null, k: 'wild' } }); out.push({ id: id++, L: { c: null, k: 'wd4' } }); }
    return out;
  }
  const side = (cols, acts, wilds) => {
    const f = [];
    for (const c of cols) { for (let n = 1; n <= 9; n++) for (let x = 0; x < 2; x++) f.push({ c, k: 'n', n }); for (const k of acts) for (let x = 0; x < 2; x++) f.push({ c, k }); }
    for (const k of wilds) for (let x = 0; x < 4; x++) f.push({ c: null, k });
    return f;
  };
  const L = side(COLORS.L, ['d1', 'rev', 'skip', 'flip'], ['wild', 'wd2']);
  const D = shuffle(side(COLORS.D, ['d5', 'rev', 'skipall', 'flip'], ['wild', 'wdc']));
  return L.map((f, i) => ({ id: i, L: f, D: D[i] }));
}
const face = (st, card) => card[st.side];
const other = (st, card) => st.variant === 'flip' ? card[st.side === 'L' ? 'D' : 'L'] : null;
const top = st => face(st, st.discard[st.discard.length - 1]);
const nextSeat = (st, p, steps = 1) => ((p + st.dir * steps) % st.n + st.n) % st.n;
function newMatch(opts = {}) {
  const n = Math.max(2, Math.min(6, opts.players | 0 || 4)), variant = opts.variant === 'flip' ? 'flip' : 'classic';
  const target = [0, 250, 500].includes(+opts.target) ? +opts.target : 500;
  return { game: 'l', variant, n, opts: { target, stack: false, sevenO: false, jumpIn: false, drawUntil: false, ...opts, target, variant,
    sevenO: variant === 'classic' && !!opts.sevenO, jumpIn: variant === 'classic' && !!opts.jumpIn },
  scores: Array(n).fill(0), dealer: Math.floor(Math.random() * n), round: 0 };
}
function takeCards(st, n) {
  const out = [];
  for (let i = 0; i < n; i++) { if (!st.draw.length) refill(st); if (!st.draw.length) break; out.push(st.draw.pop()); }
  return out;
}
function refill(st) {
  if (st.discard.length < 2) return;
  const keep = st.discard.pop(); st.draw = shuffle(st.discard); st.discard = [keep];
}
function matches(st, card) {
  const f = face(st, card), t = top(st);
  if (st.pending) return st.opts.stack && f.k === st.pendingKind;
  if (isWild(f) || f.c === st.color) return true;
  if (f.k === 'n' && t.k === 'n' && f.n === t.n) return true;
  return f.k !== 'n' && f.k === t.k;
}
const legal = (st, p) => st.hands[p].filter(c => matches(st, c));
function jumpInCards(st, p) {
  if (!st.opts.jumpIn || st.variant !== 'classic' || st.pending || st.pendingChallenge) return [];
  const f = top(st); if (!f || isWild(f)) return [];
  return st.hands[p].filter(c => {
    const x = face(st, c);
    return x.c === f.c && x.k === f.k && (x.k !== 'n' || x.n === f.n);
  });
}
const honestDrawWild = (st, p, except) => !st.hands[p].some(c => c !== except && face(st, c).c === st.color);
function bestColor(st, p, except) {
  const cnt = {}; for (const c of st.hands[p]) { if (c === except) continue; const f = face(st, c); if (f.c) cnt[f.c] = (cnt[f.c] || 0) + 1 + (f.k !== 'n' ? 0.5 : 0); }
  return COLORS[st.side].reduce((a, b) => (cnt[b] || 0) > (cnt[a] || 0) ? b : a, COLORS[st.side][0]);
}
function newRound(st) {
  st.side = 'L'; st.dir = 1; st.round++; st.draw = shuffle(makeDeck(st.variant)); st.hands = Array.from({ length: st.n }, () => []);
  for (let r = 0; r < 7; r++) for (let p = 0; p < st.n; p++) st.hands[p].push(st.draw.pop());
  st.discard = []; st.pending = 0; st.pendingKind = null; st.uno = Array(st.n).fill(false); st.winner = null;
  st.lastPlay = null; st.mustChooseColor = null; st.pendingChallenge = null; st.voids = Array.from({ length: st.n }, () => ({})); st.named = {};
  let c;
  while (true) { c = st.draw.pop(); const f = c[st.side]; if (['wd4', 'wd2', 'wdc', 'flip'].includes(f.k)) { st.draw.splice(Math.floor(Math.random() * st.draw.length), 0, c); continue; } break; }
  st.discard.push(c); const f = face(st, c); st.color = f.c; st.turn = nextSeat(st, st.dealer); st.start = { k: f.k, p: st.turn, n: DRAWS[f.k] || 0 };
  if (f.k === 'rev') { st.dir = -1; st.turn = st.n === 2 ? nextSeat(st, st.dealer, 1) : st.dealer; }
  else if (f.k === 'skip' || f.k === 'skipall') st.turn = nextSeat(st, st.turn);
  else if (DRAWS[f.k]) { st.hands[st.turn].push(...takeCards(st, DRAWS[f.k])); st.turn = nextSeat(st, st.turn); }
  else if (f.k === 'wild') st.mustChooseColor = st.turn;
  return st;
}
function cardPoints(st, card) { const f = face(st, card); return f.k === 'n' ? f.n : (f.k === 'wild' && st.variant === 'flip' ? 40 : POINTS[f.k]); }
function endRound(st) {
  let pts = 0;
  for (let i = 0; i < st.n; i++) if (i !== st.winner) for (const c of st.hands[i]) pts += cardPoints(st, c);
  st.scores[st.winner] += pts; st.result = { winner: st.winner, points: pts };
  st.matchOver = st.opts.target === 0 || st.scores[st.winner] >= st.opts.target;
  st.dealer = (st.dealer + 1) % st.n;
}
function play(st, p, id, color, sevenTarget) {
  if (p !== st.turn || st.winner !== null) throw Error('turn');
  const h = st.hands[p], idx = h.findIndex(c => c.id === id); if (idx < 0 || !matches(st, h[idx])) throw Error('card');
  const card = h[idx], f = face(st, card);
  if (isWild(f) && !COLORS[st.side].includes(color)) throw Error('color');
  if (st.opts.sevenO && f.k === 'n' && f.n === 7 && h.length > 1 &&
      (!Number.isInteger(sevenTarget) || sevenTarget < 0 || sevenTarget >= st.n || sevenTarget === p)) throw Error('target');
  const oldColor = st.color;
  const fx = { p, card, face: f, drew: {}, skipped: [], flipped: false, reversed: false, again: false, honest: !isDrawWild(f) || honestDrawWild(st, p, card) };
  h.splice(idx, 1); if (isDrawWild(f)) st.lastDrawWild = { p, honest: fx.honest, color: st.color };
  st.discard.push(card); st.color = isWild(f) ? color : f.c;
  if (isWild(f)) st.named[p] = st.color; else if (st.named[p] && st.named[p] !== f.c) st.named[p] = null;
  if (f.c) st.voids[p][f.c] = false;
  let next = nextSeat(st, p);
  const draw = k => { const cs = takeCards(st, k); st.hands[next].push(...cs); fx.drew[next] = (fx.drew[next] || 0) + cs.length; };
  switch (f.k) {
    case 'skip': fx.skipped.push(next); next = nextSeat(st, next); break;
    case 'skipall': fx.again = true; next = p; break;
    case 'rev': st.dir *= -1; fx.reversed = true; next = st.n === 2 ? p : nextSeat(st, p); break;
    case 'd2': case 'd1': case 'd5': case 'wd4': case 'wd2':
      if (st.opts.stack && (!isDrawWild(f) || f.k === 'wd4')) { st.pending += DRAWS[f.k]; st.pendingKind = f.k; }
      else if (isDrawWild(f)) st.pendingChallenge = { from: p, to: next, k: DRAWS[f.k], honest: fx.honest, oldColor };
      else { draw(DRAWS[f.k]); fx.skipped.push(next); next = nextSeat(st, next); }
      break;
    case 'wdc': st.pendingChallenge = { from: p, to: next, k: 'color', honest: fx.honest, oldColor }; break;
    case 'flip':
      st.side = st.side === 'L' ? 'D' : 'L'; fx.flipped = true; st.discard.reverse(); st.draw.reverse();
      { const t = top(st); st.color = t.c || bestColor(st, p); }
      break;
    case 'n':
      if (st.opts.sevenO && f.n === 7 && h.length) {
        [st.hands[p], st.hands[sevenTarget]] = [st.hands[sevenTarget], st.hands[p]]; fx.swap = { a: p, b: sevenTarget };
      }
      if (st.opts.sevenO && f.n === 0 && h.length) { const hs = st.hands.slice(); for (let i = 0; i < st.n; i++) st.hands[nextSeat(st, i)] = hs[i]; fx.rotate = true; }
  }
  if (!st.hands[p].length) {
    if (st.pendingChallenge) resolveChallenge(st, false, fx);
    if (st.pending) { const t = nextSeat(st, p), cs = takeCards(st, st.pending); st.hands[t].push(...cs); fx.drew[t] = (fx.drew[t] || 0) + cs.length; st.pending = 0; }
    st.winner = p; fx.out = true; endRound(st); return fx;
  }
  st.turn = st.pendingChallenge ? st.pendingChallenge.to : next;
  st.uno[p] = !!st.uno[p] && st.hands[p].length === 1;
  return fx;
}
function resolveChallenge(st, challenge) {
  const c = st.pendingChallenge; if (!c) throw Error('challenge');
  st.pendingChallenge = null; const give = (p, k) => {
    const got = [];
    if (k === 'color') { while (true) { const a = takeCards(st, 1); if (!a.length) break; got.push(a[0]); if (face(st, a[0]).c === c.oldColor) break; } }
    else got.push(...takeCards(st, k));
    st.hands[p].push(...got);
  };
  if (challenge && !c.honest) { give(c.from, c.k); st.turn = c.to; }
  else if (challenge) { give(c.to, c.k); give(c.to, 2); st.turn = nextSeat(st, c.to); }
  else { give(c.to, c.k); st.turn = nextSeat(st, c.to); }
  return st;
}
function drawTurn(st, p) {
  if (p !== st.turn) throw Error('turn');
  if (st.pending) {
    if (!st.opts.stack) throw Error('stack');
    const cards = takeCards(st, st.pending); st.hands[p].push(...cards); st.pending = 0; st.pendingKind = null; st.turn = nextSeat(st, p); return { cards, penalty: true };
  }
  st.voids[p][st.color] = true; const cards = [];
  while (true) { const cs = takeCards(st, 1); if (!cs.length) break; cards.push(cs[0]); st.hands[p].push(cs[0]); if (matches(st, cs[0]) || !st.opts.drawUntil) break; }
  const last = cards[cards.length - 1], playable = last && matches(st, last) ? last : null;
  if (!playable) st.turn = nextSeat(st, p);
  if (!cards.length) { st.stuck = (st.stuck || 0) + 1; if (st.stuck >= st.n) { st.winner = st.hands.reduce((best, h, i) => h.reduce((a, c) => a + cardPoints(st, c), 0) < st.hands[best].reduce((a, c) => a + cardPoints(st, c), 0) ? i : best, 0); endRound(st); return { cards, playable: null, ended: true }; } }
  else st.stuck = 0;
  return { cards, playable };
}
function passAfterDraw(st, p) { if (p !== st.turn) throw Error('turn'); st.turn = nextSeat(st, p); }
function callUno(st, p) { st.uno[p] = true; }
function catchUno(st, p) { if (st.hands[p].length !== 1 || st.uno[p]) throw Error('uno'); const cs = takeCards(st, 2); st.hands[p].push(...cs); return cs; }
function bot(st, p) {
  if (st.mustChooseColor === p) return { action: 'color', color: bestColor(st, p) };
  if (st.pendingChallenge && st.pendingChallenge.to === p) return { action: 'challenge', challenge: Math.random() < .3 };
  if (st.pending) return { action: 'draw' };
  const candidates = legal(st, p).filter(c => !isDrawWild(face(st, c)) || honestDrawWild(st, p, c));
  const pool = candidates.length ? candidates : legal(st, p);
  if (!pool.length) return { action: 'draw' };
  const next = nextSeat(st, p), c = pool.sort((a, b) => {
    const score = x => (isWild(face(st, x)) ? -5 : 3) + (face(st, x).c ? st.hands[p].filter(y => y !== x && face(st, y).c === face(st, x).c).length : 0) + (st.hands[next].length <= 2 && ['skip', 'd2', 'd1', 'd5', 'wd4', 'wd2', 'wdc', 'skipall'].includes(face(st, x).k) ? 10 : 0);
    return score(b) - score(a);
  })[0];
  let color = bestColor(st, p, c);
  const out = { action: 'play', card: c.id, color };
  if (st.opts.sevenO && face(st, c).k === 'n' && face(st, c).n === 7 && st.hands[p].length > 1) out.sevenTarget = (p + 1) % st.n;
  if (st.hands[p].length === 2) out.uno = true;
  return out;
}
function view(st, me) {
  const rot = i => (i - me + st.n) % st.n;
  const visibleCard = c => ({ id: c.id, [st.side]: { ...face(st, c) } });
  const hands = Array.from({ length: st.n }, (_, k) => st.hands[(me + k) % st.n]).map((h, k) => k ? h.map(() => ({ id: 'x', hidden: true })) : h.map(visibleCard));
  const out = { game: 'l', variant: st.variant, n: st.n, opts: st.opts, scores: Array.from({ length: st.n }, (_, k) => st.scores[(me + k) % st.n]),
    dealer: rot(st.dealer), turn: rot(st.turn), side: st.side, dir: st.dir, hands, handCounts: st.hands.map(h => h.length).map((_, k) => st.hands[(me + k) % st.n].length),
    discard: st.discard.map(visibleCard), top: st.discard.length ? visibleCard(st.discard[st.discard.length - 1]) : null, color: st.color,
    draw: st.draw.map(() => ({ id: 'x', hidden: true })), drawCount: st.draw.length, pending: st.pending, pendingKind: st.pendingKind, uno: Array.from({ length: st.n }, (_, k) => st.uno[(me + k) % st.n]),
    winner: st.winner === null ? null : rot(st.winner), result: st.result && { ...st.result, winner: rot(st.result.winner) },
    matchOver: st.matchOver, round: st.round, mustChooseColor: st.mustChooseColor == null ? null : rot(st.mustChooseColor),
    pendingChallenge: st.pendingChallenge && { from: rot(st.pendingChallenge.from), to: rot(st.pendingChallenge.to), k: st.pendingChallenge.k },
    start: st.start && { ...st.start, p: rot(st.start.p) }, voids: Array.from({ length: st.n }, (_, k) => ({ ...st.voids[(me + k) % st.n] })) };
  out.lastDrawWild = undefined;
  return out;
}
module.exports = { newMatch, newRound, face, other, top, nextSeat, legal, jumpInCards, matches, play, drawTurn, passAfterDraw, resolveChallenge, callUno, catchUno, bestColor, bot, view, cardPoints, takeCards, isWild, isDrawWild, honestDrawWild, COLORS, endRound };
