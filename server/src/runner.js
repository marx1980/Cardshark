// The dealer: runs one online match with the same rules and flow as the app.
// Humans are asked for their moves (with a time limit); a bot plays for anyone who times out or is away.
const E = require('./engine.js');
const AI = require('./ai.js');
const { makeView, rotSeat } = require('./view.js');

const PACE = { bot: 800, trick: 1300, deal: 700, decl: 3200, akuza: 1600, called: 1100 };

// events carry seats and teams; every player gets them from their own chair
function rotEvent(ev, me, st) {
  const r = { ...ev };
  for (const k of ['seat', 'winner']) if (typeof r[k] === 'number') r[k] = rotSeat(r[k], me);
  const swap = st.seats.length === 2 ? me === 2 : me % 2 === 1;
  if (typeof r.team === 'number' && swap) r.team = 1 - r.team;
  if (Array.isArray(r.pts) && r.pts.length === 2 && swap) r.pts = [r.pts[1], r.pts[0]];
  return r;
}

// engine state <-> JSON (the engine keeps a couple of Sets of card ids)
const ser = st => JSON.stringify(st, (k, v) => v instanceof Set ? { __set: [...v] } : v);
const deser = j => JSON.parse(j, (k, v) => v && typeof v === 'object' && Array.isArray(v.__set) ? new Set(v.__set) : v);

class Runner {
  // io: { sleep(ms), send(seat, msg), ask(seat, req) -> Promise<answer|null>, level(seat), waitNext(ms), isHuman(seat) }
  constructor(game, opts, io, saved = null) { this.game = game; this.opts = opts; this.io = io; this.st = null; this.turn = null; this.saved = saved; }
  // a checkpoint the table keeps in storage, so a restarted server can carry on from here
  async checkpoint(at) { if (this.io.save) await this.io.save({ at, st: ser(this.st), turn: this.turn }); }

  emit(ev) {
    for (const s of [0, 1, 2, 3]) {
      const view = makeView(this.st, s);
      view.turn = this.turn === null ? null : rotSeat(this.turn, s);
      this.io.send(s, { t: 'ev', ev: rotEvent(ev, s, this.st), view });
    }
  }
  snapshot(seat) {
    if (!this.st || !this.st.hands) return null;
    const view = makeView(this.st, seat); view.turn = this.turn === null ? null : rotSeat(this.turn, seat);
    return view;
  }

  // a move from a human (validated) or from the bot standing in for that seat
  async decide(seat, kind, legal, extra = {}) {
    const st = this.st, g = this.game;
    if (this.io.isHuman(seat)) {
      const req = { kind, legal: legal ? legal.map(c => c.id) : undefined, ...extra };
      const a = await this.io.ask(seat, req);
      if (a) {
        if (kind === 'bid') { if (Number.isInteger(a.suit) && a.suit >= -1 && a.suit <= 3 && !(a.suit < 0 && extra.dealer)) return { suit: a.suit }; }
        else {
          const card = legal.find(c => c.id === a.card);
          if (card) {
            const out = { card };
            if (g === 'h') out.bela = a.bela !== false;
            if (g === 't' && a.sig && (extra.sigs || []).includes(a.sig)) out.sig = a.sig;
            return out;
          }
        }
      }
    }
    // bot (or a human who ran out of time / is away)
    const level = this.io.level(seat);
    await this.io.sleep(this.io.isHuman(seat) ? 50 : PACE.bot);
    if (kind === 'bid') return { suit: AI.bid(st, seat, level) };
    const card = AI.play(g, st, seat, level, { timeMs: 1500 });
    const out = { card };
    if (g === 'h') out.bela = E.hBelaEligible(st, seat, card) ? AI.callBela(st, seat, level) : true;
    if (g === 't') out.sig = E.tAISignal(st, seat, card);
    return out;
  }

  async run() {
    const g = this.game, o = this.opts;
    if (g === 'b') this.st = E.bNew({ players: o.players || 4, solo: !!o.solo, double: !!o.double, target: o.target || 3, reveal: false });
    else if (g === 't') this.st = E.tNew({ players: o.players || 4, target: o.target || 41, akuze: o.akuze !== false, longNap: !!o.longNap, thirdsToLast: !!o.thirdsToLast, signals: o.signals !== false, clockwise: !!o.clockwise });
    else this.st = E.hNew({ target: o.target || 1001 });
    let cont = null;
    if (this.saved) { this.st = deser(this.saved.st); cont = this.saved.at; this.saved = null; }
    else this.st.dealer = this.st.seats[Math.floor(Math.random() * this.st.seats.length)];
    const st = this.st;
    while (true) {
      const mid = cont === 'turn' || cont === 'bid';
      if (!mid) st.dealer = E.nextSeat(st, st.dealer);
      cont = null;
      const res = g === 'b' ? await this.briskulaHand(mid) : g === 't' ? await this.tresetaHand(mid) : await this.belaHand(mid);
      if (res.matchWinner >= 0) { this.turn = null; this.emit({ k: 'matchEnd', team: res.matchWinner }); return res.matchWinner; }
      await this.checkpoint('handEnd');
      await this.io.waitNext(12000);
    }
  }

