import { prisma } from '@/lib/prisma';
import { computeActionHash, GENESIS_HASH, verifyChain, type ChainVerification } from '@/lib/audit/hash-chain';
import {
  containsPii,
  evaluatePolicies,
  parsePolicyYaml,
  type PolicyDocument
} from '@/lib/policy/engine';
import { APPROVAL_RULES, type LogActionInput } from '@/lib/schemas';
import { parseJson, toJsonString } from '@/lib/utils';

export interface LogActionResult {
  actionId: string;
  sequence: number;
  hash: string;
  previousHash: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'PENDING_APPROVAL';
  blocked: boolean;
  requiresApproval: boolean;
  approvalRequestId: string | null;
  policyChecks: {
    policyId: string;
    policyName: string;
    passed: boolean;
    violations: unknown[];
  }[];
  throttleReason: string | null;
}

async function loadAgentPolicies(agentId: string): Promise<{ id: string; name: string; doc: PolicyDocument }[]> {
  const links = await prisma.agentPolicy.findMany({
    where: { agentId },
    include: { policy: true }
  });

  const parsed: { id: string; name: string; doc: PolicyDocument }[] = [];
  for (const link of links) {
    if (!link.policy.enabled) continue;
    try {
      // Re-parse with the shared engine so a malformed policy is skipped rather
      // than breaking the whole action log.
      parsed.push({ id: link.policy.id, name: link.policy.name, doc: parsePolicyYaml(link.policy.rulesYaml) });
    } catch {
      // A broken policy must not silently pass everything; treat it as blocking.
      parsed.push({
        id: link.policy.id,
        name: link.policy.name,
        doc: {
          name: link.policy.name,
          framework: 'CUSTOM',
          rules: [
            {
              field: 'actionType',
              operator: 'exists',
              severity: 'critical',
              message: `Policy "${link.policy.name}" is malformed and was not evaluated`
            }
          ]
        }
      });
    }
  }
  return parsed;
}

/**
 * Append one action to the agent's hash chain.
 *
 * Order matters: policy evaluation happens BEFORE the row is written, because
 * the outcome (`BLOCKED` / `PENDING_APPROVAL`) is part of the hashed payload.
 * A blocked action is still recorded — that is the audit evidence.
 */
export async function logAgentAction(
  agentId: string,
  input: LogActionInput
): Promise<LogActionResult> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { policies: { include: { policy: true } } }
  });
  if (!agent) throw new Error('Agent not found');

  const policies = await loadAgentPolicies(agentId);

  const evaluation = evaluatePolicies(
    policies.map((p) => p.doc),
    {
      actionType: input.actionType,
      input: input.input,
      output: input.output,
      status: input.status,
      tokenCost: input.tokenCost
    }
  );

  // Cost throttle: a budget with autoThrottle that is over its limit blocks work.
  const throttled = agent.status === 'PRODUCTION' ? await checkThrottle(agentId) : null;

  const blocked = (evaluation.blocked || Boolean(throttled)) && !input.force;
  const requiresApproval =
    !blocked && (evaluation.requiresApproval || isHighRisk(input) || Boolean(throttled));

  const status = blocked
    ? ('BLOCKED' as const)
    : requiresApproval
      ? ('PENDING_APPROVAL' as const)
      : input.status;

  // Sequence + previous hash for this agent's chain.
  const last = await prisma.agentAction.findFirst({
    where: { agentId },
    orderBy: { sequence: 'desc' }
  });
  const sequence = (last?.sequence ?? 0) + 1;
  const previousHash = last?.hash ?? GENESIS_HASH;
  const createdAt = new Date();

  const inputJson = toJsonString(input.input);
  const outputJson = toJsonString(input.output);
  const policyChecksJson = toJsonString(
    evaluation.results.map((r) => ({
      policyId: policies.find((p) => p.name === r.policyName)?.id ?? null,
      policyName: r.policyName,
      passed: r.outcome.passed,
      blocked: r.outcome.blocked,
      requiresApproval: r.outcome.requiresApproval,
      violations: r.outcome.violations
    }))
  );

  const hash = computeActionHash(previousHash, {
    sequence,
    actionType: input.actionType,
    input: input.input,
    output: input.output,
    status,
    latencyMs: input.latencyMs,
    tokenCost: input.tokenCost,
    timestamp: createdAt.toISOString(),
    actor: input.actor
  });

  const action = await prisma.agentAction.create({
    data: {
      agentId,
      actionType: input.actionType,
      input: inputJson,
      output: outputJson,
      status,
      latencyMs: input.latencyMs,
      tokenCost: input.tokenCost,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      model: input.model || 'unknown',
      policyChecks: policyChecksJson,
      hash,
      previousHash,
      sequence,
      actor: input.actor,
      createdAt
    }
  });

  // Persist one evaluation row per policy for the compliance dashboard.
  for (const result of evaluation.results) {
    const policy = policies.find((p) => p.name === result.policyName);
    if (!policy) continue;
    await prisma.policyEvaluation.create({
      data: {
        actionId: action.id,
        policyId: policy.id,
        passed: result.outcome.passed,
        violations: toJsonString(result.outcome.violations)
      }
    });
  }

  let approvalRequestId: string | null = null;
  if (requiresApproval) {
    const request = await prisma.approvalRequest.create({
      data: {
        actionId: action.id,
        agentId,
        reason: buildReason(input, evaluation.blocked, throttled),
        riskScore: computeRiskScore(input, evaluation.blocked),
        status: 'PENDING',
        requestedBy: agent.ownerId,
        expiresAt: new Date(Date.now() + APPROVAL_RULES.expiryHours * 3600_000)
      }
    });
    approvalRequestId = request.id;
  }

  return {
    actionId: action.id,
    sequence,
    hash,
    previousHash,
    status,
    blocked,
    requiresApproval,
    approvalRequestId,
    policyChecks: parseJson(action.policyChecks, []),
    throttleReason: throttled
  };
}

