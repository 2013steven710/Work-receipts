#!/usr/bin/env bash
# Prepares ClaimTidy on a Hostinger VPS that may already run other apps (v13: one server).
# Idempotent: the deploy workflow runs it before every deploy, and it only changes what's missing.
#
#   setup-server.sh <domain> [--harden]
#
# Shared-server rules: everything lives in /opt/claimtidy; containers are named claimtidy-*; there
# are no firewall or SSH changes, and no system packages beyond Docker (if missing) and a few tools.
# --harden is for a server dedicated to ClaimTidy: it also turns on the firewall (SSH and HTTPS
# only), automatic security updates, fail2ban and key-only SSH.
#
#   app/          this repository (copied by the deploy workflow)
#   supabase/     the official self-hosted Supabase, pinned to SUPABASE_REF
#   settings.env  values the owner provides (created as a template; edit, then redeploy)
#   Caddyfile     generated
#
# Web traffic: if nothing else uses ports 80/443, ClaimTidy's Caddy serves them with automatic
# HTTPS for its own domains only. If another web server already does, Caddy listens on
# 127.0.0.1:18080 instead and the existing web server forwards ClaimTidy's domains to it
# (docs/deploy.md). The choice is saved in settings.env (CLAIMTIDY_PROXY) and can be changed there.
#
# For rehearsals off a real server: CLAIMTIDY_LOCAL_CERTS=1 makes Caddy use local certificates.
set -euo pipefail

SUPABASE_REF="self-hosted/v0.8.3"
BASE=/opt/claimtidy
APP="$BASE/app"
SB="$BASE/supabase"

die() { echo "setup-server: $*" >&2; exit 1; }
log() { echo "==> $*"; }

[[ $EUID -eq 0 ]] || die "run as root"
DOMAIN="${1:-}"
HARDEN="${2:-}"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "domain looks wrong: $DOMAIN"
[[ -z "$HARDEN" || "$HARDEN" == "--harden" ]] || die "second argument may only be --harden"
[[ -f "$APP/infra/hostinger/docker-compose.claimtidy.yml" ]] || die "the repository must be at $APP"
mkdir -p "$BASE"
chmod 700 "$BASE"

