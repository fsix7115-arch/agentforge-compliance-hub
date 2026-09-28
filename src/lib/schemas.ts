import { z } from 'zod';

/** Enum-like value sets. SQLite has no native enums, so Zod owns them. */
export const ORG_PLANS = ['FREE', 'PRO', 'ENTERPRISE'] as const;
export const USER_ROLES = ['ADMIN', 'AUDITOR', 'DEVELOPER', 'VIEWER'] as const;
export const AGENT_STATUSES = ['DRAFT', 'STAGING', 'PRODUCTION', 'DEPRECATED'] as const;
export const ACTION_STATUSES = ['SUCCESS', 'FAILED', 'BLOCKED', 'PENDING_APPROVAL'] as const;
export const POLICY_FRAMEWORKS = ['GDPR', 'HIPAA', 'SOC2', 'PCI_DSS', 'CUSTOM'] as const;
export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;
export const SEVERITIES = ['info', 'warning', 'critical'] as const;

export const EVALUATION_METRICS = [
  'accuracy',
  'hallucination_rate',
  'latency_p50',
  'latency_p95',
  'user_satisfaction',
  'task_completion_rate'
] as const;

export const OrgPlanSchema = z.enum(ORG_PLANS);
export const UserRoleSchema = z.enum(USER_ROLES);
export const AgentStatusSchema = z.enum(AGENT_STATUSES);
export const ActionStatusSchema = z.enum(ACTION_STATUSES);
export const PolicyFrameworkSchema = z.enum(POLICY_FRAMEWORKS);
export const ApprovalStatusSchema = z.enum(APPROVAL_STATUSES);
export const EvaluationMetricSchema = z.enum(EVALUATION_METRICS);

export const AgentConfigSchema = z.object({
  model: z.string().default('gpt-4o'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().max(200_000).default(4096),
  systemPrompt: z.string().max(20_000).default(''),
  tools: z.array(z.string()).max(50).default([]),
  permissions: z.array(z.string()).max(50).default([])
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const CreateAgentSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).default(''),
  version: z.string().max(40).default('0.1.0'),
  status: AgentStatusSchema.default('DRAFT'),
  tags: z.array(z.string().max(40)).max(20).default([]),
  config: AgentConfigSchema.partial().default({}),
  ownerId: z.string().optional(),
  /** Policy ids to attach immediately. */
  policyIds: z.array(z.string()).max(100).default([]),
  /** Agent ids this agent depends on. */
  dependsOn: z.array(z.string()).max(20).default([])
});

export const UpdateAgentSchema = CreateAgentSchema.partial();

export const AgentQuerySchema = z.object({
  search: z.string().optional(),
  status: AgentStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

export const LogActionSchema = z.object({
  actionType: z.string().min(1).max(120),
  input: z.unknown().default({}),
  output: z.unknown().default({}),
  status: ActionStatusSchema.default('SUCCESS'),
  latencyMs: z.number().int().min(0).max(3_600_000).default(0),
  tokenCost: z.number().min(0).max(1_000_000).default(0),
  inputTokens: z.number().int().min(0).default(0),
  outputTokens: z.number().int().min(0).default(0),
  model: z.string().max(120).default(''),
  actor: z.string().max(200).default('agent'),
  /** When true the server always logs, even if a policy would block. */
  force: z.boolean().default(false)
});

export type LogActionInput = z.infer<typeof LogActionSchema>;

export const ActionQuerySchema = z.object({
  status: ActionStatusSchema.optional(),
  actionType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  onlyViolations: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().positive().max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

export const CreatePolicySchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().max(2000).default(''),
  framework: PolicyFrameworkSchema.default('CUSTOM'),
  rulesYaml: z.string().min(10),
  enabled: z.boolean().default(true),
  agentIds: z.array(z.string()).max(100).default([])
});

export const UpdatePolicySchema = CreatePolicySchema.partial();

export const SimulatePolicySchema = z.object({
  policyId: z.string().optional(),
  rulesYaml: z.string().optional(),
  actionType: z.string().default('test'),
  input: z.unknown().default({}),
  output: z.unknown().default({}),
  status: ActionStatusSchema.default('SUCCESS'),
  tokenCost: z.number().min(0).default(0),
  /** Replay against stored actions instead of a synthetic payload. */
  historicalActionIds: z.array(z.string()).max(200).default([])
});

export const CreateBudgetSchema = z.object({
  label: z.string().min(2).max(120),
  agentId: z.string().optional(),
  monthlyLimit: z.number().positive().max(10_000_000),
  alertThreshold: z.number().min(0.01).max(1).default(0.8),
  autoThrottle: z.boolean().default(false)
});

export const UpdateBudgetSchema = CreateBudgetSchema.partial();

export const CreateEvaluationSchema = z.object({
  agentId: z.string().min(1),
  metric: EvaluationMetricSchema,
  value: z.number(),
  sampleSize: z.number().int().min(0).max(1_000_000).default(0),
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/, 'period must be YYYY-MM or YYYY-MM-DD')
});

export const EvaluationQuerySchema = z.object({
  agentId: z.string().optional(),
  metric: EvaluationMetricSchema.optional(),
  period: z.string().optional()
});

export const CreateApprovalSchema = z.object({
  actionId: z.string().min(1),
  agentId: z.string().min(1),
  reason: z.string().min(3).max(500),
  riskScore: z.number().min(0).max(100).default(0),
  requestedBy: z.string().optional(),
  expiresInHours: z.number().int().positive().max(720).default(24)
});

export const ApprovalQuerySchema = z.object({
  status: ApprovalStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0)
});

export const DecideApprovalSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(1000).default('')
});

export const AuditExportSchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
  agentId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().int().positive().max(10_000).default(1000)
});

export const SignupSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  organizationName: z.string().min(2).max(120),
  organizationSlug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, numbers and dashes')
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const InstallPackSchema = z.object({
  packId: z.string().min(1)
});

/** Default approval rules applied when an action is logged. */
export const APPROVAL_RULES = {
  costThreshold: 10,
  piiTriggersApproval: true,
  externalApiActionTypes: ['external_api_call', 'data_export', 'webhook'],
  expiryHours: 24
} as const;
