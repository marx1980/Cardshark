// Cardshark online: one Worker routing requests, and three kinds of Durable Objects:
//  Table    – one per table: seats, the live match (Runner), turn timers, bot takeover
//  Lobby    – the list of open tables
//  Registry – player records (name, rating, wins/losses per game)
import runnerMod from './runner.js';
const { Runner } = runnerMod;

const LEVELS = ['novice', 'average', 'pro', 'cardshark'];
// strength of each level per game (Elo, from 1,000-match simulations); new players start at Average
const TIER = {
  b: { novice: 1000, average: 1134, pro: 1228, cardshark: 1314 },
  t: { novice: 1000, average: 1144, pro: 1237, cardshark: 1389 },
  h: { novice: 1000, average: 1109, pro: 1255, cardshark: 1345 },
};
let TURN_MS = 30000;          // time to play before the bot takes the turn (env TURN_MS overrides, for testing)
const STALE_MS = 30 * 60e3;   // waiting tables disappear after 30 minutes

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const clean = s => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, 16) || 'Player';
const nearestLevel = (g, r) => LEVELS.reduce((a, b) => Math.abs(TIER[g][b] - r) < Math.abs(TIER[g][a] - r) ? b : a);

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const lobby = env.LOBBY.get(env.LOBBY.idFromName('lobby'));
    const registry = env.REGISTRY.get(env.REGISTRY.idFromName('registry'));
    if (p === '/api/tables' && req.method === 'GET') return lobby.fetch('https://do/list');
    if (p === '/api/tables' && req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (!['b', 't', 'h'].includes(b.game)) return json({ error: 'game' }, 400);
      const id = rid();
      const t = env.TABLE.get(env.TABLE.idFromName(id));
      const r = await t.fetch('https://do/init', { method: 'POST', body: JSON.stringify({ id, game: b.game, opts: b.opts || {}, host: String(b.pid || ''), hostName: clean(b.name) }) });
      return json(await r.json());
    }
    let m = p.match(/^\/api\/table\/([a-z0-9]{4})\/ws$/);
    if (m) return env.TABLE.get(env.TABLE.idFromName(m[1])).fetch(req);
    m = p.match(/^\/api\/player\/([a-f0-9]{8,64})$/);
    if (m && req.method === 'GET') return registry.fetch('https://do/get?pid=' + m[1]);
    if (p === '/api/health') return json({ ok: true });
    return json({ error: 'not found' }, 404);
  },
};

// ------------------------------------------------------------------ Lobby
export class Lobby {
  constructor(state) { this.state = state; }
  async fetch(req) {
    const url = new URL(req.url);
    let tables = (await this.state.storage.get('tables')) || {};
    const now = Date.now();
    for (const id in tables) if (now - tables[id].updated > (tables[id].status === 'waiting' ? STALE_MS : 4 * 3600e3)) delete tables[id];
    if (url.pathname === '/upsert') { const t = await req.json(); tables[t.id] = { ...t, updated: now }; }
    else if (url.pathname === '/remove') { const t = await req.json(); delete tables[t.id]; }
    await this.state.storage.put('tables', tables);
    if (url.pathname === '/list') return json({ tables: Object.values(tables).filter(t => t.status === 'waiting').sort((a, b) => b.updated - a.updated) });
    return json({ ok: true });
  }
}

// ------------------------------------------------------------------ Registry (player records)
export class Registry {
  constructor(state) { this.state = state; }
  blank(name) { return { name, r: { ...Object.fromEntries(Object.entries(TIER).map(([g, t]) => [g, t.average])) }, w: { b: 0, t: 0, h: 0 }, l: { b: 0, t: 0, h: 0 } }; }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/get') {
      const pid = url.searchParams.get('pid');
      return json((await this.state.storage.get('p:' + pid)) || this.blank('Player'));
    }
    if (url.pathname === '/many') {           // ratings for a table
      const { pids } = await req.json(); const out = {};
      for (const pid of pids) out[pid] = (await this.state.storage.get('p:' + pid)) || this.blank('Player');
      return json(out);
    }
    if (url.pathname === '/result') {         // { game, teams: [[pid...],[pid...]], botR: [r0, r1] per team for bot seats, winner, names }
      const b = await req.json(), g = b.game, K = 24;
      const recs = {};
      for (const team of b.teams) for (const s of team) if (s.pid) recs[s.pid] = (await this.state.storage.get('p:' + s.pid)) || this.blank(s.name);
      const teamR = b.teams.map(team => team.reduce((x, s) => x + (s.pid ? recs[s.pid].r[g] : s.r), 0) / team.length);
      const changes = {};
      b.teams.forEach((team, i) => {
        const exp = 1 / (1 + Math.pow(10, (teamR[1 - i] - teamR[i]) / 400)), score = b.winner === i ? 1 : 0;
        for (const s of team) if (s.pid) {
          const rec = recs[s.pid]; rec.name = s.name;
          const d = Math.round(K * (score - exp));
          rec.r[g] += d; if (score) rec.w[g]++; else rec.l[g]++;
          changes[s.pid] = { d, r: rec.r[g] };
        }
      });
      for (const pid in recs) await this.state.storage.put('p:' + pid, recs[pid]);
      return json(changes);
    }
    return json({ error: 'not found' }, 404);
  }
}

