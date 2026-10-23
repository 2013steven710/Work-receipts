-- M0 (a), (b), (c), (d), behavioural half: real rows for two users, then act as user A.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

-- ---------------------------------------------------------------------------------------------
-- Fixtures (as postgres): users A and B each own one row in every owned table.
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com');

do $$
declare
  u uuid;
  ar uuid; inv uuid;
begin
  foreach u in array array['aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'bbbbbbbb-0000-0000-0000-000000000002'::uuid] loop
    insert into profiles (owner_id, country, tax_pack, home_currency, date_format, time_zone)
      values (u, 'AU', 'au', 'AUD', 'DD/MM/YYYY', 'Australia/Sydney');
    insert into approval_requests (owner_id, claim_label, claim_kind, total_minor, currency, approver_email)
      values (u, 'Personal claim, Sep 2026', 'personal', 6420, 'AUD', 'boss@example.com') returning id into ar;
    insert into subscriptions (owner_id, status) values (u, 'trialing');
    insert into receipt_usage (owner_id, receipt_id, usage_month, phase) values (u, gen_random_uuid(), '2026-09-01', 'trial');
    insert into usage_months (owner_id, usage_month, trial_count) values (u, '2026-09-01', 1);
    insert into invoices (owner_id, kind, amount_minor, currency, status) values (u, 'subscription', 500, 'AUD', 'paid') returning id into inv;
    insert into billing_provisioning (owner_id) values (u);
    insert into limits (owner_id, basic_max, paid_cap, trial_cap) values (u, 35, 200, 100);
    insert into audit_log (actor, owner_id, action) values ('system', u, 'fixture');
    insert into private.approval_secrets (approval_request_id, view_token_hash, code_verifier) values (ar, 'h', 'v');
    insert into private.stripe_customers (owner_id, stripe_customer_id) values (u, 'cus_' || left(u::text, 8));
    insert into private.stripe_invoice_refs (invoice_id, stripe_invoice_id) values (inv, 'in_' || left(u::text, 8));
  end loop;
end;
$$;

create temporary table readable (name text primary key);
insert into readable values ('profiles'), ('approval_requests'), ('subscriptions');
create temporary table all_tables as
  select tablename::text as name,
         (select a.attname::text from pg_attribute a
          where a.attrelid = format('public.%I', t.tablename)::regclass and a.attnum > 0 and not a.attisdropped and a.attidentity = '' and a.attgenerated = ''
          order by a.attnum limit 1) as first_col
  from pg_tables t where schemaname = 'public';
create temporary table private_tables as select tablename::text as name from pg_tables where schemaname = 'private';
grant select on readable, all_tables, private_tables to authenticated;

-- Counts rows of one table, split by ownership (runs as the calling role).
create function pg_temp.count_rows(t text, own boolean) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I where (owner_id = auth.uid()) = $1', t) into n using own;
  return n;
end;
$$;

-- Runs a statement and returns how many rows it changed.
create function pg_temp.affected(sql text) returns bigint language plpgsql as $f$
declare n bigint;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end;
$f$;

-- True when a statement is refused: it raises, or RLS lets it change nothing.
create function pg_temp.refused(sql text) returns boolean language plpgsql as $f$
begin
  return pg_temp.affected(sql) = 0;
exception when others then
  return true;
end;
$f$;

select plan(
  (select count(*)::int * 2 from readable)          -- (a) own rows visible, others' rows invisible
  + (select count(*)::int * 4 from all_tables)      -- (b) insert / update / delete / truncate refused
  + (select count(*)::int - (select count(*)::int from readable) from all_tables) -- server-only tables unreadable
  + (select count(*)::int from private_tables)      -- (d) private tables unreadable
  + 5                                               -- named cases and storage (c)
);

-- ---------------------------------------------------------------------------------------------
-- Act as user A.
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- (a) Read isolation on every readable table.

select cmp_ok(pg_temp.count_rows(name, true), '>', 0::bigint, format('(a) %s: A sees own rows', name)) from readable;
select is(pg_temp.count_rows(name, false), 0::bigint, format('(a) %s: A sees none of B''s rows', name)) from readable;

-- Server-only tables are not readable at all.
select throws_ok(format('select 1 from public.%I limit 1', name), '42501', null,
                 format('server-only %s is not readable', name))
from all_tables where name not in (select name from readable);

-- (b) No writes anywhere, including own rows.
select throws_ok(format('insert into public.%I default values', name), '42501', null,
                 format('(b) %s: insert refused', name)) from all_tables;
select throws_ok(format('update public.%I set %I = %I', name, first_col, first_col), '42501', null,
                 format('(b) %s: update refused, even own rows', name)) from all_tables;
select throws_ok(format('delete from public.%I', name), '42501', null,
                 format('(b) %s: delete refused, even own rows', name)) from all_tables;
select throws_ok(format('truncate public.%I', name), '42501', null,
                 format('(b) %s: truncate refused', name)) from all_tables;

-- Named cases from the M0 acceptance criteria.
select throws_ok($$update public.profiles set trial_started_at = now() + interval '10 years'$$,
                 '42501', null, '(b) cannot extend own trial');
select throws_ok($$update public.approval_requests set decision = 'approved'$$,
                 '42501', null, '(b) cannot approve own claim');

-- (d) Secrets unreadable.
select throws_ok(format('select 1 from private.%I limit 1', name), '42501', null,
                 format('(d) private.%s is not readable', name)) from private_tables;

-- (c) Storage: ClaimTidy keeps no files, so there are no buckets and clients can't create any.
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('receipts', 'aaaaaaaa-0000-0000-0000-000000000001/new.jpg')$$,
  null, null, '(c) no file can be stored through the client');
select throws_ok(
  $$insert into storage.buckets (id, name) values ('sneaky', 'sneaky')$$,
  '42501', null, '(c) clients cannot create a bucket');

reset role;
select is((select count(*) from storage.buckets), 0::bigint, '(c) no storage buckets exist');

select * from finish();
rollback;
