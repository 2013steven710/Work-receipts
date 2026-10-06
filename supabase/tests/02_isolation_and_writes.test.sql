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
  cat uuid; tpl uuid; crd uuid; bp uuid; st uuid; cl uuid; ccl uuid; en uuid; cv uuid; ar uuid; inv uuid;
begin
  foreach u in array array['aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'bbbbbbbb-0000-0000-0000-000000000002'::uuid] loop
    insert into profiles (owner_id, country, tax_pack, hosting_region, home_currency, date_format, time_zone)
      values (u, 'AU', 'au', 'au', 'AUD', 'DD/MM/YYYY', 'Australia/Sydney');
    insert into categories (owner_id, name) values (u, 'Taxi') returning id into cat;
    insert into form_templates (owner_id, kind) values (u, 'personal') returning id into tpl;
    insert into cards (owner_id, last4) values (u, '4821') returning id into crd;
    insert into bank_profiles (owner_id, bank_name, header_signature, layout) values (u, 'Bank', 'date,desc,amt', '{}') returning id into bp;
    insert into statements (owner_id, card_id, bank_profile_id, period_start, period_end, currency, opening_balance_minor, closing_balance_minor)
      values (u, crd, bp, '2026-09-01', '2026-09-30', 'AUD', 0, 41230) returning id into st;
    insert into claims (owner_id, kind, period_start, period_end) values (u, 'personal', '2026-09-01', '2026-09-30') returning id into cl;
    insert into claims (owner_id, kind, period_start, period_end, statement_id) values (u, 'company_card', '2026-09-01', '2026-09-30', st) returning id into ccl;
    insert into entries (owner_id, client_uuid, kind, card_type, category_id, claim_id, original_amount_minor, original_currency)
      values (u, gen_random_uuid(), 'receipt', 'personal', cat, cl, 6420, 'AUD') returning id into en;
    insert into statement_lines (owner_id, statement_id, line_no, posted_date, description, amount_minor, line_type, matched_entry_id)
      values (u, st, 1, '2026-09-14', 'QANTAS', 41230, 'purchase', en);
    insert into claim_versions (owner_id, claim_id, version, xlsx_path, pdf_path, xlsx_sha256, pdf_sha256, totals, rates_used, tax_pack_version)
      values (u, cl, 1, u || '/c.xlsx', u || '/c.pdf', repeat('a', 64), repeat('b', 64), '{}', '{}', 'au-2026.1') returning id into cv;
    insert into approvers (owner_id, email, role) values (u, 'boss@example.com', 'to');
    insert into approval_requests (owner_id, claim_version_id, approver_email) values (u, cv, 'boss@example.com') returning id into ar;
    insert into subscriptions (owner_id, status) values (u, 'trialing');
    insert into receipt_usage (owner_id, entry_id, usage_month, phase) values (u, en, '2026-09-01', 'trial');
    insert into usage_months (owner_id, usage_month, trial_count) values (u, '2026-09-01', 1);
    insert into invoices (owner_id, kind, amount_minor, currency, status) values (u, 'subscription', 500, 'AUD', 'paid') returning id into inv;
    insert into billing_provisioning (owner_id) values (u);
    insert into limits (owner_id, basic_max, paid_cap, trial_cap) values (u, 35, 200, 100);
    insert into audit_log (actor, owner_id, action) values ('system', u, 'fixture');
    insert into private.approval_secrets (approval_request_id, view_token_hash, code_verifier) values (ar, 'h', 'v');
    insert into private.stripe_customers (owner_id, stripe_customer_id) values (u, 'cus_' || left(u::text, 8));
    insert into private.stripe_invoice_refs (invoice_id, stripe_invoice_id) values (inv, 'in_' || left(u::text, 8));
    insert into storage.objects (bucket_id, name) values
      ('receipts', u || '/r1.jpg'), ('claim-packs', u || '/c.pdf'),
      ('statements', u || '/s.csv'), ('templates', u || '/t.xlsx');
  end loop;
end;
$$;

create temporary table readable (name text primary key);
insert into readable values
  ('profiles'), ('categories'), ('form_templates'), ('cards'), ('bank_profiles'), ('statements'),
  ('statement_lines'), ('claims'), ('entries'), ('claim_versions'), ('approvers'),
  ('approval_requests'), ('subscriptions');
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
  + 7                                               -- named cases and storage (c)
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

-- (c) Storage: read own objects only; no upload, overwrite or delete through the client.
select results_eq(
  $$select name from storage.objects order by name$$,
  $$values ('aaaaaaaa-0000-0000-0000-000000000001/c.pdf'), ('aaaaaaaa-0000-0000-0000-000000000001/r1.jpg'),
           ('aaaaaaaa-0000-0000-0000-000000000001/s.csv'), ('aaaaaaaa-0000-0000-0000-000000000001/t.xlsx')$$,
  '(c) A sees exactly own objects in every bucket'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('receipts', 'aaaaaaaa-0000-0000-0000-000000000001/new.jpg')$$,
  '42501', null, '(c) direct upload refused');
select is(pg_temp.affected($$update storage.objects set metadata = '{"x":1}' where bucket_id = 'receipts'$$),
          0::bigint, '(c) cannot overwrite own object');
select ok(pg_temp.refused($$delete from storage.objects where bucket_id = 'receipts'$$),
          '(c) cannot delete own object');

reset role;
select is(
  (select count(*) from storage.objects where bucket_id = 'receipts' and metadata is null),
  2::bigint, '(c) objects unchanged afterwards');

select * from finish();
rollback;
