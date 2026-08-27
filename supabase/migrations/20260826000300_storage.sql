-- Storage buckets and their policies.
--
-- Path convention for both buckets: <user_id>/<project_id>/<filename>
-- The leading folder is the owner's auth.uid(), which is what the policies
-- below check. lib/db.ts builds these paths so the convention stays in one place.

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false), ('outputs', 'outputs', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- uploads
-- Reference videos and character reference images. The user writes these.
create policy uploads_select_own on storage.objects
  for select using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy uploads_insert_own on storage.objects
  for insert with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy uploads_update_own on storage.objects
  for update using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy uploads_delete_own on storage.objects
  for delete using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------- outputs
-- Generated keyframes and videos. Written only by Inngest (service role),
-- so the client gets read access and nothing else.
create policy outputs_select_own on storage.objects
  for select using (
    bucket_id = 'outputs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
