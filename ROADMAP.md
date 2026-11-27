# Roadmap

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
- [ ] Migrate web to Next.js + TypeScript + Tailwind
- [x] Integrate free/indicative market data adapters (Yahoo proxies with mock fallback)
- [x] Add watchlist persistence in Supabase
- [x] Integrate curated market/news feeds focused on XAU/USD and DXY
- [x] Add dependency-free TradingView-style canvas chart with timeframes/indicators
- [x] Responsive/mobile-web polish

**Outcome:** useful daily dashboard with real data and cloud-synced watchlists. Next.js migration remains deferred; the shipped MVP is a static web app.

## Phase 2 - AI Assistant v1
- [x] `AIProvider` abstraction (rule-based fallback -> Groq)
- [x] AI chat panel with market/news context
- [ ] Scheduled summaries: "market open", "daily recap"
- [x] Alert explanations ("why this moved")
- [x] User preference memory in Supabase (risk profile, interests)
- [x] AI feedback capture (thumbs up/down, outcome notes) for learning loop
- [x] Safety guardrails and disclaimer UX

**Outcome:** AI helps monitor and explain, with persistent cloud memory and user control. Scheduled summaries remain a future addition.

## Phase 3 - Mobile Apps
- [x] Expo React Native app scaffold
- [x] Shared API client package (`shared/api-client.js`)
- [x] Core screens: dashboard, watchlist, news, AI chat, settings
- [x] Local alert notifications (Expo Notifications; remote push tokens not yet wired)
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

**Outcome:** Guarded live scaffolding is ready and fail-closed. A real live broker adapter plus server credentials must still be configured; every order requires explicit admin/approval confirmation and a fresh risk check.

## Phase 6 - Agent-Native Operator Layer
- [x] JSON CLI (`npm run cli -- ...`) with read-only commands for health, market, watchlist, news, monitor, broker, audit, and AI
- [x] Guarded CLI write commands with exact confirmations and admin-token headers for paper/live workflows
- [x] Filterable `GET /api/audit` endpoint for hash-chained audit entries
- [x] In-app audit trail viewer on web and mobile, plus chain verification
- [x] Automated CLI, HTTP, and shared-client coverage

**Outcome:** Operators and agents can inspect and drive TradeWall through machine-readable commands without secrets in outputs; audit history is visible in-app and verifiable from CLI/API. Real broker credentials, licensed feeds, push tokens, and production auth remain future work.
