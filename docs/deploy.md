# ClaimTidy: Deployment

How the three regional stacks (build plan section 4) are deployed. **Nothing is deployed yet**: the accounts below belong to the product owner and haven't been created.

## What runs where

| Region | Supabase project | Cloud Run region | GitHub environment |
|---|---|---|---|
| AU | Sydney (`ap-southeast-2`) | `australia-southeast1` | `au` |
| US | N. Virginia (`us-east-1`) | `us-east4` | `us` |
| UK | London (`eu-west-2`) | `europe-west2` | `uk` |

The **account directory** (`apps/directory`) is one global service, hosted in Sydney with its own small Postgres database. It's deployed by the same workflow after the three regions.

## One-time setup (product owner)

1. **Supabase:** create three Pro projects in the regions above. Note each project's reference ID and database password.
2. **Google Cloud:** one project with the Cloud Run and Artifact Registry APIs enabled. In each of the three regions, create an Artifact Registry Docker repository named `claimtidy`. Set up Workload Identity Federation for this GitHub repository, with a deploy service account that has Cloud Run Admin, Artifact Registry Writer and Service Account User.
3. **GitHub:** create environments `au`, `us` and `uk`. In each, set:
   - secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`
   - variables: `SUPABASE_PROJECT_REF`, `GCP_PROJECT`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `APP_ORIGIN` (`https://claimtidy.com`)
4. **Account directory:**
   - Create a small Postgres database for it (a fourth, Free or Micro Supabase project in Sydney works).
   - In Google Secret Manager, create: `directory-database-url`, `directory-key-secret`, `directory-ticket-secret`, `directory-code-secret` (each a random string of 32+ characters; **never change `directory-key-secret`**, because every stored identity is keyed with it), `directory-regions` (JSON: for `au`, `us`, `uk`, the Supabase URL, service key, anon key and hook secret), and `postmark-token`.
   - Create a GitHub environment `directory` with variables `GOOGLE_CLIENT_ID` and `MICROSOFT_CLIENT_ID` (from the Google OAuth client and the Microsoft Entra app registration), plus the GCP variables above.
   - In **each** regional Supabase project, enable two Auth hooks of type HTTPS: "Before user created" → `https://<directory-url>/hooks/<region>/before-user-created`, and "Customize access token" → `https://<directory-url>/hooks/<region>/custom-access-token`. Generate a hook secret for each region and put it in `directory-regions`.
   - In each regional project, turn **on** email confirmations, and enable Google and Azure (Microsoft) sign-in with the same client IDs, so the app's `signInWithIdToken` works.
5. Run the **Deploy** workflow (Actions → Deploy → Run workflow). It applies migrations and deploys the API to AU, then US, then UK, stopping at the first failure.

## Still to verify on the hosted projects (M0 carry-over)

- Both Supabase Auth hooks run on each hosted project. They already run against local Supabase in the integration tests (`pnpm test:api`). If a hosted plan lacks HTTP hooks, use the fallback in build plan section 4 (sign-ups disabled per region; accounts created only by the directory service).

## Local development

```
pnpm install
pnpm test:db      # starts local Supabase in Docker, rebuilds the database, runs pgTAP
pnpm test:api     # integration tests against local Supabase (the directory listens on 54390 for its hooks)
pnpm --filter @claimtidy/web dev
```
