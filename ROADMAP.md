# MIM VENTURES — Roadmap

## Original Vision
Build a free-first web + Android/iOS trading platform/dashboard for **Forex, Crypto, and Wall Street** with:
- User-friendly charts
- Current market/news
- Dark theme
- AI that monitors, helps, performs tasks, studies, learns, and improves over time

## Best-of Combined Enhancements
| Area | Best Pick | Why |
|---|---|---|
| Cloud memory | **Supabase** (Postgres/Auth/Storage) | Free tier, persistent AI memory, watchlists, profiles |
| Market data | **Adapter pattern** (CoinGecko/Stooq/RSS now, OpenBB-inspired later) | Free-first, swappable providers |
| AI brain | **AI provider abstraction** (rule-based MVP -> Groq/Ollama/HF) | Free/local options, easy upgrade |
| Agent workflow | **Superalgos-inspired, safety-first** | Monitor/study/alert; paper-trade; confirm-before-execute |
| Learning loop | **Supabase ai_memory + feedback logs** | AI learns from interactions and outcomes over time |
| Charts | **TradingView Lightweight Charts** (Phase 1) | Pro financial charts, free OSS |
| Mobile | **Expo React Native** | Shared TypeScript/domain logic |

> Inspiration: [OpenBB](https://github.com/OpenBB-finance/OpenBB) (data/analytics patterns), [Superalgos](https://github.com/Superalgos/Superalgos) (safe agent workflows), [pythonidae AI](https://github.com/svaksha/pythonidae/blob/main/AI.md), [knowledge-bits AI](https://github.com/reasn/knowledge-bits/blob/master/ai.md).

## Phase 0 - Foundation (MVP scaffold)
- [x] Repository initialized
- [x] Project docs: architecture, roadmap, README
- [x] Web app scaffold (static MVP, dark theme)
- [x] Dashboard layout: charts, news, watchlist, AI panel
- [x] Mock data adapters and local interactions
- [x] Supabase cloud-memory schema + browser client stub
- [ ] Basic lint/typecheck/build scripts (when migrated to Next.js)

**Outcome:** runnable web MVP with mock trading/news/AI experience + Supabase-ready memory.

## Phase 1 - Live Data & Usable Dashboard
- [x] Next.js migration scaffold with API proxy; the static MVP remains the supported UI
- [x] Integrate free/indicative market data adapters (Yahoo proxies with mock fallback)
- [x] Add watchlist persistence in Supabase
- [x] Integrate curated market/news feeds focused on XAU/USD and DXY
- [x] Add dependency-free TradingView-style canvas chart with timeframes/indicators
- [x] Responsive/mobile-web polish

**Outcome:** useful daily dashboard with real data and cloud-synced watchlists. Next.js migration remains deferred; the shipped MVP is a static web app.

## Phase 2 - AI Assistant v1
- [x] `AIProvider` abstraction (rule-based fallback -> Groq)
- [x] AI chat panel with market/news context
- [x] Scheduled summaries: "market open", "daily recap" with deterministic Malay fallback
- [x] Alert explanations ("why this moved")
- [x] User preference memory in Supabase (risk profile, interests)
- [x] AI feedback capture (thumbs up/down, outcome notes) for learning loop
- [x] Safety guardrails and disclaimer UX

**Outcome:** AI helps monitor and explain, with persistent cloud memory and user control. Scheduled summaries remain a future addition.

## Phase 3 - Mobile Apps
- [x] Expo React Native app scaffold
- [x] Shared API client package (`shared/api-client.js`)
- [x] Core screens: dashboard, watchlist, news, AI chat, settings
- [x] Local alert notifications plus Expo push token registration and server push sender
- [x] Supabase Auth and settings/watchlist/chat sync across web/mobile

**Outcome:** Android/iOS companion app with shared cloud memory. Run `cd mobile && npm install && cp .env.example .env && npm start`; set `EXPO_PUBLIC_API_BASE_URL` to a reachable TradeWall server.

## Phase 4 - AI Agent Workflows (Safe)
- [x] Background monitoring jobs (price/anomaly evaluation with server interval)
- [x] Strategy study/backtest endpoint (educational SMA-cross simulation)
- [x] Recommendation evaluation and feedback loop (`/api/paper/evaluate`, `ai_evaluations`)
- [x] Paper trading simulation first (`EXECUTE PAPER` confirmation required)
- [x] Optional broker adapters scaffolded - **live orders disabled; confirm-before-execute only**
- [x] Audit logs for all AI-suggested/executed actions

**Outcome:** AI can study, monitor, and assist workflows safely; learns continuously from user-approved outcomes. Live broker execution remains disabled and belongs to Phase 5.

## Phase 5 - MT5/MetaApi Live Integration (Guarded)
- [x] MetaApi token vault and readiness checks (server-side only; credentials never returned to clients)
- [x] Execution adapter interface with blocked-by-default `disabled` adapter and dynamic named adapters
- [x] Deterministic risk gate service (position sizing, daily loss, exposure, stale/spread checks)
- [x] Human approval UI/card before any live order on web and mobile
- [x] Kill switch, circuit breakers, and reconciliation endpoints/jobs
- [x] Immutable hash-chained audit log for proposals, approvals, orders, broker responses, and verification
- [x] Configurable `metaapi-http` execution/reconciliation adapter with fail-closed endpoints and server-only credentials

**Outcome:** Guarded live scaffolding is ready and fail-closed. Set server credentials and `LIVE_ADAPTER=metaapi-http` with the configured endpoints; every order still requires explicit admin/approval confirmation and a fresh risk check.

## Phase 6 - Agent-Native Operator Layer
- [x] JSON CLI (`npm run cli -- ...`) with read-only commands for health, market, watchlist, news, monitor, broker, audit, and AI
- [x] Guarded CLI write commands with exact confirmations and admin-token headers for paper/live workflows
- [x] Filterable `GET /api/audit` endpoint for hash-chained audit entries
- [x] In-app audit trail viewer on web and mobile, plus chain verification
- [x] Automated CLI, HTTP, and shared-client coverage

**Outcome:** Operators and agents can inspect and drive MIM VENTURES through machine-readable commands without secrets in outputs; audit history is visible in-app and verifiable from CLI/API.

## Phase 7 - Production Integration Layer
- [x] `metaapi-http` live execution/reconciliation adapter driven by server-only endpoints and credentials
- [x] Licensed market-data adapter mode plus `GET /api/screener`
- [x] Market summaries with scheduled interval support and web/mobile actions
- [x] Saved chart templates and screener panel on web
- [x] Expo push token registration, RLS-protected token storage, and admin-guarded `POST /api/notifications/push`
- [x] Optional server-side HttpOnly Supabase session endpoints with CSRF/origin checks and no browser secrets
- [x] Next.js migration scaffold with an `/api/[...path]` proxy; static MVP remains intact
- [x] Automated tests for every new module plus updated API/CLI coverage

**Outcome:** All deferred integration items now have working, fail-closed implementations. External value still depends on credentials/providers (MetaApi endpoints, licensed feed, Expo EAS project ID, Supabase project, and push admin token).

## Phase 8 - Autonomous Paper Analyst and Trading Room
- [x] $100 paper account with 1% risk/trade, 3% daily loss cap, and 2-position exposure cap
- [x] Self-updating paper lessons per XAU/USD and DXY, with cross-asset USD/gold notes
- [x] Deep research mode with nine-section evidence, scenario, sizing, and risk report
- [x] AI Trading Room explaining why BUY, SELL, or NO TRADE was proposed
- [x] Web and mobile panels for capital, learning, deep research, and decision chat
- [x] Automated unit and HTTP coverage for paper caps, learning, research, and explanations

**Outcome:** Public users can trial an educational paper analyst that learns from evaluated outcomes and explains every proposal. Real live trading remains opt-in, credential-dependent, approval-gated, and outside the public demo.
