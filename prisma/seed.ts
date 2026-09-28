import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { computeActionHash, GENESIS_HASH } from '../src/lib/audit/hash-chain';
import { POLICY_TEMPLATES } from '../src/lib/policy/templates';
import { MARKETPLACE_TEMPLATES } from './marketplace-data';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = 'seed-salt-not-for-production';
  return `${salt}:${require('node:crypto').scryptSync(password, salt, 64).toString('hex')}`;
}

async function main() {
  const existing = await prisma.organization.count();
  if (existing > 0) {
    console.log(`Seed skipped: ${existing} organization(s) already present.`);
    console.log('Run `npm run db:reset` for a clean demo dataset.');
    return;
  }

  const org = await prisma.organization.create({
    data: { name: 'Acme AI Labs', slug: 'acme-ai', plan: 'PRO' }
  });

  const passwordHash = hashPassword('password123');

  const admin = await prisma.user.create({
    data: {
      email: 'admin@acme.ai',
      name: 'Ada Admin',
      passwordHash,
      role: 'ADMIN',
      organizationId: org.id
    }
  });

  const auditor = await prisma.user.create({
    data: {
      email: 'auditor@acme.ai',
      name: 'Alan Auditor',
      passwordHash,
      role: 'AUDITOR',
      organizationId: org.id
    }
  });

  const developer = await prisma.user.create({
    data: {
      email: 'dev@acme.ai',
      name: 'Dev Engineer',
      passwordHash,
      role: 'DEVELOPER',
      organizationId: org.id
    }
  });

  // --- Policies from the built-in templates -------------------------------
  const policies = [];
  for (const template of POLICY_TEMPLATES) {
    policies.push(
      await prisma.policy.create({
        data: {
          name: template.name,
          description: template.description,
          framework: template.framework,
          rulesYaml: template.yaml,
          enabled: true,
          organizationId: org.id
        }
      })
    );
  }

  // --- Agents -------------------------------------------------------------
  const supportAgent = await prisma.agent.create({
    data: {
      name: 'Customer Support Agent',
      slug: 'customer-support-agent',
      description: 'Answers customer questions using the internal help-center corpus.',
      version: '2.1.0',
      status: 'PRODUCTION',
      tags: JSON.stringify(['support', 'customer-facing', 'rag']),
      config: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.3,
        maxTokens: 2048,
        systemPrompt: 'You are a support agent. Never invent policy details.',
        tools: ['kb_search', 'ticket_read', 'ticket_write'],
        permissions: ['read:kb', 'write:tickets']
      }),
      ownerId: developer.id,
      organizationId: org.id
    }
  });

  const analyticsAgent = await prisma.agent.create({
    data: {
      name: 'Analytics Summarizer',
      slug: 'analytics-summarizer',
      description: 'Summarises product analytics and flags anomalies for the growth team.',
      version: '1.0.0',
      status: 'STAGING',
      tags: JSON.stringify(['analytics', 'internal']),
      config: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        maxTokens: 1024,
        systemPrompt: 'Summarise metrics. Never speculate without labelling it.',
        tools: ['warehouse_query'],
        permissions: ['read:warehouse']
      }),
      ownerId: developer.id,
      organizationId: org.id
    }
  });

  const exportAgent = await prisma.agent.create({
    data: {
      name: 'Data Export Agent',
      slug: 'data-export-agent',
      description: 'Exports user data on request. High risk — requires approval.',
      version: '0.4.0',
      status: 'PRODUCTION',
      tags: JSON.stringify(['gdpr', 'export', 'high-risk']),
      config: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0,
        maxTokens: 4096,
        systemPrompt: 'Handle data subject access requests exactly as policy dictates.',
        tools: ['db_query', 'file_write', 'email_send'],
        permissions: ['read:users', 'write:exports', 'send:email']
      }),
      ownerId: admin.id,
      organizationId: org.id
    }
  });

  await prisma.agentDep.create({
    data: { agentId: analyticsAgent.id, dependsOn: supportAgent.id }
  });

  // Attach policies so the engine has something to evaluate on every action.
  await prisma.agentPolicy.createMany({
    data: [
      { agentId: supportAgent.id, policyId: policies[0].id },
      { agentId: supportAgent.id, policyId: policies[2].id },
      { agentId: exportAgent.id, policyId: policies[1].id },
      { agentId: exportAgent.id, policyId: policies[3].id },
      { agentId: exportAgent.id, policyId: policies[4].id }
    ]
  });

  // --- Actions with a real hash chain -------------------------------------
  const seedActions: {
    agentId: string;
    actionType: string;
    input: unknown;
    output: unknown;
    status: string;
    latencyMs: number;
    tokenCost: number;
    inputTokens: number;
    outputTokens: number;
    model: string;
    actor: string;
    createdAt: Date;
  }[] = [
    {
      agentId: supportAgent.id,
      actionType: 'kb_search',
      input: { query: 'how do I reset my password', topK: 5 },
      output: { results: 3, topDoc: 'kb/password-reset' },
      status: 'SUCCESS',
      latencyMs: 820,
      tokenCost: 0.012,
      inputTokens: 410,
      outputTokens: 180,
      model: 'gpt-4o',
      actor: 'support-bot',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26)
    },
    {
      agentId: supportAgent.id,
      actionType: 'ticket_reply',
      input: { ticketId: 'T-1041', channel: 'email' },
      output: { replied: true, tokens: 190 },
      status: 'SUCCESS',
      latencyMs: 1450,
      tokenCost: 0.031,
      inputTokens: 620,
      outputTokens: 190,
      model: 'gpt-4o',
      actor: 'support-bot',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 25)
    },
    {
      agentId: supportAgent.id,
      actionType: 'external_api_call',
      input: { url: 'https://api.crm.example/v1/tickets/T-1041' },
      output: { synced: true },
      status: 'PENDING_APPROVAL',
      latencyMs: 2100,
      tokenCost: 0.004,
      inputTokens: 90,
      outputTokens: 40,
      model: 'gpt-4o',
      actor: 'support-bot',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24)
    },
    {
      agentId: exportAgent.id,
      actionType: 'data_export',
      input: { userId: 'u_88213', containsPii: true },
      output: { blocked: true },
      status: 'BLOCKED',
      latencyMs: 60,
      tokenCost: 0.001,
      inputTokens: 40,
      outputTokens: 12,
      model: 'gpt-4o',
      actor: 'export-bot',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20)
    },
    {
      agentId: exportAgent.id,
      actionType: 'data_export',
      input: { userId: 'u_90001' },
      output: { fileWritten: 'exports/u_90001.json' },
      status: 'PENDING_APPROVAL',
      latencyMs: 3100,
      tokenCost: 0.42,
      inputTokens: 800,
      outputTokens: 240,
      model: 'gpt-4o',
      actor: 'export-bot',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18)
    },
    {
      agentId: analyticsAgent.id,
      actionType: 'warehouse_query',
      input: { query: 'weekly_active_users', range: '28d' },
      output: { value: 18422, delta: 0.062 },
      status: 'SUCCESS',
      latencyMs: 5400,
      tokenCost: 0.078,
      inputTokens: 1100,
      outputTokens: 320,
      model: 'gpt-4o-mini',
      actor: 'analytics-bot',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6)
    }
  ];

  const byAgentSeq = new Map<string, number>();
  const byAgentHash = new Map<string, string>();
  const createdActions: { id: string; agentId: string; status: string }[] = [];

  for (const seed of seedActions) {
    const sequence = (byAgentSeq.get(seed.agentId) ?? 0) + 1;
    const previousHash = byAgentHash.get(seed.agentId) ?? GENESIS_HASH;
    const hash = computeActionHash(previousHash, {
      sequence,
      actionType: seed.actionType,
      input: seed.input,
      output: seed.output,
      status: seed.status,
      latencyMs: seed.latencyMs,
      tokenCost: seed.tokenCost,
      timestamp: seed.createdAt.toISOString(),
      actor: seed.actor
    });

    const action = await prisma.agentAction.create({
      data: {
        agentId: seed.agentId,
        actionType: seed.actionType,
        input: JSON.stringify(seed.input),
        output: JSON.stringify(seed.output),
        status: seed.status,
        latencyMs: seed.latencyMs,
        tokenCost: seed.tokenCost,
        inputTokens: seed.inputTokens,
        outputTokens: seed.outputTokens,
        model: seed.model,
        policyChecks: '[]',
        hash,
        previousHash,
        sequence,
        actor: seed.actor,
        createdAt: seed.createdAt
      }
    });

    createdActions.push({ id: action.id, agentId: seed.agentId, status: seed.status });
    byAgentSeq.set(seed.agentId, sequence);
    byAgentHash.set(seed.agentId, hash);
  }

  // One pending approval so the queue is not empty on first load.
  const pendingAction = createdActions.find((a) => a.status === 'PENDING_APPROVAL' && a.agentId === exportAgent.id);
  if (pendingAction) {
    await prisma.approvalRequest.create({
      data: {
        actionId: pendingAction.id,
        agentId: exportAgent.id,
        reason: 'Data subject request: export of personal data requires DPO sign-off',
        riskScore: 65,
        status: 'PENDING',
        requestedBy: admin.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
      }
    });
  }

  // --- Budgets ------------------------------------------------------------
  const orgBudget = await prisma.costBudget.create({
    data: {
      organizationId: org.id,
      label: 'Org-wide monthly LLM spend',
      monthlyLimit: 500,
      alertThreshold: 0.8,
      autoThrottle: false
    }
  });

  await prisma.costBudget.create({
    data: {
      organizationId: org.id,
      agentId: exportAgent.id,
      label: 'Data Export Agent budget',
      monthlyLimit: 50,
      alertThreshold: 0.5,
      autoThrottle: true
    }
  });

  // --- Evaluations --------------------------------------------------------
  const months = ['2026-07', '2026-08', '2026-09'];
  for (const [index, period] of months.entries()) {
    await prisma.evaluation.createMany({
      data: [
        {
          agentId: supportAgent.id,
          metric: 'accuracy',
          value: [0.78, 0.84, 0.89][index],
          sampleSize: 200 + index * 40,
          period
        },
        {
          agentId: supportAgent.id,
          metric: 'hallucination_rate',
          value: [0.12, 0.09, 0.04][index],
          sampleSize: 200 + index * 40,
          period
        },
        {
          agentId: supportAgent.id,
          metric: 'latency_p95',
          value: [2400, 2100, 1850][index],
          sampleSize: 200 + index * 40,
          period
        },
        {
          agentId: exportAgent.id,
          metric: 'task_completion_rate',
          value: [0.71, 0.79, 0.86][index],
          sampleSize: 80 + index * 20,
          period
        }
      ]
    });
  }

  // A deliberate spike so the anomaly detector has something to flag.
  await prisma.evaluation.create({
    data: {
      agentId: analyticsAgent.id,
      metric: 'latency_p95',
      value: 9100,
      sampleSize: 120,
      period: '2026-09'
    }
  });
  for (const period of ['2026-07', '2026-08']) {
    await prisma.evaluation.create({
      data: { agentId: analyticsAgent.id, metric: 'latency_p95', value: 4200 + (period === '2026-08' ? 200 : 0), sampleSize: 120, period }
    });
  }

  // --- Marketplace --------------------------------------------------------
  for (const pack of [
    { slug: 'gdpr-basics', name: 'GDPR Essentials', framework: 'GDPR', priceCents: 0, description: 'Data subject access, retention and export policies.' },
    { slug: 'hipaa-basics', name: 'HIPAA Essentials', framework: 'HIPAA', priceCents: 4900, description: 'PHI access control and minimum-necessary policies.' },
    { slug: 'soc2-basics', name: 'SOC2 Change Control', framework: 'SOC2', priceCents: 0, description: 'Change-control and access-review policies.' },
    { slug: 'pci-basics', name: 'PCI-DSS Cardholder Data', framework: 'PCI_DSS', priceCents: 2900, description: 'Prebuilt cardholder-data guardrails.' }
  ]) {
    const template = POLICY_TEMPLATES.find((t) => t.framework === pack.framework);
    await prisma.marketplacePack.create({
      data: {
        slug: pack.slug,
        name: pack.name,
        description: pack.description,
        framework: pack.framework,
        priceCents: pack.priceCents,
        policiesYaml: template?.yaml ?? POLICY_TEMPLATES[0].yaml
      }
    });
  }

  for (const template of MARKETPLACE_TEMPLATES) {
    await prisma.marketplaceTemplate.create({
      data: {
        slug: template.slug,
        name: template.name,
        description: template.description,
        category: template.category,
        priceCents: template.priceCents,
        configJson: JSON.stringify(template.config, null, 2)
      }
    });
  }

  // --- Cost aggregates ----------------------------------------------------
  const { aggregateCosts, refreshBudgetSpend } = await import('../src/lib/services/costs');
  await refreshBudgetSpend(org.id);
  await aggregateCosts(org.id);

  console.log(`
Seed complete.

  Organization : ${org.name} (${org.slug})
  Users        : admin@acme.ai / auditor@acme.ai / dev@acme.ai
  Password     : password123
  Agents       : ${[supportAgent.name, analyticsAgent.name, exportAgent.name].join(', ')}
  Policies     : ${policies.length}
  Actions      : ${createdActions.length} (hash-chained)
  Budgets      : ${orgBudget.label} + Data Export Agent budget

  Try: /api/agents/${supportAgent.id}/audit/verify
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
