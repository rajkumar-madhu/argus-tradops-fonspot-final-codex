"""Read-only MySQL analytics snapshots, reusing the verified local query contract.

The daily importer owns writes. This reader selects allowlisted columns only;
normalized, bounded snapshots live in private, disposable SQLite files. No CSVs
are parsed by requests and no write/DDL statement is sent to MySQL.
"""
import hashlib
import json
import os
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from app.csv_store import number, parse_time
from app.file_analytics import FileAnalytics

IST = ZoneInfo('Asia/Kolkata')
TABLES = {'latency': ('order_latency',), 'queue': ('queue_line1', 'queue_line2')}


def configured():
    return bool(os.getenv('ANALYTICS_READ_DB_HOST', '').strip())


def connect():
    import mysql.connector
    required = {k: os.getenv('ANALYTICS_READ_DB_' + k.upper(), '').strip() for k in ('host', 'user', 'name')}
    password = os.getenv('ANALYTICS_READ_DB_PASSWORD', '')
    if not all(required.values()) or not password:
        raise ValueError('Analytics reader configuration is incomplete')
    options = dict(host=required['host'], user=required['user'], database=required['name'], password=password,
                   port=int(os.getenv('ANALYTICS_READ_DB_PORT', '3306')), connection_timeout=5,
                   read_timeout=30, autocommit=False)
    ca = os.getenv('ANALYTICS_READ_DB_SSL_CA', '').strip()
    if ca:
        options.update(ssl_ca=ca, ssl_verify_cert=True, ssl_verify_identity=True)
    return mysql.connector.connect(**options)


def select_statement(kind, table, filters, latest, cap):
    if table not in TABLES[kind]:
        raise ValueError('Unknown analytics table')
    args = []; conditions = []
    stamp = 'oms_update_time' if kind == 'latency' else 'time'
    for name, op in [('start', '>='), ('end', '<=')]:
        if filters.get(name) is not None:
            value = filters[name] if kind == 'latency' else datetime.fromtimestamp(filters[name], IST).replace(tzinfo=None)
            conditions.append(f'`{stamp}` {op} %s'); args.append(value)
    if not conditions:
        conditions.append('file_date = %s'); args.append(latest)
    if kind == 'latency':
        if filters.get('segment'):
            conditions.append('exch_seg = %s'); args.append(filters['segment'])
        if filters.get('q'):
            conditions.append('LOCATE(%s, CAST(noren_ord_num AS CHAR)) > 0'); args.append(filters['q'])
        # The import schema has no status column. Never fabricate it.
        if filters.get('status') and filters['status'] != 'Unavailable':
            conditions.append('1 = 0')
        columns = 'file_date, noren_ord_num, exch_seg, oms_latency, oms_exch_confirmation, oms_update_time, exch_update_time'
        order = 'oms_update_time, noren_ord_num, exch_seg'
    else:
        if filters.get('instance'):
            name, separator, line = filters['instance'].rpartition(' / line ')
            if not separator or table != f'queue_line{line}':
                conditions.append('1 = 0')
            else:
                conditions.append('segment = %s'); args.append(name)
        columns = 'file_date, segment, `time`, seq_no, erf, queue_size'
        order = '`time`, seq_no, erf, segment'
    args.append(cap + 1)
    return f'SELECT {columns} FROM {table} WHERE '+ ' AND '.join(conditions) + f' ORDER BY {order} LIMIT %s', args


