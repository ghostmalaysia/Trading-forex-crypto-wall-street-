# MIM VENTURES — Next Steps

## 1. Configure Supabase (cloud memory and AI learning)
1. Create a free project at [supabase.com](https://supabase.com).
2. For an existing project, run `supabase/migrations/202611260001_secure_user_memory.sql`, `supabase/migrations/202611270001_ai_learning_and_plans.sql`, `supabase/migrations/202611270002_audit_logs.sql`, `supabase/migrations/202611280001_agent_workflows.sql`, `supabase/migrations/202611290001_guarded_live.sql`, and `supabase/migrations/202611300001_push_tokens.sql` in SQL Editor. For a fresh project, run `supabase/schema.sql`.
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
- Saved chart templates (symbol, timeframe, indicators, drawings) in browser storage plus a focus-symbol screener panel.
- Toolbar state resets when symbol/timeframe changes; chart remains dependency-free canvas.

## 5. Current market tools (done)
- `GET /api/market` provides indicative XAU/USD (`GC=F` proxy) and DXY (`DX-Y.NYB`) quotes with 60s caching and mock fallback.
- `GET /api/screener` adds rule-based change/bias rows for the two focus symbols.
- `MARKET_DATA_ADAPTER=licensed` with a server-only endpoint/key swaps the indicative proxy for a licensed feed.
- Price alerts for the two focus symbols, with local notifications, Expo push delivery, and optional per-user Supabase persistence.
- `GET /api/summary` produces deterministic Malay recaps with optional `SUMMARY_INTERVAL_SECONDS` scheduling.
- Curated mock economic calendar focused on USD/gold catalysts. No orders are placed.

## 6. Current audit and tests (done)
- Browser writes per-user `audit_logs` rows for AI plan generation, approve/reject, feedback, and alert create/trigger when signed in.
- Server appends operational events to `data/audit.jsonl` (override with `AUDIT_LOG_FILE`); client IP is hashed and model messages are not logged.
- `npm test` runs `node:test` coverage for AI logic, risk gate, focus limits, prompt contracts, adapters (MetaApi/licensed market/push/session/summary), HTTP endpoints including screener/summary/notifications/session, static serving, path traversal rejection, audit-log creation, CLI guard rails, shared API client, and mobile Supabase REST client. Local stubs replace market, Expo, and Supabase providers.

## 7. Current deployment (done)
- `Dockerfile` + `docker-compose.yml` bind `HOST=0.0.0.0:8080`, persist audit logs, expose a health check, and read server secrets from `.env`.
- Docker was not executed in this environment; install Docker and run `docker compose up --build` before publishing.

## 8. Current mobile app (done)
- `shared/api-client.js` is used by the Expo app for `/api/health`, `/api/market`, `/api/news`, and `/api/ai`; `shared/feed-data.js` supplies curated news and calendar fallbacks.
- Mobile screens: Dashboard, Watchlist, News, AI Desk, and Settings. Settings can override API base URL and Supabase publishable key without a rebuild.
- `mobile/supabase-client.js` stores config/session with AsyncStorage and syncs preferences, watchlist, and chat with RLS-protected Supabase tables. Never enter a `service_role` key.
- Alert rules for XAU/USD and DXY are evaluated locally and use Expo local notifications after permission. With `EXPO_PUBLIC_EAS_PROJECT_ID`, the app also registers a push token, stores it in `public.push_tokens`, and uploads it for server-side delivery.
- The AI Desk exposes a SUMMARY action backed by `GET /api/summary`.
- Expo was not executed in this environment; run `cd mobile && npm install && cp .env.example .env && npm start` to verify on a device or simulator.

## 9. Current agent workflows (done)
- `GET /api/monitor` exposes rule state, recent events, interval, and `paperOnly: true`; `POST /api/monitor/rules` normalizes rules limited to XAU/USD and DXY.
- `POST /api/monitor/run` evaluates thresholds and price anomalies; a server interval runs the same cycle unless `MONITOR_DISABLED=true` is set.
- `POST /api/backtest` returns an educational SMA-cross simulation using the selected chart series; it is not predictive.
- `POST /api/paper/order` requires an approved plan plus the exact confirmation `EXECUTE PAPER`; `POST /api/paper/evaluate` reports outcome and PnL.
- `GET /api/broker/status` reports paper broker status; the guarded-live adapter is separate and blocked until configured.
- Web Agent Lab and the mobile Agent screen expose monitor, backtest, paper execution, and broker status. Signed-in users persist paper orders and evaluations through per-user RLS policies.

## 10. Guarded live workflow (done)
- `GET /api/live/status` reports mode, kill switch, circuit breaker, credential status, adapter status, and readiness without exposing secrets.
- `POST /api/live/proposal` reuses the deterministic risk gate and returns a hashed proposal; `POST /api/live/approve` issues an HMAC approval only after `APPROVE LIVE`.
- `POST /api/live/order` rechecks the gate, requires `EXECUTE LIVE`, consumes the approval, and blocks unless a named adapter is wired and ready. The default returns `LIVE_PROVIDER_NOT_WIRED`.
- `POST /api/live/kill-switch` arms by default; disarming requires `DISABLE KILL SWITCH` and an admin token. `POST /api/live/reconcile` summarizes local vs broker order drift.
- `GET /api/audit/verify` verifies the SHA-256 hash chain in `data/audit.jsonl`. Signed-in users store live event metadata in the RLS-protected `live_events` table; approval tokens are never stored.
- `ai/adapters/metaapi-http.mjs` implements the live adapter with operator-supplied URLs (`METAAPI_ORDER_URL`, `METAAPI_RECONCILE_URL`, optional `{accountId}` placeholder) and server-only credentials. Enable it with `LIVE_ADAPTER=metaapi-http`; it fails closed and returns sanitized results.

## 11. Agent-native operator layer (done)
- `npm run cli -- help` lists machine-readable commands. Read-only examples: `health`, `market`, `watchlist`, `screener`, `summary`, `news`, `monitor`, `broker`, `audit logs`, `audit verify`, `push status`, `session status`, `live status`, and `ai --message "..."`.
- Write commands require exact confirmations: `EXECUTE PAPER`, `APPROVE LIVE`, `EXECUTE LIVE`, `DISABLE KILL SWITCH`, and `SEND PUSH`. Guarded-live commands require `--admin-token` or `TRADEWALL_LIVE_ADMIN_TOKEN`; push sends require `--admin-token` or `TRADEWALL_PUSH_ADMIN_TOKEN`; tokens are never printed.
- `GET /api/audit?limit=50&event=live_order_result` returns newest hash-chained entries with optional filters. Web and mobile Agent Lab expose the same audit trail plus chain verification.
- Set `TRADEWALL_API_BASE_URL` or pass `--base` to target a non-default server. The CLI uses `shared/api-client.js`, so it stays in sync with the web/mobile API contract.

## 12. Production integration layer (done)
- `ai/adapters/metaapi-http.mjs` provides the configurable real broker adapter; validation with a demo account still needs real credentials.
- `GET /api/screener` and saved chart templates are wired; the economic calendar remains curated mock data until a provider is selected.
- `MARKET_DATA_ADAPTER=licensed` swaps the GC=F/DXY proxy for a licensed spot feed once an endpoint/key are configured.
- Expo push tokens, RLS storage, and admin-guarded server delivery are wired; server scheduling is available only for summaries, not arbitrary alerts.
- `next/` provides the App Router migration scaffold with an API proxy; the static `web/` MVP remains supported.
- Optional server-side HttpOnly sessions coexist with the browser Supabase client; no browser secret handling was introduced.

## 13. Remaining validation with real credentials
- Apply `202611300001_push_tokens.sql` and configure `PUSH_ADMIN_TOKEN` plus the mobile EAS project ID.
- Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SESSION_COOKIE_SECRET`, and verify sign-in/session refresh against the real project.
- Configure MetaApi URLs/token/account and test proposal -> approval -> order -> reconciliation with a demo account.
- Configure a licensed market endpoint/key and verify symbol mapping and provider terms.
- Install `next/` dependencies and run `npm run dev` with `MIM_VENTURES_UPSTREAM` (or legacy `TRADEWALL_UPSTREAM`) pointed at `server.mjs`.

## 14. Safety checklist
- Keep AI output informational only.
- Paper is the default; guarded live is fail-closed and requires admin token, approval secret, explicit approvals, and a disarmed kill switch.
- Push sends require `SEND PUSH` confirmation and a server-only admin token; session mutations are same-origin only.
- Keep API keys in environment variables on the server.
- Keep hash-chained audit logs for AI actions, approvals, orders, reconciliation, summaries, push sends, and session events.
