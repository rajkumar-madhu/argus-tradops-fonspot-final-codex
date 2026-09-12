import test from 'node:test';
import assert from 'node:assert/strict';
import {orderPriceText, priceDivisorsText, priceText, time24} from '../lib/format.ts';
test('journal time is explicitly IST regardless of host time zone',()=>{
 const previous=process.env.TZ;
 try {
  for(const zone of ['UTC','America/New_York','Asia/Kolkata']) {
   process.env.TZ=zone;
   assert.equal(time24('2026-06-30T03:44:01Z'),'09:14:01');
  }
 } finally { if(previous === undefined) delete process.env.TZ; else process.env.TZ=previous; }
});

test('prices keep the quarter-paisa ticks of currency futures', () => {
 assert.equal(priceText(10870), '10,870.00');
 assert.equal(priceText(94.8825), '94.8825');
 assert.equal(priceText(94.88), '94.88');
 assert.equal(priceText(null), '—');
 assert.equal(priceText(undefined), '—');
});

test('an unverified price scale shows the recorded value, labelled, never as rupees', () => {
 assert.equal(orderPriceText({ price: 94.88, price_raw: 948800000, price_scale: 'verified' }), '94.88');
 assert.equal(orderPriceText({ price: null, price_raw: 554500, price_scale: 'unverified' }), '554500 raw · unverified scale');
 assert.equal(orderPriceText({ price: null, price_raw: null, price_scale: 'unverified' }), '—');
 assert.equal(orderPriceText({ fill_price: null, fill_price_raw: 554600, price_scale: 'unverified' }, 'fill_price'), '554600 raw · unverified scale');
 assert.equal(orderPriceText({ price: 125.5 }), '125.50', 'rows without a scale field keep their price');
 assert.equal(orderPriceText(null), '—');
});

test('price divisors are grouped by value for the configuration view', () => {
 assert.equal(priceDivisorsText({ price_divisor: 100, price_divisors: { NSE: 100, BSE: 100, NFO: 100, BFO: 100, MCX: 100, CDS: 10000000 } }),
  'NSE, BSE, NFO, BFO, MCX ÷100 · CDS ÷10,000,000');
 assert.equal(priceDivisorsText({ price_divisor: 100 }), '÷100', 'older API without the per-segment map');
 assert.equal(priceDivisorsText(null), '—');
});

test('counts distinguish measured zero from missing', async () => {
 const { fmt } = await import('../lib/format.ts');
 assert.equal(fmt(0), '0');
 assert.equal(fmt(12345), '12,345');
 assert.equal(fmt(undefined), '—');
 assert.equal(fmt(null), '—');
 assert.equal(fmt('x'), '—');
});
