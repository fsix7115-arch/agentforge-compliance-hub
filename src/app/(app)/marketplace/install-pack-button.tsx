'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function InstallPackButton({ packId, installed }: { packId: string; installed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (installed) {
    return (
      <Button size="sm" variant="outline" disabled>
        Installed
      </Button>
    );
  }

  async function install() {
    setBusy(true);
    try {
      const response = await fetch('/api/marketplace/packs/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId })
      });
      const payload = await response.json();
      if (!response.ok) {
        toast.error(payload.error ?? 'Install failed');
        return;
      }
      toast.success(`Installed ${payload.data.pack.name}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" onClick={install} disabled={busy}>
      {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}
      Install
    </Button>
  );
}
