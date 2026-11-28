-- Make someone an OratorStudio administrator (spec F-126): they can invite
-- people and manage access on the People page. Needed once, for the first
-- administrator; after that, administrators use "Make admin" on the People page.
-- Replace the address, then run in the Supabase SQL Editor. The person must
-- have signed in at least once.

insert into public.app_admins (user_id)
select id from auth.users where lower(email) = lower('you@example.org')
on conflict (user_id) do nothing;

-- Check: should list the address.
select u.email from public.app_admins a join auth.users u on u.id = a.user_id;