class AnalyticsDatabase:
    def __init__(self, connection_factory=connect, unit='unknown', max_rows=2_000_000, ttl=300):
        self.connection_factory = connection_factory
        self.unit = unit; self.max_rows = max_rows; self.ttl = ttl
        self._cache = {}; self._lock = threading.Lock()

    def _snapshot(self, kind, filters):
        scope = {k: filters.get(k) for k in ('start','end','segment','q','status','instance') if filters.get(k) not in (None, '')}
        key = (kind, tuple(sorted(scope.items())))
        with self._lock:
            hit = self._cache.get(key)
            if hit and time.monotonic() - hit[0] < self.ttl:
                return hit[1], hit[2]
            try:
                store, dates = self._load(kind, scope)
            except Exception:
                # Do not return credentials, hostnames, SQL or cached data as fresh.
                raise HTTPException(503, 'Analytics database unavailable or requested snapshot exceeds its row limit') from None
            self._cache[key] = (time.monotonic(), store, dates)
            while len(self._cache) > 8:
                self._cache.pop(next(iter(self._cache)))
            return store, dates

    def _load(self, kind, filters):
        temp = tempfile.TemporaryDirectory(prefix='tradeops-analytics-')
        store = FileAnalytics(Path(temp.name)/'snapshot.sqlite', temp.name, unit=self.unit)
        store._snapshot_directory = temp  # lifetime follows active requests/exports
        conn = self.connection_factory(); cursor = None
        dates = set(); total = 0
        try:
            conn.start_transaction(readonly=True, isolation_level='REPEATABLE READ')
            cursor = conn.cursor(dictionary=True)
            with store.connection(max_seconds=120) as db:
                db.execute('BEGIN IMMEDIATE')
                for table in TABLES[kind]:
                    cursor.execute(f'SELECT DISTINCT file_date FROM {table} ORDER BY file_date DESC')
                    table_dates = [str(row['file_date']) for row in cursor.fetchall() if row.get('file_date')]
                    dates.update(table_dates)
                    if not table_dates:
                        continue
                    sql, args = select_statement(kind, table, filters, table_dates[0], self.max_rows-total)
                    cursor.execute(sql, args)
                    metadata = {}; batch = []
                    while True:
                        chunk = cursor.fetchmany(1000)
                        if not chunk: break
                        for row in chunk:
                            total += 1
                            if total > self.max_rows: raise ValueError('Snapshot limit')
                            day = str(row.get('file_date') or '')
                            segment = str(row.get('exch_seg' if kind == 'latency' else 'segment') or '').strip()[:64]
                            instance = f'{segment} / line {table[-1]}' if kind == 'queue' else 'latency'
                            name = f'{table}:{segment}:{day}' if kind == 'queue' else f'{table}:{day}'
                            m = metadata.setdefault(name, dict(name=name,kind=kind,instance=instance,rows=0,accepted=0,rejected=0,duplicates=0,invalid_values=0,missing_values=0,timestamp_mismatches=0,state='Ready',generation=time.time_ns()))
                            m['rows'] += 1
                            raw_time = row.get('oms_update_time' if kind == 'latency' else 'time')
                            if isinstance(raw_time, datetime):
                                stamp = raw_time.replace(tzinfo=IST).timestamp() if raw_time.tzinfo is None else raw_time.timestamp()
                            else:
                                stamp = parse_time(raw_time)
                            order = str(row.get('noren_ord_num') or '') if kind == 'latency' else ''
                            oms, confirmation, queue = number(row.get('oms_latency')), number(row.get('oms_exch_confirmation')), number(row.get('queue_size'))
                            if stamp is None or not segment or (kind == 'latency' and not order) or (kind == 'queue' and (queue is None or not queue.is_integer())):
                                m['rejected'] += 1; continue
                            for field in (('oms_latency','oms_exch_confirmation') if kind == 'latency' else ('queue_size',)):
                                if number(row.get(field)) is None:
                                    m['missing_values' if row.get(field) is None else 'invalid_values'] += 1
                            # Hash only the selected evidence, preserving queue sequence identity.
                            fingerprint = hashlib.sha256(json.dumps(row,sort_keys=True,default=str).encode()).hexdigest()
                            batch.append((name,fingerprint,kind,instance,order,segment if kind=='latency' else instance,'Unavailable',stamp,oms if kind=='latency' else None,confirmation if kind=='latency' else None,queue if kind=='queue' else None,m['rows'],None,parse_time(row.get('exch_update_time'))))
                        if batch:
                            # Duplicate accounting is per logical source, not across distinct lines.
                            for entry in batch:
                                inserted = db.execute('INSERT OR IGNORE INTO events(file,fingerprint,kind,instance,order_id,segment,status,event_time,oms,confirmation,queue,row_number,exch_status,exchange_time) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', entry).rowcount
                                metadata[entry[0]]['accepted' if inserted else 'duplicates'] += 1
                            batch = []
                    for name,m in metadata.items():
                        if m['rejected'] or m['invalid_values'] or m['missing_values']: m['state']='Partial data'
                        if not m['accepted']: m['state']='No valid rows'
                        db.execute('INSERT INTO files(name,signature,metadata) VALUES(?,?,?)',(name,'database',json.dumps(m)))
                db.commit()
            return store, sorted(dates, reverse=True)
        finally:
            try:
                if cursor is not None: cursor.close()
            finally:
                try: conn.rollback()
                finally: conn.close()

    @staticmethod
    def _label(data, dates):
        return {**data, 'source':'analytics database', 'trade_dates':dates, 'refresh_policy':'Read-only database snapshot; refreshes within five minutes', 'notes':data.get('notes', [])+['Imported CSV observations from the analytics database; no live connectivity is established. Database snapshots use a separate read-only account.']}

    def latency(self, **filters):
        store, dates = self._snapshot('latency', filters)
        return self._label(store.latency(**filters), dates)

    def queues(self, **filters):
        store, dates = self._snapshot('queue', filters)
        return self._label(store.queues(**filters), dates)

    def sources(self):
        a, da = self._snapshot('latency', {}); b, db = self._snapshot('queue', {})
        first, second = a.sources(), b.sources()
        return self._label({**first,'items':first['items']+second['items'],'files':first['files']+second['files'],'count':first['count']+second['count']}, sorted(set(da+db), reverse=True))

    def export_latency(self, **filters):
        store, _ = self._snapshot('latency', filters)
        return store.export_latency(**filters)

    def export_queues(self, **filters):
        store, _ = self._snapshot('queue', filters)
        return store.export_queues(**filters)

    def hops_summary(self, **filters):
        return {'orders':0,'stages':[],'slowest':[],'choices':{'segment':[],'instance':[]},'source':'analytics database','unit':'source units'}

    def hop_order(self, order_id):
        return None