// ------------------------------------------------------------------ Table
export class Table {
  constructor(state, env) {
    this.state = state; this.env = env; if (env.TURN_MS) TURN_MS = +env.TURN_MS;
    this.info = null;            // { id, game, opts, host, status, seats: [{pid,name}|null x4] }
    this.socks = new Map();      // pid -> ws
    this.asks = new Map();       // seat -> { resolve, timer, req }
    this.away = new Set();       // seats whose player timed out (bot plays until they act again)
    this.levels = {};            // seat -> bot level
    this.nextVotes = null; this.runner = null; this.ratings = {};
  }
  lobby() { return this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby')); }
  registry() { return this.env.REGISTRY.get(this.env.REGISTRY.idFromName('registry')); }
  async load() { if (!this.info) this.info = (await this.state.storage.get('info')) || null; }
  async save() { await this.state.storage.put('info', this.info); }
  publicInfo() { const i = this.info; return { id: i.id, game: i.game, opts: i.opts, host: i.host, hostName: i.hostName, status: i.status, seats: i.seats.map(s => s ? { name: s.name, bot: !!s.bot, level: s.level || null } : null) }; }
  async announce() {
    await this.save();
    const info = this.publicInfo();
    for (const [pid, ws] of this.socks) this.sendWs(ws, { t: 'table', info, mySeat: this.seatOf(pid) });
    await this.lobby().fetch('https://do/upsert', { method: 'POST', body: JSON.stringify({ id: info.id, game: info.game, opts: info.opts, hostName: info.hostName, status: info.status, seats: info.seats.map(s => s && s.name) }) });
  }
  seatOf(pid) { return this.info.seats.findIndex(s => s && s.pid === pid); }
  sendWs(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) { } }
  sendSeat(seat, msg) { const s = this.info.seats[seat]; if (!s || !s.pid) return; const ws = this.socks.get(s.pid); if (ws) this.sendWs(ws, msg); }

