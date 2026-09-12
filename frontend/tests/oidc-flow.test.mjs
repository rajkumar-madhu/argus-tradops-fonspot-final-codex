import test from "node:test";
import assert from "node:assert/strict";
import { authorizeParams, tokenErrorMessage } from "../lib/oidc-flow.ts";

const base = { clientId: "tradeops", redirectUri: "https://tradeops-uat.finspot.in/auth/callback", state: "s1", challenge: "c1" };

test("the work email reaches Keycloak as login_hint", () => {
  const p = authorizeParams({ ...base, loginHint: "  rajkumar.madhu@finspot.in " });
  assert.equal(p.get("login_hint"), "rajkumar.madhu@finspot.in");
  assert.equal(p.get("code_challenge_method"), "S256");
  assert.equal(p.get("client_id"), "tradeops");
});

test("a blank or malformed email sends no login_hint", () => {
  assert.equal(authorizeParams({ ...base, loginHint: "" }).has("login_hint"), false);
  assert.equal(authorizeParams({ ...base, loginHint: "   " }).has("login_hint"), false);
  assert.equal(authorizeParams(base).has("login_hint"), false);
  assert.equal(authorizeParams({ ...base, loginHint: "x".repeat(300) + "@a.b" }).has("login_hint"), false, "oversized hints are dropped");
});

test("a confidential Keycloak client is explained, not reported as a bare 401", () => {
  const msg = tokenErrorMessage(401, '{"error":"unauthorized_client","error_description":"Invalid client or Invalid client credentials"}', "tradeops");
  assert.match(msg, /Invalid client or Invalid client credentials/);
  assert.match(msg, /Client authentication/);
  assert.match(msg, /tradeops/);
});

test("other token errors carry Keycloak's own description", () => {
  assert.match(tokenErrorMessage(400, '{"error":"invalid_grant","error_description":"Code not valid"}', "c"), /Code not valid/);
  assert.equal(tokenErrorMessage(502, "<html>Bad gateway</html>", "c"), "Token exchange failed (HTTP 502)");
  assert.equal(tokenErrorMessage(500, "", "c"), "Token exchange failed (HTTP 500)");
});
