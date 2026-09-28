import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { NewAgentWizard } from './new-agent-wizard';

export const dynamic = 'force-dynamic';

export default async function NewAgentPage() {
  const session = await requireSession();

  const policies = await prisma.policy.findMany({
    where: { organizationId: session.organizationId, enabled: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, framework: true }
  });

  return <NewAgentWizard policies={policies} />;
}
