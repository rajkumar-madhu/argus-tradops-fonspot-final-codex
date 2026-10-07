import Shell from '@/components/Shell';
import CalendarDashboard from '@/components/CalendarDashboard';
import { ApiErrorState } from '@/components/UI';
import { getJSON, apiError } from '@/lib/api';
import type { CalendarPayload } from '@/lib/calendar';
export const dynamic = 'force-dynamic';
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['start', 'end', 'date', 'account', 'exchange', 'service']) if (params[key]) query.set(key, params[key]!);
  const initial = await getJSON<CalendarPayload>(`/api/calendar?${query}`);
  return <Shell>{apiError(initial) ? <ApiErrorState title="Calendar unavailable" data={initial} /> : <CalendarDashboard initial={initial} initialDetailOpen={Boolean(params.date)} initialFilters={params} />}</Shell>;
}
