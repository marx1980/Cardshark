# Cardshark Assistant Skills & Behavior

## Tracking and Communication

### Always provide tracking links
When I start a coding agent session, deep research, or any long-running task, I will **immediately provide you with a direct tracking link** so you can monitor progress in real-time.

Example formats:
- Coding agent PR: `https://github.com/marx1980/Cardshark/pull/N`
- Deep research task: `https://github.com/marx1980/Cardshark/tasks/{task-id}`
- GitHub Actions run: Link to the workflow run

### Proactively notify when done
I will **promptly inform you when work is complete** without waiting for you to ask "ready?" or "done?". This includes:
- When a PR is ready for review (even if still in draft)
- When a PR is merged
- When research or investigation concludes
- When fixes or features are shipped

I will not rely on you to check status—I'll tell you proactively with clear summaries of what was accomplished.

### Visual issue reports
When the user reports a visual issue and asks for a fix, don't re-check whether it exists; focus on fixing it. Only ask for screenshots if they are needed to understand the issue, and ask for them upfront to avoid unnecessary credit use.

---

## Repository Context

**Repository:** marx1980/Cardshark  
**Live:** GitHub Pages from `main` branch  
**Architecture:** Single-file HTML app (~5.2k lines) with game engines, AI, and online play via Cloudflare Worker

**Key files:**
- `index.html` – Full app (ENGINE, AI, UI, games: Briškula/Bela/Trešeta/Solitaire/Uno/Poker/Remi)
- `sw.js` – Service worker cache management
- `server/src/worker.js` – Online play backend (Cloudflare)
- `HANDOVER.md` – Release notes and developer handover

**Current version:** v58 (live)

---

## Version Management

Version bumps are required for all releases:
- App version: `${t.credit} · vNN` in `index.html` (around line 5200)
- Cache version: `const V = 'cardshark-vNN'` in `sw.js` (line 2)
- Documentation: Update `HANDOVER.md` with release summary
