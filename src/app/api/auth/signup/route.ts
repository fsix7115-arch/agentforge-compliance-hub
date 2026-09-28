import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { fail, handleRouteError, ok } from '@/lib/api-response';
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
  sessionCookieOptions
} from '@/lib/auth';
import { SignupSchema } from '@/lib/schemas';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = SignupSchema.parse(await request.json());

    const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
    if (existingUser) return fail('That email is already registered', 409);

    const slug = slugify(body.organizationSlug || body.organizationName);
    const orgExists = await prisma.organization.findUnique({ where: { slug } });
    if (orgExists) return fail('That organization slug is taken', 409);

    const org = await prisma.organization.create({
      data: { name: body.organizationName, slug }
    });

    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash: hashPassword(body.password),
        role: 'ADMIN',
        organizationId: org.id
      }
    });

    // New orgs start with the built-in compliance policies installed.
    const { POLICY_TEMPLATES } = await import('@/lib/policy/templates');
    await prisma.policy.createMany({
      data: POLICY_TEMPLATES.map((t) => ({
        name: t.name,
        description: t.description,
        framework: t.framework,
        rulesYaml: t.yaml,
        enabled: true,
        organizationId: org.id
      }))
    });

    const session = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: 'ADMIN' as const,
      organizationId: org.id
    };
    cookies().set(SESSION_COOKIE, createSessionToken(session), sessionCookieOptions());

    return ok({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, organization: org }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

