"use client";
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
export default function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} aria-label="Refresh snapshot"><RefreshCw size={14}/>{pending ? 'Refreshing…' : 'Refresh snapshot'}</button>;
}
