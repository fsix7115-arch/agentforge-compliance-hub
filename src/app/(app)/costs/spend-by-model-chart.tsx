'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['hsl(221 83% 53%)', 'hsl(262 83% 58%)', 'hsl(142 71% 45%)', 'hsl(38 92% 50%)', 'hsl(0 72% 51%)'];

export function SpendByModelChart({ data }: { data: { model: string; cost: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No spend recorded yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="cost"
          nameKey="model"
          innerRadius={50}
          outerRadius={85}
          paddingAngle={2}
        >
          {data.map((entry, index) => (
            <Cell key={entry.model} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => [`$${value.toFixed(4)}`, 'Spend']} />
      </PieChart>
    </ResponsiveContainer>
  );
}
