# Login and dashboard investigation — 13 September 2026

Status: focused implementation, local functional validation and linux/amd64 container builds completed. No image was pushed and no
UAT resource was changed. This report distinguishes reproduced application
defects from the original UAT symptom, whose account-specific trigger has not
been established without an authenticated UAT reproduction.

## Repository and scope

The clean starting checkout was `main` at `77a3098`. UAT was running the older
`uat-20260913-0082bb0-r1` frontend and backend images. Existing source already
contained the follow-up improvement that names missing roles in API 403 errors;
the deployed images predate that change. Work is limited to login completion,
session restoration, protected routing, API response handling, CORS and tests.
The application remains read-only toward trading systems.

## Reproduced defects and evidence

1. `frontend/lib/oidc.ts:completeLogin` treated an IdP token response as success
   without checking `/api/auth/me`. A syntactically valid token rejected by the
   API still produced a dashboard redirect. A focused test failed before the
   change and passes after it. The callback now verifies the authenticated-user
   contract before saving the session.
2. `frontend/lib/session.ts:setToken` did not detect a rejected cookie. A blocked
   or oversized cookie silently disappeared, while the callback continued to a
   dashboard whose server requests carried no bearer token. A rejected-cookie
   regression test failed before the change and passes after it. Persistence is
   now checked, with an actionable error instead of false success. Oversized
   tokens are explicitly rejected; this change does not introduce cookie chunks
   or a new session backend.
3. No server-side page guard existed. An unauthenticated UAT browser request to
   `/dashboard` rendered the shell and a signed-out data panel. Backend logs
   confirmed 401 data requests. `frontend/middleware.ts` now verifies the user
   with the API before rendering a protected page, redirects 401 to sign-in,
   returns a visible 403 for disallowed roles, and returns 503 without deleting
   the cookie when verification is unavailable. Direct HTML denial responses
   preserve status: an initial App Router rewrite rendered the correct error
   page but returned 200, caught by HTTP integration tests.
4. `backend/app/main.py` split `CORS_ORIGINS` only on commas. Live UAT's ConfigMap
   contains a JSON array. With that format the local browser's cross-origin auth
   config request returned 200 without `Access-Control-Allow-Origin`, and the
   sign-in page displayed “Failed to fetch.” The new
   `backend/app/config.py:parse_cors_origins` supports both formats, rejects
   malformed/wildcard entries, and preserves explicit-origin credentials rules.
   After restarting the local fixture with the same JSON format, Chrome reached
   the dashboard through SSO. UAT's current same-host `/api` topology avoids
   CORS for normal requests, so this is not by itself proof of the original UAT
   login failure.
5. Callback state was optional when absent in session storage; return paths were
   not restricted to application pages; malformed token objects could be saved;
   the callback effect could exchange a single-use code twice under development
   Strict Mode. These are now checked, and the callback shares one completion
   promise across effect replay.
6. Enabled self-registration did not create a PKCE verifier before using the
   shared callback. It now starts the same state/PKCE flow as login. UAT reports
   registration disabled; account provisioning remains an administrator task.
7. `frontend/lib/api.ts:getJSON` returned the JSON promise without awaiting it
   inside its catch, allowing malformed JSON to reject outside the widget error
   contract. Null payloads also reached views that expect objects. Both now
   produce `_error`; zero counts and empty arrays remain successful data.
8. `frontend/components/MarketTicker.tsx` omitted bearer headers on protected
   reads, including when mounted on public authentication pages. It now attaches
   authentication, skips public/expired sessions, and avoids market requests for
   roles without market access. Sidebar signal reads also skip disallowed routes
   after session restoration. Three ticker-effect regression tests cover these
   cases.

The browser exercises used synthetic identities and an ephemeral in-memory RSA
key. No real password, token, cookie, private key or Kubernetes Secret value was
read, copied or changed. The exact original UAT login trigger remains unverified;
the report must not be read as a completed UAT deployment or account repair.

## Authentication and routing after the change

The frontend is Next.js 15 App Router / React 19, with local React state and
server-component data fetching. The backend is FastAPI. This is not an NGINX
SPA: Next.js owns server rendering, nested routes, 404s and client navigation.
There is no custom password-login, refresh-token or backend logout endpoint.

1. `/` is public. `/signin` reads public `GET /api/auth/config`.
2. Continue with SSO creates state and a verifier in session storage, then opens
   Keycloak's authorization endpoint with S256 PKCE.
