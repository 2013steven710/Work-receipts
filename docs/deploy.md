# ClaimTidy: Deployment (Hostinger VPS)

ClaimTidy runs on **Hostinger VPS servers**, one per region. Each server runs the official self-hosted Supabase (database, sign-in, file storage) plus ClaimTidy's own services. There's no Supabase cloud and no Google Cloud.

**Nothing is deployed yet.** The steps below are for the product owner. The scripts were rehearsed end to end on a real self-hosted Supabase stack (see "What was tested" at the end).

## What runs where

| Region (users) | Hostinger VPS location | Plan | Runs |
|---|---|---|---|
| **AU** (Australian users, and the primary) | **Malaysia** (Hostinger has no Australian VPS) | KVM 2 | Supabase, the API, the **account directory**, the **web app** |
| **US** | USA (Boston) | KVM 2 | Supabase, the API |
| **UK** | United Kingdom | KVM 2 | Supabase, the API |

- Australian users' receipts are stored in Malaysia. The privacy policy must say so. The owner accepted this on 22 Oct 2026.
- You can **start with just the AU server**. The deploy skips regions that have no server yet. Add the US and UK servers before selling there, so UK data stays in the UK.

Web addresses (`claimtidy.com` as the example):

| Address | Points to | What it is |
|---|---|---|
| `claimtidy.com`, `www.claimtidy.com` | AU server | The web app |
| `id.claimtidy.com` | AU server | Account directory (sign-in routing) |
| `api-au.claimtidy.com`, `db-au.claimtidy.com` | AU server | The AU region's API and Supabase |
| `api-us.claimtidy.com`, `db-us.claimtidy.com` | US server | The US region |
| `api-uk.claimtidy.com`, `db-uk.claimtidy.com` | UK server | The UK region |

## One-time setup (product owner)

### 1. Servers
In Hostinger hPanel, set up each VPS with **Ubuntu 24.04** (the plain one, *not* the "Supabase" template; the setup script installs a pinned Supabase version itself, so every server is identical).

- Choose the **Malaysia** location for AU, **USA** for US and **United Kingdom** for UK.
- Note each server's IP address.

### 2. A deploy key
On your computer, create an SSH key just for deploying (Windows PowerShell, macOS and Linux all have this):

```
ssh-keygen -t ed25519 -f claimtidy-deploy -C "claimtidy deploy"
```

- In hPanel → VPS → **SSH keys**, add the contents of `claimtidy-deploy.pub` to every server.
- Keep `claimtidy-deploy` (the private half) for step 4.
- Once a key is installed, the setup script turns off password logins over SSH. Hostinger's browser terminal in hPanel still works if you ever need it.

### 3. The domain
At your domain registrar (Hostinger, if you bought the domain there), add **A records** for the addresses in the table above, each pointing to its server's IP:

- `@`, `www`, `id`, `api-au` and `db-au` → the AU server
- `api-us` and `db-us` → the US server
- `api-uk` and `db-uk` → the UK server

HTTPS certificates are issued automatically on the first deploy, once DNS points at the servers.

### 4. GitHub
In the repository's **Settings → Environments**, create an environment called `production`. In it, add:

- **Secret** `DEPLOY_SSH_KEY`: the contents of the private key file `claimtidy-deploy`.
- **Variables:**
  - `CLAIMTIDY_DOMAIN`: `claimtidy.com`
  - `HOST_AU`: the AU server's IP address
  - `HOST_US` and `HOST_UK`: the other servers' IP addresses (leave these out until those servers exist)
- **Optional secret** `DEPLOY_KNOWN_HOSTS`: the servers' SSH host keys, to pin them. Without it, they're trusted on first use.

### 5. First deploy
Go to **Actions → Deploy → Run workflow**. It takes about 10–15 minutes the first time, while Supabase is downloaded and the apps are built. The workflow:

1. copies the code to each server,
2. runs `infra/hostinger/setup-server.sh`, which does:
   - automatic security updates,
   - a firewall (SSH and HTTPS only),
   - protection against password guessing,
   - Docker and Supabase,
   - generated secrets,
   - HTTPS,
   - nightly backups,
3. runs `infra/hostinger/deploy.sh`, which:
   - builds the apps,
   - applies database changes,
   - checks every service is healthy.

### 6. Your settings
The first deploy creates `/opt/claimtidy/settings.env` on each server.

