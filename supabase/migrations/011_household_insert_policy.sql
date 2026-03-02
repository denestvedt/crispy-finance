create policy "create own household" on households for insert
  with check (auth.uid() is not null);
