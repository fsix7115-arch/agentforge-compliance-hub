import { z } from 'zod';
import yaml from 'js-yaml';

/**
 * A policy is authored as YAML, validated with Zod, then evaluated against an
 * agent action. Rules use dotted paths into the action payload so a policy can
 * address any nested field without the engine knowing the domain.
 *
 * Operator semantics: each operator states the REQUIRED (allowed) condition for
 * a rule to pass. A violation is recorded when the condition is NOT satisfied —
 * so `not_contains: PHI` is violated by PHI, exactly as an auditor reads it.
 */
export const PolicyRuleSchema = z.object({
  field: z.string().min(1, 'field is required'),
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'gt',
    'gte',
    'lt',
    'lte',
    'exists',
    'not_exists',
    'in',
    'not_in',
    'matches',
    'not_matches',
    'pii_detected',
    'no_pii',
    'max_length'
  ]),
  value: z.unknown().optional(),
  severity: z.enum(['info', 'warning', 'critical']).default('warning'),
  message: z.string().optional()
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicyDocumentSchema = z.object({
  name: z.string().min(1, 'policy name is required'),
  framework: z.enum(['GDPR', 'HIPAA', 'SOC2', 'PCI_DSS', 'CUSTOM']).default('CUSTOM'),
  description: z.string().optional(),
  rules: z.array(PolicyRuleSchema).min(1, 'at least one rule is required')
});

export type PolicyDocument = z.infer<typeof PolicyDocumentSchema>;

export interface Violation {
  rule: PolicyRule;
  field: string;
  operator: string;
  expected: unknown;
  actual: unknown;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface EvaluationOutcome {
  passed: boolean;
  blocked: boolean;
  requiresApproval: boolean;
  violations: Violation[];
  rulesChecked: number;
}

/** Patterns that indicate personally identifiable information. */
const PII_PATTERNS: RegExp[] = [
  /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/, // email
  /\b(?:\d[ -]*?){13,16}\b/, // card number
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b(?:\+?\d{1,3}[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}\b/, // phone
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ // IP
];

export function parsePolicyYaml(source: string): PolicyDocument {
  let raw: unknown;
  try {
    raw = yaml.load(source);
  } catch (error) {
    throw new PolicyParseError(
      `Invalid YAML: ${error instanceof Error ? error.message : 'parse failed'}`
    );
  }

  const parsed = PolicyDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ');
    throw new PolicyParseError(detail);
  }
  return parsed.data;
}

export class PolicyParseError extends Error {}

/** Read a dotted path out of an arbitrary payload. `a.b.c`, `a.b[0].c` both work. */
export function readPath(source: unknown, path: string): unknown {
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);

  let current: unknown = source;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function containsPii(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const text = stringify(value);
  if (text.length === 0) return false;
  if (/PHI|PII|protected.health|patient/i.test(text)) return true;
  return PII_PATTERNS.some((pattern) => pattern.test(text));
}

function compare(actual: unknown, expected: unknown, operator: PolicyRule['operator']): boolean {
  switch (operator) {
    case 'equals':
      return stringify(actual) === stringify(expected);
    case 'not_equals':
      return stringify(actual) !== stringify(expected);
    case 'contains':
      return stringify(actual).includes(stringify(expected));
    case 'not_contains':
      return !stringify(actual).includes(stringify(expected));
    case 'starts_with':
      return stringify(actual).startsWith(stringify(expected));
    case 'ends_with':
      return stringify(actual).endsWith(stringify(expected));
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not_exists':
      return actual === undefined || actual === null;
    case 'in':
      return Array.isArray(expected)
        ? expected.map(stringify).includes(stringify(actual))
        : false;
    case 'not_in':
      return Array.isArray(expected)
        ? !expected.map(stringify).includes(stringify(actual))
        : false;
    case 'matches':
      try {
        return new RegExp(stringify(expected)).test(stringify(actual));
      } catch {
        return false;
      }
    // `pii_detected` passes when PII IS present; `no_pii` passes when it is not.
    // Writing `pii_detected` as a policy would therefore mean "require PII",
    // which nobody wants — use `no_pii` to forbid it.
    case 'pii_detected':
      return containsPii(actual);
    case 'no_pii':
      return !containsPii(actual);
    case 'max_length':
      return stringify(actual).length <= Number(expected);
    default:
      return true;
  }
}

export interface ActionPayload {
  actionType: string;
  input: unknown;
  output: unknown;
  status: string;
  tokenCost: number;
}

/**
 * Evaluate one parsed policy against an action. A policy fails when any rule
 * matches its violation condition. `critical` violations block the action;
 * `warning` violations only mark it for approval.
 */
export function evaluatePolicy(document: PolicyDocument, action: ActionPayload): EvaluationOutcome {
  const violations: Violation[] = [];

  for (const rule of document.rules) {
    const actual = readPath(action, rule.field);
    const violated = !compare(actual, rule.value, rule.operator);

    if (violated) {
      violations.push({
        rule,
        field: rule.field,
        operator: rule.operator,
        expected: rule.value,
        actual: actual === undefined ? null : actual,
        severity: rule.severity,
        message:
          rule.message ??
          `${rule.field} ${rule.operator} ${stringify(rule.value)} was not satisfied`
      });
    }
  }

  const hasCritical = violations.some((v) => v.severity === 'critical');
  const hasWarning = violations.some((v) => v.severity === 'warning');

  return {
    passed: violations.length === 0,
    blocked: hasCritical,
    requiresApproval: violations.length > 0 && !hasCritical,
    violations,
    rulesChecked: document.rules.length
  };
}

/** Evaluate many policies; the strictest outcome wins. */
export function evaluatePolicies(
  documents: PolicyDocument[],
  action: ActionPayload
): { blocked: boolean; requiresApproval: boolean; results: { policyName: string; outcome: EvaluationOutcome }[] } {
  const results = documents.map((doc) => ({ policyName: doc.name, outcome: evaluatePolicy(doc, action) }));
  return {
    blocked: results.some((r) => r.outcome.blocked),
    requiresApproval: !results.some((r) => r.outcome.blocked) && results.some((r) => r.outcome.requiresApproval),
    results
  };
}
