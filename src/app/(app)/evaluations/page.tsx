import { AlertTriangle } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { evaluationDashboard } from '@/lib/services/evaluations';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EvaluationTrendChart } from './evaluation-trend-chart';

export const dynamic = 'force-dynamic';

const METRIC_LABELS: Record<string, string> = {
  accuracy: 'Accuracy',
  hallucination_rate: 'Hallucination rate',
  latency_p50: 'Latency p50 (ms)',
  latency_p95: 'Latency p95 (ms)',
  user_satisfaction: 'User satisfaction',
  task_completion_rate: 'Task completion rate'
};

export default async function EvaluationsPage({
  searchParams
}: {
  searchParams: { metric?: string; agentId?: string };
}) {
  const session = await requireSession();
  const dashboard = await evaluationDashboard(session.organizationId, searchParams.agentId);

  const metrics = [...new Set(dashboard.series.map((s) => s.metric))];
  const activeMetric = searchParams.metric && metrics.includes(searchParams.metric) ? searchParams.metric : metrics[0];
  const activeSeries = activeMetric
    ? dashboard.series.filter((s) => s.metric === activeMetric)
    : [];

  const allAnomalies = dashboard.series.flatMap((s) =>
    s.anomalies.map((a) => ({ ...a, agentName: s.agentName, metric: s.metric }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Evaluation dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Quality metrics reported by agents. Points beyond 2 standard deviations from baseline are
          flagged automatically.
        </p>
      </div>

      {metrics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {metrics.map((metric) => (
            <a
              key={metric}
              href={`/evaluations?metric=${metric}`}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                metric === activeMetric
                  ? 'border-primary bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {METRIC_LABELS[metric] ?? metric}
            </a>
          ))}
        </div>
      )}

      <Card className="p-5">
        <EvaluationTrendChart
          series={activeSeries.map((s) => ({
            agentId: s.agentId,
            agentName: s.agentName,
            metric: s.metric,
            points: s.points,
            anomalies: s.anomalies
          }))}
        />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Anomalies ({allAnomalies.length})
          </h2>
          {allAnomalies.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No metric deviated more than 2σ from its baseline.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {allAnomalies.map((anomaly, index) => (
                <li key={index} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{anomaly.agentName}</span>
                    <Badge variant={anomaly.direction === 'spike' ? 'destructive' : 'secondary'}>
                      {anomaly.direction} · {anomaly.zScore.toFixed(1)}σ
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {METRIC_LABELS[anomaly.metric] ?? anomaly.metric} in {anomaly.period}: {anomaly.value}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Latest values by agent</h2>
          {dashboard.latestByAgent.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No agents to report on yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {dashboard.latestByAgent.map((agent) => (
                <li key={agent.agentId} className="text-sm">
                  <p className="font-medium">{agent.agentName}</p>
                  {agent.metrics.length === 0 ? (
                    <p className="text-xs text-muted-foreground">no metrics reported</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {agent.metrics.map((metric) => (
                        <li key={metric.metric} className="flex justify-between gap-2 text-xs text-muted-foreground">
                          <span>{METRIC_LABELS[metric.metric] ?? metric.metric}</span>
                          <span className="font-mono">
                            {metric.current.toFixed(3)}
                            {metric.change !== 0 && (
                              <span
                                className={`ml-1 ${metric.change > 0 ? 'text-success' : 'text-destructive'}`}
                              >
                                {metric.change > 0 ? '+' : ''}
                                {metric.change.toFixed(0)}%
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
