// ===================== REMI BOTS =====================
// Novice: opens when it happens to see 51, lays down what it notices, throws away almost at random.
// Average: finds the best melds in its hand, keeps pairs and near-runs, sheds high cards.
// Pro: also avoids throwing cards the next player could use, takes discards that help, plans lay-offs and joker swaps.
// Cardshark: Pro, plus it remembers what each player has picked up and keeps the cards they are collecting away from them.
const RemiAI = (() => {
  const R = typeof Remi !== 'undefined' ? Remi : require('./remi.js');
  const LEVELS = ['novice', 'average', 'pro', 'cardshark'];
  const isJ = R.isJ;
  // discard weights per level: loose = keep pairs/near-runs, val = shed high cards, feed = don't give the next player
  // a card they can lay off, lay = keep cards I can lay off later, track = avoid what the others collect
  const CFG = {
    novice: {},
    average: { loose: 1.5, val: 0.6, feed: 0, lay: 0, track: 0 },
    pro: { loose: 0, outs: 1.2, val: 0.8, feed: 30, lay: 6, track: 0, late: 1.5 },
    cardshark: { loose: 0, outs: 1.2, val: 0.8, feed: 30, lay: 6, track: 0, late: 2 }
  };

  // ---- all melds that can be made from a set of cards (each a list of card ids)
  function candidates(cards) {
    const out = [], jok = cards.filter(isJ).slice(0, 2), nat = cards.filter(c => !isJ(c));
    const push = arr => { const a = R.analyze(arr); if (a) out.push({ ids: arr.map(c => c.id), cards: arr, value: a.value, pen: arr.reduce((x, c) => x + R.handVal(c), 0) }); };
    // sets
    const byRank = {};
    for (const c of nat) (byRank[c.r] = byRank[c.r] || []).push(c);
    for (const r in byRank) {
      const cs = byRank[r]; if (cs.length < 2) continue;
      // combinations with different suits
      const combos = [];
      const rec = (i, cur) => { if (cur.length >= 2) combos.push(cur.slice()); if (cur.length === 4) return; for (let k = i; k < cs.length; k++) if (!cur.some(x => x.s === cs[k].s)) { cur.push(cs[k]); rec(k + 1, cur); cur.pop(); } };
      rec(0, []);
      for (const cb of combos) {
        if (cb.length >= 3) push(cb);
        if (cb.length <= 3) for (const j of jok) push(cb.concat([j]));
      }
    }
    // runs
    for (const s of R.SUITS) {
      const by = {}; for (const c of nat) if (c.s === s) (by[c.r] = by[c.r] || []).push(c);
      const has = p => by[p === 14 ? 1 : p];
      for (let lo = 1; lo <= 12; lo++) for (let hi = lo + 2; hi <= Math.min(14, lo + 12); hi++) {
        let miss = 0, present = 0;
        for (let p = lo; p <= hi; p++) { if (has(p)) present++; else miss++; }
        if (miss > 1 || present < 2) { if (miss > 1) break; continue; }
        for (const copy of [0, 1]) {
          const arr = []; let fresh = copy === 0;
          for (let p = lo; p <= hi; p++) { const l = has(p); if (l) { const c = l[Math.min(copy, l.length - 1)]; if (l.length > copy && copy) fresh = true; arr.push(c); } }
          if (!fresh) continue;
          if (miss === 0) push(arr);
          else for (const j of jok) push(arr.concat([j]));
        }
      }
    }
    return out;
  }
  // ---- the best non-overlapping melds. mode 'open' scores meld value, 'dead' scores the hand points they remove.
  // need: a card id that must be in a meld (a taken discard). keep: cards that must stay in hand (at least one).
  function bestMelds(cards, mode = 'dead', need = null, limit = 6000) {
    const cand = candidates(cards).map(c => ({ ...c, score: mode === 'open' ? c.value : c.pen + 0.01 * c.cards.length }))
      .sort((a, b) => b.score - a.score);
    const totalPen = cards.reduce((a, c) => a + (mode === 'open' ? 10 : R.handVal(c)), 0);
    let best = { score: 0, melds: [] }, nodes = 0;
    const used = new Set();
    const ok = melds => !need || melds.some(m => m.ids.includes(need));
    if (ok([])) best = { score: 0, melds: [] }; else best = { score: -1, melds: [] };
    const rec = (i, cur, score, left) => {
      if (++nodes > limit) return;
      if (score > best.score && ok(cur) && left >= 1) best = { score, melds: cur.slice() };
      for (let k = i; k < cand.length; k++) {
        const c = cand[k];
        if (c.ids.some(id => used.has(id))) continue;
        if (left - c.ids.length < 1) continue;                 // a card must stay for the discard
        c.ids.forEach(id => used.add(id)); cur.push(c);
        rec(k + 1, cur, score + c.score, left - c.ids.length);
        cur.pop(); c.ids.forEach(id => used.delete(id));
      }
    };
    rec(0, [], 0, cards.length);
    return best;
  }
  // a card can go onto some meld on the table
  const fitsTable = (st, c) => st.melds.some(m => R.canLayOff(st, c, m) || R.canSwap(st, c, m));
  // how close the loose cards are to melds: pairs and near-runs
  function looseScore(cards) {
    let v = 0;
    for (let i = 0; i < cards.length; i++) for (let k = i + 1; k < cards.length; k++) {
      const a = cards[i], b = cards[k];
      if (isJ(a) || isJ(b)) { v += 2; continue; }
      if (a.r === b.r && a.s !== b.s) v += 3;
      else if (a.s === b.s && Math.abs(a.r - b.r) <= 2 && a.r !== b.r) v += Math.abs(a.r - b.r) === 1 ? 3 : 2;
    }
    return v;
  }

  // ---- cards still out there: two of each, minus what I can see (my hand, the table, the discards)
  function seenCounts(st, h) {
    const n = {}; const add = c => { if (!isJ(c)) n[c.s + c.r] = (n[c.s + c.r] || 0) + 1; };
    h.forEach(add); st.melds.forEach(m => m.cards.forEach(add)); st.discard.forEach(add);
    return n;
  }
  // how many unseen cards would turn my loose cards into melds (or lay off on the table)
  function outs(st, loose, seen, opened) {
    const left = (s, r) => { if (r < 1 || r > 13) return 0; return Math.max(0, 2 - (seen[s + r] || 0)); };
    const want = new Map(); const add = (s, r, w = 1) => { if (r >= 1 && r <= 13) want.set(s + ':' + r, Math.max(want.get(s + ':' + r) || 0, w)); };
    const nat = loose.filter(c => !isJ(c));
    for (let i = 0; i < nat.length; i++) for (let k = i + 1; k < nat.length; k++) {
      const a = nat[i], b = nat[k];
      if (a.r === b.r && a.s !== b.s) { for (const s of R.SUITS) if (s !== a.s && s !== b.s) add(s, a.r); }
      else if (a.s === b.s && a.r !== b.r) {
        const lo = Math.min(a.r, b.r), hi = Math.max(a.r, b.r);
        if (hi - lo === 1) { add(a.s, lo - 1); add(a.s, hi + 1); if (lo === 1) add(a.s, 13); if (hi === 13) add(a.s, 1); }
        else if (hi - lo === 2) add(a.s, lo + 1, 1.2);
      }
    }
    if (opened) for (const m of st.melds) for (const sl of m.a.slots) {
      // cards that would extend a meld on the table
      if (m.a.type === 'run') { add(sl.s, sl.r - 1, 0.5); add(sl.s, sl.r + 1, 0.5); }
    }
    let v = 0; for (const [k, w] of want) { const [s, r] = k.split(':'); v += left(s, +r) * w; }
    return v;
  }
  // ---- draw: take the discard only when it can be used this turn (and helps)
  function chooseDraw(st, p, level) {
    const top = st.discard[st.discard.length - 1];
    if (!top) return 'stock';
    if (level === 'novice' && Math.random() < 0.5) return 'stock';
    const h = st.hands[p];
    if (st.opened[p]) {
      if (fitsTable(st, top)) return 'discard';
      const b = bestMelds(h.concat([top]), 'dead', top.id, 3000);
      return b.score > 0 && b.melds.some(m => m.ids.includes(top.id)) ? 'discard' : 'stock';
    }
    const b = bestMelds(h.concat([top]), 'open', top.id, 4000);
    return b.score >= 51 ? 'discard' : 'stock';
  }

  // ---- the rest of the turn: a list of actions ending with a discard
  function planTurn(st, p, level, memo) {
    const acts = [];
    let h = st.hands[p].slice();
    const removeIds = ids => { h = h.filter(c => !ids.includes(c.id)); };
    let opened = st.opened[p];
    const need = st.mustUse;
    // open with 51 or more (Novice sometimes misses it)
    if (!opened) {
      const b = bestMelds(h, 'open', need);
      if (b.score >= 51 && (need || !(level === 'novice' && Math.random() < 0.25))) {
        for (const m of b.melds) { acts.push({ a: 'stage', ids: m.ids }); removeIds(m.ids); }
        acts.push({ a: 'open' }); opened = true;
      }
    }
    // tables melds as they will be after our moves (for lay-off checks)
    const sim = { melds: st.melds.map(m => ({ ...m, cards: m.cards.slice(), a: m.a })) };
    if (opened) {
      // new melds from the hand
      const b = bestMelds(h, 'dead', st.opened[p] ? need : null);
      for (const m of b.melds) { if (h.length - m.ids.length < 1) continue; acts.push({ a: 'meld', ids: m.ids }); sim.melds.push({ id: -acts.length, cards: m.cards, a: R.analyze(m.cards), pending: true }); removeIds(m.ids); }
      // joker swaps where the freed joker can be used at once
      if (level !== 'novice') for (const m of sim.melds) {
        if (m.pending || !R.jokerSlot(m)) continue;
        const c = h.find(x => R.canSwap(st, x, m)); if (!c || h.length < 2) continue;
        const jc = m.cards.find(x => x.id === R.jokerSlot(m).id);
        const rest = h.filter(x => x.id !== c.id).concat([jc]);
        const bb = bestMelds(rest, 'dead', jc.id, 2000);
        if (bb.melds.some(mm => mm.ids.includes(jc.id))) {
          const mm = bb.melds.find(x => x.ids.includes(jc.id));
          if (rest.length - mm.ids.length < 1) continue;
          acts.push({ a: 'swap', id: c.id, meld: m.id });
          m.cards = m.cards.filter(x => x.id !== jc.id).concat([c]); m.a = R.analyze(m.cards);
          h = rest; acts.push({ a: 'meld', ids: mm.ids }); removeIds(mm.ids);
        }
      }
      // lay off whatever fits (keeping one card to discard; jokers only near the end)
      let changed = true;
      while (changed && h.length > 1) {
        changed = false;
        for (const c of h.slice().sort((a, b) => R.handVal(b) - R.handVal(a))) {
          if (h.length <= 1) break;
          if (isJ(c) && h.length > 4 && level !== 'novice') continue;
          if (level === 'novice' && c.id !== need && Math.random() < 0.3) continue;
          const m = sim.melds.find(m => !m.pending && R.canLayOff(st, c, m));
          if (!m) continue;
          acts.push({ a: 'layoff', id: c.id, meld: m.id });
          m.cards = m.cards.concat([c]); m.a = R.analyze(m.cards); removeIds([c.id]); changed = true;
        }
      }
    }
    // a taken discard must have been used: if not, give up the plan and play it safe
    if (need && h.some(c => c.id === need)) return null;
    acts.push({ a: 'discard', id: chooseDiscard(st, p, level, h, opened, memo).id });
    return acts;
  }

  // ---- Cardshark: look one draw ahead – the points left after the next card, averaged over likely draws
  function lookAhead(st, p, rest, seen, samples) {
    const pool = [];
    for (const s of R.SUITS) for (let r = 1; r <= 13; r++) { const k = Math.max(0, 2 - (seen[s + r] || 0)); for (let i = 0; i < k; i++) pool.push({ id: 'la' + s + r + i, s, r }); }
    const jl = 4 - st.melds.reduce((a, m) => a + m.cards.filter(isJ).length, 0) - rest.filter(isJ).length - st.discard.filter(isJ).length;
    for (let i = 0; i < jl; i++) pool.push({ id: 'laX' + i, s: 'X', r: 0 });
    if (!pool.length) return 0;
    let tot = 0;
    for (let k = 0; k < samples; k++) {
      const x = pool[Math.floor(Math.random() * pool.length)], h2 = rest.concat([x]);
      const b = bestMelds(h2, 'dead', null, 500), inM = new Set(b.melds.flatMap(m => m.ids));
      const loose = h2.filter(c => !inM.has(c.id));
      // after drawing I throw away my worst loose card
      const pen = loose.reduce((a, c) => a + R.handVal(c), 0) - (loose.length ? Math.max(...loose.map(c => isJ(c) ? 0 : R.handVal(c))) : 0);
      tot += pen;
    }
    return tot / samples;
  }
  // ---- which card to throw away
  function chooseDiscard(st, p, level, h, opened, memo) {
    const pool = h.filter(c => !isJ(c));
    const opts = pool.length ? pool : h;
    if (opts.length === 1) return opts[0];
    if (level === 'novice') {
      const b = bestMelds(h, 'dead', null, 800), inM = new Set(b.melds.flatMap(m => m.ids));
      const loose = opts.filter(c => !inM.has(c.id));
      const l = loose.length ? loose : opts;
      return l[Math.floor(Math.random() * l.length)];
    }
    const next = (p + 1) % st.n;
    const seen = seenCounts(st, h);
    let best = null, bv = -Infinity;
    for (const c of opts) {
      const rest = h.filter(x => x.id !== c.id);
      const b = bestMelds(rest, 'dead', null, 1500);
      const inM = new Set(b.melds.flatMap(m => m.ids));
      const loose = rest.filter(x => !inM.has(x.id));
      const W = CFG[level];
      // someone is about to go out: get rid of points
      const minOpp = Math.min(...st.hands.map((x, q) => q === p ? 99 : x.length));
      const late = W.late && minOpp <= 3 ? W.late : 1;
      let v = b.score + looseScore(loose) * W.loose + R.handVal(c) * W.val * late;
      if (W.outs) v += outs(st, loose, seen, opened) * W.outs;
      if (W.look) v -= lookAhead(st, p, rest, seen, W.look) * (W.lookW || 1.5);
      if (W.feed && st.opened[next] && fitsTable(st, c)) v -= W.feed;    // don't feed the next player
      if (W.lay && st.opened[p] && fitsTable(st, c)) v -= W.lay;         // keep it to lay off later
      if (W.track && memo) {
        // what the others have been picking up: don't throw them what they collect
        for (let q = 0; q < st.n; q++) if (q !== p) for (const t of st.took[q] || []) {
          if (isJ(t)) continue;
          if (t.r === c.r) v -= q === next ? 8 : 3;
          else if (t.s === c.s && Math.abs(t.r - c.r) <= 2) v -= q === next ? 6 : 2;
        }
      }
      if (v > bv) { bv = v; best = c; }
    }
    return best;
  }
  return { CFG, LEVELS, candidates, bestMelds, chooseDraw, planTurn, chooseDiscard, looseScore };
})();
if (typeof module !== 'undefined') module.exports = RemiAI;
