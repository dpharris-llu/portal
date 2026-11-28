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
