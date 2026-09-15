import QueryWindow, { apiWindowQuery, queryDay, windowSelectValue } from '@/components/QueryWindow';
import { ArrowDownRight, ArrowUpRight, Boxes, Wallet } from 'lucide-react';
import Shell from '@/components/Shell';
import { AreaChart } from '@/components/Charts';
import { DataTable, EmptyState, KpiCard } from '@/components/UI';
import { tradeVolumeTrend } from '@/lib/chart-data';
import { apiError, getJSON } from '@/lib/api';
import { dateShort, fmt, orderPriceText, timeShort } from '@/lib/format';
import { sourceDisplayName } from '@/lib/data-source';

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ lookback?: string; day?: string; exchange?: string }>;
}) {
  const params = await searchParams;
  const qs = apiWindowQuery(params.lookback, params.day);
  const selectValue = windowSelectValue(params.lookback, params.day);
  const day = queryDay(params.day);
  const exchange = ['NSE', 'BSE'].includes(String(params.exchange || '').toUpperCase())
    ? String(params.exchange).toUpperCase()
    : '';
  const d: any = await getJSON(`/api/trades?size=200&${qs}`);
  const err = apiError(d);
  const allRows = d.items || [];
  const rows = exchange
    ? allRows.filter((r: any) => String(r.exchange || '').toUpperCase() === exchange)
    : allRows;
  const buyCount = rows.filter((r: any) => r.side === 'BUY').length;
  const symbols = new Set(rows.map((r: any) => `${r.exchange}:${r.symbol}`)).size;
  const fillTrend = tradeVolumeTrend(rows.map((r: any) => ({ time: r.time, value: 1 })));

  return (
    <Shell>
      <section className="dashboard-head overview-head">
        <div>
          <h1>Trades</h1>
          <p>Executed fills from Noren order updates</p>
        </div>
        <div className="time-controls">
          <QueryWindow value={selectValue} day={day} source={d.source} />
          <span className="source-tag">
            {rows.length} of {d.count || allRows.length} trades · {sourceDisplayName(d.source)}
          </span>
        </div>
      </section>

      {err ? (
        <EmptyState title="Unable to load trades" body={err} />
      ) : (
        <>
          <section className="kpi-grid four">
            <KpiCard
              label="Total Trades"
              value={fmt(rows.length)}
              delta="Completed fills"
              tone="blue"
              icon={<Wallet size={18} />}
            />
            <KpiCard
              label="Buy Trades"
              value={fmt(buyCount)}
              delta="Aggressive buys"
              deltaTone="up"
              tone="green"
              icon={<ArrowUpRight size={18} />}
            />
            <KpiCard
              label="Sell Trades"
              value={fmt(rows.length - buyCount)}
              delta="Aggressive sells"
              deltaTone="down"
              tone="red"
              icon={<ArrowDownRight size={18} />}
            />
            <KpiCard
              label="Instruments"
              value={fmt(symbols)}
              delta="Symbols with fills"
              tone="purple"
              icon={<Boxes size={18} />}
            />
          </section>

          <nav className="journal-tabs" aria-label="Exchange journal filter">
            {['', 'NSE', 'BSE'].map((value) => (
              <a
                key={value || 'all'}
                className={exchange === value ? 'active' : ''}
                href={`/trades?${qs}${value ? `&exchange=${value}` : ''}`}
              >
                {value || 'All exchanges'}
              </a>
            ))}
          </nav>

          <section className="panel">
            <div className="panel-head">
              <b>Fills per 15 Minutes</b>
              <span className="legend">
                <i className="lg s-executed" /> Completed fills
              </span>
            </div>
            <AreaChart series={fillTrend.series} labels={fillTrend.labels} height={150} />
          </section>

          <section className="panel">
            <div className="panel-head">
              <b>Trade Blotter</b>
              <span>{rows.length} rows</span>
            </div>
            <DataTable
              className="compact"
              rows={rows}
              rowKey={(r) => r.trade_id}
              columns={[
                {
                  key: 'date',
                  label: 'Trade date',
                  render: (r) => dateShort(r.date || r.trade_date || r.time),
                },
                { key: 'time', label: 'Time', render: (r) => timeShort(r.time) },
                { key: 'trade_id', label: 'Trade ID', render: (r) => <b>{r.trade_id}</b> },
                {
                  key: 'order_id',
                  label: 'Order',
                  render: (r) => <span className="text-blue">{r.order_id}</span>,
                },
                { key: 'exchange', label: 'Exch' },
                { key: 'symbol', label: 'Symbol' },
                {
                  key: 'side',
                  label: 'Side',
                  render: (r) => (
                    <span className={r.side === 'BUY' ? 'text-green' : 'text-red'}>{r.side}</span>
                  ),
                },
                { key: 'qty', label: 'Qty' },
                { key: 'price', label: 'Price', render: (r) => orderPriceText(r) },
                { key: 'broker', label: 'Broker' },
              ]}
            />
          </section>
        </>
      )}
    </Shell>
  );
}
