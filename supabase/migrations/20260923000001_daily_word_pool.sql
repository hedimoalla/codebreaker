-- Daily word pool: one secret 5-letter word per language per UTC day.
-- Safe to re-run in the Supabase SQL editor.

-- 1. daily_challenges must allow one row per (date, lang), and words may recur
--    once the pool has been cycled through.
alter table daily_challenges drop constraint if exists daily_challenges_pkey;
alter table daily_challenges drop constraint if exists daily_challenges_word_key;
alter table daily_challenges add primary key (date, lang);

-- 2. The pool. RLS on with no policies = invisible to clients, so upcoming
--    answers can't be scraped; only today's row in daily_challenges is public.
create table if not exists daily_word_pool (
  word text not null check (word ~ '^[A-Z]{5}$'),
  lang text not null check (lang in ('en', 'fr')),
  active boolean not null default true,
  added_at timestamptz not null default now(),
  primary key (word, lang)
);

alter table daily_word_pool enable row level security;

-- 3. Pick (or return the already-picked) word for a language and UTC date.
--    Never-used words first, then least recently used, random tie-break.
create or replace function assign_daily_word(
  p_lang text,
  p_date date default (now() at time zone 'utc')::date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_word text;
begin
  select word into v_word from daily_challenges where date = p_date and lang = p_lang;
  if found then
    return v_word;
  end if;

  select p.word into v_word
  from daily_word_pool p
  left join lateral (
    select max(d.date) as last_used
    from daily_challenges d
    where d.word = p.word and d.lang = p.lang
  ) u on true
  where p.lang = p_lang and p.active
  order by u.last_used nulls first, random()
  limit 1;

  if v_word is null then
    raise exception 'daily_word_pool has no active words for lang %', p_lang;
  end if;

  insert into daily_challenges (date, word, lang)
  values (p_date, v_word, p_lang)
  on conflict (date, lang) do nothing;

  select word into v_word from daily_challenges where date = p_date and lang = p_lang;
  return v_word;
end;
$$;

revoke all on function assign_daily_word(text, date) from public, anon, authenticated;

-- 4. Seed the pool (add more any time with the same insert shape).
insert into daily_word_pool (word, lang) values
  ('HELLO', 'en'),
  ('WORLD', 'en'),
  ('HOUSE', 'en'),
  ('MOUSE', 'en'),
  ('PHONE', 'en'),
  ('WATER', 'en'),
  ('MUSIC', 'en'),
  ('MOVIE', 'en'),
  ('LEARN', 'en'),
  ('STUDY', 'en'),
  ('LIGHT', 'en'),
  ('NIGHT', 'en'),
  ('RIGHT', 'en'),
  ('MIGHT', 'en'),
  ('FIGHT', 'en'),
  ('SIGHT', 'en'),
  ('BROWN', 'en'),
  ('GREEN', 'en'),
  ('WHITE', 'en'),
  ('BLACK', 'en'),
  ('QUICK', 'en'),
  ('QUIET', 'en'),
  ('QUEST', 'en'),
  ('QUEEN', 'en'),
  ('QUITE', 'en'),
  ('QUOTE', 'en'),
  ('SPACE', 'en'),
  ('PLACE', 'en'),
  ('GRACE', 'en'),
  ('PEACE', 'en'),
  ('BEACH', 'en'),
  ('REACH', 'en'),
  ('TEACH', 'en'),
  ('BREAK', 'en'),
  ('SPEAK', 'en'),
  ('GREAT', 'en'),
  ('CLOUD', 'en'),
  ('STORM', 'en'),
  ('RIVER', 'en'),
  ('OCEAN', 'en'),
  ('FIELD', 'en'),
  ('STONE', 'en'),
  ('GLASS', 'en'),
  ('PAPER', 'en'),
  ('TABLE', 'en'),
  ('CHAIR', 'en'),
  ('BREAD', 'en'),
  ('FRUIT', 'en'),
  ('HONEY', 'en'),
  ('SUGAR', 'en'),
  ('LEMON', 'en'),
  ('GRAPE', 'en'),
  ('APPLE', 'en'),
  ('MANGO', 'en'),
  ('BRICK', 'en'),
  ('BRUSH', 'en'),
  ('CANDY', 'en'),
  ('CHALK', 'en'),
  ('CHEST', 'en'),
  ('CLOCK', 'en'),
  ('COAST', 'en'),
  ('CROWN', 'en'),
  ('DANCE', 'en'),
  ('DREAM', 'en'),
  ('DRINK', 'en'),
  ('EAGLE', 'en'),
  ('EARTH', 'en'),
  ('FEAST', 'en'),
  ('FLAME', 'en'),
  ('FLOOR', 'en'),
  ('GHOST', 'en'),
  ('GRASS', 'en'),
  ('HEART', 'en'),
  ('HORSE', 'en'),
  ('JUICE', 'en'),
  ('KNIFE', 'en'),
  ('MAGIC', 'en'),
  ('MAPLE', 'en'),
  ('MONEY', 'en'),
  ('NORTH', 'en'),
  ('OLIVE', 'en'),
  ('ONION', 'en'),
  ('PAINT', 'en'),
  ('PEACH', 'en'),
  ('PEARL', 'en'),
  ('PIANO', 'en'),
  ('PILOT', 'en'),
  ('PLANE', 'en'),
  ('PLANT', 'en'),
  ('PLATE', 'en'),
  ('RADIO', 'en'),
  ('ROBOT', 'en'),
  ('SALAD', 'en'),
  ('SHEEP', 'en'),
  ('SHELL', 'en'),
  ('SHIRT', 'en'),
  ('SKIRT', 'en'),
  ('SLEEP', 'en'),
  ('SMILE', 'en'),
  ('SNAKE', 'en'),
  ('SPOON', 'en'),
  ('TIGER', 'en'),
  ('TOAST', 'en'),
  ('TOWER', 'en'),
  ('TRAIN', 'en'),
  ('TRUCK', 'en'),
  ('WHALE', 'en'),
  ('WHEAT', 'en'),
  ('WHEEL', 'en'),
  ('WOMAN', 'en'),
  ('BLOOM', 'en'),
  ('FROST', 'en'),
  ('LUNAR', 'en'),
  ('CABIN', 'en'),
  ('CAMEL', 'en'),
  ('CORAL', 'en'),
  ('CREEK', 'en'),
  ('DAISY', 'en'),
  ('FERRY', 'en'),
  ('GIANT', 'en'),
  ('HAPPY', 'en'),
  ('IVORY', 'en'),
  ('LASER', 'en'),
  ('MEDAL', 'en'),
  ('NOVEL', 'en'),
  ('ORBIT', 'en'),
  ('PANDA', 'en'),
  ('RANCH', 'en'),
  ('SCARF', 'en'),
  ('SOLAR', 'en'),
  ('TEETH', 'en'),
  ('UNCLE', 'en'),
  ('ACHAT', 'fr'),
  ('AIGLE', 'fr'),
  ('AMOUR', 'fr'),
  ('AMPLE', 'fr'),
  ('ANNEE', 'fr'),
  ('ARBRE', 'fr'),
  ('ASPIC', 'fr'),
  ('ASSEZ', 'fr'),
  ('AVANT', 'fr'),
  ('AVION', 'fr'),
  ('BALLE', 'fr'),
  ('BARGE', 'fr'),
  ('BLANC', 'fr'),
  ('BOITE', 'fr'),
  ('BREAK', 'fr'),
  ('BRISE', 'fr'),
  ('CANOE', 'fr'),
  ('CARGO', 'fr'),
  ('CARPE', 'fr'),
  ('CASSE', 'fr'),
  ('CHAIR', 'fr'),
  ('CHAMP', 'fr'),
  ('CHIEN', 'fr'),
  ('CLAIR', 'fr'),
  ('COBRA', 'fr'),
  ('COEUR', 'fr'),
  ('COLIS', 'fr'),
  ('CORPS', 'fr'),
  ('COUDE', 'fr'),
  ('COUPE', 'fr'),
  ('COURT', 'fr'),
  ('CRABE', 'fr'),
  ('CREUX', 'fr'),
  ('CYGNE', 'fr'),
  ('DETTE', 'fr'),
  ('DEVIS', 'fr'),
  ('DOIGT', 'fr'),
  ('DRONE', 'fr'),
  ('ECLAT', 'fr'),
  ('ECOLE', 'fr'),
  ('ENGIN', 'fr'),
  ('EPAIS', 'fr'),
  ('ETANG', 'fr'),
  ('EXIGU', 'fr'),
  ('FEMME', 'fr'),
  ('FILLE', 'fr'),
  ('FLEUR', 'fr'),
  ('FORET', 'fr'),
  ('FRERE', 'fr'),
  ('FRUIT', 'fr'),
  ('FUSEE', 'fr'),
  ('GEANT', 'fr'),
  ('GENOU', 'fr'),
  ('GLAND', 'fr'),
  ('GOLFE', 'fr'),
  ('GORGE', 'fr'),
  ('GRADE', 'fr'),
  ('GRAND', 'fr'),
  ('GUEPE', 'fr'),
  ('HERBE', 'fr'),
  ('HEURE', 'fr'),
  ('HIBOU', 'fr'),
  ('HOMME', 'fr'),
  ('IMPUR', 'fr'),
  ('JAMBE', 'fr'),
  ('JAUNE', 'fr'),
  ('JUSTE', 'fr'),
  ('KAYAK', 'fr'),
  ('LAPIN', 'fr'),
  ('LARGE', 'fr'),
  ('LEGER', 'fr'),
  ('LITRE', 'fr'),
  ('LIVRE', 'fr'),
  ('LOURD', 'fr'),
  ('MALLE', 'fr'),
  ('METRE', 'fr'),
  ('METRO', 'fr'),
  ('MILLE', 'fr'),
  ('MINCE', 'fr'),
  ('MOCHE', 'fr'),
  ('MORUE', 'fr'),
  ('MOULE', 'fr'),
  ('MULET', 'fr'),
  ('NIDEE', 'fr'),
  ('OCEAN', 'fr'),
  ('ONGLE', 'fr'),
  ('ORVET', 'fr'),
  ('PATTE', 'fr'),
  ('PERTE', 'fr'),
  ('PETIT', 'fr'),
  ('PIECE', 'fr'),
  ('PLAGE', 'fr'),
  ('PLEIN', 'fr'),
  ('PLUME', 'fr'),
  ('POIDS', 'fr'),
  ('POMME', 'fr'),
  ('PORTE', 'fr'),
  ('POSTE', 'fr'),
  ('POULE', 'fr'),
  ('PRIME', 'fr'),
  ('QUART', 'fr'),
  ('QUEUE', 'fr'),
  ('ROUGE', 'fr'),
  ('ROUTE', 'fr'),
  ('SABLE', 'fr'),
  ('SALLE', 'fr'),
  ('SALON', 'fr'),
  ('SCEAU', 'fr'),
  ('SERRE', 'fr'),
  ('SOEUR', 'fr'),
  ('TACHE', 'fr'),
  ('TALON', 'fr'),
  ('TARIF', 'fr'),
  ('TAUPE', 'fr'),
  ('TEMPS', 'fr'),
  ('TERNE', 'fr'),
  ('TERRE', 'fr'),
  ('TIERS', 'fr'),
  ('TIGRE', 'fr'),
  ('TITRE', 'fr'),
  ('TRAIN', 'fr'),
  ('TROIS', 'fr'),
  ('TRUIE', 'fr'),
  ('VACHE', 'fr'),
  ('VARAN', 'fr'),
  ('VASTE', 'fr'),
  ('VENTE', 'fr'),
  ('VINGT', 'fr'),
  ('VISON', 'fr'),
  ('WAGON', 'fr'),
  ('YACHT', 'fr'),
  ('ZEBRE', 'fr')
on conflict (word, lang) do nothing;

-- 5. Assign both languages every day at 00:01 UTC (the app looks up today's UTC date).
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'assign-daily-words';
select cron.schedule(
  'assign-daily-words',
  '1 0 * * *',
  $cron$select public.assign_daily_word('en'); select public.assign_daily_word('fr');$cron$
);

-- 6. Fill today right away.
select assign_daily_word('en') as en_today, assign_daily_word('fr') as fr_today;
