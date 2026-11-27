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
- `npm test` runs `node:test` coverage for AI logic, risk gate, focus limits, prompt contracts, HTTP endpoints, static serving, path traversal rejection, and audit-log creation.

## 7. Current deployment and mobile scaffold (done)
- `Dockerfile` + `docker-compose.yml` bind `HOST=0.0.0.0:8080`, persist audit logs, expose a health check, and read server secrets from `.env`.
- `mobile/` is an Expo scaffold using `EXPO_PUBLIC_API_BASE_URL` to call the same health, market, and AI endpoints.
- Docker and Expo were not executed in this environment; install deps and run locally before publishing.

## 8. Recommended next implementation
- Add a screener, saved drawing templates, and a real economic calendar provider.
- Replace the GC=F proxy with a licensed spot XAU/USD feed and a real DXY feed.
- Migrate to **Next.js + TypeScript + Tailwind** for production structure.
- Replace the lightweight browser Auth client with the official Supabase client or a server-side HttpOnly session before production.
- Add an in-app audit viewer and mobile Supabase Auth if multi-device history is required.

## 9. Safety checklist
- Keep AI output informational only.
- No auto-trading; AI plans stay paper-only and require explicit confirmation.
- Keep API keys in environment variables on the server.
- Keep audit logs for AI actions and user approvals.
