import { prisma } from '@/lib/prisma';

export interface CostRow {
  agentId: string | null;
  agentName: string | null;
  model: string;
  period: string;
  totalCost: number;
  totalTokens: number;
  actionCount: number;
}

export interface BudgetStatus {
  id: string;
  label: string;
  agentId: string | null;
  agentName: string | null;
  monthlyLimit: number;
  currentSpend: number;
  percentUsed: number;
  alertThreshold: number;
  autoThrottle: boolean;
  level: 'ok' | 'warning' | 'critical' | 'exhausted';
  throttled: boolean;
}

/**
 * Recompute budget spend from the audit trail, which is the source of truth.
 * Called by the aggregation job and after every logged action.
 */
export async function refreshBudgetSpend(organizationId: string): Promise<void> {
  const budgets = await prisma.costBudget.findMany({ where: { organizationId } });

  for (const budget of budgets) {
    const where = {
      agentId: budget.agentId ?? undefined,
      createdAt: { gte: budget.periodStart }
    };

    const aggregate = await prisma.agentAction.aggregate({
      where,
      _sum: { tokenCost: true },
      _count: { _all: true }
    });

    const spend = aggregate._sum.tokenCost ?? 0;
    if (Math.abs(spend - budget.currentSpend) > 0.0001) {
      await prisma.costBudget.update({ where: { id: budget.id }, data: { currentSpend: spend } });
    }
  }
}

export function budgetLevel(percentUsed: number, alertThreshold: number): BudgetStatus['level'] {
  if (percentUsed >= 100) return 'exhausted';
  if (percentUsed >= 100) return 'critical';
  if (percentUsed >= alertThreshold * 100) return 'warning';
  return 'ok';
}

/**
 * Create alert rows for newly crossed thresholds. Idempotent: an alert is only
 * written once per (budget, level) per period.
 */
export async function evaluateBudgetAlerts(organizationId: string): Promise<{ created: number; alerts: string[] }> {
  const budgets = await prisma.costBudget.findMany({
    where: { organizationId },
    include: { agent: { select: { name: true } } }
  });

  let created = 0;
  const messages: string[] = [];

  for (const budget of budgets) {
    const percentUsed = budget.monthlyLimit > 0 ? (budget.currentSpend / budget.monthlyLimit) * 100 : 0;
    const level = budgetLevel(percentUsed, budget.alertThreshold);

    if (level === 'ok') continue;

    const existing = await prisma.costAlert.findFirst({
      where: { budgetId: budget.id, level, createdAt: { gte: budget.periodStart } }
    });
    if (existing) continue;

    await prisma.costAlert.create({
      data: {
        budgetId: budget.id,
        level,
        spend: budget.currentSpend,
        limit: budget.monthlyLimit,
        notified: false
      }
    });
    created += 1;

    messages.push(
      `[${level.toUpperCase()}] ${budget.label} (${budget.agent?.name ?? 'org-wide'}) at ${percentUsed.toFixed(1)}% — $${budget.currentSpend.toFixed(2)} of $${budget.monthlyLimit.toFixed(2)}`
    );
  }

  return { created, alerts: messages };
}

/** Roll raw actions up into daily/weekly/monthly buckets for the dashboard. */
export async function aggregateCosts(organizationId: string): Promise<{ buckets: number }> {
  const actions = await prisma.agentAction.findMany({
    where: {
      agent: { organizationId }
    },
    select: {
      agentId: true,
      model: true,
      tokenCost: true,
      inputTokens: true,
      outputTokens: true,
      createdAt: true
    }
  });

  const buckets = new Map<string, { cost: number; tokens: number; count: number }>();

  for (const action of actions) {
    for (const [granularity, period] of periodKeys(action.createdAt)) {
      const key = `${action.agentId}|${action.model}|${period}`;
      const bucket = buckets.get(key) ?? { cost: 0, tokens: 0, count: 0 };
      bucket.cost += action.tokenCost;
      bucket.tokens += action.inputTokens + action.outputTokens;
      bucket.count += 1;
      buckets.set(key, bucket);
    }
  }

  for (const [key, value] of buckets) {
    const [agentId, model, period] = key.split('|');
    await prisma.costAggregate.upsert({
      where: {
        organizationId_agentId_model_period: {
          organizationId,
          agentId,
          model,
          period
        }
      },
      create: { organizationId, agentId, model, period, totalCost: value.cost, totalTokens: value.tokens, actionCount: value.count },
      update: { totalCost: value.cost, totalTokens: value.tokens, actionCount: value.count }
    });
  }

  await refreshBudgetSpend(organizationId);
  return { buckets: buckets.size };
}

