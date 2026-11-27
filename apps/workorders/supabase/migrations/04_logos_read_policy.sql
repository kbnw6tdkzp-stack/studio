-- Logo uploads that may replace a file (upsert) need permission to read existing logos too.
-- Without it, uploading a logo failed with "new row violates row-level security policy".
create policy "logo read" on storage.objects for select to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1]::uuid in (select public.my_business_ids()));
