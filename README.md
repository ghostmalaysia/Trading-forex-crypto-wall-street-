# Trading Forex / Crypto / Wall Street Platform

Free-first web + mobile trading intelligence dashboard with AI-assisted monitoring, news, and learning.

## What’s in this repo
- `ARCHITECTURE.md` - system design, stack, modules, data flow
- `ROADMAP.md` - phased delivery plan
- `web/` - runnable static MVP dashboard (no build required)
- `supabase/` - cloud memory schema (profiles, watchlists, AI memory, alerts, AI learning, trade-plan audit)
- `docs/` - product notes, references, and integration plan

## MVP Features (current)
- Dark-theme trading dashboard UI
- Market watchlist (Forex/Crypto/Stocks) with mock live updates
- TradingView-style canvas chart: candlesticks, volume, MA20/MA50, RSI14, crosshair, zoom/pan, horizontal/trend drawing tools
- Market/news feed panel
- AI assistant focused on **XAU/USD (gold)** and **USD/DXY** only
- Chart-aware AI: reads the selected chart series, computes SMA/RSI/ATR/trend, and explains its view
- AI trade plans with risk gate (1% cap, R:R, exposure, fresh data) and human approval in paper mode
- Feedback buttons feed per-user AI learning in Supabase
- Responsive layout for desktop/mobile web
- Working in-page navigation and keyboard-accessible watchlist selection
- Mock price changes stay anchored to a reference price, avoiding cumulative percentage drift
- Optional Longbridge live quotes for US stocks through a local, read-only Node.js bridge
- Supabase Auth accounts for private, per-user cloud memory

## Run locally
No dependencies required for the static MVP:

```bash
# from repo root (Node 18+)
node server.mjs
# open http://127.0.0.1:8080/
```

Opening `web/index.html` directly still works for the static UI, but AI requests require `server.mjs`.

> **Data status:** prices, news, and fallback AI replies are simulated unless you connect a provider. The refresh button advances the mock feed. Supabase stores chat, preferences, learning, and plan decisions only after sign-in.

## Secure Supabase memory

1. In the Supabase SQL Editor, apply [`supabase/migrations/202611260001_secure_user_memory.sql`](supabase/migrations/202611260001_secure_user_memory.sql) for existing projects, or `supabase/schema.sql` for a fresh project. This grants authenticated users access only to rows matching their Auth user ID.
2. Enable email sign-up in Supabase Auth and set the project's Site URL to the TradeWall URL.
3. In the dashboard's **Cloud memory** card, enter the Supabase URL and publishable (or legacy anon) key, then press **Test** or **Save**. Settings are stored in that browser only; **Clear saved settings** removes them. Never put a `service_role` key in browser code.
4. Sign in or create an account in the dashboard to enable cloud memory. Without an authenticated session, chat stays in the current browser session and nothing is saved to Supabase.

For deployments, `web/supabase-config.example.js` can still be copied to the gitignored `web/supabase-config.js` as a default; values entered in the dashboard override it on that device. The previous MVP used shared anonymous access. Rows written with anonymous browser keys cannot be safely attributed to a new account, so they remain inaccessible under the new policies. Export or manually review any legacy data before removing it.

## Chart-aware AI and paper plans

The Node server exposes `POST /api/ai` with `mode: "chat" | "plan"`. The browser sends a sanitized context containing the selected symbol, timeframe, chart series, recent lessons, and conversation history. The server adds platform knowledge from the repo docs, builds a focus prompt for **XAU/USD** and **DXY**, and computes chart statistics locally before calling the model.

Set `GROQ_API_KEY` in the server environment to enable a live Groq model:

```bash
GROQ_API_KEY=your_key GROQ_MODEL=openai/gpt-oss-20b node server.mjs
```

Without a key, the server returns a clearly labelled local fallback. The key is never sent to the browser. Plans are normalized, checked by the risk gate, and remain `paperOnly`. Approve/Reject writes an audit row to Supabase when signed in. Apply [`supabase/migrations/202611270001_ai_learning_and_plans.sql`](supabase/migrations/202611270001_ai_learning_and_plans.sql) for existing projects, or use `supabase/schema.sql` for fresh ones.

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
- No automated trading/execution in MVP; AI plans are paper-only and require explicit human approval.
- Any future automation must be permissioned and confirm-before-execute.

## Next Steps
See `ROADMAP.md` for Phase 1+ (real data adapters, persistence, AI provider integration, Expo mobile app).
