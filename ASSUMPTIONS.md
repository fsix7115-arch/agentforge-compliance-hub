# AgentForge Compliance Hub — Design Assumptions

This document records every deliberate deviation, trade-off, and unimplemented feature
from the original specification.

## Stack Choices

### Next.js App Router vs. tRPC

**Chosen:** Route handlers (`src/app/api/.../route.ts`).

**Why:** Lower setup friction. A single `npm install` brings up a full API without
schema/code generation. tRPC is excellent but adds a dependency plus a type-safe
client setup that wasn’t strictly required for MVP launch.

### SQLite vs. PostgreSQL

**Local default:** SQLite. One file under `./prisma/dev.db`.

**Production path:** PostgreSQL via `DATABASE_URL` in Docker Compose.

**Constraint:** Prisma schema is built with a static `provider`. Switching from
SQLite to Postgres in production requires a one-line change in `prisma/schema.prisma`
or a build-time env substitution. We ship with SQLite compiled in; production users
change the provider and run migrations.

### Custom Auth vs. NextAuth

**Chosen:** Custom session-based auth in `src/lib/auth.ts`.

**Why:** A signed HTTP-only cookie is simpler for a local-first CLI tool, works
without external providers, and keeps the demo 100% self-contained. NextAuth can be
planned for a future version; the `requireSession()` boundary lets us drop in
NextAuth later without touching route handlers.

### No AI Keys Required

**Deliberate:** Policy evaluation, risk scoring, approvals, costs — all deterministic.

**Why:** The platform is not an LLM proxy, it models *governance* around agents.
A demo should work without every enterprise provisioning OpenAI/Anthropic keys.
Agents can be simulated (fixed responses) or real; the hub cares about what happens
after the agent outputs.

### BullMQ / Redis Jobs

**MVP State:** Not implemented. Cost aggregation and anomaly detection run
synchronously on the first request that needs them (or via a dev cron you can
call manually — `npm run jobs:aggregate`).

Redis becomes necessary at runtime scale. The `bullmq` package is in `dependencies`,
but the worker file is a placeholder. This keeps prod ready while not adding
infra requirements to the demo.

### OpenTelemetry

**Not implemented.** Instrumenting the full middleware/trace flow adds boiler-plate
that is orthogonal to the governance features. We can add it later; the code is
structured to export metrics at least.

### Team Invitations

**Not implemented.** The `members` table exists with `INVITED`/`ACCEPTED` states,
but the email/SMS flow and UI for inviting is deferred. Adding SMTP is trivial once
the integration is wired (see `src/lib/services/notifications.ts` for the pattern).

### PDF Export

**CSV/JSON only.** `GET /api/audit/export?format=csv` and `format=json`. PDF
generation can be layered via a serverless function or a cron that renders a
template and emails it.

### Agent Config Import/Export (JSON/YAML)

Implemented for the registry UI. The file is a flat JSON file; there is no
backend API for this yet. A future PR can add `POST /agents/[id]/export` and
`POST /agents/import`.

### Dependency Graph Visualization

The graph exists in the `dependencies` table. The UI renders a list of linked
agents; an interactive graph (D3) is future work.

### Marketplace

Read-only catalog seeded from `prisma/marketplace-data.ts`. Installing a pack
clones its policies into your org. Revenue share tracking was in the scope but
not shipped — the data is ready, the admin dashboard is not.

## Policy Engine Semantics

### Operators are ALLOWED-conditions

A policy **fails** when its `operator` condition is **false**.
To **allow** a `tokenCost` up to 10, you write:

```yaml
field: tokenCost
operator: lte
value: 10
```

This is intentional: it lets you read a policy as "this path is allowed when..."

To **block** costs above 10, you would negate — but our template uses
`severity: "warning"` + the approval engine, so anything >10 gets escalated.

### PII Detection

Four operators for PHI:

| Oper | Philosophy |
|---|---|
| `pii_detected` | Require PII to be present (rare) |
| `no_pii` | Block if PII exists |
| `matches` | Regex match = allowed |
| `not_matches` | Regex no-match = allowed |

Use `no_pii` for HIPAA compliance rather than `not_contains`.

### Cost Guard Template

The shipped `cost-guard.yml` template uses `lte 10` with `warning` severity.
Combined with the approval engine, any action over $10 is escalated.
Change threshold, severity, or operator as needed for your environment.

## Risk & Limitations

- The E2E tests assume port 3100; port 3000 is occupied by an old Trend2Repo dev
  server on this machine. In a clean environment, change `PORT=3000` or stop the
  other service.

- The `page.evaluate` helper in E2E needs the exact protocol (`http://`) or
  React dev server fails CSRF check. Playwright tests run with `baseURL` set to
  `http://127.0.0.1:3100` to guarantee matching origin.

- Seeded passwords are intentionally weak. For production you must add proper
  password complexity rules and consider MFA for ADMIN/AUDITOR roles.

- PostgreSQL provider requires `pg` extension in Prisma. No migration files are
  tracked in Git; run `npx prisma migrate dev --create-table` after switching
  providers.

## Future Work

1. Replace custom auth with NextAuth and add OAuth/OIDC providers
2. Add BullMQ workers for async cost aggregation and policy evaluation
3. Add OpenTelemetry exports via `opentelemetry-js`
4. Implement team invitation flow with SMTP
5. Add GraphQL endpoint (Apollo Server) alongside REST
6. Add interactive dependency graph (D3) on agent detail page
7. Add agent config import endpoint (JSON/YAML API)
8. Add PDF export via `@react-pdf/renderer`
9. Add revenue share tracking admin UI for marketplace
10. Add SLA tracking dashboard per approval type

## Changelog

- **v0.1.0** Initial public release. Complete unit test suite (40/40), E2E suite (3/3), clean typecheck, clean build. SQLite-local, API-only, no external keys required.