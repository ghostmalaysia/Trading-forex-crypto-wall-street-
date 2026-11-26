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
- [ ] Integrate free market data providers via `DataProvider` adapter
- [ ] Add symbol search and watchlist persistence in Supabase
- [ ] Integrate news/RSS feeds and filters (Forex/Crypto/Stocks)
- [ ] Add TradingView Lightweight Charts with timeframes/indicators
- [ ] Responsive/mobile-web polish

**Outcome:** useful daily dashboard with real data and cloud-synced watchlists.

## Phase 2 - AI Assistant v1
- [ ] `AIProvider` abstraction (mock -> free LLM/local model)
- [ ] AI chat panel with market/news context
- [ ] Scheduled summaries: "market open", "daily recap"
- [ ] Alert explanations ("why this moved")
- [ ] User preference memory in Supabase (risk profile, interests)
- [ ] AI feedback capture (thumbs up/down, outcome notes) for learning loop
- [ ] Safety guardrails and disclaimer UX

**Outcome:** AI helps monitor and explain, with persistent cloud memory and user control.

## Phase 3 - Mobile Apps
- [ ] Expo React Native app scaffold
- [ ] Shared types/API client package
- [ ] Core screens: dashboard, watchlist, news, AI chat
- [ ] Push notifications for alerts
- [ ] Supabase Auth and settings sync across web/mobile

**Outcome:** Android/iOS companion app with shared cloud memory.

## Phase 4 - AI Agent Workflows (Safe)
- [ ] Background monitoring jobs (price/news/anomaly alerts)
- [ ] Strategy study/backtest notebooks (educational)
- [ ] Recommendation evaluation and feedback loop
- [ ] Paper trading simulation first
- [ ] Optional broker integrations (MetaApi/MT5) - **confirm-before-execute only**
- [ ] Audit logs for all AI-suggested/executed actions

**Outcome:** AI can study, monitor, and assist workflows safely; learns continuously from user-approved outcomes.

## Phase 5 - MT5/MetaApi Live Integration (Guarded)
- [ ] MetaApi account connection (token vault, server-side only)
- [ ] Execution adapter interface: `PaperBroker` / `MetaApiBroker`
- [ ] Deterministic risk gate service (position sizing, daily loss, exposure, stale/spread checks)
- [ ] Human approval UI/card before any live order
- [ ] Kill switch, circuit breakers, and reconciliation jobs
- [ ] Immutable audit log for proposals, approvals, orders, broker responses

**Outcome:** Optional live MT5 trading through dashboard, gated by deterministic risk controls and explicit user approval.
