-- OratorStudio: the whole database, for pasting once into the Supabase SQL Editor.
-- Part 1 removes anything from an earlier setup (DELETES ALL APP DATA; signed-in users are kept).
-- Part 2 creates everything (migrations 0001 to 0005). Generated from supabase/reset.sql and supabase/migrations/.

-- ===== Part 1: reset.sql =====
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
  public.ai_usage, public.invitations, public.app_admins,
  public.memberships, public.tenants
  cascade;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'live\_%' or p.proname in ('is_member', 'is_app_admin', 'handle_new_user', 'realtime_is_live_host', 'realtime_can_publish_room'))
  loop
    execute format('drop function if exists %s cascade', f.sig);
  end loop;
end;
$$;

drop type if exists public.member_role cascade;

-- ===== Part 2: migrations/0001_init.sql =====
-- OratorStudio schema, core (spec section 9, data model).
-- Multi-tenant from day one: every row carries tenant_id, and Row Level
-- Security limits access to members of that tenant. Standard Postgres only, to
-- keep a later move to Azure a migration rather than a rewrite.
--
-- The model (spec 1B, F-025): a presentation is what the author makes. It
-- owns its curation (topic, occasion, sources, facts, probes, message, points:
-- the outline) and its slides (decks). Both are changed only through
-- operations, kept in append-only logs, so history and undo are complete and
-- the current state can always be rebuilt from the log.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create type public.member_role as enum ('author', 'reviewer', 'approver', 'admin');

