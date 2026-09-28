import { describe, expect, it } from 'vitest';
import {
  PolicyParseError,
  containsPii,
  evaluatePolicies,
  evaluatePolicy,
  parsePolicyYaml,
  readPath
} from '@/lib/policy/engine';

const ACTION = { actionType: 'data_export', input: {}, output: {}, status: 'SUCCESS', tokenCost: 0 };

describe('parsePolicyYaml', () => {
  it('parses a valid policy', () => {
    const doc = parsePolicyYaml(`
name: "Test"
framework: "GDPR"
rules:
  - field: "tokenCost"
    operator: "gt"
    value: 10
    severity: "warning"
`);
    expect(doc.name).toBe('Test');
    expect(doc.framework).toBe('GDPR');
    expect(doc.rules).toHaveLength(1);
  });

  it('defaults severity to warning', () => {
    const doc = parsePolicyYaml('name: T\nrules:\n  - field: a\n    operator: exists\n');
    expect(doc.rules[0].severity).toBe('warning');
  });

  it('rejects invalid YAML', () => {
    expect(() => parsePolicyYaml('name: [unclosed')).toThrow(PolicyParseError);
  });

  it('rejects an unknown operator', () => {
    expect(() =>
      parsePolicyYaml('name: T\nrules:\n  - field: a\n    operator: "wat"\n')
    ).toThrow(PolicyParseError);
  });

  it('rejects a policy with no rules', () => {
    expect(() => parsePolicyYaml('name: T\nrules: []\n')).toThrow(PolicyParseError);
  });
});

describe('readPath', () => {
  it('reads nested paths', () => {
    expect(readPath({ a: { b: { c: 7 } } }, 'a.b.c')).toBe(7);
  });

  it('reads array indices with bracket syntax', () => {
    expect(readPath({ a: [{ b: 1 }, { b: 2 }] }, 'a[1].b')).toBe(2);
  });

  it('returns undefined for a missing path', () => {
    expect(readPath({ a: 1 }, 'x.y.z')).toBeUndefined();
  });
});

describe('evaluatePolicy', () => {
  it('passes when no rule is violated', () => {
    const doc = parsePolicyYaml('name: T\nrules:\n  - field: tokenCost\n    operator: lt\n    value: 100\n');
    const result = evaluatePolicy(doc, { ...ACTION, tokenCost: 5 });
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('blocks when a critical allowed-condition is not met', () => {
    // `lte: 10` means "cost must stay at or below 10" — 50 violates it.
    const doc = parsePolicyYaml(
      'name: T\nrules:\n  - field: tokenCost\n    operator: lte\n    value: 10\n    severity: critical\n'
    );
    const result = evaluatePolicy(doc, { ...ACTION, tokenCost: 50 });
    expect(result.passed).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it('escalates rather than blocks when a warning allowed-condition is not met', () => {
    const doc = parsePolicyYaml(
      'name: T\nrules:\n  - field: tokenCost\n    operator: lte\n    value: 10\n    severity: warning\n'
    );
    const result = evaluatePolicy(doc, { ...ACTION, tokenCost: 50 });
    expect(result.blocked).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  it('treats not_contains as a prohibition, matching how an auditor reads it', () => {
    // The spec example: not_contains PHI is violated BY PHI.
    const doc = parsePolicyYaml(
      'name: T\nrules:\n  - field: input.dataType\n    operator: not_contains\n    value: PHI\n    severity: critical\n'
    );
    expect(evaluatePolicy(doc, { ...ACTION, input: { dataType: 'PHI' } }).blocked).toBe(true);
    expect(evaluatePolicy(doc, { ...ACTION, input: { dataType: 'public' } }).passed).toBe(true);
  });

  it('no_pii passes when the payload is clean and fails when it is not', () => {
    const doc = parsePolicyYaml(
      'name: T\nrules:\n  - field: input\n    operator: no_pii\n    severity: critical\n'
    );
    expect(evaluatePolicy(doc, { ...ACTION, input: { note: 'all clear' } }).passed).toBe(true);
    expect(evaluatePolicy(doc, { ...ACTION, input: { email: 'a@b.com' } }).blocked).toBe(true);
  });

  it('honours actionType in rules', () => {
    // `in` states the ALLOWED action types; anything outside the list violates.
    const doc = parsePolicyYaml(
      'name: T\nrules:\n  - field: actionType\n    operator: in\n    value: ["read", "search"]\n    severity: critical\n'
    );
    expect(evaluatePolicy(doc, { ...ACTION, actionType: 'read' }).passed).toBe(true);
    expect(evaluatePolicy(doc, { ...ACTION, actionType: 'data_export' }).blocked).toBe(true);
  });

  it('pii_detected passes only when PII IS present', () => {
    const doc = parsePolicyYaml(
      'name: T\nrules:\n  - field: input\n    operator: pii_detected\n    severity: critical\n'
    );
    expect(evaluatePolicy(doc, { ...ACTION, input: { email: 'a@b.com' } }).passed).toBe(true);
    expect(evaluatePolicy(doc, { ...ACTION, input: { note: 'clean' } }).blocked).toBe(true);
  });

  it('fails closed on an unparseable regex instead of throwing', () => {
    const doc = parsePolicyYaml('name: T\nrules:\n  - field: input\n    operator: matches\n    value: "[unclosed"\n');
    const result = evaluatePolicy(doc, { ...ACTION, input: { x: 'anything' } });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it('supports not_in and not_matches', () => {
    const doc = parsePolicyYaml(
      'name: T\nrules:\n  - field: actionType\n    operator: not_in\n    value: ["db_write"]\n    severity: critical\n'
    );
    expect(evaluatePolicy(doc, { ...ACTION, actionType: 'db_write' }).blocked).toBe(true);
    expect(evaluatePolicy(doc, { ...ACTION, actionType: 'read' }).passed).toBe(true);
  });
});

describe('evaluatePolicies', () => {
  it('takes the strictest outcome across policies', () => {
    // "exports are only allowed with an approval flag" — no flag means block.
    const blocked = parsePolicyYaml(
      'name: Blocker\nrules:\n  - field: input.approved\n    operator: equals\n    value: true\n    severity: critical\n'
    );
    const warn = parsePolicyYaml(
      'name: Warner\nrules:\n  - field: tokenCost\n    operator: lte\n    value: 1\n    severity: warning\n'
    );
    const result = evaluatePolicies([warn, blocked], { ...ACTION, tokenCost: 99 });
    expect(result.blocked).toBe(true);
    // A critical violation anywhere means no approval queue — it is blocked.
    expect(result.requiresApproval).toBe(false);
  });
});

describe('containsPii', () => {
  it('finds emails and card numbers', () => {
    expect(containsPii({ e: 'a@b.com' })).toBe(true);
    expect(containsPii({ card: '4111111111111111' })).toBe(true);
  });

  it('does not flag innocuous text', () => {
    expect(containsPii({ note: 'the weather is fine' })).toBe(false);
    expect(containsPii(null)).toBe(false);
  });
});