1. Open it with hPanel's browser terminal: `nano /opt/claimtidy/settings.env`.
2. Fill in:
   - `CLAIMTIDY_ACME_EMAIL`: your email, for certificate notices (every server).
   - `CLAIMTIDY_BACKUP_AGE_RECIPIENT`: your backup key (step 7, every server).
   - `CLAIMTIDY_POSTMARK_TOKEN`: the Postmark server token for sign-in emails (AU server only). **Until this is set, the app can't send sign-in codes.**
   - `CLAIMTIDY_GOOGLE_*` and `CLAIMTIDY_MICROSOFT_*`: when you have those sign-in keys (every server).
3. Run the Deploy workflow again.

### 7. Backups
Every night at 03:15 (server time), each server backs up its database and stored receipt images, **encrypted to your key**:

- The server itself can't read its backups.
- Backups are kept on the server for 14 days.
- Optionally they're also copied off the server with rclone (see `settings.env`).

To create your key, install [age](https://github.com/FiloSottile/age/releases) on your computer and run:

```
age-keygen -o claimtidy-backup-key.txt
```

- Put the line starting `age1…` (the public key) in each server's `settings.env`.
- **Keep `claimtidy-backup-key.txt` somewhere safe and offline** (for example a password manager). Without it, backups can't be restored.
- Also turn on Hostinger's own VPS backups or snapshots in hPanel if your plan includes them. They're a useful second layer.
- Backups hold deleted receipts for up to 14 days (30 days if you use an off-server copy). The privacy policy should say so.

### 8. Supabase's dashboard (optional)
The dashboard is deliberately not on the internet. To open it, connect from your computer:

```
ssh -i claimtidy-deploy -L 8000:localhost:8000 root@<server IP>
```

Then open `http://localhost:8000`. The username is `supabase`, and the password is `DASHBOARD_PASSWORD` in `/opt/claimtidy/supabase/.env` on that server.

## Day to day

- **Deploying a new version:** run the Deploy workflow. It's safe to run any time, and database changes are applied once each.
- **Security updates:** Ubuntu installs them automatically. Supabase itself is pinned (`SUPABASE_REF` in `setup-server.sh`); upgrades are prepared as a reviewed change, roughly quarterly.
- **Logs:** `cd /opt/claimtidy/supabase && docker compose logs --tail 100 claimtidy-api` (or `claimtidy-directory`, `auth`, `caddy`).
- **Backup log:** `/var/log/claimtidy-backup.log`.

## Restoring a server

On a fresh server set up with steps 1–5 (or the same server), decrypt the backup **on your computer**, so your key never touches a server:

```
mkdir restore && age -d -i claimtidy-backup-key.txt claimtidy-au-<time>.tar.age | tar -x -C restore
scp -r restore root@<server IP>:/root/restore
```

Then, on the server:

```
/opt/claimtidy/app/infra/hostinger/restore.sh /root/restore
```

The script asks you to type `RESTORE`, then restores the database in one transaction (if anything fails, nothing changes), the account directory (AU) and the stored files. It then starts everything again, even after a failure.

## What was tested (22 Oct 2026)

The real scripts were run on a real self-hosted Supabase stack (release `self-hosted/v0.8.3`), with the primary (AU) configuration and Caddy using local test certificates. Everything went through the HTTPS entry point:

- Email sign-up through the directory, then a session token (ES256) carrying the region stamp from the hook.
- Profile creation, a signed photo upload, the saved entry, and reading it back under the database's row rules.
- A sign-up that bypasses the directory is refused with a clear 403.
- The Supabase dashboard and the directory's `/dev` routes return 404 from outside. Supabase's gateway listens on localhost only.
- All 150 database security checks (pgTAP) pass on the self-hosted database.
- A backup decrypts with the owner's key to both database dumps and the stored files, and the encrypted file contains no readable data.
- **Restore drill:** restoring an older backup returned the data to that point (accounts, receipts and stored files). The restored account signed in and read its receipts. A failed first attempt left the database unchanged, which led to two fixes: the restore runs as Supabase's superuser, and services always restart.
- Running the deploy a second time applies no migrations twice, and every service stays healthy.
- Memory use at rest is about 700 MB of the KVM 2's 8 GB.

Not yet tested on a real Hostinger server: real certificates, DNS, and the US/UK servers calling the directory across regions. These are checked on the first real deploy.

## Local development

```
pnpm install
pnpm test:db      # starts local Supabase in Docker, rebuilds the database, runs pgTAP
pnpm test:api     # integration tests against local Supabase (the directory listens on 54390 for its hooks)
pnpm e2e:mobile   # the full stack in mobile emulation
```
