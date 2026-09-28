import { prisma } from '@/lib/prisma';

export interface SeriesPoint {
  period: string;
  value: number;
  sampleSize: number;
}

export interface Anomaly {
  period: string;
  value: number;
  mean: number;
  stdDev: number;
  zScore: number;
  direction: 'spike' | 'drop';
}

/**
 * Flag a point that deviates more than `threshold` standard deviations from the
 * mean of the *other* points, so a single outlier cannot mask itself.
 */
export function detectAnomalies(
  series: SeriesPoint[],
  threshold = 2
): { anomalies: Anomaly[]; mean: number; stdDev: number } {
  if (series.length < 4) return { anomalies: [], mean: 0, stdDev: 0 };

  const anomalies: Anomaly[] = [];

  series.forEach((point, index) => {
    const others = series.filter((_, i) => i !== index).map((p) => p.value);
    const mean = others.reduce((a, b) => a + b, 0) / others.length;
    const variance = others.reduce((sum, v) => sum + (v - mean) ** 2, 0) / others.length;
    const stdDev = Math.sqrt(variance);

    // A flat baseline has zero variance, so z-score is undefined. Any deviation
    // from a perfectly stable series is the anomaly worth surfacing.
    if (stdDev === 0) {
      if (point.value !== mean) {
        anomalies.push({
          period: point.period,
          value: point.value,
          mean,
          stdDev: 0,
          zScore: point.value > mean ? Infinity : -Infinity,
          direction: point.value > mean ? 'spike' : 'drop'
        });
      }
      return;
    }

    const zScore = (point.value - mean) / stdDev;
    if (Math.abs(zScore) >= threshold) {
      anomalies.push({
        period: point.period,
        value: point.value,
        mean,
        stdDev,
        zScore,
        direction: zScore > 0 ? 'spike' : 'drop'
      });
    }
  });

  const values = series.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  );

  return { anomalies, mean, stdDev };
}

export async function evaluationDashboard(organizationId: string, agentId?: string) {
  const evaluations = await prisma.evaluation.findMany({
    where: {
      agent: { organizationId },
      ...(agentId ? { agentId } : {})
    },
    orderBy: { period: 'asc' }
  });

  const agents = await prisma.agent.findMany({
    where: { organizationId },
    select: { id: true, name: true }
  });
  const agentNameById = new Map(agents.map((a) => [a.id, a.name]));

  const byMetric = new Map<string, SeriesPoint[]>();
  for (const evaluation of evaluations) {
    const key = `${evaluation.agentId}|${evaluation.metric}`;
    const points = byMetric.get(key) ?? [];
    points.push({ period: evaluation.period, value: evaluation.value, sampleSize: evaluation.sampleSize });
    byMetric.set(key, points);
  }

  const series = [...byMetric.entries()].map(([key, points]) => {
    const [agent, metric] = key.split('|');
    const sorted = [...points].sort((a, b) => a.period.localeCompare(b.period));
    const { anomalies, mean, stdDev } = detectAnomalies(sorted);
    return {
      agentId: agent,
      agentName: agentNameById.get(agent) ?? 'unknown',
      metric,
      points: sorted,
      mean,
      stdDev,
      anomalies
    };
  });

  const latestByAgent = agents.map((agent) => {
    const agentSeries = series.filter((s) => s.agentId === agent.id);
    const summary = agentSeries.map((s) => {
      const last = s.points[s.points.length - 1];
      const first = s.points[0];
      const change =
        last && first && first.value !== 0
          ? ((last.value - first.value) / Math.abs(first.value)) * 100
          : 0;
      return {
        metric: s.metric,
        current: last?.value ?? 0,
        previous: first?.value ?? 0,
        change,
        anomalies: s.anomalies.length
      };
    });
    return { agentId: agent.id, agentName: agent.name, metrics: summary };
  });

  return { series, latestByAgent };
}