create table public.memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'author',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- A presentation and its curation. `curation` is the current state (the app's
-- Argument object: topic, occasion, sources, facts, probes, outline); the log
-- in presentation_ops is the source of truth.
create table public.presentations (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null default 'Untitled presentation',
  topic text not null default '',
  curation jsonb not null,
  version integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index presentations_tenant_idx on public.presentations (tenant_id, updated_at desc);

create table public.presentation_ops (
  id text primary key,
  presentation_id text not null references public.presentations(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seq bigint generated always as identity,
  author_kind text not null check (author_kind in ('human', 'ai')),
  author_id text not null,
  reason text,
  op jsonb not null,
  created_at timestamptz not null default now()
);
create index presentation_ops_idx on public.presentation_ops (presentation_id, seq);

-- Slides. A deck belongs to a presentation (drafted from its outline); an
-- imported or sample deck may have none yet.
create table public.decks (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  presentation_id text references public.presentations(id) on delete cascade,
  title text not null default 'Untitled deck',
  snapshot jsonb not null,
  version integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index decks_tenant_idx on public.decks (tenant_id, updated_at desc);
create index decks_presentation_idx on public.decks (presentation_id);

create table public.deck_ops (
  id text primary key,
  deck_id text not null references public.decks(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seq bigint generated always as identity,
  author_kind text not null check (author_kind in ('human', 'ai')),
  author_id text not null,
  reason text,
  op jsonb not null,
  created_at timestamptz not null default now()
);
create index deck_ops_deck_idx on public.deck_ops (deck_id, seq);

-- Helper used by every policy. SECURITY DEFINER so it can read memberships
-- without recursive RLS checks; search_path pinned for safety.
create or replace function public.is_member(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = t and m.user_id = (select auth.uid())
  );
$$;

alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.presentations enable row level security;
alter table public.presentation_ops enable row level security;
alter table public.decks enable row level security;
alter table public.deck_ops enable row level security;

create policy "members read their tenant" on public.tenants
  for select using (public.is_member(id));
create policy "members see memberships in their tenant" on public.memberships
  for select using (public.is_member(tenant_id));

create policy "members read presentations" on public.presentations
  for select using (public.is_member(tenant_id));
create policy "members create presentations" on public.presentations
  for insert with check (public.is_member(tenant_id) and created_by = (select auth.uid()));
create policy "members update presentations" on public.presentations
  for update using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
create policy "members delete presentations" on public.presentations
  for delete using (public.is_member(tenant_id));

create policy "members read decks" on public.decks
  for select using (public.is_member(tenant_id));
create policy "members create decks" on public.decks
  for insert with check (
    public.is_member(tenant_id) and created_by = (select auth.uid())
    and (presentation_id is null or exists (select 1 from public.presentations p where p.id = presentation_id and p.tenant_id = decks.tenant_id))
  );
create policy "members update decks" on public.decks
  for update using (public.is_member(tenant_id)) with check (
    public.is_member(tenant_id)
    and (presentation_id is null or exists (select 1 from public.presentations p where p.id = presentation_id and p.tenant_id = decks.tenant_id))
  );
create policy "members delete decks" on public.decks
  for delete using (public.is_member(tenant_id));

-- Logs are insert-only: no update or delete policy, so history cannot be rewritten.
create policy "members read presentation ops" on public.presentation_ops
  for select using (public.is_member(tenant_id));
create policy "members append presentation ops" on public.presentation_ops
  for insert with check (
    public.is_member(tenant_id)
    and exists (select 1 from public.presentations p where p.id = presentation_id and p.tenant_id = presentation_ops.tenant_id)
    and (author_kind = 'ai' or author_id = (select auth.uid())::text)
  );
create policy "members read deck ops" on public.deck_ops
  for select using (public.is_member(tenant_id));
create policy "members append deck ops" on public.deck_ops
  for insert with check (
    public.is_member(tenant_id)
    and exists (select 1 from public.decks d where d.id = deck_id and d.tenant_id = deck_ops.tenant_id)
    and (author_kind = 'ai' or author_id = (select auth.uid())::text)
  );

-- Version .3: each new user who signs in gets a personal tenant, so the app
-- works before LLU roles exist (Stage 1 replaces this).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t uuid;
begin
  insert into public.tenants (name) values (coalesce(new.email, 'Personal')) returning id into t;
  insert into public.memberships (tenant_id, user_id, role) values (t, new.id, 'admin');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users who already exist (for example after a reset) get their tenant now.
do $$
declare
  u record;
  t uuid;
begin
  for u in select id, email from auth.users where id not in (select user_id from public.memberships) loop
    insert into public.tenants (name) values (coalesce(u.email, 'Personal')) returning id into t;
    insert into public.memberships (tenant_id, user_id, role) values (t, u.id, 'admin');
  end loop;
end;
$$;

-- Table privileges. Supabase no longer grants these automatically to tables
-- made in the SQL Editor, and without them every request is refused before
-- Row Level Security runs. The grants open the tables to the policies above;
-- the policies still decide which rows each person sees. Logs get no update
-- or delete, so history stays append-only even at this level.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.tenants, public.memberships to authenticated;
grant select, insert, update, delete on public.presentations, public.decks to authenticated;
grant select, insert on public.presentation_ops, public.deck_ops to authenticated;
grant all on public.tenants, public.memberships, public.presentations, public.presentation_ops, public.decks, public.deck_ops to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- ===== Part 2: migrations/0002_live.sql =====
-- Audience response sessions (spec 5A) stored in Postgres, so they work on
-- serverless hosting. Rows are written only through the functions below, which
-- the app's server calls with the service role; phones never touch these tables
-- directly. Live updates go out over Supabase Realtime (see 0003).

create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user uuid not null references auth.users(id) on delete cascade,
  host_key_hash text not null,
  locked boolean not null default false,
  ended boolean not null default false,
  qa_open boolean not null default true,
  active_poll text,
  created_at timestamptz not null default now()
);

create table public.live_polls (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  block_id text not null,
  spec jsonb not null,
  open boolean not null default false,
  primary key (session_id, block_id)
);

create table public.live_devices (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  device text not null,
  joined_at timestamptz not null default now(),
  last_submit timestamptz not null default '-infinity',
  last_ask timestamptz not null default '-infinity',
  primary key (session_id, device)
);

-- One response per device per poll is the primary key (rule 3).
create table public.live_responses (
  session_id uuid not null,
  block_id text not null,
  device text not null,
  answer jsonb not null,
  status text check (status in ('pending', 'approved', 'rejected')),
  flagged boolean not null default false,
  at timestamptz not null default now(),
  primary key (session_id, block_id, device),
  foreign key (session_id, block_id) references public.live_polls(session_id, block_id) on delete cascade
);

create table public.live_questions (
  id text primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  device text not null,
  text text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed', 'answered')),
  flagged boolean not null default false,
  at timestamptz not null default now()
);
create index live_questions_session_idx on public.live_questions (session_id);

create table public.live_votes (
  question_id text not null references public.live_questions(id) on delete cascade,
  device text not null,
  primary key (question_id, device)
);

-- No policies: only the service role (which bypasses RLS) can read or write.
alter table public.live_sessions enable row level security;
alter table public.live_polls enable row level security;
alter table public.live_devices enable row level security;
alter table public.live_responses enable row level security;
alter table public.live_questions enable row level security;
alter table public.live_votes enable row level security;

-- ---------------------------------------------------------------------------
-- Functions. Error messages match src/audience/model.ts so both stores behave alike.
-- ---------------------------------------------------------------------------

create function public.live_create(p_code text, p_host_user uuid, p_key_hash text)
returns uuid language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  delete from public.live_sessions where created_at < now() - interval '12 hours';
  insert into public.live_sessions (code, host_user, host_key_hash)
  values (p_code, p_host_user, p_key_hash) returning id into v_id;
  return v_id;
end $$;

create function public.live_meta(p_session uuid)
returns table (id uuid, code text, host_user uuid, host_key_hash text, ended boolean)
language sql stable set search_path = '' as $$
  select s.id, s.code, s.host_user, s.host_key_hash, s.ended from public.live_sessions s where s.id = p_session;
$$;

create function public.live_join(p_code text, p_device text, p_max integer)
returns jsonb language plpgsql set search_path = '' as $$
declare s public.live_sessions;
begin
  select * into s from public.live_sessions where code = p_code;
  if not found then return jsonb_build_object('error', 'No session with that code.', 'status', 404); end if;
  if s.ended then return jsonb_build_object('error', 'This session has ended.', 'status', 410); end if;
  if exists (select 1 from public.live_devices d where d.session_id = s.id and d.device = p_device) then
    return jsonb_build_object('session_id', s.id);
  end if;
  if s.locked then return jsonb_build_object('error', 'The presenter has locked this room.', 'status', 403); end if;
  if (select count(*) from public.live_devices d where d.session_id = s.id) >= p_max then
    return jsonb_build_object('error', 'This session is full.', 'status', 403);
  end if;
  insert into public.live_devices (session_id, device) values (s.id, p_device) on conflict do nothing;
  return jsonb_build_object('session_id', s.id);
end $$;

-- The open poll's spec, so the server can validate an answer before storing it.
create function public.live_active_poll(p_session uuid)
returns jsonb language sql stable set search_path = '' as $$
  select p.spec from public.live_sessions s
  join public.live_polls p on p.session_id = s.id and p.block_id = s.active_poll
  where s.id = p_session and p.open and not s.ended;
$$;

create function public.live_respond(
  p_session uuid, p_device text, p_block text, p_answer jsonb, p_is_text boolean, p_flagged boolean, p_interval_ms integer
) returns text language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.live_devices where session_id = p_session and device = p_device) then
    return 'Join the session first.';
  end if;
  if exists (select 1 from public.live_sessions where id = p_session and ended) then
    return 'This session has ended.';
  end if;
  if not exists (
    select 1 from public.live_sessions s join public.live_polls p on p.session_id = s.id and p.block_id = s.active_poll
    where s.id = p_session and s.active_poll = p_block and p.open
  ) then
    return 'This poll is closed.';
  end if;
  if exists (select 1 from public.live_responses where session_id = p_session and block_id = p_block and device = p_device) then
    return 'You have already responded to this poll.';
  end if;
  update public.live_devices set last_submit = now()
  where session_id = p_session and device = p_device and last_submit <= now() - make_interval(secs => p_interval_ms / 1000.0);
  if not found then return 'Slow down a moment, then try again.'; end if;
  insert into public.live_responses (session_id, block_id, device, answer, status, flagged)
  values (p_session, p_block, p_device, p_answer, case when p_is_text then 'pending' end, p_flagged)
  on conflict do nothing;
  if not found then return 'You have already responded to this poll.'; end if;
  return null;
end $$;

create function public.live_ask(
  p_session uuid, p_device text, p_id text, p_text text, p_flagged boolean, p_interval_ms integer
) returns text language plpgsql set search_path = '' as $$
declare s public.live_sessions;
begin
  if not exists (select 1 from public.live_devices where session_id = p_session and device = p_device) then
    return 'Join the session first.';
  end if;
  select * into s from public.live_sessions where id = p_session;
  if s.ended then return 'This session has ended.'; end if;
  if not s.qa_open then return 'Questions are closed right now.'; end if;
  update public.live_devices set last_ask = now()
  where session_id = p_session and device = p_device and last_ask <= now() - make_interval(secs => p_interval_ms / 1000.0);
  if not found then return 'You can ask another question in a few seconds.'; end if;
  insert into public.live_questions (id, session_id, device, text, flagged) values (p_id, p_session, p_device, p_text, p_flagged);
  return null;
end $$;

create function public.live_vote(p_session uuid, p_device text, p_question text)
returns text language plpgsql set search_path = '' as $$
declare q public.live_questions;
begin
  if not exists (select 1 from public.live_devices where session_id = p_session and device = p_device) then
    return 'Join the session first.';
  end if;
  select * into q from public.live_questions where id = p_question and session_id = p_session;
  if not found or q.status <> 'approved' then return 'That question is not open for votes.'; end if;
  if q.device = p_device then return 'You cannot vote for your own question.'; end if;
  delete from public.live_votes where question_id = p_question and device = p_device;
  if not found then
    insert into public.live_votes (question_id, device) values (p_question, p_device) on conflict do nothing;
  end if;
  return null;
end $$;

-- Reopening the same poll keeps its responses; a changed poll starts fresh.
create function public.live_open_poll(p_session uuid, p_spec jsonb)
returns void language plpgsql set search_path = '' as $$
declare v_block text := p_spec->>'blockId'; v_old jsonb;
begin
  select spec into v_old from public.live_polls where session_id = p_session and block_id = v_block;
  if not found then
    insert into public.live_polls (session_id, block_id, spec, open) values (p_session, v_block, p_spec, true);
  elsif v_old is distinct from p_spec then
    delete from public.live_responses where session_id = p_session and block_id = v_block;
    update public.live_polls set spec = p_spec, open = true where session_id = p_session and block_id = v_block;
  else
    update public.live_polls set open = true where session_id = p_session and block_id = v_block;
  end if;
  update public.live_polls set open = false where session_id = p_session and block_id <> v_block;
  update public.live_sessions set active_poll = v_block where id = p_session;
end $$;

create function public.live_close_poll(p_session uuid)
returns void language plpgsql set search_path = '' as $$
begin
  update public.live_polls p set open = false from public.live_sessions s
  where s.id = p_session and p.session_id = s.id and p.block_id = s.active_poll;
  update public.live_sessions set active_poll = null where id = p_session;
end $$;

create function public.live_moderate_question(p_session uuid, p_question text, p_status text)
returns text language plpgsql set search_path = '' as $$
begin
  update public.live_questions set status = p_status where id = p_question and session_id = p_session;
  if not found then return 'No such question.'; end if;
  return null;
end $$;

create function public.live_moderate_text(p_session uuid, p_block text, p_device text, p_status text)
returns text language plpgsql set search_path = '' as $$
begin
  update public.live_responses set status = p_status
  where session_id = p_session and block_id = p_block and device = p_device and status is not null;
  if not found then return 'No such response.'; end if;
  return null;
end $$;

create function public.live_approve_unflagged(p_session uuid, p_block text)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  update public.live_responses set status = 'approved'
  where session_id = p_session and block_id = p_block and status = 'pending' and not flagged;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.live_set(p_session uuid, p_locked boolean default null, p_qa_open boolean default null, p_ended boolean default null)
returns void language plpgsql set search_path = '' as $$
begin
  if p_ended then perform public.live_close_poll(p_session); end if;
  update public.live_sessions set
    locked = coalesce(p_locked, locked),
    qa_open = coalesce(p_qa_open, qa_open),
    ended = coalesce(p_ended, ended)
  where id = p_session;
end $$;

-- Everything about one session, for building the presenter and phone views.
create function public.live_snapshot(p_session uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'code', s.code, 'locked', s.locked, 'ended', s.ended, 'qa_open', s.qa_open,
      'active_poll', s.active_poll, 'created_at', s.created_at),
    'polls', coalesce((select jsonb_agg(jsonb_build_object('block_id', p.block_id, 'spec', p.spec, 'open', p.open))
      from public.live_polls p where p.session_id = s.id), '[]'::jsonb),
    'responses', coalesce((select jsonb_agg(jsonb_build_object('block_id', r.block_id, 'device', r.device, 'answer', r.answer,
      'status', r.status, 'flagged', r.flagged, 'at', (extract(epoch from r.at) * 1000)::bigint))
      from public.live_responses r where r.session_id = s.id), '[]'::jsonb),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'device', q.device, 'text', q.text, 'status', q.status,
      'flagged', q.flagged, 'at', (extract(epoch from q.at) * 1000)::bigint,
      'votes', coalesce((select jsonb_agg(v.device) from public.live_votes v where v.question_id = q.id), '[]'::jsonb))
      order by q.at) from public.live_questions q where q.session_id = s.id), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(d.device) from public.live_devices d where d.session_id = s.id), '[]'::jsonb)
  )
  from public.live_sessions s where s.id = p_session;
