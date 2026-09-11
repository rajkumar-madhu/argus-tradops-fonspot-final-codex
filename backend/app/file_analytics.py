"""UI/API facade over the shared CSV store; one normalized ingestion pipeline."""
import csv
import io
from functools import lru_cache
from app.csv_store import CsvStore, safe_csv_cell, iso

class FileAnalytics(CsvStore):
    def __init__(self,database,root,**kwargs): super().__init__(root,database,**kwargs)

    def ingest(self):
        data=super().ingest()
        self._cached_latency.cache_clear()
        self._cached_hops.cache_clear()
        return data

    def hops_summary(self,**filters):
        return self._cached_hops(tuple(sorted(filters.items())))

    @lru_cache(maxsize=32)
    def _cached_hops(self,filters):
        return super().hops_summary(**dict(filters))

    def sources(self):
        data=self.catalog()
        return {**data,'count':len(data['files']),'latency_unit':self.unit,
                'refresh_policy':'Startup snapshot. Restart the API after replacing source files. Standalone ingestion validates a separate cache.',
                'items':[{**f,'imported_at':iso(f['generation']/1e9),'processed_rows':f['rows'],'accepted_rows':f['accepted'],'rejected_rows':f['rejected'],'duplicate_rows':f['duplicates']} for f in data['files']]}

    def latency(self,**filters):
        return self._cached_latency(tuple(sorted(filters.items())))

    @lru_cache(maxsize=32)
    def _cached_latency(self,filters):
        data=super().latency(**dict(filters))
        return {**data,
                'items':[{**r,'source':r['file'],'time':r['event_time'],'exchange_time':iso(r['exchange_time'])} for r in data['items']],
                'facets':{'segments':data['choices']['segment'],'statuses':[s for s in data['choices']['status'] if s!='Unavailable']},
                'by_segment':[{**r,'events':r['count'],**r['oms']} for r in data['by_segment']],
                'notes':['Rows are observations, not necessarily unique orders. Exact duplicate rows within each source are excluded.',
                         'Reported confirmation timings include valid zero values; missing status columns cannot establish confirmed order counts.',
                         'Source timestamps normalize to UTC; textual IST timestamps use Asia/Kolkata. Queue and journal coverage may have different dates.',
                         'Units require a producer contract. Source units are retained unless an operator explicitly configures us, ms or s.',
                         'All summary, trend, segment and export values use the same server filters. Trend displays the mean per observed time bucket.']}

    def queues(self,**filters):
        data=super().queues(**filters)
        items=[{**r,'last_event':r['last_observed'],'state':r['freshness'] if r['samples'] and r['freshness']=='Stale snapshot' else r['state']} for r in data['sources']]
        return {**data,'items':items,'trend':[{'instance':r['instance'],'file':r['file'],**p} for r in data['sources'] for p in r['trend']]}

    def export_latency(self,**filters):
        return self._export_csv('latency', ['file','row_number','order_id','segment','event_time','status','oms','confirmation','exch_status'], **filters)

    def export_queues(self,**filters):
        return self._export_csv('queue', ['file','row_number','instance','event_time','queue'], **filters)

    def _export_csv(self,kind,fields,**filters):
        buffer=io.StringIO();writer=csv.writer(buffer)
        writer.writerow(fields+['measurement_unit'])
        yield buffer.getvalue();buffer.seek(0);buffer.truncate(0)
        count=0
        for row in self.export_rows(kind,**filters):
            writer.writerow([safe_csv_cell(row[f]) for f in fields]+[self.unit if kind=='latency' else 'queue entries']);count+=1
            if count % 1000 == 0:
                yield buffer.getvalue();buffer.seek(0);buffer.truncate(0)
        if buffer.tell():yield buffer.getvalue()
