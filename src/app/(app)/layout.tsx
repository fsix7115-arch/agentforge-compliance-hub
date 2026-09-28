import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { name: true }
  });

  return (
    <AppShell orgName={org?.name ?? 'Organization'} role={session.role}>
      {children}
    </AppShell>
  );
}
