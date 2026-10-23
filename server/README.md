# Cardshark online server

Cloudflare Worker + Durable Objects. The server deals, checks every move and sends each player only their own cards.

- `src/worker.js` – routes, open-table lobby, player records (ratings), tables (seats, turn timer, bot takeover)
- `src/runner.js` – the match flow for Briškula, Trešeta and Bela (same rules as the app)
- `src/view.js` – what each player may see, rotated so every player sits at the bottom
- `src/engine.js`, `src/ai.js` – copied from the app

Deploys automatically on push (see `.github/workflows/deploy-server.yml`).
