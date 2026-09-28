import { Badge } from '@/components/ui/badge';

const AGENT_STYLES: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'outline'> = {
  DRAFT: 'outline',
  STAGING: 'secondary',
  PRODUCTION: 'success',
  DEPRECATED: 'destructive'
};

const ACTION_STYLES: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'outline'> = {
  SUCCESS: 'success',
  FAILED: 'destructive',
  BLOCKED: 'destructive',
  PENDING_APPROVAL: 'secondary'
};

const APPROVAL_STYLES: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  APPROVED: 'success',
  REJECTED: 'destructive',
  EXPIRED: 'outline'
};

export function AgentStatusBadge({ status }: { status: string }) {
  return <Badge variant={AGENT_STYLES[status] ?? 'outline'}>{status.toLowerCase()}</Badge>;
}

export function ActionStatusBadge({ status }: { status: string }) {
  return <Badge variant={ACTION_STYLES[status] ?? 'outline'}>{status.replace('_', ' ').toLowerCase()}</Badge>;
}

export function ApprovalStatusBadge({ status }: { status: string }) {
  return <Badge variant={APPROVAL_STYLES[status] ?? 'outline'}>{status.toLowerCase()}</Badge>;
}

export function FrameworkBadge({ framework }: { framework: string }) {
  return <Badge variant="secondary">{framework.replace('_', '-')}</Badge>;
}

