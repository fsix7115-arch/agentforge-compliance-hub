# AgentForge Compliance Hub

**Open-source compliance, governance and audit platform for AI agent fleets.**

Register your agents, govern every action with YAML policies, keep a tamper-evident
audit trail, control spend, and route risky actions to humans — all self-hosted.

![Dashboard](docs/screenshots/dashboard.png)

---

## Why

Enterprises are shipping AI agents faster than they can answer three auditor questions:

1. *Which agent did this, and was it allowed to?*
2. *Show me proof it never touched regulated data.*
3. *What did we spend, and who approved it?*

AgentForge gives you those three answers with an append-only hash-chained audit log,
a policy engine that runs on every action, and cost/approval governance built in.

---

## Features

### 1. Agent Registry
- CRUD with metadata: name, description, version, owner, tags, dependencies
- Lifecycle: `draft → staging → production → deprecated`
- Dependency graph between agents
- Config management: model, temperature, tools, system prompt
- Import/export agent configs as JSON/YAML

### 2. Immutable Audit Trail
- Every action written to `AgentAction`
- Hash chain: `hash = SHA256(previousHash + canonicalActionData)`
- Verification: `GET /api/agents/[id]/audit/verify`
- Viewer with filters (agent, action type, status, date range, policy violations)
- Export CSV/JSON for external auditors
- Tamper detection — a broken chain is reported with the exact break index

### 3. Policy Engine
- YAML policies: `field` / `operator` / `value` / `severity`
- 17 operators (`equals`, `lte`, `in`, `matches`, `no_pii`, `not_contains`, …)
- Dotted field paths (`action.input.dataType`)
- **Operator = the ALLOWED condition.** A policy fails when that condition is not met.
  To block costs above $10, write `operator: lte, value: 10`.
- Templates: GDPR, HIPAA, SOC 2, PCI-DSS, custom
- Simulation endpoint — test a policy against a payload without enforcing

### 4. Cost Governance
- Token/cost tracked per action, derived from the immutable log
- Daily/weekly/monthly aggregation
- Budgets per org and per agent
- Alerts at 50% / 80% / 100%
- Auto-throttle at 100% — actions are blocked
- Dashboard: spend by agent, by model, by day, forecast vs budget

### 5. Evaluation Dashboard
- Metrics: accuracy, hallucination rate, latency p50/p95, user satisfaction, task completion
- Reported via API or manual entry
- Trend charts with period comparison
- Anomaly detection: flags metrics >2σ from baseline
- CSV export

### 6. Human-in-the-Loop Approvals
- Rules: cost > threshold, PII detected, data export, financial action
- Queue with SLA aging report
- Approve/reject with a reason
- Full audit trail of who decided what, when, and why

### 7. Marketplace
- Compliance packs (pre-built policy sets)
- Agent templates (config presets)
- Detail page + Install (clones into your org)
- Read-only catalog for MVP

---

## Quick Start

```bash
git clone https://github.com/fsix7115-arch/agentforge-compliance-hub.git
cd agentforge-compliance-hub
npm install
cp .env.example .env      # defaults work for local SQLite
npx prisma db push
npm run db:seed
npm run dev
```

Open http://localhost:3000 and sign in with the seeded demo account:

| Email | Password | Role |
|---|---|---|
| `admin@acme.ai` | `password123` | ADMIN |
| `dev@acme.ai` | `password123` | DEVELOPER |
| `auditor@acme.ai` | `password123` | AUDITOR |
| `viewer@acme.ai` | `password123` | VIEWER |

> Change these before deploying anywhere public. They exist so the demo works
> out of the box.

### Try the core loop in 60 seconds

```bash
# 1. Log in and grab a cookie
curl -c /tmp/ck -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@acme.ai","password":"password123"}'

# 2. Log an agent action (this is what an agent calls at runtime)
curl -b /tmp/ck -X POST http://localhost:3000/api/agents/<AGENT_ID>/actions \
  -H 'Content-Type: application/json' \
  -d '{"actionType":"data_export","input":{"rows":100},"tokenCost":0.02,"status":"SUCCESS"}'

# 3. Verify the hash chain
curl -b /tmp/ck http://localhost:3000/api/agents/<AGENT_ID>/audit/verify
```

You will see `previousHash` chaining from the genesis hash, and the policy engine
marking `data_export` for human approval.

