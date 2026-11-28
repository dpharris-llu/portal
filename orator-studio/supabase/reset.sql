-- OratorStudio: remove every table, function, policy and trigger the app
-- created, so setup-all.sql can rebuild from scratch. DELETES ALL APP DATA
-- (presentations, decks, live sessions). Signed-in users (auth.users) are kept.

drop trigger if exists on_auth_user_created on auth.users;
drop policy if exists "presenter listens to own host channel" on realtime.messages;
drop policy if exists "anyone listens to a room" on realtime.messages;
drop policy if exists "presenter publishes to own room" on realtime.messages;

drop table if exists
  public.argument_ops, public.arguments,
  public.presentation_ops, public.presentations,
  public.deck_ops, public.decks,
  public.live_votes, public.live_questions, public.live_responses, public.live_devices, public.live_polls, public.live_sessions,
  public.memberships, public.tenants
  cascade;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'live\_%' or p.proname in ('is_member', 'handle_new_user', 'realtime_is_live_host', 'realtime_can_publish_room'))
  loop
    execute format('drop function if exists %s cascade', f.sig);
  end loop;
end;
$$;

drop type if exists public.member_role cascade;