# ---- 1. Tools and Docker ------------------------------------------------------------------------
missing=()
for tool in jq openssl curl age; do command -v "$tool" >/dev/null || missing+=("$tool"); done
command -v ss >/dev/null || missing+=(iproute2)
if ((${#missing[@]})); then
  log "Installing ${missing[*]}"
  DEBIAN_FRONTEND=noninteractive apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -yq "${missing[@]}"
fi
if ! command -v docker >/dev/null; then
  log "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi

# ---- 2. Only with --harden (a server dedicated to ClaimTidy) -------------------------------------
if [[ -n "$HARDEN" ]]; then
  log "Hardening (dedicated server)"
  DEBIAN_FRONTEND=noninteractive apt-get install -yq ufw fail2ban unattended-upgrades
  printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades
  systemctl enable --now fail2ban unattended-upgrades
  ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw --force enable >/dev/null
  if [[ -s /root/.ssh/authorized_keys && ! -f /etc/ssh/sshd_config.d/99-claimtidy.conf ]]; then
    printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/99-claimtidy.conf
    systemctl reload ssh 2>/dev/null || systemctl reload sshd
  fi
fi

# ---- 3. Supabase (official self-hosted release) -------------------------------------------------
if [[ ! -f "$SB/docker-compose.yml" ]]; then
  log "Installing self-hosted Supabase ($SUPABASE_REF) in $SB"
  curl -fsSL "https://raw.githubusercontent.com/supabase/supabase/$SUPABASE_REF/docker/setup.sh" -o /tmp/claimtidy-supabase-setup.sh
  (cd "$BASE" && sh /tmp/claimtidy-supabase-setup.sh -y --skip-deps --project-dir supabase --ref "$SUPABASE_REF")
  rm -f /tmp/claimtidy-supabase-setup.sh
fi
[[ -f "$SB/.env" ]] || die "Supabase setup didn't create $SB/.env"
chmod 600 "$SB/.env"

env_get() { { grep -E "^$1=" "$2" 2>/dev/null || true; } | tail -n1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//'; }
env_set() { # env_set FILE KEY VALUE  (single-quoted, so JSON and $ are kept literally)
  local file=$1 key=$2 value=$3 tmp
  [[ "$value" != *"'"* ]] || die "$key contains a single quote"
  tmp=$(mktemp)
  grep -vE "^$key=" "$file" > "$tmp" || true
  printf "%s='%s'\n" "$key" "$value" >> "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

# ---- 4. Owner settings (template on first run) --------------------------------------------------
SETTINGS="$BASE/settings.env"
if [[ ! -f "$SETTINGS" ]]; then
  # Something listening (a web server, or Docker's port proxy), or a Docker container publishing it.
  port_in_use() {
    ss -ltnH "sport = :$1" | grep -q . ||
      docker ps --format '{{.Ports}}' | grep -qE "(^|[ ,])[^ ,]*:$1->"
  }
  proxy=caddy
  if port_in_use 80 || port_in_use 443; then proxy=external; fi
  cat > "$SETTINGS" <<EOF
# ClaimTidy settings for this server. Fill in what you have, then run the Deploy workflow again.
# Leave a value empty to keep that feature off.

# Web traffic. "caddy": ClaimTidy answers on ports 80/443 itself (they were free).
# "external": another web server here already uses 80/443 and forwards ClaimTidy's domains to
# http://127.0.0.1:18080 (see docs/deploy.md). Detected on first setup: $proxy
CLAIMTIDY_PROXY='$proxy'
# "external" only: the address ClaimTidy listens on for the forwarded traffic (port 18080). Keep
# 127.0.0.1 unless the existing web server runs inside a Docker container; then use Docker's
# host address, usually 172.17.0.1 (see docs/deploy.md). Never a public address.
CLAIMTIDY_BIND_ADDRESS='127.0.0.1'
# Email for Let's Encrypt certificate notices ("caddy" mode).
CLAIMTIDY_ACME_EMAIL=''
# Postmark server token: sign-in code emails. Without it, nobody can sign in.
CLAIMTIDY_POSTMARK_TOKEN=''
# Linking users' own Google Drive / OneDrive (client ID and secret from each provider's console).
CLAIMTIDY_GOOGLE_CLIENT_ID=''
CLAIMTIDY_GOOGLE_SECRET=''
CLAIMTIDY_MICROSOFT_CLIENT_ID=''
CLAIMTIDY_MICROSOFT_SECRET=''
# Backups are encrypted to this public key (from \`age-keygen\` on your own computer; it starts
# with "age1"). Keep the private key off the server. Without it, no backups are made.
CLAIMTIDY_BACKUP_AGE_RECIPIENT=''
# Optional: also copy each backup off this server with rclone (e.g. "b2:my-bucket/claimtidy";
# set the remote up first with \`rclone config\`). Hostinger's own weekly backups cover the server too.
CLAIMTIDY_BACKUP_RCLONE_REMOTE=''
EOF
  chmod 600 "$SETTINGS"
fi
setting() { env_get "$1" "$SETTINGS"; }
PROXY="$(setting CLAIMTIDY_PROXY)"
[[ "$PROXY" == caddy || "$PROXY" == external ]] || die "CLAIMTIDY_PROXY must be caddy or external"

# ---- 5. Supabase settings and the managed ClaimTidy block ----------------------------------------
log "Writing configuration"
E="$SB/.env"
env_set "$E" COMPOSE_PROJECT_NAME claimtidy
env_set "$E" COMPOSE_FILE "docker-compose.yml:$APP/infra/hostinger/docker-compose.claimtidy.yml"
env_set "$E" SUPABASE_PUBLIC_URL "https://auth.$DOMAIN"
env_set "$E" API_EXTERNAL_URL "https://auth.$DOMAIN/auth/v1"
env_set "$E" SITE_URL "https://$DOMAIN"
env_set "$E" ADDITIONAL_REDIRECT_URLS "https://$DOMAIN/**"
env_set "$E" DISABLE_SIGNUP false
env_set "$E" ENABLE_EMAIL_SIGNUP true
env_set "$E" ENABLE_EMAIL_AUTOCONFIRM false
env_set "$E" ENABLE_ANONYMOUS_USERS false
env_set "$E" ENABLE_PHONE_SIGNUP false
env_set "$E" ENABLE_PHONE_AUTOCONFIRM false
# Sign-in code emails go out through Postmark's SMTP (the token is both user and password).
POSTMARK="$(setting CLAIMTIDY_POSTMARK_TOKEN)"
env_set "$E" SMTP_HOST "${POSTMARK:+smtp.postmarkapp.com}"
env_set "$E" SMTP_PORT 587
env_set "$E" SMTP_USER "$POSTMARK"
env_set "$E" SMTP_PASS "$POSTMARK"
env_set "$E" SMTP_ADMIN_EMAIL "no-reply@$DOMAIN"
env_set "$E" SMTP_SENDER_NAME ClaimTidy

env_set "$E" CLAIMTIDY_DOMAIN "$DOMAIN"
for key in CLAIMTIDY_GOOGLE_CLIENT_ID CLAIMTIDY_GOOGLE_SECRET CLAIMTIDY_MICROSOFT_CLIENT_ID CLAIMTIDY_MICROSOFT_SECRET; do
  env_set "$E" "$key" "$(setting "$key")"
done
if [[ "$PROXY" == caddy ]]; then
  env_set "$E" CLAIMTIDY_HTTP_BIND "0.0.0.0:80"
  env_set "$E" CLAIMTIDY_HTTPS_BIND "0.0.0.0:443"
else
  BIND="$(setting CLAIMTIDY_BIND_ADDRESS)"
  BIND="${BIND:-127.0.0.1}"
  [[ "$BIND" =~ ^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.) ]] || die "CLAIMTIDY_BIND_ADDRESS must be a private address, not $BIND"
  env_set "$E" CLAIMTIDY_HTTP_BIND "$BIND:18080"
  env_set "$E" CLAIMTIDY_HTTPS_BIND "$BIND:18443"
fi

# ---- 6. ClaimTidy's web entry point -------------------------------------------------------------
ACME_EMAIL="$(setting CLAIMTIDY_ACME_EMAIL)"
{
  echo "# Generated by setup-server.sh; edits are overwritten."
  if [[ "$PROXY" == external ]]; then
    # Behind the server's existing web server, which handles HTTPS. Trust the client address it
    # forwards, so Supabase's per-address sign-in limits apply per user, not to everyone at once.
    printf '{\n\tauto_https off\n\tservers {\n\t\ttrusted_proxies static private_ranges\n\t}\n}\n\n'
    scheme="http://"
  else
    if [[ "${CLAIMTIDY_LOCAL_CERTS:-0}" == 1 ]]; then printf '{\n\tlocal_certs\n}\n\n'
    elif [[ -n "$ACME_EMAIL" ]]; then printf '{\n\temail %s\n}\n\n' "$ACME_EMAIL"; fi
    scheme=""
  fi
  cat <<EOF
# Sign-in and account data: only Supabase's auth and data APIs are public. The dashboard stays
# private (reach it through an SSH tunnel to 127.0.0.1:18000).
${scheme}auth.$DOMAIN {
	@public path /auth/v1/* /rest/v1/*
	handle @public {
		reverse_proxy api-gw:8000
	}
	handle {
		respond 404
	}
}

${scheme}api.$DOMAIN {
	reverse_proxy claimtidy-api:8080
}

${scheme}$DOMAIN {
	# The sign-in email template is for Supabase Auth on the internal network only.
	@email path /email/*
	respond @email 404
	reverse_proxy claimtidy-web:3000
}
EOF
  if [[ "$PROXY" == caddy ]]; then
    printf '\nwww.%s {\n\tredir https://%s{uri} permanent\n}\n' "$DOMAIN" "$DOMAIN"
  fi
} > "$BASE/Caddyfile"

# ---- 7. Nightly encrypted backup of ClaimTidy's database ----------------------------------------
cat > /etc/cron.d/claimtidy-backup <<EOF
# ClaimTidy: nightly encrypted backup of its database (account and subscription data only).
SHELL=/bin/bash
15 3 * * * root $APP/infra/hostinger/backup.sh >> /var/log/claimtidy-backup.log 2>&1
EOF

log "Server ready (web traffic: $PROXY)"
[[ -n "$POSTMARK" ]] || echo "NOTE: no Postmark token in $SETTINGS yet, so sign-in emails can't be sent." >&2
[[ -n "$(setting CLAIMTIDY_BACKUP_AGE_RECIPIENT)" ]] || echo "NOTE: no backup key in $SETTINGS yet, so nightly backups won't run." >&2
