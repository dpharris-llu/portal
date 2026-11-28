-- Fix (0006): saving a source, topic or presentation failed with "new row
-- violates row-level security policy". The app saves a row and asks for it
-- back in the same statement (INSERT ... RETURNING). The read rules checked
-- ownership by querying the same table through a function, which can't see
-- the row being inserted, so the row couldn't be returned. The read rules now
-- check the row's own columns first, which works for a new row.

drop policy if exists "read sources" on public.sources;
create policy "read sources" on public.sources for select using (
  owner_id = (select auth.uid())
  or is_public
  or exists (select 1 from public.topic_sources ts where ts.source_id = id and public.topic_role(ts.topic_id) is not null)
);

drop policy if exists "read topics" on public.topics;
create policy "read topics" on public.topics for select using (
  owner_id = (select auth.uid())
  or exists (select 1 from public.members m where m.object_type = 'topic' and m.object_id = id and m.user_id = (select auth.uid()))
);

drop policy if exists "read presentations" on public.presentations;
create policy "read presentations" on public.presentations for select using (
  owner_id = (select auth.uid())
  or exists (select 1 from public.members m where m.object_type = 'presentation' and m.object_id = id and m.user_id = (select auth.uid()))
);
