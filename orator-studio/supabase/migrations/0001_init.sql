-- OratorStudio version .3 schema.
-- Multi-tenant from day one (spec 8): every row carries tenant_id, and Row Level
-- Security limits access to members of that tenant. Standard Postgres only, to
-- keep a later move to Azure a migration rather than a rewrite (spec 9).

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

-- Current state of each deck, kept for fast loading. The operation log below is
-- the source of truth; the snapshot can always be rebuilt from it.
create table public.decks (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null default 'Untitled deck',
  snapshot jsonb not null,
  version integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index decks_tenant_idx on public.decks (tenant_id, updated_at desc);

-- Append-only log of edits by people and AI (spec 3, "Rules of the model").
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
alter table public.decks enable row level security;
alter table public.deck_ops enable row level security;

create policy "members read their tenant" on public.tenants
  for select using (public.is_member(id));

create policy "members see memberships in their tenant" on public.memberships
  for select using (public.is_member(tenant_id));

create policy "members read decks" on public.decks
  for select using (public.is_member(tenant_id));
create policy "members create decks" on public.decks
  for insert with check (public.is_member(tenant_id) and created_by = (select auth.uid()));
create policy "members update decks" on public.decks
  for update using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
create policy "members delete decks" on public.decks
  for delete using (public.is_member(tenant_id));

-- Ops are insert-only: no update or delete policy, so history cannot be rewritten.
create policy "members read ops" on public.deck_ops
  for select using (public.is_member(tenant_id));
create policy "members append ops" on public.deck_ops
  for insert with check (
    public.is_member(tenant_id)
    and exists (select 1 from public.decks d where d.id = deck_id and d.tenant_id = deck_ops.tenant_id)
    and (author_kind = 'ai' or author_id = (select auth.uid())::text)
  );

-- Version .3 has one tenant. New users who sign in by Magic Link get a personal
-- tenant so the app works before LLU roles exist (Stage 1 replaces this).
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
