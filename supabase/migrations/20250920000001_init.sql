-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================================
-- profiles table — mirrors localStorage game state, synced per user
-- ============================================================================
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  shards integer not null default 50,
  correct_guesses integer not null default 0,
  total_attempts integer not null default 0,
  best_round integer not null default 0,
  best_streak integer not null default 0,
  fastest_solve_ms integer,
  solved_ambiguous_count integer not null default 0,
  has_seen_rules boolean not null default false,
  achievements jsonb not null default '{}',
  purchases jsonb not null default '{}',
  settings jsonb not null default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table profiles enable row level security;

-- Users can only read/update/insert their own profile
create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- ============================================================================
-- words table — server-side word dictionary (populated by migration script)
-- Used for server-side move validation in ranked mode (Phase 4)
-- ============================================================================
create table words (
  word text not null,
  length integer not null,
  lang text not null,
  primary key (word, lang)
);

alter table words enable row level security;

-- No select policy: words are not exposed to clients (answer word kept secret).
-- Only service role can read/write words.
create policy "No client access to words"
  on words using (false);

-- ============================================================================
-- ranked_sessions table — in-flight ranked rounds (server-side only)
-- Stores the answer word (never sent to client) and round state
-- ============================================================================
create table ranked_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  difficulty text not null, -- 'easy', 'medium', 'hard'
  language text not null default 'en', -- 'en' or 'fr'
  round integer not null default 1,
  streak integer not null default 0,
  answer_word text not null, -- KEPT SECRET: never sent to client
  scrambled_sequence text not null, -- Sent to client
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id, difficulty, language)
);

alter table ranked_sessions enable row level security;

-- No policies: only service role can access (for server-side edge functions)
create policy "No client access to sessions"
  on ranked_sessions using (false);

-- ============================================================================
-- leaderboard table — public leaderboard entries
-- Updated server-side when users reach new best rounds in ranked mode
-- ============================================================================
create table leaderboard (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  display_name text,
  difficulty text not null, -- 'easy', 'medium', 'hard'
  language text not null default 'en',
  best_round integer not null,
  achieved_at timestamp with time zone default now(),
  unique(user_id, difficulty, language)
);

alter table leaderboard enable row level security;

-- Anyone can read leaderboard
create policy "Public leaderboard read"
  on leaderboard for select using (true);

-- Only service role can write (via edge functions)
create policy "No client write to leaderboard"
  on leaderboard for insert with check (false);

create policy "No client update to leaderboard"
  on leaderboard for update using (false);

-- ============================================================================
-- Indexes for performance
-- ============================================================================
create index idx_leaderboard_difficulty_language
  on leaderboard(difficulty, language, best_round desc);

create index idx_ranked_sessions_user_difficulty_language
  on ranked_sessions(user_id, difficulty, language);
