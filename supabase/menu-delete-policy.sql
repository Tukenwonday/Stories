-- ===========================================================================
-- Stories Resto Cafe — enable deleting menu items from the kitchen editor.
-- Run this once in the Supabase SQL editor (schema.sql may already be applied
-- to your database, so this file adds only the missing DELETE policy).
-- ===========================================================================

create policy "anon can delete menu" on public.menu
  for delete to anon using (true);
