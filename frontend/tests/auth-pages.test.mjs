import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('sign-in and sign-up share the auth shell and a real form submit', () => {
  const signin = read('app/signin/page.tsx');
  const signup = read('app/signup/page.tsx');
  const shell = read('components/AuthShell.tsx');
  for (const src of [signin, signup]) {
    assert.match(src, /<AuthShell/);
    assert.match(src, /<form onSubmit=/);
    assert.match(src, /<AuthModeTabs/);
  }
  assert.match(signin, /href="\/"/);
  assert.doesNotMatch(signin, /View read-only preview/);
  assert.match(signup, /Request access/);
  assert.match(signup, /auth-steps/);
  assert.doesNotMatch(
    shell,
    /from ["']@\/components\/MarketTicker["']/,
    'public auth pages must not fetch the market ticker',
  );
  assert.match(shell, /auth-banner/);
  assert.match(shell, /auth-mobile-brand/);
});

test('auth pages use the display face and dashboard signal colour', () => {
  const css = read('app/globals.css');
  const auth = css.slice(css.indexOf('/* ── Authentication v2'));
  assert.match(auth, /\.auth-copy h1 \{[\s\S]*?font-family: var\(--f-display\)/);
  assert.match(auth, /\.auth-page \{[\s\S]*?--signal: #1b6f80/i);
  assert.match(auth, /\.auth-chip\.sso \{[\s\S]*?background: var\(--signal-soft\)/);
});

test('forgot-password recovers through SSO, not a fake reset email', () => {
  const src = read('app/forgot-password/page.tsx');
  assert.match(src, /from ['"]@\/lib\/oidc['"]/);
  assert.match(src, /login\(/);
  assert.doesNotMatch(src, /Send reset link/);
});
