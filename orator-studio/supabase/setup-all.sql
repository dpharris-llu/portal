-- OratorStudio: the whole database, for pasting once into the Supabase SQL Editor.
-- Part 1 removes anything from an earlier setup (DELETES ALL APP DATA; signed-in users are kept).
-- Part 2 creates everything (migrations 0001 to 0006). Generated from supabase/reset.sql and supabase/migrations/.

-- ===== Part 1: reset.sql =====
-- OratorStudio: remove every table, function, policy and trigger the app
-- created, so setup-all.sql can rebuild from scratch. DELETES ALL APP DATA
-- (presentations, decks, live sessions). Signed-in users (auth.users) are kept.

drop trigger if exists on_auth_user_created on auth.users;
drop policy if exists "presenter listens to own host channel" on realtime.messages;
drop policy if exists "anyone listens to a room" on realtime.messages;
drop policy if exists "presenter publishes to own room" on realtime.messages;

drop table if exists
  public.assertion_facts, public.presentation_assertions, public.presentation_topics,
  public.observations, public.assertions, public.topic_sources, public.topic_relations,
  public.facts, public.sources, public.topics, public.members, public.comments,
  public.review_flags, public.search_runs,
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
      and (p.proname like 'live\_%' or p.proname in ('is_member', 'is_app_admin', 'topic_role', 'presentation_role', 'can_read_source', 'flag_dependents', 'on_fact_change', 'on_source_change', 'on_assertion_change', 'on_assertion_fact', 'handle_new_user', 'realtime_is_live_host', 'realtime_can_publish_room'))
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

-- ===== Part 2: migrations/0006_knowledge.sql =====
-- The knowledge model (spec section 5, F-130 to F-147). Starts fresh (F-141):
-- the earlier presentation workspace (presentations, presentation_ops) and
-- its decks are removed. Kept: tenants and memberships, ai_usage,
-- app_admins, invitations, and the live_* audience tables.
--
--   Body of Knowledge (personal):  sources ─has─▶ facts
--   Topic Library:                 topics ─has─▶ observations, assertions
--   Assertions ◀─assertion_facts─▶ facts  (supports / qualifies / contradicts)
--   Presentations (purpose, audience) ─▶ a series of topics ─▶ chosen assertions
--
-- Access: a person's sources and facts are theirs; a source made public can be
-- read (and copied) by anyone signed in, and sources linked to a topic can be
-- read by the topic's collaborators and viewers. Topics and presentations have
-- an owner, collaborators (who can add) and viewers (read only). Nobody edits
-- another person's assertion.

drop table if exists public.presentation_ops, public.deck_ops, public.decks, public.presentations cascade;

-- ---------- Body of Knowledge ----------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('paper', 'report', 'trial', 'statistic', 'scripture', 'document', 'data', 'web', 'own_writing', 'own_knowledge')),
  title text not null,
  citation text not null default '',
  short text not null default '',
  url text,
  year text,
  origin text not null default 'yours' check (origin in ('yours', 'discovered', 'ingested', 'copied')),
  access text check (access in ('full text', 'abstract', 'registry record', 'typed', 'record')),
  ids jsonb not null default '{}'::jsonb,           -- doi, pmid, pmcid, openalex, nct, scripture version/reference
  page_labels jsonb not null default '{}'::jsonb,   -- section names for "pages" that are sections
  annotation text not null default '',
  annotation_by text check (annotation_by in ('author', 'claude')),
  is_public boolean not null default false,
  copied_from uuid references public.sources(id) on delete set null,
  fetched_at timestamptz,
  status text not null default 'active' check (status in ('active', 'discarded')),
  discard_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sources_owner_idx on public.sources (owner_id, updated_at desc);
create index sources_public_idx on public.sources (is_public) where is_public;

create table public.facts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'finding' check (kind in ('finding', 'limitation', 'figure', 'note', 'scripture', 'statement')),
  text text not null,
  quote text,
  page integer,
  checked boolean not null default false,
  status text not null default 'active' check (status in ('active', 'discarded')),
  discard_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index facts_source_idx on public.facts (source_id);
