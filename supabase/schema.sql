-- Lunchly – Datenbank für den Live-Abgleich zweier Handys (Supabase / Postgres)
--
-- Einmal im Supabase-Dashboard unter „SQL Editor“ ausführen.
--
-- Sicherheitsmodell: Die Tabellen sind per Row Level Security komplett gesperrt.
-- Die App greift nur über die Funktionen unten zu. Jede Funktion verlangt die Kopplungs-ID,
-- einen langen Zufallswert, den nur die beiden gekoppelten Handys kennen.

create table if not exists public.lunchly_pairs (
  id          text primary key check (char_length(id) >= 8),
  start_day   date not null,
  names       jsonb not null default '["", ""]'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.lunchly_days (
  pair_id     text not null references public.lunchly_pairs(id) on delete cascade,
  day         date not null,
  who         smallint not null check (who in (0, 1)),
  swipes      text not null default '',
  pos         integer not null default 0,
  pick        text,
  pick_at     timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (pair_id, day, who)
);

create table if not exists public.lunchly_wishes (
  id          text primary key,
  pair_id     text not null references public.lunchly_pairs(id) on delete cascade,
  kind        text not null default 'rezept',
  title       text not null,
  url         text,
  note        text,
  dish_id     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.lunchly_pairs  enable row level security;
alter table public.lunchly_days   enable row level security;
alter table public.lunchly_wishes enable row level security;
-- Absichtlich keine Policies: direkter Tabellenzugriff ist für die App gesperrt.

-- Paar anlegen (beim Einladen)
create or replace function public.lunchly_create_pair(p_id text, p_start date, p_names jsonb)
returns void language sql security definer set search_path = public as $$
  insert into lunchly_pairs (id, start_day, names) values (p_id, p_start, p_names)
  on conflict (id) do nothing;
$$;

-- Paar lesen (Startdatum und Namen)
create or replace function public.lunchly_get_pair(p_id text)
returns json language sql security definer set search_path = public as $$
  select json_build_object('id', id, 'start', start_day, 'names', names) from lunchly_pairs where id = p_id;
$$;

-- Eigenen Namen setzen (beim Annehmen der Einladung oder im Profil)
create or replace function public.lunchly_set_name(p_id text, p_who int, p_name text)
returns void language sql security definer set search_path = public as $$
  update lunchly_pairs set names = jsonb_set(names, array[p_who::text], to_jsonb(left(p_name, 20))) where id = p_id;
$$;

-- Eigene Swipes eines Tages speichern
create or replace function public.lunchly_put_day(p_id text, p_day date, p_who int, p_swipes text, p_pos int, p_pick text)
returns void language sql security definer set search_path = public as $$
  insert into lunchly_days (pair_id, day, who, swipes, pos, pick, pick_at, updated_at)
  select p_id, p_day, p_who, left(p_swipes, 64), p_pos, p_pick, case when p_pick is null then null else now() end, now()
  where exists (select 1 from lunchly_pairs where id = p_id)
  on conflict (pair_id, day, who) do update
    set swipes = excluded.swipes, pos = excluded.pos,
        pick = coalesce(excluded.pick, lunchly_days.pick),
        pick_at = case when excluded.pick is not null and excluded.pick is distinct from lunchly_days.pick then now() else lunchly_days.pick_at end,
        updated_at = now();
$$;

-- Swipes beider Personen ab einem Datum lesen
create or replace function public.lunchly_get_days(p_id text, p_from date)
returns table (day date, who smallint, swipes text, pos int, pick text, pick_at timestamptz)
language sql security definer set search_path = public as $$
  select day, who, swipes, pos, pick, pick_at from lunchly_days
  where pair_id = p_id and day >= p_from order by day;
$$;

-- Wunschbuch
create or replace function public.lunchly_list_wishes(p_id text)
returns setof lunchly_wishes language sql security definer set search_path = public as $$
  select * from lunchly_wishes where pair_id = p_id order by created_at desc;
$$;

create or replace function public.lunchly_put_wish(p_id text, p_wish jsonb)
returns void language sql security definer set search_path = public as $$
  insert into lunchly_wishes (id, pair_id, kind, title, url, note, dish_id, created_at, updated_at)
  select p_wish->>'id', p_id, coalesce(p_wish->>'kind', 'rezept'), left(p_wish->>'title', 80),
         left(p_wish->>'url', 500), left(p_wish->>'note', 5000), p_wish->>'dishId',
         coalesce(to_timestamp((p_wish->>'at')::bigint / 1000.0), now()), now()
  where exists (select 1 from lunchly_pairs where id = p_id)
  on conflict (id) do update
    set kind = excluded.kind, title = excluded.title, url = excluded.url, note = excluded.note, updated_at = now()
    where lunchly_wishes.pair_id = p_id;
$$;

create or replace function public.lunchly_delete_wish(p_id text, p_wish_id text)
returns void language sql security definer set search_path = public as $$
  delete from lunchly_wishes where pair_id = p_id and id = p_wish_id;
$$;

grant execute on function
  public.lunchly_create_pair(text, date, jsonb),
  public.lunchly_get_pair(text),
  public.lunchly_set_name(text, int, text),
  public.lunchly_put_day(text, date, int, text, int, text),
  public.lunchly_get_days(text, date),
  public.lunchly_list_wishes(text),
  public.lunchly_put_wish(text, jsonb),
  public.lunchly_delete_wish(text, text)
to anon, authenticated;
