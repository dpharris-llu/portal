-- Access rules of the knowledge model (0006), exercised as three people: an
-- author, a colleague (collaborator, then viewer) and a stranger. Run with
-- scripts/test-db.sh, which applies every migration to a throwaway Postgres.
\set ON_ERROR_STOP 0
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;
-- AUTHOR builds knowledge
set role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into sources (id, kind, title) values ('aaaaaaaa-0000-0000-0000-000000000001', 'paper', 'A made-up walking study') returning 'source saved and returned: ' || title;
insert into facts (id, source_id, text, quote, page, checked) values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Walking lowered HbA1c', 'HbA1c fell', 3, true) returning 'fact saved and returned';
insert into facts (id, source_id, text) values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Older adults saw less effect');
insert into topics (id, name, keywords) values ('cccccccc-0000-0000-0000-000000000001', 'Walking and diabetes', '{walking,diabetes}') returning 'topic saved and returned: ' || name;
insert into assertions (id, topic_id, text) values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Coached walking is worth funding') returning 'assertion saved and returned';
insert into assertion_facts (assertion_id, fact_id, role) values ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'supports'), ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'qualifies');
select 'auto-linked source to topic: ' || count(*) from topic_sources;
insert into presentations (id, title, purpose, audience) values ('eeeeeeee-0000-0000-0000-000000000001', 'Board talk', 'Decide on funding', 'Board') returning 'presentation saved and returned: ' || title;
insert into presentation_topics values ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 1);
insert into presentation_assertions values ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 1);
-- STRANGER sees nothing private
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select 'stranger sees topics: ' || count(*) from topics;
select 'stranger sees sources: ' || count(*) from sources;
select 'stranger sees facts: ' || count(*) from facts;
select 'stranger sees presentations: ' || count(*) from presentations;
-- AUTHOR makes COLLEAGUE a collaborator on the topic
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into members (object_type, object_id, user_id, role) values ('topic', 'cccccccc-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'collaborator');
-- COLLEAGUE
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select 'colleague sees topics: ' || count(*) from topics;
select 'colleague sees linked sources: ' || count(*) from sources;
select 'colleague sees facts: ' || count(*) from facts;
select 'colleague sees the board talk (not shared): ' || count(*) from presentations;
update assertions set text = 'Hijacked' where id = 'dddddddd-0000-0000-0000-000000000001';
select 'author assertion after colleague edit attempt: ' || text from assertions where id = 'dddddddd-0000-0000-0000-000000000001';
insert into assertions (id, topic_id, text, builds_on) values ('dddddddd-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'Coached walking is worth funding for adults under 65', 'dddddddd-0000-0000-0000-000000000001');
select 'colleague enhanced assertion added: ' || count(*) from assertions where author_id = '22222222-2222-2222-2222-222222222222';
insert into comments (object_type, object_id, text) values ('assertion', 'dddddddd-0000-0000-0000-000000000001', 'Consider the age limit');
select 'colleague comment added: ' || count(*) from comments;
update facts set text = 'tampered' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select 'fact after colleague edit attempt: ' || text from facts where id = 'bbbbbbbb-0000-0000-0000-000000000001';
-- VIEWER cannot add
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update members set role = 'viewer' where user_id = '22222222-2222-2222-2222-222222222222';
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
insert into assertions (topic_id, text) values ('cccccccc-0000-0000-0000-000000000001', 'viewer should not add this');
select 'viewer assertions after attempt: ' || count(*) from assertions where text like 'viewer%';
-- AUTHOR discards a fact: review flags on the assertion and the presentation
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update facts set status = 'discarded', discard_reason = 'superseded' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select 'flags: ' || string_agg(object_type, ', ' order by object_type) from review_flags where resolved_at is null;
-- Public source readable by the stranger
update sources set is_public = true where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select 'stranger sees public source: ' || count(*) from sources;
select 'stranger sees its facts: ' || count(*) from facts;
select 'stranger still sees topic: ' || count(*) from topics;