3. Keycloak authenticates the user and returns an authorization code to
   `<frontend-origin>/auth/callback`.
4. The callback checks state and verifier, exchanges the code at Keycloak, checks
   token shape/expiry and calls `GET /api/auth/me` with the bearer token.
5. The API verifies RS256, issuer and expiry, with audience verification governed
   by its existing `KEYCLOAK_VERIFY_AUDIENCE` setting. Roles come from the realm
   and configured client. No authorization is granted by the browser's decoded
   claims.
6. Only after successful API verification does the browser save and confirm the
   `tradeops_token` cookie and perform a full navigation to a safe application
   return path, defaulting to `/dashboard`.
7. Middleware forwards the cookie to `/api/auth/me` through `INTERNAL_API_URL`
   and checks the existing `ROLE_ROUTES` allowlist. The backend continues to guard
   every data endpoint independently.
8. Server components forward the cookie as an Authorization header. Client
   requests use the runtime-injected browser API URL. Expired sessions redirect
   to sign-in on the next protected request or the client expiry/focus check.
9. Logout clears the cookie and uses the configured Keycloak end-session URL,
   returning to `/signin`; if bootstrap fails, it still signs out locally.

Cookie properties remain host-only, `Path=/`, bounded `Max-Age`, Secure over
HTTPS, SameSite=None over HTTPS and Lax for local HTTP. It is intentionally
JavaScript-readable for existing client requests and SSE. No refresh token is
persisted. A change to HttpOnly sessions would require a separate proxy/session
architecture and is not included here.

## Protected routes and primary API contracts

All rows also call `/api/auth/me` through the guard. `super_admin` can access
every route. Other roles below: T=`trading_ops`, R=`risk`, I=`infra_sre`, A=`auditor`.
Secondary dashboard widgets keep their own API permissions; access to a page
does not grant permission to every optional data source on it.

| Page | Other allowed roles | Primary API and permission |
|---|---|---|
| `/dashboard` | T, R, I, A | `/api/overview` — `dashboard:read` |
| `/orders`, `/orders/[orderId]` | T, A | `/api/orders`, `/api/orders/{id}/lifecycle`; journal equivalents — `orders:read` |
| `/order-book` | T, A | `/api/order-book` — `orders:read` |
| `/trades` | T, A | `/api/trades` — `trades:read` |
| `/positions` | T, R, A | `/api/positions` — `positions:read`; optional trades require `trades:read` |
| `/holdings` | T, R, A | `/api/holdings` — `holdings:read` |
| `/rejections` | T, R, A | `/api/rejections` — `rejections:read`; optional orders require `orders:read` |
| `/rca` | T, R, I, A | `/api/rca/order/{id}` — `rca:read`; supporting rejection/order/log reads retain their permissions |
| `/market-data` | T, R, A | `/api/market-data` — `market:read` |
| `/exchange` | T, I, A | `/api/exchanges`, `/api/exchanges/yel` — `exchange:read` |
| `/sessions` | T, I, A | `/api/sessions`, `/api/sessions/summary` — `sessions:read` |
| `/risk` | R, A | `/api/risk` — `risk:read` |
| `/infra`, `/infra/[device]` | I, A | `/api/infra` — `infra:read`; `/health/ready` is public |
| `/logs` | T, I, A | `/api/journal/explore` — permission by message type; raw `/api/logs/search` is `logs:read` |
| `/incidents` | I, A | `/api/incidents`, `/api/incidents/derived` — `incidents:read` |
| `/reports` | A | `/api/reports` — `reports:read` |
| `/order-latency` | T, I, A | `/api/files/latency`, fallback `/api/order-latency` — `latency:read` |
| `/queue-monitor` | T, I, A | `/api/files/queues` — `latency:read` |
| `/data-quality` | T, R, I, A | `/api/files/sources` — `dashboard:read` |
| `/configuration` | none | `/api/config`, `/api/event-bus/status`, `/api/elk/status`, and supporting health/source reads |

The dashboard also reads orders, rejections, exchanges/YEL, file latency/queues,
infra, readiness, sessions, masked exchange messages and freshness. Missing
optional sources remain visibly unavailable. File-less fixture requests to the
journal/CSV routes are deliberate 503 coverage, not evidence of live records.

## Relevant environment and URL contract

