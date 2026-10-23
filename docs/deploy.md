# ClaimTidy: Deployment (one Hostinger VPS, shared with other apps)

ClaimTidy runs on **your existing Hostinger KVM 2** (Kuala Lumpur, Malaysia), next to the apps already there. It runs the official self-hosted Supabase (database and sign-in only) plus ClaimTidy's API and web app. There's no Supabase cloud and no Google Cloud.

**Receipts are never on this server (v13).** They stay on the user's phone and in the user's own Google Drive or OneDrive. The server keeps only accounts, subscriptions and approval records.

**Nothing is deployed yet.** The steps below are for the product owner. The scripts were rehearsed end to end next to stand-in "other apps" (see "What was tested" at the end).

## How ClaimTidy stays out of your other apps' way

| Rule | How |
|---|---|
| Nothing is reinstalled or reconfigured | No firewall or SSH changes, no system upgrades. The only installs are Docker (if missing) and a few small tools (`jq`, `age`, `iproute2`, `rsync`). |
| Its own folder | Everything lives in `/opt/claimtidy` (and backups in `/var/backups/claimtidy`). |
| Its own containers | Every container is named `claimtidy-*` and belongs to the Docker Compose project `claimtidy`, on its own network. The scripts only ever start, stop or remove that project's containers. Old image clean-up is limited to ClaimTidy's own images. |
| No port clashes | Nothing is published except ClaimTidy's web entry point, and only on `127.0.0.1` unless ports 80/443 were free (next section). The database isn't published at all. |
| Capped resources | Each container has a memory cap and a CPU cap (at the very most about 3 GB of memory and 5 CPUs, all together; about 550 MB of memory at rest). Each also has half the normal CPU priority, so your other apps come first when the server is busy. |
| Capped logs | 3 × 10 MB per container. |
| Disk | About 5 GB of images, plus the database (small: no receipts). Your server has about 75 GB free. |

### Web traffic: three modes
On the first deploy, the setup script checks what already uses ports 80/443:

- **`traefik` (your server, 23 Oct 2026):** your server's Traefik (from Hostinger's Docker Manager) has 80/443 and picks up apps by their Docker labels. ClaimTidy joins it the same way Buzz does:
  - the setup script reads Traefik's HTTPS entry point (`websecure`) and certificate resolver (`letsencrypt`) from Traefik itself;
  - it then puts matching labels on ClaimTidy's Caddy;
  - Traefik gets the certificates and redirects `http://` to `https://`.

  Nothing in Traefik's own setup or in your other apps changes, and there's no manual step.
