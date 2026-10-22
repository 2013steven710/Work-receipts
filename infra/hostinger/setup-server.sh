#!/usr/bin/env bash
# Prepares one ClaimTidy server on a Hostinger VPS (Ubuntu 24.04, KVM 2 or larger).
# Idempotent: the deploy workflow runs it before every deploy, and it only changes what's missing.
#
#   setup-server.sh <region: au|us|uk> <domain> [--primary]
#
# The primary server (the "au" region, hosted in Malaysia) also runs the global account directory
# and the web app. Everything lives under /opt/claimtidy:
#   app/            this repository (copied by the deploy workflow)
#   supabase/       the official self-hosted Supabase, pinned to SUPABASE_REF
#   settings.env    values the owner provides (created as a template; edit, then redeploy)
#   secrets.env     secrets generated here once; never shown in logs
#   region-card.json  this region's connection details, which the deploy workflow passes to the primary
#   region-cards/   (primary) the other regions' cards
#
# For rehearsals off a real server: CLAIMTIDY_SKIP_SYSTEM=1 skips steps 1-4 (packages, firewall,
# SSH, Docker install) and CLAIMTIDY_LOCAL_CERTS=1 makes Caddy use its own local certificates.
set -euo pipefail

SUPABASE_REF="self-hosted/v0.8.3"
BASE=/opt/claimtidy
APP="$BASE/app"
SB="$BASE/supabase"

die() { echo "setup-server: $*" >&2; exit 1; }
log() { echo "==> $*"; }