| Setting | Meaning / observed UAT value |
|---|---|
| `API_URL` | Browser-reachable origin injected per request; UAT `https://tradeops-uat.finspot.in` |
| `INTERNAL_API_URL` | Server/middleware API origin; UAT `http://argus-tradeops-backend:8000` |
| `NEXT_PUBLIC_API_URL` | Build-time local fallback only; not the deployed runtime configuration |
| `KEYCLOAK_URL` | UAT `https://keycloak.finspot.in` |
| `KEYCLOAK_REALM` | UAT `Devops-common-cicd` |
| `KEYCLOAK_CLIENT_ID` | UAT `tradeops-web` |
| `KEYCLOAK_VERIFY_AUDIENCE` | UAT currently `false`; this investigation did not weaken or change it. Fixture tests use `true`. Enabling it requires confirming client audience mappers first. |
| `AUTH_DISABLED` | UAT `false`; never enable to resolve login issues |
| `CORS_ORIGINS` | UAT JSON array containing the frontend HTTPS origin; parser now supports this and comma-separated origins |
| `ALLOW_SIGNUP` | Controls public registration availability; confirm source setting and IdP policy together |
| `TRADEOPS_ENV`, `TRADEOPS_DEMO_MODE` | Production validation and data mode; local fixture explicitly uses synthetic data with authentication enabled |
| `NEXT_PUBLIC_KEYCLOAK_*` | Legacy `oidcLoginUrl` helper only; current sign-in gets the contract from `/api/auth/config` |

Callback and post-logout URLs are derived from `window.location.origin`; cookies
have no configurable Domain override. API endpoints already contain `/api`.
Configure origins without appending `/api`, otherwise existing callers produce
`/api/api/...`. No Ingress rewrite is required.

## Live UAT / GitOps observations

Read-only checks used context `fs-prod-cp-ps`, namespace `argus-tradeops-uat`.

- Frontend and backend images: `harbor.finspot.in/common-application/tradeops-{frontend,backend}:uat-20260913-0082bb0-r1`.
- Ingress routes `/api` on the frontend host to backend:8000, `/` to
  frontend:3000, and the API host `/` to backend:8000. No rewrite annotation.
- Last-applied Ingress rules omit the same-host `/api` path. Preserve the live
  path in the owning repository before sync; do not restore the obsolete rules.
- Argo application `argus-tradeops-uat` points to
  `https://github.com/vediyappanm05/finspot-prod-devops.git`, path
  `apps/argus-tradeops-uat`, target revision `HEAD`. Observed health was Healthy,
  sync status Unknown. The current GitHub session could not read that source.
- The local `deploy/uat` is a different stack (`tradeops-uat`, different names and
  GitLab image references). **Do not apply that overlay to the actual UAT.**
- One frontend and one backend replica; no HPA or PDB. The reference base has
  redundancy/security/probe settings that are not present in live UAT.
- No startup probes. Backend readiness/liveness use `/health`; frontend probes
  use `/`. Prefer the existing frontend `/healthz` contract when updating GitOps.
- Frontend/backend each request 100m CPU / 256Mi memory, limited to 500m / 512Mi.
  Security contexts are absent; compare restricted contexts in `k8s/` before
  adopting them, especially required writable cache/temporary mounts.
- PostgreSQL is a single Deployment with a Bound ReadWriteOnce PVC and a rolling
  update strategy. Persistence exists, but storage recovery/backup/HA are not
  proved. Do not scale or redeploy it as part of this frontend/auth fix.
- Three ingress NetworkPolicies allow in-namespace and approved external sources
  and deny other ingress; no egress isolation was shown by these policies.
- Backend JWKS fetch succeeded with two public signing keys. Recent safe log
  aggregation showed expected 401s for unauthenticated data requests, and health
  200s. Neither proves an authenticated user's dashboard.

## Validation and remaining work

Completed before the full-validation run:

- Baseline `npm test`: 185 passed; baseline production build: exit 0.
- Before-fix callback regressions: six failed, one passed; after fix: seven pass.
- Guard tests: seven pass. Malformed/null API-body checks: two pass.
- Real RS256 HTTP tests: seven pass. CORS/RS256 combined focused run: 11 pass.
- First HTTP integration: 27 pass, two fail because denied pages returned 200;
  corrected code subsequently returned HTTP 403 with the permission body.
- Chrome local fixture: successful SSO → dashboard, refresh retains sign-in,
  logout → `/signin`, safe invalid-sign-in error, short session automatically
  returns to `/signin?reason=expired&returnTo=%2Fdashboard`.
