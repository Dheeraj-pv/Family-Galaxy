-- The Family Galaxy — Supabase schema + Row Level Security policies.
--
-- Write access is deliberately open (anyone with the site link can add a postcard or a moment,
-- same trust model the app already had with localStorage) — there's no login. What this file
-- actually guards against is a stray or malicious script filling the free tier with junk: every
-- column is constrained (lengths, valid years, a photo must point at this project's own Storage),
-- not just left as free-form text.
--
-- To apply: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / OR REPLACE / DROP...IF EXISTS.

-- ---- postcards -----------------------------------------------------------------------------
-- Mirrors the shape in js/postcards/postcardModel.js. Only user-added postcards live here;
-- family.json's own seed postcards stay in that static file, read-only, as before.

create table if not exists postcards (
  id text primary key,
  person_id text not null check (char_length(person_id) > 0),
  sender text not null check (char_length(sender) > 0 and char_length(sender) <= 60),
  note text not null check (char_length(note) > 0 and char_length(note) <= 200),
  date text check (date is null or date ~ '^\d{4}-\d{2}-\d{2}$'),
  photo text check (photo is null or photo ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/'),
  created_at timestamptz not null default now()
);

alter table postcards enable row level security;

drop policy if exists "postcards are readable by anyone" on postcards;
create policy "postcards are readable by anyone" on postcards for select using (true);

drop policy if exists "postcards are writable by anyone" on postcards;
create policy "postcards are writable by anyone" on postcards for insert with check (true);

drop policy if exists "postcards are editable by anyone" on postcards;
create policy "postcards are editable by anyone" on postcards for update using (true) with check (true);

drop policy if exists "postcards are deletable by anyone" on postcards;
create policy "postcards are deletable by anyone" on postcards for delete using (true);

-- ---- events (the timeline's user-added "moments") -------------------------------------------
-- Mirrors js/timeline/eventModel.js. family.json's own events stay static, as before.

create table if not exists events (
  id text primary key,
  year int not null check (year between 1800 and 2200),
  month int check (month is null or month between 1 and 12),
  day int check (day is null or day between 1 and 31),
  person_id text,
  label text not null check (char_length(label) > 0 and char_length(label) <= 40),
  color text not null check (color in ('maternal', 'paternal', 'shared')),
  created_at timestamptz not null default now()
);

alter table events enable row level security;

drop policy if exists "events are readable by anyone" on events;
create policy "events are readable by anyone" on events for select using (true);

drop policy if exists "events are writable by anyone" on events;
create policy "events are writable by anyone" on events for insert with check (true);

drop policy if exists "events are editable by anyone" on events;
create policy "events are editable by anyone" on events for update using (true) with check (true);

drop policy if exists "events are deletable by anyone" on events;
create policy "events are deletable by anyone" on events for delete using (true);

-- ---- person_photos (uploaded Then & Now photos) ----------------------------------------------
-- One row per person who has uploaded a real Then and/or Now photo, overriding the placeholder
-- filenames in family.json's `memories` (see CLAUDE.md "Placeholder Then & Now for everyone").

create table if not exists person_photos (
  person_id text primary key,
  then_photo text check (then_photo is null or then_photo ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/'),
  now_photo text check (now_photo is null or now_photo ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/'),
  updated_at timestamptz not null default now()
);

alter table person_photos enable row level security;

drop policy if exists "person photos are readable by anyone" on person_photos;
create policy "person photos are readable by anyone" on person_photos for select using (true);

drop policy if exists "person photos are writable by anyone" on person_photos;
create policy "person photos are writable by anyone" on person_photos for insert with check (true);

drop policy if exists "person photos are editable by anyone" on person_photos;
create policy "person photos are editable by anyone" on person_photos for update using (true) with check (true);

-- ---- realtime ---------------------------------------------------------------------------------
-- So every open tab sees a postcard/moment the moment anyone adds one (js/data/cloudSync.js
-- subscribes to these), not just after a reload. Postcards get full replica identity so an
-- UPDATE's "old" row still tells another tab who the postcard's previous owner was (needed when
-- a postcard is re-addressed to someone else) — the default only guarantees the primary key.

alter table postcards replica identity full;

alter publication supabase_realtime add table postcards;
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table person_photos;
