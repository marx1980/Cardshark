// ===================== TABLIĆ (Croatian/Serbian capture game) =====================
// 52 cards, 2, 3 or 4 players (4 = two pairs, partners sit opposite). Values: 2–10 face value, J 12, Q 13, K 14,
// ace 1 or 11. Four cards start face up on the table; everyone gets six cards at a time. On your turn you play one
// card: it may take a card of the same value, or any cards that add up to its value (several such groups at once).
// Played cards that take nothing stay on the table. A table cleared by a capture is a tabla (+1, not on the very last
// play). When the cards run out, whoever captured last takes what is left.
// Scoring per round: A, 10, J, Q, K 1 point each, 10♦ 2, 2♣ 1, most cards 3 (a tie gives nobody), tablas 1 each.
// The match goes to 101 (or 51); a tie at the top plays another round.
// Pure module (no I/O): the server and the app both run it. Play goes to the right (seat + 1), as in Briškula.
const Tablic = (() => {
  const CS_F = +(typeof process !== 'undefined' && process.env && process.env.CS_F) || 1.0;
  const SUITS = ['S', 'H', 'D', 'C'];
  const RN = { 1: 'a', 11: 'j', 12: 'q', 13: 'k' };
  const key = c => c.s + (RN[c.r] || c.r);
  const val = c => c.r === 1 ? 1 : c.r >= 11 ? c.r + 1 : c.r;
  const pts = c => c.r === 10 && c.s === 'D' ? 2 : (c.r === 1 || c.r >= 10 || (c.r === 2 && c.s === 'C')) ? 1 : 0;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const makeDeck = () => { const d = []; for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ id: s + r, s, r }); return d; };
  const nTeams = st => st.n === 4 ? 2 : st.n;
  const teamOf = (st, s) => st.n === 4 ? s % 2 : s;
  const next = (st, s) => (s + 1) % st.n;
  const teamSeats = st => st.n === 4 ? [[0, 2], [1, 3]] : Array.from({ length: st.n }, (_, s) => [s]);

  // ---------------------------------------------------------------- capture rules
  // can these cards be split into groups that each add up to v? (an ace on the table counts 1 or 11)
  function groupOk(cards, v) {
    let base = 0, aces = 0;
    for (const c of cards) { if (c.r === 1) { aces++; base += 1; } else base += val(c); }
    for (let j = 0; j <= aces; j++) if (base + 10 * j === v) return true;
    return false;
  }
  function partitions(cards, v) {
    const n = cards.length; if (!n) return false;
    const memo = new Map();
    const rec = mask => {
      if (!mask) return true;
      if (memo.has(mask)) return memo.get(mask);
      const low = mask & -mask, rest = mask ^ low; let ok = false;
      for (let s = rest; ; s = (s - 1) & rest) {
        const g = s | low, sub = [];
        for (let i = 0; i < n; i++) if ((g >> i) & 1) sub.push(cards[i]);
        if (groupOk(sub, v) && rec(mask ^ g)) { ok = true; break; }
        if (!s) break;
      }
      memo.set(mask, ok); return ok;
    };
    return rec((1 << n) - 1);
  }
  const playValues = c => c.r === 1 ? [1, 11] : [val(c)];
  // an empty take means "lay the card down"
  const validTake = (card, cards) => !cards.length || playValues(card).some(v => partitions(cards, v));

  // every non-empty set of table cards the card could take, as bitmasks over `table`
  function takeMasks(table, card) {
    const n = table.length, full = (1 << n) - 1, out = new Set();
    if (!n) return [];
    if (n > 12) {   // very crowded table: only look at small groups
      const rec = (start, chosen) => {
        if (chosen.length && validTake(card, chosen.map(i => table[i]))) out.add(chosen.reduce((m, i) => m | (1 << i), 0));
        if (chosen.length >= 5) return;
        for (let i = start; i < n; i++) rec(i + 1, [...chosen, i]);
      };
      rec(0, []); return [...out];
    }
    const base = new Int16Array(full + 1), aces = new Int8Array(full + 1);
    for (let g = 1; g <= full; g++) {
      const low = g & -g, i = 31 - Math.clz32(low), prev = g ^ low;
      base[g] = base[prev] + (table[i].r === 1 ? 1 : val(table[i])); aces[g] = aces[prev] + (table[i].r === 1 ? 1 : 0);
    }
    for (const v of playValues(card)) {
      const ok = new Uint8Array(full + 1); ok[0] = 1;
      for (let mask = 1; mask <= full; mask++) {
        const low = mask & -mask, rest = mask ^ low;
        for (let s = rest; ; s = (s - 1) & rest) {
          const g = s | low;
          if (ok[mask ^ g]) { let good = false; for (let j = 0; j <= aces[g]; j++) if (base[g] + 10 * j === v) { good = true; break; } if (good) { ok[mask] = 1; break; } }
          if (!s) break;
        }
        if (ok[mask]) out.add(mask);
      }
    }
    return [...out];
  }
  const maskCards = (table, mask) => table.filter((_, i) => (mask >> i) & 1);

  // ---------------------------------------------------------------- match state
  function newMatch(opts = {}) {
    const n = [2, 3, 4].includes(+opts.players) ? +opts.players : 2;
    const target = [51, 101].includes(+opts.target) ? +opts.target : 101;
    const st = { game: 'a', n, opts: { players: n, target }, round: 0, dealer: 0, turn: 0, over: false,
      table: [], stock: [], hands: Array.from({ length: n }, () => []), piles: Array.from({ length: n }, () => []),
      scores: Array(nTeams({ n })).fill(0), tablas: Array(nTeams({ n })).fill(0), lastCapture: -1, rows: [] };
    return st;
  }
  function dealBatch(st) {
    const per = st.stock.length >= st.n * 6 ? 6 : Math.floor(st.stock.length / st.n);
    for (let k = 0; k < st.n; k++) { const s = (st.dealer + 1 + k) % st.n; st.hands[s].push(...st.stock.splice(0, per)); }
  }
  function newRound(st) {
    st.round++; st.dealer = next(st, st.dealer);
    const deck = shuffle(makeDeck());
    st.table = deck.splice(0, 4); st.stock = deck;
    st.hands = Array.from({ length: st.n }, () => []); st.piles = Array.from({ length: st.n }, () => []);
    st.tablas = Array(nTeams(st)).fill(0); st.lastCapture = -1;
    dealBatch(st); st.turn = next(st, st.dealer);
  }
  const handsEmpty = st => st.hands.every(h => !h.length);
  const roundOver = st => st.stock.length === 0 && handsEmpty(st);
  const needsDeal = st => st.stock.length > 0 && handsEmpty(st);
  function deal(st) { dealBatch(st); st.turn = next(st, st.dealer); }

  // play one card (throws { rule } for an illegal move)
  function play(st, seat, cardId, takeIds) {
    const hand = st.hands[seat], ci = hand.findIndex(c => c.id === cardId);
    if (ci < 0) throw Object.assign(Error('card'), { rule: 'card' });
    const ids = Array.isArray(takeIds) ? takeIds : [];
    if (new Set(ids).size !== ids.length) throw Object.assign(Error('take'), { rule: 'take' });
    const take = ids.map(id => st.table.find(c => c.id === id));
    if (take.some(c => !c)) throw Object.assign(Error('take'), { rule: 'take' });
    const card = hand[ci];
    if (!validTake(card, take)) throw Object.assign(Error('sum'), { rule: 'sum' });
    hand.splice(ci, 1);
    let tabla = false;
    if (take.length) {
      st.piles[seat].push(card, ...take);
      st.table = st.table.filter(c => !ids.includes(c.id));
      st.lastCapture = seat;
      if (!st.table.length && !(st.stock.length === 0 && handsEmpty(st))) { tabla = true; st.tablas[teamOf(st, seat)]++; }
    } else st.table.push(card);
    st.turn = next(st, seat);
    return { card, taken: ids, tabla };
  }

  // end of the round: leftovers go to the last capturer, then points
  function finishRound(st) {
    if (st.table.length && st.lastCapture >= 0) { st.piles[st.lastCapture].push(...st.table); }
    st.leftover = st.table.map(c => c.id); st.table = [];
    const T = nTeams(st), cards = Array(T).fill(0), cp = Array(T).fill(0);
    st.piles.forEach((p, s) => { const t = teamOf(st, s); cards[t] += p.length; cp[t] += p.reduce((a, c) => a + pts(c), 0); });
    const top = Math.max(...cards), most = cards.map(c => c === top && cards.filter(x => x === top).length === 1 ? 3 : 0);
    const rows = Array.from({ length: T }, (_, t) => ({ cards: cards[t], cardPts: cp[t], most: most[t], tablas: st.tablas[t], total: cp[t] + most[t] + st.tablas[t] }));
    rows.forEach((r, t) => { st.scores[t] += r.total; });
    const hi = Math.max(...st.scores), leaders = st.scores.map((x, t) => x === hi ? t : -1).filter(t => t >= 0);
    let winner = -1;
    if (hi >= st.opts.target && leaders.length === 1) winner = leaders[0];
    st.rows.push(rows); st.over = winner >= 0;
    return { rows, add: rows.map(r => r.total), scores: st.scores.slice(), winner, over: winner >= 0 };
  }

  // ---------------------------------------------------------------- bots
  // unseen cards from one player's chair: everything not on the table, in my hand or in a pile
  function unseen(st, seat) {
    const known = new Set([...st.table, ...st.hands[seat], ...st.piles.flat()].map(c => c.id));
    return makeDeck().filter(c => !known.has(c.id));
  }
  // best value an opponent could take from this table with a card of value v (higher = more dangerous)
  function bestByValue(table, finalPlay) {
    const best = {};
    const n = table.length;
    for (let v = 1; v <= 14; v++) {
      if (v === 11) continue;   // only an ace makes 11, and the ace probe below covers it
      const probe = { r: v === 1 ? 1 : v >= 12 ? v - 1 : v, s: 'X' };
      let b = 0;
      for (const m of takeMasks(table, probe)) {
        const cs = maskCards(table, m);
        let g = cs.reduce((a, c) => a + pts(c), 0) + 0.12 * cs.length + 0.12;
        if (cs.length === n && !finalPlay) g += 1;
        if (g > b) b = g;
      }
      best[v] = b;
    }
    best[11] = best[1];   // an ace is played as 1 or 11
    return best;
  }
  function chooseMove(st, seat, level) {
    const hand = st.hands[seat];
    const T = st.table, finalAll = st.stock.length === 0 && st.hands.every((h, s) => s === seat || !h.length);
    const cand = [];
    for (const card of hand) {
      const masks = takeMasks(T, card);
      for (const m of masks) cand.push({ card, mask: m, take: maskCards(T, m) });
      cand.push({ card, mask: 0, take: [] });
    }
    const rnd = Math.random;
    if (level === 'novice') {
      const caps = cand.filter(c => c.take.length);
      const pool = caps.length && rnd() < 0.7 ? caps : cand;
      const c = pool[Math.floor(rnd() * pool.length)];
      return { card: c.card.id, take: c.take.map(x => x.id) };
    }
    const deep = (level === 'pro' || level === 'cardshark') && T.length <= 10;
    const un = deep ? unseen(st, seat) : null;
    const oppHand = st.hands.map((h, s) => ({ s, k: h.length })).filter(x => x.s !== seat && teamOf(st, x.s) !== teamOf(st, seat));
    const k = Math.max(1, ...oppHand.map(x => x.k));
    let best = null;
    for (const c of cand) {
      const afterTable = T.filter((_, i) => !((c.mask >> i) & 1));
      const tabla = c.take.length && !afterTable.length && !(st.stock.length === 0 && finalAll && hand.length === 1);
      let gain = c.take.reduce((a, x) => a + pts(x), 0) + (c.take.length ? pts(c.card) + 0.12 * (c.take.length + 1) : 0) + (tabla ? 1 : 0);
      if (c.take.length && hand.length === 1 && finalAll) gain += afterTable.reduce((a, x) => a + pts(x), 0);   // last play: the rest is mine
      let score = gain;
      if (!c.take.length) score -= 0.02 * val(c.card) + pts(c.card) * 0.25;   // lay low, plain cards first
      if (c.take.length) score += 0.001 * c.take.length;
      if (deep) {
        const table2 = c.take.length ? afterTable : [...afterTable, c.card];
        if (table2.length && !(finalAll && hand.length === 1)) {
          const by = bestByValue(table2, false);
          if (level === 'pro') {
            // the next opponent plays one card: the average danger over the cards still unseen
            const avg = un.reduce((a, u) => a + (by[val(u)] || 0), 0) / Math.max(1, un.length);
            score -= 0.5 * avg;
          } else {
            // cardshark: the opponents hold k cards between turns; expected best capture among k cards drawn from the unseen pile
            const bs = un.map(u => by[val(u)] || 0).sort((x, y) => x - y), U = bs.length;
            let exp = 0, prev = 0;
            for (let i = 0; i < U; i++) {
              if (i + 1 < U && bs[i + 1] === bs[i]) continue;
              const F = Math.pow((i + 1) / U, k); exp += bs[i] * (F - prev); prev = F;
            }
            score -= CS_F * exp;
            // keep a tabla chance: clearing the table is worth more with a card in hand that fits what remains
            if (c.take.length && afterTable.length === 0) score += 0.1;
          }
        }
      }
      if (!best || score > best.score) best = { score, c };
    }
    return { card: best.c.card.id, take: best.c.take.map(x => x.id) };
  }

  // ---------------------------------------------------------------- views and events
  const teamOrder = (st, me) => st.n === 4 ? (me % 2 === 0 ? [0, 1] : [1, 0]) : Array.from({ length: st.n }, (_, i) => (me + i) % st.n);
  const rotSeat = (st, s, me) => s === null || s === undefined || s < 0 ? s : ((s - me) % st.n + st.n) % st.n;
  const permute = (st, a, me) => Array.isArray(a) ? teamOrder(st, me).map(t => a[t]) : a;
  function view(st, me) {
    const rel = s => rotSeat(st, s, me);
    const seatsRel = Array.from({ length: st.n }, (_, i) => (me + i) % st.n);
    return {
      game: 'a', opts: st.opts, n: st.n, round: st.round, dealer: rel(st.dealer),
      table: st.table.slice(), hand: st.hands[me] ? st.hands[me].slice() : [],
      counts: seatsRel.map(s => st.hands[s].length), piles: seatsRel.map(s => st.piles[s].length),
      stock: st.stock.length, scores: permute(st, st.scores, me), tablas: permute(st, st.tablas, me),
      lastCapture: rel(st.lastCapture), teamRel: seatsRel.map(s => teamOrder(st, me).indexOf(teamOf(st, s))),
      rows: st.rows.map(r => permute(st, r, me)),
    };
  }
  function rotEvent(ev, me, st) {
    const r = { ...ev };
    for (const k of ['seat', 'by']) if (typeof r[k] === 'number' && r[k] >= 0) r[k] = rotSeat(st, r[k], me);
    if (typeof r.team === 'number' && r.team >= 0) r.team = teamOrder(st, me).indexOf(r.team);
    if (typeof r.winner === 'number' && r.winner >= 0) r.winner = teamOrder(st, me).indexOf(r.winner);
    for (const k of ['rows', 'add', 'scores']) if (Array.isArray(r[k])) r[k] = permute(st, r[k], me);
    return r;
  }

  // ---------------------------------------------------------------- the match loop (same flow offline and online)
  // h: { opts, saved, io, emit(ev), getAction(seat, req, bot), checkpoint(at), turn, st, fromHuman }
  async function run(h) {
    let st, cont = null;
    if (h.saved) { st = h.st = JSON.parse(h.saved.st); cont = h.saved.at === 'turn' ? 'turn' : null; h.saved = null; }
    else { st = h.st = newMatch(h.opts); st.dealer = Math.floor(Math.random() * st.n); }
    while (true) {
      if (cont === null) { newRound(st); h.turn = null; h.emit({ k: 'deal', round: st.round, first: true }); await h.io.sleep(700); }
      cont = null;
      while (!roundOver(st)) {
        if (needsDeal(st)) { deal(st); h.turn = null; h.emit({ k: 'deal', round: st.round, first: false }); await h.io.sleep(600); }
        const seat = st.turn; h.turn = seat;
        h.emit({ k: 'turn', seat }); await h.checkpoint('turn');
        const bot = () => chooseMove(st, seat, h.io.level(seat) || 'average');
        let a = await h.getAction(seat, { kind: 'tablic' }, bot), r;
        try { r = play(st, seat, a.card, a.take); }
        catch (e) {
          if (h.fromHuman) { h.io.send(seat, { t: 'reject', rule: String(e && e.rule || 'bad') }); continue; }
          a = bot(); r = play(st, seat, a.card, a.take);
        }
        h.emit({ k: 'play', seat, card: r.card, taken: r.taken, tabla: r.tabla });
        await h.io.sleep(r.taken.length ? 900 : 450);
      }
      h.turn = null;
      const res = finishRound(st);
      h.emit({ k: 'handEnd', rows: res.rows, add: res.add, scores: res.scores, over: res.over, leftover: st.leftover, by: st.lastCapture });
      if (res.over) { h.emit({ k: 'matchEnd', winner: res.winner, scores: res.scores }); return res.winner; }
      await h.checkpoint('handEnd');
      await h.io.waitNext(15000);
    }
  }

  return { SUITS, key, val, pts, makeDeck, newMatch, newRound, deal, play, finishRound, validTake, partitions, takeMasks, maskCards,
    chooseMove, view, rotEvent, run, teamOf, teamSeats, nTeams, roundOver, needsDeal, unseen };
})();
if (typeof module !== 'undefined') module.exports = Tablic;
