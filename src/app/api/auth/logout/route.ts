import { cookies } from 'next/headers';
import { ok } from '@/lib/api-response';
import { SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  cookies().delete(SESSION_COOKIE);
  return ok({ signedOut: true });
}

