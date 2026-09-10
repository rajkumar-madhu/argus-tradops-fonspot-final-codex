#!/usr/bin/env python3
"""API evidence without printing trading records or credentials."""
import argparse,csv,io,json,time
from urllib.request import urlopen,Request
from urllib.error import HTTPError
from urllib.parse import urlencode
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('base',nargs='?',default='http://127.0.0.1:8102')
base=parser.parse_args().base.rstrip('/')
def get(path):
 with urlopen(base+path,timeout=60) as r:return json.load(r)
report={};started=time.perf_counter();data=get('/api/files/latency');report['first_observed_query_seconds']=round(time.perf_counter()-started,3)
started=time.perf_counter();assert get('/api/files/latency')['count']==data['count'];report['warm_query_seconds']=round(time.perf_counter()-started,3)
segment=min(data['by_segment'],key=lambda r:r['count'])['segment']
query=urlencode({'segment':segment,'sort':'oms','direction':'desc','limit':25})
filtered=get('/api/files/latency?'+query)
assert all(r['segment']==segment for r in filtered['items'])
with urlopen(base+'/api/files/latency/export?'+urlencode({'segment':segment,'sort':'oms','direction':'desc'}),timeout=90) as response:
 rows=csv.DictReader(io.TextIOWrapper(response,encoding='utf-8'));count=0;previous=float('inf')
 for row in rows:
  count+=1
  if row['oms']:
   n=float(row['oms']);assert n<=previous;previous=n
 assert count==filtered['count']
report['export_rows']=count
empty=get('/api/files/latency?q=NO_SUCH_ORDER_VERIFICATION')
assert empty['count']==0 and empty['summary']['oms']['p50'] is None
queues=get('/api/files/queues');assert sum(r['state']=='No data received' for r in queues['items'])==4
for path in ['/api/files/latency?limit=0','/api/files/latency?sort=DROP','/api/files/latency?start=2026-09-09T00:00:00Z&end=2026-09-08T00:00:00Z']:
 try:urlopen(base+path);raise AssertionError('Invalid query accepted')
 except HTTPError as e:assert e.code==422
report.update(result='PASS',latency_events=data['count'],sources=get('/api/files/sources')['count'],queue_sources=len(queues['items']),ready=get('/health/ready')['status'],export_scope='matched',empty_filter='passed',invalid_queries='rejected')
print(json.dumps(report,indent=2))
