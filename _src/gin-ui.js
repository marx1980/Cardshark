// ===================== GIN RUMMY UI (offline vs a bot and online, one screen) =====================
const GinUI = (() => {
  const G = Gin;
  let api, root = null, cur = null, mode = null, st = null, askRes = null, selC = null, chain = Promise.resolve(),
    tok = 0, levels = [], offNames = [], ctx = null, away = false, myReq = false, idleTimer = 0, nextRes = null, lastEnd = null;
  class Abort extends Error {}
  const TX = {
    hr: { name: 'Gin Rummy', target: 'Do', you: 'Ti', stock: 'Špil', take: 'Uzmi', pass: 'Pas', discard: 'Baci', knock: 'Kucaj', gin: 'Gin', big: 'Veliki gin', dead: 'Višak',
      yourTurn: 'Tvoj potez', thinking: n => `${n} igra…`, hand: n => `Ruka ${n}`, under: 'Undercut', void: 'Neriješeno', won: 'Pobjeda!', lost: 'Poraz', next: 'Dalje',
      again: 'Nova igra', home: 'Početna', hands: 'Dobivene ruke', game: 'Bonus za igru', total: 'Ukupno', score: 'Bodovi', laid: 'Priključeno',
      err: { bad: 'Ne ide', same: 'Ne možeš baciti istu kartu', knock: 'Višak je prevelik', gin: 'Nije gin', first: 'Ne možeš uzeti kartu', turn: 'Nisi na redu' } },
    en: { name: 'Gin Rummy', target: 'To', you: 'You', stock: 'Stock', take: 'Take', pass: 'Pass', discard: 'Discard', knock: 'Knock', gin: 'Gin', big: 'Big gin', dead: 'Deadwood',
      yourTurn: 'Your turn', thinking: n => `${n} is playing…`, hand: n => `Hand ${n}`, under: 'Undercut', void: 'Draw', won: 'You won!', lost: 'You lost', next: 'Next',
      again: 'New game', home: 'Home', hands: 'Hands won', game: 'Game bonus', total: 'Total', score: 'Score', laid: 'Laid off',
      err: { bad: 'Not allowed', same: 'Cannot discard that card', knock: 'Deadwood too high', gin: 'Not gin', first: 'Cannot take that card', turn: 'Not your turn' } }
  };
  const tx = () => TX[api.S.lang === 'hr' ? 'hr' : 'en'];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const $ = s => root.querySelector(s);
  const mul = () => api.S.speed === 'slow' ? 1.6 : api.S.speed === 'fast' ? 0.55 : 1;
  const sleep = ms => { const t = tok; return new Promise((res, rej) => setTimeout(() => t === tok ? res() : rej(new Abort()), ms * mul())); };
  const face = c => Cards.frFace(G.key(c), api.S.fDeck);
  const back = () => Cards.frBack(api.S.fDeck, api.S.fBack);
  function init(a) { api = a; }
  const nameOf = i => i === 0 ? tx().you : mode === 'net' ? api.botName((ctx.names || {})[i] || '') : api.botName(offNames[i] || '');

  function show() {
    root = document.querySelector('#gin');
    for (const id of ['#home', '#table', '#sol', '#uno', '#poker', '#remi', '#tablic', '#bridge', '#pref']) { const el = document.querySelector(id); if (el) el.hidden = true; }
    root.hidden = false; root.style.setProperty('--rr', Cards.frRatio(api.S.fDeck));
    root.innerHTML = `<header class="ubar"><button class="ib" id="gnHome" aria-label="${api.L().sol.home}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="chip score" id="gnScore"></div>
      <button class="ib" id="gnHelp" aria-label="${api.L().rules}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/></svg></button>
      <button class="ib" id="gnSet" aria-label="${api.L().settings}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button></header>
      <div class="gnboard"><div class="gnopp" id="gnOpp"></div><div class="gnpiles"><div class="gnpile" id="gnStock"></div><div class="gnpile" id="gnDisc"></div></div><div class="tbinfo" id="gnInfo"></div></div>
      <div class="tbstatus" id="gnStatus"></div><div class="tbact" id="gnAct"></div><div class="tbhand" id="gnHand"></div>`;
    $('#gnHome').onclick = leave;
    $('#gnHelp').onclick = () => api.showRules('g');
    $('#gnSet').onclick = () => api.showOpts('r');
    $('#gnHand').onclick = e => { const el = e.target.closest('.tbc'); if (el) tapHand(el.dataset.id); };
    $('#gnStock').onclick = () => pile('stock');
    $('#gnDisc').onclick = () => pile('take');
    $('#gnAct').onclick = e => { const b = e.target.closest('button'); if (b) act(b.dataset.a); };
  }
  function leave() {
    tok++; clearTimeout(idleTimer); away = false; const a = document.querySelector('#awayPill'); if (a) a.remove();
    if (root) root.hidden = true;
    if (mode === 'net' && ctx) { ctx.leave(); } else api.showHome();
    mode = null;
  }

  // ---------------------------------------------------------------- moves
  const phase = () => cur && cur.phase;
  const tapHand = id => { if (!myReq || phase() !== 'discard') return; selC = selC === id ? null : id; render(); };
  function pile(a) {
    if (!myReq || phase() !== 'draw') return;
    if (a === 'take' && (cur.noTake || !cur.discLen)) return;
    submit({ act: a });
  }
  function act(a) {
    if (!myReq) return;
    if (a === 'take' || a === 'pass' || a === 'big') return submit({ act: a });
    if (!selC) return;
    submit({ act: a, id: selC });
  }
  function submit(mv) {
    myReq = false; selC = null; clearTimeout(idleTimer);
    if (mode === 'net') ctx.send({ a: 'move', act: mv.act, id: mv.id });
    else if (askRes) { const r = askRes; askRes = null; r(mv); }
    render();
  }

  // ---------------------------------------------------------------- drawing
  const rectOf = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
  function render() {
    { const s = root && root.querySelector('#gnSet'); if (s) s.style.display = mode === 'net' ? 'none' : ''; }
    if (!cur || !root) return;
    const t = tx(), v = cur;
    $('#gnScore').innerHTML = `<span>${t.you}</span><b>${v.scores[0]}</b><small>/ ${v.opts.target}</small>`;
    // opponent
    const o = $('#gnOpp'), turnNow = v.turn === 1 || (v.phase === 'offer' && v.offerTurn === 1);
    const backs = Array.from({ length: Math.min(v.counts[1], 11) }, () => `<span class="tbback">${back()}</span>`).join('');
    o.className = `gnopp tbopp${turnNow ? ' turn' : ''}`;
    o.innerHTML = `<div class="tbcnt">${backs}</div><b class="tbnm">${esc(nameOf(1))}</b><span class="tbrow"><small>${v.counts[1]}</small><b class="tbsc">${v.scores[1]}</b></span>`;
    // piles
    const mine = myReq && v.phase === 'draw';
    const sp = $('#gnStock'); sp.className = `gnpile${mine ? ' act' : ''}`;
    sp.innerHTML = `<div class="gnc">${back()}</div><b class="gncount">${v.stock}</b>`;
    const dp = $('#gnDisc'); dp.className = `gnpile${mine && !v.noTake ? ' act' : ''}${v.phase === 'offer' && myReq ? ' act' : ''}`;
    const dl = v.discard.slice(); dp.innerHTML = dl.map((c, i) => `<div class="gnc" style="--o:${i - (dl.length - 1)}" data-id="${c.id}">${face(c)}</div>`).join('') || '<div class="gnempty"></div>';
    // my hand, melds first
    const hand = $('#gnHand'), W = root.clientWidth || 360, k = v.hand.length;
    const A = G.analyze(v.hand), groups = A.melds.map(m => m.slice()); if (A.dead.length) groups.push(A.dead);
    const gap = 10, nG = groups.length;
    const cw = Math.max(36, Math.min(60, Math.floor((W - 12 - gap * Math.max(0, nG - 1)) / (1 + 0.6 * Math.max(0, k - 1)))));
    const step = cw * 0.6, total = cw + Math.max(0, k - 1) * step + gap * Math.max(0, nG - 1), left0 = Math.max(4, (W - 8 - total) / 2);
    hand.style.setProperty('--cw', cw + 'px'); hand.style.height = `calc(var(--cw) * var(--rr) + 18px)`;
    let x = left0, html = '';
    groups.forEach((g, gi) => {
      g.forEach(c => { html += `<div class="tbc${selC === c.id ? ' sel' : ''}${myReq && v.phase === 'discard' ? '' : ' wait'}${gi < A.melds.length ? ' mld' : ''}" data-id="${c.id}" style="left:${x}px">${face(c)}</div>`; x += step; });
      x += gap;
    });
    hand.innerHTML = html;
    $('#gnInfo').innerHTML = k ? `<span>${t.dead} <b>${A.dw}</b></span>` : '';
    // status + actions
    const stat = $('#gnStatus'), myTurn = v.turn === 0 || (v.phase === 'offer' && v.offerTurn === 0);
    stat.className = `tbstatus${myTurn && myReq ? ' yt' : ''}`;
    stat.textContent = myTurn ? t.yourTurn : (v.turn === null || v.turn === undefined) ? '' : t.thinking(nameOf(1));
    const bar = $('#gnAct'); let b = '';
    if (myReq && v.phase === 'offer') b = `<button class="ubtn" data-a="pass">${t.pass}</button><button class="ubtn pri" data-a="take">${t.take}</button>`;
    else if (myReq && v.phase === 'discard') {
      const sel = selC && v.hand.find(c => c.id === selC);
      const big = A.dw === 0;
      if (big) b += `<button class="ubtn pri" data-a="big">${t.big}</button>`;
      if (sel) {
        const rest = G.dwOf(v.hand.filter(c => c.id !== sel.id)), canK = rest <= 10 && sel.id !== v.drew, canD = sel.id !== v.drew;
        b += `<button class="ubtn" data-a="discard" ${canD ? '' : 'disabled'}>${t.discard}</button>`;
        if (canK) b += `<button class="ubtn pri" data-a="knock">${rest === 0 ? t.gin : `${t.knock} · ${rest}`}</button>`;
      }
    }
    bar.innerHTML = b;
  }
  function fly(html, from, to, ms) {
    const el = document.createElement('div'); el.className = 'tbfly'; el.innerHTML = html;
    el.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`; document.body.appendChild(el);
    const s = to.width / from.width, dx = to.left - from.left, dy = to.top - from.top;
    const an = el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: .95 }], { duration: ms * mul(), easing: 'ease-in-out', fill: 'forwards' });
    return an.finished.catch(() => { }).then(() => el.remove());
  }
  function bubble(text) {
    const b = document.createElement('div'); b.className = 'tbbub'; b.textContent = text; $('.gnboard').append(b); setTimeout(() => b.remove(), 1500 * mul());
  }

  // ---------------------------------------------------------------- events (queued, so animations never overlap)
  const enqueue = fn => { const t = tok; chain = chain.then(() => t === tok ? fn() : null).catch(e => { if (!(e instanceof Abort)) console.error(e); }); return chain; };
  async function handle(ev, v) {
    if (!root || root.hidden) return;
    if (ev.k === 'deal') { selC = null; cur = v; render(); return; }
    if (ev.k === 'turn') { cur = v; render(); return; }
    if (ev.k === 'act') return onAct(ev, v);
    if (ev.k === 'handEnd') { lastEnd = { ev, v }; cur = v; render(); if (!ev.over) await handEndSheet(ev, v); return; }
    if (ev.k === 'matchEnd') return matchEnd(ev, v);
    cur = v; render();
  }
  async function onAct(ev, v) {
    const t = tx(), mine = ev.seat === 0, c = ev.card;
    const oppEl = $('#gnOpp'), handEl = $('#gnHand');
    const anchorOpp = () => { const r = rectOf(oppEl); return { left: r.left + r.width / 2 - 14, top: r.top + r.height / 2 - 20, width: 28, height: 28 * (parseFloat(getComputedStyle(root).getPropertyValue('--rr')) || 1.5) }; };
    const anchorHand = () => { const r = rectOf(handEl); return { left: r.left + r.width / 2 - 18, top: r.top, width: 36, height: 36 * (parseFloat(getComputedStyle(root).getPropertyValue('--rr')) || 1.5) }; };
    const pileRect = id => rectOf($(id));
    if (ev.act === 'pass') { bubble(t.pass); cur = v; render(); return; }
    if (ev.act === 'stock') { await fly(back(), pileRect('#gnStock'), mine ? anchorHand() : anchorOpp(), 280); }
    else if (ev.act === 'take') { await fly(face(c), pileRect('#gnDisc'), mine ? anchorHand() : anchorOpp(), 300); }
    else if (ev.act === 'discard' || ev.act === 'knock' || ev.act === 'gin') {
      const src = mine ? root.querySelector(`#gnHand [data-id="${c.id}"]`) : null;
      const from = src ? rectOf(src) : anchorOpp();
      if (src) src.style.visibility = 'hidden';
      await fly(face(c), from, pileRect('#gnDisc'), 300);
      if (ev.act !== 'discard') bubble(ev.act === 'gin' ? t.gin : t.knock);
    } else if (ev.act === 'big') bubble(t.big);
    cur = v; render();
  }

  // ---------------------------------------------------------------- results
  const mini = (c, lay) => `<div class="tbc${lay ? ' lay' : ''}" data-id="${c.id}">${face(c)}</div>`;
  function resultHTML(ev, v) {
    const t = tx(), r = ev.result;
    if (!r) return '';
    const title = r.k === 'void' ? t.void : r.k === 'big' ? t.big : r.k === 'gin' ? t.gin : r.under ? t.under : t.knock;
    const who = r.winner >= 0 ? ` · ${esc(nameOf(r.winner))}` : '';
    const laid = new Set((r.laid || []).map(c => c.id));
    const side = i => {
      if (!r.melds) return '';
      const mel = (r.melds[i] || []).map(m => `<div class="gng">${m.map(c => mini(c, laid.has(c.id))).join('')}</div>`).join('');
      const dead = (r.dead[i] || []).length ? `<div class="gng dd">${r.dead[i].map(c => mini(c)).join('')}</div>` : '';
      return `<div class="gnrp"><div class="gnrh"><b>${esc(nameOf(i))}</b><span>${t.dead} ${r.dw[i]}</span><b class="gnadd">${r.add[i] ? '+' + r.add[i] : ''}</b></div><div class="gnrow">${mel}${dead}</div></div>`;
    };
    const sc = `<div class="gnsc"><span>${esc(nameOf(0))} <b>${ev.scores[0]}</b></span><span>${esc(nameOf(1))} <b>${ev.scores[1]}</b></span><small>/ ${v.opts.target}</small></div>`;
    return `<h3>${t.hand(ev.round)} · ${title}${who}</h3>${r.k === 'void' ? '' : side(1) + side(0)}${sc}`;
  }
  function handEndSheet(ev, v) {
    const t = tx(), html = resultHTML(ev, v);
    if (mode === 'net') {
      api.openSheet(`${html}<div class="btns"><button class="pri" id="gnNext">${t.next}</button></div>`, s => {
        s.querySelector('#gnNext').onclick = () => { ctx.send({ a: 'next' }); const b = s.querySelector('#gnNext'); b.disabled = true; b.textContent = api.L().waitOthers(Math.max(1, ctx.nextN || 0), ctx.nextOf || 2); };
      });
    } else {
      api.openSheet(`${html}<div class="btns"><button class="pri" id="gnNext">${t.next}</button></div>`, s => { s.querySelector('#gnNext').onclick = () => { api.closeSheet(); if (nextRes) { const r = nextRes; nextRes = null; r(); } }; });
    }
  }
  async function matchEnd(ev, v) {
    const t = tx(), won = ev.winner === 0, f = ev.final;
    const rows = [0, 1].map(i => `<tr${i === ev.winner ? ' class="w"' : ''}><td>${esc(nameOf(i))}</td><td>${f[i].score}</td><td>${f[i].boxes} · +${f[i].box}</td><td>${f[i].game ? '+' + f[i].game : '·'}</td><td><b>${f[i].total}</b></td></tr>`).join('');
    const html = `<h3>${won ? t.won : t.lost}</h3><table class="pis utab"><thead><tr><th></th><th>${t.score}</th><th>${t.hands}</th><th>${t.game}</th><th>${t.total}</th></tr></thead><tbody>${rows}</tbody></table>`;
    if (mode === 'net') { if (ctx.matchDone) ctx.matchDone(); }
    else { clearSave(); record(won); }
    await api.fx(won, { cards: won ? [] : [...root.querySelectorAll('#gnHand .tbc')], stats: html });
    const btns = mode === 'net'
      ? `<button class="sec" id="gnX">${t.home}</button><button class="sec" id="gnT">${api.L().tables}</button><button class="pri" id="gnA">${api.L().playAgain}</button>`
      : `<button class="sec" id="gnX">${t.home}</button><button class="pri" id="gnA">${t.again}</button>`;
    api.openSheet(`${html}<p class="muted" id="ratingLine">${ctx && ctx.rating ? `${api.L().rating} ${ctx.rating.r} (${ctx.rating.d >= 0 ? '+' : ''}${ctx.rating.d})` : ''}</p><div class="btns">${btns}</div>`, s => {
      s.querySelector('#gnX').onclick = () => { api.closeSheet(); leave(); };
      const T2 = s.querySelector('#gnT'); if (T2) T2.onclick = () => { api.closeSheet(); leave(); ctx.lobby('r'); };
      s.querySelector('#gnA').onclick = () => {
        if (mode === 'net') { ctx.send({ a: 'again' }); const b = s.querySelector('#gnA'); b.disabled = true; b.textContent = api.L().waitOthers(1, ctx.againOf || 1); }
        else { api.closeSheet(); start(); }
      };
    });
  }

  // ---------------------------------------------------------------- offline match
  const ckpt = at => { if (!st) return; api.S.ginSave = { st: JSON.stringify(st), at, levels, names: offNames, t: Date.now() }; api.save(); };
  const clearSave = () => { if (api.S.ginSave) { api.S.ginSave = null; api.save(); } };
  const hasSaved = () => !!(api && api.S.ginSave);
  function record(won) { const S = api.S; S.ginStats = S.ginStats || {}; const r = S.ginStats[levels[1]] = S.ginStats[levels[1]] || [0, 0]; r[won ? 0 : 1]++; api.save(); }
  function makeHost(opts, saved) {
    const h = {
      opts, saved, st: null, turn: null, fromHuman: false,
      io: {
        sleep: ms => sleep(ms), level: s => levels[s], send: (seat, m) => { if (m.t === 'reject') api.toast((tx().err[m.rule] || tx().err.bad)); },
        waitNext: () => new Promise(res => { nextRes = res; })
      },
      emit(ev) { const v = G.view(h.st, 0); v.turn = h.turn === null ? null : h.turn; enqueue(() => handle(ev, v)); },
      checkpoint: async at => ckpt(at),
      async getAction(seat, req, bot) {
        h.fromHuman = false;
        if (seat === 0) {
          await chain;   // the table has caught up with the game
          const tk = (+api.S.takeover || 0) * 1000, my = tok;
          const a = await new Promise(res => {
            askRes = res; myReq = true; selC = null; cur = G.view(h.st, 0); cur.turn = 0; render();
            const arm = () => { clearTimeout(idleTimer); if (tk) idleTimer = setTimeout(() => { if (askRes === res) { askRes = null; myReq = false; render(); res(null); } }, tk); };
            arm(); root.onpointerdown = arm;
          });
          if (my !== tok) throw new Abort();
          if (a) { h.fromHuman = true; return a; }
          return bot();
        }
        await sleep(700 + Math.random() * 500);
        return bot();
      }
    };
    return h;
  }
  function begin(saved) {
    api.closeSheet(); show(); mode = 'off'; chain = Promise.resolve(); cur = null; lastEnd = null; tok++; myReq = false;
    const S = api.S;
    if (!saved) {
      clearSave();
      levels = [null, S.rLevel || 'cardshark']; levels[0] = levels[1];
      const pn = api.pickBotNames({ 1: levels[1] }); offNames = [null, pn[1]];
      st = null;
    } else { levels = saved.levels; offNames = saved.names; }
    const opts = saved ? JSON.parse(saved.st).opts : { players: 2, variant: 'gin', target: S.gTarget || 100 };
    const host = makeHost(opts, saved ? { st: saved.st, at: saved.at } : null);
    Object.defineProperty(host, 'st', { get() { return st; }, set(v) { st = v; } });
    G.run(host).catch(e => { if (!(e instanceof Abort)) console.error(e); });
  }
  const start = () => begin(null);
  const resume = () => begin(api.S.ginSave);

  // ---------------------------------------------------------------- online (messages from the server arrive through onNet)
  function onNet(m, c) {
    ctx = c; mode = 'net';
    if (m.t === 'start') { show(); chain = Promise.resolve(); cur = null; lastEnd = null; myReq = false; tok++; if (m.names) ctx.names = m.names; api.closeSheet(); return; }
    if (!root || root.hidden) { if (m.t === 'state' || m.t === 'ev') show(); else return; }
    if (m.names) ctx.names = m.names;
    if (m.t === 'state') { cur = m.view; selC = null; render(); return; }
    if (m.t === 'ev') {
      if (m.ev.k === 'deal') { api.closeSheet(); ctx.nextN = 0; }
      const v = m.view; enqueue(() => handle(m.ev, v)); return;
    }
    if (m.t === 'ask') { enqueue(() => { away = false; const a = document.querySelector('#awayPill'); if (a) a.remove(); myReq = true; selC = null; render(); }); return; }
    if (m.t === 'away') { myReq = false; render(); showAway(); return; }
    if (m.t === 'reject') { api.toast(tx().err[m.rule] || tx().err.bad); myReq = true; render(); return; }
    if (m.t === 'bots') { ctx.botSeats = m.seats; return; }
    if (m.t === 'rating') { ctx.rating = m.change; const el = document.querySelector('#ratingLine'); if (el && m.change) el.textContent = `${api.L().rating} ${m.change.r} (${m.change.d >= 0 ? '+' : ''}${m.change.d})`; return; }
    if (m.t === 'next') { ctx.nextN = m.n; ctx.nextOf = m.of; const b = document.querySelector('#gnNext'); if (b && b.disabled) b.textContent = api.L().waitOthers(m.n, m.of); return; }
    if (m.t === 'again') { ctx.againOf = m.of; const b = document.querySelector('#gnA'); if (b && b.disabled) b.textContent = api.L().waitOthers(m.n, m.of); return; }
    if (m.t === 'error') { api.toast(String(m.msg || 'error')); return; }
  }
  function showAway() {
    let el = document.querySelector('#awayPill');
    if (!el) { el = document.createElement('button'); el.id = 'awayPill'; root.appendChild(el); }
    el.innerHTML = `<span class="ap-s">${api.L().botPlays}</span><b>${api.L().takeOver}</b>`;
    el.onclick = () => { ctx.send({ a: 'back' }); el.remove(); };
  }
  return { init, start, resume, hasSaved, onNet, tx, TX, get state() { return st; } };
})();
if (typeof module !== 'undefined') module.exports = GinUI;
