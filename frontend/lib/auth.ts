export type TradeOpsRole = "super_admin" | "trading_ops" | "risk" | "infra_sre" | "auditor";
export const ROLE_ROUTES: Record<TradeOpsRole, string[]> = {
  super_admin: ["*"],
  trading_ops: ["/data-quality","/dashboard","/orders","/order-book","/trades","/positions","/holdings","/rejections","/rca","/market-data","/exchange","/sessions","/logs","/order-latency","/queue-monitor"],
  risk: ["/data-quality","/dashboard","/positions","/holdings","/rejections","/rca","/market-data","/risk"],
  infra_sre: ["/data-quality","/dashboard","/exchange","/sessions","/infra","/logs","/incidents","/rca","/order-latency","/queue-monitor"],
  auditor: ["/data-quality","/dashboard","/orders","/order-book","/trades","/positions","/holdings","/rejections","/rca","/market-data","/exchange","/sessions","/risk","/infra","/logs","/incidents","/reports","/order-latency","/queue-monitor"],
};
export function canSee(path: string, roles: string[]) {
  return roles.some(r => ROLE_ROUTES[r as TradeOpsRole]?.includes("*") || ROLE_ROUTES[r as TradeOpsRole]?.includes(path));
}
export function oidcLoginUrl() {
  const base=process.env.NEXT_PUBLIC_KEYCLOAK_URL, realm=process.env.NEXT_PUBLIC_KEYCLOAK_REALM, client=process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID;
  if(!base||!realm||!client) return "/signin";
  const redirect=typeof window!=="undefined" ? `${window.location.origin}/dashboard` : "";
  return `${base}/realms/${realm}/protocol/openid-connect/auth?client_id=${encodeURIComponent(client)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=openid%20profile%20email`;
}