- Full validation before the final ticker adjustment: 201 frontend and 189
  backend tests passed; frontend production build and both Docker builds passed.
  An initial standalone type check found a stale generated route after deleting
  the experimental rewrite page; the build regenerated types and the subsequent
  standalone type check passed. This was a generated-cache issue, not a skipped
  source error.
- Both `deploy/uat` and `deploy/prod` rendered and passed strict kubeconform
  validation: 19 valid resources each, zero invalid/errors/skipped. Local image
  builds are not published release digests; UAT nodes report amd64.
- WebBridge was requested and its daemon started. The extension first was absent
  and subsequently reported no current window. Chrome's available browser
  interface was used for the local rendered checks.

Latest completed validation:

| Check | Result | Exit code |
|---|---|---|
| Final frontend suite | 204 passed | 0 |
| Final frontend production build | passed | 0 |
| Final standalone TypeScript check | passed | 0 |
| Backend suite | 189 passed | 0 |
| Production HTTP/JWT integration | 34 passed, including all protected routes, loading/empty/error/recovery, 403, logout and expiry | 0 |
| Local backend and final frontend Docker builds | passed on host-default platform | 0 |
| Backend and frontend linux/amd64 builds | both passed; architecture inspected | 0 |
| UAT and production reference manifests | 19 valid each, no errors or skipped schemas | 0 |

Production Chrome also rendered the public landing page and the disabled-signup
state (“Access is provisioned”), with no account creation attempted.
Production Chrome checks rendered the dashboard plus all 21 other protected
paths in the route table, including both nested fixture paths. No captured
console warnings/errors appeared during that route sweep. Successful SSO,
refresh and logout worked against the production Next.js server and real API
JWT verification. A risk-role user directly opening `/orders` received the
visible permission page with the appropriate role names.

Fixture state checks showed the loading observation panel, zero counts with
explicit no-orders/rejections/exchanges messages, an overview-503 error panel
without counts, and an auth-service-503 page that preserved the session.
Restoring the auth service and refreshing reopened the dashboard without login.
Dashboard and sign-in screenshots at 390×844 confirmed readable mobile layout;
the viewport override was reset afterward. These are fixture observations,
not evidence that real market data or external dependencies are connected.

Final diff review: `git diff --check` passed (exit 0); AGENTS/CLAUDE mirrors
match. All 27 changed/new files were reviewed; a focused credential-pattern
scan found no literal JWTs, private keys or recognized access-token patterns.
This is bounded diff review, not a comprehensive security audit.

Target-platform validation: backend and frontend `linux/amd64` builds and
architecture inspections passed (exit 0), recorded in job
`job-mtzdtd8c-b7d95536`. Local tags are
`argus-tradeops-auth-backend:20260913-amd64` and
`argus-tradeops-auth-frontend:20260913-amd64`. These are local images; no
registry release digest has been published. Real
credentialed UAT login, IdP invalid-password behavior, live data and deployment
remain unverified. The fixture emulates IdP rejection; it does not test a real
Keycloak password policy. No frontend linter or backend lint/type-check command
is configured by the repository's documented checks.

## Acceptance audit and evidence limits

| Requirement | Evidence / disposition |
|---|---|
| Landing page | Production Chrome rendered `/` and its sign-in/get-started navigation. |
| Intended signup behavior | UAT registration is disabled; local production UI displays “Access is provisioned.” Enabled registration shares PKCE setup, but a real account-creation flow was not exercised. |
| Login, redirect and refresh | Production Chrome and signed-RS256 HTTP fixture passed. Callback requires API acceptance and cookie persistence before redirecting. Real UAT account outcome remains unverified. |
| Invalid login, expiry, logout | Automated fixture checks plus local Chrome rejection/expiry/logout observations passed. No actual IdP password was entered. |
| Every protected route | 22 paths rendered in production Chrome and HTTP checks; nested resource identifiers were synthetic. 401 and role-based 403 were checked independently. |
| Correct API and data | Runtime origins, `/api` prefixes, internal service endpoint and Ingress routing inspected. Local cross-origin requests and API authentication passed. Actual ES/Postgres/Redis trading-data paths were not integration-tested here. |
| Loading, empty and error states | Existing route loading/error boundaries inspected; 34-case integration suite covers delayed overview, empty lists, overview 503 and auth-service recovery. Browser observations confirm these visible states. |
| No blank dashboard / console failure | All route headings rendered; no captured warnings/errors during the normal production Chrome route sweep. Deliberately injected 503s are expected test failures, not a claim of zero failed requests under outages. |
| Tests and builds | All listed suites/builds passed, including both linux/amd64 image builds and architecture inspections. |
| Manifest validation / GitOps readiness | Reference overlays validate. Live owner/topology/drift reviewed read-only. Exact external file edits and a deployable published digest require access to the owning repository and a reviewed release. No deployment performed. |
| Focused implementation / safety | Read-only trading invariant retained; no credential/Secret values, schema changes, live settings changes or auth bypass introduced. Diff and documentation mirrors checked. |

