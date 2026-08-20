-- Add a new table token
-- Usage: just change the table_number and run in Supabase SQL Editor

INSERT INTO public.table_tokens (token, table_number)
VALUES (
  gen_random_uuid()::text,
  '17'  -- <-- change this to your new table number
)
ON CONFLICT (table_number) DO NOTHING;

-- Verify it worked
select * from public.table_tokens order by table_number::int desc limit 5;
