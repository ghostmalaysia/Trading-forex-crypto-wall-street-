# Trading Forex / Crypto / Wall Street Platform

Free-first web + mobile trading intelligence dashboard with AI-assisted monitoring, news, and learning.

## What’s in this repo
- `ARCHITECTURE.md` - system design, stack, modules, data flow
- `ROADMAP.md` - phased delivery plan
- `web/` - runnable static MVP dashboard (no build required)
- `mobile/` - Expo app scaffold consuming the same Node APIs
- `supabase/` - cloud memory schema (profiles, watchlists, AI memory, alerts, AI learning, trade plans, audit logs, live events)
- `ai/` - AI prompt/provider/plan modules plus safe agent and guarded-live modules (monitor, backtest, execution, broker, audit chain, token vault, risk gate, approvals, circuit breaker, reconciliation)
- `cli/` - agent-native JSON CLI for read-only inspection and guarded write workflows
- `tests/` - automated AI, HTTP, agent, live guard, CLI, shared client, and mobile cloud client tests
- `shared/` - API client and curated feed data shared by server and mobile
- `docs/` - product notes, references, and integration plan
- `Dockerfile` / `docker-compose.yml` - container deployment config

## MVP Features (current)
- Dark-theme trading dashboard UI
- Market watchlist (Forex/Crypto/Stocks) with mock live updates
- TradingView-style canvas chart: candlesticks, volume, MA20/MA50, Bollinger Bands, RSI14, MACD, crosshair, zoom/pan, horizontal/trend drawing tools
- Indicative live feed for XAU/USD (GC=F proxy) and DXY (DX-Y.NYB), with mock fallback
- Price alerts for gold/USD with optional private Supabase persistence
- Economic calendar panel with curated mock events
- Market/news feed panel
- AI assistant focused on **XAU/USD (gold)** and **USD/DXY** only
- Chart-aware AI: reads the selected chart series, computes SMA/RSI/ATR/trend, and explains its view
- AI trade plans with risk gate (1% cap, R:R, exposure, fresh data) and human approval in paper mode
- Feedback buttons feed per-user AI learning in Supabase
- Append-only audit logs for AI requests, plan decisions, feedback, and alerts
- Agent Lab: background monitor rules/anomaly events, educational SMA-cross backtest, paper order simulation, evaluation feedback, and broker status
- Guarded-live controls: server-side token vault, deterministic risk gate, HMAC approval, kill switch, circuit breaker, reconciliation, and hash-chained audit verification
- Audit trail viewer with event filters plus CLI commands for machine-readable inspection and guarded workflows
- Server-side monitor interval with audit events for monitor, backtest, paper order, evaluation, and guarded-live actions
- Automated `node:test` coverage for AI logic and HTTP endpoints
- Responsive layout for desktop/mobile web
- Expo mobile app with shared API client, six core screens, Supabase sync, and local alert notifications
- Working in-page navigation and keyboard-accessible watchlist selection
- Mock price changes stay anchored to a reference price, avoiding cumulative percentage drift
- Optional Longbridge live quotes for US stocks through a local, read-only Node.js bridge
- Supabase Auth accounts for private, per-user cloud memory

## Run locally
No dependencies required for the static MVP:

```bash
# from repo root (Node 20+)
node server.mjs
# open http://127.0.0.1:8080/
```

Opening `web/index.html` directly still works for the static UI, but AI requests require `server.mjs`.

## Agent-native CLI

The CLI emits JSON by default and never prints tokens. Read-only commands need no confirmation:

```bash
npm run cli -- help
npm run cli -- market --pretty
npm run cli -- audit logs --limit 20 --event live_order_result
npm run cli -- audit verify
npm run cli -- live status
```

Write commands require exact confirmations; guarded-live commands also need `--admin-token` or `TRADEWALL_LIVE_ADMIN_TOKEN`:

```bash
npm run cli -- paper order --plan-file plan.json --risk-file risk.json --context-file context.json --confirm "EXECUTE PAPER"
npm run cli -- live proposal --plan-file plan.json --risk-file risk.json --context-file context.json --account-file account.json
npm run cli -- live approve --proposal-id live-123 --confirm "APPROVE LIVE"
npm run cli -- live order --approval-file approval.json --confirm "EXECUTE LIVE"
npm run cli -- live kill-switch --enabled false --confirm "DISABLE KILL SWITCH"
```

