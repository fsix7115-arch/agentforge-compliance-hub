import { cookies } from 'next/headers';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';

export const SESSION_COOKIE = 'af_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Minimal cookie-session auth. NextAuth is on the roadmap, but shipping the
 * real hash chain and policy engine matters more than an auth library, so the
 * MVP uses a signed, httpOnly cookie backed by the User table.
 *
 * To move to NextAuth: keep the same `requireSession()` contract and swap the
 * cookie read for `getServerSession()`.
 */
export type Role = 'ADMIN' | 'AUDITOR' | 'DEVELOPER' | 'VIEWER';

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, derived] = stored.split(':');
  if (!salt || !derived) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(derived, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

function sign(value: string): string {
  const secret = process.env.NEXTAUTH_SECRET ?? 'dev-only-secret';
  return createHash('sha256').update(`${secret}:${value}`).digest('hex').slice(0, 32);
}

export function createSessionToken(session: Omit<Session, 'userId'>): string {
  const payload = JSON.stringify({ ...session, exp: Date.now() + SESSION_TTL_MS });
  const encoded = Buffer.from(payload).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function readSessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  if (sign(encoded) !== signature) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as Session & {
      exp: number;
    };
    if (parsed.exp < Date.now()) return null;
    const { exp: _exp, ...session } = parsed;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000
  };
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return readSessionToken(token);
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AuthError('Not authenticated', 401);
  return session;
}

/**
 * Capabilities are checked explicitly rather than by role ordering, so no role
 * can escalate into a capability it was not granted.
 */
const CAPABILITIES = {
  'agent:write': ['ADMIN', 'DEVELOPER'],
  'agent:delete': ['ADMIN'],
  'policy:write': ['ADMIN', 'DEVELOPER'],
  'policy:delete': ['ADMIN'],
  'audit:read': ['ADMIN', 'AUDITOR', 'DEVELOPER', 'VIEWER'],
  'audit:export': ['ADMIN', 'AUDITOR'],
  'cost:write': ['ADMIN', 'DEVELOPER'],
  'approval:decide': ['ADMIN', 'DEVELOPER', 'AUDITOR'],
  'org:admin': ['ADMIN']
} as const;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly string[]).includes(role);
}

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = 'Insufficient permissions') {
    super(message);
  }
}

export async function requireCapability(capability: Capability): Promise<Session> {
  const session = await requireSession();
  if (!can(session.role, capability)) {
    throw new ForbiddenError(`Role ${session.role} cannot ${capability}`);
  }
  return session;
}

export async function organizationExists(slug: string): Promise<boolean> {
  return (await prisma.organization.count({ where: { slug } })) > 0;
}