function periodKeys(date: Date): [string, string][] {
  const day = date.toISOString().slice(0, 10);
  const month = date.toISOString().slice(0, 7);

  const week = (() => {
    const d = new Date(date);
    const dayIndex = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayIndex);
    return d.toISOString().slice(0, 10);
  })();

  return [
    ['day', `day:${day}`],
    ['week', `week:${week}`],
    ['month', `month:${month}`]
  ];
}

export async function costDashboard(organizationId: string) {
  const [byAgent, byModel, byDay, budgets, monthTotal] = await Promise.all([
    prisma.agent.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        _count: { select: { actions: true } }
      }
    }),
    prisma.costAggregate.groupBy({
      by: ['model', 'period'],
      where: { organizationId, period: { startsWith: 'day:' } },
      _sum: { totalCost: true, totalTokens: true }
    }),
    prisma.costAggregate.findMany({
      where: { organizationId, period: { startsWith: 'day:' } },
      orderBy: { period: 'asc' }
    }),
    prisma.costBudget.findMany({
      where: { organizationId },
      include: { agent: { select: { name: true } }, alerts: { orderBy: { createdAt: 'desc' }, take: 3 } }
    }),
    prisma.agentAction.aggregate({
      where: { agent: { organizationId }, createdAt: { gte: startOfMonth() } },
      _sum: { tokenCost: true }
    })
  ]);

  const spendByAgent = await prisma.agentAction.groupBy({
    by: ['agentId'],
    where: { agent: { organizationId } },
    _sum: { tokenCost: true, inputTokens: true, outputTokens: true },
    _count: { _all: true }
  });

  const agentNameById = new Map(byAgent.map((a) => [a.id, a.name]));

  return {
    monthSpend: monthTotal._sum.tokenCost ?? 0,
    spendByAgent: spendByAgent
      .map((row) => ({
        agentId: row.agentId,
        agentName: agentNameById.get(row.agentId) ?? 'unknown',
        cost: row._sum.tokenCost ?? 0,
        tokens: (row._sum.inputTokens ?? 0) + (row._sum.outputTokens ?? 0),
        actions: row._count._all
      }))
      .sort((a, b) => b.cost - a.cost),
    spendByModel: byModel
      .filter((m) => m.period.startsWith('day:'))
      .reduce<Record<string, { cost: number; tokens: number }>>((acc, row) => {
        const model = row.model || 'unknown';
        acc[model] = acc[model] ?? { cost: 0, tokens: 0 };
        acc[model].cost += row._sum.totalCost ?? 0;
        acc[model].tokens += row._sum.totalTokens ?? 0;
        return acc;
      }, {}),
    dailySpend: byDay
      .filter((d) => d.period.startsWith('day:'))
      .map((d) => ({ date: d.period.replace('day:', ''), cost: d.totalCost, tokens: d.totalTokens })),
    budgets: budgets.map(budgetStatus)
  };
}

export function budgetStatus(budget: {
  id: string;
  label: string;
  agentId: string | null;
  monthlyLimit: number;
  currentSpend: number;
  alertThreshold: number;
  autoThrottle: boolean;
  agent?: { name: string } | null;
}): BudgetStatus {
  const percentUsed = budget.monthlyLimit > 0 ? (budget.currentSpend / budget.monthlyLimit) * 100 : 0;
  const level = budgetLevel(percentUsed, budget.alertThreshold);
  return {
    id: budget.id,
    label: budget.label,
    agentId: budget.agentId,
    agentName: budget.agent?.name ?? null,
    monthlyLimit: budget.monthlyLimit,
    currentSpend: budget.currentSpend,
    percentUsed,
    alertThreshold: budget.alertThreshold,
    autoThrottle: budget.autoThrottle,
    level,
    throttled: budget.autoThrottle && percentUsed >= 100
  };
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
