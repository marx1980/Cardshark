# Cardshark — handover (24 Oct 2026, live: v50)

Live: GitHub Pages from `marx1980/Cardshark` `main` (the repo was renamed from `cardshark`; GitHub redirects, but push to `https://github.com/marx1980/Cardshark.git`).

## Shipped this session

| Ver | What |
|---|---|
| v45 | **Hint button** (lightbulb, bottom-right of the felt, only on your turn, local games only, not online/rated). Asks the Cardshark player which card to play for seat 0 and outlines that card in brass. Tap again to clear. **Red frame on trumps** played to the trick (Briškula, Bela; Trešeta has none). |
| v46 | **Uno table**: opponents seated around the table in play order (next player on your left, then top, then right). Played cards fly from the thrower's seat and land on the discard tilted toward them; the last round (up to 5 cards) stays visible, older ones dimmed. Piles shrink for 5–6 players. |
| v47 | **Hint explains itself (hybrid)**: line 1 = a play rule, only when it truly applies to the chosen card; line 2 = what actually decided it (simulation result: deals simulated + margin over the next-best card, or "nearly a tie"). With no rule, the simulation sentence is the main line. EN + HR. |

Shipped in parallel by another session (only their commit messages are summarised here; see the git log):
- **v48**: continue an offline game after leaving it (all card games, Uno, Poker); merged with v45–v47.
- **v49**: online: clearer seat colours when joining, host shown at the top, the table no longer turns when you sit, host id no longer sent to other players.
- **v50**: online: the next hand starts at most 5 s after the first player is ready, and the Next button shows who is ready.

Next release is **v51**. Two sessions pushed to `main` the same night, so always `git fetch` and rebase before you build on it.

## How the hint works (index.html, main UI script)

- `showHint()` mirrors the Cardshark player exactly: Bela → `AI.hRules()` first (if it returns `pick`, that's the move and `rule` names it), otherwise `AI.cardshark(g, G, 0, { timeMs: 1200, withValues: true })`, which returns `{ legal, means, n }`.
- It never peeks: the AI re-deals every hidden hand from what seat 0 can know (`determinize`).
- `hintWhy(card, legal, res)` builds the text. Rule detectors, checked in order:
  - Bela rules by name, from `hRules`: `pull` (partner called, lead K/O of trumps for partner's jack), `pad` (10 on partner's plain ace), `bank` (partner's trick safe, drop your top card of a suit).
  - `only` / `last`: one legal card.
  - `unload`: partner is winning, nobody still to play can beat that card, and the chosen card carries points.
  - `faceUp`: Briškula pairs, the trick before the last draw (`AI.faceUpStake(G) > 0`), an opponent is winning and you could win but don't. The side that loses draws the face-up trump.
  - `take`: you play last, win, there are points on the table, and the chosen card is the cheapest winner.
  - `cantWin`: no legal card wins, and the chosen card is the cheapest.
- The rules **explain, they don't force**. If a rule applies but the simulation picks another card, the simulation line is shown instead. Only the Bela `hRules` actually force the move, and that was already the case for the computer players.
- Strings live in `STR.hr.why` / `STR.en.why` (`hrBod(n)` gives Croatian bod/boda/bodova). The second line uses `short(n, d)`; `d === null` means nearly a tie. Tie thresholds: Briškula < 1 point, Bela < 2, Trešeta < 0.15.

### Adding Marko's next rules
1. Add a detector branch in `hintWhy` (keep it a statement that is literally true from public info only).
2. Add `why.<key>` strings in both languages.
3. Optional, if a rule should also **drive play** (bots too): put it in the AI module like `hRules` and run a simulation match before shipping. The Bela rules were tested that way; `AI.EXTRA` holds experimental players for this.

## Codebase notes
- Everything is in `index.html` (~5.1k lines, no build). Sections are separate `<script>` blocks: ENGINE (`Engine`, aliased `E`), AI TIERS (`AI`), deck art, `Cards`, Solitaire, Uno + `UnoUI`, Poker + `PokerUI`, then the main UI. Line 1824 is a ~340 KB French-deck SVG blob; don't print it.
- Function names repeat across modules (e.g. two `showHint`, two `build();` lines). Match unique context when patching.
- Version bump on every release: `${t.credit} · vNN` in `index.html` and `const V = 'cardshark-vNN'` in `sw.js` (the service worker cache).
- Online play: `server/` (Cloudflare Worker, `deploy-server.yml`). The hint is hidden when `G.online`.

## Testing that worked
Headless Chromium at `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` with Python Playwright. Serve the repo with `python3 -m http.server`, set `localStorage['stih.v1']` to `{speed:'fast', lang:'en'|'hr', uPlayers:n}` via an init script, click `#goB`/`#goT`/`#goH`/`#goU` then `#gPlay`, and loop:
- trick games: if `#bHint` is visible → click it, wait for `.hc.hint`, read `#action` text, click `.hc.hint`; click `#overlay [data-go="next"]` between hands; Bela bidding → `#action .bid button[data-s="0"]`.
- Uno: click `#uHand.myturn .ucard.ok`, else `[data-a="pass"]` or `#uDraw`; colour sheet `#overlay [data-c]`; challenge `#uAcc`. Wrap clicks in try/except (re-renders detach elements).

Check at 375×667 and 390×780/844. The only expected console error is Google Fonts being blocked in the sandbox.

## Open items
- **More play rules from Marko** for the hint (he'll supply them).
- The `faceUp` rule didn't occur in the test hands (it's one trick per hand). Worth a targeted check.
- In Trešeta, the simulation line is often "nearly a tie" (16 deals, small margins). That's honest, but maybe tune the thresholds.
- Commits for v45–v47 were made under Marko's email, so GitHub shows them as Unverified. They weren't rewritten, because that needs a force-push to `main`. From now on, commit as `Claude <noreply@anthropic.com>`.
- Hint stays offline only, to keep online ratings fair. Revisit if Marko wants it in online play.
