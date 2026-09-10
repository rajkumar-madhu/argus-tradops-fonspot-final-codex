"""File analytics contract: isolated synthetic fixtures, no private source rows."""
import csv
import tempfile
import unittest
from pathlib import Path
from importlib.util import find_spec

class FileAnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(find_spec('app.file_analytics'), 'File analytics ingestion is missing')
        from app.file_analytics import FileAnalytics
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.store = FileAnalytics(self.root / 'cache.sqlite', self.root)

    def latency(self, rows, name='ORDERLATENCY_08-Sep-2026.csv'):
        with (self.root/name).open('w', newline='') as f:
            w=csv.writer(f); w.writerow(['NOREN_ORD_NUM','EXCH_SEG','OMS_LATENCY','OMS_EXCH_CONFIRMATION','OMSUPDATETIME','EXCHUPDATETIME']);w.writerows(rows)

    def test_zero_malformed_missing_and_reconciliation(self):
        self.latency([['A','NSE',0,0,1788839160,1788839160],['B','NSE','bad',5,1788839161,0],['C','NFO',10,'NaN',1788839162,0],['','NFO',2,3,1788839163,0]])
        self.store.ingest()
        data=self.store.latency()
        self.assertEqual(data['count'],3)
        self.assertEqual(data['summary']['oms']['samples'],2)
        self.assertEqual(data['summary']['oms']['p50'],0)
        self.assertEqual(data['summary']['confirmation']['samples'],2)
        self.assertEqual(data['unit'],'source units')
        self.assertTrue(all(r['oms_status'] is None for r in data['items']))
        file=self.store.sources()['items'][0]
        self.assertEqual(file['processed_rows'],4)
        self.assertEqual(file['accepted_rows']+file['rejected_rows']+file['duplicate_rows'],4)
        self.assertEqual(file['invalid_values'],2)

    def test_idempotence_preserves_lifecycle_events_and_replaces_changed_file(self):
        rows=[['A','NSE',i,i,1788839160+i,0] for i in range(10)]
        self.latency(rows+[rows[0]])
        self.store.ingest(); first=self.store.latency()
        self.store.ingest(); second=self.store.latency()
        self.assertEqual(first,second)
        self.assertEqual(first['count'],10)
        self.assertEqual(first['unique_orders'],1)
        self.assertEqual(first['summary']['oms']['p90'],8)
        self.assertEqual(first['summary']['oms']['p99'],9)
        self.latency(rows[:2]);self.store.ingest()
        self.assertEqual(self.store.latency()['count'],2)

    def test_filter_page_export_and_summary_have_same_scope(self):
        self.latency([['A','NSE',0,0,1788839160,0],['B','NFO',10,20,1788839161,0]])
        self.store.ingest()
        result=self.store.latency(segment='NFO',limit=1)
        self.assertEqual(result['count'],1)
        self.assertEqual(result['summary']['oms']['p50'],10)
        self.assertEqual(len(list(self.store.export_latency(segment='NFO'))),2)
        self.assertEqual(self.store.latency(q='not-present')['summary']['oms']['p50'],None)

    def test_export_preserves_selected_order_and_neutralizes_formulas(self):
        self.latency([['=A','NSE',0,0,1788839160,0],['B','NSE',10,20,1788839161,0]])
        report = self.store.ingest()
        self.assertEqual(report['files'][0]['accepted'], 2)
        rows = list(csv.DictReader(''.join(self.store.export_latency(sort='oms', direction='desc')).splitlines()))
        self.assertEqual([r['oms'] for r in rows], ['10.0', '0.0'])
        self.assertEqual(rows[1]['order_id'], "'=A")
        with self.assertRaises(ValueError):
            list(self.store.export_latency(sort='oms; DROP TABLE events'))

    def test_queue_empty_and_distinct_instances(self):
        for instance in ['NSE2','NSE-2729']:
            (self.root/f'QueSize_{instance}_08-Sep-2026.csv').write_text('Time,SeqNo,Erf,QSz\nTue Sep  8 09:15:01 AM IST 2026,1,A,0\nTue Sep  8 09:15:02 AM IST 2026,2,B,10\n')
        (self.root/'QueSize_BFO_08-Sep-2026.csv').touch()
        self.store.ingest()
        result=self.store.queues()
        self.assertEqual(len(result['items']),3)
        self.assertEqual({r['instance'] for r in result['items']},{'NSE2','NSE-2729','BFO'})
        empty=next(r for r in result['items'] if r['instance']=='BFO')
        self.assertEqual(empty['state'],'No data received')
        self.assertIsNone(empty['latest'])
        populated=next(r for r in result['items'] if r['instance']=='NSE2')
        self.assertEqual(populated['latest'],10)
        self.assertEqual(populated['peak'],10)
        self.assertEqual(populated['samples'],2)

    def test_rejects_external_symlink_and_oversized_file(self):
        with tempfile.TemporaryDirectory() as other:
            path=Path(other)/'secret.csv';path.write_text('private')
            (self.root/'ORDERLATENCY_escape.csv').symlink_to(path)
            self.store.ingest()
            self.assertEqual(self.store.sources()['items'][0]['state'],'Rejected path')
        self.latency([['A','NSE',1,1,1788839160,0]])
        self.store.max_bytes=10
        self.store.ingest()
        self.assertTrue(any(r['state']=='File too large' for r in self.store.sources()['items']))

    def test_missing_headers_and_invalid_time(self):
        (self.root/'QueSize_NSE_08-Sep-2026.csv').write_text('wrong\n1\n')
        self.latency([['A','NSE',1,1,'bad',0]])
        self.store.ingest()
        self.assertEqual(self.store.latency()['count'],0)
        self.assertTrue(any(r['state']=='Missing required fields' for r in self.store.sources()['items']))

if __name__=='__main__':unittest.main()

class ViewContractTests(FileAnalyticsTests):
    def test_view_contract_provenance_facets_and_time(self):
        self.latency([['A','NSE',0,0,1788839160,0],['B','NFO',5,6,1788839161,0]])
        self.store.ingest();data=self.store.latency()
        self.assertEqual(data.get('facets',{}).get('segments'),['NFO','NSE'])
        self.assertEqual({r.get('row_number') for r in data['items']},{2,3})
        self.assertTrue(all(r.get('source') and r.get('time') for r in data['items']))
        self.assertEqual(self.store.sources().get('count'),1)