create index facts_owner_idx on public.facts (owner_id);

-- ---------- Topic Library ----------

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index topics_owner_idx on public.topics (owner_id, updated_at desc);
create index topics_keywords_idx on public.topics using gin (keywords);

create table public.topic_relations (
  topic_id uuid not null references public.topics(id) on delete cascade,
  related_id uuid not null references public.topics(id) on delete cascade,
  primary key (topic_id, related_id),
  check (topic_id <> related_id)
);

create table public.topic_sources (
  topic_id uuid not null references public.topics(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  note text not null default '',                     -- why this source matters to this topic
  linked_by text not null default 'author' check (linked_by in ('author', 'auto', 'claude')),
  created_at timestamptz not null default now(),
  primary key (topic_id, source_id)
);
create index topic_sources_source_idx on public.topic_sources (source_id);

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  made_by text not null check (made_by in ('author', 'claude')),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade, -- who wrote it, or asked Claude
  text text not null,
  general_knowledge text,                            -- Claude's view from general knowledge, kept apart
  fact_ids uuid[] not null default '{}',
  question text,                                     -- the probe it answers, if any
  created_at timestamptz not null default now()
);
create index observations_topic_idx on public.observations (topic_id, created_at desc);

create table public.assertions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  origin text not null default 'typed' check (origin in ('typed', 'from_observation', 'own_writing')),
  observation_id uuid references public.observations(id) on delete set null,
  own_fact_id uuid references public.facts(id) on delete set null,   -- the author's own words, for origin own_writing
  builds_on uuid references public.assertions(id) on delete set null, -- an enhanced assertion
  still_held boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assertions_topic_idx on public.assertions (topic_id, created_at);

create table public.assertion_facts (
  assertion_id uuid not null references public.assertions(id) on delete cascade,
  fact_id uuid not null references public.facts(id) on delete cascade,
  role text not null default 'supports' check (role in ('supports', 'qualifies', 'contradicts')),
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (assertion_id, fact_id)
);
create index assertion_facts_fact_idx on public.assertion_facts (fact_id);

-- ---------- Presentations ----------

create table public.presentations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Untitled presentation',
  purpose text not null default '',
  audience text not null default '',
  minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index presentations_owner_idx on public.presentations (owner_id, updated_at desc);

