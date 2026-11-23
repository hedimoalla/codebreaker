-- Restore public read access to daily words now that RLS is enforced on
-- daily_challenges. Only today's and past words are visible, so a word assigned
-- ahead of time can't be read early. Writes stay server-only (no write policies).
drop policy if exists "Public read daily challenge" on daily_challenges;

create policy "Public read daily challenge"
  on daily_challenges for select
  to anon, authenticated
  using (date <= (now() at time zone 'utc')::date);
