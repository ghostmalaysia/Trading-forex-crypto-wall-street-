# Next Steps

## 1. Configure Supabase (cloud memory)
1. Create a free project at [supabase.com](https://supabase.com).
2. In SQL Editor, run `supabase/schema.sql`.
3. Copy `web/supabase-config.example.js` values into `web/supabase-config.js`:
   - `url`: your project URL
   - `anonKey`: your anon/public key
   - `memoryEnabled: true`
4. Serve the web app and test chat/watchlist persistence.

## 2. Run MVP locally
```bash
python3 -m http.server 8080
# open http://localhost:8080/web/
```

## 3. Recommended next implementation
- Migrate to **Next.js + TypeScript + Tailwind** for production structure.
- Add `DataProvider` adapters for real market data (free APIs first).
- Add `AIProvider` abstraction (mock -> free LLM/local model).
- Add Supabase Auth before production (replace permissive anon MVP policies).

## 4. Safety checklist
- Keep AI output informational only.
- No auto-trading; require explicit confirmation for any future execution.
- Add audit logs for AI actions and user approvals.
