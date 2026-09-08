export function apiError(data: { _error?: string } | null | undefined): string | null {
  return data?._error || null;
}
