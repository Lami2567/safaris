# Authentication, privacy and proxy security release

Base: main `71fcb4c5f563d57180dbb590a4ad36d2ba1a03e8`.

## Result

- Password, OTP and administrator login read authoritative users. Login never upserts a partially mapped user. Suspended and unapproved accounts cannot authenticate.
- Generic user persistence cannot overwrite password hashes, verification, approval, role, application IDs or revocation counters. Narrow security writes lock the current user row and increment its current token version. Profile writes cannot undo concurrent security changes.
- Notification read/delete SQL includes the caller's ownership condition. Administrator access is explicit. Database errors fail the request; missing and unauthorized records return the same response.
- Email/phone/application-ID recruitment lookups are disabled. Applicants request a private link by email, receive a generic acknowledgement, and use a 24-hour random status capability. Only SHA-256 hashes are stored; one active link per application means requesting a replacement revokes the old link. Link fragments are removed from browser history and submitted in POST bodies. No token is logged when SMTP is missing.
- Public HTTP redirects to fixed HTTPS hostnames; unknown hosts are rejected. Port 3001 is internal only. Separate TLS vhosts serve admin and careers.
- Nginx accepts Cloudflare client addresses only from its officially published proxy ranges, and overwrites forwarding headers. Express trusts only addresses resolved for its internal Nginx service and refreshes that list as containers change.
- Shared PostgreSQL counters apply before body parsing. Authentication and link-request limits use both client and normalized account identifiers, persist across processes/restarts, expire and return Retry-After. In-memory counters exist only in tests. Storage errors return 503.

## Before deployment

1. Ensure DNS for both public hostnames reaches the intended origin. Each hostname needs a valid certificate and key at `/etc/letsencrypt/live/<hostname>/{fullchain,privkey}.pem` in the existing certificate volume. The added careers TLS vhost will deliberately fail preflight if its certificate is absent. Keep Cloudflare Full (strict).
2. Configure working SMTP_HOST, SMTP_USER, SMTP_PASS and appropriate SMTP port/security/from settings in the production environment. The release checks required SMTP settings before switching services. No real email is sent during automated tests.
3. Retain the existing private R2 bucket configuration and the authenticated deployment webhook secret. Existing private-bucket policy is not changed by this release and must still deny public reads.
4. Leave TRUSTED_PROXY_HOST=nginx as supplied by production Compose. Do not enable blanket proxy trust. Backend and admin must remain internal; do not publish backend port 3000 or admin port 3001.
5. Apply all migrations through the existing deployment script. `20261028_auth_status_limits.sql` adds only the rate-limit and hashed-status-token tables; it does not rewrite historical users or financial data.

The script preserves the existing database backup, tests the new Nginx configuration before replacing running services, validates internal release SHA/database readiness, and checks origin HTTPS and HTTP redirects. The webhook's host is resolved through Docker's host-gateway alias instead of a hardcoded bridge address.

## Verification

Run `npm ci`, `npm run build`, `npm test`, dashboard build/type checking, `npm run test:postgres` against the explicitly isolated localhost `safaris_security_test` database, `python3 -m unittest discover -s scripts -p 'test_autodeploy.py'`, `python3 scripts/test_nginx_security.py` (Docker), and `bash -n scripts/deploy.sh`.

The PostgreSQL suite now checks independent-process rate-limit increments plus database-backed login immutability, security/profile concurrency, notification HTTP ownership, status token hashing, replacement and expiry. Native multiprocess PostgreSQL tests must pass in CI before deployment. Embedded PostgreSQL validation is useful locally but is not a substitute for those independent-process tests.

The proxy test uses synthetic upstreams and short-lived test certificates; its root/single-process fixture settings are never applied to the production Nginx configuration. A local Nginx 1.24 binary can run it through NGINX_TEST_BINARY using equivalent HTTP/2 listen syntax; CI uses the production Nginx 1.25 image and original directives.

## Operational notes

Review Cloudflare's official IPv4/IPv6 ranges when changing proxy infrastructure. New status links are read-only and cannot authenticate API sessions. Legacy status bookmarks that use only an email, phone or application ID must request a new private link.

If GitHub publishing is denied, the local commit/patch is the deliverable. A successful local build does not mean the release has reached main or the server. Preserve that distinction in the release report.
