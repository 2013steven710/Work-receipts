-- M0 (b) and (d), structural half: every table, present and future, is checked from the catalog.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

-- The only tables a signed-in user may read (their own rows).
create temporary table readable (name text primary key) on commit drop;
insert into readable values
  ('profiles'), ('categories'), ('form_templates'), ('cards'), ('bank_profiles'), ('statements'),
  ('statement_lines'), ('claims'), ('entries'), ('claim_versions'), ('approvers'),
  ('approval_requests'), ('subscriptions');

select is_empty($$
  select format('%s.%s %s %s', g.table_schema, g.table_name, g.grantee, g.privilege_type)
  from information_schema.role_table_grants g
  where g.table_schema in ('public', 'private')
    and g.grantee in ('anon', 'authenticated', 'PUBLIC')
    and g.privilege_type <> 'SELECT'
$$, '(b) client roles hold no write privilege (INSERT/UPDATE/DELETE/TRUNCATE/...) on any table');

select is_empty($$
  select format('%s.%s', table_schema, table_name)
  from information_schema.role_table_grants
  where table_schema in ('public', 'private') and grantee in ('anon', 'PUBLIC')
$$, 'anon has no privilege on any table');

select is_empty($$
  select g.table_name
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.grantee = 'authenticated' and g.privilege_type = 'SELECT'
    and g.table_name not in (select name from readable)
$$, 'authenticated can SELECT only the user-readable tables (server-only tables are hidden)');

select is_empty($$
  select g.table_name
  from information_schema.column_privileges g
  where g.table_schema in ('public', 'private') and g.grantee in ('anon', 'authenticated')
    and g.privilege_type <> 'SELECT'
$$, 'no column-level write privileges for client roles');

select is_empty($$
  select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and not (c.relrowsecurity and c.relforcerowsecurity)
$$, 'every public table has row-level security enabled and forced');

select is_empty($$
  select r.name
  from readable r
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = r.name and p.cmd = 'SELECT'
      and p.qual like '%owner_id = ( SELECT auth.uid()%'
  )
$$, 'each readable table has an owner-only SELECT policy');

select is_empty($$
  select format('%s: %s', p.tablename, p.policyname)
  from pg_policies p
  where p.schemaname = 'public'
    and (p.cmd <> 'SELECT'
         or p.tablename not in (select name from readable)
         or p.qual is distinct from '(owner_id = ( SELECT auth.uid() AS uid))')
$$, 'no other policy exists on public tables (no write policies, no wider read policies)');

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE')
  and not has_schema_privilege('authenticated', 'private', 'USAGE'),
  '(d) the private schema is not usable by client roles'
);

select is_empty($$
  select format('%s.%s', c.table_name, c.column_name)
  from information_schema.columns c
  join readable r on r.name = c.table_name
  where c.table_schema = 'public'
    and c.column_name ~* '(token|verifier|secret|stripe|attempt|password|otp)'
$$, '(d) no secret-like column exists in any user-readable table');

select is_empty($$
  select format('%s.%s', v.table_schema, v.table_name)
  from information_schema.role_table_grants v
  join information_schema.views w using (table_schema, table_name)
  where v.table_schema = 'public' and v.grantee in ('anon', 'authenticated')
$$, '(d) no views are exposed to client roles');

select * from finish();
rollback;
