# Next Steps

## 1. Configure Supabase (cloud memory)
1. Create a free project at [supabase.com](https://supabase.com).
2. For an existing project, run `supabase/migrations/202611260001_secure_user_memory.sql` in SQL Editor. For a fresh project, run `supabase/schema.sql`.
3. Enable email sign-up in Supabase Auth and set the project's Site URL.
4. Copy `web/supabase-config.example.js` to `web/supabase-config.js` and enter:
   - `url`: your project URL
   - `anonKey`: your publishable/anon key (never use `service_role` in the browser)
   - `memoryEnabled: true`
5. Serve the web app, create an account, then sign in to enable private chat/watchlist persistence.

## 2. Run MVP locally
```bash
python3 -m http.server 8080
# open http://localhost:8080/web/
```

## 3. Recommended next implementation
- Migrate to **Next.js + TypeScript + Tailwind** for production structure.
- Add `DataProvider` adapters for real market data (free APIs first).
- Add `AIProvider` abstraction (mock -> free LLM/local model).
- Replace the lightweight browser Auth client with the official Supabase client or a server-side HttpOnly session before production.

## 4. Safety checklist
- Keep AI output informational only.
- No auto-trading; require explicit confirmation for any future execution.
- Add audit logs for AI actions and user approvals.
