-- The Family Galaxy — Supabase Storage buckets + policies for uploaded photos.
--
-- Creates the two buckets the app uploads into and makes them public-read / open-write, capped
-- in size and type so the free tier can't be filled by a stray script or a huge accidental
-- upload. The client already resizes photos before uploading (js/utils/imageUpload.js); these
-- are the backstop, not the only check.
--
-- To apply: Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run,
-- AFTER running schema.sql. Safe to re-run.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('postcards', 'postcards', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  ('then-now', 'then-now', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects already has RLS enabled by default on every Supabase project.

drop policy if exists "postcard/then-now photos are readable by anyone" on storage.objects;
create policy "postcard/then-now photos are readable by anyone" on storage.objects
  for select using (bucket_id in ('postcards', 'then-now'));

drop policy if exists "postcard/then-now photos are uploadable by anyone" on storage.objects;
create policy "postcard/then-now photos are uploadable by anyone" on storage.objects
  for insert with check (bucket_id in ('postcards', 'then-now'));

drop policy if exists "postcard/then-now photos are replaceable by anyone" on storage.objects;
create policy "postcard/then-now photos are replaceable by anyone" on storage.objects
  for update using (bucket_id in ('postcards', 'then-now')) with check (bucket_id in ('postcards', 'then-now'));

drop policy if exists "postcard/then-now photos are deletable by anyone" on storage.objects;
create policy "postcard/then-now photos are deletable by anyone" on storage.objects
  for delete using (bucket_id in ('postcards', 'then-now'));
