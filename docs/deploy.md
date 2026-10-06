# ClaimTidy: Deployment

How the three regional stacks (build plan section 4) are deployed. **Nothing is deployed yet**: the accounts below belong to the product owner and haven't been created.

## What runs where

| Region | Supabase project | Cloud Run region | GitHub environment |
|---|---|---|---|
| AU | Sydney (`ap-southeast-2`) | `australia-southeast1` | `au` |
| US | N. Virginia (`us-east-1`) | `us-east4` | `us` |
| UK | London (`eu-west-2`) | `europe-west2` | `uk` |

The global account directory (AU-hosted) and the web app's origin are added in M1.

## One-time setup (product owner)

1. **Supabase:** create three Pro projects in the regions above. Note each project's reference ID and database password.
2. **Google Cloud:** one project with the Cloud Run and Artifact Registry APIs enabled. In each of the three regions, create an Artifact Registry Docker repository named `claimtidy`. Set up Workload Identity Federation for this GitHub repository, with a deploy service account that has Cloud Run Admin, Artifact Registry Writer and Service Account User.
3. **GitHub:** create environments `au`, `us` and `uk`. In each, set:
   - secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`
   - variables: `SUPABASE_PROJECT_REF`, `GCP_PROJECT`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `APP_ORIGIN` (`https://claimtidy.com`)
4. Run the **Deploy** workflow (Actions → Deploy → Run workflow). It applies migrations and deploys the API to AU, then US, then UK, stopping at the first failure.

## Still to verify on the hosted projects (M0 carry-over)

- Both Supabase Auth hooks ("before user created" and "custom access token") run on each project. If not, use the fallback in build plan section 4 (sign-ups disabled per region; accounts created only by the directory service). The hooks themselves are built in M1.

## Local development

```
pnpm install
pnpm test:db      # starts local Supabase in Docker, rebuilds the database, runs pgTAP
pnpm --filter @claimtidy/web dev
```
