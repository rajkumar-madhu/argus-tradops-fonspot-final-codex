import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const page = readFileSync(path.join(root, 'app/dashboard/page.tsx'), 'utf8');
const view = readFileSync(path.join(root, 'components/DashboardView.tsx'), 'utf8');

test('CSV coverage is a quiet banner inside Mission Control, not above the page', () => {
  assert.doesNotMatch(page, /dashboard-source-strip/);
  assert.match(page, /fileSources=\{fileSources\}/);
  assert.ok(
    view.indexOf('mission-charts') < view.indexOf('dashboard-source-strip'),
    'file source strip must follow the chart row',
  );
  assert.ok(
    view.indexOf('dashboard-source-strip') < view.indexOf('dashboard-footnote'),
    'file source strip stays above the evidence footnote',
  );
});
