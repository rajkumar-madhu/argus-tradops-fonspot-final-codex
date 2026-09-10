#!/usr/bin/env python3
"""Validate source integrity, row reconciliation and filtered analytics without printing trading rows."""
import argparse
import csv
import hashlib
import json
import math
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.file_analytics import FileAnalytics


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', required=True, type=Path)
    parser.add_argument('--cache', required=True, type=Path)
    args = parser.parse_args()
    paths = sorted(set(args.source_dir.glob('ORDERLATENCY*.csv')) | set(args.source_dir.glob('L_ORDERLATENCY*.csv')) | set(args.source_dir.glob('QueSize_*.csv')))
    assert paths, 'No source CSV files discovered'
    before = {p.name: digest(p) for p in paths if not p.is_symlink()}
    store = FileAnalytics(args.cache, args.source_dir)
    report = store.ingest()
    for entry in report['files']:
        assert entry['rows'] == entry['accepted'] + entry['rejected'] + entry['duplicates'], entry['name']
        assert entry['state'] in ('Ready', 'Partial data', 'No data received', 'No valid rows'), entry['state']
        if entry['bytes']:
            with (args.source_dir / entry['name']).open(encoding='utf-8-sig', newline='') as stream:
                assert sum(1 for _ in csv.DictReader(stream)) == entry['rows'], entry['name']
        assert entry['sha256'] == before[entry['name']], 'Source changed while ingesting'
    data = store.latency()
    assert data['count'] == sum(f['accepted'] for f in report['files'] if f['kind'] == 'latency')
    for segment in data['choices']['segment']:
        filtered = store.latency(segment=segment, sort='oms', direction='desc')
        values = {'oms': [], 'confirmation': []}
        count = 0
        for row in store.export_rows('latency', segment=segment, sort='oms', direction='desc'):
            count += 1
            for measurement in values:
                if row[measurement] is not None:
                    values[measurement].append(row[measurement])
        assert count == filtered['count']
        assert values['oms'] == sorted(values['oms'], reverse=True), 'Export ordering differs from request'
        for measurement, samples in values.items():
            ascending = sorted(samples)
            summary = filtered['summary'][measurement]
            assert summary['samples'] == len(samples)
            assert summary['max'] == (ascending[-1] if ascending else None)
            for percentile in (50, 90, 95, 99):
                expected = ascending[math.ceil(percentile / 100 * len(ascending)) - 1] if ascending else None
                assert summary[f'p{percentile}'] == expected, measurement
    queue_count = 0
    for source in store.queues()['sources']:
        observations = list(store.export_rows('queue', instance=source['instance']))
        assert len(observations) == source['samples']
        queue_count += len(observations)
        values = sorted(row['queue'] for row in observations)
        assert source['peak'] == (values[-1] if values else None)
        p99 = values[math.ceil(.99 * len(values)) - 1] if values else None
        assert source['anomalies'] == sum(value > p99 for value in values)
        if observations:
            assert source['last_observed'] == observations[-1]['event_time']
            # Inclusive time filters must reconcile summary and export rows.
            midpoint = observations[len(observations) // 2]['event_time']
            window = store.queues(instance=source['instance'], start=midpoint)
            assert window['count'] == sum(1 for _ in store.export_rows('queue', instance=source['instance'], start=midpoint))
        else:
            assert source['latest'] is None and source['last_observed'] is None
    assert queue_count == sum(f['accepted'] for f in report['files'] if f['kind'] == 'queue')
    generations = {f['name']: f['generation'] for f in report['files']}
    assert {f['name']: f['generation'] for f in store.ingest()['files']} == generations, 'Reingestion was not idempotent'
    assert {p.name: digest(p) for p in paths if not p.is_symlink()} == before, 'Source files changed'
    print(json.dumps({'result': 'PASS', 'files': len(report['files']), 'empty_files': sum(f['bytes'] == 0 for f in report['files']), 'latency_events': data['count'], 'queue_observations': store.queues()['count'], 'source_integrity': 'unchanged', 'row_reconciliation': 'passed', 'filtered_export_and_percentiles': 'passed', 'idempotence': 'passed', 'confirmation_percentiles': 'passed', 'queue_aggregates_and_time_filters': 'passed'}, indent=2))


if __name__ == '__main__':
    main()
