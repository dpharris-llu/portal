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
