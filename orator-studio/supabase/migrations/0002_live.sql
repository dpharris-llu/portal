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
