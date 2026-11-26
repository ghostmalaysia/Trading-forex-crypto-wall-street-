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
- **Pattern**: expose core workflows as a stateful CLI with `--json` output and `SKILL.md` for agent discovery (inspired by [CLI-Anything](https://github.com/HKUDS/CLI-Anything)).
- **Target commands**: market quote/watchlist/news/ai-summary/memory sync; all outputs machine-readable.
- **Safety**: CLI commands are read/analyze by default; any execution action requires explicit confirmation and audit log.

## Core Modules

| Module | Responsibility | MVP |
|---|---|---|
| Auth/Profile | User identity, preferences, theme | Local/mock profile |
| Market Data | Quotes, candles, symbol search | Mock/free API adapter |
| Charts | Interactive price charts | Basic candlestick/line |
| News | Market headlines, filtering | Mock/RSS adapter |
| Watchlist/Alerts | Track assets, thresholds | Basic watchlist |
| AI Assistant | Chat, summaries, monitoring | Rule-based + provider stub |
| Mobile Shell | Shared navigation and screens | Planned scaffold |

## Data Flow
1. **Ingestion** pulls market/news data from free providers.
2. **Normalization** maps provider responses to internal types.
3. **Storage/cache** keeps recent data for fast dashboard loads.
4. **UI** renders charts/news/watchlist via BFF endpoints.
5. **AI** consumes normalized data + user context to generate insights/alerts.
6. **Feedback loop** records user actions and AI outcome ratings.

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