[[ $EUID -eq 0 ]] || die "run as root"
REGION="${1:-}"
DOMAIN="${2:-}"
PRIMARY="${3:-}"
[[ "$REGION" =~ ^(au|us|uk)$ ]] || die "region must be au, us or uk"
[[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "domain looks wrong: $DOMAIN"
[[ -z "$PRIMARY" || "$PRIMARY" == "--primary" ]] || die "third argument may only be --primary"
[[ -f "$APP/infra/hostinger/docker-compose.claimtidy.yml" ]] || die "the repository must be at $APP"
mkdir -p "$BASE" "$BASE/region-cards"
chmod 700 "$BASE"

SKIP_SYSTEM="${CLAIMTIDY_SKIP_SYSTEM:-0}"

# ---- 1. Packages, automatic security updates, brute-force protection ----------------------------
if [[ "$SKIP_SYSTEM" != 1 && ! -f "$BASE/.base-done" ]]; then
  log "Installing base packages and automatic security updates"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -yq ufw fail2ban unattended-upgrades age rsync jq openssl git curl ca-certificates
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
  systemctl enable --now fail2ban unattended-upgrades
  touch "$BASE/.base-done"
fi

# ---- 2. Firewall: SSH and HTTPS only ------------------------------------------------------------
# (Docker publishes ports around ufw, so every other container port binds to 127.0.0.1.)
if [[ "$SKIP_SYSTEM" != 1 ]]; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
fi

# ---- 3. SSH: keys only, once a key is installed (never locks the owner out) ---------------------
if [[ "$SKIP_SYSTEM" != 1 && -s /root/.ssh/authorized_keys && ! -f /etc/ssh/sshd_config.d/99-claimtidy.conf ]]; then
  log "Turning off SSH password logins (a key is installed)"
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' \
    > /etc/ssh/sshd_config.d/99-claimtidy.conf
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
fi

# ---- 4. Docker ----------------------------------------------------------------------------------
if ! command -v docker >/dev/null; then
  log "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi

# ---- 5. Supabase (official self-hosted release) -------------------------------------------------
if [[ ! -f "$SB/docker-compose.yml" ]]; then
  log "Installing self-hosted Supabase ($SUPABASE_REF)"
  curl -fsSL "https://raw.githubusercontent.com/supabase/supabase/$SUPABASE_REF/docker/setup.sh" -o /tmp/supabase-setup.sh
  (cd "$BASE" && sh /tmp/supabase-setup.sh -y --skip-deps --project-dir supabase --ref "$SUPABASE_REF")
  rm -f /tmp/supabase-setup.sh
fi
[[ -f "$SB/.env" ]] || die "Supabase setup didn't create $SB/.env"
chmod 600 "$SB/.env"

env_get() { grep -E "^$1=" "$2" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//'; }
env_set() { # env_set FILE KEY VALUE  (single-quoted, so JSON and $ are kept literally)
  local file=$1 key=$2 value=$3 tmp
  [[ "$value" != *"'"* ]] || die "$key contains a single quote"
  tmp=$(mktemp)
  grep -vE "^$key=" "$file" > "$tmp" || true
  printf "%s='%s'\n" "$key" "$value" >> "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

# ---- 6. Secrets generated once ------------------------------------------------------------------
SECRETS="$BASE/secrets.env"
touch "$SECRETS"
chmod 600 "$SECRETS"
ensure_secret() { [[ -n "$(env_get "$1" "$SECRETS")" ]] || env_set "$SECRETS" "$1" "$2"; }
ensure_secret CLAIMTIDY_HOOK_SECRET "v1,whsec_$(openssl rand -base64 32)"
if [[ -n "$PRIMARY" ]]; then
  # KEY_SECRET keys every stored identity: never change it once accounts exist.
  ensure_secret CLAIMTIDY_KEY_SECRET "$(openssl rand -hex 32)"
  ensure_secret CLAIMTIDY_TICKET_SECRET "$(openssl rand -hex 32)"
  ensure_secret CLAIMTIDY_CODE_SECRET "$(openssl rand -hex 32)"
fi

# ---- 7. Owner settings (template on first run) --------------------------------------------------
SETTINGS="$BASE/settings.env"
if [[ ! -f "$SETTINGS" ]]; then
  cat > "$SETTINGS" <<'EOF'
# ClaimTidy settings for this server. Fill in what you have, then run the Deploy workflow again.
# Leave a value empty to keep that feature off.

# Email for Let's Encrypt certificate notices.
CLAIMTIDY_ACME_EMAIL=''
# Postmark server token, for sign-in code emails (primary server only).
CLAIMTIDY_POSTMARK_TOKEN=''
# Google and Microsoft sign-in (client ID and secret from each provider's console).
CLAIMTIDY_GOOGLE_CLIENT_ID=''
CLAIMTIDY_GOOGLE_SECRET=''
CLAIMTIDY_MICROSOFT_CLIENT_ID=''
CLAIMTIDY_MICROSOFT_SECRET=''
# Backups are encrypted to this public key (from `age-keygen` on your own computer; it starts
# with "age1"). Keep the private key off the server. Without it, no backups are made.
CLAIMTIDY_BACKUP_AGE_RECIPIENT=''
# Optional: an rclone remote for off-server copies, e.g. "b2-claimtidy-au:claimtidy-au-backups".
# Keep it in this server's region. Configure it with `rclone config` on this server first.
CLAIMTIDY_BACKUP_RCLONE_REMOTE=''
EOF
  chmod 600 "$SETTINGS"
fi
setting() { env_get "$1" "$SETTINGS"; }

# ---- 8. Supabase settings and the managed ClaimTidy block ----------------------------------------
log "Writing configuration"
E="$SB/.env"
env_set "$E" SUPABASE_PUBLIC_URL "https://db-$REGION.$DOMAIN"
env_set "$E" API_EXTERNAL_URL "https://db-$REGION.$DOMAIN/auth/v1"
env_set "$E" SITE_URL "https://$DOMAIN"
env_set "$E" ADDITIONAL_REDIRECT_URLS "https://$DOMAIN/**"
env_set "$E" DISABLE_SIGNUP false
env_set "$E" ENABLE_EMAIL_SIGNUP true
env_set "$E" ENABLE_EMAIL_AUTOCONFIRM false
env_set "$E" ENABLE_ANONYMOUS_USERS false
env_set "$E" ENABLE_PHONE_SIGNUP false
env_set "$E" ENABLE_PHONE_AUTOCONFIRM false
env_set "$E" COMPOSE_FILE "docker-compose.yml:$APP/infra/hostinger/docker-compose.claimtidy.yml"
env_set "$E" COMPOSE_PROFILES "$([[ -n "$PRIMARY" ]] && echo primary || echo "")"

env_set "$E" CLAIMTIDY_REGION "$REGION"
env_set "$E" CLAIMTIDY_DOMAIN "$DOMAIN"
env_set "$E" CLAIMTIDY_HOOK_SECRET "$(env_get CLAIMTIDY_HOOK_SECRET "$SECRETS")"
env_set "$E" CLAIMTIDY_HOOK_BASE "https://id.$DOMAIN"
env_set "$E" CLAIMTIDY_API_URLS_JSON "{\"au\":\"https://api-au.$DOMAIN\",\"us\":\"https://api-us.$DOMAIN\",\"uk\":\"https://api-uk.$DOMAIN\"}"
for key in CLAIMTIDY_POSTMARK_TOKEN CLAIMTIDY_GOOGLE_CLIENT_ID CLAIMTIDY_GOOGLE_SECRET CLAIMTIDY_MICROSOFT_CLIENT_ID CLAIMTIDY_MICROSOFT_SECRET; do
  env_set "$E" "$key" "$(setting "$key")"
done
env_set "$E" CLAIMTIDY_GOOGLE_ENABLED "$([[ -n "$(setting CLAIMTIDY_GOOGLE_CLIENT_ID)" ]] && echo true || echo false)"
env_set "$E" CLAIMTIDY_MICROSOFT_ENABLED "$([[ -n "$(setting CLAIMTIDY_MICROSOFT_CLIENT_ID)" ]] && echo true || echo false)"

# This region's card: what the account directory needs to reach this region.
jq -n --arg r "$REGION" --arg url "https://db-$REGION.$DOMAIN" \
  --arg service "$(env_get SERVICE_ROLE_KEY "$E")" --arg anon "$(env_get ANON_KEY "$E")" \
  --arg hook "$(env_get CLAIMTIDY_HOOK_SECRET "$SECRETS")" \
  '{($r): {supabaseUrl: $url, serviceKey: $service, anonKey: $anon, hookSecret: $hook}}' > "$BASE/region-card.json"
chmod 600 "$BASE/region-card.json"

if [[ -n "$PRIMARY" ]]; then
  for key in CLAIMTIDY_KEY_SECRET CLAIMTIDY_TICKET_SECRET CLAIMTIDY_CODE_SECRET; do
    env_set "$E" "$key" "$(env_get "$key" "$SECRETS")"
  done
  env_set "$E" CLAIMTIDY_MAIL_MODE "$([[ -n "$(setting CLAIMTIDY_POSTMARK_TOKEN)" ]] && echo postmark || echo log)"
  shopt -s nullglob
  # Every region's card, this one included; the directory reaches its own region internally.
  env_set "$E" CLAIMTIDY_REGIONS_JSON "$(jq -cs --arg r "$REGION" 'add | .[$r].adminUrl = "http://api-gw:8000"' \
    "$BASE/region-card.json" "$BASE"/region-cards/*.json)"
  shopt -u nullglob
fi

# ---- 9. HTTPS entry point -----------------------------------------------------------------------
ACME_EMAIL="$(setting CLAIMTIDY_ACME_EMAIL)"
{
  if [[ "${CLAIMTIDY_LOCAL_CERTS:-0}" == 1 ]]; then printf '{\n\tlocal_certs\n}\n\n'
  elif [[ -n "$ACME_EMAIL" ]]; then printf '{\n\temail %s\n}\n\n' "$ACME_EMAIL"; fi
  cat <<EOF
# Generated by setup-server.sh; edits are overwritten.

# Supabase for this region: only the sign-in, data and file APIs are public.
# The dashboard stays private (reach it through an SSH tunnel to port 8000).
db-$REGION.$DOMAIN {
	@public path /auth/v1/* /rest/v1/* /storage/v1/*
	handle @public {
		reverse_proxy api-gw:8000
	}
	handle {
		respond 404
	}
}

api-$REGION.$DOMAIN {
	reverse_proxy claimtidy-api:8080
}
EOF
  if [[ -n "$PRIMARY" ]]; then
    cat <<EOF

id.$DOMAIN {
	@dev path /dev/*
	respond @dev 404
	reverse_proxy claimtidy-directory:8080
}

$DOMAIN {
	reverse_proxy claimtidy-web:3000
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
EOF
  fi
} > "$BASE/Caddyfile"

# ---- 10. Nightly encrypted backups --------------------------------------------------------------
cat > /etc/cron.d/claimtidy-backup <<EOF
# Nightly encrypted backup of the database and stored files (infra/hostinger/backup.sh).
SHELL=/bin/bash
15 3 * * * root $APP/infra/hostinger/backup.sh >> /var/log/claimtidy-backup.log 2>&1
EOF

log "Server ready for region $REGION${PRIMARY:+ (primary)}"
if [[ -z "$(setting CLAIMTIDY_BACKUP_AGE_RECIPIENT)" ]]; then
  echo "WARNING: no backup key in $SETTINGS (CLAIMTIDY_BACKUP_AGE_RECIPIENT). Nightly backups won't run until it is set." >&2
fi
