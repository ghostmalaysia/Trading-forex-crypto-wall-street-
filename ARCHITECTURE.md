# Architecture

## Vision
A free-first trading intelligence platform for Forex, Crypto, and Wall Street markets, delivered as:
- **Web dashboard** (primary MVP)
- **Mobile apps** (Android/iOS via shared codebase)
- **AI assistant/agent layer** for monitoring, insights, and workflow automation

## Product Principles
- **Free-first**: prefer open-source and free-tier services/APIs.
- **User-friendly**: clear charts, fast navigation, dark theme by default.
- **Modular**: separate data, AI, and UI so providers can be swapped.
- **Safe AI**: AI provides analysis and suggestions; trade execution requires explicit user confirmation and broker integration controls.
- **Incremental learning**: store user preferences, strategy outcomes, and feedback for continuous improvement.

## High-Level System

```text
[Market/News Providers] ---> [Ingestion/API Layer] ---> [App Backend]
                                      |                     |
                                      |                     +--> [AI Services]
                                      |                              |
                                      v                              v
                               [Cache/DB] <-------------- [Insights/Alerts]
                                      |
                                      v
                        [Web App / Mobile App / Notifications]
```

## Proposed Stack (MVP -> Scale)

### Web (MVP)
- **Next.js (React, TypeScript)**: fast dashboard UI, SSR/ISR for news/content.
- **Tailwind CSS**: rapid dark-theme UI.
- **TradingView Lightweight Charts / Recharts**: free charting options (MVP can start with simple charts).
- **TanStack Query**: client data fetching/caching.
- **Current scaffold**: static HTML/CSS/JS MVP in `web/` for fast iteration; migrate to Next.js in Phase 1.

### Mobile
- **Expo React Native**: shared business logic/UI patterns with web where practical.
- **Push notifications**: Expo Notifications / Firebase free tier (later).

### Backend / Data
- **MVP**: Next.js Route Handlers as BFF (backend-for-frontend).
- **Cache/DB**: SQLite/Postgres (Supabase free tier) for user settings, watchlists, AI notes.
- **Job/cron**: GitHub Actions cron / Vercel Cron / lightweight worker for periodic news/market pulls.

### AI Layer
- **Provider abstraction**: `AIProvider` interface to swap models (local/open/free-tier APIs).
- **Capabilities**:
  - Market/news summarization
  - Watchlist monitoring and alert explanations
  - Strategy/study assistant (educational, not financial advice)
  - Task automation suggestions (with confirmation)
- **Memory/Learning**:
  - Store user profile, risk preferences, watched assets in Supabase
  - Log AI recommendations and outcomes for evaluation
  - Retrieval layer (embeddings/pgvector later; simple DB first)

### Agent-Native Interface (CLI-Anything reference)
- **Pattern**: `cli/tradewall.mjs` exposes core workflows as a JSON CLI using the shared API client (inspired by [CLI-Anything](https://github.com/HKUDS/CLI-Anything)).
- **Commands**: `help`, `health`, `market`, `watchlist`, `news`, `monitor`, `monitor rules`, `monitor run`, `broker`, `audit logs`, `audit verify`, `ai`, `paper order`, `paper evaluate`, and guarded `live` commands.
- **Safety**: read/analyze commands need no confirmation; paper/live writes require exact confirmation strings, guarded-live writes require an admin token, and secrets are never included in output.

### Trading Execution Layer (MT5/MetaApi, phased)
- **Observe mode (default)**: read-only market data, AI analysis, alerts.
- **Paper mode**: simulated broker adapter; same risk/audit pipeline, no real orders.
- **Guarded live mode (scaffolded, off by default)**: MetaApi cloud adapter for MT4/MT5, or Windows VPS worker using official `MetaTrader5` Python package. The default adapter blocks all live orders until a named adapter is wired.
- **Execution flow**: `AI TradeProposal -> Deterministic Risk Gate -> HMAC Human Approval -> Kill Switch/Circuit Breaker -> Execution Adapter -> MT5/Broker -> Hash-chained Audit Log`.
- **Hard limits**: max risk per trade, daily loss/drawdown cap, exposure limits, stale-signal block, spread/slippage guard, kill switch, approval TTL, reconciliation drift checks.

## Core Modules

| Module | Responsibility | MVP |
|---|---|---|
| Auth/Profile | User identity, preferences, theme | Local/mock profile |
| Market Data | Quotes, candles, symbol search | Mock/free API adapter |
| Charts | Interactive price charts | Basic candlestick/line |
| News | Market headlines, filtering | Mock/RSS adapter |
| Watchlist/Alerts | Track assets, thresholds | Basic watchlist |
| AI Assistant | Chat, summaries, monitoring | Rule-based fallback + Groq provider |
| Agent Workflows | Monitor rules, anomaly detection, backtests, paper execution | Safe paper-only modules and audit events |
| Guarded Live | Token vault, deterministic risk gate, approvals, breaker, reconciliation | Fail-closed scaffold; default adapter blocks live orders |
| Operator CLI | JSON commands for inspection and guarded workflows | `cli/tradewall.mjs` with confirmation gates and no secrets in output |
| Mobile Shell | Shared navigation and screens | Expo app with dashboard, news, AI, guarded-live, audit, and agent screens |

## Data Flow
1. **Ingestion** pulls market/news data from free providers.
2. **Normalization** maps provider responses to internal types.
3. **Storage/cache** keeps recent data for fast dashboard loads.
4. **UI** renders charts/news/watchlist via BFF endpoints.
5. **AI** consumes normalized data + user context to generate insights/alerts.
6. **Feedback loop** records user actions and AI outcome ratings.
7. **Agent workflows** evaluate monitor rules/anomalies on a server interval, run educational backtests, simulate fills with explicit confirmation, and audit every action.
8. **Guarded live** promotes an approved proposal through a fresh risk check, HMAC approval, kill switch/circuit breaker, named execution adapter, reconciliation, and hash-chained audit verification.
9. **Operator CLI and audit viewers** call the same APIs with JSON output, confirmation gates, event filters, and chain verification for agents and humans.

## Security & Compliance Notes
- No secrets in repo; use `.env.local`.
- Clearly label AI output as informational, not financial advice.
- Add risk disclaimers and audit logs for any automated actions.
- Broker/trade execution must be isolated, permissioned, and confirm-before-execute.

## Deployment (Free-first)
- **Web**: Vercel/Cloudflare Pages free tier.
- **DB/Auth**: Supabase/Neon free tier when needed.
- **CI**: GitHub Actions.
- **Mobile**: Expo EAS builds (free tier limits apply).
