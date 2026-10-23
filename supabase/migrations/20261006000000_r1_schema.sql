-- ClaimTidy Release 1 schema (build plan sections 5 and 15).
--
-- v13: ClaimTidy never stores receipts. Receipt photos and details live on the user's phone and in
-- their own Google Drive or OneDrive. This database holds only:
--   * the account (profile settings),
--   * the subscription (status, invoices, provisioning),
--   * monthly receipt counts (numbers keyed by a receipt's random ID, no content),
--   * short-lived approval records (deleted 90 days after the decision) and one-time codes,
--   * reference data (tax-pack parameters, FX rates, limits, paid countries),
--   * an append-only audit log of metadata.
--
-- Access model:
--   * Clients (anon, authenticated) can never write to any table. All changes go through the API,
--     which uses the service role inside server code only.
--   * Signed-in users get SELECT on their own rows in the few "user-readable" tables below.
--   * Server-only tables are not readable by clients at all.
--   * Secrets (code verifiers, attempt counters, Stripe identifiers) live in the `private` schema,
--     which is not exposed through the Data API and has no grants for client roles.
--
-- Money is integer minor units (bigint) plus an ISO 4217 code. FX rates are decimal strings.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Nothing created by this or later migrations is granted to client roles by default.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema private revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema private revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% on %.% is not allowed', tg_op, tg_table_schema, tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- User-readable tables
-- ---------------------------------------------------------------------------------------------

-- Account settings from the country question. No receipt data.
create table public.profiles (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid,
  country text not null check (country ~ '^[A-Z]{2}$'),
  tax_pack text not null check (tax_pack in ('au', 'us', 'uk', 'generic')),
  home_currency text not null check (home_currency ~ '^[A-Z]{3}$'),
  date_format text not null check (date_format in ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD')),
  time_zone text not null,
  holiday_region text, -- optional state or territory (AU, US)
  trial_started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One request per claim sent for approval. Holds no receipts: just enough to show the approver
-- what they're deciding and tell the claimant the outcome. Deleted 90 days after the decision.
-- Code verifiers, expiry and attempts are in private.approval_secrets.
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  claim_label text not null check (length(claim_label) between 1 and 120), -- e.g. "Personal claim, Oct 2026"
  claim_kind text not null check (claim_kind in ('personal', 'company_card')),
  total_minor bigint not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  version integer not null default 1 check (version >= 1),
  approver_email text not null check (approver_email ~ '^[^@\s]+@[^@\s]+$'),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  comment text check (length(comment) <= 2000),
  verified_via text check (verified_via in ('email_code')),
  sent_at timestamptz not null default now(),
  viewed_at timestamptz,
  decided_at timestamptz,
  paid_at timestamptz,
  check ((decision = 'pending') = (decided_at is null))
);
create index on public.approval_requests (owner_id);
create index on public.approval_requests (decided_at) where decided_at is not null;

create table public.subscriptions (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  status text not null check (status in ('trialing', 'active', 'past_due', 'unpaid', 'canceled',
                                         'incomplete', 'incomplete_expired')),
  current_period_end timestamptz,
  past_due_since timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Server-only tables (no client access at all)
-- ---------------------------------------------------------------------------------------------

-- One row per receipt that had an AI read: a count, never content. receipt_id is the random ID
-- the phone gave the receipt, so retries never count twice.
create table public.receipt_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  receipt_id uuid not null,
  usage_month date not null check (extract(day from usage_month) = 1),
  read_at timestamptz not null default now(),
  phase text not null check (phase in ('trial', 'paid')),
  counted boolean not null default true,
  uncounted_reason text check (uncounted_reason in ('undo', 'duplicate_deleted')),
  check (counted or uncounted_reason is not null),
  unique (owner_id, receipt_id)
);
create index on public.receipt_usage (owner_id, usage_month);

create table public.usage_months (
  owner_id uuid not null references auth.users (id) on delete cascade,
  usage_month date not null check (extract(day from usage_month) = 1),
  trial_count integer not null default 0 check (trial_count >= 0),
  paid_count integer not null default 0 check (paid_count >= 0),
  tier text check (tier in ('basic', 'premium')),
  trial_cap_reached boolean not null default false,
  paid_cap_reached boolean not null default false,
  closed_at timestamptz,
  primary key (owner_id, usage_month)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('subscription', 'topup')),
  amount_minor bigint not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('draft', 'open', 'paid', 'void', 'uncollectible')),
  first_failed_at timestamptz, -- recorded once, never moved (BP-016)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.invoices (owner_id);

create table public.paid_countries (
  country text primary key check (country ~ '^[A-Z]{2}$'),
  tax_threshold_minor bigint,
  threshold_currency text check (threshold_currency is null or threshold_currency ~ '^[A-Z]{3}$'),
  added_at timestamptz not null default now()
);
insert into public.paid_countries (country) values ('AU'), ('US');

create table public.billing_provisioning (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  state text not null default 'none' check (state in ('none', 'provisioning', 'pending_payment', 'subscribed')),
  updated_at timestamptz not null default now()
);

create table public.checkout_session_results (
  checkout_session_id text primary key,
  owner_id uuid, -- kept after account deletion as a tombstoned outcome
  purpose text not null check (purpose in ('subscribe', 'replace_card')),
  outcome text not null check (outcome in ('subscription_created', 'card_saved', 'refused', 'tombstoned')),
  stripe_subscription_id text,
  recorded_at timestamptz not null default now()
);

create table public.tax_packs (
  pack text not null check (pack in ('au', 'us', 'uk', 'generic')),
  valid_from date not null,
  params jsonb not null,
  primary key (pack, valid_from)
);

create table public.fx_rates (
  rate_date date not null,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency text not null check (quote_currency ~ '^[A-Z]{3}$'),
  rate text not null check (rate ~ '^[0-9]+(\.[0-9]+)?$'),
  source text not null check (source in ('reference', 'owner_override')),
  primary key (rate_date, base_currency, quote_currency)
);

create table public.limits (
  owner_id uuid references auth.users (id) on delete cascade, -- null = default for everyone
  basic_max integer not null check (basic_max > 0),
  paid_cap integer not null check (paid_cap > 0),
  trial_cap integer not null check (trial_cap > 0),
  updated_at timestamptz not null default now()
);
create unique index limits_default on public.limits ((owner_id is null)) where owner_id is null;
create unique index limits_per_account on public.limits (owner_id) where owner_id is not null;
insert into public.limits (owner_id, basic_max, paid_cap, trial_cap) values (null, 35, 200, 100);

-- Append-only: metadata only, never receipt content.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null, -- 'user:<uuid>', 'owner:<uuid>', 'system', 'approver:<request id>'
  owner_id uuid, -- the affected account; no FK so the record survives account deletion
  action text not null,
  subject_type text,
  subject_id text,
  details jsonb not null default '{}'::jsonb
);
create index on public.audit_log (owner_id, at);
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function private.forbid_change();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.forbid_change();

