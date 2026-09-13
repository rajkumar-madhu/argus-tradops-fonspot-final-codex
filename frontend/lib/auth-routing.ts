import { ROLE_ROUTES } from './auth';

const routes = new Set([...Object.values(ROLE_ROUTES).flat().filter(path => path !== '*'), '/configuration']);

/** Canonical route used for both direct requests and nested resource pages. */
export function protectedRoute(pathname: string): string | null {
  const path = pathname.replace(/\/$/, '');
  if (routes.has(path)) return path;
  for (const parent of ['/orders', '/infra']) {
    if (path.startsWith(`${parent}/`)) return parent;
  }
  return null;
}

/** Return paths are application navigation, never arbitrary URLs from storage/query. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return '/dashboard';
  try {
    const url = new URL(value, 'https://tradeops.invalid');
    if (url.origin !== 'https://tradeops.invalid' || !protectedRoute(url.pathname)) return '/dashboard';
    return `${url.pathname}${url.search}`;
  } catch {
    return '/dashboard';
  }
}
