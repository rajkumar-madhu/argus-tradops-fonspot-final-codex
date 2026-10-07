import csv
import io
import unittest
from datetime import date, datetime
from fastapi import HTTPException
from app.analytics_database import AnalyticsDatabase, select_statement

class Cursor:
    def __init__(self, owner): self.owner=owner;self.rows=[]
    def execute(self, sql, args=()):
        self.owner.statements.append((sql,args))
        assert sql.startswith('SELECT ')
        table=next(t for t in self.owner.data if f'FROM {t}' in sql)
        if 'DISTINCT file_date' in sql:self.rows=[{'file_date':date(2026,8,24)}] if self.owner.data[table] else []
        else:self.rows=list(self.owner.data[table])
    def fetchall(self): result=self.rows;self.rows=[];return result
    def fetchmany(self, size): result=self.rows[:size];self.rows=self.rows[size:];return result
    def close(self): pass

class Connection:
    def __init__(self, data):self.data=data;self.statements=[];self.readonly=False;self.closed=False
    def start_transaction(self, **kwargs):self.readonly=kwargs['readonly']
    def cursor(self, **kwargs):return Cursor(self)
    def rollback(self):pass
    def close(self):self.closed=True

class AnalyticsDatabaseTests(unittest.TestCase):
    def data(self):
        return {'order_latency':[{'file_date':date(2026,8,24),'noren_ord_num':123,'exch_seg':'NSE','oms_latency':50,'oms_exch_confirmation':0,'oms_update_time':1787543100,'exch_update_time':0}], 'queue_line1':[{'file_date':date(2026,8,24),'segment':'NSE','time':datetime(2026,8,24,9,15),'seq_no':1,'erf':1,'queue_size':5}], 'queue_line2':[]}

    def test_readonly_database_to_api_and_export_contract(self):
        conn=Connection(self.data()); reader=AnalyticsDatabase(lambda:conn,unit='us')
        result=reader.latency()
        self.assertTrue(conn.readonly);self.assertTrue(conn.closed)
        self.assertEqual(result['source'],'analytics database')
        self.assertEqual(result['count'],1);self.assertEqual(result['summary']['oms']['p50'],50)
        self.assertEqual(result['summary']['confirmation']['p50'],0)
        self.assertEqual(result['trade_dates'],['2026-08-24'])
        self.assertTrue(all('token' not in sql.lower() for sql,_ in conn.statements))
        exported=list(csv.DictReader(io.StringIO(''.join(reader.export_latency()))))
        self.assertEqual(exported[0]['order_id'],'123')

    def test_queue_wall_clock_is_ist_and_lines_remain_separate(self):
        conn=Connection(self.data());reader=AnalyticsDatabase(lambda:conn)
        result=reader.queues()
        self.assertEqual(result['items'][0]['instance'],'NSE / line 1')
        self.assertEqual(result['items'][0]['last_observed'],'2026-08-24T03:45:00+00:00')
        self.assertEqual(result['items'][0]['peak'],5)
        self.assertEqual(result['count'],1)

    def test_sql_is_parameterized_and_unknown_status_returns_no_rows(self):
        sql,args=select_statement('latency','order_latency',{'q':"' OR 1=1 --",'start':1787543100,'status':'Confirmed'},'2026-08-24',100)
        self.assertNotIn('OR 1=1',sql);self.assertIn("' OR 1=1 --",args);self.assertIn('1 = 0',sql)
        sql,args=select_statement('queue','queue_line2',{'start':1787543100,'instance':'NSE / line 1'},'2026-08-24',100)
        self.assertIn('1 = 0',sql);self.assertEqual(args[0],datetime(2026,8,24,9,15))
        with self.assertRaises(ValueError):select_statement('latency','private_table',{},None,100)

    def test_oversized_or_failed_database_never_returns_partial_or_secret_errors(self):
        reader=AnalyticsDatabase(lambda:Connection(self.data()),max_rows=0)
        with self.assertRaises(HTTPException) as error:reader.latency()
        self.assertEqual(error.exception.status_code,503)
        def broken():raise ValueError('private-password@database-host')
        with self.assertRaises(HTTPException) as error:AnalyticsDatabase(broken).latency()
        self.assertNotIn('private',error.exception.detail)

    def test_snapshot_cache_avoids_reopening_database_for_pagination(self):
        calls=[]
        def factory():calls.append(1);return Connection(self.data())
        reader=AnalyticsDatabase(factory)
        reader.latency(limit=1);reader.latency(limit=50)
        self.assertEqual(len(calls),1)
