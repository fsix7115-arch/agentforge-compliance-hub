import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  Bot,
  FileCheck2,
  KeyRound,
  ScrollText,
  ShieldCheck,
  Wallet
} from 'lucide-react';
import { getSession } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const FEATURES = [
  {
    icon: Bot,
    name: 'Agent Registry',
    body: 'Every agent with its version, owner, status lifecycle and dependencies. draft → staging → production → deprecated.'
  },
  {
    icon: ScrollText,
    name: 'Tamper-proof audit trail',
    body: 'Every action hash-chained: hash = SHA256(previousHash + action). Mutate or delete one row and the whole chain breaks loudly.'
  },
  {
    icon: ShieldCheck,
    name: 'Policy engine',
    body: 'Declarative YAML policies against GDPR, HIPAA, SOC2 and PCI-DSS. Simulate against history before you enforce.'
  },
  {
    icon: Wallet,
    name: 'Cost governance',
    body: 'Per-agent budgets with alerts at 50/80/100% and auto-throttle that actually blocks work at 100%.'
  },
  {
    icon: BarChart3,
    name: 'Evaluations',
    body: 'Accuracy, hallucination rate, latency percentiles. Points beyond 2σ from baseline are flagged as anomalies.'
  },
  {
    icon: FileCheck2,
    name: 'Human in the loop',
    body: 'High-risk actions queue for approval with reason, SLA ageing and a full decision trail.'
  }
];

const PRICING = [
  { name: 'Free', price: '$0', items: ['Up to 3 agents', '1,000 actions / month', 'Community policy packs'], cta: 'Start free' },
  { name: 'Pro', price: '$99', items: ['Unlimited agents', '250,000 actions / month', 'Slack alerts, auto-throttle', 'Audit export API'], cta: 'Start 14-day trial', featured: true },
  { name: 'Enterprise', price: 'Custom', items: ['Postgres + multi-region', 'SSO / SCIM', 'Custom policy packs', 'Support SLA'], cta: 'Talk to us' }
];

export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect('/dashboard');

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="h-4 w-4" />
            </span>
            AgentForge Compliance Hub
          </span>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="py-20 text-center">
          <Badge variant="secondary" className="mb-5">
            Open-core enterprise AI governance
          </Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Ship AI agents your compliance team can approve
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Companies want agent deployments but cannot sign off on them. AgentForge gives you a
            registry, a tamper-proof audit trail, a policy engine, cost budgets and human-in-the-loop
            approvals — the evidence an auditor actually asks for.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/signup">
                Start free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="https://github.com/fsix7115-arch/agentforge-compliance-hub" target="_blank" rel="noreferrer">
                <KeyRound className="mr-2 h-4 w-4" />
                View on GitHub
              </a>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-16 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, name, body }) => (
            <Card key={name} className="p-6">
              <Icon className="mb-3 h-6 w-6 text-primary" />
              <h2 className="text-base font-semibold">{name}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </Card>
          ))}
        </section>

        <section className="border-t py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight">Pricing</h2>
          <p className="mt-2 text-center text-muted-foreground">
            Free forever for small teams. The compliance features are not a paid add-on.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PRICING.map((tier) => (
              <Card
                key={tier.name}
                className={tier.featured ? 'relative border-primary shadow-md' : 'relative'}
              >
                {tier.featured && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most popular</Badge>
                )}
                <div className="p-6">
                  <h3 className="font-semibold">{tier.name}</h3>
                  <p className="mt-2 text-3xl font-bold">{tier.price}</p>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {tier.items.map((item) => (
                      <li key={item}>· {item}</li>
                    ))}
                  </ul>
                  <Button className="mt-6 w-full" variant={tier.featured ? 'default' : 'outline'} asChild>
                    <Link href="/signup">{tier.cta}</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        AgentForge Compliance Hub · MIT licensed · built with Next.js, Prisma and Zod
      </footer>
    </div>
  );
}

