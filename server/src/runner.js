// The dealer: runs one online match with the same rules and flow as the app.
// Humans are asked for their moves (with a time limit); a bot plays for anyone who times out or is away.
const E = require('./engine.js');
const AI = require('./ai.js');
const { makeView, rotSeat } = require('./view.js');
const Poker = require('./poker.js');
const Remi = require('./remi.js');
const RemiAI = require('./remibot.js');
const Unico = require('./unico.js');

const PACE = { bot: 800, trick: 1800, deal: 700, decl: 3200, akuza: 1600, called: 1100 };
const relSeat = (seat, viewer, n) => ((seat - viewer) % n + n) % n;
const absSeat = (seat, viewer, n) => ((seat + viewer) % n + n) % n;

// events carry seats and teams; every player gets them from their own chair
function rotEvent(ev, me, st) {
  const r = { ...ev };
  const n = st.n || 4, rotate = s => ((s - me) % n + n) % n;
  const rotateArray = a => Array.isArray(a) ? Array.from({ length: a.length }, (_, k) => a[(me + k) % a.length]) : a;
  for (const k of ['seat', 'winner', 'by', 'trumpTo']) if (typeof r[k] === 'number' && r[k] >= 0) r[k] = rotate(r[k]);
  const swap = ['p', 'r', 'l'].includes(st.game) ? false : (st.seats.length === 2 ? me === 2 : me % 2 === 1);
  if (typeof r.team === 'number' && r.team >= 0) {
    if (st.teams > 2) r.team = (r.team - st.seats.indexOf(me) + st.teams) % st.teams;
    else if (swap) r.team = 1 - r.team;
  }
  if (Array.isArray(r.pts) && st.teams > 2) {
    const order = st.seats.slice(st.seats.indexOf(me)).concat(st.seats.slice(0, st.seats.indexOf(me)));
    r.pts = order.map(s => r.pts[st.seats.indexOf(s)]);
  }
  if (Array.isArray(r.pts) && r.pts.length === 2 && swap) r.pts = [r.pts[1], r.pts[0]];
  if (st.n) {
    if (Array.isArray(r.scores)) r.scores = rotateArray(r.scores);
    if (r.result && typeof r.result === 'object') {
      r.result = { ...r.result };
      if (typeof r.result.winner === 'number' && r.result.winner >= 0) r.result.winner = rotate(r.result.winner);
      if (Array.isArray(r.result.pts)) r.result.pts = rotateArray(r.result.pts);
      if (Array.isArray(r.result.won)) r.result.won = rotateArray(r.result.won);
      if (r.result.scores && !Array.isArray(r.result.scores)) r.result.scores = Object.fromEntries(Object.entries(r.result.scores).map(([s, v]) => [rotate(+s), v]));
      if (Array.isArray(r.result.pots)) r.result.pots = r.result.pots.map(p => ({ ...p, elig: (p.elig || []).map(rotate), winners: p.winners && p.winners.map(rotate) }));
    }
  }
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
    const seats = Array.isArray(this.st.seats) && this.st.seats.every(Number.isInteger)
      ? this.st.seats : Array.from({ length: this.st.n || 4 }, (_, i) => i);
    for (const s of seats) {
      const view = makeView(this.st, s);
      const n = this.st.n || 4;
      view.turn = this.turn === null ? null : ((this.turn - s) % n + n) % n;
      this.io.send(s, { t: 'ev', ev: rotEvent(ev, s, this.st), view });
    }
  }
  snapshot(seat) {
    if (!this.st || (!this.st.hands && this.game !== 'p')) return null;
    const n = this.st.n || 4;
    const view = makeView(this.st, seat); view.turn = this.turn === null ? null : ((this.turn - seat) % n + n) % n;
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
    if (g === 'p') return this.pokerMatch();
    if (g === 'r') return this.remiMatch();
    if (g === 'l') return this.unicoMatch();
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

  async getAction(seat, req, bot) {
      this.fromHuman = false;
      if (this.io.isHuman(seat)) {
        const a = await this.io.ask(seat, req);
        if (a && typeof a === 'object') { this.fromHuman = true; return a; }
      }
      const pace = this.game === 'l' ? ({ slow: 1300, normal: PACE.bot, fast: 400 }[this.opts.pace] || PACE.bot) : PACE.bot;
      await this.io.sleep(this.io.isHuman(seat) ? 50 : pace);
      return bot();
    }

    async pokerMatch() {
      let resumed = !!this.saved;
      const st = this.st = resumed ? deser(this.saved.st) : Poker.newMatch(this.opts);
      this.saved = null;
      if (!resumed) st.seats = Array.from({ length: st.n }, (_, i) => ({ ...st.seats[i], name: this.io.name ? this.io.name(i) : '' }));
      while (Poker.alive(st).length > 1) {
        if (!resumed || st.street === 'show') {
          if (resumed) await this.io.waitNext(5000);
          Poker.startHand(st); this.turn = st.toAct; this.emit({ k: 'deal', handNo: st.handNo });
        }
        resumed = false;
        while (st.street !== 'show') {
          const seat = st.toAct; if (seat < 0) { st.street = 'show'; break; }
          this.turn = seat; this.emit({ k: 'turn', seat }); await this.checkpoint('turn');
          const request = st.street === 'draw'
            ? { kind: 'pokerDraw', variant: st.variant, max: Poker.maxDraw(st.seats[seat].hand), handSize: st.seats[seat].hand.length }
            : { kind: 'pokerAction', variant: st.variant, street: st.street, options: Poker.options(st, seat), toCall: Poker.toCall(st, seat), pot: Poker.pot(st), minRaise: Poker.options(st, seat).minTo, maxRaise: Poker.options(st, seat).maxTo };
          let a = await this.getAction(seat, request, () => Poker.bot(st, seat));
          try {
            if (st.street === 'draw') Poker.discard(st, seat, Array.isArray(a.draw) ? a.draw : Array.isArray(a.discard) ? a.discard : Array.isArray(a.indices) ? a.indices : (() => { throw Error('draw'); })());
            else Poker.act(st, seat, { action: a.action || a.kind || a.move || a.act, to: a.to });
          } catch (_) {
            a = Poker.bot(st, seat);
            if (st.street === 'draw') Poker.discard(st, seat, a.draw || []);
            else Poker.act(st, seat, { action: a.action, to: a.to });
          }
          this.emit({ k: 'action', seat, action: st.seats[seat].last, street: st.street });
        }
        this.turn = null;
        this.emit({ k: 'handEnd', handNo: st.handNo, result: st.result, champion: st.champion === undefined ? null : st.champion });
        if (st.champion !== undefined) {
          this.emit({ k: 'matchEnd', winner: st.champion, scores: st.seats.map(s => s.chips) });
          return st.champion;
        }
        await this.checkpoint('handEnd'); await this.io.waitNext(5000);
      }
      const winner = Poker.alive(st)[0]; this.emit({ k: 'matchEnd', winner }); return winner;
    }

    async remiMatch() {
      const resumed = !!this.saved;
      const st = this.st = resumed ? deser(this.saved.st) : Remi.newMatch(this.opts);
      this.saved = null;
      let first = !resumed;
      while (true) {
        if (!first) await this.io.waitNext(5000);
        first = false;
        if (!st.hands || st.winner !== null) { this.remiAvoid = {}; Remi.newRound(st); this.turn = st.turn; this.emit({ k: 'deal', round: st.round }); }
        while (st.winner === null) {
          const seat = st.turn; this.turn = seat; this.emit({ k: 'turn', seat }); await this.checkpoint('turn');
          const req = { kind: 'remi', phase: st.phase, opened: st.opened[seat], handSize: st.hands[seat].length,
            canTake: st.phase === 'draw' && st.discard.length > 0, melds: st.melds.map(m => ({ id: m.id, owner: relSeat(m.owner, seat, st.n) })) };
          let a = await this.getAction(seat, req, () => this.remiBotAction(st, seat));
          try { this.applyRemiAction(st, seat, a); }
          catch (e) {
            // an illegal move from a player is refused and the turn is asked again; only a bot's (or an absent player's) fallback is replaced
            if (this.fromHuman) { this.io.send(seat, { t: 'reject', rule: String(e && e.rule || 'bad') }); continue; }
            this.remiPlan = null; a = this.remiBotAction(st, seat); this.applyRemiAction(st, seat, a);
          }
          this.emit({ k: 'action', seat, action: a.action || a.a, winner: st.winner });
        }
        this.turn = null; this.emit({ k: 'handEnd', result: st.result, over: st.matchOver });
        if (st.matchOver) {
          const winner = Remi.champion(st); this.emit({ k: 'matchEnd', winner, scores: st.scores.slice() }); return winner;
        }
        await this.checkpoint('handEnd');
      }
    }

    applyRemiAction(st, seat, a) {
      const action = a.action || a.act || a.move || a.type;
      if (action === 'stock') return Remi.drawStock(st, seat);
      if (action === 'take') return Remi.takeDiscard(st, seat);
      if (action === 'untake') return Remi.undoTake(st, seat);
      if (action === 'stage') return Remi.stage(st, seat, a.ids);
      if (action === 'unstage') return Remi.unstage(st, seat, a.index ?? a.i);
      if (action === 'open') return Remi.open(st, seat);
      if (action === 'meld') return Remi.meld(st, seat, a.ids);
      if (action === 'layoff') return Remi.layOff(st, seat, a.id, a.meld);
      if (action === 'swap') return Remi.swapJoker(st, seat, a.id, a.meld);
      if (action === 'discard') return Remi.discard(st, seat, a.id);
      throw Error('action');
    }

    // a bot's turn, one step per call: it draws, then plays out a plan worked out once for the turn (same bots as the app)
    remiBotAction(st, p) {
      const lv = this.io.level(p) || 'average', RA = RemiAI;
      this.remiAvoid = this.remiAvoid || {};
      if (st.phase === 'draw') {
        this.remiPlan = null;
        const top = st.discard[st.discard.length - 1];
        if (top && this.remiAvoid[p] !== top.id && RA.chooseDraw(st, p, lv) === 'discard') return { action: 'take' };
        return { action: 'stock' };
      }
      if (!this.remiPlan || this.remiPlan.p !== p) {
        let plan = null;
        try { plan = RA.planTurn(st, p, lv, lv === 'cardshark'); } catch (_) { }
        if (!plan && st.mustUse && st.hands[p].some(c => c.id === st.mustUse) && !st.staged.length) { this.remiAvoid[p] = st.mustUse; return { action: 'untake' }; }
        this.remiPlan = { p, acts: plan ? plan.slice() : [] };
      }
      const x = this.remiPlan.acts.shift();
      if (x) return { ...x, action: x.a };
      this.remiPlan = null;
      if (st.staged.length) return Remi.stagedValue(st) >= 51 ? { action: 'open' } : { action: 'unstage', index: st.staged.length - 1 };
      const h = st.hands[p].filter(c => c.id !== st.mustUse && c.id !== st.swapped);
      const d = (h.length ? h : st.hands[p]).slice().sort((u, v) => Remi.handVal(v) - Remi.handVal(u))[0];
      return { action: 'discard', id: d.id };
    }

    async unicoMatch() {
      const resumed = !!this.saved;
      const st = this.st = resumed ? deser(this.saved.st) : Unico.newMatch(this.opts);
      this.saved = null;
      let first = !resumed;
      while (true) {
        if (!first) await this.io.waitNext(5000);
        first = false;
        if (!st.hands || st.winner !== null) { Unico.newRound(st); this.turn = st.turn; this.emit({ k: 'deal', round: st.round }); }
        while (st.winner === null) {
          if (st.mustChooseColor !== null && st.mustChooseColor !== undefined) {
            const p = st.mustChooseColor; this.turn = p; this.emit({ k: 'turn', seat: p });
            const a = await this.getAction(p, { kind: 'unoColor', colors: Unico.COLORS[st.side] }, () => Unico.bot(st, p));
            const color = Unico.COLORS[st.side].includes(a.color) ? a.color : Unico.bestColor(st, p);
            st.color = color; st.mustChooseColor = null; this.emit({ k: 'color', seat: p, color }); continue;
          }
          if (st.pendingChallenge) {
            const p = st.pendingChallenge.to; this.turn = p; this.emit({ k: 'turn', seat: p });
            const a = await this.getAction(p, { kind: 'unoChallenge', from: relSeat(st.pendingChallenge.from, p, st.n), cards: st.pendingChallenge.k }, () => Unico.bot(st, p));
            Unico.resolveChallenge(st, a.challenge === true || a.action === 'challenge'); this.emit({ k: 'challenge', seat: p }); continue;
          }
          const p = st.turn; this.turn = p; this.emit({ k: 'turn', seat: p }); await this.checkpoint('turn');
          const catchTargets = st.hands.map((_, q) => q).filter(q => q !== p && st.hands[q].length === 1 && !st.uno[q]);
          const catchTargetView = catchTargets.map(q => relSeat(q, p, st.n));
          const a = await this.getAction(p, { kind: 'unico', legal: Unico.legal(st, p).map(c => c.id), canDraw: true, pending: st.pending, side: st.side, catchTargets: catchTargetView }, () => Unico.bot(st, p));
          if ((a.action === 'uno' || a.callUno) && st.hands[p].length === 1 && !st.uno[p]) {
            Unico.callUno(st, p); this.emit({ k: 'uno', seat: p }); continue;
          }
          if ((a.action === 'catch' || a.catch) && catchTargetView.includes(a.target)) {
            const target = this.io.isHuman(p) ? absSeat(a.target, p, st.n) : a.target;
            Unico.catchUno(st, target); this.emit({ k: 'catch', seat: target, by: p }); continue;
          }
          let played = false;
          if ((a.action === 'draw' || a.draw) && !st.pending) {
            const d = Unico.drawTurn(st, p); this.emit({ k: 'draw', seat: p, count: d.cards.length });
            if (d.playable && !d.ended) {
              const next = await this.getAction(p, { kind: 'unicoDrawn', legal: [d.playable.id], card: d.playable.id }, () => Unico.bot(st, p));
              if (next.action === 'play' && next.card === d.playable.id) {
                const sevenTarget = this.io.isHuman(p) && Number.isInteger(next.sevenTarget) ? absSeat(next.sevenTarget, p, st.n) : next.sevenTarget;
                try { Unico.play(st, p, d.playable.id, next.color || Unico.bestColor(st, p), sevenTarget); played = true; if (next.uno) Unico.callUno(st, p); }
                catch (_) { Unico.passAfterDraw(st, p); }
              } else Unico.passAfterDraw(st, p);
            }
          } else if (st.pending && (a.action === 'draw' || a.draw)) {
            const d = Unico.drawTurn(st, p); this.emit({ k: 'draw', seat: p, count: d.cards.length, penalty: true });
          } else {
            const id = a.card;
            const sevenTarget = this.io.isHuman(p) && Number.isInteger(a.sevenTarget) ? absSeat(a.sevenTarget, p, st.n) : a.sevenTarget;
            try { Unico.play(st, p, id, a.color, sevenTarget); played = true; }
            catch (_) {
              const b = Unico.bot(st, p);
              if (b.action === 'draw') { const d = Unico.drawTurn(st, p); if (d.playable) Unico.passAfterDraw(st, p); }
              else { Unico.play(st, p, b.card, b.color, b.sevenTarget); played = true; }
              if (b.uno) Unico.callUno(st, p);
            }
            if (a.uno === true) Unico.callUno(st, p);
          }
          this.emit({ k: 'play', seat: p });
          if (played && st.winner === null && this.opts.jumpIn && !st.pendingChallenge && !st.pending) await this.unicoJumpWindow(st);
        }
        this.turn = null; this.emit({ k: 'handEnd', result: st.result, over: st.matchOver });
        if (st.matchOver) { const winner = st.scores.indexOf(Math.max(...st.scores)); this.emit({ k: 'matchEnd', winner, scores: st.scores.slice() }); return winner; }
        await this.checkpoint('handEnd');
      }
    }

  async unicoJumpWindow(st) {
    if (st.winner !== null || !st.opts.jumpIn) return;
    const current = st.turn;
    const order = Array.from({ length: st.n }, (_, k) => (current + k + 1) % st.n);
    for (const seat of order) {
      if (seat === current || st.winner !== null) continue;
      const legal = Unico.jumpInCards(st, seat);
      if (!legal.length) continue;
      const targets = st.opts.sevenO ? st.hands.map((_, i) => i).filter(i => i !== seat) : [];
      const targetView = targets.map(i => relSeat(i, seat, st.n));
      let answer = null;
      if (this.io.isHuman(seat)) {
        if (this.io.askQuick) answer = await this.io.askQuick(seat, { kind: 'unicoJump', legal: legal.map(c => c.id), sevenTargets: targetView }, 700);
      } else if (Math.random() < ({ novice: 0.2, average: 0.5, pro: 0.85, cardshark: 1 }[this.io.level(seat)] || 0.5)) {
        const seven = legal.some(c => Unico.face(st, c).k === 'n' && Unico.face(st, c).n === 7) && st.hands[seat].length > 1;
        answer = { card: legal[0].id, sevenTarget: seven ? targets.sort((a, b) => st.hands[a].length - st.hands[b].length)[0] : undefined };
      }
      if (!answer || !legal.some(c => c.id === answer.card)) continue;
      const card = legal.find(c => c.id === answer.card), seven = st.opts.sevenO && Unico.face(st, card).k === 'n' && Unico.face(st, card).n === 7 && st.hands[seat].length > 1;
      if (this.io.isHuman(seat) && Number.isInteger(answer.sevenTarget)) answer = { ...answer, sevenTarget: absSeat(answer.sevenTarget, seat, st.n) };
      if (seven && !targets.includes(answer.sevenTarget)) continue;
      st.turn = seat;
      try { Unico.play(st, seat, answer.card, null, answer.sevenTarget); } catch (_) { continue; }
      if (answer.uno || (!this.io.isHuman(seat) && st.hands[seat].length === 1)) Unico.callUno(st, seat);
      this.emit({ k: 'jump', seat, card: answer.card });
      return this.unicoJumpWindow(st);
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
        const tc = this.game === 'b' ? st.trumpCard : null;
        const r = finish();
        const lastDraw = r.draws && r.draws[r.draws.length - 1];
        const tk = tc && st.stock.length === 0 && lastDraw && lastDraw.card.id === tc.id ? lastDraw : null;
        this.emit({ k: 'collect', winner: r.winner, draws: r.draws ? r.draws.length : 0, ...(tk ? { trumpTo: tk.seat } : {}) });
        await this.io.sleep(tk ? 3600 : 450);
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
