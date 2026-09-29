ci: set DATABASE_URL in the e2e database setup step

The step ran prisma generate / db push / seed without DATABASE_URL, so
Prisma exited P1012 before any test ran. Verified locally with the exact
CI sequence: generate, push, seed, then Playwright 3/3 with CI=true.