  async playTrick(play, finish, over) {
    const st = this.st;
    while (!over()) {
      const s = this.game === 'b' ? E.bToPlay(st) : this.game === 't' ? E.tToPlay(st) : E.hToPlay(st);
      this.turn = s; this.emit({ k: 'turn', seat: s });
      await this.checkpoint('turn');
      const done = await play(s);
      if (done) {
        this.turn = null;
        await this.io.sleep(PACE.trick);
        const r = finish();
        this.emit({ k: 'collect', winner: r.winner, draws: r.draws ? r.draws.length : 0 });
        await this.io.sleep(450);
      }
    }
    this.turn = null;
  }

  async briskulaHand(cont) {
    const st = this.st;
    if (!cont) { E.bDeal(st); this.turn = null; this.emit({ k: 'deal' }); await this.io.sleep(PACE.deal); }
    await this.playTrick(async s => {
      const { card } = await this.decide(s, 'play', st.hands[s].slice());
      const done = E.bPlay(st, s, card);
      this.emit({ k: 'play', seat: s, card });
      return done;
    }, () => E.bFinishTrick(st), () => E.bHandOver(st));
    const pts = E.bPoints(st);
    let team = -1;
    if (pts[0] !== pts[1]) { team = pts[0] > pts[1] ? 0 : 1; st.wins[team]++; }
    st.history.push(pts);
    const over = st.wins.some(w => w >= st.opts.target);
    const mw = over ? (st.wins[0] > st.wins[1] ? 0 : 1) : -1;
    this.emit({ k: 'handEnd', pts, team, over });
    return { matchWinner: mw };
  }

  async tresetaHand(cont) {
    const st = this.st;
    if (!cont) { E.tDeal(st); this.turn = null; this.emit({ k: 'deal' }); await this.io.sleep(PACE.deal); }
    if (!cont) for (const s of E.roundFrom(st, st.leader)) {
      if (!st.akuze[s].length) continue;
      this.emit({ k: 'akuza', seat: s, ds: st.akuze[s] }); await this.io.sleep(PACE.akuza);
    }
    await this.playTrick(async s => {
      const lead = st.trick.length === 0;
      const sigs = st.opts.signals ? (lead ? ['kucam', 'strisco'] : ['volo', 'strisco']) : [];
      const a = await this.decide(s, 'play', E.tLegal(st, s), { sigs });
      const sig = st.opts.signals ? (a.sig || null) : null;
      const done = E.tPlay(st, s, a.card, sig);
      this.emit({ k: 'play', seat: s, card: a.card, sig });
      return done;
    }, () => E.tFinishTrick(st), () => E.tHandOver(st));
    const r = E.tScoreHand(st);
    const mw = E.tMatchWinner(st);
    this.emit({ k: 'handEnd', row: r, over: mw >= 0 });
    return { matchWinner: mw };
  }

  async belaHand(cont) {
    const st = this.st;
    if (!cont) { E.hDeal(st); st.phase = 'bid'; this.turn = null; this.emit({ k: 'deal' }); await this.io.sleep(PACE.deal); }
    const bidding = st.phase === 'bid';
    let called = !bidding;
    while (!called) {
      const s = st.bidder; this.turn = s; this.emit({ k: 'turn', seat: s, bid: true });
      await this.checkpoint('bid');
      const { suit } = await this.decide(s, 'bid', null, { dealer: s === st.dealer });
      const sv = s === st.dealer && suit < 0 ? 0 : suit;
      called = E.hBid(st, s, sv);
      this.emit({ k: 'bid', seat: s, suit: sv });
      if (!called) await this.io.sleep(300);
    }
    const D = st.decls;
    if (bidding) {
    st.phase = 'play'; this.turn = null;
    this.emit({ k: 'called', seat: st.caller, suit: st.trump }); await this.io.sleep(PACE.called);
    if (D.belotSeat !== null) {
      const w = D.belotSeat % 2;
      st.score[w] = Math.max(st.score[w], st.opts.target);
      this.emit({ k: 'belot', seat: D.belotSeat });
      await this.io.sleep(2500);
      return { matchWinner: w };
    }
    for (const s of D.order) {
      const ds = D.per[s]; if (!ds.length || s % 2 !== D.team) continue;
      this.emit({ k: 'decl', seat: s, ds: ds.filter(d => d.type !== 'belot') }); await this.io.sleep(PACE.decl);
    }
    }
    await this.playTrick(async s => {
      const legal = E.hLegal(st, s);
      const belaIds = legal.filter(c => E.hBelaEligible(st, s, c)).map(c => c.id);
      const a = await this.decide(s, 'play', legal, { bela: belaIds });
      const r = E.hPlay(st, s, a.card, a.bela);
      this.emit({ k: 'play', seat: s, card: a.card, bela: r.bela });
      return r.done;
    }, () => E.hFinishTrick(st), () => E.hHandOver(st));
    const row = E.hScoreHand(st);
    const mw = E.hMatchWinner(st);
    this.emit({ k: 'handEnd', over: mw >= 0 });
    return { matchWinner: mw };
  }
}
module.exports = { Runner, PACE, ser, deser };
