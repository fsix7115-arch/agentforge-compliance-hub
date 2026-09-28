import { describe, expect, it } from 'vitest';
import {
  GENESIS_HASH,
  canonicalize,
  computeActionHash,
  verifyChain,
  type ChainLink
} from '@/lib/audit/hash-chain';

function link(partial: Partial<ChainLink> & { sequence: number }): ChainLink {
  return {
    id: `a${partial.sequence}`,
    previousHash: GENESIS_HASH,
    hash: 'x',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    actionType: 'test',
    status: 'SUCCESS',
    input: '{}',
    output: '{}',
    latencyMs: 10,
    tokenCost: 0.01,
    actor: 'agent',
    ...partial
  };
}

/** Build a valid chain of n links. */
function buildChain(n: number): ChainLink[] {
  const links: ChainLink[] = [];
  let previous = GENESIS_HASH;

  for (let i = 1; i <= n; i++) {
    const base = link({ sequence: i, previousHash: previous });
    const hash = computeActionHash(previous, {
      sequence: base.sequence,
      actionType: base.actionType,
      input: {},
      output: {},
      status: base.status,
      latencyMs: base.latencyMs,
      tokenCost: base.tokenCost,
      timestamp: base.createdAt.toISOString(),
      actor: base.actor
    });
    links.push({ ...base, hash });
    previous = hash;
  }
  return links;
}

describe('canonicalize', () => {
  it('sorts object keys recursively so serialization is stable', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('is insensitive to key order', () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });

  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  it('normalises non-finite numbers to null', () => {
    expect(canonicalize({ x: NaN })).toBe('{"x":null}');
    expect(canonicalize({ x: Infinity })).toBe('{"x":null}');
  });
});

describe('computeActionHash', () => {
  const args = {
    sequence: 1,
    actionType: 'call',
    input: { a: 1 },
    output: { b: 2 },
    status: 'SUCCESS',
    latencyMs: 5,
    tokenCost: 0.5,
    timestamp: '2026-01-01T00:00:00.000Z',
    actor: 'x'
  };

  it('is deterministic', () => {
    expect(computeActionHash(GENESIS_HASH, args)).toBe(computeActionHash(GENESIS_HASH, args));
  });

  it('changes when the previous hash changes', () => {
    expect(computeActionHash('a'.repeat(64), args)).not.toBe(computeActionHash('b'.repeat(64), args));
  });

  it('produces a sha256 hex digest', () => {
    expect(computeActionHash(GENESIS_HASH, args)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyChain', () => {
  it('accepts an empty chain', () => {
    expect(verifyChain([])).toMatchObject({ valid: true, checked: 0, headHash: null });
  });

  it('validates an intact chain', () => {
    const result = verifyChain(buildChain(5));
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(5);
    expect(result.breaks).toHaveLength(0);
  });

  it('detects a mutated payload', () => {
    const chain = buildChain(4);
    chain[2].input = JSON.stringify({ tampered: true });
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.breaks[0].reason).toBe('hash-mismatch');
    expect(result.breaks[0].sequence).toBe(3);
  });

  it('detects a deleted row via a sequence gap', () => {
    const chain = buildChain(4);
    chain.splice(2, 1);
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.breaks.some((b) => b.reason === 'sequence-gap')).toBe(true);
    expect(result.breaks.some((b) => b.reason === 'broken-link')).toBe(true);
  });

  it('detects a broken link when a row is replaced wholesale', () => {
    const chain = buildChain(3);
    chain[1] = { ...chain[1], previousHash: 'f'.repeat(64) };
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.breaks.some((b) => b.reason === 'broken-link')).toBe(true);
  });

  it('rejects a chain that does not start at genesis', () => {
    const chain = buildChain(2);
    chain[0].previousHash = 'e'.repeat(64);
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.breaks.some((b) => b.reason === 'wrong-genesis')).toBe(true);
  });

  it('verifies out-of-order input by sorting on sequence', () => {
    const chain = buildChain(3);
    const shuffled = [chain[2], chain[0], chain[1]];
    expect(verifyChain(shuffled).valid).toBe(true);
  });
});
