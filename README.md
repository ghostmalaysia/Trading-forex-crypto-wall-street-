# Trading Forex / Crypto / Wall Street Platform

Free-first web + mobile trading intelligence dashboard with AI-assisted monitoring, news, and learning.

## What’s in this repo
- `ARCHITECTURE.md` - system design, stack, modules, data flow
- `ROADMAP.md` - phased delivery plan
- `web/` - runnable static MVP dashboard (no build required)
- `supabase/` - cloud memory schema (profiles, watchlists, AI memory, alerts)
- `docs/` - product notes, references, and integration plan

## MVP Features (current)
- Dark-theme trading dashboard UI
- Market watchlist (Forex/Crypto/Stocks) with mock live updates
- Simple price chart (canvas) with symbol/timeframe switching
- Market/news feed panel
- AI assistant panel (local mock responses, safety disclaimer)
- Responsive layout for desktop/mobile web
- Working in-page navigation and keyboard-accessible watchlist selection
- Mock price changes stay anchored to a reference price, avoiding cumulative percentage drift
- Optional Longbridge live quotes for US stocks through a local, read-only Node.js bridge

## Run locally
No dependencies required for the static MVP:

```bash
# from repo root
python3 -m http.server 8080
# open http://localhost:8080/web/
```

Or open `web/index.html` directly in a browser.

> **Data status:** the dashboard currently uses generated mock prices, news, and assistant replies. The refresh button advances the mock feed; it does not fetch live market data. Configure Supabase only for optional chat/watchlist memory (see `web/supabase-config.example.js`).

## Optional Longbridge stock quotes

TradeWall can request live quotes for the stock symbols in its watchlist through Longbridge Terminal's local JSON-RPC service. This integration is read-only: the TradeWall bridge only requests quotes and exposes no order or account operations. Forex, crypto, gold, and news remain mock data.

1. Install [Longbridge Terminal](https://github.com/longbridge/longbridge-terminal) and complete its OAuth login with `longbridge auth login`.
2. Start TradeWall with Node.js 18 or newer: `node server.mjs`.
3. Open `http://127.0.0.1:8080`. The bridge listens on localhost and starts Longbridge Terminal using `longbridge serve`.

If Longbridge is unavailable or not logged in, the dashboard clearly falls back to simulated quotes. Use `LONGBRIDGE_BIN=/path/to/longbridge` if the executable is not on `PATH`, or `PORT=8090` to change the local web port. The bridge does not expose the JSON-RPC process or any trading methods to the browser.

## Project Vision
Build a platform/dashboard for web and Android/iOS that includes:
- User-friendly charts
- Current market/news
- Dark theme
- AI that monitors, helps, performs tasks, studies, learns, and improves over time
- **Free for customers**: full trading toolkit available on web and mobile at no platform cost (see `docs/FREE-ACCESS-PLAN.md`)

## Key References (Best-of)
- **[TradingView](https://www.tradingview.com/)** - UX/feature benchmark (charts, screeners, heatmaps, alerts, news/calendar, paper trading). Target: free parity for core tools.
- **[OpenBB](https://github.com/OpenBB-finance/OpenBB)** - data/analytics platform patterns (adapter-based market data).
- **[Superalgos](https://github.com/Superalgos/Superalgos)** - safe agent/workflow automation ideas (paper-trade, confirm-before-execute).
- **[CLI-Anything](https://github.com/HKUDS/CLI-Anything)** - agent-native CLI pattern; future `cli-anything-tradewall` for structured `--json`/REPL control of platform workflows.
- **[MetaApi](https://metaapi.cloud/docs/client/)** / **MT5** - cloud broker connectivity path for MT4/MT5 (web-friendly); official `MetaTrader5` Python for Windows VPS workers.
- **Supabase** - cloud memory (profiles/watchlists/AI memory/alerts). See `docs/BEST-OF-INTEGRATION.md`, `docs/FREE-ACCESS-PLAN.md`, and `docs/MT5-AI-INTEGRATION.md`.

## Safety
- AI output is informational only, **not financial advice**.
- No automated trading/execution in MVP.
- Any future automation must be permissioned and confirm-before-execute.

## Next Steps
See `ROADMAP.md` for Phase 1+ (real data adapters, persistence, AI provider integration, Expo mobile app).
