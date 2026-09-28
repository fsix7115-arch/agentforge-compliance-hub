import { handleRouteError, ok } from '@/lib/api-response';
import { requireSession } from '@/lib/auth';
import { costDashboard } from '@/lib/services/costs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireSession();
    return ok(await costDashboard(session.organizationId));
  } catch (error) {
    return handleRouteError(error);
  }
}

