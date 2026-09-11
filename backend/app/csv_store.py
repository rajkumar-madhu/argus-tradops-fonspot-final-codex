"""Read-only source ingestion into a replaceable, indexed local analytics cache.

No raw rows, tokens, remarks or credentials are persisted. Each file is replaced
atomically; identical events deduplicate within a source and lifecycle changes
remain separate. SQLite is a derived cache, not the incident system of record.
"""
from __future__ import annotations
import csv
import hashlib
import io
import json
import logging
import math
import os
import re
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

LOG = logging.getLogger('tradeops.ingestion')


def number(value):
    try:
        if value is None or not str(value).strip(): return None
        n=float(value)
        return n if math.isfinite(n) and n >= 0 else None
    except (TypeError, ValueError, OverflowError): return None


def parse_time(value):
    text=str(value or '').strip()
    if not text: return None
    try:
        if re.fullmatch(r'\d+(?:\.\d+)?',text):
            n=float(text)
            if n >= 1e17: n /= 1e9
            elif n >= 1e14: n /= 1e6
            elif n >= 1e11: n /= 1e3
            # Supported trading source epochs are 2000-2100, not arbitrary numbers.
            return n if 946684800 <= n < 4102444800 else None
        if ' IST ' in text:
            return datetime.strptime(text,'%a %b %d %I:%M:%S %p IST %Y').replace(tzinfo=ZoneInfo('Asia/Kolkata')).timestamp()
        dt=datetime.fromisoformat(text.replace('Z','+00:00'))
        return dt.timestamp() if dt.tzinfo else None
    except (ValueError, OverflowError): return None


def iso(value):
    return datetime.fromtimestamp(value,timezone.utc).isoformat() if value is not None else None


def safe_csv_cell(value):
    text='' if value is None else str(value)
    return "'"+text if text.lstrip().startswith(('=','+','-','@','\t','\r','\n')) else text


class Distribution:
    def __init__(self): self.values=[]
    def step(self,v):
        if v is not None: self.values.append(v)
    def finalize(self):
        v=sorted(self.values);n=len(v)
        return json.dumps({'samples':n, **{f'p{p}':v[max(0,math.ceil(p/100*n)-1)] if n else None for p in (50,90,95,99)},'max':v[-1] if n else None})


def empty_distribution():
    return {'samples':0,'p50':None,'p90':None,'p95':None,'p99':None,'max':None}


def file_kind(name):
    if name.startswith('QueSize_'): return 'queue'
    # ORDERLATENCY*.csv also matches the headerless stage-timing export, so name it first.
    if name.startswith(('ORDERLATENCYSORTED','L_ORDERLATENCYSORTED')): return 'hops'
    return 'latency'


HOP_HEAD=4; HOP_GROUP=7


def parse_hop_row(fields):
    """One ORDERLATENCYSORTED row -> (order, instance, segment, stages, mismatches), or None.

    Layout: order, instance, segment, ext_rmks, then 7-field groups of
    code_a, code_b, duration_us, end_s, end_ns, start_s, start_ns. Groups are named
    intervals, not a chain. Any malformed group rejects the whole row; remarks are
    never returned.
    """
    if len(fields)<HOP_HEAD+HOP_GROUP: return None
    order,instance,segment=(str(f).strip() for f in fields[:3])
    if not order or len(order)>32 or not segment or len(segment)>16 or len(instance)>64: return None
    groups=[str(v).strip() for v in fields[HOP_HEAD:]]
    whole=len(groups)//HOP_GROUP*HOP_GROUP
    if any(groups[whole:]): return None  # data after the last complete group
    stages=[];mismatches=0
    for position,i in enumerate(range(0,whole,HOP_GROUP)):
        a,b,dur,end_s,end_ns,start_s,start_ns=groups[i:i+HOP_GROUP]
        if not a:
            if b or end_s or end_ns or start_s or start_ns or dur not in ('','0'): return None
            continue
        if not (a.isdigit() and len(a)<=4 and (not b or (b.isdigit() and len(b)<=4))): return None
        duration=number(dur)
        if duration is None or not all(x.isdigit() for x in (end_s,end_ns,start_s,start_ns)): return None
        if int(end_ns)>=10**9 or int(start_ns)>=10**9 or parse_time(start_s) is None: return None
        start=int(start_s)*10**9+int(start_ns); end=int(end_s)*10**9+int(end_ns)
        if end<start: return None
        # The file carries both; they agree to the microsecond when the export is sound.
        if abs((end-start)/1000-duration)>1: mismatches+=1
        stages.append((a if not b or a==b else f'{a}/{b}',position,duration,start,end))
    return (order,instance,segment,stages,mismatches) if stages else None