-- ---------------------------------------------------------------------------------------------
-- Private (secrets): never exposed to clients
-- ---------------------------------------------------------------------------------------------

create table private.approval_secrets (
  approval_request_id uuid primary key references public.approval_requests (id) on delete cascade,
  view_token_hash text not null,
  code_verifier text, -- HMAC(server secret, request id || code); deleted when consumed
  code_expires_at timestamptz,
  code_attempts integer not null default 0 check (code_attempts between 0 and 5)
);

create table private.stripe_customers (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique
);

create table private.stripe_invoice_refs (
  invoice_id uuid primary key references public.invoices (id) on delete cascade,
  stripe_invoice_id text not null unique
);

create table private.usage_month_refs (
  owner_id uuid not null,
  usage_month date not null,
  topup_invoice_item_id text not null unique,
  primary key (owner_id, usage_month),
  foreign key (owner_id, usage_month) references public.usage_months (owner_id, usage_month) on delete cascade
);

-- Kept with the tax records after account deletion (BP-018).
create table private.billing_tombstones (
  stripe_customer_id text primary key,
  deletion_state text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['profiles', 'subscriptions', 'invoices'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()',
                   t || '_touch_updated_at', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants and row-level security
-- ---------------------------------------------------------------------------------------------

-- Start from nothing, then grant only SELECT on the user-readable tables.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

do $$
declare t text;
begin
  -- RLS on every table, readable or not, so a mistaken grant still exposes nothing.
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;

  foreach t in array array['profiles', 'approval_requests', 'subscriptions'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))',
                   'own rows readable', t);
  end loop;
end;
$$;

-- No storage buckets: ClaimTidy keeps no files (v13).
