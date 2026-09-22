-- Daily challenges table — tracks one word per day
create table daily_challenges (
  date date primary key,
  word text not null unique,
  lang text not null default 'en'
);

alter table daily_challenges enable row level security;

-- Anyone can read today's daily word
create policy "Public read daily challenge"
  on daily_challenges for select using (true);

-- Only service role can insert/update
create policy "No client write to daily challenges"
  on daily_challenges for insert with check (false);

create policy "No client update to daily challenges"
  on daily_challenges for update using (false);

-- Add daily challenge fields to profiles
alter table profiles add column if not exists daily_streak integer not null default 0;
alter table profiles add column if not exists last_daily_play_date date;
alter table profiles add column if not exists daily_best_round integer not null default 0;
