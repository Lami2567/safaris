#!/usr/bin/env bash
# ==============================================================================
# MUMWE SAFARIS — Automated SSL Certificate Provisioning for Careers Portal
# Domain: careers.mumwesafarisuganda.com
# ==============================================================================

set -euo pipefail

DOMAIN="careers.mumwesafarisuganda.com"
EMAIL="admin@mumwesafarisuganda.com"
PROJECT_DIR="/home/ubuntu/safaris"

echo "======================================================================"
echo "🔒 [SSL Provisioning] Requesting Certificate for: ${DOMAIN}"
echo "======================================================================"

# 1. Verify DNS resolution
echo "🌐 Verifying DNS resolution for ${DOMAIN}..."
RESOLVED_IP=$(dig +short "${DOMAIN}" | tail -n1 || true)
if [ -z "${RESOLVED_IP}" ]; then
  echo "⚠️ WARNING: ${DOMAIN} does not currently resolve to an IP."
  echo "👉 Please update your DNS A-record to point to this VPS IP before requesting Let's Encrypt certificates."
else
  echo "✅ DNS resolves to: ${RESOLVED_IP}"
fi

# 2. Run Certbot via Docker using the webroot volume
echo "🚀 Running Certbot webroot challenge..."
docker run --rm \
  -v safaris_certs:/etc/letsencrypt \
  -v safaris_certbot_www:/var/www/certbot \
  certbot/certbot certonly --webroot \
  -w /var/www/certbot \
  -d "${DOMAIN}" \
  --email "${EMAIL}" \
  --agree-tos \
  --no-eff-email

# 3. Check if certificate files exist in safaris_certs volume
CERT_EXISTS=$(docker run --rm -v safaris_certs:/certs alpine sh -c "[ -f /certs/live/${DOMAIN}/fullchain.pem ] && echo 'yes' || echo 'no'")

if [ "${CERT_EXISTS}" = "yes" ]; then
  echo "✅ SSL Certificate successfully acquired for ${DOMAIN}!"

  # 4. Inject HTTPS block into default.conf if not already present
  if ! grep -q "server_name ${DOMAIN};" "${PROJECT_DIR}/nginx/conf.d/default.conf" | grep -q "443"; then
    echo "⚙️ Appending HTTPS block for ${DOMAIN} into Nginx configuration..."
    cat << 'EOF' >> "${PROJECT_DIR}/nginx/conf.d/default.conf"

# ==============================================================================
# Careers Recruitment Portal: careers.mumwesafarisuganda.com (HTTPS / SSL)
# ==============================================================================
server {
    listen 443 ssl http2;
    server_name careers.mumwesafarisuganda.com www.careers.mumwesafarisuganda.com;

    ssl_certificate /etc/letsencrypt/live/careers.mumwesafarisuganda.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/careers.mumwesafarisuganda.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    client_max_body_size 25M;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files $uri =404;
    }

    location /api/ {
        limit_req zone=api_limit burst=30 nodelay;
        proxy_pass http://safaris_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 10s;
        proxy_read_timeout 90s;
        proxy_send_timeout 90s;
    }

    location /_next/ {
        proxy_pass http://safaris_admin/_next/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass $http_upgrade;
        expires 365d;
        access_log off;
    }

    location / {
        proxy_pass http://safaris_admin;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
    }
}
EOF
  fi

  # 5. Reload Nginx
  echo "🔄 Reloading Nginx with HTTPS configuration..."
  docker exec safaris_nginx_prod nginx -t
  docker exec safaris_nginx_prod nginx -s reload
  echo "🎉 [SUCCESS] HTTPS is now fully active on https://${DOMAIN}"
else
  echo "❌ Certificate generation failed or was skipped. Please ensure DNS points to this server first."
fi
