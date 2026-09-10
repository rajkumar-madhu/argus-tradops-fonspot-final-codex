/** Exact operational states: "disconnected" and "unhealthy" must never match success. */
export function healthTone(value: unknown): 'good' | 'warn' | 'bad' | 'neutral' {
 const state=String(value??'').trim().toLowerCase();
 if(['healthy','connected','loaded','ready','ok','up','complete','completed','active','live','success'].includes(state))return 'good';
 if(['warning','warn','pending','trigger_pending','degraded','watch','partial data','stale snapshot'].includes(state))return 'warn';
 if(['unhealthy','disconnected','unavailable','down','failed','failure','rejected','error'].includes(state))return 'bad';
 return 'neutral';
}
