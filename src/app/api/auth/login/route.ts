import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifyPassword
} from '@/lib/auth';
import { LoginSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = LoginSchema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { organization: true }
    });

    // Same message for unknown user and wrong password: no account enumeration.
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return fail('Invalid email or password', 401);
    }

    const session = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'ADMIN' | 'AUDITOR' | 'DEVELOPER' | 'VIEWER',
      organizationId: user.organizationId
    };
    cookies().set(SESSION_COOKIE, createSessionToken(session), sessionCookieOptions());

    return ok({ user: session, organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug, plan: user.organization.plan } });
  } catch (error) {
    return handleRouteError(error);
  }
}