$$;

-- Only the server (service role) may call these.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'live\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- The functions above run as the caller (the server's service role), so that
-- role needs the tables. Phones and signed-in users get nothing here: they go
-- through the server.
grant all on public.live_sessions, public.live_polls, public.live_devices, public.live_responses, public.live_questions, public.live_votes to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ===== Part 2: migrations/0003_live_realtime.sql =====
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

-- ===== Part 2: migrations/0004_ai_usage.sql =====
-- Claude usage and cost, one row per request the server makes (spec F-114).
-- Written only by the server with the service key, so nobody can change their
-- own record. Members read their tenant's rows. Safe to run on a database that
-- already has data: it only adds this table.

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  -- Not a foreign key: the record outlives a deleted presentation.
  presentation_id text,
  task text not null,
  status text not null,
  requested_model text,
  served_model text,
  fell_back boolean not null default false,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  thinking_tokens integer,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  -- Estimate at list prices when recorded (src/ai/pricing.ts). The bill is the Claude Console.
  cost_usd numeric(12, 6),
  attempts jsonb not null default '[]'::jsonb,
  latency_ms integer,
  request_id text,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_tenant_idx on public.ai_usage (tenant_id, created_at desc);
create index if not exists ai_usage_presentation_idx on public.ai_usage (presentation_id, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists "members read usage" on public.ai_usage;
create policy "members read usage" on public.ai_usage
  for select using (public.is_member(tenant_id));

-- Read-only for people; insert-only for the server. No update or delete for anyone.
grant select on public.ai_usage to authenticated;
grant select, insert on public.ai_usage to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ===== Part 2: migrations/0005_invites.sql =====
-- Invitations and administrators (spec F-126). OratorStudio is invite-only:
-- open sign-ups are off in Supabase, and an administrator invites people by
-- email. An invited person gets an account and their own private space (the
-- on_auth_user_created trigger in 0001), then signs in with a sign-in link.
-- Safe to run on a database that already has data: it only adds tables.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.invitations (
  id bigint generated always as identity primary key,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  invited_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists invitations_email_idx on public.invitations (lower(email));

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
$$;

alter table public.app_admins enable row level security;
alter table public.invitations enable row level security;

-- Administrators can read both lists; everyone can see whether they are one.
-- All changes go through the server (service key), which checks the caller is an administrator.
drop policy if exists "admins read admins" on public.app_admins;
create policy "admins read admins" on public.app_admins
  for select using (public.is_app_admin() or user_id = (select auth.uid()));
drop policy if exists "admins read invitations" on public.invitations;
create policy "admins read invitations" on public.invitations
  for select using (public.is_app_admin());

grant select on public.app_admins, public.invitations to authenticated;
grant all on public.app_admins, public.invitations to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.is_app_admin() to authenticated, service_role;
