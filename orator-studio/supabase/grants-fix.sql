-- One-time fix for a database set up from setup-all.sql before Nov 28, 2026:
-- adds the table privileges Supabase no longer grants automatically.
-- Safe to run more than once; keeps all data.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.tenants, public.memberships to authenticated;
grant select, insert, update, delete on public.presentations, public.decks to authenticated;
grant select, insert on public.presentation_ops, public.deck_ops to authenticated;
grant all on public.tenants, public.memberships, public.presentations, public.presentation_ops, public.decks, public.deck_ops to service_role;
grant all on public.live_sessions, public.live_polls, public.live_devices, public.live_responses, public.live_questions, public.live_votes to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
