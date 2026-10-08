import Shell from '@/components/Shell';
import CalendarDashboard from '@/components/CalendarDashboard';
import { EmptyState, PageHead } from '@/components/UI';
import { getJSON } from '@/lib/api';
import { calendarData, type CalendarQuery, type CalendarSource } from '@/lib/calendar';
import Link from 'next/link';
import './calendar.css';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({ searchParams }: { searchParams: Promise<CalendarQuery> }) {
  const query = await searchParams;
  const [orders, incidents] = await Promise.all([
    getJSON<CalendarSource>('/api/orders?size=10000&evidence=false&lookback=30d'),
    getJSON<CalendarSource>('/api/incidents?limit=500'),
  ]);
  let data;
  try { data = calendarData(orders, incidents, query); }
  catch {
    return <Shell><PageHead title="Operational Calendar" subtitle="Order observations and recorded incidents by day" /><EmptyState title="Invalid date range" body="Choose up to 31 days ending today or earlier." /><Link className="btn" href="/calendar">Reset calendar</Link></Shell>;
  }
  return <Shell><CalendarDashboard key={`${data.start}:${data.end}:${data.exchange}`} data={data} /></Shell>;
}
