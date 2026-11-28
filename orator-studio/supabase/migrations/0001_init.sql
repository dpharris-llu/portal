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