---

## Architecture

```
Browser
  │
  ▼
Next.js 14 App Router (route handlers = API)
  │
  ├── src/lib/auth.ts              scrypt + signed cookie sessions, RBAC
  ├── src/lib/audit/hash-chain.ts  SHA-256 chain, canonical JSON
  ├── src/lib/policy/engine.ts     YAML → Zod → operator evaluation
  ├── src/lib/services/actions.ts  policy → risk → approval → log
  ├── src/lib/services/costs.ts    budget + spend aggregation
  └── src/lib/services/evaluations.ts  metrics + anomaly detection
        │
        ▼
      Prisma → SQLite (local) / PostgreSQL (production)
```

Policy evaluation, risk scoring, budget checks and approval decisions are
**fully deterministic and require no AI API key**. The app runs offline.

---

## Testing

```bash
npm run typecheck     # tsc --noEmit
npm test              # 40 unit tests (vitest)
npm run test:e2e      # 3 Playwright end-to-end tests
npm run build         # production build
```

The E2E suite covers the full loop: sign in → register an agent → log an action →
verify the chain → export the audit log, plus both unauthenticated-guard paths.

To run E2E you need a dev server on port 3100 (the Playwright config starts one
if it isn't already running).

---

## Configuration

All variables are optional for local development.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | SQLite path locally, Postgres URL in production |
| `NEXTAUTH_SECRET` | yes | Session cookie signing key |
| `REDIS_URL` | no | Cost aggregation worker |
| `OPENAI_API_KEY` | no | Not needed — app is fully offline |
| `ANTHROPIC_API_KEY` | no | Not needed |
| `SLACK_WEBHOOK_URL` | no | Budget/policy/approval notifications |
| `SMTP_HOST` | no | Email delivery |

Without `SLACK_WEBHOOK_URL` the notifier logs a line and no-ops — the app never
crashes on a missing integration.

---

## Docker / PostgreSQL

```bash
docker compose up -d
DATABASE_URL="postgresql://agentforge:agentforge@localhost:5432/agentforge?schema=public" \
  npx prisma migrate deploy
npm run build && npm start
```

`docker-compose.yml` provisions PostgreSQL and Redis. Note that the Prisma
schema's datasource provider is a build-time constant — see
[ASSUMPTIONS.md](ASSUMPTIONS.md) for how the Postgres path is handled.

---

## API Reference

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/signup` | Create org + admin |
| `GET/POST` | `/api/agents` | List (with filters) / create |
| `GET/PUT/DELETE` | `/api/agents/[id]` | Read / update / delete |
| `POST` | `/api/agents/[id]/actions` | Log an action (called by agents) |
| `GET` | `/api/agents/[id]/actions` | List actions |
| `GET` | `/api/agents/[id]/audit/verify` | Verify hash chain |
| `GET/POST` | `/api/policies` | List / create |
| `PUT` | `/api/policies/[id]` | Update |
| `POST` | `/api/policies/[id]/evaluate` | Simulate without enforcing |
| `GET` | `/api/costs/dashboard` | Spend analytics |
| `GET/POST` | `/api/costs/budgets` | Budget CRUD |
| `GET/POST` | `/api/evaluations` | Metrics read / report |
| `GET/POST` | `/api/approvals` | Queue / create |
| `PUT` | `/api/approvals/[id]` | Approve or reject |
| `GET` | `/api/marketplace/packs` | Compliance packs |
| `GET` | `/api/marketplace/templates` | Agent templates |
| `GET` | `/api/audit/export` | CSV / JSON export |

All responses use a consistent envelope: `{ data }` on success,
`{ error, details? }` on failure.

---

## Roles

| Role | Can |
|---|---|
| `ADMIN` | everything, including billing and member management |
| `DEVELOPER` | create/edit agents, log actions, write policies |
| `AUDITOR` | read everything, export audit logs, verify chains |
| `VIEWER` | read-only dashboards |

Enforcement is server-side in `requireCapability()`, not just hidden buttons.

---

## Assumptions

See [ASSUMPTIONS.md](ASSUMPTIONS.md) for every design decision and deviation
from the original spec — including the custom auth implementation and the
SQLite/Postgres provider constraint.

---

## License

MIT — see [LICENSE](LICENSE).
