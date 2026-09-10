import test from "node:test";
import assert from "node:assert/strict";
import { keycloakRegistrationUrl } from "../lib/oidc-registration.ts";

const ssoConfig = {
  auth_disabled: false,
  issuer: "https://keycloak.finspot.in/realms/Devops-common-cicd",
  authorization_endpoint: "https://keycloak.finspot.in/realms/Devops-common-cicd/protocol/openid-connect/auth",
  token_endpoint: "https://keycloak.finspot.in/realms/Devops-common-cicd/protocol/openid-connect/token",
  end_session_endpoint: "https://keycloak.finspot.in/realms/Devops-common-cicd/protocol/openid-connect/logout",
  client_id: "tradeops-web",
};

test("Keycloak registration URL is null when the realm does not allow registration", () => {
  assert.equal(keycloakRegistrationUrl({ ...ssoConfig, registration_allowed: false }, "https://tradeops-uat.finspot.in"), null);
});

test("Keycloak registration URL is null when registration_allowed is omitted", () => {
  assert.equal(keycloakRegistrationUrl(ssoConfig, "https://tradeops-uat.finspot.in"), null);
});

test("Keycloak registration URL is built only when registration_allowed is true", () => {
  const url = keycloakRegistrationUrl({ ...ssoConfig, registration_allowed: true }, "https://tradeops-uat.finspot.in");
  assert.match(url ?? "", /\/openid-connect\/registrations\?/);
  assert.match(url ?? "", /client_id=tradeops-web/);
  assert.match(url ?? "", /redirect_uri=https%3A%2F%2Ftradeops-uat.finspot.in%2Fauth%2Fcallback/);
});
