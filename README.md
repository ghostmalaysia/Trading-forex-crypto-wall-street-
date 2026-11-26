# Trading Forex / Crypto / Wall Street Platform

Free-first web + mobile trading intelligence dashboard with AI-assisted monitoring, news, and learning.

## What’s in this repo
- `ARCHITECTURE.md` - system design, stack, modules, data flow
- `ROADMAP.md` - phased delivery plan
- `web/` - runnable static MVP dashboard (no build required)
- `docs/` - product notes and next steps

## MVP Features (current)
- Dark-theme trading dashboard UI
- Market watchlist (Forex/Crypto/Stocks) with mock live updates
- Simple price chart (canvas) with symbol/timeframe switching
- Market/news feed panel
- AI assistant panel (local mock responses, safety disclaimer)
- Responsive layout for desktop/mobile web

## Run locally
No dependencies required for the static MVP:

```bash
# from repo root
python3 -m http.server 8080
# open http://localhost:8080/web/
```

Or open `web/index.html` directly in a browser.

## Project Vision
Build a platform/dashboard for web and Android/iOS that includes:
- User-friendly charts
- Current market/news
- Dark theme
- AI that monitors, helps, performs tasks, studies, learns, and improves over time
- Free-first tooling wherever possible

## Safety
- AI output is informational only, **not financial advice**.
- No automated trading/execution in MVP.
- Any future automation must be permissioned and confirm-before-execute.

## Next Steps
See `ROADMAP.md` for Phase 1+ (real data adapters, persistence, AI provider integration, Expo mobile app).
