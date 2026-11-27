# Next Steps

## 1. Configure Supabase (cloud memory and AI learning)
1. Create a free project at [supabase.com](https://supabase.com).
2. For an existing project, run `supabase/migrations/202611260001_secure_user_memory.sql`, `supabase/migrations/202611270001_ai_learning_and_plans.sql`, and `supabase/migrations/202611270002_audit_logs.sql` in SQL Editor. For a fresh project, run `supabase/schema.sql`.
3. Enable email sign-up in Supabase Auth and set the project's Site URL.
4. Serve the web app. In the **Cloud memory** card, enter:
   - `url`: your project URL
   - `anonKey`: your publishable/anon key (never use `service_role` in the browser)
5. Use **Test** to verify the connection, then create an account and sign in to enable private chat/watchlist/learning/plan/alert persistence. Settings stay in this browser; **Clear saved settings** removes them. A gitignored `web/supabase-config.js` can provide defaults, but dashboard values override it.

## 2. Run MVP locally (Node 20+)
```bash
node server.mjs
# open http://127.0.0.1:8080/
```

To enable a live AI model, set `GROQ_API_KEY` on the server. Leave it unset for the labelled local fallback. The AI is focused on XAU/USD and DXY only.

## 3. Current AI flow (done)
- Browser sends selected symbol, timeframe, chart series, lessons and recent chat to `POST /api/ai`.
- Server adds repo knowledge, computes SMA/RSI/ATR/trend, then calls the configured provider.
- `mode: "plan"` returns a normalized plan plus risk gate decision.
- Approve/Reject records an audit row in `trade_plans`; feedback records a row in `ai_learning`.

## 4. Current chart tools (done)
- Candlestick/line switch, synthesized volume bars, MA20/MA50 and Bollinger overlays, RSI14 and MACD panes, crosshair with price labels.
- Mouse wheel zoom, drag-to-pan, horizontal-line and trend-line drawing tools.
- Toolbar state resets when symbol/timeframe changes; chart remains dependency-free canvas.

## 5. Current market tools (done)
- `GET /api/market` provides indicative XAU/USD (`GC=F` proxy) and DXY (`DX-Y.NYB`) quotes with 60s caching and mock fallback.
- Price alerts for the two focus symbols, with local notifications and optional per-user Supabase persistence.
- Curated mock economic calendar focused on USD/gold catalysts. No orders are placed.

## 6. Current audit and tests (done)
- Browser writes per-user `audit_logs` rows for AI plan generation, approve/reject, feedback, and alert create/trigger when signed in.
- Server appends operational events to `data/audit.jsonl` (override with `AUDIT_LOG_FILE`); client IP is hashed and model messages are not logged.
- `npm test` runs `node:test` coverage for AI logic, risk gate, focus limits, prompt contracts, HTTP endpoints, static serving, path traversal rejection, audit-log creation, shared API client, and mobile Supabase REST client.

## 7. Current deployment (done)
- `Dockerfile` + `docker-compose.yml` bind `HOST=0.0.0.0:8080`, persist audit logs, expose a health check, and read server secrets from `.env`.
- Docker was not executed in this environment; install Docker and run `docker compose up --build` before publishing.

## 8. Current mobile app (done)
- `shared/api-client.js` is used by the Expo app for `/api/health`, `/api/market`, `/api/news`, and `/api/ai`; `shared/feed-data.js` supplies curated news and calendar fallbacks.
- Mobile screens: Dashboard, Watchlist, News, AI Desk, and Settings. Settings can override API base URL and Supabase publishable key without a rebuild.
- `mobile/supabase-client.js` stores config/session with AsyncStorage and syncs preferences, watchlist, and chat with RLS-protected Supabase tables. Never enter a `service_role` key.
- Alert rules for XAU/USD and DXY are evaluated locally and use Expo local notifications after permission. Remote push tokens and background delivery are not yet wired.
- Expo was not executed in this environment; run `cd mobile && npm install && cp .env.example .env && npm start` to verify on a device or simulator.

## 9. Recommended next implementation
- Add a screener, saved drawing templates, and a real economic calendar provider.
- Replace the GC=F proxy with a licensed spot XAU/USD feed and a real DXY feed.
- Wire Expo push tokens and a server-side notification scheduler for background alerts.
- Migrate to **Next.js + TypeScript + Tailwind** for production structure.
- Replace the lightweight browser Auth client with the official Supabase client or a server-side HttpOnly session before production.
- Add an in-app audit viewer.

## 10. Safety checklist
- Keep AI output informational only.
- No auto-trading; AI plans stay paper-only and require explicit confirmation.
- Keep API keys in environment variables on the server.
- Keep audit logs for AI actions and user approvals.
