'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FlaskConical, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface Violation {
  field: string;
  operator: string;
  expected: unknown;
  actual: unknown;
  severity: string;
  message: string;
}

export function PolicyEditor({ templates }: { templates: { name: string; framework: string; yaml: string }[] }) {
  const router = useRouter();
  const [yaml, setYaml] = useState(templates[0]?.yaml ?? '');
  const [name, setName] = useState(templates[0]?.name ?? 'Custom policy');
  const [framework, setFramework] = useState(templates[0]?.framework ?? 'CUSTOM');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulation, setSimulation] = useState<{
    passed: boolean;
    blocked: boolean;
    violations: Violation[];
  } | null>(null);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch('/api/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, framework, rulesYaml: yaml, enabled: true, agentIds: [] })
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? 'Could not save the policy');
        return;
      }
      toast.success('Policy created');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function simulate() {
    setSimulating(true);
    try {
      const response = await fetch('/api/policies/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rulesYaml: yaml,
          actionType: 'data_export',
          input: { userId: 'u_1', dataType: 'PHI', email: 'patient@example.com' },
          output: {},
          status: 'SUCCESS',
          tokenCost: 0
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? 'Simulation failed');
        return;
      }
      setSimulation(payload.data.results[0]);
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="name">Policy name</Label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="framework">Framework</Label>
              <select
                id="framework"
                value={framework}
                onChange={(e) => setFramework(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="GDPR">GDPR</option>
                <option value="HIPAA">HIPAA</option>
                <option value="SOC2">SOC2</option>
                <option value="PCI_DSS">PCI-DSS</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this policy protects"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <Label htmlFor="yaml">Rules (YAML)</Label>
            <select
              onChange={(e) => {
                const template = templates.find((t) => t.name === e.target.value);
                if (template) {
                  setYaml(template.yaml);
                  setName(template.name);
                  setFramework(template.framework);
                  setSimulation(null);
                }
              }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">Load a template…</option>
              {templates.map((template) => (
                <option key={template.name} value={template.name}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
          <Textarea
            id="yaml"
            rows={16}
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            className="font-mono text-xs leading-relaxed"
            spellCheck={false}
          />
          <div className="mt-3 flex gap-2">
            <Button onClick={simulate} disabled={simulating} variant="secondary">
              {simulating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Simulate
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save policy
            </Button>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            Simulation result
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Runs your draft against a synthetic payload. Nothing is persisted and nothing is enforced.
          </p>

          {!simulation ? (
            <p className="mt-6 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Press <span className="font-medium">Simulate</span> to test this policy.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant={simulation.passed ? 'success' : simulation.blocked ? 'destructive' : 'secondary'}>
                  {simulation.passed ? 'would pass' : simulation.blocked ? 'would block' : 'would escalate'}
                </Badge>
                <span className="text-xs text-muted-foreground">test action: data_export</span>
              </div>

              {simulation.violations.map((violation, index) => (
                <div key={index} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{violation.field}</span>
                    <Badge variant={violation.severity === 'critical' ? 'destructive' : 'secondary'}>
                      {violation.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">{violation.message}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    actual: {JSON.stringify(violation.actual)?.slice(0, 120)}
                  </p>
                </div>
              ))}

              {simulation.violations.length === 0 && (
                <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  No violations — this action would be allowed.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
