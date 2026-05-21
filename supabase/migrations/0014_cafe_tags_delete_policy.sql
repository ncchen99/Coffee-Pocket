-- Add DELETE policy for cafe_tags table to allow authenticated users to remove tags
drop policy if exists "authenticated delete cafe_tags" on cafe_tags;
create policy "authenticated delete cafe_tags" on cafe_tags
  for delete using (auth.role() = 'authenticated');
