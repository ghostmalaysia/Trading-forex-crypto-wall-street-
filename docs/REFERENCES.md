# References & Inspiration

## Existing Open-Source Projects
- **[OpenBB](https://github.com/OpenBB-finance/OpenBB)** (75k+ stars, AGPL/Other) - Open data platform for analysts, quants, and AI agents. Strong reference for market data APIs, financial analytics, and AI integration patterns.
- **[Superalgos](https://github.com/Superalgos/Superalgos)** (5.8k stars, Apache-2.0) - Open-source crypto trading bot/platform with visual strategy design, backtesting, paper trading. Reference for automation and agent workflows.

## Curated Resource Lists (user-provided)
- **[pythonidae / AI.md](https://github.com/svaksha/pythonidae/blob/main/AI.md)** - Curated Python AI/ML/NLP/RL resources; useful for selecting models, NLP pipelines, and trading ML components.
- **[reasn / knowledge-bits / ai.md](https://github.com/reasn/knowledge-bits/blob/master/ai.md)** - AI trends/impact notes; useful for product strategy (anomaly detection, coaching, AI-run workflows, decision support).

## Agent-Native Tooling
- **[CLI-Anything (HKUDS)](https://github.com/HKUDS/CLI-Anything)** (65k+ stars, Apache-2.0) - Generates agent-native CLIs for software/codebases via a 7-phase pipeline (`HARNESS.md`); outputs Click CLI, tests, and `SKILL.md` for agent discovery. Relevant for exposing this platform's workflows/APIs as a stateful CLI (`--json`, REPL) and for agent tooling via CLI-Hub.

## How to use these
- **Borrow patterns, not code blindly**: check licenses before reusing code (OpenBB license is "Other"; verify compatibility).
- **Data/analytics**: evaluate OpenBB for market data and research workflows in Phase 1+.
- **AI features**: use pythonidae to pick NLP/summarization/sentiment/RL libraries; use knowledge-bits to prioritize high-value AI capabilities.
- **Agent interface**: consider CLI-Anything to generate a `cli-anything-tradewall` harness wrapping market/news/AI/Supabase workflows for agents.
- **Safety**: keep AI informational; any execution/automation requires explicit confirmation and audit logs.