  async fetch(req) {
    await this.load();
    const url = new URL(req.url);
    if (url.pathname === '/init') {
      const b = await req.json();
      this.info = { id: b.id, game: b.game, opts: b.opts, host: b.host, hostName: b.hostName, status: 'waiting', seats: [null, null, null, null], created: Date.now() };
      await this.announce();
      return json({ id: b.id });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 400);
    if (!this.info) return json({ error: 'no such table' }, 404);
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    server.accept();
    let pid = null;
    server.addEventListener('message', ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.onMsg(server, m, p => { pid = p; }, () => pid).catch(() => { }); });
    server.addEventListener('close', () => { if (pid && this.socks.get(pid) === server) this.socks.delete(pid); this.onLeave(pid).catch(() => { }); });
    return new Response(null, { status: 101, webSocket: client });
  }

  async onMsg(ws, m, setPid, getPid) {
    const i = this.info;
    if (m.a === 'hello') {
      const pid = String(m.pid || '').slice(0, 64); if (!/^[a-f0-9]{8,64}$/.test(pid)) return;
      setPid(pid); this.socks.set(pid, ws);
      const seat = this.seatOf(pid);
      if (seat >= 0) { i.seats[seat].name = clean(m.name); this.away.delete(seat); }
      this.sendWs(ws, { t: 'table', info: this.publicInfo(), mySeat: seat });
      if (i.status === 'playing' && seat >= 0 && this.runner) {
        const view = this.runner.snapshot(seat);
        if (view) this.sendWs(ws, { t: 'state', view, names: this.namesFor(seat) });
        const a = this.asks.get(seat); if (a) this.sendWs(ws, { t: 'ask', req: a.req, ms: Math.max(0, a.deadline - Date.now()) });
      }
      return;
    }
    const pid = getPid(); if (!pid) return;
    const seat = this.seatOf(pid);
    if (m.a === 'sit' && i.status === 'waiting') {
      const s = m.seat | 0; if (s < 0 || s > 3 || i.seats[s]) return;
      if (seat >= 0) i.seats[seat] = null;
      i.seats[s] = { pid, name: clean(m.name) };
      await this.announce(); return;
    }
    if (m.a === 'stand' && i.status === 'waiting' && seat >= 0) { i.seats[seat] = null; await this.announce(); return; }
    if (m.a === 'start' && i.status === 'waiting' && pid === i.host && seat >= 0) { await this.start(); return; }
    if (seat < 0) return;
    if (m.a === 'move') { this.away.delete(seat); const a = this.asks.get(seat); if (a) { clearTimeout(a.timer); this.asks.delete(seat); a.resolve(m); } return; }
    if (m.a === 'back') { this.away.delete(seat); return; }
    if (m.a === 'next' && this.nextVotes) { this.nextVotes.add(seat); this.checkNext(); return; }
  }
  async onLeave(pid) {
    const i = this.info; if (!i || !pid) return;
    const seat = this.seatOf(pid);
    if (i.status === 'waiting' && seat >= 0) {
      i.seats[seat] = null;
      // nobody left at a waiting table: take it off the list
      if (!this.humanSeats().length && !this.socks.size) { i.status = 'done'; await this.save(); await this.lobby().fetch('https://do/remove', { method: 'POST', body: JSON.stringify({ id: i.id }) }); }
      else await this.announce();
    }
    if (i.status === 'playing' && seat >= 0) { const a = this.asks.get(seat); if (a) { clearTimeout(a.timer); this.asks.delete(seat); a.resolve(null); } }
  }
  namesFor(me) { const n = {}; for (let s = 0; s < 4; s++) { const x = this.info.seats[s]; n[((s - me) % 4 + 4) % 4] = x ? x.name : ''; } return n; }
  humanSeats() { return [0, 1, 2, 3].filter(s => this.info.seats[s] && this.info.seats[s].pid); }

  // bot level: the level closest to the average rating of the humans it plays against
  levelFor(seat) {
    const g = this.info.game, hum = this.humanSeats();
    const opp = hum.filter(s => s % 2 !== seat % 2), pool = opp.length ? opp : hum;
    if (!pool.length) return 'average';
    const avg = pool.reduce((x, s) => x + (this.ratings[this.info.seats[s].pid]?.r?.[g] ?? TIER[g].average), 0) / pool.length;
    return nearestLevel(g, avg);
  }
  async start() {
    const i = this.info;
    i.status = 'playing';
    const pids = this.humanSeats().map(s => i.seats[s].pid);
    this.ratings = await (await this.registry().fetch('https://do/many', { method: 'POST', body: JSON.stringify({ pids }) })).json();
    for (let s = 0; s < 4; s++) {
      this.levels[s] = this.levelFor(s);
      if (!i.seats[s]) i.seats[s] = { bot: true, name: '@' + this.levels[s], level: this.levels[s] };   // the app shows the level as the bot's name
    }
    await this.announce();
    for (let s = 0; s < 4; s++) this.sendSeat(s, { t: 'start', names: this.namesFor(s) });
    const io = {
      sleep, send: (seat, msg) => this.sendSeat(seat, { ...msg, names: undefined }),
      isHuman: seat => !!(i.seats[seat] && i.seats[seat].pid),
      level: seat => this.levels[seat],
      ask: (seat, req) => this.ask(seat, req),
      waitNext: ms => this.waitNext(ms),
    };
    this.runner = new Runner(i.game, i.opts, io);
    this.runner.run().then(w => this.finish(w)).catch(e => { for (const ws of this.socks.values()) this.sendWs(ws, { t: 'error', msg: String(e && e.message) }); });
  }
  ask(seat, req) {
    const s = this.info.seats[seat], ws = s && s.pid && this.socks.get(s.pid);
    if (!ws || this.away.has(seat)) return sleep(800).then(() => null);   // away: the bot plays this turn
    return new Promise(resolve => {
      const deadline = Date.now() + TURN_MS;
      const timer = setTimeout(() => { this.asks.delete(seat); this.away.add(seat); this.sendSeat(seat, { t: 'away' }); resolve(null); }, TURN_MS);
      this.asks.set(seat, { resolve, timer, req, deadline });
      this.sendWs(ws, { t: 'ask', req, ms: TURN_MS });
    });
  }
  waitNext(ms) {
    return new Promise(resolve => {
      this.nextVotes = new Set(); this.nextResolve = resolve;
      this.nextTimer = setTimeout(() => this.doneNext(), ms);
      this.checkNext();
    });
  }
  checkNext() {
    if (!this.nextVotes) return;
    const need = this.humanSeats().filter(s => this.socks.has(this.info.seats[s].pid) && !this.away.has(s));
    if (need.every(s => this.nextVotes.has(s))) this.doneNext();
  }
  doneNext() { if (!this.nextVotes) return; clearTimeout(this.nextTimer); this.nextVotes = null; const r = this.nextResolve; this.nextResolve = null; r(); }
  async finish(winner) {
    const i = this.info, g = i.game;
    const teams = [[0, 2], [1, 3]].map(t => t.map(s => i.seats[s].pid ? { pid: i.seats[s].pid, name: i.seats[s].name } : { r: TIER[g][this.levels[s]] }));
    let changes = {};
    if (this.humanSeats().length) changes = await (await this.registry().fetch('https://do/result', { method: 'POST', body: JSON.stringify({ game: g, teams, winner }) })).json();
    for (const s of this.humanSeats()) this.sendSeat(s, { t: 'rating', change: changes[i.seats[s].pid] || null });
    i.status = 'done'; await this.save();
    await this.lobby().fetch('https://do/remove', { method: 'POST', body: JSON.stringify({ id: i.id }) });
  }
}