The token exchange is `POST <issuer>/protocol/openid-connect/token` with
`application/x-www-form-urlencoded` fields `grant_type=authorization_code`,
`code`, `redirect_uri`, `client_id`, and `code_verifier`. A successful fixture
response is HTTP 200 JSON containing `access_token`, `token_type=Bearer`, and
`expires_in`; values were kept private. The application then calls
`GET /api/auth/me`, whose normalized object includes `sub`, `roles` and
`permissions`. The browser writes the session cookie; this flow does not depend
on a backend `Set-Cookie` response. Missing/invalid credentials at the API yield
401; a verified identity lacking the requested permission yields 403.

Next.js serves the pages directly, so no SPA fallback rewrite was added.
Callback/logout origins are browser-derived rather than constructed from
backend forwarded headers. Backend launch configuration has no custom trusted
proxy override in this patch. Live ingress/controller forwarding and real
Keycloak redirect-URI settings still need the credentialed UAT acceptance
check; they were not changed speculatively.

## Changed files and reproducible local checks

- Authentication: `frontend/lib/oidc.ts`, `session.ts`, `auth-routing.ts`,
  `auth-response.ts`, `frontend/middleware.ts`, and the callback/signin/signup
  pages.
- Authenticated reads/session lifecycle: `frontend/components/Shell.tsx`,
  `MarketTicker.tsx`, `frontend/lib/api.ts`, `frontend/mock-api.local.mjs`.
- CORS: `backend/app/config.py`, `backend/app/main.py`.
- Regression coverage: `backend/tests/test_cors_origins.py`,
  `test_login_contract.py`; `frontend/tests/api-response.test.mjs`,
  `auth-callback.test.mjs`, `auth-routing.test.mjs`,
  `market-ticker-auth.test.mjs`, `helpers/browser-modules.mjs`;
  `scripts/auth-fixture.py`, `scripts/test-auth-runtime.mjs`.
- Documentation: this report, README.md, AGENTS.md and CLAUDE.md.

From the repository root, use Python 3.12 and the installed checkout environment
for backend tests. Python 3.14 dependency setup failed because the pinned
psycopg-binary wheel was unavailable; the replacement Python 3.12 setup passed.
No dependency pins were changed.

```bash
PYTHON_DOTENV_DISABLED=1 \
DATABASE_URL=postgresql+psycopg://fixture@127.0.0.1:1/fixture \
backend/.venv/bin/python scripts/test-backend.py

# In a separate terminal; loopback-only synthetic identity provider/API.
backend/.venv/bin/python scripts/auth-fixture.py --port 18103 --ui-port 13103

# In frontend/, with dependencies already installed:
npm test
npm run build
./node_modules/.bin/tsc --noEmit --incremental false
API_URL=http://127.0.0.1:18103 INTERNAL_API_URL=http://127.0.0.1:18103 \
node node_modules/next/dist/bin/next start -p 13103 -H 127.0.0.1

# From the root, with those two servers running:
node scripts/test-auth-runtime.mjs
```

Use `http://localhost:13103` in Chrome. The fixture provides labelled synthetic
roles and rejects invalid/audience-mismatched sessions. Its state endpoint is
only a local test control. Do not include the fixture in a release deployment.
The local test API and production frontend were stopped cleanly after checks.
The report's build evidence comes from this working tree, not a committed or
pushed release; rebuilding a reviewed commit remains a release prerequisite.

## Rollout and rollback — not executed

The application changes must first be committed/reviewed and pass CI. The source
commit, pushed digests, and owning GitOps release commit do not exist yet for
this working tree. The following commands deliberately require those reviewed
values; no digest or repository filename is invented. Do not run the sync step
while Argo's source is unreadable or its sync status is Unknown.

Prepare the release in the owning `finspot-prod-devops` repository under
`apps/argus-tradeops-uat`:

