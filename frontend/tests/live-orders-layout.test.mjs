import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const localRequire = (name) => {
    if (!name.startsWith('@/') && !name.startsWith('.')) return require(name);
    const base = name.startsWith('@/')
      ? path.join(root, name.slice(2))
      : path.resolve(path.dirname(file), name);
    const resolved = ['', '.ts', '.tsx']
      .map((ext) => base + ext)
      .find((candidate) => existsSync(candidate));
    return load(resolved);
  };
  new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports);
  return module.exports;
}
const LiveOrders = load(path.join(root, 'components/LiveOrders.tsx')).default;
const items = [
  {
    order_id: 'ORDER-1',
    account: 'AC***12',
    product: 'CNC',
    type: 'LIMIT',
    filled_qty: 5,
    qty: 5,
    status: 'COMPLETE',
  },
  { order_id: 'ORDER-2', status: 'REJECTED' },
  { order_id: 'ORDER-3', status: 'OPEN' },
  { order_id: 'ORDER-4', status: 'PENDING' },
];
const render = (props = {}) =>
  renderToStaticMarkup(
    React.createElement(LiveOrders, {
      initial: { items, count: 900, source: 'elasticsearch' },
      ...props,
    }),
  );

test('feed precedes three investigation panels and secondary disclosures start closed', () => {
  const html = render({ snapshot: true });
  assert.ok(html.indexOf('Order Feed') < html.indexOf('aria-label="Order investigation"'));
  const investigation = html.slice(
    html.indexOf('aria-label="Order investigation"'),
    html.indexOf('Mapped Journal.log fields'),
  );
  assert.ok(investigation.includes('Order Details'));
  assert.ok(investigation.includes('Order Lifecycle'));
  assert.ok(investigation.includes('Related Journal Evidence'));
  assert.doesNotMatch(investigation, /Market Context/);
  assert.match(html, /<details[^>]*>[\s\S]*Market Context/);
  assert.doesNotMatch(html, /<details[^>]*\sopen(?:[\s=>])/);
});

test('six reference KPI tiles count loaded rows when no overview totals are supplied', () => {
  const html = render();
  assert.equal((html.match(/class="kpi-card"/g) || []).length, 6);
  for (const [label, value] of [
    ['Total Orders', 4],
    ['Live Orders', 1],
    ['Executed', 1],
    ['Rejected', 1],
    ['Pending', 1],
  ]) {
    assert.match(html, new RegExp(`${label}</span><b class="kpi-card-value">${value}</b>`));
  }
  // `count` is source-wide; it must never be mixed into loaded-row tiles.
  assert.doesNotMatch(html, />900</);
});

test('overview totals, when supplied, drive the tiles and are labelled as source-wide', () => {
  const html = render({ overview: { orders: 7592, open: 3580, complete: 1927, rejected: 866, pending: 950 } });
  assert.match(html, /Total Orders<\/span><b class="kpi-card-value">7,592<\/b>/);
  assert.match(html, /Unique orders in source/);
  assert.match(html, /Rejected<\/span><b class="kpi-card-value">866<\/b>/);
});

test('feed header owns pause control and retains real account/product/type/fill columns', () => {
  const html = render();
  assert.match(html, /Order Feed[\s\S]*Pause updates[\s\S]*class="data-explorer"/);
  for (const value of [
    'Account',
    'Product',
    'Type',
    'Filled',
    'AC***12',
    'CNC',
    'LIMIT',
    'Export CSV',
    'View ORDER-1',
  ])
    assert.ok(html.includes(value), value);
  assert.ok(html.includes('/logs?q=ORDER-1'));
  assert.ok(html.includes('/rca?order_id=ORDER-1'));
});

test('snapshot and demo never advertise a live stream or offer pause', () => {
  for (const props of [{ snapshot: true }, { initial: { items, source: 'demo' } }]) {
    const html = render(props);
    assert.match(html, /no live stream/);
    assert.doesNotMatch(html, /Pause updates|Stream connected/);
  }
});