- **`caddy` (ports were free):** ClaimTidy's own Caddy answers on 80/443 for ClaimTidy's domains only, with automatic HTTPS certificates.
- **`external` (another web server already has 80/443, for example one of your apps' proxies):** ClaimTidy's Caddy listens on `127.0.0.1:18080` only, and your existing web server forwards ClaimTidy's domains to it (step 6 below). Your existing web server keeps handling HTTPS.

The choice is saved as `CLAIMTIDY_PROXY` in `/opt/claimtidy/settings.env`, and you can change it there.

## Web addresses

`claimtidy.com` is the example:

| Address | What it is |
|---|---|
| `claimtidy.com` (and `www.`) | The web app |
| `api.claimtidy.com` | ClaimTidy's API |
| `auth.claimtidy.com` | Sign-in and account data (only Supabase's public sign-in and data APIs; the dashboard isn't reachable) |

## One-time setup (product owner)

### 1. A deploy key
On your computer, create an SSH key just for deploying (Windows PowerShell, macOS and Linux all have this):

```
ssh-keygen -t ed25519 -f claimtidy-deploy -C "claimtidy deploy"
```

In hPanel → VPS → **SSH keys**, add the contents of `claimtidy-deploy.pub`. This adds a key. It doesn't change how you log in today. Keep `claimtidy-deploy` (the private half) for step 3.

### 2. The domain
At your domain registrar, add **A records** pointing to the server's IP address (`187.127.124.225`): `@`, `www`, `api` and `auth`.

Do this **before the first deploy**, and wait until the records work (`nslookup api.claimtidy.com` shows the IP). Traefik asks Let's Encrypt for the certificates as soon as ClaimTidy starts. Let's Encrypt only allows a few failed attempts per hour, so it's better if the first attempt succeeds.

### 3. GitHub
In the repository's **Settings → Environments**, create an environment called `production` and add:

- **Secret** `DEPLOY_SSH_KEY`: the contents of the private key file `claimtidy-deploy`.
- **Variables:**
  - `CLAIMTIDY_DOMAIN`: `claimtidy.com`
  - `CLAIMTIDY_HOST`: `187.127.124.225`
- **Optional secret** `DEPLOY_KNOWN_HOSTS`: the server's SSH host key, to pin it. Without it, the key is trusted on first use.

### 4. First deploy
Go to **Actions → Deploy → Run workflow**. The first run takes about 10–15 minutes, while Supabase is downloaded and the apps are built. The workflow:

1. copies the code to `/opt/claimtidy/app`;
2. runs `infra/hostinger/setup-server.sh`, which:
   - installs Supabase (pinned version) in `/opt/claimtidy/supabase`, with generated secrets,
   - picks the web traffic mode,
   - creates your settings file,
   - schedules the nightly backup;
3. runs `infra/hostinger/deploy.sh`, which:
   - builds ClaimTidy,
   - applies database changes,
   - checks that the API and the web app are healthy.

The first run ends with notes about settings that are still empty. That's expected.

### 5. Your settings
Open `/opt/claimtidy/settings.env` (for example in hPanel's browser terminal: `nano /opt/claimtidy/settings.env`) and fill in:

| Setting | What for | Without it |
|---|---|---|
| `CLAIMTIDY_POSTMARK_TOKEN` | The Postmark server token for the 6-digit sign-in code emails. In Postmark, verify the sender domain (`no-reply@claimtidy.com`). | **Nobody can sign in.** |
| `CLAIMTIDY_GOOGLE_CLIENT_ID`, `CLAIMTIDY_GOOGLE_SECRET` | Users linking their own Google Drive (see below). | The Google Drive option is hidden. |
| `CLAIMTIDY_MICROSOFT_CLIENT_ID`, `CLAIMTIDY_MICROSOFT_SECRET` | Users linking their own OneDrive (see below). | The OneDrive option is hidden. |
| `CLAIMTIDY_BACKUP_AGE_RECIPIENT` | Your backup key (step 7). | No backups. |
| `CLAIMTIDY_ACME_EMAIL` | Certificate notices (`caddy` mode only). | Certificates still work. |

Then run the Deploy workflow again.

**Google Drive keys:**

1. In Google Cloud Console, create a project.
2. Enable the **Google Drive API**.
3. Set up the OAuth consent screen (app name ClaimTidy). Add the scope `.../auth/drive.file`, which only covers files ClaimTidy creates.
4. Create an **OAuth client ID** of type *Web application*:
   - authorised JavaScript origin `https://claimtidy.com`;
   - redirect URI `https://claimtidy.com/cloud/callback`.

**OneDrive keys:**

1. In the Microsoft Entra admin centre, open **App registrations → New registration**.
2. Under supported accounts, choose *any organisational directory and personal Microsoft accounts*.
3. Set the redirect URI: platform *Web*, `https://claimtidy.com/cloud/callback`.
4. Under **API permissions**, add the delegated Microsoft Graph permissions `Files.ReadWrite.AppFolder` and `offline_access`. These only cover ClaimTidy's own app folder.
5. Under **Certificates & secrets**, create a client secret. Note when it expires.

### 6. Only in `external` mode: forward ClaimTidy's domains
Check which mode you got: `grep CLAIMTIDY_PROXY /opt/claimtidy/settings.env`. On your server it should say `traefik`, and then there's nothing to do here. If it says `external`, add ClaimTidy's four domains to the web server that already owns ports 80/443, forwarding them to `http://127.0.0.1:18080` with the original host name. That web server also issues the HTTPS certificates for them.

nginx:

```
server {
    listen 443 ssl;
    server_name claimtidy.com www.claimtidy.com api.claimtidy.com auth.claimtidy.com;
    # ssl_certificate ... (however this server already gets certificates)
    client_max_body_size 10m;
    location / {
        proxy_pass http://127.0.0.1:18080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Caddy:

```
claimtidy.com, www.claimtidy.com, api.claimtidy.com, auth.claimtidy.com {
	reverse_proxy 127.0.0.1:18080
}
```

If that web server runs inside a Docker container (not on the host network), it can't reach the server's `127.0.0.1`. Set `CLAIMTIDY_BIND_ADDRESS='172.17.0.1'` in `settings.env`, run the Deploy workflow again, and forward to `http://172.17.0.1:18080` instead. (`172.17.0.1` is Docker's usual address for the server itself; `ip -4 addr show docker0` shows it.)

### 7. Backups
Every night at 03:15 (server time), the server backs up ClaimTidy's database, **encrypted to your key**:

- The server can't read its own backups.
- They're kept on the server for 14 days in `/var/backups/claimtidy`.
- Optionally, they're also copied elsewhere with rclone (`CLAIMTIDY_BACKUP_RCLONE_REMOTE`).

To create your key, install [age](https://github.com/FiloSottile/age/releases) on your computer and run:

```
age-keygen -o claimtidy-backup-key.txt
```

- Put the line starting `age1…` (the public key) in `settings.env`.
- **Keep `claimtidy-backup-key.txt` somewhere safe and offline** (for example a password manager). Without it, backups can't be restored.
- Hostinger's weekly VPS backups (already on for this server) are a second layer.

### 8. Supabase's dashboard (optional)
The dashboard is deliberately not on the internet. To open it, connect from your computer:

```
ssh -i claimtidy-deploy -L 8000:127.0.0.1:18000 root@187.127.124.225
```

Then open `http://localhost:8000`. The username is `supabase`; the password is `DASHBOARD_PASSWORD` in `/opt/claimtidy/supabase/.env`.

## Day to day

- **New version:** run the Deploy workflow. It's safe to run at any time, and each database change is applied once.
- **Supabase upgrades:** Supabase is pinned (`SUPABASE_REF` in `setup-server.sh`). Upgrades come as a reviewed change, roughly quarterly.
- **Logs:** `cd /opt/claimtidy/supabase && docker compose logs --tail 100 claimtidy-api` (or `claimtidy-web`, `auth`, `caddy`).
- **Backup log:** `/var/log/claimtidy-backup.log`.
- **What's running:** `docker ps --filter label=com.docker.compose.project=claimtidy`.
- **Removing ClaimTidy completely:**
  1. `cd /opt/claimtidy/supabase && docker compose down -v`
  2. `rm -rf /opt/claimtidy /var/backups/claimtidy /etc/cron.d/claimtidy-backup`

  Nothing else on the server is affected.

## Restoring

Decrypt the backup **on your computer**, so your key never touches the server, and copy it up:

```
age -d -i claimtidy-backup-key.txt claimtidy-<time>.dump.age > postgres.dump
scp postgres.dump root@187.127.124.225:/root/
```

Then, on the server:

```
/opt/claimtidy/app/infra/hostinger/restore.sh /root/postgres.dump
```

The script:

- asks you to type `RESTORE`;
- stops only ClaimTidy's API and sign-in;
- restores the database in one transaction, so if anything fails, nothing changes;
- refuses any restore that would leave client roles able to write;
- starts ClaimTidy again, even after a failure.

## What was tested (23 Oct 2026)

The real scripts ran against a real self-hosted Supabase (release `self-hosted/v0.8.3`). Stand-in "other apps" ran alongside: a web server holding port 80, and an app holding ports 3000, 5432, 8000 and 8080.

- **All three web traffic modes.**
  - `traefik`: a Traefik started with exactly your server's settings (host network, Docker labels, `websecure`, `letsencrypt`, the `http://` redirect), with a stand-in Buzz joined by the same labels as your real one.
    - The first setup detected it and copied its entry point and certificate resolver.
    - ClaimTidy's four addresses, the `www` redirect and users' real IP addresses all worked through it.
    - Buzz kept working.
    - The test used the current `traefik:latest` (3.7). Older Traefik releases can't talk to the newest Docker, which is worth knowing if Hostinger ever pins an old one.
  - `external` was detected automatically, and traffic was forwarded by the other app's web server. This worked both with that web server on the host and with it inside a Docker container (`CLAIMTIDY_BIND_ADDRESS='172.17.0.1'`). A public bind address is refused.
  - `caddy` used local test certificates; `www` and `http://` redirect to `https://`.
- **Sign-in:** a 6-digit code by email (subject "Your ClaimTidy code"), then the code exchanged for a session. Supabase's one-code-per-minute limit held.
- **The API:** the country question saves the profile with AUD, and linking Google Drive goes through the token exchange (against a stand-in Google). OneDrive shows as off while its keys are empty.
- **Database rules:**
  - users read only their own profile;
  - direct writes are refused (403);
  - file storage and the dashboard aren't reachable from outside (404);
  - the sign-in email template isn't public.
- **Other apps unaffected:**
  - their containers were never restarted, and all their ports kept answering;
  - ClaimTidy published only `127.0.0.1:18080/18443` (Caddy) and `127.0.0.1:18000` (dashboard gateway);
  - memory use was about 550 MB at rest.
- **Backup and restore.**
  - A backup is encrypted, and the server can't read it.
  - A deleted account came back after a restore, and the restored user signed in.
  - The drill found two bugs, both fixed:
    - a missing optional setting made the backup stop silently;
    - a restore re-created tables with wider permissions than before.

    The restore now keeps the exact permissions, and it refused a backup that carried wrong ones, leaving the database untouched.
- **Second deploys:** they apply no migration twice, pick up Caddy changes without a restart, and every service stays healthy.

Not yet tested on the real server: real certificates and DNS, Postmark delivery, and real Google/Microsoft sign-in screens. These are checked on the first real deploy.

## Local development

```
pnpm install
pnpm test:db      # starts local Supabase in Docker, rebuilds the database, runs pgTAP
pnpm test:api     # API integration tests against local Supabase
pnpm e2e:mobile   # the full stack in mobile emulation (with a stand-in Google Drive/OneDrive)
```