function isHighRisk(input: LogActionInput): boolean {
  if (input.tokenCost > APPROVAL_RULES.costThreshold) return true;
  return APPROVAL_RULES.externalApiActionTypes.includes(
    input.actionType as (typeof APPROVAL_RULES.externalApiActionTypes)[number]
  );
}

function buildReason(input: LogActionInput, policyBlocked: boolean, throttle: string | null): string {
  if (throttle) return `Auto-throttled: ${throttle}`;
  if (policyBlocked) return 'Blocked by policy evaluation';
  if (input.tokenCost > APPROVAL_RULES.costThreshold) {
    return `High cost action: $${input.tokenCost.toFixed(2)} exceeds the $${APPROVAL_RULES.costThreshold} threshold`;
  }
  return `High-risk action type: ${input.actionType}`;
}

function computeRiskScore(input: LogActionInput, policyBlocked: boolean): number {
  let score = policyBlocked ? 70 : 10;
  if (input.tokenCost > APPROVAL_RULES.costThreshold) score += 15;
  if (APPROVAL_RULES.externalApiActionTypes.includes(input.actionType as never)) score += 10;
  if (containsPii(input.input)) score += 10;
  return Math.min(100, score);
}

async function checkThrottle(agentId: string): Promise<string | null> {
  const budget = await prisma.costBudget.findFirst({
    where: { agentId, autoThrottle: true }
  });
  if (!budget) return null;
  if (budget.currentSpend >= budget.monthlyLimit) {
    return `Agent budget of $${budget.monthlyLimit} exhausted (spent $${budget.currentSpend.toFixed(2)})`;
  }
  return null;
}

export async function verifyAgentChain(
  agentId: string,
  range?: { start?: Date; end?: Date }
): Promise<ChainVerification> {
  const links = await prisma.agentAction.findMany({
    where: {
      agentId,
      createdAt: {
        ...(range?.start ? { gte: range.start } : {}),
        ...(range?.end ? { lte: range.end } : {})
      }
    },
    orderBy: { sequence: 'asc' }
  });

  return verifyChain(
    links.map((l) => ({
      id: l.id,
      sequence: l.sequence,
      previousHash: l.previousHash,
      hash: l.hash,
      createdAt: l.createdAt,
      actionType: l.actionType,
      status: l.status,
      input: l.input,
      output: l.output,
      latencyMs: l.latencyMs,
      tokenCost: l.tokenCost,
      actor: l.actor
    }))
  );
}
