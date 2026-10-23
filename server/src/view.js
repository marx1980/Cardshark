// What one player may see, seen from their own chair (they are always seat 0 on their screen).
// Hidden cards are replaced by placeholders; seats and team-indexed values are rotated.
const HIDDEN = { id: 'x', hidden: true };
function makeView(st, me) {
  const k = me, rot = s => (s === null || s === undefined || s < 0) ? s : ((s - k) % 4 + 4) % 4;
  const swap = k % 2 === 1;                                // my team becomes team 0
  const tm = a => (Array.isArray(a) && a.length === 2 && swap) ? [a[1], a[0]] : (Array.isArray(a) ? a.slice() : a);
  const tmIdx = t => (t === 0 || t === 1) && swap ? 1 - t : t;
  const keyed = (o, f = x => x) => { if (!o) return o; const r = {}; for (const s in o) r[rot(+s)] = f(o[s], +s); return r; };
  const v = {
    game: st.game, opts: st.opts, teams: st.teams, phase: st.phase,
    seats: st.seats.map(rot), dealer: rot(st.dealer), leader: rot(st.leader),
    trump: st.trump === undefined ? null : st.trump, trickNo: st.trickNo,
    trick: (st.trick || []).map(t => ({ seat: rot(t.seat), card: t.card })),
    hands: keyed(st.hands, (h, s) => s === me ? h.slice() : h.map(() => HIDDEN)),
    lastTrick: st.lastTrick ? { ...st.lastTrick, winner: rot(st.lastTrick.winner), trick: st.lastTrick.trick.map(t => ({ seat: rot(t.seat), card: t.card })) } : null,
    lastWinner: rot(st.lastWinner),
    score: tm(st.score), wins: tm(st.wins), tricks: tm(st.tricks), history: (st.history || []).map(tm),
    names: null,
  };
  if (st.game === 'b') {
    v.trumpCard = st.trumpCard; v.removed = st.removed;
    v.stock = st.stock ? st.stock.map((c, i) => i === 0 ? c : HIDDEN) : [];   // stock[0] is the face-up trump card
  }
  if (st.game === 't') {
    v.stock = st.stock ? st.stock.map(() => HIDDEN) : [];
    v.akuze = keyed(st.akuze, a => a);
    v.signals = (st.signals || []).map(g => ({ ...g, seat: rot(g.seat) }));
    v.rows = (st.rows || []).map(r => ({ ...r, thirds: tm(r.thirds), cardPts: tm(r.cardPts), akuze: tm(r.akuze), add: tm(r.add), score: tm(r.score) }));
  }
  if (st.game === 'h') {
    v.caller = rot(st.caller); v.bidder = rot(st.bidder);
    v.bids = (st.bids || []).map(b => ({ seat: rot(b.seat), suit: b.suit }));
    v.belaSeat = st.belaCalled ? rot(st.belaSeat) : null; v.belaCalled = st.belaCalled;
    v.hang = st.hang;
    if (st.decls) {
      // only the pair whose declarations count shows them
      const D = st.decls, per = {};
      for (const s of D.order) per[rot(s)] = D.team >= 0 && s % 2 === D.team ? D.per[s].filter(d => d.type !== 'belot') : [];
      v.decls = { per, order: D.order.map(rot), team: tmIdx(D.team), total: D.total, belotSeat: rot(D.belotSeat) };
    } else v.decls = null;
    v.rows = (st.rows || []).map(r => ({ ...r, caller: rot(r.caller), cardPts: tm(r.cardPts), pts: tm(r.pts), declPts: tm(r.declPts), tot: tm(r.tot), add: tm(r.add), stiglja: tmIdx(r.stiglja), score: tm(r.score) }));
  }
  return v;
}
module.exports = { makeView, rotSeat: (s, me) => ((s - me) % 4 + 4) % 4, rotTeam: (t, me) => (me % 2 && (t === 0 || t === 1)) ? 1 - t : t };
