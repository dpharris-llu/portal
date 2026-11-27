-- Realtime Authorization for audience sessions (private broadcast channels).
--
--   live-host:<session id>  The server pings the presenter here when anything changes.
--                           Only the session's presenter may listen.
--   live-room:<join code>   The presenter publishes the public room view (open poll,
--                           approved questions) here. Anyone may listen, since the code
--                           is shown on screen; only the presenter may publish.
--
-- In the Supabase dashboard, turn off "Allow public access" under Realtime settings
-- so that only private channels are allowed.

-- live_sessions is closed to clients, so the checks run as security definer
-- and reveal nothing beyond yes or no for the caller's own sessions.
create function public.realtime_is_live_host(p_topic text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.live_sessions s
    where 'live-host:' || s.id::text = p_topic and s.host_user = (select auth.uid())
  );
$$;

create function public.realtime_can_publish_room(p_topic text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.live_sessions s
    where 'live-room:' || s.code = p_topic and s.host_user = (select auth.uid()) and not s.ended
  );
$$;

revoke all on function public.realtime_is_live_host(text) from public, anon;
revoke all on function public.realtime_can_publish_room(text) from public, anon;
grant execute on function public.realtime_is_live_host(text) to authenticated;
grant execute on function public.realtime_can_publish_room(text) to authenticated;

create policy "presenter listens to own host channel" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.realtime_is_live_host((select realtime.topic())));

create policy "anyone listens to a room" on realtime.messages
  for select to anon, authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'live-room:%');

create policy "presenter publishes to own room" on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and public.realtime_can_publish_room((select realtime.topic())));
