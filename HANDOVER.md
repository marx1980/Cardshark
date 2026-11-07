# Cardshark — handover (25 Oct 2026, live: v63)

Live: GitHub Pages from `marx1980/Cardshark` `main` (the repo was renamed from `cardshark`; GitHub redirects, but push to `https://github.com/marx1980/Cardshark.git`).

## Shipped this session

| Ver | What |
|---|---|
| v45 | **Hint button** (lightbulb, bottom-right of the felt, only on your turn, local games only, not online/rated). Asks the Cardshark player which card to play for seat 0 and outlines that card [...] |
| v46 | **Uno table**: opponents seated around the table in play order (next player on your left, then top, then right). Played cards fly from the thrower's seat and land on the discard tilted [...] |
| v47 | **Hint explains itself (hybrid)**: line 1 = a play rule, only when it truly applies to the chosen card; line 2 = what actually decided it (simulation result: deals simulated + margin over [...] |

Shipped in parallel by another session (only their commit messages are summarised here; see the git log):
- **v48**: continue an offline game after leaving it (all card games, Uno, Poker); merged with v45–v47.
- **v49**: online: clearer seat colours when joining, host shown at the top, the table no longer turns when you sit, host id no longer sent to other players.
- **v50**: online: the next hand starts at most 5 s after the first player is ready, and the Next button shows who is ready.

Shipped since v50:
- **v51**: renamed the existing color-matching game from **Boje / Colours** to **L'Unico!** in Croatian and English, including its rules heading.
- **v52**: recolored the home tiles: Briškula to Adriatic teal, Bela to a stronger red, and Poker to dark brown.
- **v53**: reordered the home tiles to Briškula, Trešeta, Solitaire, Bela, Poker, then L'Unico!, and adjusted several tile colors for more even tones.
- **v54**: added **slow / normal / fast opponent reaction speed** to L'Unico!. Moved the wild-card color picker to the action row above the hand so it no longer hides the cards.
- **v55**: changed home tiles to start a game immediately with the saved settings, or resume that game if a save exists. Moved game options to an in-game settings button.
- **v56**: **security/stability:** allow-listed online table options and constrained values; cleaned player names and prevented names from using the bot-name prefix; tightened bot-name parsing; rate-limited seat changes; and rechecked next-hand readiness when a player leaves. **Mobile/UI:** hid the trump text on narrow phones, changed the home layout for landscape, and enlarged icon buttons. Leaving an offline game now returns home without a confirmation because the game is saved.
- **v57**: added **Remi**, Croatian rummy, playable against bots at four levels. The game supports 2–6 players, two decks plus four jokers, a 51-point opening, laying off cards, and swapping jokers.
- **v58**: online-table UI polish: show localized trump suit names on narrow phones, distinguish you/partner/opponents/free seats in the waiting table, and highlight available tables and host names in the lobby. No game logic or networking changes.
- **v59**: stabilized hints by caching each result and choosing the cheapest card among close simulation results; localized English game names as **Briscola**, **Tressette**, **Belote**, and **Rummy**; added a confirmation sheet before leaving a waiting-room table. No game logic or networking changes.
- **v60**: moved home-tile launch arrows above game names with space from card art; tuned the Trešeta close-hint margin to 0.2 points (matching the displayed tenths); and verified the Briškula face-up hint with a targeted state check.
- **v61**: matched Remi’s opponents and visible card backs to Poker’s around-the-table seating layout. Online table creation now offers all offline Briškula formats (including 2-player double hand) and 2-player / 4-player Trešeta; server seats, bot fill, view rotation, and ratings follow those choices.
- **v62**: added server-authoritative online Poker (Hold’em / five-card draw), Remi, and L’Unico! (Classic / Flip and house rules), including 2–6 player tables, private player views, validated moves, bot turns, ratings, and matching localized lobby/table UI. All Briškula and Trešeta online formats remain available; Solitaire is the only offline-only game.
- **v63**: branded match-result animations (`matchResultFx` in the main UI script, using `icons/mark.svg` only). Win: six dancing sharks (bottom-centre one 20% bigger with maracas) under fireworks and YOU WON!/POBJEDA!. Loss: the final trick is put back on the felt, a shark swallows the cards and swims off, revealing YOU LOST!/PORAZ!. Tap skips. Wired into Briškula, Trešeta, Bela, Uno, Poker, Remi and online matches; no game logic changes. Strings `youWon`/`youLost` in `STR`. Tested by playing Briškula to a lost match; Trešeta/Bela/Uno/Poker/Remi paths only load-tested.
- **v67**: Briškula (offline and online): when the last draw gives the face-up trump to a player, the trump flies from the stock to that player with a “takes the trump” bubble and a pause. Online, the server's `collect` event carries `trumpTo` and the runner waits longer before continuing.
- **v68**: Briškula: explicitly gate the trump pickup animation, announcement, and longer pause on the final card being drawn from an emptying stock; all other trick collections keep their normal timing.

- **v89**: added **Tablić** (2, 3 or 4 players; pairs at four; to 101 or 51) and **Contract Bridge** (rubber, four players in two partnerships), each with an offline game against bots at four levels and an online version (tables, seats, bot fill, ratings, bot takeover). Both are self-contained modules instead of branches of the old shared UI:
  - `server/src/tablic.js`, `server/src/bridge.js`: pure rules + bots + the match loop (`run(host)`), shared by the server and the app. `_src/tablic-ui.js`, `_src/bridge-ui.js`: the screens (one screen for offline and online). **`python3 tools/embed.py` copies these four files into `index.html` as `<script>` blocks; edit the sources, not the blocks, and run the tool.**
  - A game with its own screen plugs in through `MODS` in `server/src/runner.js` (it provides `view`, `rotEvent`, `run`) and `AUX` in the app's `handleNet` (the module takes every server message). Rules are in `RULES.<lang>.a / .c`, strings are in the UI modules (`TX`).
  - Tablić: capture is any set of table cards (or several groups) adding up to the played card; the last capturer takes what is left; tabla +1 except on the very last play. Bots: novice (random), average (greedy), pro (avoids leaving captures for the next player), cardshark (expected best reply of the opponents' whole hand).
  - Bridge: seat + 1 is on your left (clockwise), no honours, rubber ends the match. Bidding is natural and simple (`firstCall` + `ladder`); card play is a heuristic policy (average) or sampled perfect-information search (pro 8 worlds, cardshark 40). The declarer plays the dummy: the server asks the declarer with `req.for = dummy seat`. Strength (rubbers, head to head): average beat novice 40/40, pro beat average 38/40, cardshark beat pro 26/40.
  - Not yet: hints, Bridge claims/concessions, Tablić/Bridge-specific online spectating.

The service-worker cache version is `cardshark-v89` at `sw.js:2`.

## How the hint works (index.html, main UI script)

- `showHint()` mirrors the Cardshark player exactly: Bela → `AI.hRules()` first (if it returns `pick`, that's the move and `rule` names it), otherwise `AI.cardshark(g, G, 0, { timeMs: 1200, with[...]
- It never peeks: the AI re-deals every hidden hand from what seat 0 can know (`determinize`).
- `hintWhy(card, legal, res)` builds the text. Rule detectors, checked in order:
  - Bela rules by name, from `hRules`: `pull` (partner called, lead K/O of trumps for partner's jack), `pad` (10 on partner's plain ace), `bank` (partner's trick safe, drop your top card of a suit[...]
  - `only` / `last`: one legal card.
  - `unload`: partner is winning, nobody still to play can beat that card, and the chosen card carries points.
  - `faceUp`: Briškula pairs, the trick before the last draw (`AI.faceUpStake(G) > 0`), an opponent is winning and you could win but don't. The side that loses draws the face-up trump.
  - `take`: you play last, win, there are points on the table, and the chosen card is the cheapest winner.
  - `cantWin`: no legal card wins, and the chosen card is the cheapest.
- The rules **explain, they don't force**. If a rule applies but the simulation picks another card, the simulation line is shown instead. Only the Bela `hRules` actually force the move, and that w[...]
- Strings live in `STR.hr.why` / `STR.en.why` (`hrBod(n)` gives Croatian bod/boda/bodova). The second line uses `short(n, d)`; `d === null` means nearly a tie. Tie thresholds: Briškula < 1 point,[...]

### Adding Marko's next rules
1. Add a detector branch in `hintWhy` (keep it a statement that is literally true from public info only).
2. Add `why.<key>` strings in both languages.
3. Optional, if a rule should also **drive play** (bots too): put it in the AI module like `hRules` and run a simulation match before shipping. The Bela rules were tested that way; `AI.EXTRA` hold[...]

## Remi structure (v57 addition)

Remi is a 2–6 player rummy game (Croatian: Remi, sometimes spelled Remmi). It is fully playable offline against AI opponents at four difficulty levels.

- **Engine**: `Remi` object and API at `index.html:3913–3922` (shuffle, new match, play move, scoring). Full rules and state logic at `4055–4085`.
- **AI levels**: novice (opens when it sees 51, lays down what it notices, throws almost at random), average (finds the best melds, keeps pairs and near-runs, sheds high cards), pro (avoids throwing cards the next player could use, takes discards that help, plans lay-offs and joker swaps), cardshark (pro + remembers what each player has picked and keeps those cards away). Levels defined at `4120–4128`; AI decision logic at `4130–4380`.
- **Home tile and start**: tile descriptor at `5022`; game sheet (player count, target score, level) and handlers at `5098–5117`; tile click and resume logic at `5034`.
- **UI**: Remi display container `#remi` at `470–490`; opponent panel layout at `473–479`; table of visible melds at `481–485`. Card face rendering and save/checkpoint functions at `4387–4400`.
- **Save and resume**: checkpoint saves to `S.remiSave` on every action (`4392`); resume checks `hasSaved()` and restores state (`4394`). Clearing a save at `4393`.

## Codebase notes
- Everything is in `index.html` (~5.2k lines, no build). Sections are separate `<script>` blocks: ENGINE (`Engine`, aliased `E`), AI TIERS (`AI`), deck art, `Cards`, Solitaire, Uno + `UnoUI`, Poker + `PokerUI`, Remi + `RemiUI`, Bela/Briškula/Trešeta, online `net`, `STR` (strings, hr/en), main UI.
- Function names repeat across modules (e.g. two `showHint`, two `build();` lines). Match unique context when patching.
- Version bump on every release: `${t.credit} · vNN` in `index.html` and `const V = 'cardshark-vNN'` in `sw.js` (the service worker cache).
- Online play: `server/` (Cloudflare Worker, `deploy-server.yml`). The hint is hidden when `G.online`.

## Testing that worked
Headless Chromium at `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` with Python Playwright. Serve the repo with `python3 -m http.server`, set `localStorage['stih.v1']` to `{speed:'fast', l[...]
- trick games: if `#bHint` is visible → click it, wait for `.hc.hint`, read `#action` text, click `.hc.hint`; click `#overlay [data-go="next"]` between hands; Bela bidding → `#action .bid butt[...]
- Uno: click `#uHand.myturn .ucard.ok`, else `[data-a="pass"]` or `#uDraw`; colour sheet `#overlay [data-c]`; challenge `#uAcc`. Wrap clicks in try/except (re-renders detach elements).
- Remi: click `#remi [data-go="new"]`, set level to `@cardshark`, players to 4, target to 501; meld region `#remi .rmeld`, discard button `[data-a="discard"]`, lay-off button `[data-a="layoff"]`, next turn `#overlay [data-go="next"]`.

Check at 375×667 and 390×780/844. The only expected console error is Google Fonts being blocked in the sandbox.

## Open items
- **More play rules from Marko** for the hint; this needs the rule descriptions before implementation.
- Commits for v45–v47 were made under Marko's email, so GitHub shows them as Unverified. They weren't rewritten, because that needs a force-push to `main`. From now on, commit as `Claude <norepl[...]
- Hint stays offline only, to keep online ratings fair. Revisit if Marko wants it in online play.
- Online play supports all multiplayer games; Solitaire remains offline-only because it is single-player.

## v97 – Gin Rummy (variant of Rummy)
- Rules/bots/view/run in server/src/gin.js, screen in _src/gin-ui.js (both embedded by tools/embed.py). Game code stays 'r'; `opts.variant === 'gin'` selects it (runner.js picks Gin as `mod`, worker.js cleanOptsGame forces 2 players, target 50/100).
- Client: `S.rVar` ('remi'|'gin'), `S.gTarget`; lobby `S.onRVar`/`S.onGTarget`; saves `S.ginSave`, stats `S.ginStats`; AUX 'r' returns GinUI only when table opts.variant is gin. Rules key 'g'.

## v98 – Preferans (game code 'f')
- Rules/bots/view/run in server/src/pref.js, screen in _src/pref-ui.js (embedded by tools/embed.py). 3 players, bidding 6–10 + misère, talon, whist/pass, raspasy; match = 6 or 12 deals, highest total wins. runner MODS f, worker: TIER f, cleanOptsGame f ({deals}), individual rating.
- Client: `S.fLevel`, `S.fDeals`, lobby `S.onFDeals`, saves `S.prefSave`, stats `S.prefStats`, last-trick toggle `last_f`, rules key 'f'.

## v99 – Preferans pool & mountain
- `opts.scoring` 'simple'|'pool', `opts.pool` 6|10 (pref.js `settle`): made contract fills pool, failure/raspasy go to mountain, whists written against declarer; match ends when two pools are full (cap 30 deals); `st.scores` is the running settlement vs table average. Client `S.fScoring`, `S.fPool`, lobby `S.onFScoring`/`S.onFPool`.

## v99 options – Preferans pool end and limit
- `opts.poolEnd` 'two' (default) | 'three' (match ends when two or all three pools are full); `opts.poolCap` 'cap' (default, pool stops at target) | 'open'. Client `S.fPoolEnd`, `S.fPoolCap`; lobby `S.onFPoolEnd`, `S.onFPoolCap`.

## v101 – English names
- English home tiles/lists: Tablanette (a), Preference (f).

## v102 – Preferans in three versions (Russian, Austrian, Balkan)
- `opts.version` 'russian' (default, the old game, unchanged) | 'austrian' | 'balkan'. `Pref.SCHEMA[version]` lists every option with `vals`, `def` and `vis` (when it applies); `Pref.cleanOpts(raw)` normalises them (worker `cleanOptsGame` 'f' uses it) and `Pref.bidsFor(opts)` builds the contract list (indices are what `bid`/`declare` actions carry).
- Austrian/Balkan share the generic engine in pref.js (`actG`, `advanceG`, `toDef`, `afterDef`, `afterInv`, `toPlay`, `startPlayG`, `endDealG`, `scoreA`, `scoreB`, `botG`); phases: bid, talon, declare, whist (defender: whist=play / pass=drop out / kontra), kontra, invite, solo (Austrian declarer may drop), noaces, play, done. Trick size = number of active players.
- Austrian options: hand, open (misère/slam), nt, drop, invite, mult, prefGame, aces4, aces0, deals. Balkan: scoring bula|pot|swabian, bula 30|50, deals, top sans|sansUno|slam, pref, igra, step, same, refa, drop, invite, kontra off|two|four, two normal|kontra|serbia|slovenia, lead left|right.
- Client: `S.fVersion`; options stored flat as `S.fa_<k>` / `S.fb_<k>` (lobby `S.onFV`, `S.onfa_<k>`, `S.onfb_<k>`); `PrefUI.rows/optsFrom` build the segmented rows for the sheet and lobby; rules keys 'f' (Russian), 'fa', 'fb'.
- Sources: en.wikipedia Préférence (Austrian, Balkan), pagat Croatian/Serbian/Slovenian Preference; en.wikipedia Preferans = Russian. hr.wikipedia Preferans could not be fetched.