Set `TRADEWALL_API_BASE_URL` (or `--base`) to target a different server. The default adapter still blocks live orders unless the server is configured with a real adapter.

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

Without a key, the server returns a clearly labelled local fallback. The key is never sent to the browser. Plans are normalized, checked by the risk gate, and remain `paperOnly`. Approve/Reject writes an audit row to Supabase when signed in. Apply [`supabase/migrations/202611270001_ai_learning_and_plans.sql`](supabase/migrations/202611270001_ai_learning_and_plans.sql), [`supabase/migrations/202611270002_audit_logs.sql`](supabase/migrations/202611270002_audit_logs.sql), and [`supabase/migrations/202611280001_agent_workflows.sql`](supabase/migrations/202611280001_agent_workflows.sql), plus [`supabase/migrations/202611290001_guarded_live.sql`](supabase/migrations/202611290001_guarded_live.sql) for guarded-live events, for existing projects, or use `supabase/schema.sql` for fresh ones. The Node server also appends operational events to `data/audit.jsonl` (override with `AUDIT_LOG_FILE`).

## Agent workflows (paper-only)

The Agent Lab adds `GET /api/monitor`, `POST /api/monitor/rules`, `POST /api/monitor/run`, `POST /api/backtest`, `GET /api/broker/status`, `POST /api/paper/order`, and `POST /api/paper/evaluate`. Rule evaluation and anomaly detection run on a server interval and are limited to XAU/USD and DXY. Backtests are educational simulations, not predictive research.

Paper execution only accepts an approved plan and the exact confirmation string `EXECUTE PAPER`. `POST /api/paper/order` simulates slippage and returns a `paperOnly` order; `POST /api/paper/evaluate` reports outcome and PnL. Signed-in users can persist orders in `paper_orders` and feedback in `ai_evaluations`. Paper mode remains the default; the guarded-live adapter is separate and blocks orders until explicitly configured.

Configure paper monitoring with `MONITOR_RULES` (JSON array), `MONITOR_INTERVAL_SECONDS` (minimum 30), and `MONITOR_ZSCORE`. `GROQ_API_KEY` remains server-side only.

## Guarded live workflow

Live trading is opt-in and fail-closed. The kill switch is armed unless `LIVE_KILL_SWITCH=false`. Readiness requires `ENABLE_LIVE_TRADING=true`, `METAAPI_TOKEN`, `METAAPI_ACCOUNT_ID`, `LIVE_ADMIN_TOKEN`, `LIVE_APPROVAL_SECRET`, and an available adapter. Tokens never leave the server; `/api/live/status` reports only configuration status and adapter metadata.

The flow is `POST /api/live/proposal` -> `POST /api/live/approve` -> `POST /api/live/order`. The exact confirmations are `APPROVE LIVE` and `EXECUTE LIVE`; disarming needs `DISABLE KILL SWITCH`. Admin endpoints accept `x-live-admin-token` or `adminToken` in the JSON body. `POST /api/live/reconcile` summarizes broker/local order drift, and `GET /api/audit/verify` verifies the SHA-256 hash chain in `data/audit.jsonl`.

`LIVE_ADAPTER=disabled` is the default and returns `LIVE_PROVIDER_NOT_WIRED`. To wire a real broker, add `ai/adapters/<name>.mjs` with `placeOrder()` and optional `reconcile()`; it receives a credential provider rather than raw secrets. Suggested live settings: `LIVE_MAX_RISK_PCT`, `LIVE_MIN_REWARD_RISK`, `LIVE_MAX_DAILY_LOSS_PCT`, `LIVE_MAX_OPEN_POSITIONS`, `LIVE_MAX_STALE_SECONDS`, `LIVE_MAX_SPREAD_PCT`, `LIVE_MAX_NOTIONAL`, `LIVE_MIN_EQUITY`, `LIVE_APPROVAL_TTL_SECONDS`, `LIVE_CIRCUIT_FAILURES`, `LIVE_CIRCUIT_COOLDOWN_SECONDS`, and `LIVE_RECONCILE_INTERVAL_SECONDS`. Signed-in users persist live event metadata in `live_events` with per-user RLS; approval tokens are not stored.

