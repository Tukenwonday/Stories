-- menu-images storage bucket + RLS policies.
-- Run this once in the Supabase SQL editor. Safe to re-run.

-- Public bucket, 5 MB file cap (matches the client-side upload limit).
insert into storage.buckets (id, name, public, file_size_limit)
values ('menu-images', 'menu-images', true, 5242880)
on conflict (id) do update set public = true;

-- Allow the storefront/kitchen (anon key) to read, upload, overwrite and delete
-- photos inside the bucket. Uploads are gated by the kitchen PIN in the app.
drop policy if exists "menu-images select" on storage.objects;
create policy "menu-images select" on storage.objects
  for select using (bucket_id = 'menu-images');

drop policy if exists "menu-images insert" on storage.objects;
create policy "menu-images insert" on storage.objects
  for insert to anon with check (bucket_id = 'menu-images');

drop policy if exists "menu-images update" on storage.objects;
create policy "menu-images update" on storage.objects
  for update to anon using (bucket_id = 'menu-images');

drop policy if exists "menu-images delete" on storage.objects;
create policy "menu-images delete" on storage.objects
  for delete to anon using (bucket_id = 'menu-images');
