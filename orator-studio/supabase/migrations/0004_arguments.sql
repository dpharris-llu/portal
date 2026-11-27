-- Orator Research arguments (spec 1A, F-016): stored like decks, with a current
-- snapshot for fast loading and an append-only log of operations.

create table public.arguments (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null default 'Untitled argument',
  snapshot jsonb not null,
  version integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index arguments_tenant_idx on public.arguments (tenant_id, updated_at desc);

create table public.argument_ops (
  id text primary key,
  argument_id text not null references public.arguments(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seq bigint generated always as identity,
  author_kind text not null check (author_kind in ('human', 'ai')),
  author_id text not null,
  reason text,
  op jsonb not null,
  created_at timestamptz not null default now()
);
create index argument_ops_arg_idx on public.argument_ops (argument_id, seq);

alter table public.arguments enable row level security;
alter table public.argument_ops enable row level security;

create policy "members read arguments" on public.arguments
  for select using (public.is_member(tenant_id));
create policy "members create arguments" on public.arguments
  for insert with check (public.is_member(tenant_id) and created_by = (select auth.uid()));
create policy "members update arguments" on public.arguments
  for update using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
create policy "members delete arguments" on public.arguments
  for delete using (public.is_member(tenant_id));

-- Insert-only, as for deck_ops: history cannot be rewritten.
create policy "members read argument ops" on public.argument_ops
  for select using (public.is_member(tenant_id));
create policy "members append argument ops" on public.argument_ops
  for insert with check (
    public.is_member(tenant_id)
    and exists (select 1 from public.arguments a where a.id = argument_id and a.tenant_id = argument_ops.tenant_id)
    and (author_kind = 'ai' or author_id = (select auth.uid())::text)
  );
