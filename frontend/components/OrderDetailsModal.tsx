'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export default function OrderDetailsModal({ open, orderId, onClose, children }: { open: boolean; orderId: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, summary, [tabindex="0"]') || []);
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const items = controls(), first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="order-details-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={dialog} className="order-details-modal" role="dialog" aria-modal="true" aria-labelledby="order-details-title">
      <header><div><span>Read-only order evidence</span><h2 id="order-details-title">Order Details{orderId ? ` · ${orderId}` : ''}</h2></div><button className="secondary-btn" aria-label="Close order details" onClick={onClose}><X size={18}/></button></header>
      <div className="order-details-body">{children}</div>
    </section>
  </div>;
}
