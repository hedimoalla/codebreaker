-- Turn Row-Level Security back on for every table in the public schema that has
-- it off (Supabase security advisor: rls_disabled_in_public). Existing policies
-- are untouched, so today's daily word stays publicly readable and everything
-- else stays server-only. Safe to re-run.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'Enabled RLS on public.%', t.relname;
  end loop;
end;
$$;

-- Report: every public table should now show rls_enabled = true.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by 1;
