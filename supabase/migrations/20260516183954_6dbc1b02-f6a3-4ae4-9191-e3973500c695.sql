insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entity-images', 'entity-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880;

create policy "entity-images public read"
on storage.objects for select
using (bucket_id = 'entity-images');

create policy "entity-images service write"
on storage.objects for insert
with check (bucket_id = 'entity-images' AND auth.role() = 'service_role');

create policy "entity-images service update"
on storage.objects for update
using (bucket_id = 'entity-images' AND auth.role() = 'service_role');