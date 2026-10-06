-- ClaimTidy Release 1 schema (build plan section 5).
--
-- Access model:
--   * Clients (anon, authenticated) can never write to any table. All changes go through the API,
--     which uses the service role inside server code only.
--   * Signed-in users get SELECT on their own rows in the "user-readable" tables below.
--   * Server-only tables (billing, counters, parameters, audit) are not readable by clients at all.
--   * Secrets (tokens, code verifiers, attempt counters, Stripe identifiers) live in the `private`
--     schema, which is not exposed through the Data API and has no grants for client roles.
--
-- Every owned table has owner_id (R1: the user). R2 adds workspace_id; the column exists now so
-- R2 adds policies rather than rewriting tables.
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

create table public.profiles (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid,
  country text not null check (country ~ '^[A-Z]{2}$'),
  tax_pack text not null check (tax_pack in ('au', 'us', 'uk', 'generic')),
  hosting_region text not null check (hosting_region in ('au', 'us', 'uk')),
  home_currency text not null check (home_currency ~ '^[A-Z]{3}$'),
  date_format text not null check (date_format in ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD')),
  time_zone text not null,
  holiday_region text, -- optional state or territory (AU, US)
  trial_started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  name text not null check (length(name) between 1 and 80),
  icon text,
  colour text check (colour is null or colour ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.categories (owner_id);

create table public.form_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  kind text not null check (kind in ('personal', 'company_card')),
  file_path text, -- null means the built-in default form
  column_mapping jsonb,
  totals_block jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.form_templates (owner_id);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  label text,
  created_at timestamptz not null default now()
);
create index on public.cards (owner_id);

create table public.bank_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  bank_name text not null,
  header_signature text not null, -- normalised CSV header row, used to recognise the bank next time
  layout jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, header_signature)
);

create table public.statements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  card_id uuid not null references public.cards (id) on delete cascade,
  bank_profile_id uuid references public.bank_profiles (id) on delete set null,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  opening_balance_minor bigint not null,
  closing_balance_minor bigint not null,
  file_path text,
  created_at timestamptz not null default now()
);
create index on public.statements (owner_id);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  kind text not null check (kind in ('personal', 'company_card')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  statement_id uuid references public.statements (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'paid')),
  final_status_at timestamptz, -- retention clock for submitted material
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'company_card') = (statement_id is not null))
);
create index on public.claims (owner_id);
-- One personal claim per calendar month (concept section 4).
create unique index claims_one_personal_per_month on public.claims (owner_id, period_start) where kind = 'personal';
create unique index claims_one_per_statement on public.claims (statement_id) where kind = 'company_card';

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  client_uuid uuid not null, -- idempotent offline sync key
  kind text not null check (kind in ('receipt', 'note')),
  card_type text not null check (card_type in ('personal', 'company')),
  category_id uuid references public.categories (id) on delete set null,
  claim_id uuid references public.claims (id) on delete set null,
  txn_date date,
  merchant text,
  description text,
  original_amount_minor bigint,
  original_currency text check (original_currency is null or original_currency ~ '^[A-Z]{3}$'),
  fx_rate text check (fx_rate is null or fx_rate ~ '^[0-9]+(\.[0-9]+)?$'),
  home_amount_minor bigint,
  home_currency text check (home_currency is null or home_currency ~ '^[A-Z]{3}$'),
  tax_minor bigint,
  supplier_tax_number text,
  image_path text,
  ai_read jsonb,
  explanation text,
  explanation_status text check (explanation_status in ('pending', 'accepted', 'rejected')),
  perceptual_hash text,
  created_at timestamptz not null default now(), -- retention clock for drafts (created or imported)
  updated_at timestamptz not null default now(),
  unique (owner_id, client_uuid)
);
create index on public.entries (owner_id, txn_date);
create index on public.entries (claim_id);

create table public.statement_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  statement_id uuid not null references public.statements (id) on delete cascade,
  line_no integer not null,
  posted_date date not null,
  description text not null,
  amount_minor bigint not null,
  line_type text not null check (line_type in ('purchase', 'refund', 'fee', 'payment')),
  matched_entry_id uuid references public.entries (id) on delete set null,
  explanation text,
  explanation_status text check (explanation_status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (statement_id, line_no)
);
create index on public.statement_lines (owner_id);

create table public.claim_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  claim_id uuid not null references public.claims (id) on delete cascade,
  version integer not null check (version >= 1),
  xlsx_path text not null,
  pdf_path text not null,
  xlsx_sha256 text not null check (xlsx_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  totals jsonb not null,
  rates_used jsonb not null,
  tax_pack_version text not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected', 'paid', 'superseded')),
  status_history jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (claim_id, version)
);
create index on public.claim_versions (owner_id);

-- A submitted version is a frozen snapshot: only its status may change.
create or replace function private.freeze_claim_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.owner_id, new.claim_id, new.version, new.xlsx_path, new.pdf_path, new.xlsx_sha256,
      new.pdf_sha256, new.totals, new.rates_used, new.tax_pack_version, new.submitted_at)
     is distinct from
     (old.owner_id, old.claim_id, old.version, old.xlsx_path, old.pdf_path, old.xlsx_sha256,
      old.pdf_sha256, old.totals, old.rates_used, old.tax_pack_version, old.submitted_at) then
    raise exception 'claim versions are immutable' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger claim_versions_frozen before update on public.claim_versions
  for each row execute function private.freeze_claim_version();

create table public.approvers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+$'),
  role text not null check (role in ('to', 'cc')),
  created_at timestamptz not null default now(),
  unique (owner_id, email)
);
-- Exactly one designated approver (To) per owner; finance and others are Cc.
create unique index approvers_one_to on public.approvers (owner_id) where role = 'to';

-- Holds no verification material: tokens, verifiers, expiry and attempts are in private.approval_secrets.
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid,
  claim_version_id uuid not null references public.claim_versions (id) on delete cascade,
  approver_email text not null,
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  comment text,
  verified_via text check (verified_via in ('email_code')),
  sent_at timestamptz not null default now(),
  viewed_at timestamptz,
  decided_at timestamptz
);
create index on public.approval_requests (owner_id);

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

create table public.receipt_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  entry_id uuid not null unique, -- one counted read per entry; no FK so counts survive entry deletion
  usage_month date not null check (extract(day from usage_month) = 1),
  read_at timestamptz not null default now(),
  phase text not null check (phase in ('trial', 'paid')),
  counted boolean not null default true,
  uncounted_reason text check (uncounted_reason in ('undo', 'duplicate_deleted')),
  check (counted or uncounted_reason is not null)
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
  foreach t in array array['profiles', 'categories', 'form_templates', 'bank_profiles', 'claims',
                           'entries', 'subscriptions', 'invoices'] loop
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

  foreach t in array array['profiles', 'categories', 'form_templates', 'cards', 'bank_profiles',
                           'statements', 'statement_lines', 'claims', 'entries', 'claim_versions',
                           'approvers', 'approval_requests', 'subscriptions'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))',
                   'own rows readable', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Storage: private buckets, objects stored under "<owner_id>/...".
-- Clients may read their own objects only. Uploads use short-lived signed upload URLs issued by the
-- API (no overwrite); deletion happens only through the API.
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('receipts', 'receipts', false, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  ('claim-packs', 'claim-packs', false, 52428800, array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('statements', 'statements', false, 10485760, array['text/csv', 'text/plain', 'application/vnd.ms-excel']),
  ('templates', 'templates', false, 10485760, array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

create policy "own objects readable" on storage.objects for select to authenticated
  using (
    bucket_id in ('receipts', 'claim-packs', 'statements', 'templates')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