class CsvStore:
    def __init__(self, root, database, unit='unverified', max_bytes=256*1024*1024, max_rows=2_000_000):
        self.root=Path(root).resolve();self.database=Path(database).resolve()
        self.unit=unit if unit in ('us','ms','s') else 'source units'
        self.max_bytes=max_bytes
        self.max_rows=max_rows
        self.database.parent.mkdir(parents=True,exist_ok=True)
        with self.connection(max_seconds=300) as db:
            db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS files(name TEXT PRIMARY KEY, signature TEXT, metadata TEXT);
            CREATE TABLE IF NOT EXISTS events(
              file TEXT, fingerprint TEXT, kind TEXT, instance TEXT, order_id TEXT,
              segment TEXT, status TEXT, event_time REAL, oms REAL, confirmation REAL,
              queue REAL, PRIMARY KEY(file,fingerprint));
            CREATE INDEX IF NOT EXISTS event_scope ON events(kind,segment,event_time);
            CREATE INDEX IF NOT EXISTS event_instance ON events(kind,instance,event_time);
            CREATE INDEX IF NOT EXISTS event_order ON events(order_id,event_time);
            CREATE TABLE IF NOT EXISTS hops(
              file TEXT, fingerprint TEXT, order_id TEXT, instance TEXT, segment TEXT, stage TEXT,
              position INTEGER, duration REAL, start_ns INTEGER, end_ns INTEGER, row_number INTEGER,
              PRIMARY KEY(file,fingerprint));
            CREATE INDEX IF NOT EXISTS hop_scope ON hops(segment,instance,stage);
            CREATE INDEX IF NOT EXISTS hop_by_order ON hops(order_id,start_ns);
            ''')
            # Add provenance to older derived caches; changed signatures force reimport.
            columns={r[1] for r in db.execute('PRAGMA table_info(events)')}
            for column,kind in [('row_number','INTEGER'),('exch_status','TEXT'),('exchange_time','REAL')]:
                if column not in columns:db.execute(f'ALTER TABLE events ADD COLUMN {column} {kind}')
            # Cover aggregate reads: avoid hundreds of thousands of random table
            # lookups when grouping a full-day snapshot by segment and time.
            db.execute('CREATE INDEX IF NOT EXISTS event_measurements ON events(kind,segment,event_time,oms,confirmation,order_id)')
            db.commit()
        os.chmod(self.database,0o600)

    @contextmanager
    def connection(self, max_seconds=20):
        db=sqlite3.connect(self.database,timeout=10)
        db.row_factory=sqlite3.Row
        db.create_aggregate('distribution',1,Distribution)
        deadline=time.monotonic()+max_seconds
        db.set_progress_handler(lambda: int(time.monotonic()>deadline),10000)
        try: yield db
        finally: db.close()

    def ingest(self):
        if not self.root.is_dir(): raise ValueError('Configured source directory is unavailable')
        files=sorted(set(self.root.glob('ORDERLATENCY*.csv')) | set(self.root.glob('L_ORDERLATENCY*.csv')) | set(self.root.glob('QueSize_*.csv')))
        if len(files)>256: raise ValueError('Source file limit exceeded')
        for path in files: self._ingest_file(path)
        # Removed inputs cease to contribute. This only changes the derived cache.
        with self.connection() as db, db:
            for row in db.execute('SELECT name FROM files').fetchall():
                if row['name'] not in {p.name for p in files}:
                    db.execute('DELETE FROM events WHERE file=?',(row['name'],));db.execute('DELETE FROM hops WHERE file=?',(row['name'],))
                    db.execute('DELETE FROM files WHERE name=?',(row['name'],))
        return self.catalog()

    def _ingest_file(self,path):
        start=time.perf_counter();kind=file_kind(path.name)
        instance=path.name[len('QueSize_'):].rsplit('_',1)[0] if kind=='queue' else kind
        m={'name':path.name,'kind':kind,'instance':instance,'rows':0,'accepted':0,'rejected':0,'duplicates':0,
           'invalid_values':0,'missing_values':0,'timestamp_mismatches':0,'state':'Ready','generation':time.time_ns()}
        if kind=='hops':m['stages']=0
        signature='';rows=[]
        # Bulk ingestion is bounded separately from the 20-second request budget.
        with self.connection(max_seconds=300) as db:
            try:
                if path.is_symlink() or path.resolve().parent != self.root: raise ValueError('Rejected path')
                st=path.stat();m['bytes']=st.st_size
                if st.st_size>self.max_bytes: raise ValueError('File too large')
                signature=f'v2:{st.st_dev}:{st.st_ino}:{st.st_size}:{st.st_mtime_ns}:{st.st_ctime_ns}'
                previous=db.execute('SELECT signature FROM files WHERE name=?',(path.name,)).fetchone()
                if previous and previous[0]==signature: return
                fd=os.open(path,os.O_RDONLY | getattr(os,'O_NOFOLLOW',0))
                with os.fdopen(fd,'rb') as raw:
                    digest=hashlib.file_digest(raw,'sha256').hexdigest();raw.seek(0)
                    m['sha256']=digest
                    if kind=='hops':
                        if st.st_size==0: m['state']='No data received'
                        db.execute('BEGIN IMMEDIATE');db.execute('DELETE FROM hops WHERE file=?',(path.name,))
                        self._ingest_hops(db,csv.reader(io.TextIOWrapper(raw,encoding='utf-8-sig',newline=''),strict=True),path.name,m)
                    else:
                        reader=csv.DictReader(io.TextIOWrapper(raw,encoding='utf-8-sig',newline=''),strict=True)
                        required={'Time','QSz','SeqNo','Erf'} if kind=='queue' else {'NOREN_ORD_NUM','EXCH_SEG','OMS_LATENCY','OMSUPDATETIME'}
                        if st.st_size==0: m['state']='No data received'
                        elif not required.issubset(reader.fieldnames or []): raise ValueError('Missing required fields')
                        m['missing_fields']=sorted(({'OMS_STATUS','EXCH_STATUS','EXT_RMKS'} if kind=='latency' else set())-set(reader.fieldnames or []))
                        db.execute('BEGIN IMMEDIATE');db.execute('DELETE FROM events WHERE file=?',(path.name,))
                        for row in reader:
                            m['rows']+=1
                            if m['rows']>self.max_rows: raise ValueError('Row limit exceeded')
                            if None in row or any(v is not None and len(v)>4096 for v in row.values()): m['rejected']+=1;continue
                            stamp=parse_time(row.get('Time' if kind=='queue' else 'OMSUPDATETIME'))
                            order=str(row.get('NOREN_ORD_NUM') or '').strip()
                            segment=str(row.get('EXCH_SEG') or '').strip() if kind=='latency' else instance
                            if stamp is None or (kind=='latency' and (not order or not segment or len(order)>128 or len(segment)>64)):
                                m['rejected']+=1;continue
                            values=[]
                            for field in (('QSz',) if kind=='queue' else ('OMS_LATENCY','OMS_EXCH_CONFIRMATION')):
                                value=row.get(field)
                                if field=='OMS_EXCH_CONFIRMATION' and field not in row: value=row.get('OMS_EXCH_CONFIRM')
                                parsed=number(value)
                                if parsed is None: m['missing_values' if value is None or not str(value).strip() else 'invalid_values']+=1
                                values.append(parsed)
                            if kind=='queue' and (values[0] is None or not values[0].is_integer()):m['rejected']+=1;continue
                            converted=parse_time(row.get('OMSUPDATETIME_CONV'))
                            if converted is not None and abs(converted-stamp)>1:m['timestamp_mismatches']+=1
                            # Hash all input columns so distinct lifecycle events are never merged by order id alone.
                            fingerprint=hashlib.sha256(json.dumps(row,sort_keys=True,separators=(',',':')).encode()).hexdigest()
                            rows.append((path.name,fingerprint,kind,instance,order,segment,str(row.get('OMS_STATUS') or 'Unavailable')[:64],stamp,
                                         values[0] if kind=='latency' else None,values[1] if kind=='latency' else None,values[0] if kind=='queue' else None,m['rows']+1,row.get('EXCH_STATUS'),parse_time(row.get('EXCHUPDATETIME'))))
                            if len(rows)>=1000:self._batch(db,rows,m);rows=[]
                        if rows:self._batch(db,rows,m)
                    now=path.stat()
                    if (now.st_size,now.st_mtime_ns,now.st_ino)!=(st.st_size,st.st_mtime_ns,st.st_ino):raise ValueError('Source changed during ingestion')
                if not m['accepted'] and m['state']=='Ready':m['state']='No valid rows' if m['rejected'] else 'No data received'
                elif m['rejected'] or m['invalid_values'] or m['missing_values'] or m['timestamp_mismatches']:m['state']='Partial data'
            except (OSError, ValueError, csv.Error, UnicodeError, sqlite3.Error) as error:
                try:
                    db.rollback()
                except sqlite3.Error:
                    pass
                if isinstance(error, sqlite3.Error):
                    # Progress-handler deadlines raise OperationalError: interrupted.
                    # Leave prior accepted rows in place after rollback; clear the
                    # signature so the next explicit ingest retries.
                    m['state'] = 'Ingestion interrupted'
                else:
                    m['state']=str(error) if isinstance(error,ValueError) and str(error) in ('Rejected path','File too large','Missing required fields','Row limit exceeded','Source changed during ingestion') else 'Unreadable or malformed file'
                    try:
                        db.execute('DELETE FROM events WHERE file=?',(path.name,));db.execute('DELETE FROM hops WHERE file=?',(path.name,))
                        m['accepted']=0;m['rejected']=m['rows'];m['duplicates']=0
                    except sqlite3.Error:
                        m['state'] = 'Ingestion interrupted'
                signature=''  # Retry failed inputs on the next explicit ingestion.
            m['duration_seconds']=round(time.perf_counter()-start,4)
            # The deadline bounds the bulk work above. Once it has fired it fires on every
            # later statement, so disarm it or the file's state could never be recorded.
            db.set_progress_handler(None,0)
            db.execute('INSERT OR REPLACE INTO files VALUES(?,?,?)',(path.name,signature,json.dumps(m)));db.commit()
        LOG.info('%s',json.dumps({'event':'file_ingested','kind':kind,'state':m['state'],'rows':m['rows'],'accepted':m['accepted'],'rejected':m['rejected'],'duration_seconds':m['duration_seconds']}))
        try:
            from app.metrics import CSV_DURATION, CSV_ROWS
            CSV_DURATION.labels(kind=kind).observe(m['duration_seconds'])
            for key in ('accepted','rejected','duplicates'):CSV_ROWS.labels(kind=kind,outcome=key).inc(m[key])
        except ImportError: pass

    @staticmethod
    def _batch(db,rows,m):
        before=db.total_changes
        db.executemany('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',rows)
        accepted=db.total_changes-before;m['accepted']+=accepted;m['duplicates']+=len(rows)-accepted

    def _ingest_hops(self,db,reader,name,m):
        seen=set();batch=[]
        def flush():
            before=db.total_changes
            db.executemany('INSERT OR IGNORE INTO hops VALUES(?,?,?,?,?,?,?,?,?,?,?)',batch)
            m['stages']+=db.total_changes-before;batch.clear()
        for fields in reader:
            if not fields: continue
            m['rows']+=1
            if m['rows']>self.max_rows: raise ValueError('Row limit exceeded')
            parsed=parse_hop_row(fields)
            if parsed is None: m['rejected']+=1;continue
            order,instance,segment,stages,mismatches=parsed
            m['timestamp_mismatches']+=mismatches
            keys=[hashlib.sha256(f'{order}|{s}|{start}|{end}|{d}'.encode()).hexdigest() for s,_,d,start,end in stages]
            # Whole-row repeats count as duplicates, like exact repeats in the other kinds.
            row_key=hashlib.sha256('|'.join(keys).encode()).hexdigest()
            if row_key in seen: m['duplicates']+=1;continue
            seen.add(row_key);m['accepted']+=1
            batch.extend((name,k,order,instance,segment,s,pos,d,start,end,m['rows']) for k,(s,pos,d,start,end) in zip(keys,stages))
            if len(batch)>=5000: flush()
        if batch: flush()

    @staticmethod
    def _hop_where(segment='',instance=''):
        clauses=['1=1'];args=[]
        for column,value in (('segment',segment),('instance',instance)):
            if value:clauses.append(f'{column}=?');args.append(value)
        return ' AND '.join(clauses),args

    def hops_summary(self,segment='',instance='',limit=20):
        if not 1<=limit<=100:raise ValueError('Invalid limit')
        where,args=self._hop_where(segment,instance)
        with self.connection() as db:
            db.execute('BEGIN')
            orders=db.execute(f'SELECT count(DISTINCT order_id) FROM hops WHERE {where}',args).fetchone()[0]
            stages=[{'stage':r['stage'],'orders':r['orders'],**(json.loads(r['d']) if r['d'] else empty_distribution())}
                    for r in db.execute(f'SELECT stage,count(DISTINCT order_id) AS orders,distribution(duration) AS d FROM hops WHERE {where} GROUP BY stage ORDER BY avg(position),stage',args)]
            slowest=[{'order_id':r['order_id'],'segment':r['segment'],'instance':r['instance'],'stages':r['n'],'span_us':(r['e']-r['s'])/1000,'first_start':iso(r['s']/1e9)}
                     for r in db.execute(f'SELECT order_id,segment,instance,min(start_ns) AS s,max(end_ns) AS e,count(*) AS n FROM hops WHERE {where} GROUP BY order_id,segment,instance ORDER BY max(end_ns)-min(start_ns) DESC,order_id LIMIT ?',args+[limit])]
            choices={column:[r[0] for r in db.execute(f'SELECT DISTINCT {column} FROM hops ORDER BY {column}')] for column in ('segment','instance')}
        return {'source':'csv snapshot','unit':'us','orders':orders,'stages':stages,'slowest':slowest,'choices':choices,
                'note':'Stage codes are shown as recorded; their names await a Noren definition. Durations are microseconds and are checked against each stage\'s own start and end timestamps.'}

    def hop_order(self,order_id):
        if not order_id or len(order_id)>32:raise ValueError('Invalid order')
        with self.connection() as db:
            rows=[dict(r) for r in db.execute('SELECT DISTINCT stage,position,duration,start_ns,end_ns,segment,instance FROM hops WHERE order_id=? ORDER BY start_ns,position',(order_id,))]
            files=[r[0] for r in db.execute('SELECT DISTINCT file FROM hops WHERE order_id=? ORDER BY file',(order_id,))]
        if not rows:return None
        t0=min(r['start_ns'] for r in rows);t1=max(r['end_ns'] for r in rows)
        return {'source':'csv snapshot','unit':'us','order_id':order_id,'segment':rows[0]['segment'],'instance':rows[0]['instance'],'files':files,
                'first_start':iso(t0/1e9),'span_us':(t1-t0)/1000,
                'stages':[{'stage':r['stage'],'position':r['position'],'duration_us':r['duration'],'start_us':(r['start_ns']-t0)/1000,'end_us':(r['end_ns']-t0)/1000} for r in rows]}

    def catalog(self):
        with self.connection() as db:
            files=[json.loads(r[0]) for r in db.execute('SELECT metadata FROM files ORDER BY name')]
        hashes={}
        for f in files:
            digest=f.get('sha256');f['identical_content_to']=hashes.get(digest) if f.get('bytes',0)>0 else None
            if digest:hashes.setdefault(digest,f['name'])
        return {'source':'csv snapshot','files':files,'count':len(files),'unit':self.unit,'state':'Ready','note':'Historical file observations; file ingestion does not establish live connectivity.'}

    def _where(self,kind,segment='',instance='',status='',q='',from_time=None,to_time=None,**unused):
        from_time=from_time if from_time is not None else unused.get('start')
        to_time=to_time if to_time is not None else unused.get('end')
        clauses=['kind=?'];args=[kind]
        for name,value in [('segment',segment),('instance',instance),('status',status)]:
            if value:clauses.append(f'{name}=?');args.append(value)
        if q:
            if len(q)>128:raise ValueError('Search is too long')
            clauses.append('instr(lower(order_id), lower(?)) > 0');args.append(q)
        for field,op in [(from_time,'>='),(to_time,'<=')]:
            if field is not None:
                stamp=parse_time(field)
                if stamp is None:raise ValueError('Time filters require an explicit timezone or a supported epoch')
                clauses.append(f'event_time {op} ?');args.append(stamp)
        if from_time and to_time and parse_time(from_time)>parse_time(to_time):raise ValueError('From must be before To')
        return ' AND '.join(clauses),args

    @staticmethod
    def _row(row):
        d=dict(row);d['event_time']=iso(d['event_time']);d['oms_status']=None if d['status']=='Unavailable' else d['status'];return d

    def latency(self,limit=50,offset=0,sort='event_time',direction='desc',**filters):
        sort='event_time' if sort=='time' else sort
        if sort not in ('event_time','oms','confirmation','order_id','segment','status') or direction not in ('asc','desc'):raise ValueError('Invalid sort')
        if not 1<=limit<=500 or not 0<=offset<=2_000_000:raise ValueError('Invalid page')
        where,args=self._where('latency',**filters)
        with self.connection() as db:
            db.execute('BEGIN')
            summary=dict(db.execute(f'SELECT count(*) AS count,count(DISTINCT order_id) AS unique_orders,distribution(oms) AS oms,distribution(confirmation) AS confirmation FROM events WHERE {where}',args).fetchone())
            items=[self._row(r) for r in db.execute(f'SELECT * FROM events WHERE {where} ORDER BY {sort} IS NULL,{sort} {direction},file,row_number LIMIT ? OFFSET ?',args+[limit,offset])]
            segments=[dict(r) for r in db.execute(f'SELECT segment,count(*) AS count,distribution(oms) AS oms,distribution(confirmation) AS confirmation FROM events WHERE {where} GROUP BY segment ORDER BY segment',args)]
            bounds=db.execute(f'SELECT min(event_time),max(event_time) FROM events WHERE {where}',args).fetchone()
            width=max(60,math.ceil(((bounds[1] or 0)-(bounds[0] or 0))/180))
            trend=[{'time':iso(r['t']),'count':r['n'],'oms':r['oms'],'confirmation':r['confirmation']} for r in db.execute(f'SELECT cast(event_time / ? AS INTEGER)*? AS t,count(*) AS n,avg(oms) AS oms,avg(confirmation) AS confirmation FROM events WHERE {where} GROUP BY t ORDER BY t',[width,width]+args)]
            choices={name:[r[0] for r in db.execute(f'SELECT DISTINCT {name} FROM events WHERE kind=? ORDER BY {name}',('latency',))] for name in ('segment','status')}
        for seg in segments:
            for key in ('oms','confirmation'):seg[key]=json.loads(seg[key]) if seg[key] else empty_distribution()
        return {'source':'csv snapshot','unit':self.unit,'count':summary['count'],'unique_orders':summary['unique_orders'],'items':items,
                'summary':{k:json.loads(summary[k]) if summary[k] else empty_distribution() for k in ('oms','confirmation')},
                'by_segment':segments,'trend':trend,'bucket_seconds':width,'choices':choices,'limit':limit,'offset':offset,
                'note':'Events, not unique orders. Timing samples include valid zero values. Missing status is unavailable; duration units require a confirmed feed contract.'}

    def queues(self,**filters):
        where,args=self._where('queue',**filters)
        sources=[]
        with self.connection() as db:
            for f in self.catalog()['files']:
                if f['kind']!='queue' or (filters.get('instance') and f['instance']!=filters['instance']):continue
                scoped=where+' AND file=?';params=args+[f['name']]
                row=db.execute(f'SELECT count(*) AS samples,max(queue) AS peak,avg(queue) AS average,min(event_time) AS first,max(event_time) AS last FROM events WHERE {scoped}',params).fetchone()
                latest=db.execute(f'SELECT queue FROM events WHERE {scoped} ORDER BY event_time DESC,rowid DESC LIMIT 1',params).fetchone()
                width=max(60,math.ceil(((row['last'] or 0)-(row['first'] or 0))/180))
                trend=[{'time':iso(r[0]),'peak':r[1]} for r in db.execute(f'SELECT cast(event_time/? AS INTEGER)*?,max(queue) FROM events WHERE {scoped} GROUP BY 1 ORDER BY 1',[width,width]+params)]
                distribution=db.execute(f'SELECT distribution(queue) FROM events WHERE {scoped}',params).fetchone()[0]
                p99=json.loads(distribution)['p99'] if distribution else None
                anomalies=db.execute(f'SELECT count(*) FROM events WHERE {scoped} AND queue>?',params+[p99]).fetchone()[0] if p99 is not None else 0
                sources.append({'instance':f['instance'],'file':f['name'],'samples':row['samples'],'latest':latest[0] if latest else None,'peak':row['peak'],'average':row['average'],
                                'last_observed':iso(row['last']),'age_seconds':max(0,time.time()-row['last']) if row['last'] else None,
                                'state':f['state'] if row['samples'] or not f['accepted'] else 'No matching rows',
                                'freshness':'Stale snapshot' if row['last'] and time.time()-row['last']>300 else ('Recent observation' if row['last'] else 'No data received'),
                                'anomalies':anomalies,'anomaly_rule':'Strictly above this filtered source p99; not a configured operational alert',
                                'trend':trend,'bucket_seconds':width,'identical_content_to':f.get('identical_content_to')})
        return {'source':'csv snapshot','sources':sources,'count':sum(s['samples'] for s in sources),'unit':'messages','note':'Instance aliases remain separate. Do not sum depths across potentially duplicated source files.'}

    def export_rows(self,kind,sort='event_time',direction='asc',**filters):
        sort='event_time' if sort=='time' else sort
        if sort not in ('event_time','oms','confirmation','order_id','segment','status') or direction not in ('asc','desc'):
            raise ValueError('Invalid sort')
        where,args=self._where(kind,**filters)
        with self.connection(max_seconds=120) as db:
            for row in db.execute(f'SELECT * FROM events WHERE {where} ORDER BY {sort} IS NULL,{sort} {direction},file,row_number',args):yield self._row(row)
