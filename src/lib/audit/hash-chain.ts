import { createHash } from 'node:crypto';

/** Genesis hash — the `previousHash` of the first action in any chain. */
export const GENESIS_HASH = '0'.repeat(64);

export interface ActionHashInput {
  sequence: number;
  actionType: string;
  input: unknown;
  output: unknown;
  status: string;
  latencyMs: number;
  tokenCost: number;
  timestamp: string;
  actor: string;
}

/**
 * Canonical JSON: keys sorted recursively so the same logical action always
 * serializes to identical bytes. Without this, key order could differ between
 * the write path and the verification read, producing a false tamper alarm.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';

  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
  return JSON.stringify(value);
}

/**
 * hash = SHA256(previousHash | canonicalActionData)
 *
 * The agent id is intentionally excluded: the chain is per-agent and the row
 * already belongs to that agent, so excluding it keeps a stored row
 * self-verifiable without joining back to the parent.
 */
export function computeActionHash(previousHash: string, action: ActionHashInput): string {
  return createHash('sha256')
    .update(previousHash)
    .update('|')
    .update(canonicalize(action))
    .digest('hex');
}

export interface ChainLink {
  id: string;
  sequence: number;
  previousHash: string;
  hash: string;
  createdAt: Date;
  actionType: string;
  status: string;
  input: string;
  output: string;
  latencyMs: number;
  tokenCost: number;
  actor: string;
}

export interface ChainBreak {
  index: number;
  actionId: string;
  sequence: number;
  reason: 'hash-mismatch' | 'broken-link' | 'sequence-gap' | 'wrong-genesis';
  expected: string;
  actual: string;
}

export interface ChainVerification {
  valid: boolean;
  checked: number;
  breaks: ChainBreak[];
  headHash: string | null;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Walk a chain in sequence order and recompute every hash. Any mutation of a
 * stored row — or a deleted row — surfaces here as a break.
 */
export function verifyChain(links: ChainLink[]): ChainVerification {
  const breaks: ChainBreak[] = [];
  const ordered = [...links].sort((a, b) => a.sequence - b.sequence);

  let expectedPrevious = GENESIS_HASH;
  let expectedSequence = 1;

  ordered.forEach((link, index) => {
    if (index === 0 && link.previousHash !== GENESIS_HASH) {
      breaks.push({
        index,
        actionId: link.id,
        sequence: link.sequence,
        reason: 'wrong-genesis',
        expected: GENESIS_HASH,
        actual: link.previousHash
      });
    } else if (index > 0 && link.previousHash !== expectedPrevious) {
      breaks.push({
        index,
        actionId: link.id,
        sequence: link.sequence,
        reason: 'broken-link',
        expected: expectedPrevious,
        actual: link.previousHash
      });
    }

    if (link.sequence !== expectedSequence) {
      breaks.push({
        index,
        actionId: link.id,
        sequence: link.sequence,
        reason: 'sequence-gap',
        expected: String(expectedSequence),
        actual: String(link.sequence)
      });
    }

    const recomputed = computeActionHash(link.previousHash, {
      sequence: link.sequence,
      actionType: link.actionType,
      input: safeParse(link.input),
      output: safeParse(link.output),
      status: link.status,
      latencyMs: link.latencyMs,
      tokenCost: link.tokenCost,
      timestamp: link.createdAt.toISOString(),
      actor: link.actor
    });

    if (recomputed !== link.hash) {
      breaks.push({
        index,
        actionId: link.id,
        sequence: link.sequence,
        reason: 'hash-mismatch',
        expected: recomputed,
        actual: link.hash
      });
    }

    expectedPrevious = link.hash;
    expectedSequence = link.sequence + 1;
  });

  return {
    valid: breaks.length === 0,
    checked: ordered.length,
    breaks,
    headHash: ordered.length ? ordered[ordered.length - 1].hash : null
  };
}
