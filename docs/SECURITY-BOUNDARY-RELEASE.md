# Security boundary release

## Required operations before production rollout

- Configure the same strong `GITHUB_WEBHOOK_SECRET` in GitHub Actions secrets and
  the server daemon environment. Never commit the value. Deployment fails closed
  without it. The webhook is HTTPS-only from CI.
- Configure `CLOUDFLARE_R2_PRIVATE_BUCKET_NAME` as a **separate bucket** from
  `CLOUDFLARE_R2_BUCKET_NAME`. Disable public access, r2.dev, and custom domains for
  the private bucket. Give the server credential access to that bucket. No code
  review can establish the external bucket policy; verify anonymous GET fails.
- Move existing recruitment objects from the public bucket to the private one
  (preserve keys), then remove the publicly accessible originals after verifying
  private copies. Existing public URLs must be replaced with private keys in the
  application records. Back up metadata before making changes.
- Restart the autodeploy service using the updated daemon through existing secure
  administrative access. An old running daemon does not acquire these fixes just
  because its source file changed. Keep port 9000 inaccessible to the public;
  Nginx should be its only ingress.
- Review existing negative protected balances and duplicate quotation references
  before migration. The migration intentionally fails rather than rewriting
  historical money or deleting bookings.

## Behavior changes

Payable quotes require authentication and complete route coordinates for rides,
airport shuttles and deliveries. `customerId` in request JSON is ignored. Requote
legacy quotes missing ownership or routes. Client distance is never authoritative.
Route distance currently uses the documented server-side Haversine × 1.35 fallback;
this is an estimate, not a road-routing guarantee.

Quote consumption and booking insertion share one database transaction. Failed
insertion restores quote availability. Single-use quotes reject a second booking;
clients should fetch the original booking rather than submit a new booking on
retry. Historical amounts are retained.

Private download tickets require admin permission or an exact document reference
in the requesting user's recruitment application. Raw object-key knowledge is
insufficient. Public PUT tickets now return HTTP 410. Admin media uses the bounded
validated upload relay; recruitment forms attach bytes to the application and the
server stores the validated documents privately. The maximum combined recruitment
attachment size is 20 MiB; individual form attachments are limited to 5 MiB.
Basic file signatures are checked; this is not malware scanning.

Tokens require access scope, user ID, role, expiry and the current session version.
HTTP and socket packet validation read authoritative user state. Long-lived socket
and SSE connections recheck revocation at one-second intervals and close on expiry.
Old password-setup tokens without a session version must be replaced through OTP
login. Setup claims and password updates commit together.

The dashboard also upgrades Next.js from 14.2.15 to 15.5.28 and overrides
PostCSS to the patched direct dependency. Its Node image is aligned to Node 22.
The backend lockfile also updates vulnerable Express transitive dependencies and
Nodemailer to 10.2.1. SMTP TLS certificates are now verified; self-signed SMTP
servers need a trusted certificate rather than disabling verification.
The standalone tracing root is explicit so the nested dashboard still produces
its expected `server.js` Docker entry point.

## Verification

`npm test` runs five offline suites using temporary persistence paths and no
inherited service credentials. `npx tsc --noEmit` type-checks all tests separately.

`python3 -m unittest discover -s scripts -p test_autodeploy.py` exercises the actual
HTTP handler without triggering deployment.

CI additionally starts PostgreSQL 16 and runs `npm run test:postgres`. It applies
the production schema and migrations to the dedicated `safaris_security_test`
database, then uses independent processes to test first-use credits, overspending,
idempotency, quote consumption, rollback, setup-token replay and revocation despite
stale process caches. This suite refuses non-localhost or differently named DBs.

## Release and rollback

Deploy only the full SHA that passed CI. Polling deployment is disabled. The
deployment script refuses dirty tracked files, takes a private gzip-verified
database backup, records the previous SHA, builds, applies migrations before
switching the backend, validates Nginx, and checks both database readiness and the
running release SHA. CI waits for daemon completion; HTTP 202 alone is not success.

On a failed migration, retain the previous running application and investigate.
On a runtime regression, deploy the recorded previous SHA using secure admin
access. Keep additive schema changes unless a reviewed rollback specifically
requires otherwise. Never restore an old database over new customer transactions.
Reverting this security release reintroduces the closed weaknesses; restrict
affected features if a rollback is necessary.
