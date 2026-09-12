"""Stage timings from headerless ORDERLATENCYSORTED files (per-order named intervals)."""
import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path

BASE = 1784285208 * 10**9  # an in-range epoch second, in nanoseconds


def hop_row(order, stages, instance='QKBT1', segment='NSE', groups=14, trailing=True, duration=None):
    """Build one source row: 4 head fields, then 7-field groups, as the producer writes it."""
    fields = [order, instance, segment, 'ext_rmks']
    for code_a, code_b, start, end in stages:
        dur = duration if duration is not None else f'{(end - start) / 1000:g}'
        fields += [code_a, code_b, dur, str(end // 10**9), str(end % 10**9), str(start // 10**9), str(start % 10**9)]
    fields += ['', '', '0', '', '', '', ''] * (groups - len(stages))
    if trailing:
        fields.append('')
    return fields


# Shaped like the 2026-07-17 sample: overlapping intervals, a dominant early stage.
SLOW = [('46', '46', BASE, BASE + 94_062_500), ('79', '79', BASE + 94_062_500, BASE + 94_706_700),
        ('65', '65', BASE + 94_062_500, BASE + 95_837_300), ('56', '56', BASE + 94_062_500, BASE + 96_046_400)]
FAST = [('46', '46', BASE, BASE + 546_750), ('79', '79', BASE + 546_750, BASE + 597_000),
        ('50', '49', BASE + 546_750, BASE + 1_338_300)]


class HopBase(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('app.csv_store'))
        from app.csv_store import CsvStore
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.store = CsvStore(self.root, self.root / 'cache.sqlite', unit='unverified')

    def write(self, name, rows):
        path = self.root / name
        with path.open('w', newline='') as f:
            csv.writer(f).writerows(rows)  # no header row, like the producer
        return path

    def entry(self, name):
        return next(f for f in self.store.ingest()['files'] if f['name'] == name)


class HopIngestTests(HopBase):
    def test_headerless_rows_become_stage_intervals(self):
        self.write('ORDERLATENCYSORTED20260717170001.csv',
                   [hop_row('900001', SLOW, instance='QKBT2'), hop_row('900002', FAST, segment='BSE')])
        m = self.entry('ORDERLATENCYSORTED20260717170001.csv')
        self.assertEqual((m['kind'], m['state'], m['rows'], m['accepted'], m['rejected']), ('hops', 'Ready', 2, 2, 0))
        self.assertEqual(m['stages'], 7)
        summary = self.store.hops_summary()
        self.assertEqual(summary['orders'], 2)
        self.assertEqual(summary['unit'], 'us')
        stages = {s['stage']: s for s in summary['stages']}
        self.assertEqual(set(stages), {'46', '79', '65', '56', '50/49'})
        self.assertEqual(stages['46']['samples'], 2)
        self.assertEqual(stages['46']['max'], 94062.5)

    def test_sorted_file_is_not_parsed_as_the_latency_format(self):
        """ORDERLATENCY*.csv also matches ORDERLATENCYSORTED; it must not be rejected as latency."""
        self.write('ORDERLATENCYSORTED20260717170001.csv', [hop_row('900001', SLOW)])
        with (self.root / 'ORDERLATENCY_day.csv').open('w', newline='') as f:
            w = csv.writer(f)
            w.writerow(['NOREN_ORD_NUM', 'EXCH_SEG', 'OMS_LATENCY', 'OMS_EXCH_CONFIRMATION', 'OMSUPDATETIME', 'EXCHUPDATETIME'])
            w.writerow(['A', 'NSE', 10, 20, 1788839160, 1788839160])
        files = {f['name']: f for f in self.store.ingest()['files']}
        self.assertEqual(files['ORDERLATENCYSORTED20260717170001.csv']['kind'], 'hops')
        self.assertNotEqual(files['ORDERLATENCYSORTED20260717170001.csv']['state'], 'Missing required fields')
        self.assertEqual(self.store.latency()['count'], 1)  # hop rows never leak into latency events

    def test_malformed_group_rejects_only_that_row(self):
        bad = hop_row('900003', FAST)
        bad[6] = 'not-a-number'  # first group's duration
        self.write('ORDERLATENCYSORTED1.csv', [hop_row('900001', SLOW), bad])
        m = self.entry('ORDERLATENCYSORTED1.csv')
        self.assertEqual((m['accepted'], m['rejected'], m['state']), (1, 1, 'Partial data'))
        self.assertEqual(self.store.hops_summary()['orders'], 1)

    def test_data_after_the_last_group_rejects_the_row(self):
        row = hop_row('900001', FAST)
        row[-1] = 'unexpected'
        self.write('ORDERLATENCYSORTED1.csv', [row])
        self.assertEqual(self.entry('ORDERLATENCYSORTED1.csv')['rejected'], 1)

    def test_duration_that_disagrees_with_timestamps_is_counted_not_dropped(self):
        self.write('ORDERLATENCYSORTED1.csv', [hop_row('900001', [('46', '46', BASE, BASE + 1_000_000)], duration='5')])
        m = self.entry('ORDERLATENCYSORTED1.csv')
        self.assertEqual((m['accepted'], m['timestamp_mismatches'], m['state']), (1, 1, 'Partial data'))

    def test_exact_duplicate_rows_are_counted_once(self):
        self.write('ORDERLATENCYSORTED1.csv', [hop_row('900001', SLOW), hop_row('900001', SLOW)])
        m = self.entry('ORDERLATENCYSORTED1.csv')
        self.assertEqual((m['rows'], m['accepted'], m['duplicates'], m['stages']), (2, 1, 1, 4))

    def test_filename_with_a_space_is_ingested(self):
        self.write('ORDERLATENCYSORTED20260717170001 4.csv', [hop_row('900001', SLOW)])
        self.assertEqual(self.entry('ORDERLATENCYSORTED20260717170001 4.csv')['accepted'], 1)

    def test_removed_file_stops_contributing(self):
        path = self.write('ORDERLATENCYSORTED1.csv', [hop_row('900001', SLOW)])
        self.store.ingest()
        path.unlink()
        self.store.ingest()
        self.assertEqual(self.store.hops_summary()['orders'], 0)


class HopQueryTests(HopBase):
    def setUp(self):
        super().setUp()
        self.write('ORDERLATENCYSORTED1.csv',
                   [hop_row('900001', SLOW, instance='QKBT2'), hop_row('900002', FAST, segment='BSE')])
        self.store.ingest()

    def test_stages_follow_their_position_in_the_row(self):
        order = [s['stage'] for s in self.store.hops_summary()['stages']]
        self.assertEqual(order[:2], ['46', '79'])

    def test_slowest_orders_rank_by_span(self):
        slowest = self.store.hops_summary()['slowest']
        self.assertEqual([o['order_id'] for o in slowest], ['900001', '900002'])
        self.assertAlmostEqual(slowest[0]['span_us'], 96046.4)
        self.assertEqual((slowest[0]['segment'], slowest[0]['instance'], slowest[0]['stages']), ('NSE', 'QKBT2', 4))

    def test_filters_and_choices(self):
        summary = self.store.hops_summary(segment='BSE')
        self.assertEqual(summary['orders'], 1)
        self.assertEqual(summary['choices'], {'segment': ['BSE', 'NSE'], 'instance': ['QKBT1', 'QKBT2']})
        self.assertEqual(self.store.hops_summary(instance='QKBT2')['orders'], 1)

    def test_order_trace_offsets_from_first_start(self):
        trace = self.store.hop_order('900001')
        self.assertAlmostEqual(trace['span_us'], 96046.4)
        first = trace['stages'][0]
        self.assertEqual((first['stage'], first['start_us'], first['end_us']), ('46', 0.0, 94062.5))
        self.assertTrue(trace['first_start'].startswith('2026-07-17T'))
        self.assertIsNone(self.store.hop_order('999999'))


class HopFacadeTests(unittest.TestCase):
    def test_summary_is_cached_until_the_next_ingest(self):
        from app.file_analytics import FileAnalytics
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = FileAnalytics(root / 'cache.sqlite', root)
            with (root / 'ORDERLATENCYSORTED1.csv').open('w', newline='') as f:
                csv.writer(f).writerow(hop_row('900001', SLOW))
            store.ingest()
            self.assertEqual(store.hops_summary()['orders'], 1)
            with (root / 'ORDERLATENCYSORTED2.csv').open('w', newline='') as f:
                csv.writer(f).writerow(hop_row('900002', FAST))
            self.assertEqual(store.hops_summary()['orders'], 1)  # cached snapshot
            store.ingest()
            self.assertEqual(store.hops_summary()['orders'], 2)  # re-ingest clears it
            self.assertEqual(store.hop_order('900002')['stages'][0]['stage'], '46')


if __name__ == '__main__':
    unittest.main()
