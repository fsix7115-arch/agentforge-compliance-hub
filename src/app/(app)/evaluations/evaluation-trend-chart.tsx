'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

export interface SeriesData {
  agentId: string;
  agentName: string;
  metric: string;
  points: { period: string; value: number }[];
  anomalies: { period: string; value: number; zScore: number; direction: string }[];
}

export function EvaluationTrendChart({ series }: { series: SeriesData[] }) {
  if (series.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
        No evaluation metrics reported yet.
      </p>
    );
  }

  // Pivot one agent's series into a recharts-friendly shape.
  const first = series[0];
  const chartData = first.points.map((point, index) => {
    const row: Record<string, string | number> = { period: point.period };
    for (const s of series) {
      const match = s.points[index];
      if (match) row[s.agentName] = match.value;
    }
    return row;
  });

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        {first.metric.replace(/_/g, ' ')} over time
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={45} />
          <Tooltip />
          <Legend />
          {series.map((s, index) => (
            <Line
              key={s.agentId}
              type="monotone"
              dataKey={s.agentName}
              stroke={`hsl(${(index * 70 + 221) % 360} 83% 53%)`}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
