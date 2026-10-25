# Cardshark — handover (25 Oct 2026, live: v58)

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

Next release is **v59**. The service-worker cache version is `cardshark-v58` at `sw.js:2`.

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
- **More play rules from Marko** for the hint (he'll supply them).
- The `faceUp` rule didn't occur in the test hands (it's one trick per hand). Worth a targeted check.
- In Trešeta, the simulation line is often "nearly a tie" (16 deals, small margins). That's honest, but maybe tune the thresholds.
- Commits for v45–v47 were made under Marko's email, so GitHub shows them as Unverified. They weren't rewritten, because that needs a force-push to `main`. From now on, commit as `Claude <norepl[...]
- Hint stays offline only, to keep online ratings fair. Revisit if Marko wants it in online play.
- Remi is offline only. Multiplayer (local network or online) can be considered after testing and polish.
