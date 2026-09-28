'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

interface Approval {
  id: string;
  reason: string;
  riskScore: number;
  ageHours: number;
  slaBreached: boolean;
  action: { id: string; actionType: string; tokenCost: number; input: string; output: string };
  agent: { id: string; name: string };
  requester: { name: string; email: string };
}

export function ApprovalActions({ approval }: { approval: Approval }) {
  const router = useRouter();
  const [open, setOpen] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function decide(decision: 'approve' | 'reject') {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/approvals/${approval.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason })
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? 'Decision failed');
        return;
      }
      toast.success(decision === 'approve' ? 'Approved' : 'Rejected');
      setOpen(null);
      setReason('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen('reject')}>
          <X className="mr-1 h-3.5 w-3.5" />
          Reject
        </Button>
        <Button size="sm" onClick={() => setOpen('approve')}>
          <Check className="mr-1 h-3.5 w-3.5" />
          Approve
        </Button>
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open === 'approve' ? 'Approve this action?' : 'Reject this action?'}</DialogTitle>
            <DialogDescription>
              {open === 'approve'
                ? 'The action will be marked successful. Your name and reason are recorded in the approval trail.'
                : 'The action will be marked blocked. Your name and reason are recorded in the approval trail.'}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <p className="font-medium">{approval.action.actionType}</p>
            <p className="text-xs text-muted-foreground">
              {approval.agent.name} · requested by {approval.requester.name} · {approval.ageHours}h old
            </p>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
              {approval.reason}
            </p>
          </div>

          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you making this decision? (recorded in the audit trail)"
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              variant={open === 'approve' ? 'default' : 'destructive'}
              onClick={() => decide(open!)}
              disabled={submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm {open === 'approve' ? 'approval' : 'rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
