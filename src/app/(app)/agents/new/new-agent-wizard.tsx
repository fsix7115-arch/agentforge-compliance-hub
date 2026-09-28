'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface Policy {
  id: string;
  name: string;
  framework: string;
}

const STEPS = ['Identity', 'Configuration', 'Policies', 'Budget'] as const;

export function NewAgentWizard({ policies }: { policies: Policy[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    version: '0.1.0',
    status: 'DRAFT',
    tags: '',
    model: 'gpt-4o',
    temperature: 0.7,
    systemPrompt: '',
    tools: '',
    policyIds: [] as string[],
    budgetEnabled: false,
    monthlyLimit: '50',
    autoThrottle: true
  });

  const update = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const canAdvance =
    step === 0 ? form.name.trim().length >= 2 : step === 1 ? form.model.trim().length > 0 : true;

  async function submit() {
    setSubmitting(true);
    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          version: form.version,
          status: form.status,
          tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
          config: {
            model: form.model,
            temperature: Number(form.temperature),
            systemPrompt: form.systemPrompt,
            tools: form.tools.split(',').map((t) => t.trim()).filter(Boolean),
            permissions: []
          },
          policyIds: form.policyIds,
          dependsOn: []
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? 'Could not create the agent');
        return;
      }

      const agentId = payload.data.id;

      if (form.budgetEnabled) {
        await fetch('/api/costs/budgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: `${form.name} budget`,
            agentId,
            monthlyLimit: Number(form.monthlyLimit),
            alertThreshold: 0.8,
            autoThrottle: form.autoThrottle
          })
        });
      }

      toast.success('Agent registered');
      router.push(`/agents/${agentId}`);
      router.refresh();
    } catch {
      toast.error('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <a href="/agents">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to agents
          </a>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Register an agent</h1>
        <p className="text-sm text-muted-foreground">
          Four short steps. Policies and budgets can be changed later.
        </p>
      </div>

      <ol className="flex items-center gap-2">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium ${
                index < step
                  ? 'bg-primary text-primary-foreground'
                  : index === step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
              }`}
            >
              {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={`hidden text-xs sm:block ${index === step ? 'font-medium' : 'text-muted-foreground'}`}
            >
              {label}
            </span>
            {index < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      <Card className="p-6">
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Agent name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="Customer Support Agent"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">What does it do?</Label>
              <Textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="Answers customer questions using the internal help-center corpus."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="version">Version</Label>
                <Input id="version" value={form.version} onChange={(e) => update({ version: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Lifecycle status</Label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) => update({ status: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="DRAFT">draft</option>
                  <option value="STAGING">staging</option>
                  <option value="PRODUCTION">production</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input
                id="tags"
                value={form.tags}
                onChange={(e) => update({ tags: e.target.value })}
                placeholder="support, customer-facing"
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input id="model" value={form.model} onChange={(e) => update({ model: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature ({form.temperature})</Label>
                <input
                  id="temperature"
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={form.temperature}
                  onChange={(e) => update({ temperature: Number(e.target.value) })}
                  className="mt-3 w-full"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="systemPrompt">System prompt</Label>
              <Textarea
                id="systemPrompt"
                rows={5}
                value={form.systemPrompt}
                onChange={(e) => update({ systemPrompt: e.target.value })}
                placeholder="You are a support agent. Never invent policy details."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tools">Tools (comma separated)</Label>
              <Input
                id="tools"
                value={form.tools}
                onChange={(e) => update({ tools: e.target.value })}
                placeholder="kb_search, ticket_read"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Policies are evaluated on every logged action. Critical violations block; warnings queue
              for approval.
            </p>
            {policies.length === 0 ? (
              <p className="text-sm">No policies in this organization yet.</p>
            ) : (
              <ul className="space-y-2">
                {policies.map((policy) => (
                  <li key={policy.id} className="flex items-center gap-3 rounded-md border p-3">
                    <Checkbox
                      id={policy.id}
                      checked={form.policyIds.includes(policy.id)}
                      onCheckedChange={(checked) =>
                        update({
                          policyIds: checked
                            ? [...form.policyIds, policy.id]
                            : form.policyIds.filter((id) => id !== policy.id)
                        })
                      }
                    />
                    <Label htmlFor={policy.id} className="flex-1 cursor-pointer">
                      {policy.name}
                      <span className="ml-2 text-xs text-muted-foreground">{policy.framework}</span>
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <label className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={form.budgetEnabled}
                onCheckedChange={(checked) => update({ budgetEnabled: Boolean(checked) })}
              />
              <span className="text-sm">Set a monthly budget for this agent</span>
            </label>
            {form.budgetEnabled && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="monthlyLimit">Monthly limit (USD)</Label>
                  <Input
                    id="monthlyLimit"
                    type="number"
                    min={1}
                    value={form.monthlyLimit}
                    onChange={(e) => update({ monthlyLimit: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={form.autoThrottle}
                    onCheckedChange={(checked) => update({ autoThrottle: Boolean(checked) })}
                  />
                  <span className="text-sm">
                    Auto-throttle at 100% — block actions once the budget is exhausted
                  </span>
                </label>
              </>
            )}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Register agent
          </Button>
        )}
      </div>
    </div>
  );
}
