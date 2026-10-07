import csv
import io
import unittest
import zipfile
from datetime import date
from unittest.mock import patch
from xml.etree import ElementTree
from fastapi import HTTPException
from app import calendar_routes as c

class CalendarTests(unittest.TestCase):
    def raw(self, rows, count=None):
        return {'items':rows,'count':len(rows) if count is None else count,'source':'journal snapshot','window':(date(2026,8,23),date(2026,8,24),date(2026,10,7))}

    def test_ist_bounds_and_range_validation(self):
        a,b=c.bounds(date(2026,8,24),date(2026,8,24))
        self.assertEqual(a,'2026-08-23T18:30:00+00:00')
        self.assertEqual(b,'2026-08-24T18:29:59.999999+00:00')
        for start,end in [('2026-08-25','2026-08-24'),('2026-07-24','2026-08-24'),('bad','2026-08-24')]:
            with self.assertRaises(HTTPException):c.date_range(start,end)

    def test_dashboard_permission_does_not_reveal_order_data(self):
        with patch.object(c,'order_source') as source:
            result=c.calendar_payload({'permissions':['dashboard:read']},'2026-08-24','2026-08-24')
        source.assert_not_called()
        self.assertFalse(result['days'][0]['orders_available'])
        self.assertEqual(result['detail']['orders'],[])
        self.assertEqual(result['filters']['accounts'],[])
        exported=list(csv.DictReader(io.StringIO(c.export_calendar(result,'csv').body.decode())))
        self.assertEqual(exported[0]['orders'],'')

    def test_filtered_ist_day_and_allowlisted_evidence(self):
        rows=[{'time':'2026-08-23T18:30:00Z','order_id':'A','status':'REJECTED','account':'***12','exchange':'NSE','reason':'Circuit price restriction','PanNum':'PRIVATE'}, {'time':'2026-08-23T18:29:59Z','order_id':'B','status':'OPEN','account':'***12','exchange':'NFO'}]
        with patch.object(c,'order_source',return_value=self.raw(rows)):
            result=c.calendar_payload({'permissions':['orders:read']},selected='2026-08-24',exchange='NSE')
        self.assertEqual([d['orders'] for d in result['days']],[0,1])
        self.assertEqual(result['days'][1]['rejected'],1)
        self.assertEqual(result['detail']['orders'][0]['order_id'],'A')
        self.assertNotIn('PanNum',result['detail']['orders'][0])
        self.assertFalse(result['days'][1]['alerts_available'])
        xlsx=c.export_calendar(result,'xlsx')
        with zipfile.ZipFile(io.BytesIO(xlsx.body)) as archive:
            for name in archive.namelist():ElementTree.fromstring(archive.read(name))
            self.assertNotIn(b'PRIVATE',archive.read('xl/worksheets/sheet1.xml'))

    def test_partial_live_range_queries_selected_day_independently(self):
        raw=self.raw([],count=8000);raw['source']='elasticsearch'
        day={'time':'2026-08-23T04:00:00Z','order_id':'earlier','status':'OPEN'}
        with patch.object(c,'order_source',return_value=raw),patch.object(c,'live_rows',return_value={'items':[day],'count':9000}) as query:
            result=c.calendar_payload({'permissions':['orders:read']},selected='2026-08-23')
        query.assert_called_once_with(date(2026,8,23),date(2026,8,23))
        self.assertFalse(result['complete']);self.assertTrue(result['detail_truncated'])
        self.assertEqual(result['detail']['orders'][0]['order_id'],'earlier')

    def test_other_tenant_never_reads_global_incidents(self):
        with patch.object(c.tenancy,'current_id',return_value='other'),patch('app.repository.list_incidents') as incidents,patch.object(c,'order_source',return_value=self.raw([])):
            result=c.calendar_payload({'permissions':['orders:read','incidents:read']})
        incidents.assert_not_called()
        self.assertFalse(result['days'][0]['alerts_available'])

    def test_unconfigured_tenant_cannot_receive_default_sample_source(self):
        from app import main
        with patch.object(c.tenancy,'current_id',return_value='other'),patch.object(c,'get_es',return_value=None),patch.object(main,'DEMO_MODE',True),patch.object(main,'_use_journal_data',return_value=False),patch.object(main,'_journal_path',return_value=None):
            with self.assertRaises(HTTPException) as error:c.order_source('2026-08-24','2026-08-24')
        self.assertEqual(error.exception.status_code,503)
