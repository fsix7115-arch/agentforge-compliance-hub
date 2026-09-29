# Contributing to AgentForge Compliance Hub

Thanks for considering a contribution. This is an open-source project and contributions are welcome.

## Quick start

```bash
git clone https://github.com/fsix7115-arch/agentforge-compliance-hub.git
cd agentforge-compliance-hub
npm install
cp .env.example .env
npx prisma db push
npm run db:seed
npm run dev
```

## Before you open a pull request

Run the same checks CI runs:

```bash
npm run typecheck   # must be clean
npm test            # must be 100% green
npm run build       # must succeed
```

End-to-end tests are also run in CI:

```bash
npx playwright install chromium
npm run test:e2e
```

The E2E suite needs a dev server; the Playwright config starts one on port 3100
if it is not already running.

## What makes a good contribution here

This is a compliance product, so **correctness and determinism matter more than
cleverness**.

- **Policy evaluation must stay deterministic.** No AI calls, no randomness, no
  network. A policy that evaluates the same action twice must produce the same
  verdict — auditors depend on that.
- **The audit hash chain is append-only.** Never add an update or delete path to
  `AgentAction`, and never change `src/lib/audit/hash-chain.ts` in a way that
  would invalidate existing chains. If you think the hashing needs to change,
  open an issue first and treat it as a breaking change.
- **Enforce authorization server-side.** Hiding a button in the UI is not access
  control. New routes must call `requireCapability()`.
- **No new required environment variables.** Optional integrations (Slack, SMTP,
  Redis, AI keys) must no-op cleanly when unset. A missing webhook should log a
  line, never throw.

## Style

- Prettier and ESLint are already configured; run `npm run format` before pushing.
- Prefer small, focused pull requests over large refactors.
- Add a test for any new policy operator, hash-chain behaviour, or cost rule.
  The unit suite is fast and should stay fast.

## Reporting a security issue

Please **do not open a public issue** for a security vulnerability. Email the
maintainer directly instead, and include reproduction steps.

## Code of conduct

Be straightforward and respectful. Assume good faith, critique code rather than
people, and accept that review comments exist to make the change correct — not to
win an argument.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
