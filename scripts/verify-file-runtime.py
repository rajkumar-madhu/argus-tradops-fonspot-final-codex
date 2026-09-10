#!/usr/bin/env python3
"""Check source-backed HTTP pages and filtered exports without logging trading rows."""
import argparse
import csv
import io
import json
from urllib.parse import urlencode
from urllib.request import urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--api', required=True)
parser.add_argument('--ui', required=True)
args = parser.parse_args()


def get(base, path):
    with urlopen(base.rstrip('/') + path, timeout=120) as response:
        assert response.status == 200, path
        return response.read().decode()


def data(path):
    return json.loads(get(args.api, path))


assert data('/health/ready')['status'] == 'ready'
assert data('/api/files/sources')['count'] > 0
for kind, params in [('latency', {'segment': 'BFO', 'sort': 'oms', 'direction': 'desc'}), ('queues', {'instance': 'NSE2'})]:
    query = urlencode(params)
    result = data('/api/files/' + kind + '?' + query)
    assert result['source'] == 'csv snapshot'
    for base, path in [(args.api, f'/api/files/{kind}/export'), (args.ui, f'/api/exports/{kind}')]:
        rows = list(csv.DictReader(io.StringIO(get(base, path + '?' + query))))
        assert len(rows) == result['count'], kind
        if kind == 'latency' and rows:
            assert float(rows[0]['oms']) == result['items'][0]['oms']
        if kind == 'queues':
            assert all(r['instance'] == 'NSE2' for r in rows)
    print('PASS', kind, 'API + frontend export reconciliation:', result['count'])

routes = ['/', '/dashboard', '/orders', '/order-book', '/trades', '/positions', '/holdings', '/rejections', '/rca', '/order-latency', '/queue-monitor', '/data-quality', '/market-data', '/exchange', '/sessions', '/risk', '/infra', '/logs', '/incidents', '/reports', '/configuration', '/signin', '/signup', '/forgot-password', '/verify']
for route in routes:
    html = get(args.ui, route)
    assert '<html' in html, route
    assert 'Application error: a server-side exception' not in html, route
    print('PASS page', route)
html = get(args.ui, '/order-latency?q=UNMATCHED_VERIFICATION_SENTINEL')
assert 'No matching events' in html
print('PASS no-match latency filter empty state')
