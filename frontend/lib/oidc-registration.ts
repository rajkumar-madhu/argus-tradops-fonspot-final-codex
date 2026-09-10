export type RegistrationAuthConfig = {
  auth_disabled: boolean;
  registration_allowed?: boolean;
  authorization_endpoint: string;
  client_id: string;
};

/** Keycloak self-registration URL, or null when the realm must not be sent there. */
export function keycloakRegistrationUrl(
  cfg: RegistrationAuthConfig,
  origin: string,
  returnTo = "/dashboard",
): string | null {
  if (cfg.auth_disabled || cfg.registration_allowed !== true || !cfg.authorization_endpoint || !cfg.client_id) {
    return null;
  }
  const base = cfg.authorization_endpoint.replace(/\/auth$/, "/registrations");
  const params = new URLSearchParams({
    client_id: cfg.client_id,
    redirect_uri: `${origin}/auth/callback`,
    response_type: "code",
    scope: "openid profile email",
    state: returnTo,
  });
  return `${base}?${params.toString()}`;
}