- Update only the backend/frontend Deployment images to the tested Harbor
  digests, preserving `API_URL=https://tradeops-uat.finspot.in` and
  `INTERNAL_API_URL=http://argus-tradeops-backend:8000`.
- Preserve `/api` Prefix → `argus-tradeops-backend:8000` before `/` Prefix →
  `argus-tradeops-frontend:3000` on `tradeops-uat.finspot.in`; preserve the separate
  API hostname route and all existing TLS settings. No rewrite-target.
- Keep `AUTH_DISABLED=false`, explicit CORS origins and existing Secret
  references. No token/cookie/Secret value belongs in the source change.
- Review migration prerequisites through the existing owner workflow. This
  patch has no database/schema changes. Do not apply this checkout's differently
  named migration Job or data-service resources to actual UAT.
- Keep availability, storage and audience-mapper changes separate from this
  login release; they need their own operational review.

After the source and GitOps changes are reviewed, published, and synchronized
with the intended release branch, the bounded rollout commands are:

```bash
# Operator supplies the full, reviewed commit from the owning GitOps repository.
: "${GITOPS_RELEASE_COMMIT:?Set the reviewed GitOps release commit}"

argocd app sync argus-tradeops-uat --revision "$GITOPS_RELEASE_COMMIT" \
  --resource apps:Deployment:argus-tradeops-frontend \
  --resource apps:Deployment:argus-tradeops-backend \
  --resource networking.k8s.io:Ingress:argus-tradeops-ingress

kubectl --context fs-prod-cp-ps -n argus-tradeops-uat \
  rollout status deployment/argus-tradeops-backend --timeout=180s
kubectl --context fs-prod-cp-ps -n argus-tradeops-uat \
  rollout status deployment/argus-tradeops-frontend --timeout=180s
kubectl --context fs-prod-cp-ps -n argus-tradeops-uat get deployments \
  -o 'custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,IMAGE:.spec.template.spec.containers[*].image'
```

Rollback is a new reviewed GitOps commit restoring the last working image refs,
while retaining the working same-host `/api` route. Do not revert the ingress to
its outdated last-applied state and do not use `kubectl rollout undo` against
Argo-managed Deployments. The previously observed rollback image refs are:

```text
harbor.finspot.in/common-application/tradeops-backend:uat-20260913-0082bb0-r1
harbor.finspot.in/common-application/tradeops-frontend:uat-20260913-0082bb0-r1
```

After preparing/pushing that image-only rollback commit:

```bash
: "${GITOPS_ROLLBACK_COMMIT:?Set the reviewed image-only rollback commit}"
argocd app sync argus-tradeops-uat --revision "$GITOPS_ROLLBACK_COMMIT" \
  --resource apps:Deployment:argus-tradeops-frontend \
  --resource apps:Deployment:argus-tradeops-backend
kubectl --context fs-prod-cp-ps -n argus-tradeops-uat \
  rollout status deployment/argus-tradeops-backend --timeout=180s
kubectl --context fs-prod-cp-ps -n argus-tradeops-uat \
  rollout status deployment/argus-tradeops-frontend --timeout=180s
```

These are operational commands, not evidence that the external repository was
edited or that a release is ready to sync. Actual file-level GitOps edit commands
remain dependent on access to its source layout.

## Manual UAT acceptance checklist

1. Open `/` and `/signin` in a fresh browser session. The landing page and auth
   configuration must load from the UAT frontend origin.
2. Attempt a protected direct URL before signing in: redirect to `/signin` with a
   safe return path; no dashboard data.
3. Use an approved UAT account interactively. Do not export credentials, browser
   storage, HAR response bodies or callback query strings. Invalid credentials
   must show the IdP's safe error; successful login must reach the intended view.
4. Check `/api/auth/me` and overview response **statuses**, without copying token,
   cookie or user fields. Confirm API verification succeeds, then refresh.
5. Exercise every route permitted to the account. With a narrower test role,
   directly open a disallowed route and verify the permission state, not a login
   loop. Do not grant broader roles merely to bypass a failure.
6. Confirm optional missing data shows unavailable/empty/error appropriately;
   check mobile layout, console exceptions, chunk loads and failed requests.
7. Let the approved session expire; verify safe sign-in redirection and preserved
   destination. Verify logout returns to `/signin`, then protected refresh fails.
8. Verify live image digests and source freshness after rollout. Do not count
   health, readiness, login or an image push as evidence of live trading data.
