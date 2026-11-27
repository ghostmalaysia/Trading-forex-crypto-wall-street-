# Next Steps

## 1. Configure Supabase (cloud memory and AI learning)
1. Create a free project at [supabase.com](https://supabase.com).
2. For an existing project, run `supabase/migrations/202611260001_secure_user_memory.sql` and `supabase/migrations/202611270001_ai_learning_and_plans.sql` in SQL Editor. For a fresh project, run `supabase/schema.sql`.
3. Enable email sign-up in Supabase Auth and set the project's Site URL.
4. Serve the web app. In the **Cloud memory** card, enter:
   - `url`: your project URL
   - `anonKey`: your publishable/anon key (never use `service_role` in the browser)
5. Use **Test** to verify the connection, then create an account and sign in to enable private chat/watchlist/learning/plan persistence. Settings stay in this browser; **Clear saved settings** removes them. A gitignored `web/supabase-config.js` can provide defaults, but dashboard values override it.

## 2. Run MVP locally
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
- Candlestick/line switch, synthesized volume bars, MA20/MA50 overlays, RSI14 pane, crosshair with price labels.
- Mouse wheel zoom, drag-to-pan, horizontal-line and trend-line drawing tools.
- Toolbar state resets when symbol/timeframe changes; chart remains dependency-free canvas.

## 5. Recommended next implementation
- Add symbol-specific alerts, a screener, and a news/economic calendar.
- Add MACD/Bollinger panes and saved drawing templates.
- Migrate to **Next.js + TypeScript + Tailwind** for production structure.
- Add `DataProvider` adapters for real gold/USD data (free APIs first).
- Replace the lightweight browser Auth client with the official Supabase client or a server-side HttpOnly session before production.

## 6. Safety checklist
- Keep AI output informational only.
- No auto-trading; AI plans stay paper-only and require explicit confirmation.
- Keep API keys in environment variables on the server.
- Keep audit logs for AI actions and user approvals.
