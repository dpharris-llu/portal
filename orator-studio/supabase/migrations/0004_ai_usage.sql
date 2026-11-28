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
