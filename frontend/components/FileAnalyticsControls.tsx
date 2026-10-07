'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SESSION_WINDOWS, activeSession, fileQuery, istDate, sessionRange, utcDateTimeLocal, type FileQuery } from '@/lib/file-analytics';

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

export default function FileAnalyticsControls({
  query,
  facets,
  mode = 'latency',
  suggestedDate = '',
}: {
  query: FileQuery;
  facets?: { segments: string[]; statuses: string[] };
  mode?: 'latency' | 'queue';
  suggestedDate?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const base = mode === 'latency' ? '/order-latency' : '/queue-monitor';
  const start = one(query.start);
  const end = one(query.end);
  const sessionDate = istDate(start) || suggestedDate;
  const [pickedDate, setPickedDate] = useState(sessionDate);
  const currentSession = activeSession(start, end, pickedDate || sessionDate);
  const shared = fileQuery({ start, end });
  const latencyHref = shared ? `/order-latency?${shared}` : '/order-latency';
  const queueHref = shared ? `/queue-monitor?${shared}` : '/queue-monitor';

  function readForm(form: HTMLFormElement, range: { start: string; end: string } | null) {
    const data = new FormData(form);
    const next: Record<string, string> = {};
    for (const [key, value] of data.entries()) if (value && key !== 'session_date') next[key] = String(value);
    if (range) {
      next.start = range.start;
      next.end = range.end;
    } else {
      delete next.start;
      delete next.end;
    }
    for (const key of ['start', 'end']) {
      if (next[key] && !/[zZ]|[+-]\d{2}:\d{2}$/.test(next[key])) next[key] += 'Z';
    }
    return next;
  }

  return (
    <form
      className="grid-filters file-filters"
      onChange={(event) => {
        const endInput = event.currentTarget.elements.namedItem('end') as HTMLInputElement;
        endInput?.setCustomValidity('');
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const next = readForm(form, null);
        const keptStart = (form.elements.namedItem('start') as HTMLInputElement).value;
        const keptEnd = (form.elements.namedItem('end') as HTMLInputElement).value;
        if (keptStart) next.start = `${keptStart}Z`;
        if (keptEnd) next.end = `${keptEnd}Z`;
        const endInput = form.elements.namedItem('end') as HTMLInputElement;
        endInput.setCustomValidity(next.start && next.end && next.start > next.end ? 'To must be after From.' : '');
        if (!form.reportValidity()) return;
        startTransition(() => router.push(`${base}?${fileQuery(next)}`));
      }}
    >
      <nav className="analytics-switch" aria-label="File analytics">
        <Link href={latencyHref} aria-current={mode === 'latency' ? 'page' : undefined}>OMS latency</Link>
        <Link href={queueHref} aria-current={mode === 'queue' ? 'page' : undefined}>Queue monitor</Link>
      </nav>
      <div className="session-presets">
        <label className="session-date">
          Session date (IST)
          <input
            type="date"
            name="session_date"
            value={pickedDate}
            onChange={(event) => setPickedDate(event.currentTarget.value)}
            onFocus={(event) => {
              const input = event.currentTarget;
              try { input.showPicker?.(); } catch { /* picker needs a trusted gesture; click still opens it */ }
            }}
            aria-label="Session date in IST"
          />
        </label>
        <div className="preset-row" role="group" aria-label="IST session windows">
          {SESSION_WINDOWS.map((window) => (
            <button
              key={window.id}
              type="button"
              className={currentSession === window.id ? 'active' : undefined}
              aria-pressed={currentSession === window.id}
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (!form) return;
                const dateInput = form.elements.namedItem('session_date') as HTMLInputElement;
                const range = sessionRange(dateInput.value || pickedDate, window.id);
                dateInput.setCustomValidity(range ? '' : 'Choose a session date.');
                if (!range || !form.reportValidity()) return;
                const next = readForm(form, range);
                startTransition(() => router.push(`${base}?${fileQuery(next)}`));
              }}
            >
              {window.label}
              <small>{window.start}–{window.end} IST</small>
            </button>
          ))}
          <button
            type="button"
            onClick={(event) => {
              const form = event.currentTarget.form;
              if (!form) return;
              const next = readForm(form, null);
              startTransition(() => router.push(fileQuery(next) ? `${base}?${fileQuery(next)}` : base));
            }}
          >
            All observations
          </button>
        </div>
      </div>
      {mode === 'latency' ? (
        <>
          <label>Order ID contains<input name="q" type="search" defaultValue={one(query.q)} maxLength={128} placeholder="Search source order ID" /></label>
          <label>Segment<select name="segment" defaultValue={one(query.segment)}><option value="">All segments</option>{facets?.segments.map((segment) => <option key={segment}>{segment}</option>)}</select></label>
          <label>OMS status<select name="status" defaultValue={one(query.status)} disabled={!facets?.statuses.length}><option value="">{facets?.statuses.length ? 'All statuses' : 'Not supplied by this feed'}</option>{facets?.statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        </>
      ) : (
        <label>Source instance<input name="instance" defaultValue={one(query.instance)} placeholder="e.g. NSE-2729" maxLength={128} /></label>
      )}
      {one(query.prefix) && <input type="hidden" name="prefix" defaultValue={one(query.prefix)} />}
      <label>From (UTC)<input type="datetime-local" name="start" defaultValue={utcDateTimeLocal(start)} /></label>
      <label>To (UTC)<input type="datetime-local" name="end" onChange={(event) => event.currentTarget.setCustomValidity('')} defaultValue={utcDateTimeLocal(end)} /></label>
      {mode === 'latency' && (
        <>
          <label>Sort<select name="sort" defaultValue={one(query.sort) || 'time'}><option value="time">Event time</option><option value="oms">OMS latency</option><option value="confirmation">Confirmation timing</option><option value="order_id">Order ID</option></select></label>
          <label>Direction<select name="direction" defaultValue={one(query.direction) || 'desc'}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
          <label>Rows<select name="limit" defaultValue={one(query.limit) || '50'}>{[25, 50, 100, 250].map((count) => <option key={count}>{count}</option>)}</select></label>
        </>
      )}
      <button type="submit" className="primary-btn" disabled={pending}>{pending ? 'Loading…' : 'Apply filters'}</button>
      <Link className="btn" href={base}>Reset filters</Link>
    </form>
  );
}
