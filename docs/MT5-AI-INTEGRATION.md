# MT5 + AI Trading Integration Reference

## Can we connect to MetaTrader 5?
**Yes.** MT5 can be integrated, but the connection method depends on where the bot/dashboard runs.

| Option | How it works | Pros | Cons | Fit for this project |
|---|---|---|---|---|
| **MetaApi Cloud** | Connect MT5/MT4 account to MetaApi; use REST/WebSocket/SDK from web backend | Works on Linux/cloud, no local MT5 terminal needed, same API for MT4/MT5 | Paid service (usage-based), third-party dependency | **Best for web/mobile dashboard MVP** |
| **Official `MetaTrader5` Python package** | Python IPC to local MT5 terminal | Low latency, official, direct broker terminal access | **Windows + MT5 terminal required**, not cloud-native | Good for Windows VPS worker/bot |
| **Custom MQL5 EA bridge** | EA in MT5 sends/receives JSON via WebSocket/HTTP to backend | Full control, no per-call vendor API | You build/maintain bridge, security/latency/reliability burden | Advanced/custom phase |
| **mt5linux / Wine workarounds** | Run MT5/Python bridge under Wine | Possible Linux workaround | Fragile, not recommended for production | Avoid for production |

## Recommended Architecture for Our Platform

```text
[Dashboard Web/Mobile]
        |
        v
[Next.js BFF / API Layer]
        |
        +--> [Supabase: users, watchlists, ai_memory, alerts, audit_logs]
        |
        +--> [Market/News Providers]
        |
        +--> [AI Service (proposal only)]
        |         - summarize/analyze/detect
        |         - outputs structured TradeProposal (NO_TRADE/BUY/SELL)
        |
        +--> [Risk Gate (deterministic code)]
        |         - freshness, spread, position size, daily loss, exposure, kill switch
        |
        +--> [Approval Gate]
        |         - Observe / Paper / Live-confirm-required
        |
        +--> [Execution Adapter]
                  - Paper broker simulator (default)
                  - MetaApi / MT5 bridge (later)
                        |
                        v
                   [MT5 Broker Account]
```

## Safety Rules (Non-Negotiable)
1. **AI recommends, deterministic code authorizes.** AI must not send orders directly.
2. **Fail closed.** Missing/stale/invalid data = `NO_TRADE`.
3. **Default mode: Observe/Paper.** Live trading disabled by default.
4. **Confirm-before-execute.** Any live order needs explicit user approval.
5. **Hard risk controls:** max risk/trade, daily loss limit, max drawdown, max exposure, spread/slippage limits, kill switch.
6. **Audit everything:** snapshots, proposals, risk decisions, approvals, order requests, broker responses, PnL.
7. **No secrets in repo.** Use env vars/secret manager; store broker tokens encrypted/server-side.
8. **Not financial advice.** Display clear risk disclaimer.

## Proposed Data Contracts

### TradeProposal (AI output, structured only)
```json
{
  "proposal_id": "uuid",
  "snapshot_id": "uuid",
  "action": "BUY|SELL|NO_TRADE",
  "symbol": "XAUUSD",
  "timeframe": "M15",
  "entry_zone": {"min": 0, "max": 0},
  "invalidation": 0,
  "target": 0,
  "confidence": 0.0,
  "valid_until_utc": "ISO-8601",
  "reason_codes": [],
  "model_version": "..."
}
```

### RiskDecision (deterministic)
- `APPROVED` or `DENIED` + reason codes (`STALE_SNAPSHOT`, `SPREAD_TOO_WIDE`, `DAILY_LOSS_LIMIT`, etc.)
- Approved output includes bounded volume, SL/TP, expiry, audit ID.

## Phased Rollout
1. **Observe**: dashboard reads market/news; AI summaries/signals only; no trading.
2. **Paper**: simulated execution against live prices; track performance and errors.
3. **Live (guarded)**: MetaApi/bridge integration; user approval per order; strict risk gate + kill switch.
4. **Agent workflows**: scheduled monitoring, alerts, post-trade review; continuous learning from approved outcomes.

## Current implementation status (Phase 5)
- Guarded-live endpoints are `/api/live/status`, `/api/live/proposal`, `/api/live/approve`, `/api/live/order`, `/api/live/kill-switch`, `/api/live/reconcile`, and `/api/audit/verify`.
- Credentials are read only from server environment variables; browser/mobile clients receive status and fingerprints, never tokens.
- The default `LIVE_ADAPTER=disabled` fails closed. A real adapter goes in `ai/adapters/<name>.mjs` and receives a credential provider, not raw secrets.
- Every live order requires `APPROVE LIVE`, `EXECUTE LIVE`, a fresh deterministic risk pass, an available adapter, an armed-but-disarmed kill switch, and a closed circuit breaker.
- Audit records are SHA-256 hash-chained in `data/audit.jsonl`; `/api/audit/verify` validates the chain. Live event metadata can also be stored per user in Supabase `live_events`.

## References
- [MetaApi Cloud](https://metaapi.cloud/) / [Docs](https://metaapi.cloud/docs/client/) / [Python SDK](https://github.com/metaapi/metaapi-python-sdk)
- [MetaTrader5 Python package](https://pypi.org/project/MetaTrader5/) (Windows/local terminal)
- [MQL5: How to Architect an AI Agent for MetaTrader 5](https://www.mql5.com/en/blogs/post/774492) - key safety architecture reference
- [MQL5: AI assistant with approval card](https://www.mql5.com/en/articles/24272) - human approval before execution
