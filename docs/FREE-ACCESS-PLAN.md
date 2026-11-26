# Free Access Plan (Full Trading Tools)

## Goal
Customers can use the full TradeWall trading toolkit on **web and mobile apps for free**. No paywall for core features.

## TradingView Feature Benchmark (Free Parity Target)

| TradingView reference | TradeWall free implementation | Status |
|---|---|---|
| Supercharts / advanced charting | TradingView Lightweight Charts (OSS) + local indicators/draw tools | Planned |
| Watchlists | Multi-asset watchlists synced via Supabase | MVP mock / Planned sync |
| Screeners (stocks/crypto/forex) | Built-in screener with free data adapters & filters | Planned |
| Heatmaps | Market heatmap module (web/mobile) | Planned |
| Alerts | Price/indicator/news alerts, push/email/in-app | Planned |
| News & Economic calendar | RSS/news APIs + economic calendar feed, symbol filters | MVP mock / Planned |
| Paper trading | Internal paper broker, virtual portfolio, PnL, history | Planned |
| Broker integration | Optional MetaApi/MT5 adapter (user's broker); platform tools remain free | Phase 5 guarded |
| Community ideas/scripts | AI insights + shared strategy notes (safe, moderated later) | Planned |
| Mobile/Desktop apps | Web PWA + Expo Android/iOS | Planned |

## What "Full Tools" Means (Free Tier)
| Area | Free tools included | Implementation |
|---|---|---|
| Dashboard | Multi-asset watchlist (Forex/Crypto/Stocks), dark theme, responsive web/mobile | Next.js + Expo, OSS UI |
| Charts | Candlestick/line, timeframes, drawing/indicators (SMA/EMA/RSI/MACD etc.) | TradingView Lightweight Charts + local indicator calc |
| News/Calendar | Market news feed, filters, symbol-related headlines | Free RSS/public APIs, cached |
| AI Assistant | Summaries, risk checks, signal explanations, learning notes | Provider abstraction: rule-based fallback + free/local LLM tiers |
| Alerts | Price/indicator/news alerts, notifications | Supabase + cron/free push tiers |
| Paper Trading | Virtual portfolio, orders, PnL, history, strategy testing | Internal paper broker simulator (no broker fees) |
| Journal/Memory | Watchlists, trade journal, AI memory, preferences | Supabase free tier (Postgres/Auth/Storage) |
| Agent CLI | Structured agent commands/JSON for workflows | CLI-Anything-inspired harness |

## Free-First Stack
- **Frontend**: Next.js, Tailwind, Lightweight Charts (OSS).
- **Mobile**: Expo React Native (OSS).
- **Backend/DB**: Supabase free tier; Next.js route handlers.
- **Hosting/CI**: Vercel/Cloudflare/GitHub Actions free tiers.
- **Data**: free/public market & news sources via adapter layer; caching and rate-limit handling.
- **AI**: default rule-based/local/free-tier providers; user can optionally add own API key.

## Cost/Limit Guardrails
- **No platform paywall** for core tools listed above.
- **External limits disclosed**: some free data sources have rate limits, delay, or symbol coverage limits; show source/status in UI.
- **Live broker execution**: optional. Broker/MetaApi fees are external to user/broker; platform keeps analysis/paper tools free. Live mode requires explicit opt-in and risk controls.
- **Quotas**: monitor Supabase/Vercel free-tier usage; add caching, pagination, and graceful degradation.

## Implementation Checklist
- [ ] Add `DataProvider` adapters with free-source defaults and fallback/cache.
- [ ] Add local indicator engine (no paid chart vendor).
- [ ] Add paper broker + portfolio/PnL/journal.
- [ ] Add `AIProvider` with rule-based fallback and optional user-provided free keys.
- [ ] Add usage/rate-limit telemetry and UI status badges.
- [ ] Add clear disclosure: "Free platform tools; external data/broker limits may apply."
