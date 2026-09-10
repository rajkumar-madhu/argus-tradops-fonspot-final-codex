import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path


class CsvStoreTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('app.csv_store'), 'A bounded CSV ingestion store is required')
        from app.csv_store import CsvStore
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.store = CsvStore(self.root, self.root / 'cache.sqlite', unit='unverified')

    def write(self, name, rows, header=None):
        path = self.root / name
        with path.open('w', newline='') as f:
            w = csv.writer(f)
            w.writerow(header or ['NOREN_ORD_NUM','EXCH_SEG','OMS_LATENCY','OMS_EXCH_CONFIRMATION','OMSUPDATETIME','EXCHUPDATETIME'])
            w.writerows(rows)
        return path

    def test_valid_zero_malformed_duplicates_and_repeated_orders(self):
        self.write('ORDERLATENCY_day.csv', [
            ['A','NSE',0,0,1788839160,1788839160],
            ['A','NSE',0,0,1788839160,1788839160],
            ['A','NSE',10,20,1788839161,1788839161],
            ['B','NFO','NaN','',1788839162,0],
            ['', 'NFO',2,3,1788839163,0],
        ])
        self.store.ingest()
        d = self.store.latency()
        self.assertEqual(d['count'],3)
        self.assertEqual(d['unique_orders'],2)
        self.assertEqual(d['summary']['oms']['samples'],2)
        self.assertEqual(d['summary']['oms']['p50'],0)
        self.assertEqual(d['summary']['confirmation']['samples'],2)
        self.assertEqual(d['unit'],'source units')
        self.assertTrue(all(r['status']=='Unavailable' for r in d['items']))
        f=self.store.catalog()['files'][0]
        self.assertEqual((f['rows'], f['accepted'], f['duplicates'], f['rejected']), (5,3,1,1))
        self.store.ingest()
        self.assertEqual(self.store.latency()['count'],3)
        self.assertEqual(self.store.catalog()['files'][0]['generation'],f['generation'])

    def test_percentiles_and_filters_export_reconcile(self):
        self.write('ORDERLATENCY_day.csv', [[str(i),'NSE' if i<5 else 'NFO',i,i*10,1788839160+i,1788839160+i] for i in range(10)])
        self.store.ingest()
        d=self.store.latency(segment='NSE')
        self.assertEqual(d['count'],5)
        self.assertEqual([d['summary']['oms'][k] for k in ('p50','p90','p95','p99','max')],[2,4,4,4,4])
        self.assertEqual(len(list(self.store.export_rows('latency',segment='NSE'))),5)
        self.assertEqual(self.store.latency(q='unmatched')['count'],0)
        self.assertIsNone(self.store.latency(q='unmatched')['summary']['oms']['p50'])

    def test_queue_empty_instances_zero_and_peaks(self):
        (self.root/'QueSize_NFO_day.csv').touch()
        for source in ('NSE2','NSE-2729'):
            self.write(f'QueSize_{source}_day.csv',[
                ['Tue Sep  8 09:00:01 AM IST 2026',1,'a',0],
                ['Tue Sep  8 09:01:01 AM IST 2026',2,'b',12],
                ['bad',3,'c',3],
            ],['Time','SeqNo','Erf','QSz'])
        self.store.ingest()
        d=self.store.queues()
        self.assertEqual({s['instance'] for s in d['sources']},{'NSE2','NSE-2729','NFO'})
        self.assertEqual(next(s for s in d['sources'] if s['instance']=='NFO')['state'],'No data received')
        self.assertEqual(d['count'],4)
        self.assertEqual(self.store.queues(instance='NSE2')['sources'][0]['peak'],12)

    def test_missing_headers_oversized_symlink_and_replacement(self):
        self.write('ORDERLATENCY_bad.csv', [['A']], ['wrong'])
        self.store.ingest()
        self.assertEqual(self.store.catalog()['files'][0]['state'],'Missing required fields')
        p=self.write('ORDERLATENCY_good.csv',[['A','NSE',1,2,1788839160,1788839160]])
        self.store.ingest(); self.assertEqual(self.store.latency()['count'],1)
        self.write(p.name,[['B','NSE',3,4,1788839161,1788839161]])
        self.store.ingest(); self.assertEqual(self.store.latency()['count'],1)
        self.assertEqual(self.store.latency()['items'][0]['order_id'],'B')
        self.store.max_bytes=1; self.store.ingest()
        self.assertEqual(self.store.latency()['count'],0)

    def test_path_traversal_and_timestamps(self):
        from app.csv_store import parse_time, safe_csv_cell
        self.assertEqual(parse_time('1788839160000'),parse_time('1788839160'))
        self.assertEqual(parse_time('Tue Sep  8 09:16:00 AM IST 2026'),parse_time('1788839160'))
        self.assertIsNone(parse_time('2026-09-08T09:16:00'))
        self.assertEqual(safe_csv_cell('=1+1'),"'=1+1")
        with self.assertRaises(ValueError): self.store.latency(sort='order_id; DROP TABLE events')

    def test_export_order_matches_page_and_source_count(self):
        self.write('ORDERLATENCY_day.csv', [['A','NSE',9,2,1788839160,0],['B','NSE',1,3,1788839161,0]])
        self.store.ingest()
        page=self.store.latency(sort='oms',direction='desc')
        export=list(self.store.export_rows('latency',sort='oms',direction='desc'))
        self.assertEqual([r['order_id'] for r in page['items']],[r['order_id'] for r in export])
        self.assertEqual(self.store.catalog()['count'],1)

    def test_blank_segment_is_rejected_and_nonzero_fields_are_not_truncated(self):
        self.write('ORDERLATENCY_day.csv',[['A','',0,0,1788839160,0],['x'*129,'NSE',1,2,1788839160,0]])
        self.store.ingest()
        self.assertEqual(self.store.latency()['count'],0)
