import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError, ForbiddenError } from '@/lib/auth';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return fail('Validation failed', 422, {
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    });
  }
  if (error instanceof AuthError) return fail(error.message, error.status);
  if (error instanceof ForbiddenError) return fail(error.message, 403);

  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error('[api]', error);
  return fail(message, 500);
}