create table public.presentation_topics (
  presentation_id uuid not null references public.presentations(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  position integer not null,
  primary key (presentation_id, topic_id)
);

create table public.presentation_assertions (
  presentation_id uuid not null references public.presentations(id) on delete cascade,
  assertion_id uuid not null references public.assertions(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  position integer not null,
  primary key (presentation_id, assertion_id)
);

-- Slides: a deck belongs to a presentation; its edits are an append-only log, as before.
create table public.decks (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  presentation_id uuid references public.presentations(id) on delete cascade,
  title text not null default 'Untitled deck',
  snapshot jsonb not null,
  version integer not null default 0,
  created_by uuid references auth.users(id) default auth.uid(),
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

-- ---------- People on topics and presentations ----------

create table public.members (
  object_type text not null check (object_type in ('topic', 'presentation')),
  object_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('collaborator', 'viewer')),
  added_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (object_type, object_id, user_id)
);
create index members_user_idx on public.members (user_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  object_type text not null check (object_type in ('assertion', 'topic', 'presentation')),
  object_id uuid not null,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_object_idx on public.comments (object_type, object_id, created_at);

-- ---------- Review flags (F-138) ----------

create table public.review_flags (
  id uuid primary key default gen_random_uuid(),
  object_type text not null check (object_type in ('assertion', 'presentation')),
  object_id uuid not null,
  reason text not null,
  cause_type text check (cause_type in ('fact', 'source', 'assertion')),
  cause_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index review_flags_object_idx on public.review_flags (object_type, object_id) where resolved_at is null;

-- Discover runs, kept as the search record.
create table public.search_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  record jsonb not null,
  created_at timestamptz not null default now()
);
create index search_runs_owner_idx on public.search_runs (owner_id, created_at desc);

-- ---------- Who may see and do what ----------

create or replace function public.topic_role(t uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.topics x where x.id = t and x.owner_id = (select auth.uid())) then 'owner'
    else (select m.role from public.members m where m.object_type = 'topic' and m.object_id = t and m.user_id = (select auth.uid()))
  end;
$$;

create or replace function public.presentation_role(p uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.presentations x where x.id = p and x.owner_id = (select auth.uid())) then 'owner'
    else (select m.role from public.members m where m.object_type = 'presentation' and m.object_id = p and m.user_id = (select auth.uid()))
  end;
$$;

-- A source is readable by its owner, by anyone if public, and by people on a topic it is linked to.
create or replace function public.can_read_source(s uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sources x where x.id = s and (x.owner_id = (select auth.uid()) or x.is_public)
  ) or exists (
    select 1 from public.topic_sources ts where ts.source_id = s and public.topic_role(ts.topic_id) is not null
  );
$$;

alter table public.sources enable row level security;
alter table public.facts enable row level security;
alter table public.topics enable row level security;
alter table public.topic_relations enable row level security;
alter table public.topic_sources enable row level security;
alter table public.observations enable row level security;
alter table public.assertions enable row level security;
alter table public.assertion_facts enable row level security;
alter table public.presentations enable row level security;
alter table public.presentation_topics enable row level security;
alter table public.presentation_assertions enable row level security;
alter table public.decks enable row level security;
alter table public.deck_ops enable row level security;
alter table public.members enable row level security;
alter table public.comments enable row level security;
alter table public.review_flags enable row level security;
alter table public.search_runs enable row level security;

create policy "read sources" on public.sources for select using (public.can_read_source(id));
create policy "own sources" on public.sources for insert with check (owner_id = (select auth.uid()));
create policy "edit own sources" on public.sources for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "delete own sources" on public.sources for delete using (owner_id = (select auth.uid()));

create policy "read facts" on public.facts for select using (public.can_read_source(source_id));
create policy "own facts" on public.facts for insert with check (owner_id = (select auth.uid()) and exists (select 1 from public.sources s where s.id = source_id and s.owner_id = (select auth.uid())));
create policy "edit own facts" on public.facts for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "delete own facts" on public.facts for delete using (owner_id = (select auth.uid()));

create policy "read topics" on public.topics for select using (public.topic_role(id) is not null);
create policy "own topics" on public.topics for insert with check (owner_id = (select auth.uid()));
create policy "edit topics" on public.topics for update using (public.topic_role(id) in ('owner', 'collaborator')) with check (public.topic_role(id) in ('owner', 'collaborator'));
create policy "delete own topics" on public.topics for delete using (owner_id = (select auth.uid()));

create policy "read topic relations" on public.topic_relations for select using (public.topic_role(topic_id) is not null);
create policy "relate topics" on public.topic_relations for all using (public.topic_role(topic_id) in ('owner', 'collaborator')) with check (public.topic_role(topic_id) in ('owner', 'collaborator'));

create policy "read topic sources" on public.topic_sources for select using (public.topic_role(topic_id) is not null);
create policy "link sources" on public.topic_sources for insert with check (public.topic_role(topic_id) in ('owner', 'collaborator') and exists (select 1 from public.sources s where s.id = source_id and s.owner_id = (select auth.uid())));
create policy "edit topic source notes" on public.topic_sources for update using (public.topic_role(topic_id) in ('owner', 'collaborator'));
create policy "unlink sources" on public.topic_sources for delete using (public.topic_role(topic_id) in ('owner', 'collaborator'));

create policy "read observations" on public.observations for select using (public.topic_role(topic_id) is not null);
create policy "add observations" on public.observations for insert with check (author_id = (select auth.uid()) and public.topic_role(topic_id) in ('owner', 'collaborator'));
create policy "delete own observations" on public.observations for delete using (author_id = (select auth.uid()));

create policy "read assertions" on public.assertions for select using (public.topic_role(topic_id) is not null);
create policy "add assertions" on public.assertions for insert with check (author_id = (select auth.uid()) and public.topic_role(topic_id) in ('owner', 'collaborator'));
create policy "edit own assertions" on public.assertions for update using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "delete own assertions" on public.assertions for delete using (author_id = (select auth.uid()));

create policy "read assertion facts" on public.assertion_facts for select using (exists (select 1 from public.assertions a where a.id = assertion_id and public.topic_role(a.topic_id) is not null));
create policy "link own assertions" on public.assertion_facts for all
  using (exists (select 1 from public.assertions a where a.id = assertion_id and a.author_id = (select auth.uid())))
  with check (exists (select 1 from public.assertions a where a.id = assertion_id and a.author_id = (select auth.uid())) and public.can_read_source((select f.source_id from public.facts f where f.id = fact_id)));

create policy "read presentations" on public.presentations for select using (public.presentation_role(id) is not null);
create policy "own presentations" on public.presentations for insert with check (owner_id = (select auth.uid()));
create policy "edit presentations" on public.presentations for update using (public.presentation_role(id) in ('owner', 'collaborator'));
create policy "delete own presentations" on public.presentations for delete using (owner_id = (select auth.uid()));

create policy "read presentation topics" on public.presentation_topics for select using (public.presentation_role(presentation_id) is not null);
create policy "arrange presentation topics" on public.presentation_topics for all using (public.presentation_role(presentation_id) in ('owner', 'collaborator')) with check (public.presentation_role(presentation_id) in ('owner', 'collaborator') and public.topic_role(topic_id) is not null);
create policy "read presentation assertions" on public.presentation_assertions for select using (public.presentation_role(presentation_id) is not null);
create policy "arrange presentation assertions" on public.presentation_assertions for all using (public.presentation_role(presentation_id) in ('owner', 'collaborator')) with check (public.presentation_role(presentation_id) in ('owner', 'collaborator') and public.topic_role(topic_id) is not null);

create policy "members read decks" on public.decks for select using (public.is_member(tenant_id));
create policy "members create decks" on public.decks for insert with check (public.is_member(tenant_id) and created_by = (select auth.uid()));
create policy "members update decks" on public.decks for update using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
create policy "members delete decks" on public.decks for delete using (public.is_member(tenant_id));
create policy "members read deck ops" on public.deck_ops for select using (public.is_member(tenant_id));
create policy "members append deck ops" on public.deck_ops for insert with check (
  public.is_member(tenant_id)
  and exists (select 1 from public.decks d where d.id = deck_id and d.tenant_id = deck_ops.tenant_id)
  and (author_kind = 'ai' or author_id = (select auth.uid())::text)
);

create policy "read members" on public.members for select using (
  user_id = (select auth.uid())
  or (object_type = 'topic' and public.topic_role(object_id) is not null)
  or (object_type = 'presentation' and public.presentation_role(object_id) is not null)
);
create policy "owners manage members" on public.members for all using (
  (object_type = 'topic' and public.topic_role(object_id) = 'owner') or (object_type = 'presentation' and public.presentation_role(object_id) = 'owner')
) with check (
  (object_type = 'topic' and public.topic_role(object_id) = 'owner') or (object_type = 'presentation' and public.presentation_role(object_id) = 'owner')
);

create policy "read comments" on public.comments for select using (
  (object_type = 'assertion' and exists (select 1 from public.assertions a where a.id = object_id and public.topic_role(a.topic_id) is not null))
  or (object_type = 'topic' and public.topic_role(object_id) is not null)
  or (object_type = 'presentation' and public.presentation_role(object_id) is not null)
);
create policy "add comments" on public.comments for insert with check (author_id = (select auth.uid()));
create policy "resolve comments" on public.comments for update using (
  author_id = (select auth.uid())
  or (object_type = 'assertion' and exists (select 1 from public.assertions a where a.id = object_id and a.author_id = (select auth.uid())))
);

create policy "read review flags" on public.review_flags for select using (
  (object_type = 'assertion' and exists (select 1 from public.assertions a where a.id = object_id and public.topic_role(a.topic_id) is not null))
  or (object_type = 'presentation' and public.presentation_role(object_id) is not null)
);
create policy "resolve review flags" on public.review_flags for update using (
  (object_type = 'assertion' and exists (select 1 from public.assertions a where a.id = object_id and a.author_id = (select auth.uid())))
  or (object_type = 'presentation' and public.presentation_role(object_id) in ('owner', 'collaborator'))
);

create policy "own search runs" on public.search_runs for all using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ---------- Review flags raised by the database (F-138) ----------
-- When a fact or source is discarded or its text changes, every assertion
-- linked to it is flagged, and every presentation using those assertions.

create or replace function public.flag_dependents(fact_ids uuid[], why text, cause_type text, cause uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.review_flags (object_type, object_id, reason, cause_type, cause_id)
  select distinct 'assertion', af.assertion_id, why, cause_type, cause
  from public.assertion_facts af where af.fact_id = any(fact_ids);
  insert into public.review_flags (object_type, object_id, reason, cause_type, cause_id)
  select distinct 'presentation', pa.presentation_id, why, cause_type, cause
  from public.assertion_facts af join public.presentation_assertions pa on pa.assertion_id = af.assertion_id
  where af.fact_id = any(fact_ids);
end;
$$;

create or replace function public.on_fact_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'discarded' and old.status <> 'discarded' then
    perform public.flag_dependents(array[new.id], 'A fact it relies on was discarded: ' || coalesce(new.discard_reason, ''), 'fact', new.id);
  elsif new.text is distinct from old.text or new.quote is distinct from old.quote then
    perform public.flag_dependents(array[new.id], 'A fact it relies on changed.', 'fact', new.id);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger facts_changed before update on public.facts for each row execute function public.on_fact_change();

create or replace function public.on_source_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'discarded' and old.status <> 'discarded' then
    perform public.flag_dependents(array(select f.id from public.facts f where f.source_id = new.id), 'A source it relies on was discarded: ' || coalesce(new.discard_reason, ''), 'source', new.id);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger sources_changed before update on public.sources for each row execute function public.on_source_change();

-- When an assertion changes, the presentations using it are flagged.
create or replace function public.on_assertion_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.text is distinct from old.text or new.still_held is distinct from old.still_held then
    insert into public.review_flags (object_type, object_id, reason, cause_type, cause_id)
    select distinct 'presentation', pa.presentation_id, 'An assertion it uses was revised.', 'assertion', new.id
    from public.presentation_assertions pa where pa.assertion_id = new.id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger assertions_changed before update on public.assertions for each row execute function public.on_assertion_change();

-- Citing a fact links its source to the assertion's topic (F-140).
create or replace function public.on_assertion_fact()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.topic_sources (topic_id, source_id, linked_by)
  select a.topic_id, f.source_id, 'auto' from public.assertions a, public.facts f
  where a.id = new.assertion_id and f.id = new.fact_id
  on conflict do nothing;
  return new;
end;
$$;
create trigger assertion_fact_links_source after insert on public.assertion_facts for each row execute function public.on_assertion_fact();

-- ---------- Privileges ----------
grant select, insert, update, delete on
  public.sources, public.facts, public.topics, public.topic_relations, public.topic_sources,
  public.observations, public.assertions, public.assertion_facts,
  public.presentations, public.presentation_topics, public.presentation_assertions,
  public.decks, public.members, public.comments, public.search_runs
  to authenticated;
grant select, insert on public.deck_ops to authenticated;
grant select, update on public.review_flags to authenticated;
grant all on
  public.sources, public.facts, public.topics, public.topic_relations, public.topic_sources,
  public.observations, public.assertions, public.assertion_facts,
  public.presentations, public.presentation_topics, public.presentation_assertions,
  public.decks, public.deck_ops, public.members, public.comments, public.review_flags, public.search_runs
  to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.topic_role(uuid), public.presentation_role(uuid), public.can_read_source(uuid) to authenticated, service_role;