## Testing

```bash
npm test
```

Tests use `node:test` with no external dependencies. They cover chart analysis, plan normalization, risk-gate decisions, focus limits, prompt contracts, monitor rules/anomalies, backtests, paper execution/evaluation, broker status, guarded-live risk/approval/circuit/reconciliation, health/market/news/agent/AI/live/audit endpoints, CLI parsing and guard rails, static serving, path traversal rejection, shared API client, and hash-chained audit logs. The HTTP test starts a local stub market feed, so it does not require internet access.

## Deployment

Copy `.env.example` to `.env` and set server-side secrets there. For containers:

```bash
docker compose up --build
```

The container binds `HOST=0.0.0.0` on port `8080`, mounts a persistent volume for `data/audit.jsonl`, and includes a health check against `/api/health`. Docker is not required for local `node server.mjs` usage. Do not place `GROQ_API_KEY`, database secrets, or `web/supabase-config.js` in the image or browser bundle.

## Mobile app

`mobile/` is an Expo React Native app using the shared `shared/api-client.js` module. It has Dashboard, Watchlist, News, AI Desk, Agent Lab, and Settings screens; it calls `/api/health`, `/api/market`, `/api/news`, `/api/ai`, `/api/monitor`, `/api/backtest`, `/api/paper/order`, `/api/paper/evaluate`, `/api/broker/status`, and the guarded-live/audit endpoints. The Agent Lab now includes an audit trail viewer with event filters and chain verification. Supabase Auth, preferences, watchlist, chat, paper orders, evaluations, and live event metadata sync through `mobile/supabase-client.js`, stored locally with AsyncStorage. Alert rules are evaluated on-device and use Expo local notifications after permission is granted.

```bash
cd mobile
npm install
cp .env.example .env
npm start
```

Set `EXPO_PUBLIC_API_BASE_URL` to a reachable server URL: Android emulator uses `http://10.0.2.2:8080`, iOS simulator uses `http://localhost:8080`, and a physical device needs your LAN address or deployed HTTPS URL. The Settings screen can override the API base and Supabase publishable key without a rebuild. The mobile app defaults to paper-only; guarded-live controls remain blocked unless the server is configured and the explicit admin/approval flow is completed.

## Market data, alerts, and calendar

`GET /api/market` fetches indicative quotes and daily closes for **XAU/USD** (Yahoo `GC=F` futures proxy) and **DXY** (`DX-Y.NYB`) through a server-side adapter. It caches results for 60 seconds and falls back to the simulated feed if a provider is unavailable. Override with `MARKET_DATA_BASE_URL`, `MARKET_DATA_INTERVAL`, `MARKET_DATA_RANGE`, and `MARKET_DATA_TTL_SECONDS` if you use a compatible chart endpoint or proxy.

Price alerts are evaluated in the browser against XAU/USD and DXY. They notify locally and never place orders. When signed in, alerts and their triggered state are stored per user in Supabase; apply `supabase/migrations/202611260001_secure_user_memory.sql` for existing projects (or `supabase/schema.sql` for fresh ones). The economic calendar is curated mock data until a calendar provider is connected.

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
- Default mode is paper-only; AI plans require explicit human approval.
- Agent Lab simulations require `EXECUTE PAPER`; the default live adapter blocks all orders.
- Guarded live is fail-closed: kill switch, risk gate, HMAC approval, circuit breaker, reconciliation, and audit verification must all pass.
- Any live adapter must be permissioned and confirm-before-execute; secrets stay server-side.

## Next Steps
See `docs/next-steps.md` and `ROADMAP.md` for the remaining work. Phases 1–6 cover live indicative data, alerts, chart tools, AI plans, audit logs, tests, deployment config, safe agent workflows, the mobile app, guarded live scaffolding, and the agent-native operator layer; a real broker adapter, licensed spot feeds, production auth, and remote push tokens remain integration work.
