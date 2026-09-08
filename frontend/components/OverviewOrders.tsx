"use client";
import { DataTable } from '@/components/UI';
/** Server-loaded snapshot. Filtering does not add Elasticsearch polling. */
export default function OverviewOrders({ rows }: { rows:any[]; today:string }) {
 return <section className="panel overview-orders">
  <div className="panel-head">
   <div>
    <b>Recent orders</b>
    <p className="sub">Latest rows from the loaded snapshot — streaming view on Orders</p>
   </div>
   <a href="/orders">Open orders ›</a>
  </div>
  <DataTable rows={rows} rowKey={r=>r.order_id} columns={[
   {key:'time',label:'Time',render:r=>r.time_label}, {key:'order_id',label:'Order'},
   {key:'user',label:'User'}, {key:'account',label:'Account'}, {key:'exchange',label:'Exchange'},
   {key:'symbol',label:'Symbol'}, {key:'product',label:'Product'}, {key:'type',label:'Type'},
   {key:'side',label:'Side'}, {key:'qty',label:'Qty'}, {key:'price',label:'Price'},
   {key:'trigger_price',label:'Trigger'}, {key:'filled_qty',label:'Filled'},
   {key:'status',label:'Status',render:r=><span className={`order-status ${String(r.status).toLowerCase()}`}>{r.status}</span>},
   {key:'latency_ms',label:'Latency (ms)'},
   {key:'details',label:'Details',render:r=><a href={`/orders?order=${encodeURIComponent(r.order_id)}`}>View</a>},
  ]}/>
 </section>;
}
