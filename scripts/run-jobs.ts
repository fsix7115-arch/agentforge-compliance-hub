/**
 * Standalone cost-aggregation job.
 *
 * The dashboard also refreshes aggregates on read, so this script is the
 * "run it from cron" path for deployments that prefer not to depend on
 * request-time refresh. Safe to run repeatedly — every step is idempotent
 * (upserts keyed on the natural composite unique).
 *
 * Usage:
 *   npm run jobs:aggregate
 */
import { PrismaClient } from '@prisma/client';
import {
  aggregateCosts,
  evaluateBudgetAlerts,
  refreshBudgetSpend
} from '../src/lib/services/costs';

const prisma = new PrismaClient();

async function main() {
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });

  let buckets = 0;
  let alerts = 0;
  for (const org of organizations) {
    const result = await aggregateOrganization(org.id);
    buckets += result.buckets;
    alerts += result.alerts;
  }

  console.log(
    `[jobs] aggregated ${buckets} cost bucket(s) and raised ${alerts} budget alert(s) ` +
      `across ${organizations.length} organization(s) at ${new Date().toISOString()}`
  );
}

async function aggregateOrganization(organizationId: string) {
  await refreshBudgetSpend(organizationId);
  const { buckets } = await aggregateCosts(organizationId);
  const { created } = await evaluateBudgetAlerts(organizationId);
  return { buckets, alerts: created };
}

main()
  .catch((error) => {
    console.error('[jobs] aggregation failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
